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

---

## Environment Variables

Configured in `.env` (copy from `.env.example`):

| Variable              | Default    | Description                                                        |
|-----------------------|------------|--------------------------------------------------------------------|
| `HOST_PORT`           | `3344`     | Host port mapped to Nginx :80                                      |
| `ARCHIVE_AFTER_DAYS`  | `10`       | Days before unactioned INGESTED items are archived (minimum 10)    |
| `LOG_LEVEL`           | `INFO`     | Backend log verbosity (`DEBUG`, `INFO`, `WARNING`)                 |
| `CORS_ORIGINS`        | `*`        | Comma-separated allowed origins (set for production)               |
| `CLEAR_PASSWORD`      | `changeme` | Password required to wipe all TI articles                          |

---

## Useful Commands

```bash
docker compose up -d --build    # Build and start (detached)
docker compose up --build       # Start with logs in foreground
docker compose down             # Stop and remove containers
docker compose logs -f backend  # Tail backend logs
```

---

## Current Features (Phases 1–2b)

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

**UI**
- Light and dark mode — toggled in the nav bar, persisted in `localStorage`
- Analyst identity — first-visit name prompt stored in a 90-day cookie, rename option in nav bar
- Manual refresh — button triggers an immediate poll of all sources

---

## What's Coming

| Phase | Scope |
|-------|-------|
| **3**  | Source management UI — add sources with preview, soft-delete with confirmation, per-source health indicators |
| **4**  | Settings page — keyword watchlist, audit log viewer, `/digest` print-optimised summary, `ARCHIVE_AFTER_DAYS` configurable from UI |
| **5**  | Data portability — timestamped JSON export, import with preview diff, destructive "Clear All TIs" with password confirmation |

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
