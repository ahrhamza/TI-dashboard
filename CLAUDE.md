# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

> **SOCFeed** — Internal threat intelligence feed aggregator for a small SOC team (2 analysts).
> Self-hosted, Docker-based, accessible at `socfeeds.albatha.com`.
> Barebones but complete — utility over polish, mature UI over aesthetics.

---

## Project Overview

SOCFeed ingests RSS and JSON feeds from 33 curated cybersecurity sources, deduplicates
them, and presents analysts with a unified triage queue. Analysts can move items through
a defined lifecycle, raise helpdesk tickets, add notes, and maintain an audit trail —
all from a browser with no login required.

---

## Stack

| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Backend       | Python 3.12, FastAPI, APScheduler       |
| ORM / DB      | SQLModel + SQLite                       |
| Feed parsing  | feedparser (RSS/Atom), httpx (JSON)     |
| Frontend      | React 18, Vite, Tailwind CSS            |
| Reverse proxy | Nginx                                   |
| Runtime       | Docker Compose (Linux host)             |

---

## Commands

### Full stack (Docker)
```bash
docker compose up --build        # build and start all services
docker compose up                # start without rebuilding
docker compose down
docker compose logs -f backend   # tail backend logs
```

### Backend (local dev)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload        # runs on :8000
```

### Frontend (local dev)
```bash
cd frontend
npm install
npm run dev                      # Vite dev server on :5173
npm run build                    # production build
```

### Tests
```bash
cd backend
pytest                           # run all tests
pytest tests/test_feeds.py       # run a single test file
pytest -k "test_dedup"           # run tests matching a pattern
```

---

## Project Structure

```
socfeed/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── nginx/
│   └── default.conf
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py              # FastAPI app entry point + APScheduler init
│   ├── models.py            # SQLModel table definitions
│   ├── feeds.py             # RSS/JSON fetch, parse, dedup, ingest
│   ├── sources.py           # Seed list of all sources with metadata
│   ├── scheduler.py         # Cron job definitions
│   └── routers/
│       ├── articles.py      # CRUD + lifecycle transitions for TI items
│       ├── sources.py       # Source management endpoints
│       ├── audit.py         # Audit log read endpoints
│       ├── digest.py        # Digest summary endpoint
│       └── settings.py      # Keyword watchlist management
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── api.js           # All fetch calls to backend
│       ├── hooks/
│       │   └── useUser.js   # Cookie read/write for analyst identity
│       ├── components/
│       │   ├── FeedList.jsx         # Virtual-scrolled TI queue
│       │   ├── TICard.jsx           # Individual TI item card
│       │   ├── SeverityBadge.jsx
│       │   ├── LifecyclePill.jsx
│       │   ├── NoteInput.jsx        # Inline expandable note field
│       │   ├── SourcesTable.jsx     # Source management view
│       │   ├── SourceHealthIcon.jsx
│       │   ├── AddSourceFlow.jsx    # Preview + confirm add flow
│       │   ├── AuditLog.jsx
│       │   ├── DigestView.jsx
│       │   ├── KeywordSettings.jsx
│       │   └── UserPrompt.jsx       # First-visit name capture modal
│       └── styles/
│           └── theme.css            # CSS variables for light/dark mode
└── data/
    └── socfeed.db           # Mounted Docker volume — persists across restarts
