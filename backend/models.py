from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class FeedType(str, Enum):
    rss = "rss"
    json = "json"


class ArticleStatus(str, Enum):
    INGESTED = "INGESTED"
    TO_ADDRESS = "TO_ADDRESS"
    TICKET_RAISED = "TICKET_RAISED"
    RESOLVED = "RESOLVED"
    IRRELEVANT = "IRRELEVANT"


class Severity(str, Enum):
    unset = "unset"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Source(SQLModel, table=True):
    __tablename__ = "sources"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    url: str
    tier: int  # 1 (authoritative) – 5 (community)
    feed_type: FeedType = FeedType.rss
    is_active: bool = True
    consecutive_failures: int = 0
    last_fetched_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_entry_count: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Article(SQLModel, table=True):
    __tablename__ = "articles"

    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: int = Field(foreign_key="sources.id")
    title: str
    url: str
    summary: Optional[str] = None
    # sha256(str(source_id) + url) — prevents re-ingesting same article from same source
    dedup_hash: str = Field(unique=True, index=True)
    # Incremented when other sources publish the same URL; canonical article is preserved
    seen_in_sources: int = 1
    status: ArticleStatus = ArticleStatus.INGESTED
    severity: Severity = Severity.unset
    keyword_matches: Optional[str] = None  # comma-separated matched terms
    ticket_id: Optional[str] = None
    notes: Optional[str] = None
    published_at: Optional[datetime] = None
    ingested_at: datetime = Field(default_factory=datetime.utcnow)
    status_changed_at: Optional[datetime] = None
    status_changed_by: Optional[str] = None
    archived_at: Optional[datetime] = None


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user: str
    action: str
    target_id: Optional[int] = None
    target_type: Optional[str] = None  # "article" or "source"
    detail: str


class Keyword(SQLModel, table=True):
    __tablename__ = "keywords"

    id: Optional[int] = Field(default=None, primary_key=True)
    term: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = "system"


class AppConfig(SQLModel, table=True):
    __tablename__ = "app_config"

    key: str = Field(primary_key=True)
    value: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = "system"
