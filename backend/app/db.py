from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "sqlite:///./repday.db"


class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    # Импортируем модели здесь, чтобы они зарегистрировались в Base.metadata
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Миграция: добавить колонку updated_at в daily_progress, если её нет (для существующих БД)
    try:
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(daily_progress)"))
            columns = [row[1] for row in r.fetchall()]
        if "updated_at" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE daily_progress ADD COLUMN updated_at DATETIME"))
    except Exception:
        pass

