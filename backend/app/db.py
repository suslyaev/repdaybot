from sqlalchemy import create_engine
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

