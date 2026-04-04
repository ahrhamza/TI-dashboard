from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import Article, ArticleStatus, AuditLog, Severity

router = APIRouter(prefix="/api/articles", tags=["articles"])


@router.get("")
def list_articles(
    status: Optional[ArticleStatus] = None,
    severity: Optional[Severity] = None,
    source_id: Optional[int] = None,
    keyword_flag: bool = False,         # true = only articles with keyword matches
    show_irrelevant: bool = False,
    show_archived: bool = False,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    session: Session = Depends(get_session),
):
    stmt = select(Article)

    if status:
        stmt = stmt.where(Article.status == status)
    elif not show_irrelevant:
        stmt = stmt.where(Article.status != ArticleStatus.IRRELEVANT)

    if not show_archived:
        stmt = stmt.where(Article.archived_at == None)  # noqa: E711

    if severity:
        stmt = stmt.where(Article.severity == severity)

    if source_id:
        stmt = stmt.where(Article.source_id == source_id)

    if keyword_flag:
        stmt = stmt.where(Article.keyword_matches != None)  # noqa: E711

    stmt = stmt.order_by(Article.published_at.desc()).offset(offset).limit(limit)

    return session.exec(stmt).all()


@router.get("/{article_id}")
def get_article(article_id: int, session: Session = Depends(get_session)):
    article = session.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


# ── Request bodies ─────────────────────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: ArticleStatus
    user: str
    ticket_id: Optional[str] = None   # required when status == TICKET_RAISED
    notes: Optional[str] = None       # optional closure notes for RESOLVED


class SeverityUpdate(BaseModel):
    severity: Severity
    user: str


class NoteUpdate(BaseModel):
    note: str
    user: str


# ── Write endpoints ────────────────────────────────────────────────────────────

@router.patch("/{article_id}/status")
def update_status(
    article_id: int,
    body: StatusUpdate,
    session: Session = Depends(get_session),
):
    article = session.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if body.status == ArticleStatus.TICKET_RAISED:
        if not body.ticket_id or not body.ticket_id.strip():
            raise HTTPException(status_code=400, detail="ticket_id required for TICKET_RAISED")
        article.ticket_id = body.ticket_id.strip()

    old_status = article.status
    article.status = body.status
    article.status_changed_at = datetime.utcnow()
    article.status_changed_by = body.user

    if body.status == ArticleStatus.RESOLVED and body.notes and body.notes.strip():
        existing = article.notes or ""
        sep = "\n" if existing else ""
        article.notes = existing + sep + body.notes.strip()

    audit = AuditLog(
        user=body.user,
        action="status_change",
        target_id=article_id,
        target_type="article",
        detail=f"{old_status.value} → {body.status.value}",
    )
    session.add(audit)
    session.add(article)
    session.commit()
    session.refresh(article)
    return article


@router.patch("/{article_id}/severity")
def update_severity(
    article_id: int,
    body: SeverityUpdate,
    session: Session = Depends(get_session),
):
    article = session.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    old_severity = article.severity
    article.severity = body.severity

    audit = AuditLog(
        user=body.user,
        action="severity_change",
        target_id=article_id,
        target_type="article",
        detail=f"severity {old_severity.value} → {body.severity.value}",
    )
    session.add(audit)
    session.add(article)
    session.commit()
    session.refresh(article)
    return article


@router.patch("/{article_id}/notes")
def append_note(
    article_id: int,
    body: NoteUpdate,
    session: Session = Depends(get_session),
):
    article = session.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not body.note.strip():
        raise HTTPException(status_code=400, detail="note must not be empty")

    existing = article.notes or ""
    sep = "\n" if existing else ""
    article.notes = existing + sep + body.note.strip()

    audit = AuditLog(
        user=body.user,
        action="note_added",
        target_id=article_id,
        target_type="article",
        detail=f"Note added by {body.user}",
    )
    session.add(audit)
    session.add(article)
    session.commit()
    session.refresh(article)
    return article
