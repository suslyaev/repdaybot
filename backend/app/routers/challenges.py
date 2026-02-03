from datetime import date, datetime, timedelta
from typing import List

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas, telegram_bot
from ..deps import get_current_user, get_db, is_superadmin

router = APIRouter()


def _challenge_short_for(
    ch: models.Challenge,
    db: Session,
    current_user: models.User,
    is_participant: bool,
) -> schemas.ChallengeShort:
    today = date.today()
    if not is_participant:
        return schemas.ChallengeShort(
            id=ch.id,
            title=ch.title,
            description=ch.description,
            goal_type=ch.goal_type,
            unit=ch.unit,
            daily_goal=ch.daily_goal,
            duration_days=ch.duration_days,
            start_date=ch.start_date,
            end_date=ch.end_date,
            today_progress_value=None,
            today_progress_percent=None,
            days_completed=None,
        )
    dp = (
        db.query(models.DailyProgress)
        .filter_by(
            challenge_id=ch.id,
            user_id=current_user.id,
            date=today,
        )
        .first()
    )
    value = dp.value if dp else 0
    percent = (
        (value / ch.daily_goal * 100.0)
        if ch.daily_goal and ch.daily_goal > 0
        else None
    )
    days_completed = (
        db.query(func.count(models.DailyProgress.id))
        .filter_by(
            challenge_id=ch.id,
            user_id=current_user.id,
            completed=True,
        )
        .scalar()
    )
    return schemas.ChallengeShort(
        id=ch.id,
        title=ch.title,
        description=ch.description,
        goal_type=ch.goal_type,
        unit=ch.unit,
        daily_goal=ch.daily_goal,
        duration_days=ch.duration_days,
        start_date=ch.start_date,
        end_date=ch.end_date,
        today_progress_value=value,
        today_progress_percent=percent,
        days_completed=days_completed,
    )


@router.get("", response_model=List[schemas.ChallengeShort])
def list_my_challenges(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.ChallengeShort]:
    if is_superadmin(current_user):
        # Суперадмин видит все челленджи
        challenges = db.query(models.Challenge).all()
        participant_challenge_ids = {
            row[0]
            for row in db.query(models.ChallengeParticipant.challenge_id)
            .filter(models.ChallengeParticipant.user_id == current_user.id)
            .all()
        }
        return [
            _challenge_short_for(
                ch, db, current_user,
                is_participant=(ch.id in participant_challenge_ids),
            )
            for ch in challenges
        ]
    # Обычный пользователь: только челленджи, где участник
    q = (
        db.query(models.Challenge)
        .join(models.ChallengeParticipant)
        .filter(models.ChallengeParticipant.user_id == current_user.id)
    )
    challenges = q.all()
    return [_challenge_short_for(ch, db, current_user, True) for ch in challenges]


