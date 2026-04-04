from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from database import get_session
from models import Article, ArticleStatus, Severity

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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Article not found")
    return article
