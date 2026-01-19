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
  import logging
  logger = logging.getLogger(__name__)
  
  if not BOT_TOKEN or not BOT_USERNAME:
    logger.warning("BOT_TOKEN or BOT_USERNAME not set, skipping nudge message")
    return

  to_user = db.get(models.User, to_user_id)
  from_user = db.get(models.User, from_user_id)
  challenge = db.get(models.Challenge, challenge_id)

  if not to_user:
    logger.error(f"User {to_user_id} not found")
    return
  if not from_user:
    logger.error(f"User {from_user_id} not found")
    return
  if not challenge:
    logger.error(f"Challenge {challenge_id} not found")
    return

  chat_id = to_user.telegram_id
  if not chat_id or chat_id == 0:
    logger.warning(f"User {to_user_id} has no valid telegram_id (got {chat_id})")
    return

  if not to_user.bot_chat_active:
    logger.warning(f"User {to_user_id} bot_chat_active is False, message may not be delivered")

  text = (
    f"{from_user.display_name} пнул(а) вас в челлендже «{challenge.title}».\n"
    "Заходите в RepDay и отметьтесь за сегодня 💪"
  )

  # Deep link для открытия Mini App с invite_code
  # Формат: https://t.me/botname/appname?startapp=code
  mini_app_url = f"https://t.me/{BOT_USERNAME}/repday?startapp={challenge.invite_code}"

  payload: dict[str, Any] = {
    "chat_id": chat_id,
    "text": text,
    "parse_mode": "HTML",
    "reply_markup": {
      "inline_keyboard": [
        [
          {
            "text": "Открыть челлендж",
            "url": mini_app_url
          }
        ]
      ]
    },
  }

  try:
    response = requests.post(
      f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
      json=payload,
      timeout=5,
    )
    response.raise_for_status()
    logger.info(f"Successfully sent nudge message to telegram_id={chat_id}")
  except requests.exceptions.RequestException as e:
    logger.error(f"Failed to send Telegram message: {e}")
    if hasattr(e, 'response') and e.response is not None:
      logger.error(f"Response: {e.response.text}")
    raise


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

