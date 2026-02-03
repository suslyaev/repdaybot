import React, { useEffect, useMemo, useState } from "react";
import type { ChallengeDetail } from "../utils/types";
import { api } from "../utils/api";

interface Props {
  challengeId: number;
  currentUserId: number;
  onBack: () => void;
  onOpenStats: () => void;
  onOpenHistory?: () => void;
  onChallengeDeleted?: (id: number) => void;
  onProgressUpdated?: () => void;
}

export const ChallengePage: React.FC<Props> = ({
  challengeId,
  currentUserId,
  onBack,
  onOpenStats,
  onOpenHistory,
  onChallengeDeleted,
  onProgressUpdated,
}) => {
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");
  // Храним время последнего nudge для каждого пользователя: { userId: timestamp }
  const [nudgeTimestamps, setNudgeTimestamps] = useState<Record<number, number>>({});
  // Тик раз в минуту, чтобы обновлять отображаемый кулдаун и разблокировать кнопку по истечении часа
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Функция для обновления nudgeTimestamps из данных челленджа
  const updateNudgeTimestamps = (challengeData: ChallengeDetail) => {
    const timestamps: Record<number, number> = {};
    for (const p of challengeData.participants) {
      if (p.id !== currentUserId && p.last_nudge_at != null && p.last_nudge_at !== "") {
        try {
          const timestamp = new Date(p.last_nudge_at).getTime();
          if (!isNaN(timestamp) && timestamp > 0) {
            timestamps[p.id] = timestamp;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга даты
        }
      }
    }
    setNudgeTimestamps(timestamps);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getChallengeDetail(challengeId);
        setChallenge(data);
        // Инициализируем кулдаун пинков из ответа API, чтобы кнопка оставалась заблокированной после выхода/входа
        updateNudgeTimestamps(data);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [challengeId, currentUserId]);

  const me = useMemo(
    () => challenge?.participants.find((p) => p.id === currentUserId),
    [challenge, currentUserId]
  );

  const handleDelta = async (delta: number) => {
    if (!challenge) return;
    setUpdating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.updateProgress(challenge.id, { date: today, delta });
      const fresh = await api.getChallengeDetail(challenge.id);
      setChallenge(fresh);
      updateNudgeTimestamps(fresh); // Обновляем кулдаун пинков
      onProgressUpdated?.(); // Обновляем список челленджей
    } finally {
      setUpdating(false);
    }
  };

  const handleComplete = async () => {
    if (!challenge) return;
    setUpdating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (challenge.goal_type === "checkin") {
        const completed = !me?.today_completed;
        await api.updateProgress(challenge.id, {
          date: today,
          completed,
          set_value: completed ? 1 : 0,
        });
      } else if (challenge.daily_goal) {
        await api.updateProgress(challenge.id, {
          date: today,
          set_value: challenge.daily_goal,
        });
      }
      const fresh = await api.getChallengeDetail(challenge.id);
      setChallenge(fresh);
      updateNudgeTimestamps(fresh); // Обновляем кулдаун пинков
      onProgressUpdated?.(); // Обновляем список челленджей
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !challenge) {
    return (
      <div className="screen">
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          minHeight: "100vh",
          padding: "20px"
        }}>
          <div style={{ textAlign: "center" }}>Загрузка челленджа…</div>
        </div>
      </div>
    );
  }

  const todayPercent =
    challenge.goal_type === "quantitative" || challenge.goal_type === "time"
      ? challenge.daily_goal && me
        ? Math.min(100, Math.round((me.today_value / challenge.daily_goal) * 100))
        : 0
      : me?.today_completed
      ? 100
      : 0;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar-button" onClick={onBack}>
          Назад
        </button>
        <div className="topbar-title">{challenge.title}</div>
      </header>

      <main className="content">
        <section className="section">
          <div className="section-title">Мой прогресс сегодня</div>
          {challenge.goal_type === "quantitative" || challenge.goal_type === "time" ? (
            <>
              {challenge.daily_goal && (
                <p className="text small">
                  Цель: {challenge.daily_goal} {challenge.unit} в день
                </p>
              )}
              {challenge.daily_goal && me && (
                <p className="text small">
                  Сейчас: {me.today_value} / {challenge.daily_goal} (
                  {todayPercent}%)
                </p>
              )}
              <div className="progress" style={{ marginBottom: 12 }}>
                <div
                  className="progress-inner"
                  style={{ width: `${todayPercent}%` }}
                />
              </div>
              <div className="list">
                <div className="row">
                  <div className="row-text">
                    <div className="row-title">Быстрый ввод</div>
                    <div className="row-sub">Нажимайте по мере выполнения</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(5)}
                    disabled={updating}
                  >
                    +5
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(10)}
                    disabled={updating}
                  >
                    +10
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(25)}
                    disabled={updating}
                  >
                    +25
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(-5)}
                    disabled={updating}
                    style={{ color: "#ff6b6b" }}
                  >
                    -5
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(-10)}
                    disabled={updating}
                    style={{ color: "#ff6b6b" }}
                  >
                    -10
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(-25)}
                    disabled={updating}
                    style={{ color: "#ff6b6b" }}
                  >
                    -25
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void handleComplete()}
                    disabled={updating}
                  >
                    Выполнил цель
                  </button>
                  {showCustomInput ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder="Введите значение"
                        autoFocus
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: "10px",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          background: "rgba(10, 12, 18, 0.9)",
                          color: "inherit",
                          fontSize: "16px",
                        }}
                      />
                      <button
                        className="ghost-button"
                        onClick={async () => {
                          const v = Number(customValue);
                          if (Number.isNaN(v) || v < 0) {
                            alert("Введите корректное число (0 или больше)");
                            return;
                          }
                          setUpdating(true);
                          try {
                            await api.updateProgress(challenge.id, {
                              date: new Date().toISOString().slice(0, 10),
                              set_value: v,
                            });
                            const fresh = await api.getChallengeDetail(challenge.id);
                            setChallenge(fresh);
                            updateNudgeTimestamps(fresh); // Обновляем кулдаун пинков
                            onProgressUpdated?.();
                            setShowCustomInput(false);
                            setCustomValue("");
                          } finally {
                            setUpdating(false);
                          }
                        }}
                        disabled={updating}
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                      >
                        Сохранить
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => {
                          setShowCustomInput(false);
                          setCustomValue("");
                        }}
                        disabled={updating}
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setShowCustomInput(true);
                        setCustomValue(String(me?.today_value || 0));
                      }}
                      disabled={updating}
                    >
                      Свое значение
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="list">
              <p className="text small">
                {me?.today_completed ? "Сегодня уже отмечено ✔" : "Сегодня ещё не отмечали"}
              </p>
              <div className="progress" style={{ marginBottom: 12 }}>
                <div
                  className="progress-inner"
                  style={{ width: `${todayPercent}%` }}
                />
              </div>
              <button
                className="primary-button"
                onClick={() => void handleComplete()}
                disabled={updating}
              >
                {me?.today_completed ? "Снять отметку" : "Отметить выполнение"}
              </button>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-title">Описание</div>
          <p className="text">{challenge.description || "Без описания"}</p>
          <p className="text small">
            Длительность: {challenge.duration_days} дней
          </p>
        </section>

        <section className="section">
          <div className="section-title">Команда</div>
          <div className="list">
            {challenge.participants.map((p) => (
              <div key={p.id} className="row">
                <div className="row-main">
                  <div className="avatar">
                    {p.display_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="row-text">
                    <div className="row-title">{p.display_name}</div>
                    <div className="row-sub">
                      Сегодня: {p.today_value}{" "}
                      {p.today_completed ? "(выполнил)" : ""}
                    </div>
                  </div>
                </div>
                {p.id !== currentUserId && (() => {
                  // Используем tick для пересчёта кулдауна при каждом обновлении (каждую минуту)
                  const _ = tick;
                  const lastNudgeTime = nudgeTimestamps[p.id];
                  const oneHourInMs = 60 * 60 * 1000;
                  const canNudge = !lastNudgeTime || (Date.now() - lastNudgeTime) >= oneHourInMs;
                  const minutesUntilNext = lastNudgeTime 
                    ? Math.ceil((oneHourInMs - (Date.now() - lastNudgeTime)) / 60000)
                    : 0;

                  return (
                    <button
                      className="ghost-button"
                      onClick={async () => {
                        if (!canNudge) {
                          window.Telegram?.WebApp.showAlert?.(
                            `Можно пнуть не чаще раза в час. Попробуйте через ${minutesUntilNext} мин.`
                          );
                          return;
                        }

                        try {
                          const result = await api.sendNudge(challenge.id, p.id);
                          // Обновляем челлендж, чтобы получить актуальные данные включая last_nudge_at
                          const fresh = await api.getChallengeDetail(challenge.id);
                          setChallenge(fresh);
                          updateNudgeTimestamps(fresh); // Обновляем кулдаун пинков из ответа API
                          
                          // Показываем уведомление через Telegram WebApp
                          window.Telegram?.WebApp.showAlert?.(
                            `Вы пнули ${p.display_name}! 💪`,
                            () => {
                              // Callback после закрытия уведомления (опционально)
                            }
                          );
                        } catch (e) {
                          const errorMsg = e instanceof Error ? e.message : "Не удалось отправить";
                          if (errorMsg.includes("429")) {
                            const match = errorMsg.match(/(\d+)\s+minutes/);
                            const minutes = match ? match[1] : "60";
                            window.Telegram?.WebApp.showAlert?.(
                              `Слишком часто! Можно пнуть не чаще раза в час. Попробуйте через ${minutes} мин.`
                            );
                          } else {
                            window.Telegram?.WebApp.showAlert?.(`Ошибка: ${errorMsg}`) || 
                            alert(`Ошибка: ${errorMsg}`);
                          }
                        }
                      }}
                      disabled={!canNudge || updating}
                      style={{
                        opacity: canNudge ? 1 : 0.5,
                        cursor: canNudge ? "pointer" : "not-allowed",
                      }}
                      title={!canNudge ? `Можно пнуть через ${minutesUntilNext} мин.` : undefined}
                    >
                      {canNudge ? "Пнуть" : `Через ${minutesUntilNext}м`}
                    </button>
                  );
                })()}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bottombar">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="secondary-button"
            style={{ flex: 1 }}
            onClick={onOpenStats}
          >
            Статистика
          </button>
          {onOpenHistory && (
            <button
              className="secondary-button"
              style={{ flex: 1 }}
              onClick={onOpenHistory}
            >
              История
            </button>
          )}
          <button
            className="primary-button"
            style={{ flex: onOpenHistory ? 1 : 2 }}
            onClick={() => {
              const deepLink = `https://t.me/repdaybot/repday?startapp=${challenge.invite_code}`;
              const text = `Присоединяйтесь к нашему челленджу \"${challenge.title}\" в RepDay`;
              const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
                deepLink
              )}&text=${encodeURIComponent(text)}`;
              window.Telegram?.WebApp.openTelegramLink?.(shareUrl);
            }}
          >
            Поделиться
          </button>
        </div>
        {challenge.is_owner && (
          <button
            className="ghost-button"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => {
              if (
                window.confirm(
                  "Удалить челлендж? Это действие нельзя отменить."
                )
              ) {
                void api
                  .deleteChallenge(challenge.id)
                  .then(() => {
                    onChallengeDeleted?.(challenge.id);
                    onBack();
                  })
                  .catch((e) => {
                    console.error("Delete challenge error", e);
                    alert("Не удалось удалить челлендж");
                  });
              }
            }}
          >
            Удалить челлендж
          </button>
        )}
      </footer>
    </div>
  );
};

