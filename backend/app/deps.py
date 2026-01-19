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

    # Dev-режим: если нет Authorization и нет TELEGRAM_BOT_TOKEN — создаём/используем dev user
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
    is_dev_mode = not os.getenv("TELEGRAM_BOT_TOKEN")

    # Пробуем декодировать JWT
    user_id: int | None = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        # В dev-режиме: если токен невалидный, пробуем декодировать без проверки подписи
        if is_dev_mode:
            try:
                payload_unsafe = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_signature": False})
                user_id = payload_unsafe.get("sub")
            except Exception:
                pass
        else:
            # В проде - строгая валидация
            raise credentials_exception

    if user_id is None:
        if is_dev_mode:
            # В dev-режиме если не удалось получить user_id - используем первого пользователя
            user = db.query(User).first()
            if not user:
                user = User(telegram_id=0, username="dev", display_name="Dev User")
                db.add(user)
                db.commit()
                db.refresh(user)
            return user
        raise credentials_exception

    # Используем пользователя из токена
    user = db.get(User, user_id)
    if user is None:
        # Пользователя с таким ID нет - это ошибка (токен ссылается на несуществующего пользователя)
        # В dev-режиме можем попробовать найти пользователя по telegram_id или создать нового
        if is_dev_mode:
            # Пробуем найти любого пользователя или создать нового
            user = db.query(User).first()
            if not user:
                user = User(telegram_id=0, username="dev", display_name="Dev User")
                db.add(user)
                db.commit()
                db.refresh(user)
            return user
        raise credentials_exception

    return user

