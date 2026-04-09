"""
Feed ingestion engine.

Responsibilities:
- Fetch RSS/Atom feeds via feedparser
- Fetch JSON Feed (jsonfeed.org) sources via httpx
- Deduplicate within a source (dedup_hash) and across sources (url match)
- Match keyword watchlist on ingest
- Track source health (consecutive_failures, last_fetched_at, last_success_at)
- Auto-disable sources with 3+ consecutive failures
- Auto-archive INGESTED articles older than ARCHIVE_AFTER_HOURS
"""
import calendar
import hashlib
import html
import logging
import os
import re
from datetime import datetime, timedelta

import feedparser
import httpx
from sqlmodel import Session, select

from models import AppConfig, Article, ArticleStatus, AuditLog, FeedType, Keyword, Source

logger = logging.getLogger(__name__)

FETCH_TIMEOUT = 20  # seconds


# ── Helpers ──────────────────────────────────────────────────────────────────

def compute_dedup_hash(source_id: int, url: str) -> str:
    """sha256(str(source_id) + url) — unique within a source across poll cycles."""
    return hashlib.sha256(f"{source_id}{url}".encode()).hexdigest()


def strip_html(text: str) -> str:
    """Strip HTML tags, decode entities, collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return " ".join(text.split())


def truncate(text: str, length: int = 160) -> str:
    if len(text) <= length:
        return text
    return text[:length - 1].rstrip() + "…"


def parse_struct_time(st) -> datetime | None:
    """Convert feedparser's time.struct_time (UTC) to a naive UTC datetime."""
    if st is None:
        return None
    try:
        return datetime.utcfromtimestamp(calendar.timegm(st))
    except Exception:
        return None


def get_active_keywords(session: Session) -> list[str]:
    return [k.term.lower() for k in session.exec(select(Keyword).where(Keyword.is_active == True)).all()]  # noqa: E712


def find_keyword_matches(title: str, summary: str, keywords: list[str]) -> str | None:
    """Return comma-separated matched keyword terms, or None."""
    haystack = f"{title} {summary}".lower()
    matched = [kw for kw in keywords if kw in haystack]
    return ",".join(matched) if matched else None


# ── Feed parsers ─────────────────────────────────────────────────────────────

def fetch_rss_entries(source: Source) -> list[dict]:
    """Parse RSS/Atom/RDF feed. Returns normalised list of entry dicts."""
    parsed = feedparser.parse(source.url, agent="SOCFeed/1.0 (+https://socfeeds.albatha.com)")

    if parsed.get("bozo") and not parsed.entries:
        exc = parsed.get("bozo_exception")
        raise ValueError(f"Feed parse error: {exc}")

    entries = []
    for entry in parsed.entries:
        url = entry.get("link", "").strip()
        if not url:
            continue

        title = strip_html(entry.get("title", "No title")).strip() or "No title"

        raw_summary = (
            entry.get("summary")
            or entry.get("description")
            or entry.get("content", [{}])[0].get("value", "")
        )
        summary = truncate(strip_html(raw_summary)) if raw_summary else None

        published_at = parse_struct_time(
            entry.get("published_parsed") or entry.get("updated_parsed")
        )

        entries.append(
            {"title": title, "url": url, "summary": summary, "published_at": published_at}
        )

    return entries


