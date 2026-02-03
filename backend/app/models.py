from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    telegram_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    display_name: Mapped[str] = mapped_column(String(128))
    bot_chat_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    challenges_created: Mapped[list["Challenge"]] = relationship(back_populates="creator")
    participations: Mapped[list["ChallengeParticipant"]] = relationship(back_populates="user")


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    goal_type: Mapped[str] = mapped_column(String(16))
    daily_goal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit: Mapped[str] = mapped_column(String(64))
    duration_days: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)

    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    creator: Mapped[User] = relationship(back_populates="challenges_created")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    participants: Mapped[list["ChallengeParticipant"]] = relationship(back_populates="challenge")
    daily_progress: Mapped[list["DailyProgress"]] = relationship(back_populates="challenge")
    messages: Mapped[list["ChallengeMessage"]] = relationship(back_populates="challenge")


class ChallengeParticipant(Base):
    __tablename__ = "challenge_participants"
    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uix_challenge_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(16), default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    streak_current: Mapped[int] = mapped_column(Integer, default=0)
    streak_best: Mapped[int] = mapped_column(Integer, default=0)

    challenge: Mapped[Challenge] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(back_populates="participations")


class DailyProgress(Base):
    __tablename__ = "daily_progress"
    __table_args__ = (
        UniqueConstraint(
            "challenge_id", "user_id", "date", name="uix_progress_day"
        ),
        CheckConstraint("value >= 0", name="check_value_nonnegative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date: Mapped[date] = mapped_column(Date)
    value: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

    challenge: Mapped[Challenge] = relationship(back_populates="daily_progress")
    user: Mapped[User] = relationship()


class ChallengeMessage(Base):
    __tablename__ = "challenge_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(String(2000))  # ограничение против спама
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    challenge: Mapped["Challenge"] = relationship(back_populates="messages")
    user: Mapped["User"] = relationship()


class Nudge(Base):
    __tablename__ = "nudges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

