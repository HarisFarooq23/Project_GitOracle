const CLIENT_DEFAULT_FLASK_BASE_URL = "/flask";
const SERVER_DEFAULT_FLASK_BASE_URL = "http://127.0.0.1:5000";

const CLIENT_FLASK_BASE_URL =
  process.env.NEXT_PUBLIC_FLASK_API_BASE?.trim() || CLIENT_DEFAULT_FLASK_BASE_URL;
const SERVER_FLASK_BASE_URL =
  process.env.FLASK_API_BASE?.trim() || SERVER_DEFAULT_FLASK_BASE_URL;

type ApiRequestOptions = RequestInit & {
  path: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 2500;

export async function flaskRequest<T>({
  path,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ...init
}: ApiRequestOptions): Promise<T> {
  const baseUrl = typeof window === "undefined" ? SERVER_FLASK_BASE_URL : CLIENT_FLASK_BASE_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: init.cache ?? "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Flask request timed out after ${timeoutMs}ms: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    const combined = `${response.status} ${response.statusText} ${body}`.toLowerCase();
    const looksLikeProxyFailure =
      baseUrl.startsWith("/") &&
      response.status >= 500 &&
      combined.includes("internal server error");
    if (
      combined.includes("econnrefused") ||
      combined.includes("failed to proxy") ||
      combined.includes("connect error") ||
      looksLikeProxyFailure
    ) {
      throw new Error(
        "Flask backend is not running on http://127.0.0.1:5000. Start backend with `python app.py` from the `InternHub` folder."
      );
    }
    throw new Error(
      `Flask request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`
    );
  }

  return (await response.json()) as T;
}

export type UserActivityStartResponse = {
  activity_id: number;
  user_id: number;
  entered_webapp_at: string | null;
};

export type UserActivityDay = {
  date: string;
  weekday: string;
  minutes: number;
};

export type UserActivityStatsResponse = {
  days: UserActivityDay[];
  total_minutes: number;
};

export async function startUserActivitySession(
  userId: number,
  token: string | null
): Promise<UserActivityStartResponse> {
  return flaskRequest<UserActivityStartResponse>({
    path: `/api/user-activity/session/start?user_id=${userId}`,
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function endUserActivitySession(
  userId: number,
  activityId: number,
  token: string | null
): Promise<void> {
  await flaskRequest({
    path: `/api/user-activity/session/end?user_id=${userId}`,
    method: "POST",
    body: JSON.stringify({ user_id: userId, activity_id: activityId }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function getUserActivityStats(
  userId: number,
  token: string | null
): Promise<UserActivityStatsResponse> {
  return flaskRequest<UserActivityStatsResponse>({
    path: "/api/user-activity/stats",
    method: "POST",
    timeoutMs: 12_000,
    body: JSON.stringify({ user_id: userId }),
    headers: {
      "X-User-Id": String(userId),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
