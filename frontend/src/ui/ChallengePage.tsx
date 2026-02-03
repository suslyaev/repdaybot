import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChallengeDetail, ChallengeMessage, ChallengeParticipant } from "../utils/types";
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
  const [nudgeTimestamps, setNudgeTimestamps] = useState<Record<number, number>>({});
  // Чат: по умолчанию свёрнут
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChallengeMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sendMessageLoading, setSendMessageLoading] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Тик раз в минуту, чтобы обновлять отображаемый кулдаун и разблокировать кнопку по истечении часа
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Локальные метки времени пинка только для мгновенной блокировки после нажатия (до перезапроса)
  const updateNudgeTimestamps = (challengeData: ChallengeDetail) => {
    setNudgeTimestamps((prev) => {
      const updated = { ...prev };
      for (const p of challengeData.participants) {
        if (p.id !== currentUserId && p.last_nudge_at) {
          const apiTs = new Date(p.last_nudge_at).getTime();
          if (!isNaN(apiTs) && apiTs > 0) {
            if (!prev[p.id] || apiTs >= prev[p.id]) updated[p.id] = apiTs;
          }
        }
      }
      return updated;
    });
  };

  // Эффективное время последнего пинка: из API (participant.last_nudge_at) или локальное (после только что пинка)
  const getLastNudgeTime = (p: ChallengeParticipant): number | undefined => {
    const local = nudgeTimestamps[p.id];
    // Берём из API: поддержка и snake_case и camelCase на случай разной сериализации
    const lastNudgeAtRaw = p.last_nudge_at ?? (p as Record<string, unknown>).lastNudgeAt;
    const fromApi =
      lastNudgeAtRaw != null && lastNudgeAtRaw !== ""
        ? new Date(String(lastNudgeAtRaw)).getTime()
        : undefined;
    const fromApiValid =
      fromApi !== undefined && !Number.isNaN(fromApi) && fromApi > 0 ? fromApi : undefined;
    
    // Используем более новое значение: локальное (если только что пнули) или из API
    if (local && fromApiValid !== undefined) {
      return Math.max(local, fromApiValid);
    }
    return local ?? fromApiValid;
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

  // Подгрузка сообщений чата при раскрытии блока или смене челленджа
  useEffect(() => {
    if (!chatOpen || !challenge?.id) return;
    setMessagesLoading(true);
    api
      .getChallengeMessages(challenge.id)
      .then((list) => setMessages(list))
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [chatOpen, challenge?.id]);

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

      <main
        className="content"
        style={{
          paddingBottom: chatOpen ? 200 : undefined,
        }}
      >
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

        <section className="section" style={{ paddingBottom: 24 }}>
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
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {p.id !== currentUserId && (() => {
                    const _ = tick;
                    const alreadyCompletedToday = p.today_completed;
                    const lastNudgeTime = getLastNudgeTime(p);
                    const oneHourInMs = 60 * 60 * 1000;
                    const now = Date.now();
                    const timeSinceNudge = lastNudgeTime ? now - lastNudgeTime : Infinity;
                    const cooldownPassed = !lastNudgeTime || timeSinceNudge >= oneHourInMs;
                    const canNudge = !alreadyCompletedToday && cooldownPassed;
                    const minutesUntilNext = lastNudgeTime && timeSinceNudge < oneHourInMs
                      ? Math.max(1, Math.ceil((oneHourInMs - timeSinceNudge) / 60000))
                      : 0;

                    const buttonText = alreadyCompletedToday
                      ? "Завтра"
                      : cooldownPassed
                        ? "Пнуть"
                        : `Через ${minutesUntilNext}м`;

                    return (
                      <button
                        className="ghost-button"
                        onClick={async () => {
                          if (alreadyCompletedToday) return;
                          if (!cooldownPassed) {
                            window.Telegram?.WebApp.showAlert?.(
                              `Можно пнуть не чаще раза в час. Попробуйте через ${minutesUntilNext} мин.`
                            );
                            return;
                          }
                          try {
                            await api.sendNudge(challenge.id, p.id);
                            setNudgeTimestamps((prev) => ({ ...prev, [p.id]: Date.now() }));
                            const fresh = await api.getChallengeDetail(challenge.id);
                            setChallenge(fresh);
                            updateNudgeTimestamps(fresh);
                            window.Telegram?.WebApp.showAlert?.(`Вы пнули ${p.display_name}! 💪`);
                          } catch (e) {
                            const errorMsg = e instanceof Error ? e.message : "";
                            if (errorMsg.includes("429")) {
                              const match = errorMsg.match(/(\d+)\s+minutes/);
                              const minutes = match ? match[1] : "60";
                              window.Telegram?.WebApp.showAlert?.(
                                `Слишком часто! Можно пнуть не чаще раза в час. Попробуйте через ${minutes} мин.`
                              );
                            } else if (errorMsg.includes("recent_progress_update")) {
                              window.Telegram?.WebApp.showAlert?.(
                                "Себя пни и выполняй челлендж"
                              ) || alert("Себя пни и выполняй челлендж");
                            } else if (errorMsg.includes("already_completed_today")) {
                              window.Telegram?.WebApp.showAlert?.(
                                "Он уже выполнил цель сегодня"
                              ) || alert("Он уже выполнил цель сегодня");
                            } else {
                              window.Telegram?.WebApp.showAlert?.(`Ошибка: ${errorMsg}`) || alert(`Ошибка: ${errorMsg}`);
                            }
                          }
                        }}
                        disabled={!canNudge || updating}
                        style={{
                          opacity: canNudge ? 1 : 0.5,
                          cursor: canNudge ? "pointer" : "not-allowed",
                        }}
                        title={
                          alreadyCompletedToday
                            ? "Уже выполнил сегодня"
                            : !cooldownPassed
                              ? `Можно пнуть через ${minutesUntilNext} мин.`
                              : undefined
                        }
                      >
                        {buttonText}
                      </button>
                    );
                  })()}
                  {challenge.is_owner && p.id !== currentUserId && (
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ color: "var(--danger, #e53935)", fontSize: "12px" }}
                      disabled={updating}
                      onClick={async () => {
                        if (!window.confirm(`Исключить ${p.display_name} из челленджа?`)) return;
                        setUpdating(true);
                        try {
                          await api.removeParticipant(challenge.id, p.id);
                          const fresh = await api.getChallengeDetail(challenge.id);
                          setChallenge(fresh);
                          updateNudgeTimestamps(fresh);
                          onProgressUpdated?.();
                        } catch (e) {
                          window.Telegram?.WebApp.showAlert?.(`Ошибка: ${e instanceof Error ? e.message : "Не удалось исключить"}`) ||
                            alert("Не удалось исключить");
                        } finally {
                          setUpdating(false);
                        }
                      }}
                    >
                      х
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Чат челленджа: сворачиваемый блок */}
        <section
          className="section"
          style={{
            paddingBottom: chatOpen ? 140 : 24,
          }}
        >
          <button
            type="button"
            className="ghost-button"
            style={{ width: "100%", marginBottom: chatOpen ? 12 : 0 }}
            onClick={() => setChatOpen((open) => !open)}
          >
            {chatOpen ? "Скрыть сообщения" : "Показать сообщения"}
          </button>
          {chatOpen && (
            <>
              {/* Поле ввода и кнопка — выше списка сообщений */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
                <input
                  ref={chatInputRef}
                  type="text"
                  placeholder="Сообщение…"
                  maxLength={2000}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onFocus={() => {
                    setTimeout(() => {
                      chatInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 100);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (chatInput.trim()) {
                        setSendMessageLoading(true);
                        api
                          .postChallengeMessage(challenge.id, chatInput.trim())
                          .then((newMsg) => {
                            setMessages((prev) => [newMsg, ...prev]);
                            setChatInput("");
                          })
                          .finally(() => setSendMessageLoading(false));
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(10,12,18,0.9)",
                    color: "#f5f6ff",
                    fontSize: 16,
                  }}
                />
                <button
                  type="button"
                  className="primary-button"
                  disabled={!chatInput.trim() || sendMessageLoading}
                  onClick={() => {
                    if (!chatInput.trim()) return;
                    setSendMessageLoading(true);
                    api
                      .postChallengeMessage(challenge.id, chatInput.trim())
                      .then((newMsg) => {
                        setMessages((prev) => [newMsg, ...prev]);
                        setChatInput("");
                      })
                      .finally(() => setSendMessageLoading(false));
                  }}
                >
                  Отправить
                </button>
              </div>
              <div
                style={{
                  maxHeight: 280,
                  overflowY: "auto",
                  padding: "8px 0",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.2)",
                }}
              >
                {messagesLoading ? (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--text-secondary)" }}>
                    Загрузка…
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--text-secondary)" }}>
                    Пока нет сообщений
                  </div>
                ) : (
                  messages.map((m) => {
                    const d = new Date(m.created_at);
                    const dateStr = d.toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    });
                    const timeStr = d.toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                          padding: "8px 12px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          className="avatar"
                          style={{
                            width: 22,
                            height: 22,
                            fontSize: 11,
                            flexShrink: 0,
                          }}
                        >
                          {m.display_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                            {m.display_name} · {dateStr} {timeStr}
                          </div>
                          <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#e8eaf6" }}>
                            {m.text.length > 2000 ? m.text.slice(0, 2000) + "…" : m.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
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