```

---

## Database Schema (SQLModel)

### `sources`
| Column               | Type     | Notes                                      |
|----------------------|----------|--------------------------------------------|
| id                   | int PK   |                                            |
| name                 | str      |                                            |
| url                  | str      | RSS or JSON feed URL                       |
| tier                 | int      | 1 (authoritative) – 5 (community)         |
| feed_type            | enum     | `rss` or `json`                            |
| is_active            | bool     | False = soft-deleted, no new ingestion     |
| consecutive_failures | int      | Auto-disable at 3                          |
| last_fetched_at      | datetime |                                            |
| last_success_at      | datetime |                                            |
| last_entry_count     | int      |                                            |
| created_at           | datetime |                                            |

### `articles`
| Column            | Type     | Notes                                           |
|-------------------|----------|-------------------------------------------------|
| id                | int PK   |                                                 |
| source_id         | int FK   | References sources.id                           |
| title             | str      |                                                 |
| url               | str      | Unique per source; opens in new tab             |
| summary           | str      | Truncated to 160 chars on ingest                |
| dedup_hash        | str      | sha256(source_id + url) — unique constraint     |
| seen_in_sources   | int      | Count of sources that published same URL        |
| status            | enum     | See TI Lifecycle below                          |
| severity          | enum     | `low`, `medium`, `high`, `critical`, `unset`    |
| keyword_matches   | str      | Comma-separated matched watchlist terms         |
| ticket_id         | str      | Helpdesk ticket reference                       |
| notes             | str      | Free text, appended not replaced                |
| published_at      | datetime | From feed; fallback to ingested_at              |
| ingested_at       | datetime |                                                 |
| status_changed_at | datetime | Timestamp of last lifecycle transition          |
| status_changed_by | str      | Analyst name from cookie                        |
| archived_at       | datetime | Set when auto-archived after 72h                |

### `audit_log`
| Column     | Type     | Notes                              |
|------------|----------|------------------------------------|
| id         | int PK   |                                    |
| timestamp  | datetime |                                    |
| user       | str      | Analyst name from cookie           |
| action     | str      | e.g. `status_change`, `source_add` |
| target_id  | int      | Article or source ID               |
| target_type| str      | `article` or `source`              |
| detail     | str      | Human-readable description         |

### `keywords`
| Column     | Type   | Notes |
|------------|--------|-------|
| id         | int PK |       |
| term       | str    | Case-insensitive match on ingest |
| created_at | datetime |     |
| created_by | str    |       |

---

## TI Lifecycle

```
INGESTED ──► IRRELEVANT ◄─────────────────────────────┐
         ──► TO_ADDRESS ──► TICKET_RAISED ──► RESOLVED │
                    ▲              │                    │
                    │              ▼                    │
                    └──── (any state) ────────────────►─┘
