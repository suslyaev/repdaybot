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
    Получение текущего пользователя из JWT токена.
    В dev-режиме (SKIP_INIT_DATA_VALIDATION=true или нет TELEGRAM_BOT_TOKEN)
    пропускаем проверку подписи и используем fallback при ошибках.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    # Определяем dev-режим
    is_dev_mode = (
        not os.getenv("TELEGRAM_BOT_TOKEN") or 
        os.getenv("SKIP_INIT_DATA_VALIDATION", "").lower() == "true"
    )

    # Если нет токена
    if authorization is None or not authorization.startswith("Bearer "):
        if is_dev_mode:
            # В dev-режиме используем первого пользователя или создаем нового
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
        raise credentials_exception

    token = authorization.removeprefix("Bearer ").strip()

    # Пробуем декодировать JWT
    user_id: int | None = None
    
    if is_dev_mode:
        # В dev-режиме всегда декодируем без проверки подписи
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_signature": False})
            user_id = payload.get("sub")
            print(f"Dev mode: JWT decoded without signature check, user_id={user_id}")
        except Exception as e:
            print(f"Dev mode: Failed to decode JWT even without signature check: {e}")
            # Fallback: используем первого пользователя
            user = db.query(User).first()
            if not user:
                user = User(telegram_id=0, username="dev", display_name="Dev User")
                db.add(user)
                db.commit()
                db.refresh(user)
            return user
    else:
        # В проде - строгая валидация
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
        except JWTError:
            raise credentials_exception

    if user_id is None:
        if is_dev_mode:
            # Fallback в dev-режиме
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
        if is_dev_mode:
            # В dev-режиме создаем пользователя с таким ID
            print(f"Dev mode: User {user_id} not found, creating new user")
            user = User(
                telegram_id=user_id,  # Используем user_id как telegram_id для простоты
                username=f"user_{user_id}",
                display_name=f"User {user_id}",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        raise credentials_exception

    print(f"Using user: id={user.id}, telegram_id={user.telegram_id}, display_name={user.display_name}")
    return user

