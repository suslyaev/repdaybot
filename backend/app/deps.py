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
            print(f"Dev mode: JWT decoded, user_id={user_id}, token_preview={token[:20]}...")
        except Exception as e:
            print(f"ERROR: Dev mode: Failed to decode JWT: {e}")
            print(f"Token length: {len(token)}, token start: {token[:50] if len(token) > 50 else token}")
            raise credentials_exception
    else:
        # В проде - строгая валидация
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
        except JWTError:
            raise credentials_exception

    if user_id is None:
        print(f"ERROR: user_id is None after decoding token")
        raise credentials_exception

    # Используем пользователя из токена - ОБЯЗАТЕЛЬНО
    user = db.get(User, user_id)
    if user is None:
        print(f"ERROR: User with id={user_id} from token not found in database")
        print(f"Available users: {[u.id for u in db.query(User).all()]}")
        raise credentials_exception

    print(f"✓ Using user: id={user.id}, telegram_id={user.telegram_id}, display_name={user.display_name}")
    return user

