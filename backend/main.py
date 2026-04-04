"""
SOCFeed backend — FastAPI entry point.

Startup sequence:
  1. Create DB tables
  2. Seed sources (no-op if already seeded)
  3. Start APScheduler (poll every 10 min, archive every hour)
  4. Kick off an initial poll so data is available immediately
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from database import create_db_and_tables, engine
from feeds import poll_all_sources
from models import Article, Source
from routers import articles, audit, config, digest, settings, sources
from scheduler import create_scheduler
from sources import seed_sources

# ── Logging ───────────────────────────────────────────────────────────────────

log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Startup helpers ───────────────────────────────────────────────────────────

def _remove_defunct_sources(urls: list[str]) -> None:
    """Delete sources (and their ingested articles) whose URLs are no longer in
    the curated seed list. Safe to run on every startup — no-op if already gone."""
    with Session(engine) as session:
        for url in urls:
            source = session.exec(select(Source).where(Source.url == url)).first()
            if not source:
                continue
            deleted = session.exec(
                select(Article).where(Article.source_id == source.id)
            ).all()
            for article in deleted:
                session.delete(article)
            session.delete(source)
            logger.info(
                f"Removed defunct source '{source.name}' and {len(deleted)} articles"
            )
            session.commit()


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    logger.info("SOCFeed starting up")
    create_db_and_tables()

    with Session(engine) as session:
        inserted = seed_sources(session)
        if inserted:
            logger.info(f"Seeded {inserted} sources")

    # One-time cleanup: remove sources (and their articles) that are no longer
    # in the curated seed list. Currently targets ZDNet Security.
    _remove_defunct_sources(["https://www.zdnet.com/topic/security/rss.xml"])

    # Initial poll — runs once at startup so analysts see data immediately
    logger.info("Running initial poll on startup")
    with Session(engine) as session:
        poll_all_sources(session)

    scheduler = create_scheduler()
    scheduler.start()
    logger.info("Scheduler started (poll every 10 min, archive every 1 h)")

    yield  # app is running

    # --- shutdown ---
    scheduler.shutdown(wait=False)
    logger.info("SOCFeed shut down")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SOCFeed",
    description="Internal threat intelligence feed aggregator",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in cors_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(articles.router)
app.include_router(sources.router)
app.include_router(audit.router)
app.include_router(settings.router)
app.include_router(config.router)
app.include_router(digest.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
