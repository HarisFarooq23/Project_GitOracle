"use client";

import { useEffect } from "react";
import { getSessionToken, getSessionUserId } from "@/lib/auth-session";
import { endUserActivitySession, startUserActivitySession } from "@/lib/flask-api";

const ACTIVITY_STORAGE_KEY = "internhub_current_activity_id";

function postEndBeacon(userId: number, activityId: number) {
  if (typeof window === "undefined") {
    return;
  }
  const path = `/flask/api/user-activity/session/end?user_id=${userId}`;
  const body = JSON.stringify({ user_id: userId, activity_id: activityId });
  const blob = new Blob([body], { type: "application/json" });
  try {
    if (navigator.sendBeacon(path, blob)) {
      return;
    }
  } catch {
    // fall through
  }
  void fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Starts a DB row when a signed-in user loads the app and marks left_webapp_at on tab close / navigation.
 */
export function ActivitySessionTracker() {
  useEffect(() => {
    const userId = getSessionUserId();
    const token = getSessionToken();
    if (!userId || userId <= 0) {
      return;
    }

    let cancelled = false;
    let activityId: number | null = null;

    const flushEnd = () => {
      if (activityId == null) {
        return;
      }
      const id = activityId;
      activityId = null;
      window.sessionStorage.removeItem(ACTIVITY_STORAGE_KEY);
      void endUserActivitySession(userId, id, token).catch(() => {});
    };

    void (async () => {
      try {
        const res = await startUserActivitySession(userId, token);
        if (cancelled) {
          await endUserActivitySession(userId, res.activity_id, token).catch(() => {});
          return;
        }
        activityId = res.activity_id;
        window.sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(res.activity_id));
      } catch {
        // Offline or backend down — skip silently
      }
    })();

    const onPageHide = () => {
      const stored = window.sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
      const parsed = stored ? Number.parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        postEndBeacon(userId, parsed);
      }
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      flushEnd();
    };
  }, []);

  return null;
}
