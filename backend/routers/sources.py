"""
Source management endpoints — Phase 1 scope:
  GET  /api/sources           list sources with health
  POST /api/refresh           trigger immediate full poll

Phase 3 additions (preview, add, delete) go here when the time comes.
"""
import logging

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from database import engine, get_session
from feeds import ingest_source, poll_all_sources
from models import Source

router = APIRouter(tags=["sources"])
logger = logging.getLogger(__name__)


@router.get("/api/sources")
def list_sources(session: Session = Depends(get_session)):
    """Return all sources with their current health state."""
    sources = session.exec(select(Source).order_by(Source.tier, Source.name)).all()
    return sources


@router.post("/api/sources/preview")
def preview_source(body: dict, session: Session = Depends(get_session)):
    """
    Fetch up to 3 sample articles from a feed URL without persisting anything.
    Used in the Add Source flow (Phase 3 UI).

    Body: { "url": "https://...", "feed_type": "rss"|"json" }
    """
    from models import FeedType
    from feeds import fetch_rss_entries, fetch_json_entries

    url = body.get("url", "").strip()
    feed_type = FeedType(body.get("feed_type", "rss"))

    if not url:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="url is required")

    # Temporary source object — not persisted
    dummy = Source(id=0, name="preview", url=url, tier=3, feed_type=feed_type)
    try:
        if feed_type == FeedType.rss:
            entries = fetch_rss_entries(dummy)
        else:
            entries = fetch_json_entries(dummy)
        return {"entries": entries[:3], "total_found": len(entries)}
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/sources")
def add_source(body: dict, session: Session = Depends(get_session)):
    """
    Confirm and persist a new source.
    Body: { "name", "url", "tier", "feed_type", "analyst" }
    """
    from fastapi import HTTPException
    from models import FeedType, AuditLog

    name = body.get("name", "").strip()
    url = body.get("url", "").strip()
    tier = body.get("tier")
    feed_type_raw = body.get("feed_type", "rss")
    analyst = body.get("analyst", "unknown")

    if not name or not url or tier is None:
        raise HTTPException(status_code=422, detail="name, url, and tier are required")

    existing = session.exec(select(Source).where(Source.url == url)).first()
    if existing:
        raise HTTPException(status_code=409, detail="A source with this URL already exists")

    source = Source(
        name=name,
        url=url,
        tier=int(tier),
        feed_type=FeedType(feed_type_raw),
    )
    session.add(source)
    session.flush()  # get the assigned id

    audit = AuditLog(
        user=analyst,
        action="source_added",
        target_id=source.id,
        target_type="source",
        detail=f"Added source '{name}' (tier {tier}, {feed_type_raw}): {url}",
    )
    session.add(audit)
    session.commit()
    session.refresh(source)
    return source


@router.delete("/api/sources/{source_id}")
def delete_source(source_id: int, analyst: str = "unknown", session: Session = Depends(get_session)):
    """Soft-delete a source (sets is_active=False). Historical articles are preserved."""
    from fastapi import HTTPException
    from models import AuditLog

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.is_active = False
    session.add(source)

    audit = AuditLog(
        user=analyst,
        action="source_deleted",
        target_id=source_id,
        target_type="source",
        detail=f"Soft-deleted source '{source.name}'",
    )
    session.add(audit)
    session.commit()
    return {"ok": True}


@router.post("/api/refresh")
def trigger_refresh(session: Session = Depends(get_session)):
    """
    Immediately poll all active sources outside the normal 10-minute schedule.
    Writes an audit log entry. Returns per-source new article counts.
    """
    from models import AuditLog

    logger.info("Manual refresh triggered via API")
    results = poll_all_sources(session)

    audit = AuditLog(
        user="system",
        action="manual_refresh",
        target_id=None,
        target_type=None,
        detail=f"Manual refresh: {sum(results.values())} new articles across {len(results)} sources",
    )
    session.add(audit)
    session.commit()

    return {
        "sources_polled": len(results),
        "total_new_articles": sum(results.values()),
        "per_source": results,
    }
