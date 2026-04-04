# SOCFeed

Internal threat intelligence feed aggregator for a small SOC team. Ingests RSS and JSON feeds from ~34 curated cybersecurity sources, deduplicates them, and presents analysts with a unified triage queue.

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

| Variable             | Default       | Description                                          |
|----------------------|---------------|------------------------------------------------------|
| `HOST_PORT`          | `3344`        | Host port mapped to Nginx :80                        |
| `ARCHIVE_AFTER_HOURS`| `72`          | Hours before unactioned INGESTED items are archived  |
| `LOG_LEVEL`          | `INFO`        | Backend log verbosity (`DEBUG`, `INFO`, `WARNING`)   |
| `CORS_ORIGINS`       | `*`           | Comma-separated allowed origins (set for production) |
| `CLEAR_PASSWORD`     | `changeme`    | Password required to wipe all TI articles            |

---

## Useful Commands

```bash
docker compose up -d --build    # Build and start (detached)
docker compose up --build       # Start with logs in foreground
docker compose down             # Stop and remove containers
docker compose logs -f backend  # Tail backend logs
```

---

## Current Features (Phase 2a)

- **34 curated sources** across tiers 1–5 (authoritative vendors through community blogs), polled every 10 minutes
- **Deduplication** — same article from multiple sources increments a counter rather than creating duplicates
- **Auto-archive** — INGESTED items older than 72 hours are archived automatically
- **Source health tracking** — sources auto-disable after 3 consecutive failures
- **Read-only feed queue** — virtualised list, newest first, with:
  - Source name, tier badge, severity badge, keyword match tags, multi-source counter
  - Article title (external link) and 160-char summary
  - Lifecycle status pill with time-in-state
- **Sidebar filters** — severity, lifecycle status, source tier, keyword flag, show irrelevant / archived toggles
- **Light and dark mode** — toggled in the nav bar, persisted in `localStorage`
- **Analyst identity** — first-visit name prompt stored in a 90-day cookie, shown in the nav bar with a rename option
- **Manual refresh** — button in the nav triggers an immediate poll of all sources

---

## What's Coming

| Phase | Scope |
|-------|-------|
| **2b** | Full TI workflow — lifecycle transitions (Irrelevant, To Address, Ticket Raised, Resolved), inline notes, ticket ID capture, severity editing |
| **3**  | Source management UI — add sources with preview, soft-delete with confirmation, per-source health indicators |
| **4**  | Audit log UI with filters, keyword watchlist settings page, `/digest` print-optimised summary page |
| **5**  | Data portability — timestamped JSON export, import with preview diff, destructive "Clear All TIs" with password confirmation |

---

## Stack

| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Backend       | Python 3.12, FastAPI, APScheduler       |
| ORM / DB      | SQLModel + SQLite                       |
| Feed parsing  | feedparser (RSS/Atom), httpx (JSON)     |
| Frontend      | React 18, Vite, Tailwind CSS            |
| Reverse proxy | Nginx (also serves frontend static files)|
| Runtime       | Docker Compose                          |

The database is a SQLite file at `data/socfeed.db`, bind-mounted into the backend container. It persists across restarts and is the only stateful component.
