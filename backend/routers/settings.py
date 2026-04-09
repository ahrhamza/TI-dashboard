"""
Keyword watchlist management.
Terms are matched case-insensitively against title+summary at ingest time.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import AuditLog, Keyword

router = APIRouter(prefix="/api/keywords", tags=["settings"])


class KeywordIn(BaseModel):
    term: str
    analyst: str = "unknown"


@router.get("")
def list_keywords(session: Session = Depends(get_session)):
    return session.exec(select(Keyword).order_by(Keyword.term)).all()


@router.post("", status_code=201)
def add_keyword(body: KeywordIn, session: Session = Depends(get_session)):
    term = body.term.strip().lower()
    if not term:
        raise HTTPException(status_code=422, detail="term must not be empty")

    existing = session.exec(select(Keyword).where(Keyword.term == term)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Keyword '{term}' already exists")

    keyword = Keyword(term=term, created_by=body.analyst)
    session.add(keyword)
    session.flush()

    audit = AuditLog(
        user=body.analyst,
        action="keyword_added",
        target_id=keyword.id,
        target_type=None,
        detail=f"Added keyword watchlist term: '{term}'",
    )
    session.add(audit)
    session.commit()
    session.refresh(keyword)
    return keyword


@router.patch("/{keyword_id}/toggle")
def toggle_keyword(keyword_id: int, body: dict, session: Session = Depends(get_session)):
    keyword = session.get(Keyword, keyword_id)
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    analyst = body.get("analyst", "unknown") if body else "unknown"
    keyword.is_active = not keyword.is_active
    session.add(keyword)

    action = "keyword_enabled" if keyword.is_active else "keyword_disabled"
    audit = AuditLog(
        user=analyst,
        action=action,
        target_id=keyword_id,
        target_type=None,
        detail=f"{'Enabled' if keyword.is_active else 'Disabled'} keyword watchlist term: '{keyword.term}'",
    )
    session.add(audit)
    session.commit()
    session.refresh(keyword)
    return keyword


@router.delete("/{keyword_id}")
def remove_keyword(keyword_id: int, analyst: str = "unknown", session: Session = Depends(get_session)):
    keyword = session.get(Keyword, keyword_id)
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    term = keyword.term
    session.delete(keyword)

    audit = AuditLog(
        user=analyst,
        action="keyword_removed",
        target_id=keyword_id,
        target_type=None,
        detail=f"Removed keyword watchlist term: '{term}'",
    )
    session.add(audit)
    session.commit()
    return {"ok": True}
