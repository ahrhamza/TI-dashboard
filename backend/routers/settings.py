"""
Keyword watchlist management.
Terms are matched case-insensitively against title+summary at ingest time.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Article, AuditLog, Keyword

router = APIRouter(prefix="/api/keywords", tags=["settings"])


class KeywordIn(BaseModel):
    term: str
    analyst: str = "unknown"


class AliasesIn(BaseModel):
    aliases: Optional[str] = None  # pipe-separated; None clears all aliases
    analyst: str = "unknown"


class KeywordUpdateIn(BaseModel):
    term: str
    aliases: Optional[str] = None
    analyst: str = "unknown"


def _backfill_aliases(session: Session, primary_term: str, aliases_str: Optional[str]) -> None:
    """Replace any alias term found in article keyword_matches with the canonical primary term."""
    if not aliases_str:
        return
    for alias in [a.strip().lower() for a in aliases_str.split("|") if a.strip()]:
        stale = session.exec(
            select(Article).where(Article.keyword_matches.contains(alias))  # type: ignore[arg-type]
        ).all()
        for article in stale:
            if not article.keyword_matches:
                continue
            terms = [t.strip() for t in article.keyword_matches.split(",")]
            updated = [primary_term if t == alias else t for t in terms]
            if updated != terms:
                article.keyword_matches = ",".join(updated)
                session.add(article)


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


@router.patch("/{keyword_id}")
def update_keyword(keyword_id: int, body: KeywordUpdateIn, session: Session = Depends(get_session)):
    keyword = session.get(Keyword, keyword_id)
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    new_term = body.term.strip().lower()
    if not new_term:
        raise HTTPException(status_code=422, detail="term must not be empty")

    if new_term != keyword.term:
        existing = session.exec(select(Keyword).where(Keyword.term == new_term)).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Keyword '{new_term}' already exists")

    old_term = keyword.term
    keyword.term = new_term
    keyword.aliases = body.aliases or None
    session.add(keyword)

    # Backfill: primary term rename
    if new_term != old_term:
        articles = session.exec(
            select(Article).where(Article.keyword_matches.contains(old_term))  # type: ignore[arg-type]
        ).all()
        for article in articles:
            if article.keyword_matches:
                terms = [t.strip() for t in article.keyword_matches.split(',')]
                article.keyword_matches = ','.join(
                    new_term if t == old_term else t for t in terms
                )
                session.add(article)

    # Backfill: alias strings that may have been stored as tags from a previous state
    _backfill_aliases(session, new_term, body.aliases)

    session.commit()
    session.refresh(keyword)
    return keyword


@router.patch("/{keyword_id}/aliases")
def update_aliases(keyword_id: int, body: AliasesIn, session: Session = Depends(get_session)):
    keyword = session.get(Keyword, keyword_id)
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    keyword.aliases = body.aliases or None
    _backfill_aliases(session, keyword.term, body.aliases)
    session.add(keyword)
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
