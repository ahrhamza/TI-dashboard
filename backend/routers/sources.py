"""
Source management endpoints.
  GET    /api/sources                    list sources (archived excluded by default)
  POST   /api/sources/preview            fetch 3 sample items from a URL (no ingest)
  POST   /api/sources                    add a confirmed source
  PATCH  /api/sources/:id/disable        pause ingestion (is_active=False)
  PATCH  /api/sources/:id/enable         resume ingestion (is_active=True, reset failures)
  PATCH  /api/sources/:id/archive        archive source (hidden from default list)
  POST   /api/sources/:id/test           re-fetch 3 samples for an existing source
  POST   /api/refresh                    trigger immediate full poll
"""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import Session, select

from database import engine, get_session
from feeds import ingest_source, poll_all_sources
from models import Article, Source

router = APIRouter(tags=["sources"])
logger = logging.getLogger(__name__)


@router.get("/api/sources")
def list_sources(
    show_archived: bool = Query(False),
    session: Session = Depends(get_session),
):
    """Return sources with health state and unarchived TI count.
    Archived sources are excluded by default; pass show_archived=true to include them."""
    query = select(Source).order_by(Source.tier, Source.name)
    if not show_archived:
        query = query.where(Source.is_archived == False)  # noqa: E712
    sources = session.exec(query).all()

    counts_raw = session.exec(
        select(Article.source_id, func.count(Article.id))
        .where(Article.archived_at == None)  # noqa: E711
        .group_by(Article.source_id)
    ).all()
    ti_counts = {row[0]: row[1] for row in counts_raw}

    return [
        {
            "id": s.id,
            "name": s.name,
            "url": s.url,
            "tier": s.tier,
            "feed_type": s.feed_type,
            "is_active": s.is_active,
            "is_archived": s.is_archived,
            "consecutive_failures": s.consecutive_failures,
            "last_fetched_at": s.last_fetched_at,
            "last_success_at": s.last_success_at,
            "last_entry_count": s.last_entry_count,
            "created_at": s.created_at,
            "ti_count": ti_counts.get(s.id, 0),
        }
        for s in sources
    ]


@router.post("/api/sources/preview")
def preview_source(body: dict, session: Session = Depends(get_session)):
    """
    Fetch up to 3 sample articles from a feed URL without persisting anything.
    Body: { "url": "https://...", "feed_type": "rss"|"json" }
    """
    from models import FeedType
    from feeds import fetch_rss_entries, fetch_json_entries

    url = body.get("url", "").strip()
    feed_type = FeedType(body.get("feed_type", "rss"))

    if not url:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="url is required")

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

    existing_url = session.exec(select(Source).where(Source.url == url)).first()
    if existing_url:
        raise HTTPException(status_code=409, detail="A source with this URL already exists")

    from sqlalchemy import func as sqlfunc
    existing_name = session.exec(
        select(Source).where(sqlfunc.lower(Source.name) == name.lower())
    ).first()
    if existing_name:
        raise HTTPException(status_code=409, detail=f"A source named '{existing_name.name}' already exists")

    source = Source(
        name=name,
        url=url,
        tier=int(tier),
        feed_type=FeedType(feed_type_raw),
        created_by=analyst,
    )
    session.add(source)
    session.flush()

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


@router.patch("/api/sources/{source_id}/disable")
def disable_source(source_id: int, body: dict = {}, session: Session = Depends(get_session)):
    """Pause ingestion for a source (sets is_active=False)."""
    from fastapi import HTTPException
    from models import AuditLog

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.is_archived:
        raise HTTPException(status_code=409, detail="Cannot disable an archived source")

    analyst = body.get("analyst", "unknown") if body else "unknown"
    source.is_active = False
    session.add(source)

    audit = AuditLog(
        user=analyst,
        action="source_disabled",
        target_id=source_id,
        target_type="source",
        detail=f"Manually disabled source '{source.name}'",
    )
    session.add(audit)
    session.commit()
    return {"ok": True}


@router.patch("/api/sources/{source_id}/enable")
def enable_source(source_id: int, body: dict = {}, session: Session = Depends(get_session)):
    """Resume ingestion for a source (sets is_active=True, resets consecutive_failures)."""
    from fastapi import HTTPException
    from models import AuditLog

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.is_archived:
        raise HTTPException(status_code=409, detail="Cannot enable an archived source; unarchive it first")

    analyst = body.get("analyst", "unknown") if body else "unknown"
    source.is_active = True
    source.consecutive_failures = 0
    session.add(source)

    audit = AuditLog(
        user=analyst,
        action="source_enabled",
        target_id=source_id,
        target_type="source",
        detail=f"Enabled source '{source.name}'",
    )
    session.add(audit)
    session.commit()
    return {"ok": True}


@router.patch("/api/sources/{source_id}/archive")
def archive_source(source_id: int, body: dict = {}, session: Session = Depends(get_session)):
    """Archive a source — hides it from the default list and stops ingestion."""
    from fastapi import HTTPException
    from models import AuditLog

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    analyst = body.get("analyst", "unknown") if body else "unknown"
    source.is_archived = True
    source.is_active = False
    session.add(source)

    audit = AuditLog(
        user=analyst,
        action="source_archived",
        target_id=source_id,
        target_type="source",
        detail=f"Archived source '{source.name}'",
    )
    session.add(audit)
    session.commit()
    return {"ok": True}


@router.patch("/api/sources/{source_id}/unarchive")
def unarchive_source(source_id: int, body: dict = {}, session: Session = Depends(get_session)):
    """Restore an archived source to disabled state (not yet active — analyst must enable explicitly)."""
    from fastapi import HTTPException
    from models import AuditLog

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    analyst = body.get("analyst", "unknown") if body else "unknown"
    source.is_archived = False
    # Leave is_active=False so analyst can review before re-enabling
    session.add(source)

    audit = AuditLog(
        user=analyst,
        action="source_unarchived",
        target_id=source_id,
        target_type="source",
        detail=f"Unarchived source '{source.name}'",
    )
    session.add(audit)
    session.commit()
    return {"ok": True}


@router.delete("/api/sources/{source_id}")
def delete_source(
    source_id: int,
    analyst: str = Query("unknown"),
    session: Session = Depends(get_session),
):
    """Permanently delete an archived source. Only archived sources may be deleted."""
    from fastapi import HTTPException
    from models import AuditLog

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if not source.is_archived:
        raise HTTPException(status_code=409, detail="Only archived sources can be deleted")

    name = source.name
    audit = AuditLog(
        user=analyst,
        action="source_deleted",
        target_id=source_id,
        target_type="source",
        detail=f"Permanently deleted archived source '{name}'",
    )
    session.add(audit)
    session.delete(source)
    session.commit()
    return {"ok": True}


@router.post("/api/sources/{source_id}/test")
def test_source(source_id: int, session: Session = Depends(get_session)):
    """Re-fetch up to 3 sample articles for an existing source. Does not ingest."""
    from fastapi import HTTPException
    from feeds import fetch_rss_entries, fetch_json_entries
    from models import FeedType

    source = session.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    try:
        if source.feed_type == FeedType.rss:
            entries = fetch_rss_entries(source)
        else:
            entries = fetch_json_entries(source)
        return {"entries": entries[:3], "total_found": len(entries)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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
