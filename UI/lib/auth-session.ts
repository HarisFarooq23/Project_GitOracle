"use client";

const USER_ID_KEY = "internhub_user_id";
const AUTH_TOKEN_KEY = "internhub_auth_token";
const USER_ROLE_KEY = "internhub_user_role";
const USERNAME_KEY = "internhub_username";
const USER_EMAIL_KEY = "internhub_user_email";

export function getSessionUserId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const legacy = window.localStorage.getItem(USER_ID_KEY);
  if (legacy) {
    window.localStorage.removeItem(USER_ID_KEY);
  }
  const stored = window.sessionStorage.getItem(USER_ID_KEY);
  if (!stored) {
    return null;
  }

  const parsed = Number.parseInt(stored, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function setSessionUserId(userId: number): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(USER_ID_KEY);
  window.sessionStorage.setItem(USER_ID_KEY, String(userId));
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const legacy = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (legacy) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setSessionToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getSessionRole(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const legacy = window.localStorage.getItem(USER_ROLE_KEY);
  if (legacy) {
    window.localStorage.removeItem(USER_ROLE_KEY);
  }
  return window.sessionStorage.getItem(USER_ROLE_KEY);
}

export function setSessionRole(role: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(USER_ROLE_KEY);
  window.sessionStorage.setItem(USER_ROLE_KEY, role);
}

export function getSessionUsername(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const legacy = window.localStorage.getItem(USERNAME_KEY);
  if (legacy) {
    window.localStorage.removeItem(USERNAME_KEY);
  }
  return window.sessionStorage.getItem(USERNAME_KEY);
}

export function setSessionUsername(username: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(USERNAME_KEY);
  window.sessionStorage.setItem(USERNAME_KEY, username);
}

export function getSessionEmail(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const legacy = window.localStorage.getItem(USER_EMAIL_KEY);
  if (legacy) {
    window.localStorage.removeItem(USER_EMAIL_KEY);
  }
  return window.sessionStorage.getItem(USER_EMAIL_KEY);
}

export function setSessionEmail(email: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(USER_EMAIL_KEY);
  window.sessionStorage.setItem(USER_EMAIL_KEY, email);
}

export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  const keys = [USER_ID_KEY, AUTH_TOKEN_KEY, USER_ROLE_KEY, USERNAME_KEY, USER_EMAIL_KEY];
  for (const key of keys) {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  }
}
