import React, { useEffect, useState } from "react";
import type { ChallengeStats } from "../utils/types";
import { api } from "../utils/api";

interface Props {
  challengeId: number;
  onBack: () => void;
}

export const ChallengeStatsPage: React.FC<Props> = ({ challengeId, onBack }) => {
  const [stats, setStats] = useState<ChallengeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getStats(challengeId);
        setStats(data);
        setError(null);
      } catch (e) {
        console.error("Stats load error:", e);
        setError("Не удалось загрузить статистику. Попробуйте позже.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [challengeId]);

  if (loading) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="topbar-button" onClick={onBack}>
            Назад
          </button>
          <div className="topbar-title">Статистика</div>
        </header>
        <main className="content">
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            minHeight: "50vh",
            padding: "20px"
          }}>
            <div style={{ textAlign: "center" }}>Статистика загружается…</div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="topbar-button" onClick={onBack}>
            Назад
          </button>
          <div className="topbar-title">Статистика</div>
        </header>
        <main className="content">
          <p className="text">{error}</p>
        </main>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="topbar-button" onClick={onBack}>
            Назад
          </button>
          <div className="topbar-title">Статистика</div>
        </header>
        <main className="content">
          <p className="text">Пока нет данных для статистики.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar-button" onClick={onBack}>
          Назад
        </button>
        <div className="topbar-title">Статистика</div>
      </header>
      <main className="content">
        <section className="section">
          <div className="section-title">Дни</div>
          <p className="text">
            Выполнено дней: {stats.completed_days}, пропущено: {stats.missed_days}
          </p>
        </section>

        <section className="section">
          <div className="section-title">Динамика</div>
          <div className="list">
            {stats.points.map((p) => (
              <div key={p.date} className="row">
                <div className="row-text">
                  <div className="row-title">{p.date}</div>
                  <div className="row-sub">{Math.round(p.percent)}%</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Лидерборд по объёму</div>
          <div className="list">
            {stats.leaderboard_by_value.map((i) => (
              <div key={i.user_id} className="row">
                <div className="row-text">
                  <div className="row-title">{i.display_name}</div>
                  <div className="row-sub">Всего: {i.total_value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Лидерборд по выполненным дням</div>
          <div className="list">
            {stats.leaderboard_by_days.map((i) => (
              <div key={i.user_id} className="row">
                <div className="row-text">
                  <div className="row-title">{i.display_name}</div>
                  <div className="row-sub">Дней с выполнением: {i.completed_days}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