@router.post("", response_model=schemas.ChallengeDetail)
def create_challenge(
    payload: schemas.ChallengeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ChallengeDetail:
    end_date = payload.start_date + timedelta(days=payload.duration_days - 1)

    # Простой invite_code
    import secrets

    invite_code = secrets.token_urlsafe(8)

    challenge = models.Challenge(
        title=payload.title,
        description=payload.description,
        goal_type=payload.goal_type,
        daily_goal=payload.daily_goal,
        unit=payload.unit,
        duration_days=payload.duration_days,
        start_date=payload.start_date,
        end_date=end_date,
        is_public=payload.is_public,
        invite_code=invite_code,
        creator_id=current_user.id,
    )
    db.add(challenge)
    db.flush()

    # Добавляем создателя как участника
    participant = models.ChallengeParticipant(
        challenge_id=challenge.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(participant)
    db.commit()
    db.refresh(challenge)

    return get_challenge(challenge.id, db, current_user)


def _require_participant(
    challenge_id: int,
    db: Session,
    user: models.User,
) -> models.ChallengeParticipant:
    participant = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=user.id)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant")
    return participant


@router.get("/{challenge_id}", response_model=schemas.ChallengeDetail)
def get_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ChallengeDetail:
    import logging
    logger = logging.getLogger(__name__)
    try:
        return _get_challenge_impl(challenge_id, db, current_user)
    except Exception as e:
        logger.exception("get_challenge failed: %s", e)
        raise


def _get_challenge_impl(
    challenge_id: int,
    db: Session,
    current_user: models.User,
) -> schemas.ChallengeDetail:
    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    participants = (
        db.query(models.ChallengeParticipant)
        .options(joinedload(models.ChallengeParticipant.user))
        .filter_by(challenge_id=challenge_id)
        .all()
    )
    me_participation = next(
        (p for p in participants if p.user_id == current_user.id), None
    )
    is_participant = me_participant is not None
    if not is_participant and not is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="Not a participant")

    today = date.today()
    is_owner = bool(me_participation and me_participation.role == "owner")

    result_participants: list[schemas.ChallengeDetail.Participant] = []

    for p in participants:
        if p.user is None:
            continue
        dp = (
            db.query(models.DailyProgress)
            .filter_by(
                challenge_id=challenge_id,
                user_id=p.user_id,
                date=today,
            )
            .first()
        )
        value = dp.value if dp else 0
        completed = dp.completed if dp else False

        last_nudge_at = None
        if is_participant and p.user_id != current_user.id:
            last_nudge = (
                db.query(models.Nudge)
                .filter_by(
                    challenge_id=challenge_id,
                    from_user_id=current_user.id,
                    to_user_id=p.user_id,
                )
                .order_by(models.Nudge.created_at.desc())
                .first()
            )
            if last_nudge:
                utc_dt = last_nudge.created_at
                if utc_dt.tzinfo is None:
                    utc_dt = utc_dt.replace(tzinfo=ZoneInfo("UTC"))
                msk_dt = utc_dt.astimezone(ZoneInfo("Europe/Moscow"))
                last_nudge_at = msk_dt.isoformat()

        result_participants.append(
            schemas.ChallengeDetail.Participant(
                id=p.user.id,
                display_name=p.user.display_name,
                today_value=value,
                today_completed=completed,
                streak_current=p.streak_current,
                last_nudge_at=last_nudge_at,
            )
        )

    # Для просмотра без участия (суперадмин) не отдаём invite_code
    invite_code = ch.invite_code if is_participant else ""

    return schemas.ChallengeDetail(
        id=ch.id,
        title=ch.title,
        description=ch.description,
        goal_type=ch.goal_type,
        daily_goal=ch.daily_goal,
        unit=ch.unit,
        duration_days=ch.duration_days,
        start_date=ch.start_date,
        end_date=ch.end_date,
        is_public=ch.is_public,
        invite_code=invite_code,
        participants=result_participants,
        is_owner=is_owner,
        is_participant=is_participant,
    )


@router.post("/{challenge_id}/join", response_model=schemas.ChallengeDetail)
def join_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ChallengeDetail:
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Join challenge {challenge_id}: current_user.id={current_user.id}, telegram_id={current_user.telegram_id}, display_name={current_user.display_name}")
    
    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    existing = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=current_user.id)
        .first()
    )
    if not existing:
        logger.info(f"Adding user {current_user.id} to challenge {challenge_id}")
        participant = models.ChallengeParticipant(
            challenge_id=challenge_id,
            user_id=current_user.id,
            role="member",
        )
        db.add(participant)
        db.commit()
        logger.info(f"User {current_user.id} added to challenge {challenge_id}")
    else:
        logger.info(f"User {current_user.id} already in challenge {challenge_id}")

    return get_challenge(challenge_id, db, current_user)


