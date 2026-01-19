import React, { useEffect, useState } from "react";
import { ChallengesListPage } from "./ChallengesListPage";
import { ProfilePage } from "./ProfilePage";
import { ChallengePage } from "./ChallengePage";
import { ChallengeStatsPage } from "./ChallengeStatsPage";
import { api } from "../utils/api";
import type { AuthState, ChallengeShort, UserMe } from "../utils/types";

type Route =
  | { name: "challenges" }
  | { name: "profile" }
  | { name: "challenge"; id: number }
  | { name: "stats"; id: number }
  | { name: "invite"; challenge: ChallengeShort };

export const App: React.FC = () => {
  const [route, setRoute] = useState<Route>({ name: "challenges" });
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeShort[]>([]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    const init = async () => {
      try {
        const initData = tg?.initData ?? "";
        console.log("Telegram WebApp initialized", { hasInitData: !!initData });
        
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
          setRoute({ name: "invite", challenge: res.invite_challenge });
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
  }, []);

  const handleChallengeCreated = (challenge: ChallengeShort) => {
    setChallenges((prev) => [...prev, challenge]);
    setRoute({ name: "challenge", id: challenge.id });
  };

  const handleRouteBack = () => {
    setRoute({ name: "challenges" });
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
        challengeId={route.id}
        currentUserId={auth.user.id}
        onBack={handleRouteBack}
        onOpenStats={() => setRoute({ name: "stats", id: route.id })}
      />
    );
  } else if (route.name === "stats") {
    content = (
      <ChallengeStatsPage
        challengeId={route.id}
        onBack={() => setRoute({ name: "challenge", id: route.id })}
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
                  const detail = await api.joinChallenge(ch.id);
                  setChallenges((prev) =>
                    prev.some((c) => c.id === ch.id) ? prev : [...prev, ch]
                  );
                  setRoute({ name: "challenge", id: detail.id });
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

