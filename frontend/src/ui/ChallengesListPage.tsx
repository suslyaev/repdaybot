import React, { useState } from "react";
import type { ChallengeShort } from "../utils/types";

interface Props {
  challenges: ChallengeShort[];
  onOpenChallenge: (id: number) => void;
  onOpenProfile: () => void;
  onChallengesChange: (chs: ChallengeShort[]) => void;
  onChallengeCreated: (ch: ChallengeShort) => void;
}

export const ChallengesListPage: React.FC<Props> = ({
  challenges,
  onOpenChallenge,
  onOpenProfile,
  onChallengeCreated,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dailyGoal, setDailyGoal] = useState<string>("100");
  const [unit, setUnit] = useState("раз");
  const [durationDays, setDurationDays] = useState<string>("30");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDailyGoal("100");
    setUnit("раз");
    setDurationDays("30");
    setError(null);
  };

  const handleCreateSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Название обязательно");
      return;
    }

    const daily = Number(dailyGoal);
    if (!Number.isFinite(daily) || daily <= 0) {
      setError("Дневная цель должна быть положительным числом");
      return;
    }

    const duration = Number(durationDays);
    if (!Number.isFinite(duration) || duration <= 0) {
      setError("Длительность в днях должна быть положительным числом");
      return;
    }

    const trimmedUnit = unit.trim() || "раз";

    setError(null);
    setSubmitting(true);

    const today = new Date().toISOString().slice(0, 10);

    try {
      const detail = await import("../utils/api").then((m) =>
        m.api.createChallenge({
          title: trimmedTitle,
          description: description.trim() || undefined,
          goal_type: "quantitative",
          daily_goal: daily,
          unit: trimmedUnit,
          duration_days: duration,
          start_date: today,
          is_public: true,
        })
      );

      const short: ChallengeShort = {
        id: detail.id,
        title: detail.title,
        goal_type: detail.goal_type,
        unit: detail.unit,
        daily_goal: detail.daily_goal,
        duration_days: detail.duration_days,
        start_date: detail.start_date,
        end_date: detail.end_date,
        today_progress_value: 0,
        today_progress_percent: 0,
        days_completed: 0,
        description: detail.description ?? undefined,
      };

      onChallengeCreated(short);
      resetForm();
      setIsCreating(false);
    } catch (e) {
      console.error("Create challenge error", e);
      setError("Не удалось создать челлендж. Попробуйте еще раз.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateClick = () => {
    setIsCreating((prev) => !prev);
  };
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-title">RepDay</div>
        <button className="topbar-button" onClick={onOpenProfile}>
          Профиль
        </button>
      </header>

      <main className="content">
        {isCreating && (
          <section className="section">
            <div className="section-title">Новый челлендж</div>
            <div className="list">
              <div className="row">
                <div className="row-text">
                  <div className="row-title">Название</div>
                  <input
                    className="field"
                    placeholder="100 дней по 100 отжиманий"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="row">
                <div className="row-text">
                  <div className="row-title">Описание (необязательно)</div>
                  <textarea
                    className="field"
                    rows={2}
                    placeholder="Коротко, зачем этот челлендж"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <div className="row">
                <div className="row-text">
                  <div className="row-title">Дневная цель</div>
                  <input
                    className="field"
                    type="number"
                    inputMode="numeric"
                    pattern="\d*"
                    min={1}
                    value={dailyGoal}
                    onChange={(e) => setDailyGoal(e.target.value)}
                  />
                </div>
              </div>
              <div className="row">
                <div className="row-text">
                  <div className="row-title">Единицы</div>
                  <input
                    className="field"
                    placeholder="раз"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="row">
                <div className="row-text">
                  <div className="row-title">Длительность (дней)</div>
                  <input
                    className="field"
                    type="number"
                    inputMode="numeric"
                    pattern="\d*"
                    min={1}
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                  />
                </div>
              </div>
              {error && (
                <div className="text" style={{ color: "#ff6b6b" }}>
                  {error}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="primary-button"
                  style={{ flex: 2 }}
                  onClick={handleCreateSubmit}
                  disabled={submitting}
                >
                  Создать
                </button>
                <button
                  className="ghost-button"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setIsCreating(false);
                    resetForm();
                  }}
                  disabled={submitting}
                >
                  Отмена
                </button>
              </div>
            </div>
          </section>
        )}

        {challenges.length === 0 ? (
          <div className="empty">
            <div>Пока нет челленджей.</div>
            <div>Создайте первый и позовите сестренок.</div>
          </div>
        ) : (
          <div className="list">
            {challenges.map((ch) => {
              const value = ch.today_progress_value ?? 0;
              const goal = ch.daily_goal ?? 0;
              const percent =
                goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : null;

              return (
                <button
                  key={ch.id}
                  className="card"
                  onClick={() => onOpenChallenge(ch.id)}
                >
                  <div className="card-title">{ch.title}</div>
                  {ch.description && (
                    <div className="card-sub">{ch.description}</div>
                  )}
                  <div className="card-sub">
                    {ch.goal_type === "quantitative"
                      ? `Цель: ${goal} ${ch.unit} в день`
                      : ch.goal_type === "checkin"
                      ? "Ежедневный чек-ин"
                      : `Таймер: ${goal} ${ch.unit} в день`}
                  </div>
                  <div className="card-progress">
                    <span>
                      Сегодня: {value}
                      {goal ? ` / ${goal}` : ""}
                      {percent !== null ? ` (${percent}%)` : ""}
                    </span>
                    {ch.days_completed != null && (
                      <span className="days">
                        Дней выполнено: {ch.days_completed ?? 0}
                      </span>
                    )}
                  </div>
                  {percent !== null && (
                    <div className="progress">
                      <div
                        className="progress-inner"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>

      <footer className="bottombar">
        <button className="primary-button" onClick={handleCreateClick}>
          Новый челлендж
        </button>
      </footer>
    </div>
  );
};

