import type {
  AuthState,
  ChallengeDetail,
  ChallengeMessage,
  ChallengeShort,
  ChallengeStats,
  UserMe,
} from "./types";

const BASE_URL = import.meta.env.PROD ? "/api" : "http://localhost:8000";

let authState: AuthState | null = null;

function authHeader() {
  if (!authState) {
    console.warn("API: No auth state, request will fail");
    return {};
  }
  console.log("API: Using token:", authState.token.substring(0, 20) + "...", "user_id:", authState.user.id);
  return {
    Authorization: `Bearer ${authState.token}`,
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log("API request:", url, options.method || "GET");
  
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
        ...(options.headers || {}),
      },
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error("API error:", res.status, text);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    return (await res.json()) as T;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}

export const api = {
  setAuth(a: AuthState | null) {
    authState = a;
    if (a) {
      console.log("API: Auth set, user_id:", a.user.id, "token:", a.token.substring(0, 20) + "...");
    } else {
      console.log("API: Auth cleared");
    }
  },
  async authTelegram(initData: string) {
    if (!initData || initData.trim() === "") {
      throw new Error("initData пустой. Откройте приложение через Telegram бота.");
    }
    return request<{ token: string; user: UserMe; invite_challenge?: ChallengeShort }>(
      "/auth/telegram",
      {
        method: "POST",
        body: JSON.stringify({ init_data: initData }),
      }
    );
  },
  async getChallenges(): Promise<ChallengeShort[]> {
    return request<ChallengeShort[]>("/challenges");
  },
  async getChallengeDetail(id: number): Promise<ChallengeDetail> {
    return request<ChallengeDetail>(`/challenges/${id}`);
  },
  async updateProfile(display_name: string): Promise<UserMe> {
    return request<UserMe>("/me", {
      method: "PATCH",
      body: JSON.stringify({ display_name }),
    });
  },
  async createChallenge(data: {
    title: string;
    description?: string;
    goal_type: string;
    daily_goal?: number | null;
    unit: string;
    duration_days: number;
    start_date: string;
    is_public: boolean;
  }): Promise<ChallengeDetail> {
    return request<ChallengeDetail>("/challenges", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async joinChallenge(id: number): Promise<ChallengeDetail> {
    return request<ChallengeDetail>(`/challenges/${id}/join`, {
      method: "POST",
    });
  },
  async updateProgress(
    id: number,
    payload: { date: string; delta?: number; set_value?: number; completed?: boolean }
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/challenges/${id}/progress`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async getStats(id: number): Promise<ChallengeStats> {
    return request<ChallengeStats>(`/challenges/${id}/stats`);
  },
  async sendNudge(id: number, to_user_id: number): Promise<{ ok: boolean; nudged_at?: string; next_nudge_available_at?: string }> {
    const params = new URLSearchParams({ to_user_id: String(to_user_id) });
    return request<{ ok: boolean; nudged_at?: string; next_nudge_available_at?: string }>(`/challenges/${id}/nudge?${params.toString()}`, {
      method: "POST",
    });
  },
  async deleteChallenge(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/challenges/${id}`, {
      method: "DELETE",
    });
  },
  async removeParticipant(challengeId: number, userId: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/challenges/${challengeId}/participants/${userId}`, {
      method: "DELETE",
    });
  },
  async getChallengeMessages(challengeId: number): Promise<ChallengeMessage[]> {
    return request<ChallengeMessage[]>(`/challenges/${challengeId}/messages`);
  },
  async postChallengeMessage(challengeId: number, text: string): Promise<ChallengeMessage> {
    return request<ChallengeMessage>(`/challenges/${challengeId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
};

