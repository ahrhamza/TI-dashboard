#!/usr/bin/env python3
"""
Read all active sources from the database and rewrite the SEED_SOURCES list
in backend/sources.py so it matches the current DB state.

Usage:
    python export_sources.py                        # uses data/socfeed.db
    python export_sources.py --db /path/to/db       # custom DB path

Inactive (soft-deleted) sources are excluded — they were removed intentionally.
Run this before committing or deploying to a new environment.
"""
import argparse
import re
import sqlite3
from pathlib import Path

TIER_LABELS = {
    1: "Tier 1: Authoritative",
    2: "Tier 2: Major Vendors & Established News",
    3: "Tier 3: Research Blogs",
    4: "Tier 4: Community / Aggregators",
    5: "Tier 5: Low Signal",
}

SOURCES_PY = Path(__file__).parent / "backend" / "sources.py"


def load_sources(db_path: Path) -> list[dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT name, url, tier, feed_type FROM sources "
        "WHERE is_active = 1 ORDER BY tier, name"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def build_seed_block(sources: list[dict]) -> str:
    lines = ["SEED_SOURCES: list[dict] = ["]

    current_tier = None
    for s in sources:
        tier = s["tier"]
        if tier != current_tier:
            current_tier = tier
            label = TIER_LABELS.get(tier, f"Tier {tier}")
            bar = "─" * (50 - len(label))
            lines.append(f"    # ── {label} {bar}")
        lines.append("    {")
        lines.append(f'        "name": {s["name"]!r},')
        lines.append(f'        "url": {s["url"]!r},')
        lines.append(f'        "tier": {tier},')
        lines.append(f'        "feed_type": {s["feed_type"]!r},')
        lines.append("    },")

    lines.append("]")
    return "\n".join(lines)


def rewrite_sources_py(new_block: str) -> None:
    text = SOURCES_PY.read_text()

    # Replace everything from 'SEED_SOURCES: list[dict] = [' up to the
    # closing ']' that sits at the start of a line (the list terminator).
    pattern = re.compile(
        r"^SEED_SOURCES: list\[dict\] = \[.*?^\]",
        re.MULTILINE | re.DOTALL,
    )
    if not pattern.search(text):
        raise RuntimeError("Could not locate SEED_SOURCES block in sources.py")

    updated = pattern.sub(new_block, text)
    SOURCES_PY.write_text(updated)


def main():
    parser = argparse.ArgumentParser(description="Sync DB sources → sources.py")
    parser.add_argument(
        "--db",
        default=Path(__file__).parent / "data" / "socfeed.db",
        type=Path,
        help="Path to socfeed.db (default: data/socfeed.db)",
    )
    args = parser.parse_args()

    if not args.db.exists():
        raise SystemExit(f"Database not found: {args.db}")

    sources = load_sources(args.db)
    if not sources:
        raise SystemExit("No active sources found in the database — aborting.")

    block = build_seed_block(sources)
    rewrite_sources_py(block)

    print(f"Updated backend/sources.py with {len(sources)} active source(s).")
    for tier in sorted({s['tier'] for s in sources}):
        tier_sources = [s for s in sources if s['tier'] == tier]
        print(f"  Tier {tier}: {len(tier_sources)} source(s)")


if __name__ == "__main__":
    main()