@router.post("/{challenge_id}/progress")
def update_progress(
    challenge_id: int,
    payload: schemas.ProgressUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Update progress: challenge={challenge_id}, user_id={current_user.id}, telegram_id={current_user.telegram_id}, date={payload.date}")
    
    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    _require_participant(challenge_id, db, current_user)

    dp = (
        db.query(models.DailyProgress)
        .filter_by(
            challenge_id=challenge_id,
            user_id=current_user.id,
            date=payload.date,
        )
        .first()
    )
    if not dp:
        dp = models.DailyProgress(
            challenge_id=challenge_id,
            user_id=current_user.id,
            date=payload.date,
            value=0,
            completed=False,
        )
        db.add(dp)

    if payload.set_value is not None:
        dp.value = max(0, payload.set_value)
    elif payload.delta is not None:
        dp.value = max(0, dp.value + payload.delta)

    if payload.completed is not None:
        dp.completed = payload.completed
    else:
        # Авторасчет completed
        if ch.daily_goal and ch.daily_goal > 0:
            dp.completed = dp.value >= ch.daily_goal

    db.commit()

    return {"ok": True}


@router.get("/{challenge_id}/stats", response_model=schemas.ChallengeStats)
def get_stats(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ChallengeStats:
    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    is_participant = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=current_user.id)
        .first()
        is not None
    )
    if not is_participant and not is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="Not a participant")

    points: list[schemas.ChallengeStats.DayPoint] = []
    completed_days = 0
    missed_days = 0
    today = date.today()
    last_day = min(ch.end_date, today)

    if is_participant:
        day = ch.start_date
        while day <= last_day:
            dp = (
                db.query(models.DailyProgress)
                .filter_by(
                    challenge_id=challenge_id,
                    user_id=current_user.id,
                    date=day,
                )
                .first()
            )
            if dp:
                if ch.daily_goal and ch.daily_goal > 0:
                    percent = min(100.0, dp.value / ch.daily_goal * 100.0)
                else:
                    percent = 100.0 if dp.completed else 0.0
                day_value = dp.value
            else:
                percent = 0.0
                day_value = 0

            if dp and dp.completed:
                completed_days += 1
            else:
                missed_days += 1

            points.append(
                schemas.ChallengeStats.DayPoint(
                    date=day,
                    percent=percent,
                    value=day_value,
                )
            )
            day += timedelta(days=1)

    # Лидерборды по всему челленджу
    rows = (
        db.query(
            models.User.id.label("user_id"),
            models.User.display_name,
            func.coalesce(func.sum(models.DailyProgress.value), 0).label("total_value"),
            func.coalesce(
                func.sum(case((models.DailyProgress.completed.is_(True), 1), else_=0)),
                0,
            ).label("completed_days"),
        )
        .join(models.ChallengeParticipant, models.ChallengeParticipant.user_id == models.User.id)
        .outerjoin(
            models.DailyProgress,
            (models.DailyProgress.user_id == models.User.id)
            & (models.DailyProgress.challenge_id == challenge_id),
        )
        .filter(models.ChallengeParticipant.challenge_id == challenge_id)
        .group_by(models.User.id, models.User.display_name)
        .all()
    )

    leaderboard_items = [
        schemas.ChallengeStats.LeaderboardItem(
            user_id=r.user_id,
            display_name=r.display_name,
            total_value=int(r.total_value or 0),
            completed_days=int(r.completed_days or 0),
        )
        for r in rows
    ]

    leaderboard_by_value = sorted(
        leaderboard_items, key=lambda x: x.total_value, reverse=True
    )
    leaderboard_by_days = sorted(
        leaderboard_items, key=lambda x: x.completed_days, reverse=True
    )

    return schemas.ChallengeStats(
        completed_days=completed_days,
        missed_days=missed_days,
        points=points,
        leaderboard_by_value=leaderboard_by_value,
        leaderboard_by_days=leaderboard_by_days,
    )


@router.post("/{challenge_id}/nudge")
def send_nudge(
    challenge_id: int,
    to_user_id: int = Query(..., description="ID пользователя, которому отправляется nudge"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Nudge request: from_user={current_user.id}, to_user={to_user_id}, challenge={challenge_id}")
    
    if current_user.id == to_user_id:
        raise HTTPException(status_code=400, detail="cannot nudge self")

    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    sender = _require_participant(challenge_id, db, current_user)
    receiver = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=to_user_id)
        .first()
    )
    if not receiver:
        raise HTTPException(status_code=404, detail="target not participant")

    from datetime import datetime, timedelta as td

    today = date.today()

    # Нельзя пнуть того, кто уже выполнил цель сегодня
    target_today = (
        db.query(models.DailyProgress)
        .filter_by(
            challenge_id=challenge_id,
            user_id=to_user_id,
            date=today,
        )
        .first()
    )
    if target_today and target_today.completed:
        raise HTTPException(
            status_code=400,
            detail="already_completed_today",
        )

    # Нельзя пнуть того, кто менял прогресс в течение последнего часа
    last_progress = (
        db.query(models.DailyProgress)
        .filter_by(challenge_id=challenge_id, user_id=to_user_id)
        .filter(models.DailyProgress.updated_at.is_not(None))
        .order_by(models.DailyProgress.updated_at.desc())
        .first()
    )
    if last_progress and last_progress.updated_at:
        one_hour_ago = datetime.utcnow() - td(hours=1)
        utc_updated = last_progress.updated_at.replace(tzinfo=None) if last_progress.updated_at.tzinfo else last_progress.updated_at
        if utc_updated >= one_hour_ago:
            raise HTTPException(
                status_code=400,
                detail="recent_progress_update",
            )

    # Простой rate-limit: не чаще раза в час по паре from/to/challenge
    one_hour_ago = datetime.utcnow() - td(hours=1)
    recent = (
        db.query(models.Nudge)
        .filter(
            models.Nudge.challenge_id == challenge_id,
            models.Nudge.from_user_id == current_user.id,
            models.Nudge.to_user_id == to_user_id,
            models.Nudge.created_at >= one_hour_ago,
        )
        .first()
    )
    if recent:
        # Возвращаем время последнего nudge для отображения на фронте
        time_until_next = (recent.created_at + td(hours=1) - datetime.utcnow()).total_seconds()
        raise HTTPException(
            status_code=429, 
            detail=f"too many nudges. Next nudge available in {int(time_until_next / 60)} minutes"
        )

    nudge = models.Nudge(
        from_user_id=current_user.id,
        to_user_id=to_user_id,
        challenge_id=challenge_id,
    )
    db.add(nudge)
    db.commit()
    logger.info(f"Nudge saved to database: id={nudge.id}")

    try:
        telegram_bot.send_nudge_message(
            db=db,
            to_user_id=to_user_id,
            from_user_id=current_user.id,
            challenge_id=challenge_id,
        )
        logger.info(f"Telegram message sent successfully")
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        # Не падаем, если сообщение не отправилось - nudge уже сохранён

    return {
        "ok": True,
        "nudged_at": datetime.utcnow().isoformat(),
        "next_nudge_available_at": (datetime.utcnow() + td(hours=1)).isoformat(),
    }


