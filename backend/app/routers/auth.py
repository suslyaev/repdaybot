from datetime import datetime, timedelta
import hashlib
import hmac
import os
import time
import re
from urllib.parse import parse_qsl, unquote

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
        print("WARNING: BOT_TOKEN not set, skipping validation (dev mode)")
        return dict(parse_qsl(init_data, keep_blank_values=True))

    # Извлекаем hash из оригинальной строки
    hash_match = re.search(r'hash=([^&]+)', init_data)
    if not hash_match:
        raise HTTPException(status_code=400, detail="hash missing in init_data")
    hash_received = hash_match.group(1)
    
    # Парсим данные для использования в коде
    data = dict(parse_qsl(init_data, keep_blank_values=True))
    
    # Формируем строку для проверки из оригинальной строки
    # Извлекаем все параметры кроме hash и signature, сохраняя их в оригинальном URL-encoded виде
    pairs = []
    for part in init_data.split('&'):
        if '=' in part:
            key, value = part.split('=', 1)
            # Используем ключ и значение как есть (URL-encoded)
            if key not in ('hash', 'signature'):
                pairs.append((key, value))
    
    # Сортируем по ключу и формируем строку для проверки
    pairs.sort(key=lambda x: x[0])
    data_check_string = '\n'.join(f"{k}={v}" for k, v in pairs)
    
    print(f"Pairs count: {len(pairs)}, keys: {[k for k, _ in pairs]}")
    
    # Логируем для отладки
    print(f"Data check string preview: {data_check_string[:200]}...")
    print(f"Hash received: {hash_received[:16]}...")
    print(f"Data keys: {sorted(data.keys())}")

    # Вычисляем секретный ключ: HMAC-SHA256(bot_token, "WebAppData")
    secret_key = hmac.new(
        BOT_TOKEN.encode(), 
        msg=b"WebAppData", 
        digestmod=hashlib.sha256
    ).digest()
    
    # Вычисляем хеш: HMAC-SHA256(secret_key, data_check_string)
    h = hmac.new(secret_key, msg=data_check_string.encode(), digestmod=hashlib.sha256).hexdigest()

    if h != hash_received:
        # Логируем для отладки (без чувствительных данных)
        print(f"Validation failed: expected {h[:16]}..., got {hash_received[:16]}...")
        print(f"Data check string length: {len(data_check_string)}")
        print(f"BOT_TOKEN present: {bool(BOT_TOKEN)}")
        print(f"BOT_TOKEN length: {len(BOT_TOKEN) if BOT_TOKEN else 0}")
        print(f"BOT_TOKEN starts with: {BOT_TOKEN[:10] if BOT_TOKEN else 'N/A'}...")
        print(f"Data keys: {list(data.keys())}")
        
        # Проверяем, может быть токен неправильный - пробуем получить информацию о боте
        try:
            import requests
            bot_info = requests.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getMe", timeout=2).json()
            print(f"Bot info check: {bot_info.get('ok', False)}, username: {bot_info.get('result', {}).get('username', 'N/A')}")
        except Exception as e:
            print(f"Bot info check failed: {e}")
        
        raise HTTPException(
            status_code=401, 
            detail="invalid init_data signature. Check TELEGRAM_BOT_TOKEN matches the bot used for Mini App"
        )

    # Проверяем auth_date (данные не должны быть старше 24 часов)
    auth_date_str = data.get("auth_date")
    if auth_date_str:
        try:
            auth_date = int(auth_date_str)
            now = int(time.time())
            if now - auth_date > 86400:  # 24 часа
                raise HTTPException(
                    status_code=401,
                    detail="init_data expired (auth_date too old)"
                )
        except (ValueError, TypeError):
            pass  # Если не удалось распарсить, пропускаем проверку

    return data


@router.post("/telegram", response_model=schemas.AuthResponse)
def auth_telegram(payload: schemas.AuthRequest) -> schemas.AuthResponse:
    import logging
    logger = logging.getLogger(__name__)
    
    init_data = payload.init_data
    logger.info(f"Auth request received, init_data length: {len(init_data) if init_data else 0}")
    logger.info(f"BOT_TOKEN configured: {bool(BOT_TOKEN)}")
    
    try:
        data = _validate_init_data(init_data)
    except HTTPException as e:
        logger.error(f"Validation failed: {e.detail}")
        raise

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

