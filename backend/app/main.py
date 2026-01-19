from fastapi import FastAPI

from .routers import auth, challenges, users
from . import telegram_bot
from .db import init_db


def create_app() -> FastAPI:
    app = FastAPI(title="RepDay API", version="0.1.0")

    init_db()

    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(users.router, prefix="/me", tags=["me"])
    app.include_router(challenges.router, prefix="/challenges", tags=["challenges"])
    app.include_router(telegram_bot.router, tags=["telegram"])

    return app


app = create_app()

