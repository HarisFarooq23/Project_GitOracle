"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import ProfileCard from "@/components/ui/profile-card";
import { UserActivityPieChart } from "@/components/ui/user-activity-pie-chart";
import type { ActivitySlice } from "@/components/ui/user-activity-pie-chart";
import { clearSession, getSessionEmail, getSessionToken, getSessionUserId, getSessionUsername } from "@/lib/auth-session";
import { flaskRequest, getUserActivityStats, type UserActivityStatsResponse } from "@/lib/flask-api";

type WeeklyGoalResponse = {
  weekly_goal: {
    goal: string;
    week_start_date: string;
    current_week_minutes: number;
    updated_at: string | null;
  };
};

function formatMinutesShort(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0m";
  }
  if (minutes < 1) {
    return `${Math.max(1, Math.round(minutes * 60))}s`;
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) {
    return `${m}m`;
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function UserProfilePage() {
  const router = useRouter();
  const userId = getSessionUserId();
  const username = getSessionUsername();
  const email = getSessionEmail();
  const [activityStats, setActivityStats] = useState<UserActivityStatsResponse | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [weeklyGoalInput, setWeeklyGoalInput] = useState("");
  const [weeklyGoalCurrent, setWeeklyGoalCurrent] = useState("");
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState(0);
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalMessage, setGoalMessage] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || userId <= 0) {
      return;
    }
    const token = getSessionToken();
    let cancelled = false;
    setActivityLoading(true);
    void (async () => {
      try {
        const stats = await getUserActivityStats(userId, token);
        if (!cancelled) {
          setActivityStats(stats);
          setActivityError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setActivityStats(null);
          setActivityError(err instanceof Error ? err.message : "Could not load activity.");
        }
      } finally {
        if (!cancelled) {
          setActivityLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || userId <= 0) return;
    const token = getSessionToken();
    let cancelled = false;
    setGoalLoading(true);
    void (async () => {
      try {
        const data = await flaskRequest<WeeklyGoalResponse>({
          path: "/api/user/weekly-goal",
          headers: {
            "X-User-Id": String(userId),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!cancelled) {
          setWeeklyGoalCurrent(data.weekly_goal.goal || "");
          setWeeklyGoalInput(data.weekly_goal.goal || "");
          setWeeklyGoalMinutes(data.weekly_goal.current_week_minutes || 0);
          setGoalError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setGoalError(err instanceof Error ? err.message : "Could not load weekly goal.");
        }
      } finally {
        if (!cancelled) setGoalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const pieSlices = useMemo((): ActivitySlice[] => {
    if (!activityStats?.days?.length) {
      return [];
    }
    return activityStats.days
      .filter((d) => d.minutes > 0.05)
      .map((d) => ({
        label: d.weekday,
        value: d.minutes,
      }));
  }, [activityStats]);

  if (!userId || !username || !email) {
    return (
      <div className="min-h-screen bg-black text-white">
        <AppHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
          <h1 className="text-2xl font-semibold md:text-3xl">Sign up first</h1>
          <p className="mt-2 text-sm text-zinc-400">Create an account to unlock your profile.</p>
          <Link href="/create-account" className="mt-6 rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10">
            Create Account
          </Link>
        </main>
      </div>
    );
  }

  const weekTotal = activityStats?.total_minutes ?? 0;
  const hasAnyTime = activityStats?.days.some((d) => d.minutes > 0.05) ?? false;

  const saveWeeklyGoal = async () => {
    if (!userId || userId <= 0) return;
    const token = getSessionToken();
    setGoalLoading(true);
    setGoalError(null);
    setGoalMessage(null);
    try {
      const data = await flaskRequest<WeeklyGoalResponse>({
        path: "/api/user/weekly-goal",
        method: "POST",
        body: JSON.stringify({ goal: weeklyGoalInput }),
        headers: {
          "X-User-Id": String(userId),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setWeeklyGoalCurrent(data.weekly_goal.goal);
      setWeeklyGoalMinutes(data.weekly_goal.current_week_minutes || 0);
      setGoalMessage("Weekly goal saved.");
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : "Could not save weekly goal.");
    } finally {
      setGoalLoading(false);
    }
  };

  const deleteAccount = async () => {
    if (!userId || userId <= 0) return;
    const confirmDelete = window.confirm(
      "Are you sure you want to delete your account? This cannot be undone."
    );
    if (!confirmDelete) return;
    const token = getSessionToken();
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await flaskRequest<{ message: string }>({
        path: "/api/user/delete-account",
        method: "POST",
        body: JSON.stringify({ reason: "Deleted by user from profile page" }),
        headers: {
          "X-User-Id": String(userId),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      clearSession();
      router.push("/sign-in");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete account.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold md:text-5xl">Your Profile</h1>
        <p className="mt-3 max-w-3xl text-zinc-300">
          Tune your learning profile so GitOracle can recommend repositories that match your skill,
          available hours, and current momentum.
        </p>

        <section className="mt-10 flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center">
          <ProfileCard
            name={username}
            role="Learning-Focused Developer"
            email={email}
            avatarSrc={`/flask/api/user/profile-picture?user_id=${userId}`}
            statusText="Weekly planning active"
            glowText="Optimizing your next project path"
            statusColor="bg-violet-400"
          />

          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur">
            <h2 className="text-lg font-semibold tracking-tight text-white">Time on GitOracle</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Last 7 days (UTC): minutes per day from your sessions. Open visits count up to now; closed tabs use the
              recorded exit time.
            </p>
            {activityLoading ? (
              <p className="mt-6 text-sm text-zinc-500">Loading activity…</p>
            ) : activityError ? (
              <p className="mt-4 text-sm text-amber-200/90">{activityError}</p>
            ) : pieSlices.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">
                No time recorded in the last 7 days. Open the app while signed in; duration builds from each visit (even
                if you have not closed the tab yet).
              </p>
            ) : (
              <div className="mt-4 flex justify-center overflow-hidden rounded-xl">
                <UserActivityPieChart width={360} height={300} data={pieSlices} />
              </div>
            )}
            {activityStats && activityStats.days.length > 0 && hasAnyTime && (
              <>
                <div className="mt-4 rounded-lg bg-white/5 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">This week (7 days)</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{formatMinutesShort(weekTotal)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">total</p>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {activityStats.days.map((d) => (
                    <li
                      key={d.date}
                      className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-zinc-300"
                    >
                      <span className="text-white">
                        {d.weekday}{" "}
                        <span className="text-zinc-500">
                          ({d.date.slice(5).replace("-", "/")})
                        </span>
                      </span>
                      <span className="tabular-nums text-cyan-200/90">{formatMinutesShort(d.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
              <h3 className="text-sm font-semibold text-white">Weekly Goal</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Set this week&apos;s goal for your saved projects. Current week activity:{" "}
                <span className="text-cyan-200">{formatMinutesShort(weeklyGoalMinutes)}</span>
              </p>
              <textarea
                value={weeklyGoalInput}
                onChange={(e) => setWeeklyGoalInput(e.target.value)}
                placeholder="Example: Finish 2 saved repositories and spend 4 focused hours."
                className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-violet-400"
                maxLength={255}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void saveWeeklyGoal()}
                  disabled={goalLoading}
                  className="rounded-lg border border-violet-300/50 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {goalLoading ? "Saving..." : "Save Weekly Goal"}
                </button>
                <span className="text-xs text-zinc-500">{weeklyGoalInput.length}/255</span>
              </div>
              {weeklyGoalCurrent ? (
                <p className="mt-2 text-xs text-zinc-300">
                  Current goal: <span className="text-white">{weeklyGoalCurrent}</span>
                </p>
              ) : null}
              {goalMessage ? <p className="mt-2 text-xs text-emerald-300">{goalMessage}</p> : null}
              {goalError ? <p className="mt-2 text-xs text-rose-300">{goalError}</p> : null}
            </div>

            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <h3 className="text-sm font-semibold text-rose-200">Delete Account</h3>
              <p className="mt-1 text-xs text-rose-100/80">
                This permanently removes your user account from active users and archives it in deleted accounts.
              </p>
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={deleteLoading}
                className="mt-3 rounded-lg border border-rose-300/50 bg-rose-500/20 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteLoading ? "Deleting..." : "Delete My Account"}
              </button>
              {deleteError ? <p className="mt-2 text-xs text-rose-200">{deleteError}</p> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
