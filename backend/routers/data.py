"""
Data portability and reset endpoints.

GET  /api/export             — Full JSON export (all data: articles, sources, keywords, audit log)
GET  /api/export/config      — Config-only JSON export (sources + keywords; for bootstrapping new instances)
GET  /api/export/sources     — Legacy: download sources.py Python file
POST /api/import/preview     — Validate a JSON backup (full or config) and return a diff summary
POST /api/import             — Apply a validated JSON backup (upsert + append); accepts full or config exports
POST /api/clear              — Wipe articles + audit_log (password-protected)
"""
import io
import logging
import os
import re
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select, delete

from database import get_session
from models import Article, AuditLog, Keyword, Source

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["data"])

APP_VERSION = "1.0.0"

# ── Helpers ────────────────────────────────────────────────────────────────────

TIER_LABELS = {
    1: "Tier 1: Authoritative",
    2: "Tier 2: Major Vendors & Established News",
    3: "Tier 3: Research Blogs",
    4: "Tier 4: Community / Aggregators",
    5: "Tier 5: Low Signal",
}


def _dt(val) -> str | None:
    """Serialize a datetime (or None) to ISO string."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


def _build_export(session: Session, analyst: str) -> dict:
    sources = session.exec(select(Source)).all()
    articles = session.exec(select(Article)).all()
    audit = session.exec(select(AuditLog).order_by(AuditLog.id)).all()
    keywords = session.exec(select(Keyword).order_by(Keyword.term)).all()

    return {
        "meta": {
            "exported_at": datetime.utcnow().isoformat(),
            "exported_by": analyst,
            "app_version": APP_VERSION,
            "schema_version": 1,
        },
        "sources": [
            {
                "id": s.id,
                "name": s.name,
                "url": s.url,
                "tier": s.tier,
                "feed_type": s.feed_type,
                "is_active": s.is_active,
                "consecutive_failures": s.consecutive_failures,
                "last_fetched_at": _dt(s.last_fetched_at),
                "last_success_at": _dt(s.last_success_at),
                "last_entry_count": s.last_entry_count,
                "created_at": _dt(s.created_at),
                "created_by": s.created_by,
            }
            for s in sources
        ],
        "articles": [
            {
                "id": a.id,
                "source_id": a.source_id,
                "title": a.title,
                "url": a.url,
                "summary": a.summary,
                "dedup_hash": a.dedup_hash,
                "seen_in_sources": a.seen_in_sources,
                "status": a.status,
                "severity": a.severity,
                "keyword_matches": a.keyword_matches,
                "ticket_id": a.ticket_id,
                "notes": a.notes,
                "published_at": _dt(a.published_at),
                "ingested_at": _dt(a.ingested_at),
                "status_changed_at": _dt(a.status_changed_at),
                "status_changed_by": a.status_changed_by,
                "archived_at": _dt(a.archived_at),
            }
            for a in articles
        ],
        "audit_log": [
            {
                "id": e.id,
                "timestamp": _dt(e.timestamp),
                "user": e.user,
                "action": e.action,
                "target_id": e.target_id,
                "target_type": e.target_type,
                "detail": e.detail,
            }
            for e in audit
        ],
        "keywords": [
            {
                "id": k.id,
                "term": k.term,
                "created_at": _dt(k.created_at),
                "created_by": k.created_by,
            }
            for k in keywords
        ],
    }


def _build_sources_py(session: Session) -> str:
    """Generate sources.py content from all DB rows (active and inactive)."""
    rows = session.exec(
        select(Source).order_by(Source.tier, Source.name)
    ).all()

    lines = [
        '"""',
        "Curated source list — auto-generated from DB via GET /api/export/sources.",
        "Includes all sources (active and soft-deleted) with their is_active status.",
        "Edit via the Sources UI and use Settings > Data > Export sources.py to download.",
        '"""',
        "from sqlmodel import Session, select",
        "from models import FeedType, Source",
        "",
        "",
        "SEED_SOURCES: list[dict] = [",
    ]

    current_tier = None
    for s in rows:
        if s.tier != current_tier:
            current_tier = s.tier
            label = TIER_LABELS.get(s.tier, f"Tier {s.tier}")
            bar = "─" * (50 - len(label))
            lines.append(f"    # ── {label} {bar}")
        lines.append("    {")
        lines.append(f'        "name": {s.name!r},')
        lines.append(f'        "url": {s.url!r},')
        lines.append(f'        "tier": {s.tier},')
        lines.append(f'        "feed_type": {s.feed_type!r},')
        lines.append(f'        "is_active": {s.is_active},')
        lines.append("    },")

    lines.append("]")
    lines.append("")

    # Append the seed function — legacy, superseded by config import via the UI
    lines += [
        "",
        "def seed_sources(session: Session) -> int:",
        '    """Insert SEED_SOURCES into the DB if they don\'t already exist. Returns count inserted."""',
        "    inserted = 0",
        "    for s in SEED_SOURCES:",
        "        existing = session.exec(select(Source).where(Source.url == s['url'])).first()",
        "        if existing:",
        "            continue",
        "        source = Source(",
        "            name=s['name'],",
        "            url=s['url'],",
        "            tier=s['tier'],",
        "            feed_type=FeedType(s['feed_type']),",
        "            is_active=s.get('is_active', True),",
        "        )",
        "        session.add(source)",
        "        inserted += 1",
        "    session.commit()",
        "    return inserted",
    ]

    return "\n".join(lines) + "\n"