def fetch_json_entries(source: Source) -> list[dict]:
    """
    Parse JSON feeds. Supports:
    - JSON Feed format (https://www.jsonfeed.org/version/1.1/):
        { "items": [ { "url", "title", "summary"|"content_text", "date_published" } ] }
    - CISA KEV format:
        { "vulnerabilities": [ { "cveID", "vulnerabilityName", "shortDescription",
                                  "requiredAction", "dateAdded" } ] }
    """
    with httpx.Client(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
        resp = client.get(
            source.url,
            headers={"User-Agent": "SOCFeed/1.0 (+https://socfeeds.albatha.com)"},
        )
        resp.raise_for_status()
        data = resp.json()

    # CISA KEV format detection
    if "vulnerabilities" in data and "items" not in data:
        return _parse_cisa_kev(data)

    entries = []
    for item in data.get("items", []):
        url = (item.get("url") or item.get("external_url", "")).strip()
        if not url:
            continue

        title = strip_html(item.get("title", "No title")).strip() or "No title"

        raw_summary = item.get("summary") or item.get("content_text", "")
        summary = truncate(strip_html(raw_summary)) if raw_summary else None

        published_at = None
        date_str = item.get("date_published") or item.get("date_modified", "")
        if date_str:
            try:
                # JSON Feed dates are RFC 3339 / ISO 8601
                published_at = datetime.fromisoformat(
                    date_str.replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except ValueError:
                pass

        entries.append(
            {"title": title, "url": url, "summary": summary, "published_at": published_at}
        )

    return entries


def _parse_cisa_kev(data: dict) -> list[dict]:
    """
    Parse CISA Known Exploited Vulnerabilities catalog.
    Constructs NVD detail URLs from cveID. Sorts newest-first by dateAdded.
    """
    entries = []
    for vuln in data.get("vulnerabilities", []):
        cve_id = vuln.get("cveID", "").strip()
        if not cve_id:
            continue

        url = f"https://nvd.nist.gov/vuln/detail/{cve_id}"
        vuln_name = vuln.get("vulnerabilityName", "")
        title = f"{cve_id}: {vuln_name}" if vuln_name else cve_id

        short_desc = vuln.get("shortDescription", "")
        required_action = vuln.get("requiredAction", "")
        raw_summary = short_desc
        if required_action and required_action.lower() not in ("unknown", ""):
            raw_summary = f"{short_desc} Required action: {required_action}".strip()
        summary = truncate(strip_html(raw_summary)) if raw_summary else None

        published_at = None
        date_str = vuln.get("dateAdded", "")
        if date_str:
            try:
                published_at = datetime.fromisoformat(date_str)
            except ValueError:
                pass

        entries.append(
            {"title": title, "url": url, "summary": summary, "published_at": published_at,
             "_date_added": date_str}
        )

    # Sort newest-first so first-ingest cap picks up the most recent additions
    entries.sort(key=lambda e: e.pop("_date_added", ""), reverse=True)
    return entries


# ── Core ingestion ────────────────────────────────────────────────────────────

def ingest_source(source: Source, session: Session) -> int:
    """
    Fetch and ingest a single source.

    Dedup logic:
    1. sha256(source_id + url) — prevents re-ingesting same article from same source
    2. Exact URL match across all sources — if another source already ingested this URL,
       increment seen_in_sources on the canonical article instead of creating a duplicate.

    Returns the number of new articles created.
    """
    now = datetime.utcnow()
    source.last_fetched_at = now

    try:
        if source.feed_type == FeedType.rss:
            entries = fetch_rss_entries(source)
        else:
            entries = fetch_json_entries(source)

        # First ingest: cap to 10 most recent entries (feed already sorted newest-first).
        # Subsequent polls: drop entries older than 2 days to keep the queue fresh;
        # undated entries are allowed through (some feeds legitimately omit dates).
        first_ingest = source.last_success_at is None
        if first_ingest:
            entries = entries[:3]
        else:
            cutoff = datetime.utcnow() - timedelta(days=2)
            entries = [
                e for e in entries
                if e.get("published_at") is None or e["published_at"] >= cutoff
            ]

        source.last_success_at = now
        source.last_entry_count = len(entries)
        source.consecutive_failures = 0
        session.add(source)

        keywords = get_active_keywords(session)
        new_count = 0

        for entry in entries:
            url = entry["url"]
            dedup_hash = compute_dedup_hash(source.id, url)

            # Guard 1: already ingested from this same source
            if session.exec(
                select(Article).where(Article.dedup_hash == dedup_hash)
            ).first():
                continue

            # Guard 2: same URL already ingested from a different source
            canonical = session.exec(
                select(Article).where(Article.url == url)
            ).first()
            if canonical:
                canonical.seen_in_sources += 1
                session.add(canonical)
                continue

            kw_matches = find_keyword_matches(
                entry["title"], entry.get("summary") or "", keywords
            )

            article = Article(
                source_id=source.id,
                title=entry["title"],
                url=url,
                summary=entry.get("summary"),
                dedup_hash=dedup_hash,
                seen_in_sources=1,
                keyword_matches=kw_matches,
                published_at=entry.get("published_at"),
                ingested_at=now,
            )
            session.add(article)
            new_count += 1

        session.commit()
        logger.info(f"[{source.name}] OK — {new_count} new / {len(entries)} fetched")
        return new_count

    except Exception as exc:
        session.rollback()
        source.consecutive_failures += 1
        logger.warning(
            f"[{source.name}] fetch failed (failure #{source.consecutive_failures}): {exc}"
        )

        if source.consecutive_failures >= 3:
            source.is_active = False
            session.add(source)
            session.flush()

            audit = AuditLog(
                user="system",
                action="source_disabled",
                target_id=source.id,
                target_type="source",
                detail=(
                    f"Auto-disabled '{source.name}' after 3 consecutive failures. "
                    f"Last error: {str(exc)[:200]}"
                ),
            )
            session.add(audit)
            logger.error(f"[{source.name}] auto-disabled after 3 consecutive failures")
        else:
            session.add(source)

        session.commit()
        return 0


def poll_all_sources(session: Session) -> dict[str, int]:
    """
    Poll every active source.
    Returns {source_name: new_article_count}.
    """
    sources = session.exec(
        select(Source).where(Source.is_active == True, Source.is_archived == False)  # noqa: E712
    ).all()

    if not sources:
        logger.info("poll_all_sources: no active sources")
        return {}

    logger.info(f"Starting poll of {len(sources)} active sources")
    results: dict[str, int] = {}

    for source in sources:
        results[source.name] = ingest_source(source, session)

    total_new = sum(results.values())
    logger.info(f"Poll complete — {total_new} new articles from {len(sources)} sources")
    return results


def get_archive_after_days(session: Session) -> int:
    """Read ARCHIVE_AFTER_DAYS from DB config, falling back to env var. Minimum 10."""
    try:
        config = session.get(AppConfig, "archive_after_days")
        if config:
            return max(10, int(config.value))
    except Exception:
        pass
    return max(10, int(os.getenv("ARCHIVE_AFTER_DAYS", "10")))


def auto_archive(session: Session) -> int:
    """
    Mark INGESTED articles older than ARCHIVE_AFTER_DAYS as archived.
    Minimum enforced value is 10 days. Runs on a separate hourly schedule.
    """
    days = get_archive_after_days(session)
    cutoff = datetime.utcnow() - timedelta(days=days)

    stale = session.exec(
        select(Article)
        .where(Article.status == ArticleStatus.INGESTED)
        .where(Article.ingested_at < cutoff)
        .where(Article.archived_at == None)  # noqa: E711
    ).all()

    if not stale:
        return 0

    archive_time = datetime.utcnow()
    for article in stale:
        article.archived_at = archive_time

    session.commit()
    logger.info(f"Auto-archived {len(stale)} articles (older than {days}d)")
    return len(stale)
