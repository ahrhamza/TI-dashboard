"""
App configuration endpoints.
Currently manages ARCHIVE_AFTER_DAYS — readable and writable at runtime.
Value is persisted to the app_config table so changes survive restarts.
"""
import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from database import get_session
from models import AppConfig
from feeds import get_archive_after_days

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
def get_config(session: Session = Depends(get_session)):
    days = get_archive_after_days(session)
    return {"archive_after_days": days}


class ArchiveDaysIn(BaseModel):
    value: int
    analyst: str = "unknown"


@router.patch("/archive_after_days")
def set_archive_after_days(body: ArchiveDaysIn, session: Session = Depends(get_session)):
    days = max(10, body.value)
    config = session.get(AppConfig, "archive_after_days")
    if config:
        config.value = str(days)
        config.updated_by = body.analyst
    else:
        config = AppConfig(key="archive_after_days", value=str(days), updated_by=body.analyst)
    session.add(config)
    session.commit()
    return {"archive_after_days": days}