```

- **IRRELEVANT is reachable from any state at any time** — misclicks and
  reassessments are expected. Marking something irrelevant from `TICKET_RAISED`
  or `RESOLVED` is valid.
- **Lifecycle can restart from IRRELEVANT** — an analyst can move an irrelevant
  item back to `TO_ADDRESS` to begin the forward flow again.
- This means the only hard rule is: `TICKET_RAISED` requires a `ticket_id`.
  Everything else is freely transitionable.

All transitions are:
- Timestamped (`status_changed_at`)
- Attributed to the acting analyst (`status_changed_by`)
- Written to `audit_log` (full transition history preserved, e.g. INGESTED →
  TO_ADDRESS → IRRELEVANT → TO_ADDRESS → TICKET_RAISED)

**TICKET_RAISED** requires a `ticket_id` (non-empty string).
**RESOLVED** prompts for optional closure notes.

---

## Feed Polling

- Global cron interval: **10 minutes**, uniform across all sources
- On-demand refresh: POST `/api/refresh` — triggers immediate full poll
- **First ingest cap**: on a source's first poll, only the 5 most recent entries are
  ingested — prevents flooding the queue with a source's entire back-catalogue
- Deduplication: `sha256(source_id + article_url)` — unique constraint on `dedup_hash`
- Same story from multiple sources: increments `seen_in_sources` counter on the
  canonical article; does not create duplicates
- Auto-archive: articles older than **72 hours** with status `INGESTED` are archived
  (configurable via `ARCHIVE_AFTER_HOURS` in `.env`)
- Source auto-disable: `consecutive_failures >= 3` sets `is_active = False` and
  writes to audit log

---

## Source Management

### Add Source Flow
1. Analyst enters URL
2. Backend fetches feed and returns 3 sample articles (preview only, not ingested)
3. Analyst reviews samples, sets name and tier, confirms
4. Source is saved and included in next poll cycle
5. Action written to audit log

### Delete Source
- Requires confirmation dialog: "This will stop future ingestion. Historical TIs are preserved."
- Sets `is_active = False`; does not delete rows from `articles`
- Written to audit log

### Source Health
| Status   | Condition                         | UI indicator |
|----------|-----------------------------------|--------------|
| Healthy  | Last fetch successful             | Green dot    |
| Degraded | 1–2 consecutive failures          | Amber dot    |
| Failing  | 3+ consecutive failures (disabled)| Red dot      |

---

## TI Card Design

Each card in the feed queue displays:

**Header row**
- Source name + tier badge
- Severity badge (colour-coded, muted: slate/amber/orange/rose — not neon)
- Keyword match tag if applicable (e.g. "⚑ APT28")
- "N sources" badge if seen across multiple feeds
- Timestamp — relative ("14 min ago"), full datetime on hover

**Body**
- Article title as an external hyperlink (opens new tab)
- Summary line (~160 chars max), greyed subtitle style
- No body text — this is a triage queue, not an article reader

**Action row**
- Mark Irrelevant (muted styling)
- Move to To Address (primary, understated)
- Severity selector (inline dropdown)
- Add note (icon, expands inline textarea)
- Lifecycle status pill showing current state + time in state

**Behaviour**
- All actions inline — no modals except for ticket ID prompt and delete confirmation
- Irrelevant cards fade and collapse; recoverable via "Show irrelevant" toggle
- Chronological order, newest first, no pagination — virtualised scroll
- 3px left border stripe per severity (subtle, not dominant)

---

## Feed Queue — Display & Ordering

- Default sort: **chronological, newest first** by `published_at`
- Filters available: severity, lifecycle status, source tier, keyword match flag
- "Show irrelevant" toggle (off by default)
- "Show archived" toggle (off by default)
- Refresh button in header triggers on-demand poll and shows last-refreshed timestamp

---

## User Identity

- First visit: modal prompts for analyst's name (required, non-dismissable)
- Name stored in browser cookie: `socfeed_user`, 90-day expiry
- All write actions tagged with this name
- No server-side auth — internal deployment only
- Cookie name editable in header area (e.g. "Viewing as: Sarah — change")

---

## Keyword Watchlist

- Managed from Settings page
- Terms matched case-insensitively against title + summary on ingest
- Matches stored as comma-separated string in `articles.keyword_matches`
- Matching articles get a flag indicator on their card
- Examples to seed: `APT28`, `Lazarus`, `CISA`, `CVE-2026`, `Ukraine`, `Iran`,
  `ransomware`, `critical infrastructure`, `zero-day`

---

## Audit Log

Every significant action produces an audit entry:

| Action             | Trigger                                 |
|--------------------|-----------------------------------------|
| `status_change`    | Any TI lifecycle transition             |
| `note_added`       | Note written to a TI                    |
| `ticket_raised`    | Ticket ID recorded on a TI             |
| `source_added`     | New source confirmed and saved          |
| `source_deleted`   | Source soft-deleted                     |
| `source_disabled`  | Auto-disabled after 3 failures          |
| `manual_refresh`   | Refresh button pressed                  |
| `keyword_added`    | Watchlist term added                    |
| `keyword_removed`  | Watchlist term removed                  |

UI: table view, filterable by user, action type, and date range.

---

## Daily Digest

- Route: `GET /digest` — rendered as a clean HTML page
- Shows all items in `TO_ADDRESS` and `TICKET_RAISED` status
- Grouped by severity (Critical → High → Medium → Low)
- Each item shows: title, source, link, ticket ID (if raised), time in current state
- Print-optimised CSS — clean for screenshots or PDF export

---

## UI Design

### Principles
- **Mature and professional** — no terminal aesthetics, no hacker themes
- Inspired by tools like Linear, Notion, or a well-designed internal dashboard
- Information-dense but not cluttered
- Typography-first: readable at a glance under stress

### Theme
- Light mode and dark mode, toggled via a button in the header
- Persisted in `localStorage`
- Light: warm white background (`#FAFAF9`), dark slate text, subtle grey borders
- Dark: deep neutral background (`#0F1117`), off-white text, low-contrast borders
- Accent colour: a single muted blue (`#3B82F6`) for primary actions only
- Severity colours (both modes): slate / amber / orange / rose — muted, not neon
- No gradients, no shadows heavier than `shadow-sm`, no animations except
  subtle fade on card collapse

### Typography
- Font: Inter (Google Fonts) — clean, neutral, legible
- Title size hierarchy: clear but not dramatic
- Monospace (`font-mono`) only for ticket IDs, hashes, URLs

### Layout
- Fixed top navigation bar: logo/name, nav links, refresh button + last-refreshed
  time, light/dark toggle, analyst name