def _build_config_export(session: Session, analyst: str) -> dict:
    """Config-only export: sources + keywords. No articles or audit log."""
    sources = session.exec(select(Source).order_by(Source.tier, Source.name)).all()
    keywords = session.exec(select(Keyword).order_by(Keyword.term)).all()

    return {
        "meta": {
            "exported_at": datetime.utcnow().isoformat(),
            "exported_by": analyst,
            "app_version": APP_VERSION,
            "schema_version": 1,
            "export_type": "config",
        },
        "sources": [
            {
                "id": s.id,
                "name": s.name,
                "url": s.url,
                "tier": s.tier,
                "feed_type": s.feed_type,
                "is_active": s.is_active,
                "consecutive_failures": s.consecutive_failures,
                "last_fetched_at": _dt(s.last_fetched_at),
                "last_success_at": _dt(s.last_success_at),
                "last_entry_count": s.last_entry_count,
                "created_at": _dt(s.created_at),
                "created_by": s.created_by,
            }
            for s in sources
        ],
        "keywords": [
            {
                "id": k.id,
                "term": k.term,
                "created_at": _dt(k.created_at),
                "created_by": k.created_by,
            }
            for k in keywords
        ],
    }


def _validate_export(data: dict) -> None:
    """Raise HTTPException if the JSON structure is invalid.
    Accepts both full exports (sources + articles + audit_log + keywords)
    and config-only exports (sources + keywords).
    """
    if "sources" not in data or "keywords" not in data or "meta" not in data:
        raise HTTPException(
            status_code=422,
            detail="Invalid export file — must contain 'meta', 'sources', and 'keywords'",
        )
    if not isinstance(data["sources"], list):
        raise HTTPException(status_code=422, detail="'sources' must be a list")
    if not isinstance(data["keywords"], list):
        raise HTTPException(status_code=422, detail="'keywords' must be a list")
    # Full export fields are optional — config exports omit them
    if "articles" in data and not isinstance(data["articles"], list):
        raise HTTPException(status_code=422, detail="'articles' must be a list")
    if "audit_log" in data and not isinstance(data["audit_log"], list):
        raise HTTPException(status_code=422, detail="'audit_log' must be a list")


# ── Export ─────────────────────────────────────────────────────────────────────

