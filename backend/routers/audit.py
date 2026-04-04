from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from database import get_session
from models import Article, AuditLog

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def list_audit(
    user: Optional[str] = None,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = Query(default=200, le=1000),
    offset: int = 0,
    session: Session = Depends(get_session),
):
    stmt = select(AuditLog)

    if user:
        stmt = stmt.where(AuditLog.user == user)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    if target_id is not None:
        stmt = stmt.where(AuditLog.target_id == target_id)
    if since:
        stmt = stmt.where(AuditLog.timestamp >= since)
    if until:
        stmt = stmt.where(AuditLog.timestamp <= until)

    stmt = stmt.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    entries = session.exec(stmt).all()

    # Bulk-fetch article titles for article-targeted entries (single extra query)
    article_ids = {
        e.target_id for e in entries
        if e.target_type == "article" and e.target_id is not None
    }
    title_map: dict[int, str] = {}
    if article_ids:
        articles = session.exec(
            select(Article.id, Article.title).where(Article.id.in_(article_ids))
        ).all()
        title_map = {row[0]: row[1] for row in articles}

    result = []
    for e in entries:
        d = e.model_dump()
        d["article_title"] = (
            title_map.get(e.target_id)
            if e.target_type == "article" and e.target_id is not None
            else None
        )
        result.append(d)
    return result
