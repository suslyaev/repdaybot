import os
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from . import models
from .db import SessionLocal

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "")

router = APIRouter()


def get_db() -> Session:
  return SessionLocal()


def send_nudge_message(
  db: Session,
  to_user_id: int,
  from_user_id: int,
  challenge_id: int,
) -> None:
  """Отправка сообщения через Bot API. Безопасно no-op, если токен/username не заданы."""
  if not BOT_TOKEN or not BOT_USERNAME:
    return

  to_user = db.get(models.User, to_user_id)
  from_user = db.get(models.User, from_user_id)
  challenge = db.get(models.Challenge, challenge_id)

  if not to_user or not from_user or not challenge:
    return

  chat_id = to_user.telegram_id
  if not chat_id:
    return

  text = (
    f"{from_user.display_name} пнул(а) вас в челлендже «{challenge.title}».\n"
    "Заходите в RepDay и отметьтесь за сегодня 💪"
  )

  url = f"https://t.me/{BOT_USERNAME}?startapp={challenge.invite_code}"

  payload: dict[str, Any] = {
    "chat_id": chat_id,
    "text": text,
    "reply_markup": {
      "inline_keyboard": [
        [
          {
            "text": "Открыть челлендж",
            "url": url,
          }
        ]
      ]
    },
  }

  try:
    requests.post(
      f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
      json=payload,
      timeout=5,
    )
  except Exception:
    # Для MVP просто глушим ошибки отправки
    return


@router.post("/telegram/webhook")
def telegram_webhook(update: dict, db: Session = Depends(get_db)) -> dict:
  """
  Webhook бота.
  Отмечаем, что чат с ботом активен (bot_chat_active = true).
  """
  message = update.get("message") or update.get("edited_message")
  if not message:
    return {"ok": True}

  from_user = message.get("from") or {}
  tg_id = from_user.get("id")
  if not tg_id:
    return {"ok": True}

  username = from_user.get("username")
  first_name = from_user.get("first_name") or ""
  last_name = from_user.get("last_name") or ""
  display_name = (first_name + " " + last_name).strip() or username or f"User {tg_id}"

  user = db.query(models.User).filter_by(telegram_id=tg_id).first()
  if not user:
    user = models.User(
      telegram_id=tg_id,
      username=username,
      display_name=display_name,
      bot_chat_active=True,
    )
    db.add(user)
  else:
    user.bot_chat_active = True
    if username:
      user.username = username

  db.commit()

  return {"ok": True}