- Left sidebar (collapsible): filter panel — severity, status, tier, keyword flag
- Main content: virtualised card list
- No floating action buttons, no overlapping elements

---

## Environment Variables (`.env`)

```
ARCHIVE_AFTER_HOURS=72
LOG_LEVEL=INFO
CORS_ORIGINS=https://socfeeds.albatha.com
CLEAR_PASSWORD=changeme                  # Required to execute Clear All TIs
HOST_PORT=3344                           # Maps to Nginx :80 inside Docker
```

---

## API Routes (summary)

```
GET    /api/articles               # List with filters + pagination cursor
PATCH  /api/articles/:id/status    # Lifecycle transition
PATCH  /api/articles/:id/severity  # Set severity
PATCH  /api/articles/:id/notes     # Append note
GET    /api/sources                # List all sources with health
POST   /api/sources/preview        # Fetch 3 sample items from a URL
POST   /api/sources                # Add confirmed source
DELETE /api/sources/:id            # Soft-delete source
POST   /api/refresh                # Trigger immediate poll
GET    /api/audit                  # Audit log with filters
GET    /api/keywords               # List watchlist terms
POST   /api/keywords               # Add term
DELETE /api/keywords/:id           # Remove term
GET    /api/export                  # Full JSON export (download)
POST   /api/import                  # Upload + validate + apply JSON backup
POST   /api/clear                   # Wipe articles + audit log (requires password in body)
```

---

## What Is Out of Scope (v1)

- User authentication or access control
- Email or Slack notifications
- Mobile layout optimisation
- Full-text search across article bodies
- External API for third-party integrations
- Multi-tenancy
- Scheduled/automatic exports

---

## Development Phases

| Phase | What exists for the user | Scope |
|-------|--------------------------|-------|
| 1 | Nothing — backend only | Docker Compose scaffold, FastAPI + SQLite, schema, RSS/JSON ingestion, dedup, 10-min cron, feed health tracking, source validation script |
| 2a | Read-only feed UI | React frontend: feed list (virtualised, newest-first), TI cards (title, source, summary, severity badge, keyword highlight, seen-in-N badge, timestamp), source tier filter, light/dark mode, user cookie + name prompt, refresh button |
| 2b | Full TI workflow | Lifecycle transitions (freely transitionable, IRRELEVANT restartable), notes inline, ticket ID capture, closure notes, per-item transition history |
| 3 | Source management | Source list view, health indicators, add-with-preview (3 samples), soft-delete with confirmation, per-source test button |
| 4 | Audit & settings | Audit log UI with filters, keyword watchlist settings page, `/digest` page |
| 5 | Data portability & reset | Import/export and destructive data controls in Settings (see below) |

### Phase 5 — Data Portability & Reset

**Export**
- Single-button export from Settings that produces a timestamped `.json` file containing:
  - All sources (including soft-deleted, so history is portable)
  - All TI articles with full status, notes, ticket IDs, severity, keyword matches
  - All audit log entries
  - All keyword watchlist terms
  - Export metadata: exported_at, exported_by, app version
- Everything needed to fully restore the intelligence state on a new instance

**Import**
- Upload a previously exported `.json` file
- Backend validates structure before applying anything
- Merge behaviour: sources and keywords are upserted; TI articles are upserted on `dedup_hash`; audit log entries are appended (no dedup — preserves full history)
- Import itself is written to the audit log: `import | user | N articles, M sources, K keywords restored`
- UI shows a preview diff before confirming: "This will add N new TIs, M new sources, K new keywords. Proceed?"

**Clear All TIs**
- Destructive button in Settings, visually distinct (muted rose, not prominent)
- Two-step confirmation:
  1. Confirmation dialog: "This will permanently delete all TI articles and audit log entries. Sources and keywords will be preserved."
  2. Password prompt: user must enter a pre-configured password (set via `CLEAR_PASSWORD` in `.env`) to proceed
- Deletes all rows from `articles` and `audit_log` tables
- Does **not** delete sources or keywords
- Writes a final audit entry before deletion: `clear_all | user | timestamp` (this entry survives since it's written to a separate log or output to server stdout)
- Intended for starting a fresh intelligence cycle, not routine use

