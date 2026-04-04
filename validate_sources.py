#!/usr/bin/env python3
"""
validate_sources.py — bulk-test all seed sources and print a status table.

Usage:
    python validate_sources.py [--timeout N] [--tier N]

Requires:  pip install feedparser httpx
"""
import argparse
import html
import re
import sys
import time
from datetime import datetime

# Allow imports from backend/
sys.path.insert(0, "backend")
from sources import SEED_SOURCES  # noqa: E402

try:
    import feedparser
    import httpx
except ImportError:
    print("Missing dependencies. Run:  pip install feedparser httpx")
    sys.exit(1)

# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return " ".join(text.split())


def truncate(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


def test_rss(url: str, timeout: int) -> tuple[str, int, str]:
    """Returns (status_label, entry_count, sample_headline)."""
    parsed = feedparser.parse(url, agent="SOCFeed-Validator/1.0")

    if parsed.get("status") is not None and parsed["status"] >= 400:
        return f"HTTP {parsed['status']}", 0, ""

    entries = parsed.get("entries", [])
    if not entries and parsed.get("bozo"):
        exc = str(parsed.get("bozo_exception", "parse error"))
        return f"PARSE ERR", 0, truncate(exc, 40)

    headline = ""
    if entries:
        raw = entries[0].get("title", "")
        headline = truncate(strip_html(raw), 60)

    return "OK", len(entries), headline


def test_json(url: str, timeout: int) -> tuple[str, int, str]:
    """Returns (status_label, entry_count, sample_headline)."""
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": "SOCFeed-Validator/1.0"})
        if resp.status_code >= 400:
            return f"HTTP {resp.status_code}", 0, ""
        data = resp.json()
        items = data.get("items", [])
        headline = ""
        if items:
            raw = items[0].get("title", "")
            headline = truncate(strip_html(raw), 60)
        return "OK", len(items), headline
    except httpx.TimeoutException:
        return "TIMEOUT", 0, ""
    except Exception as exc:
        return f"ERR", 0, truncate(str(exc), 40)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Validate SOCFeed seed sources")
    parser.add_argument("--timeout", type=int, default=20, help="Per-source timeout in seconds")
    parser.add_argument("--tier", type=int, default=0, help="Filter to a specific tier (0 = all)")
    args = parser.parse_args()

    sources = SEED_SOURCES
    if args.tier:
        sources = [s for s in sources if s["tier"] == args.tier]

    print(f"\nSOCFeed Source Validation Report")
    print(f"Tested: {len(sources)} sources   |   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Timeout: {args.timeout}s per source\n")

    # Column widths
    W_NAME    = 34
    W_TIER    = 4
    W_TYPE    = 5
    W_STATUS  = 10
    W_ENTRIES = 7
    W_HEADLINE = 62

    header = (
        f"{'Name':<{W_NAME}}  {'Tier':>{W_TIER}}  {'Type':<{W_TYPE}}  "
        f"{'Status':<{W_STATUS}}  {'Entries':>{W_ENTRIES}}  {'Sample Headline':<{W_HEADLINE}}"
    )
    sep = "─" * len(header)
    print(header)
    print(sep)

    ok_count = 0
    fail_count = 0

    for src in sources:
        name  = truncate(src["name"], W_NAME)
        tier  = src["tier"]
        ftype = src["feed_type"]
        url   = src["url"]

        t0 = time.monotonic()
        try:
            if ftype == "rss":
                status, entries, headline = test_rss(url, args.timeout)
            else:
                status, entries, headline = test_json(url, args.timeout)
        except Exception as exc:
            status, entries, headline = "ERR", 0, str(exc)[:40]
        elapsed = time.monotonic() - t0

        is_ok = status == "OK"
        if is_ok:
            ok_count += 1
        else:
            fail_count += 1

        # Colour the status if terminal supports it
        if sys.stdout.isatty():
            status_str = (
                f"\033[32m{status:<{W_STATUS}}\033[0m"
                if is_ok
                else f"\033[31m{status:<{W_STATUS}}\033[0m"
            )
        else:
            status_str = f"{status:<{W_STATUS}}"

        print(
            f"{name:<{W_NAME}}  {tier:>{W_TIER}}  {ftype:<{W_TYPE}}  "
            f"{status_str}  {entries:>{W_ENTRIES}}  {headline:<{W_HEADLINE}}"
            f"  ({elapsed:.1f}s)"
        )

    print(sep)
    print(f"\n  {ok_count} OK   {fail_count} FAILED   {len(sources)} total\n")

    sys.exit(1 if fail_count else 0)


if __name__ == "__main__":
    main()
