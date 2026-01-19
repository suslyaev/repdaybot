from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter()


@router.get("", response_model=schemas.UserMe)
def get_me(
    current_user: models.User = Depends(get_current_user),
) -> schemas.UserMe:
    return schemas.UserMe.model_validate(current_user)


@router.patch("", response_model=schemas.UserMe)
def update_me(
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.UserMe:
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return schemas.UserMe.model_validate(current_user)