@router.get("/export")
def export_data(analyst: str = "unknown", session: Session = Depends(get_session)):
    import json

    payload = _build_export(session, analyst)

    # Audit
    audit = AuditLog(
        user=analyst,
        action="export",
        detail=f"Exported {len(payload['articles'])} articles, {len(payload['sources'])} sources, {len(payload['keywords'])} keywords",
    )
    session.add(audit)
    session.commit()

    filename = f"socfeed_export_{date.today().isoformat()}.json"
    content = json.dumps(payload, indent=2, default=str)

    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/config")
def export_config(analyst: str = "unknown", session: Session = Depends(get_session)):
    import json

    payload = _build_config_export(session, analyst)

    audit = AuditLog(
        user=analyst,
        action="export_config",
        detail=f"Exported config: {len(payload['sources'])} sources, {len(payload['keywords'])} keywords",
    )
    session.add(audit)
    session.commit()

    filename = f"socfeed_config_{date.today().isoformat()}.json"
    content = json.dumps(payload, indent=2, default=str)

    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/sources")
def export_sources_py(session: Session = Depends(get_session)):
    content = _build_sources_py(session)
    return Response(
        content=content,
        media_type="text/x-python",
        headers={"Content-Disposition": 'attachment; filename="sources.py"'},
    )


# ── Import ─────────────────────────────────────────────────────────────────────

@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    import json

    raw = await file.read()
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=422, detail="File is not valid JSON")

    _validate_export(data)

    # Count what's new
    existing_source_urls = set(
        s.url for s in session.exec(select(Source)).all()
    )
    existing_dedup_hashes = set(
        a.dedup_hash for a in session.exec(select(Article.dedup_hash)).all()
    )
    existing_keyword_terms = set(
        k.term for k in session.exec(select(Keyword)).all()
    )

    articles = data.get("articles", [])
    new_sources = sum(1 for s in data["sources"] if s.get("url") not in existing_source_urls)
    new_articles = sum(1 for a in articles if a.get("dedup_hash") not in existing_dedup_hashes)
    new_keywords = sum(1 for k in data["keywords"] if k.get("term") not in existing_keyword_terms)

    return {
        "export_type": data.get("meta", {}).get("export_type", "full"),
        "new_articles": new_articles,
        "new_sources": new_sources,
        "new_keywords": new_keywords,
        "total_articles": len(articles),
        "total_sources": len(data["sources"]),
        "total_keywords": len(data["keywords"]),
        "total_audit_entries": len(data.get("audit_log", [])),
        # Echo data back so the frontend can pass it to the confirm step
        "data": data,
    }


