import React, { useState } from "react";
import type { UserMe } from "../utils/types";
import { api } from "../utils/api";

interface Props {
  user: UserMe;
  onUserChange: (user: UserMe) => void;
  onBack: () => void;
}

export const ProfilePage: React.FC<Props> = ({ user, onUserChange, onBack }) => {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile(displayName);
      onUserChange(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="topbar-button" onClick={onBack}>
          Назад
        </button>
        <div className="topbar-title">Профиль</div>
      </header>

      <main className="content">
        <label className="field">
          <span>Имя в челленджах</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <button className="primary-button" onClick={handleSave} disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>

        <div className="section">
          <div className="section-title">Оповещения</div>
          <p className="text">
            Чтобы ребятишки могли пинать вас и присылать напоминания, откройте
            чат с ботом RepDayBot.
          </p>
          <button
            className="secondary-button"
            onClick={() =>
              window.Telegram?.WebApp.openTelegramLink?.(
                "https://t.me/RepDayBot"
              )
            }
          >
            Открыть чат с ботом
          </button>
          <p className="text small">
            Статус:{" "}
            {user.bot_chat_active ? "оповещения доступны" : "нет связи с ботом"}
          </p>
        </div>
      </main>
    </div>
  );
};

