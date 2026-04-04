"""
APScheduler jobs.

Jobs:
  - poll_job:    every 10 minutes — fetch all active sources
  - archive_job: every hour      — auto-archive stale INGESTED articles
"""
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlmodel import Session

from database import engine
from feeds import auto_archive, poll_all_sources

logger = logging.getLogger(__name__)


async def poll_job() -> None:
    logger.info("Scheduled poll starting")
    with Session(engine) as session:
        poll_all_sources(session)


async def archive_job() -> None:
    with Session(engine) as session:
        auto_archive(session)


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        poll_job,
        trigger="interval",
        minutes=10,
        id="poll_all_sources",
        name="Poll all active sources",
        max_instances=1,        # don't overlap if a poll runs long
        coalesce=True,
    )

    scheduler.add_job(
        archive_job,
        trigger="interval",
        hours=1,
        id="auto_archive",
        name="Auto-archive stale INGESTED articles",
        max_instances=1,
        coalesce=True,
    )

    return scheduler
