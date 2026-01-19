import React from "react";
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
  onChallengesChange,
  onChallengeCreated,
}) => {
  const handleCreateClick = () => {
    const title = window.prompt("Название челленджа") || "";
    if (!title.trim()) return;
    const daily = Number(window.prompt("Дневная цель (число)") || "0") || 0;
    const unit = window.prompt("Единица измерения (отжимания, шаги…)", "отжимания") || "отжимания";
    const duration = Number(window.prompt("Длительность в днях", "30") || "30") || 30;

    const today = new Date().toISOString().slice(0, 10);

    void (async () => {
      const detail = await import("../utils/api").then((m) =>
        m.api.createChallenge({
          title,
          description: "",
          goal_type: "quantitative",
          daily_goal: daily,
          unit,
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
      };
      onChallengeCreated(short);
    })();
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

