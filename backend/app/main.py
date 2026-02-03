import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .routers import auth, challenges, users
from . import telegram_bot
from .db import init_db


def create_app() -> FastAPI:
    app = FastAPI(title="RepDay API", version="0.1.0")

    @app.exception_handler(Exception)
    def unhandled_exception_handler(request, exc):
        """В ответе 500 возвращаем текст ошибки для отладки."""
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal Server Error",
                "error": str(exc),
                "traceback": traceback.format_exc(),
            },
        )

    init_db()

    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(users.router, prefix="/me", tags=["me"])
    app.include_router(challenges.router, prefix="/challenges", tags=["challenges"])
    app.include_router(telegram_bot.router, tags=["telegram"])

    return app


app = create_app()

