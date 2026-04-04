from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from database import get_session
from models import AuditLog

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def list_audit(
    user: Optional[str] = None,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
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
    if since:
        stmt = stmt.where(AuditLog.timestamp >= since)
    if until:
        stmt = stmt.where(AuditLog.timestamp <= until)

    stmt = stmt.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    return session.exec(stmt).all()
