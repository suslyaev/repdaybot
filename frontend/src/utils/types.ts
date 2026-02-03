export interface UserMe {
  id: number;
  telegram_id: number;
  username?: string | null;
  display_name: string;
  bot_chat_active: boolean;
  created_at: string;
  updated_at: string;
  is_superadmin?: boolean;
}

export interface AuthState {
  token: string;
  user: UserMe;
}

export interface ChallengeShort {
  id: number;
  title: string;
  description?: string | null;
  goal_type: string;
  unit: string;
  daily_goal?: number | null;
  duration_days: number;
  start_date: string;
  end_date: string;
  today_progress_value?: number | null;
  today_progress_percent?: number | null;
  days_completed?: number | null;
}

export interface ChallengeParticipant {
  id: number;
  display_name: string;
  today_value: number;
  today_completed: boolean;
  streak_current: number;
  /** Когда текущий пользователь последний раз пнул этого участника (ISO) */
  last_nudge_at?: string | null;
}

export interface ChallengeDetail {
  id: number;
  title: string;
  description?: string | null;
  goal_type: string;
  daily_goal?: number | null;
  unit: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  is_public: boolean;
  invite_code: string;
  participants: ChallengeParticipant[];
  is_owner: boolean;
  /** false — суперадмин смотрит челлендж без участия (только описание, команда, статистика) */
  is_participant?: boolean;
}

export interface ChallengeStats {
  completed_days: number;
  missed_days: number;
  points: { date: string; percent: number; value: number }[];
  leaderboard_by_value: LeaderboardItem[];
  leaderboard_by_days: LeaderboardItem[];
}

export interface LeaderboardItem {
  user_id: number;
  display_name: string;
  total_value: number;
  completed_days: number;
}

export interface ChallengeMessage {
  id: number;
  challenge_id: number;
  user_id: number;
  display_name: string;
  text: string;
  created_at: string; // ISO
}

