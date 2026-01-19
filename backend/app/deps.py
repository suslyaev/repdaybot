from collections.abc import Generator

from fastapi import Depends, HTTPException, Header, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

import os

from .db import SessionLocal
from .models import User

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-env")
ALGORITHM = "HS256"


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: str | None = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    """
    В проде требуем корректный JWT в Authorization: Bearer <token>.
    В dev-режиме (нет TELEGRAM_BOT_TOKEN) позволяем работать без заголовка,
    автоматом создавая/используя первого пользователя.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    # Dev-режим: нет TELEGRAM_BOT_TOKEN -> допускаем отсутствие Authorization
    if authorization is None or not authorization.startswith("Bearer "):
        if not os.getenv("TELEGRAM_BOT_TOKEN"):
            user = db.query(User).first()
            if not user:
                user = User(
                    telegram_id=0,
                    username="dev",
                    display_name="Dev User",
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            return user
        # В проде заголовок обязателен
        raise credentials_exception

    token = authorization.removeprefix("Bearer ").strip()
    
    # Dev-режим: если токен невалидный, используем dev user
    if not os.getenv("TELEGRAM_BOT_TOKEN"):
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id: int | None = payload.get("sub")
            if user_id:
                user = db.get(User, user_id)
                if user:
                    return user
        except (JWTError, Exception):
            pass  # Игнорируем ошибки JWT в dev-режиме
        
        # Используем dev user
        user = db.query(User).first()
        if not user:
            user = User(
                telegram_id=0,
                username="dev",
                display_name="Dev User",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    
    # Prod-режим: строгая валидация JWT
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.get(User, user_id)
    if user is None:
        raise credentials_exception

    return user

