from datetime import datetime, timedelta
import hashlib
import hmac
import os
from urllib.parse import parse_qsl

from fastapi import APIRouter, HTTPException
from jose import jwt
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from .. import models, schemas
from ..db import SessionLocal
from ..deps import SECRET_KEY, ALGORITHM

router = APIRouter()

load_dotenv()
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


def _get_db() -> Session:
    return SessionLocal()


def _validate_init_data(init_data: str) -> dict:
    """
    Валидация initData по алгоритму Telegram WebApp.
    Если TELEGRAM_BOT_TOKEN не задан, считаем dev-режимом и не валидируем подпись.
    """
    if not init_data:
        raise HTTPException(status_code=400, detail="init_data is required")

    # dev-режим: просто парсим query-string
    if not BOT_TOKEN:
        return dict(parse_qsl(init_data, keep_blank_values=True))

    data = dict(parse_qsl(init_data, keep_blank_values=True))
    hash_received = data.pop("hash", None)
    if not hash_received:
        raise HTTPException(status_code=400, detail="hash missing")

    data_check_arr = [f"{k}={v}" for k, v in sorted(data.items())]
    data_check_string = "\n".join(data_check_arr)

    secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
    h = hmac.new(secret_key, msg=data_check_string.encode(), digestmod=hashlib.sha256).hexdigest()

    if h != hash_received:
        raise HTTPException(status_code=401, detail="invalid init_data")

    return data


@router.post("/telegram", response_model=schemas.AuthResponse)
def auth_telegram(payload: schemas.AuthRequest) -> schemas.AuthResponse:
    init_data = payload.init_data
    data = _validate_init_data(init_data)

    # user и start_param лежат в JSON-строке внутри полей
    import json

    user_raw = data.get("user")
    start_param = data.get("start_param")

    if user_raw:
        user_obj = json.loads(user_raw)
        tg_id = int(user_obj["id"])
        username = user_obj.get("username")
        first_name = user_obj.get("first_name") or ""
        last_name = user_obj.get("last_name") or ""
        display_name = (first_name + " " + last_name).strip() or username or f"User {tg_id}"
    else:
        # На крайний случай (dev) – фиктивный user
        tg_id = 1
        username = None
        display_name = "User 1"

    db = _get_db()
    invite_challenge_dto: schemas.ChallengeShort | None = None

    try:
        user = db.query(models.User).filter_by(telegram_id=tg_id).first()
        if not user:
            user = models.User(
                telegram_id=tg_id,
                username=username,
                display_name=display_name,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # обновим имя/username по свежим данным
            user.username = username
            if not user.display_name:
                user.display_name = display_name
            db.add(user)
            db.commit()

        # Если есть start_param — это наш invite_code
        if start_param:
            ch = db.query(models.Challenge).filter_by(invite_code=start_param).first()
            if ch:
                invite_challenge_dto = schemas.ChallengeShort(
                    id=ch.id,
                    title=ch.title,
                    goal_type=ch.goal_type,
                    unit=ch.unit,
                    daily_goal=ch.daily_goal,
                    duration_days=ch.duration_days,
                    start_date=ch.start_date,
                    end_date=ch.end_date,
                )

        # Генерируем JWT
        expire = datetime.utcnow() + timedelta(days=30)
        to_encode = {"sub": user.id, "exp": expire}
        token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

        user_me = schemas.UserMe(
            id=user.id,
            telegram_id=user.telegram_id,
            username=user.username,
            display_name=user.display_name,
            bot_chat_active=user.bot_chat_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

        return schemas.AuthResponse(token=token, user=user_me, invite_challenge=invite_challenge_dto)
    finally:
        db.close()