@router.delete("/{challenge_id}/participants/{user_id}")
def remove_participant(
    challenge_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Исключить участника из челленджа. Только владелец. Нельзя исключить себя."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")
    owner = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=current_user.id)
        .first()
    )
    if not owner or owner.role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can remove participants")
    target = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=user_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Participant not found")
    db.query(models.Nudge).filter(
        models.Nudge.challenge_id == challenge_id,
        (models.Nudge.from_user_id == user_id) | (models.Nudge.to_user_id == user_id),
    ).delete(synchronize_session=False)
    db.query(models.DailyProgress).filter_by(
        challenge_id=challenge_id, user_id=user_id
    ).delete()
    db.delete(target)
    db.commit()
    return {"ok": True}


# Лимит сообщений в истории и макс. длина текста
CHAT_MESSAGE_MAX_LENGTH = 2000
CHAT_MESSAGES_LIMIT = 100


@router.get("/{challenge_id}/messages", response_model=List[schemas.ChallengeMessageOut])
def get_challenge_messages(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list:
    """История сообщений чата челленджа. Только участники. Сверху вниз: от новых к старым."""
    _require_participant(challenge_id, db, current_user)
    rows = (
        db.query(models.ChallengeMessage, models.User.display_name)
        .join(models.User, models.ChallengeMessage.user_id == models.User.id)
        .filter(models.ChallengeMessage.challenge_id == challenge_id)
        .order_by(models.ChallengeMessage.created_at.desc())
        .limit(CHAT_MESSAGES_LIMIT)
        .all()
    )
    result = []
    for msg, display_name in rows:
        utc_dt = msg.created_at
        if utc_dt.tzinfo is None:
            utc_dt = utc_dt.replace(tzinfo=ZoneInfo("UTC"))
        msk_dt = utc_dt.astimezone(ZoneInfo("Europe/Moscow"))
        result.append(
            schemas.ChallengeMessageOut(
                id=msg.id,
                challenge_id=msg.challenge_id,
                user_id=msg.user_id,
                display_name=display_name,
                text=msg.text[:CHAT_MESSAGE_MAX_LENGTH],
                created_at=msk_dt.isoformat(),
            )
        )
    return result


@router.post("/{challenge_id}/messages", response_model=schemas.ChallengeMessageOut)
def post_challenge_message(
    challenge_id: int,
    payload: schemas.ChallengeMessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ChallengeMessageOut:
    """Отправить сообщение в чат челленджа. Только участники."""
    _require_participant(challenge_id, db, current_user)
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")
    if len(text) > CHAT_MESSAGE_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Message too long (max {CHAT_MESSAGE_MAX_LENGTH} characters)",
        )
    msg = models.ChallengeMessage(
        challenge_id=challenge_id,
        user_id=current_user.id,
        text=text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    utc_dt = msg.created_at
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=ZoneInfo("UTC"))
    msk_dt = utc_dt.astimezone(ZoneInfo("Europe/Moscow"))
    return schemas.ChallengeMessageOut(
        id=msg.id,
        challenge_id=msg.challenge_id,
        user_id=msg.user_id,
        display_name=current_user.display_name,
        text=msg.text,
        created_at=msk_dt.isoformat(),
    )


@router.delete("/{challenge_id}")
def delete_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    ch = db.get(models.Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    # Проверяем, что текущий пользователь - владелец
    participation = (
        db.query(models.ChallengeParticipant)
        .filter_by(challenge_id=challenge_id, user_id=current_user.id)
        .first()
    )
    if not participation or participation.role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can delete challenge")

    # Удаляем связанные записи
    db.query(models.ChallengeMessage).filter_by(challenge_id=challenge_id).delete()
    db.query(models.Nudge).filter_by(challenge_id=challenge_id).delete()
    db.query(models.DailyProgress).filter_by(challenge_id=challenge_id).delete()
    db.query(models.ChallengeParticipant).filter_by(challenge_id=challenge_id).delete()
    db.delete(ch)
    db.commit()

    return {"ok": True}

