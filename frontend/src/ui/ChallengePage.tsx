import React, { useEffect, useMemo, useState } from "react";
import type { ChallengeDetail } from "../utils/types";
import { api } from "../utils/api";

interface Props {
  challengeId: number;
  currentUserId: number;
  onBack: () => void;
  onOpenStats: () => void;
}

export const ChallengePage: React.FC<Props> = ({
  challengeId,
  currentUserId,
  onBack,
  onOpenStats,
}) => {
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getChallengeDetail(challengeId);
        setChallenge(data);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [challengeId]);

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
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !challenge) {
    return <div className="screen">Загрузка челленджа…</div>;
  }

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
              <div className="list">
                <div className="row">
                  <div className="row-text">
                    <div className="row-title">Быстрый ввод</div>
                    <div className="row-sub">Нажимайте по мере выполнения</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(10)}
                    disabled={updating}
                  >
                    +10
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(20)}
                    disabled={updating}
                  >
                    +20
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleDelta(50)}
                    disabled={updating}
                  >
                    +50
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void handleComplete()}
                    disabled={updating}
                  >
                    Выполнил цель
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="list">
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
                <button
                  className="ghost-button"
                  onClick={() => void api.sendNudge(challenge.id, p.id)}
                  disabled={p.id === currentUserId}
                >
                  Пнуть
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bottombar">
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="secondary-button"
            style={{ flex: 1 }}
            onClick={onOpenStats}
          >
            Статистика
          </button>
          <button
            className="primary-button"
            style={{ flex: 2 }}
            onClick={() => {
              const link = `https://t.me/RepDayBot?startapp=${challenge.invite_code}`;
              window.Telegram?.WebApp.openTelegramLink?.(link);
            }}
          >
            Поделиться челленджем
          </button>
        </div>
      </footer>
    </div>
  );
};

