from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class UserBase(BaseModel):
    id: int
    display_name: str

    class Config:
        from_attributes = True


class UserMe(UserBase):
    telegram_id: int
    username: Optional[str]
    bot_chat_active: bool
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    display_name: Optional[str] = None


class ChallengeShort(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    goal_type: str
    unit: str
    daily_goal: Optional[int]
    duration_days: int
    start_date: date
    end_date: date

    today_progress_value: int | None = None
    today_progress_percent: float | None = None
    days_completed: int | None = None

    class Config:
        from_attributes = True


class ChallengeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    goal_type: str
    daily_goal: Optional[int] = None
    unit: str
    duration_days: int
    start_date: date
    is_public: bool = True


class ChallengeDetail(BaseModel):
    id: int
    title: str
    description: Optional[str]
    goal_type: str
    daily_goal: Optional[int]
    unit: str
    duration_days: int
    start_date: date
    end_date: date
    is_public: bool
    invite_code: str

    # Флаг, что текущий пользователь - владелец (owner)
    is_owner: bool

    class Participant(BaseModel):
        id: int
        display_name: str
        today_value: int
        today_completed: bool
        streak_current: int
        # Когда текущий пользователь последний раз пнул этого участника (ISO строка для фронта)
        last_nudge_at: Optional[str] = None

        class Config:
            from_attributes = True

    participants: list[Participant]

    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    date: date
    delta: Optional[int] = None
    set_value: Optional[int] = None
    completed: Optional[bool] = None


class ChallengeStats(BaseModel):
    completed_days: int
    missed_days: int

    class DayPoint(BaseModel):
        date: date
        percent: float
        value: int = 0  # Реальное значение для дня

    points: list[DayPoint]

    class LeaderboardItem(BaseModel):
        user_id: int
        display_name: str
        total_value: int
        completed_days: int

    leaderboard_by_value: list[LeaderboardItem]
    leaderboard_by_days: list[LeaderboardItem]


class ChallengeMessageCreate(BaseModel):
    text: str


class ChallengeMessageOut(BaseModel):
    id: int
    challenge_id: int
    user_id: int
    display_name: str
    text: str
    created_at: str  # ISO в МСК для единообразия

    class Config:
        from_attributes = True


class AuthRequest(BaseModel):
    init_data: str


class AuthResponse(BaseModel):
    token: str
    user: UserMe
    invite_challenge: Optional[ChallengeShort] = None