@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    analyst: str = Form(default="unknown"),
    session: Session = Depends(get_session),
):
    import json

    raw = await file.read()
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=422, detail="File is not valid JSON")

    _validate_export(data)

    sources_upserted = 0
    articles_upserted = 0
    keywords_upserted = 0

    # Upsert sources (match on url)
    existing_sources_by_url = {
        s.url: s for s in session.exec(select(Source)).all()
    }
    id_remap: dict[int, int] = {}  # old_id -> new_id for sources

    for s in data["sources"]:
        url = s.get("url", "")
        if url in existing_sources_by_url:
            existing = existing_sources_by_url[url]
            id_remap[s["id"]] = existing.id
            # Respect is_active from import — do not reinstate a source
            # that was soft-deleted, and honour explicit active=False
            import_active = s.get("is_active", True)
            if existing.is_active != import_active:
                existing.is_active = import_active
                session.add(existing)
        else:
            new_src = Source(
                name=s["name"],
                url=url,
                tier=s["tier"],
                feed_type=s["feed_type"],
                is_active=s.get("is_active", True),
                consecutive_failures=s.get("consecutive_failures", 0),
                last_fetched_at=s.get("last_fetched_at"),
                last_success_at=s.get("last_success_at"),
                last_entry_count=s.get("last_entry_count"),
                created_at=s.get("created_at") or datetime.utcnow(),
                created_by=s.get("created_by", "import"),
            )
            session.add(new_src)
            session.flush()
            id_remap[s["id"]] = new_src.id
            sources_upserted += 1

    # Upsert articles (match on dedup_hash) — absent in config-only exports
    existing_hashes = set(
        a.dedup_hash for a in session.exec(select(Article.dedup_hash)).all()
    )
    for a in data.get("articles", []):
        if a.get("dedup_hash") in existing_hashes:
            continue
        source_id = id_remap.get(a.get("source_id"), a.get("source_id"))
        new_art = Article(
            source_id=source_id,
            title=a["title"],
            url=a["url"],
            summary=a.get("summary"),
            dedup_hash=a["dedup_hash"],
            seen_in_sources=a.get("seen_in_sources", 1),
            status=a.get("status", "INGESTED"),
            severity=a.get("severity", "unset"),
            keyword_matches=a.get("keyword_matches"),
            ticket_id=a.get("ticket_id"),
            notes=a.get("notes"),
            published_at=a.get("published_at"),
            ingested_at=a.get("ingested_at") or datetime.utcnow(),
            status_changed_at=a.get("status_changed_at"),
            status_changed_by=a.get("status_changed_by"),
            archived_at=a.get("archived_at"),
        )
        session.add(new_art)
        articles_upserted += 1

    # Upsert keywords (match on term)
    existing_terms = {
        k.term for k in session.exec(select(Keyword)).all()
    }
    for k in data["keywords"]:
        term = k.get("term", "").lower().strip()
        if not term or term in existing_terms:
            continue
        new_kw = Keyword(
            term=term,
            created_at=k.get("created_at") or datetime.utcnow(),
            created_by=k.get("created_by", "import"),
        )
        session.add(new_kw)
        keywords_upserted += 1
        existing_terms.add(term)

    # Append audit log entries (no dedup) — absent in config-only exports
    for e in data.get("audit_log", []):
        new_entry = AuditLog(
            timestamp=e.get("timestamp") or datetime.utcnow(),
            user=e.get("user", "unknown"),
            action=e.get("action", "unknown"),
            target_id=e.get("target_id"),
            target_type=e.get("target_type"),
            detail=e.get("detail", ""),
        )
        session.add(new_entry)

    # Write import audit entry
    audit = AuditLog(
        user=analyst,
        action="import",
        detail=(
            f"Imported {articles_upserted} articles, "
            f"{sources_upserted} sources, "
            f"{keywords_upserted} keywords"
        ),
    )
    session.add(audit)
    session.commit()

    return {
        "ok": True,
        "articles_imported": articles_upserted,
        "sources_imported": sources_upserted,
        "keywords_imported": keywords_upserted,
    }


# ── Clear ──────────────────────────────────────────────────────────────────────

class ClearIn(BaseModel):
    analyst: str = "unknown"
    password: str


@router.post("/clear")
def clear_all(body: ClearIn, session: Session = Depends(get_session)):
    expected = os.getenv("CLEAR_PASSWORD", "changeme")
    if body.password != expected:
        raise HTTPException(status_code=403, detail="Incorrect password")

    article_count = len(session.exec(select(Article)).all())
    audit_count = len(session.exec(select(AuditLog)).all())

    ts = datetime.utcnow().isoformat()
    # Write final entry to stdout before deletion (survives the wipe)
    logger.warning(
        f"clear_all | user={body.analyst} | timestamp={ts} | "
        f"deleting {article_count} articles and {audit_count} audit entries"
    )
    print(
        f"[CLEAR ALL] {ts} | user={body.analyst} | "
        f"{article_count} articles + {audit_count} audit entries deleted",
        flush=True,
    )

    session.exec(delete(Article))
    session.exec(delete(AuditLog))
    session.commit()

    return {"ok": True, "articles_deleted": article_count, "audit_deleted": audit_count}
