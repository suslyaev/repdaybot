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
        print(f"JWT decoded successfully: user_id={user_id}")
    except JWTError as e:
        print(f"JWT decode error: {e}")
        # В dev-режиме: если токен невалидный, пробуем декодировать без проверки подписи
        if is_dev_mode:
            try:
                payload_unsafe = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_signature": False})
                user_id = payload_unsafe.get("sub")
                print(f"JWT decoded without signature check: user_id={user_id}")
            except Exception as e2:
                print(f"JWT decode without signature also failed: {e2}")
                pass
        else:
            # В проде - строгая валидация
            raise credentials_exception

    if user_id is None:
        print("ERROR: Could not extract user_id from token")
        raise credentials_exception

    # Используем пользователя из токена
    user = db.get(User, user_id)
    if user is None:
        # Пользователя с таким ID нет - это критическая ошибка
        print(f"ERROR: User with id={user_id} from token not found in database")
        raise credentials_exception

    print(f"Using user: id={user.id}, telegram_id={user.telegram_id}, display_name={user.display_name}")
    return user

