import React, { useEffect, useState } from "react";
import { ChallengesListPage } from "./ChallengesListPage";
import { ProfilePage } from "./ProfilePage";
import { ChallengePage } from "./ChallengePage";
import { ChallengeStatsPage } from "./ChallengeStatsPage";
import { ChallengeHistoryPage } from "./ChallengeHistoryPage";
import { api } from "../utils/api";
import type { AuthState, ChallengeShort, UserMe } from "../utils/types";

type Route =
  | { name: "challenges" }
  | { name: "profile" }
  | { name: "challenge"; id: number }
  | { name: "stats"; id: number }
  | { name: "history"; id: number }
  | { name: "invite"; challenge: ChallengeShort };

export const App: React.FC = () => {
  const [route, setRoute] = useState<Route>({ name: "challenges" });
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeShort[]>([]);
  const [challengeRefreshKey, setChallengeRefreshKey] = useState(0);

  useEffect(() => {
    // Ждем загрузки Telegram WebApp SDK
    const waitForTelegram = () => {
      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        // Устанавливаем тему
        tg.setHeaderColor("#0f1115");
        tg.setBackgroundColor("#0f1115");

        const init = async () => {
          try {
            const initData = tg.initData || "";
            console.log("Telegram WebApp initialized", { 
              hasInitData: !!initData,
              initDataLength: initData.length,
              hasUser: !!tg.initDataUnsafe?.user
            });
            
            if (!initData) {
              throw new Error("initData не получен. Откройте приложение через Telegram бота.");
            }
            
            const res = await api.authTelegram(initData);
            console.log("Auth response:", res);
        
        const authData: AuthState = {
          token: res.token,
          user: res.user,
        };
        api.setAuth(authData);
        setAuth(authData);

        const chs = await api.getChallenges();
        console.log("Challenges loaded:", chs.length);
        setChallenges(chs);

        if (res.invite_challenge) {
          // Проверяем, является ли пользователь уже участником
          const isAlreadyParticipant = chs.some((c) => c.id === res.invite_challenge!.id);
          if (isAlreadyParticipant) {
            // Если уже участник - просто открываем челлендж
            setRoute({ name: "challenge", id: res.invite_challenge.id });
          } else {
            // Если не участник - показываем экран приглашения
            setRoute({ name: "invite", challenge: res.invite_challenge });
          }
        }
          } catch (error) {
            console.error("Init error:", error);
            setError(error instanceof Error ? error.message : "Ошибка загрузки");
            setLoading(false);
          } finally {
            setLoading(false);
          }
        };

        void init();
      } else {
        // Если SDK не загрузился за 2 секунды, пробуем без него (dev режим)
        setTimeout(() => {
          if (!window.Telegram?.WebApp) {
            console.warn("Telegram WebApp SDK не загружен. Работаем в dev режиме.");
            setError("Откройте приложение через Telegram бота для корректной работы.");
            setLoading(false);
          }
        }, 2000);
      }
    };

    // Проверяем сразу и через небольшую задержку
    waitForTelegram();
    const timeout = setTimeout(waitForTelegram, 100);
    
    return () => clearTimeout(timeout);
  }, []);

  const handleChallengeCreated = (challenge: ChallengeShort) => {
    setChallenges((prev) => [...prev, challenge]);
    setRoute({ name: "challenge", id: challenge.id });
  };

  const handleChallengeDeleted = async (id: number) => {
    // Удаляем из списка и перезагружаем список с сервера
    setChallenges((prev) => prev.filter((ch) => ch.id !== id));
    try {
      const fresh = await api.getChallenges();
      setChallenges(fresh);
    } catch (e) {
      console.error("Failed to reload challenges", e);
    }
  };

  const handleRouteBack = () => {
    setRoute({ name: "challenges" });
  };

  const handleProgressUpdated = async () => {
    // Обновляем список челленджей после изменения прогресса
    try {
      const fresh = await api.getChallenges();
      setChallenges(fresh);
    } catch (e) {
      console.error("Failed to reload challenges after progress update", e);
    }
  };

  if (loading) {
    return (
      <div className="screen">
        <div style={{ padding: "20px", textAlign: "center" }}>
          Загрузка…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <div style={{ padding: "20px", textAlign: "center", color: "#ff6b6b" }}>
          <div style={{ marginBottom: "10px", fontWeight: "bold" }}>Ошибка</div>
          <div style={{ fontSize: "14px", marginBottom: "20px" }}>{error}</div>
          <button
            className="primary-button"
            onClick={() => {
              setError(null);
              setLoading(true);
              window.location.reload();
            }}
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="screen">
        <div style={{ padding: "20px", textAlign: "center" }}>
          Ошибка авторизации
        </div>
      </div>
    );
  }

  let content: React.ReactNode = null;

  if (route.name === "profile") {
    content = (
      <ProfilePage
        user={auth.user as UserMe}
        onUserChange={(user) => setAuth((a) => (a ? { ...a, user } : a))}
        onBack={handleRouteBack}
      />
    );
  } else if (route.name === "challenge") {
    content = (
      <ChallengePage
        key={`challenge-${route.id}-${challengeRefreshKey}`}
        challengeId={route.id}
        currentUserId={auth.user.id}
        onBack={handleRouteBack}
        onOpenStats={() => setRoute({ name: "stats", id: route.id })}
        onOpenHistory={() => setRoute({ name: "history", id: route.id })}
        onChallengeDeleted={handleChallengeDeleted}
        onProgressUpdated={handleProgressUpdated}
      />
    );
  } else if (route.name === "stats") {
    content = (
      <ChallengeStatsPage
        challengeId={route.id}
        onBack={() => setRoute({ name: "challenge", id: route.id })}
      />
    );
  } else if (route.name === "history") {
    content = (
      <ChallengeHistoryPage
        challengeId={route.id}
        onBack={() => setRoute({ name: "challenge", id: route.id })}
        onProgressUpdated={handleProgressUpdated}
      />
    );
  } else {
    // challenges / invite
    if (route.name === "invite") {
      const ch = route.challenge;
      content = (
        <div className="screen">
          <header className="topbar">
            <button className="topbar-button" onClick={handleRouteBack}>
              Назад
            </button>
            <div className="topbar-title">Приглашение</div>
          </header>
          <main className="content">
            <div className="section">
              <div className="section-title">{ch.title}</div>
              <p className="text">
                Вас пригласили в челлендж. Присоединяйтесь и давайте жечь вместе.
              </p>
              <button
                className="primary-button"
                onClick={async () => {
                  try {
                    const detail = await api.joinChallenge(ch.id);
                    // Обновляем список челленджей
                    const freshChallenges = await api.getChallenges();
                    setChallenges(freshChallenges);
                    // Принудительно обновляем ChallengePage
                    setChallengeRefreshKey((prev) => prev + 1);
                    // Переходим на страницу челленджа
                    setRoute({ name: "challenge", id: detail.id });
                  } catch (e) {
                    console.error("Join challenge error", e);
                    alert("Не удалось присоединиться к челленджу");
                  }
                }}
              >
                Присоединиться
              </button>
            </div>
          </main>
        </div>
      );
    } else {
    content = (
      <ChallengesListPage
        challenges={challenges}
        onOpenChallenge={(id) => setRoute({ name: "challenge", id })}
        onOpenProfile={() => setRoute({ name: "profile" })}
        onChallengesChange={setChallenges}
        onChallengeCreated={handleChallengeCreated}
      />
    );
    }
  }

  return <div className="app">{content}</div>;
};

