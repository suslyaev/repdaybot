import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import type { ChallengeStats } from "../utils/types";

interface Props {
  challengeId: number;
  onBack: () => void;
  onProgressUpdated?: () => void;
}

export const ChallengeHistoryPage: React.FC<Props> = ({
  challengeId,
  onBack,
  onProgressUpdated,
}) => {
  const [stats, setStats] = useState<ChallengeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getStats(challengeId);
        setStats(data);
      } catch (e) {
        console.error("Load stats error", e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [challengeId]);

  const handleEdit = (date: string, currentValue: number) => {
    setEditingDate(date);
    setEditingValue(String(currentValue));
  };

  const handleSave = async () => {
    if (!editingDate || !stats) return;
    const value = Number(editingValue);
    if (Number.isNaN(value) || value < 0) {
      alert("Введите корректное число (0 или больше)");
      return;
    }

    setUpdating(true);
    try {
      await api.updateProgress(challengeId, {
        date: editingDate,
        set_value: value,
      });
      // Перезагружаем статистику
      const fresh = await api.getStats(challengeId);
      setStats(fresh);
      setEditingDate(null);
      setEditingValue("");
      onProgressUpdated?.();
    } catch (e) {
      console.error("Update progress error", e);
      alert("Не удалось обновить прогресс");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditingDate(null);
    setEditingValue("");
  };

  if (loading || !stats) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="topbar-button" onClick={onBack}>
            Назад
          </button>
          <div className="topbar-title">История</div>
        </header>
        <main className="content">
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            minHeight: "50vh",
            padding: "20px"
          }}>
            <div style={{ textAlign: "center" }}>Загрузка…</div>
          </div>
        </main>
      </div>
    );
  }

  // Сортируем точки по дате (от новых к старым)
  const sortedPoints = [...stats.points].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar-button" onClick={onBack}>
          Назад
        </button>
        <div className="topbar-title">История</div>
      </header>

      <main className="content">
        <section className="section">
          <div className="section-title">Прогресс по дням</div>
          <div className="list">
            {sortedPoints.map((point) => {
              const isToday = point.date === today;
              const isPast = new Date(point.date) < new Date(today);
              const isEditing = editingDate === point.date;

              return (
                <div key={point.date} className="row">
                  <div className="row-main">
                    <div className="row-text">
                      <div className="row-title">
                        {point.date}
                        {isToday && " (сегодня)"}
                        {isPast && !isToday && " (прошлое)"}
                      </div>
                      <div className="row-sub">
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "6px",
                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                background: "rgba(10, 12, 18, 0.9)",
                                color: "inherit",
                                width: "80px",
                                fontSize: "16px", /* Предотвращает zoom на iOS */
                              }}
                              autoFocus
                            />
                            <button
                              className="ghost-button"
                              onClick={handleSave}
                              disabled={updating}
                              style={{ fontSize: "11px", padding: "4px 8px" }}
                            >
                              Сохранить
                            </button>
                            <button
                              className="ghost-button"
                              onClick={handleCancel}
                              disabled={updating}
                              style={{ fontSize: "11px", padding: "4px 8px" }}
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <>
                            Значение: {point.value} ({Math.round(point.percent)}%)
                            {point.percent >= 100 && " ✓"}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isEditing && (
                    <button
                      className="ghost-button"
                      onClick={() => {
                        handleEdit(point.date, point.value);
                      }}
                      style={{ fontSize: "11px", padding: "4px 8px" }}
                    >
                      Изменить
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};
