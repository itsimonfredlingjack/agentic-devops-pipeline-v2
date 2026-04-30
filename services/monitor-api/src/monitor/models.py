"""SQLAlchemy models for event and session storage."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import config


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(64), nullable=False, index=True)
    session_id = Column(String(128), nullable=False, index=True)
    task_ref = Column(String(64), nullable=True, index=True)
    ticket_id = Column(String(64), nullable=True)
    timestamp = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    event_type = Column(String(32), nullable=False)
    tool_name = Column(String(64), nullable=False)
    tool_args_hash = Column(String(32), nullable=False)
    tool_args_summary = Column(Text, nullable=False, default="")
    success = Column(Boolean, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    tokens = Column(JSON, nullable=True)
    cost_usd = Column(Float, nullable=True)
    error = Column(Text, nullable=True)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(128), unique=True, nullable=False, index=True)
    task_ref = Column(String(64), nullable=True, index=True)
    ticket_id = Column(String(64), nullable=True)
    branch = Column(String(256), nullable=True)
    started_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    ended_at = Column(DateTime, nullable=True)
    total_cost_usd = Column(Float, nullable=False, default=0.0)
    total_events = Column(Integer, nullable=False, default=0)
    outcome = Column(String(32), nullable=True)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String(64), unique=True, nullable=False, index=True)
    session_id = Column(String(128), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    sender = Column(String(16), nullable=False, default="system")
    text = Column(Text, nullable=False)
    status = Column(String(16), nullable=True)
    details = Column(Text, nullable=True)
    actions = Column(JSON, nullable=True)


# Ensure the database directory exists before creating the engine
config.db_path.parent.mkdir(parents=True, exist_ok=True)

_engine = create_async_engine(
    f"sqlite+aiosqlite:///{config.db_path}",
    echo=False,
)
async_session = async_sessionmaker(_engine, expire_on_commit=False)


async def init_db() -> None:
    """Create all tables if they don't exist."""
    config.db_path.parent.mkdir(parents=True, exist_ok=True)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for table_name in ("events", "sessions"):
            columns_result = await conn.exec_driver_sql(f"PRAGMA table_info({table_name})")
            columns = {row[1] for row in columns_result.fetchall()}
            if "task_ref" not in columns:
                await conn.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN task_ref TEXT")

            await conn.exec_driver_sql(
                f"""
                UPDATE {table_name}
                SET task_ref = ticket_id
                WHERE task_ref IS NULL AND ticket_id IS NOT NULL
                """
            )

        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_events_task_ref ON events (task_ref)"
        )
        await conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_sessions_task_ref ON sessions (task_ref)"
        )
