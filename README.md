# SOCFeed

Internal threat intelligence feed aggregator for a small SOC team. Ingests RSS and JSON feeds from ~33 curated cybersecurity sources, deduplicates them, and presents analysts with a unified triage queue.

Self-hosted, Docker-based. Designed to run at `socfeeds.albatha.com` or any internal host.

---

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) 20.10+
- Docker Compose v2 (ships with Docker Engine 20.10+ and Docker Desktop 3.3+)

Verify with:
```bash
docker compose version
```

---

## Getting Started

```bash
git clone <repo-url>
cd ti-project

cp .env.example .env
# Edit .env if you want to change ports, password, or CORS origins

docker compose up -d --build
```

The stack takes ~30 seconds to build on first run. Once up, the backend performs an initial poll of all sources automatically.

**Access:** `http://localhost:3344`

**First time setup:** after booting, go to Settings → Data → Import, select `sources_default.json` from the repo root, and confirm. Your sources and keywords will be live immediately and the next scheduled poll (within 10 minutes) will begin ingesting articles.

---

## Environment Variables

Configured in `.env` (copy from `.env.example`):

| Variable              | Default    | Description                                                        |
|-----------------------|------------|--------------------------------------------------------------------|
| `HOST_PORT`           | `3344`     | Host port mapped to Nginx :80                                      |
| `ARCHIVE_AFTER_DAYS`  | `10`       | Days before unactioned INGESTED items are archived (minimum 10)    |
| `LOG_LEVEL`           | `INFO`     | Backend log verbosity (`DEBUG`, `INFO`, `WARNING`)                 |
| `CORS_ORIGINS`        | `*`        | Comma-separated allowed origins (set for production)               |
| `CLEAR_PASSWORD`      | `changeme` | Password required to wipe all TI articles via Settings > Data      |

---

## Useful Commands

```bash
docker compose up -d --build    # Build and start (detached)
docker compose up --build       # Start with logs in foreground
docker compose down             # Stop and remove containers
docker compose logs -f backend  # Tail backend logs

python export_sources.py        # Sync DB sources → backend/sources.py (run before deploy)
```

---

## Features (Phases 1–5)

- **33 curated sources** across tiers 1–5 (authoritative vendors through community blogs), polled every 10 minutes
- **Deduplication** — same article from multiple sources increments a counter rather than creating duplicates
- **Auto-archive** — INGESTED items older than 10 days are archived automatically (configurable, 10-day minimum)
- **Source health tracking** — sources auto-disable after 3 consecutive failures

**Feed queue**
- Virtualised list, newest first, with source name, tier badge, severity badge, keyword match tags, multi-source counter
- Article title (external link) and 160-char summary
- Ticket ID and notes displayed inline on the card when present
- Sidebar filters: severity, lifecycle status, source tier, keyword flag, show irrelevant / archived toggles — status filter triggers a fresh fetch

**Full TI lifecycle**
- **Mark Irrelevant** — available from any status at any time; card fades to indicate state
- **To Address** — move into the work queue (also restarts from Irrelevant)
- **Raise Ticket** — inline prompt for ticket ID (required); numeric IDs link to `ithelpdesk.albatha.com`
- **Resolve** — inline prompt for optional closure notes
- **Edit ticket number** — inline edit on Ticket Raised cards
- **Severity selector** — inline dropdown on every card
- **Notes** — inline textarea, appended not replaced
- **Per-item history** — expandable audit trail on each card (timestamp, analyst, transition)
- All transitions timestamped, attributed to the analyst name from cookie, written to audit log

**Source management**
- Table view of all sources with health indicator (green/amber/red dot), tier, feed type, last fetched, last success, entry count, consecutive failures, and count of active TIs per source
- **Add source** — enter a URL, preview 3 sample articles, set name and tier, confirm; written to audit log
- **Test** — re-fetch any source on demand and view 3 samples inline without ingesting
- **Soft-delete** — inline confirmation; stops future ingestion, preserves all historical TIs; written to audit log
- Filter by status: All / Active / Inactive / Failing

**UI**
- Light and dark mode — toggled in the nav bar, persisted in `localStorage`
- Analyst identity — first-visit name prompt stored in a 90-day cookie, rename option in nav bar
- Manual refresh — button triggers an immediate poll of all sources

**Settings page**
- **Keywords** — manage the ingest-time watchlist; add/delete terms, all changes attributed to analyst and written to audit log
- **Audit log** — full table view (timestamp, user, action, target, detail) filterable by user, action type, and date range; article targets are clickable links that jump to the card in the feed, surface it if filtered out, and highlight it until dismissed
- **General** — `ARCHIVE_AFTER_DAYS` configurable from the UI (minimum 10, persisted to DB, takes effect on the next hourly archive run); link to daily digest
- **Daily digest** — `GET /digest` serves a standalone, print-optimised HTML page of all TO_ADDRESS and TICKET_RAISED items grouped by severity; suitable for screenshots or PDF export
- **Data** — export, import, and reset controls (see below)

**Data portability (Settings > Data)**
- **Export Data** — downloads a timestamped `socfeed_export_YYYY-MM-DD.json` containing all sources (including soft-deleted), articles with full status/notes/tickets, audit log, and keywords; export is attributed to the analyst and written to the audit log
- **Export sources.py** — downloads a ready-to-deploy `sources.py` reflecting the current active sources in the DB; equivalent to running `export_sources.py` from the terminal
- **Import** — upload a previously exported JSON file; shows a preview diff (new TIs / sources / keywords to be added) before confirming; sources and keywords are upserted, articles upserted on dedup hash, audit log entries appended; import is written to the audit log
- **Clear All TIs** — two-step destructive reset: confirmation dialog followed by password prompt (matches `CLEAR_PASSWORD` in `.env`); deletes all articles and audit log entries, preserves sources and keywords; feed reloads to empty state after clear

---

## Deploying to a New Environment

The seed source list (`backend/sources.py`) may drift from your local DB as you add or remove sources via the UI. Before committing or deploying, either run the CLI script or use the in-app export:

```bash
python export_sources.py
# or: python export_sources.py --db /path/to/socfeed.db
```

Alternatively, use **Settings > Data > Export sources.py** to download the file directly from the browser.

To migrate intelligence state to a new instance, use **Export Data** to produce a full JSON snapshot, then **Import** on the new instance.

---

## Stack

| Layer         | Technology                               |
|---------------|------------------------------------------|
| Backend       | Python 3.12, FastAPI, APScheduler        |
| ORM / DB      | SQLModel + SQLite                        |
| Feed parsing  | feedparser (RSS/Atom), httpx (JSON)      |
| Frontend      | React 18, Vite, Tailwind CSS             |
| Reverse proxy | Nginx (also serves frontend static files)|
| Runtime       | Docker Compose                           |

The database is a SQLite file at `data/socfeed.db`, bind-mounted into the backend container. It persists across restarts and is the only stateful component.
