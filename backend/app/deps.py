from collections.abc import Generator

from fastapi import Depends, HTTPException, Header, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

import os

from .db import SessionLocal
from .models import User

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-env")
ALGORITHM = "HS256"


def is_superadmin(user: User) -> bool:
    """Суперадмин по SUPERADMIN_TELEGRAM_ID в .env (строка — Telegram ID пользователя)."""
    raw = (os.getenv("SUPERADMIN_TELEGRAM_ID") or "").strip()
    if not raw:
        return False
    try:
        return user.telegram_id == int(raw)
    except ValueError:
        return False


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
    
    if not token:
        print("ERROR: Token is empty")
        if is_dev_mode:
            user = db.query(User).first()
            if not user:
                user = User(telegram_id=0, username="dev", display_name="Dev User")
                db.add(user)
                db.commit()
                db.refresh(user)
            return user
        raise credentials_exception

    # Пробуем декодировать JWT
    user_id: int | None = None
    
    if is_dev_mode:
        # В dev-режиме всегда декодируем без проверки подписи и exp
        try:
            payload = jwt.decode(
                token, 
                SECRET_KEY, 
                algorithms=[ALGORITHM], 
                options={
                    "verify_signature": False,
                    "verify_exp": False  # Не проверяем expiration в dev-режиме
                }
            )
            user_id = payload.get("sub")
            print(f"Dev mode: JWT decoded successfully, user_id={user_id}")
        except Exception as e:
            print(f"ERROR: Dev mode: Failed to decode JWT: {type(e).__name__}: {e}")
            print(f"Token length: {len(token)}, token preview: {token[:50]}...")
            # В dev-режиме пробуем извлечь user_id из токена напрямую (base64)
            try:
                import base64
                import json
                # JWT формат: header.payload.signature
                parts = token.split('.')
                if len(parts) >= 2:
                    # Декодируем payload (вторая часть)
                    payload_b64 = parts[1]
                    # Добавляем padding если нужно
                    payload_b64 += '=' * (4 - len(payload_b64) % 4)
                    payload_bytes = base64.urlsafe_b64decode(payload_b64)
                    payload_dict = json.loads(payload_bytes)
                    user_id = payload_dict.get("sub")
                    print(f"Dev mode: Extracted user_id from base64: {user_id}")
            except Exception as e2:
                print(f"ERROR: Dev mode: Failed to extract from base64: {e2}")
            
            # Если все равно не получилось - используем первого пользователя в dev-режиме
            if user_id is None:
                print("WARNING: Dev mode: Using fallback - first user")
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
        except JWTError as e:
            print(f"ERROR: Production mode: JWT decode failed: {e}")
            raise credentials_exception

    if user_id is None:
        print(f"ERROR: user_id is None after decoding token")
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
        print(f"ERROR: User with id={user_id} from token not found in database")
        all_users = db.query(User).all()
        print(f"Available users: {[u.id for u in all_users]}")
        if is_dev_mode:
            # В dev-режиме создаем пользователя с таким ID
            print(f"Dev mode: Creating user with id={user_id}")
            user = User(
                telegram_id=user_id,  # Используем user_id как telegram_id
                username=f"user_{user_id}",
                display_name=f"User {user_id}",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        raise credentials_exception

    print(f"✓ Using user: id={user.id}, telegram_id={user.telegram_id}, display_name={user.display_name}")
    return user

