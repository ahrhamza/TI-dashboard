# SOCFeed

Internal threat intelligence feed aggregator for a small SOC team. Ingests RSS and JSON feeds from curated cybersecurity sources, deduplicates them, and presents analysts with a unified triage queue.

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
```

---

## Features

### Feed Ingestion

- Sources polled every 10 minutes; on-demand refresh available from the nav bar
- Deduplication — same article from multiple sources increments a counter rather than creating duplicates; a "N sources" badge appears on the card
- First poll of a new source ingests only the 3 most recent entries to avoid flooding the queue; subsequent polls drop entries older than 2 days
- Auto-archive — INGESTED items older than a configurable threshold (minimum 10 days) are archived automatically
- Source auto-disable after 3 consecutive fetch failures
- Supported feed formats: RSS/Atom and JSON Feed; CISA KEV (`known_exploited_vulnerabilities.json`) — CISA entries map to NVD detail URLs

### Feed Queue

- Virtualised list, newest first, with source name, tier badge, severity badge, keyword match tags, and multi-source counter
- Article title (external link) and 160-char summary; ticket ID and notes displayed inline when present
- **Timestamp display** — context-aware: same-day items show `HH:MM · Xh ago`, older items show `Apr 3 · 2d ago`; three-mode toggle (Rel / Date / Both) in the nav bar, persisted per analyst

**Sidebar filters** — all multi-select:
- Severity, lifecycle status, source tier — toggle multiple values simultaneously; "All" clears
- Source — searchable scrollable list; select any number of sources
- Keyword — scrollable list of active keywords; select one or more to show only articles that matched those terms (alias matches are transparent — selecting a keyword finds all articles matched by any of its aliases)
- Keyword mode — All articles / Keyword matches only / Highlight matches (highlights watchlist terms inline in titles and summaries)
- Show irrelevant / Show archived toggles

### TI Lifecycle

Every article moves through a defined lifecycle. All transitions are timestamped, attributed to the acting analyst, and written to the audit log.

- **Mark Irrelevant** — available from any status at any time; card fades to 55% opacity
- **To Address** — move into the work queue; also restarts from Irrelevant
- **Raise Ticket** — inline prompt for ticket ID (required); numeric IDs render as links to `ithelpdesk.albatha.com`; ticket number editable after the fact
- **Resolve** — inline prompt for optional closure notes
- **Severity** — inline dropdown on every card
- **Notes** — inline textarea; text is appended to existing notes, never replaced
- **History** — expandable per-card audit trail showing every transition (timestamp, analyst, new state)

### Source Management

Sources page → Sources tab.

- Table view: health indicator dot, tier, feed type, last fetched, last success, entry count, consecutive failures, TI count
- **Add source** — enter URL, preview 3 sample articles, set name and tier, confirm; URL and name are checked for duplicates (409)
- **Test** — re-fetch any source on demand and view samples inline without ingesting
- **Disable / Enable** — pause or resume ingestion without removing the source
- **Archive** — hide source from the default list and stop ingestion; restorable via the Archived filter tab
- **Restore** — un-archives a source back to disabled state (analyst must explicitly re-enable)
- **Delete** — permanently removes an archived source; existing TI articles from the source are preserved
- Filter tabs: All / Active / Disabled / Failing / Archived
- Status badges: Active / Degraded (1–2 failures) / Disabled (manual) / Failing (auto-disabled) / Archived

### Keyword Watchlist

Sources page → Keywords tab.

- Terms matched case-insensitively against article title and summary at ingest; only active keywords are matched
- **Aliases** — each keyword can have pipe-separated variant strings (e.g. `rhel` with aliases `red hat linux|red hat enterprise linux`); any alias match stores the primary term label on the article, so the term and its aliases can be completely different strings that mean the same thing
- **Edit** — inline edit of both the primary term and aliases in one step; all existing article tags are updated to reflect any renamed term
- **Disable** — term retained but skipped at ingest; shown with strikethrough
- **Enable** — reactivates a disabled term
- **Remove** — permanently deletes the term (inline confirmation)
- Duplicate check on add (case-insensitive, 409)
- All changes attributed to analyst and written to audit log

### Settings

**General**
- `ARCHIVE_AFTER_DAYS` configurable from the UI (minimum 10, persisted to DB)
- Link to the daily digest page

**Audit Log**
- Full table view (timestamp, user, action, target, detail) filterable by user, action type, and date range
- Article targets are clickable — jumps to the card in the feed, surfacing it if it's filtered out, and highlights it until dismissed

**Daily Digest**
- `GET /digest` — standalone, print-optimised HTML page of all TO_ADDRESS and TICKET_RAISED items grouped by severity; suitable for screenshots or PDF export

**Data**
- **Export Data** — full JSON snapshot: all sources (including archived), articles with full status/notes/tickets/severity, audit log, and keywords; attributed to the analyst, written to audit log
- **Export Config** — sources and keywords only, for bootstrapping a new instance without TI history
- **Import** — upload a previously exported JSON (full or config); shows a preview diff before confirming; sources and keywords upserted, articles upserted on dedup hash, audit log appended
- **Clear All TIs** — two-step destructive reset (confirmation + password); deletes all articles and audit log entries, preserves sources and keywords

---

## Deploying to a New Environment

To migrate intelligence state to a new instance, use **Settings > Data > Export Data** to produce a full JSON snapshot, then **Import** on the new instance.

To migrate sources and keywords only (without TI history), use **Export Config** and import that instead.

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
