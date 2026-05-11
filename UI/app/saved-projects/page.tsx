"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { LeadsTable } from "@/components/ui/leads-data-table";
import { getSessionToken, getSessionUserId } from "@/lib/auth-session";
import { flaskRequest } from "@/lib/flask-api";
import type { TrendingRepo } from "@/lib/github-trending";

type CreateIssueResponse = {
  message: string;
  issue: { issue_id: number; repo_id: number; title: string };
};

interface RepositoryResponse {
  saved_projects: Array<{
    repo_id: number;
    full_name: string;
    description: string | null;
    owner: string;
    language: string | null;
    stars: number;
    forks: number;
    html_url: string | null;
  }>;
}

const savedRepoCache = new Map<number, RepositoryResponse["saved_projects"]>();

export default function SavedProjectsPage() {
  const [repositories, setRepositories] = useState<RepositoryResponse["saved_projects"]>([]);
  const [completedRepositories, setCompletedRepositories] = useState<RepositoryResponse["saved_projects"]>([]);
  const [repositoriesError, setRepositoriesError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [issueModalRepo, setIssueModalRepo] = useState<TrendingRepo | null>(null);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueLabelsText, setIssueLabelsText] = useState("");
  const [issueGithubUrl, setIssueGithubUrl] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueFormError, setIssueFormError] = useState<string | null>(null);

  const userId = useMemo(() => getSessionUserId(), []);
  const token = useMemo(() => getSessionToken(), []);
  const needsSignup = !userId;

  useEffect(() => {
    let isCancelled = false;

    async function fetchSavedRepos() {
      if (!userId) {
        setLoading(false);
        return;
      }
      const cached = savedRepoCache.get(userId);
      if (cached) {
        setRepositories(cached);
        setRepositoriesError(undefined);
        setLoading(false);
        return;
      }

      try {
        const [data, completed] = await Promise.all([
          flaskRequest<RepositoryResponse>({
            path: `/api/saved-repos?user_id=${userId}`,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }),
          flaskRequest<{ completed_projects: RepositoryResponse["saved_projects"] }>({
            path: `/api/completed-repos?user_id=${userId}`,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }),
        ]);
        const sliced = data.saved_projects.slice(0, 50);
        savedRepoCache.set(userId, sliced);

        if (!isCancelled) {
          setRepositories(sliced);
          setCompletedRepositories(completed.completed_projects.slice(0, 50));
          setRepositoriesError(undefined);
        }
      } catch (error) {
        if (!isCancelled) {
          setRepositories([]);
          setRepositoriesError(
            error instanceof Error ? error.message : "Failed to fetch saved projects from Flask."
          );
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchSavedRepos();

    return () => {
      isCancelled = true;
    };
  }, [userId, token]);

  const toTrending = (items: RepositoryResponse["saved_projects"]): TrendingRepo[] =>
    items.map((repo) => ({
      id: String(repo.repo_id),
      name: repo.full_name,
      owner: repo.owner || "unknown",
      url: repo.html_url || "#",
      stars: repo.stars || 0,
      forks: repo.forks || 0,
      openIssues: 0,
      watchers: Math.max(1, Math.round((repo.stars || 0) * 0.25)),
      sizeKb: Math.max(100, (repo.stars || 1) * 2),
      contributors: 1,
      pullRequests: 0,
      commitActivity: "Medium",
      languages: [repo.language || "Unknown"],
      difficulty: "medium",
    }));

  const openAddIssueModal = (repo: TrendingRepo) => {
    setIssueModalRepo(repo);
    setIssueTitle("");
    setIssueBody("");
    setIssueLabelsText("");
    setIssueGithubUrl("");
    setIssueFormError(null);
  };

  const closeAddIssueModal = () => {
    setIssueModalRepo(null);
    setIssueSubmitting(false);
    setIssueFormError(null);
  };

  const submitNewIssue = async () => {
    if (!userId || !issueModalRepo) return;
    const title = issueTitle.trim();
    if (!title) {
      setIssueFormError("Title is required.");
      return;
    }
    setIssueSubmitting(true);
    setIssueFormError(null);
    const labels = issueLabelsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const url = issueGithubUrl.trim();
    try {
      await flaskRequest<CreateIssueResponse>({
        path: "/api/issues/create",
        method: "POST",
        timeoutMs: 15_000,
        headers: {
          "X-User-Id": String(userId),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          repo_id: Number(issueModalRepo.id),
          title,
          body: issueBody.trim() || undefined,
          labels: labels.length ? labels : undefined,
          github_url: url || undefined,
        }),
      });
      closeAddIssueModal();
    } catch (err) {
      setIssueFormError(err instanceof Error ? err.message : "Could not create issue.");
    } finally {
      setIssueSubmitting(false);
    }
  };

  const markCompleted = async (repo: TrendingRepo) => {
    if (!userId) return;
    try {
      await flaskRequest({
        path: "/api/saved-repos/complete",
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: JSON.stringify({ repo_id: Number(repo.id), user_id: userId }),
      });
      setRepositories((current) => current.filter((r) => String(r.repo_id) !== repo.id));
      const moved = repositories.find((r) => String(r.repo_id) === repo.id);
      if (moved) setCompletedRepositories((current) => [moved, ...current]);
    } catch (error) {
      setRepositoriesError(error instanceof Error ? error.message : "Failed to mark repository completed.");
    }
  };

  if (needsSignup) {
    return (
      <div className="min-h-screen bg-black text-white">
        <AppHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
          <h1 className="text-2xl font-semibold md:text-3xl">Sign up first</h1>
          <p className="mt-2 text-sm text-zinc-400">Save projects after creating an account.</p>
          <Link href="/create-account" className="mt-6 rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10">
            Create Account
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold md:text-5xl">Saved Projects</h1>
        <p className="mt-3 max-w-3xl text-zinc-300">Move projects from saved to completed as you finish them.</p>
        {loading ? <p className="mt-4 text-sm text-zinc-300">Loading your saved repositories...</p> : null}
        {repositoriesError ? <p className="mt-4 text-sm text-rose-300">{repositoriesError}</p> : null}
        {!loading && !repositoriesError ? (
          <section className="mt-6">
            <LeadsTable
              title="Saved Repositories"
              leads={toTrending(repositories)}
              primaryActionLabel="Mark Completed"
              onPrimaryAction={markCompleted}
              secondaryActionLabel="Add issues"
              onSecondaryAction={openAddIssueModal}
            />
          </section>
        ) : null}
        {!loading && !repositoriesError ? (
          <section className="mt-8">
            <LeadsTable
              title="Completed Repositories"
              leads={toTrending(completedRepositories)}
              secondaryActionLabel="Add issues"
              onSecondaryAction={openAddIssueModal}
            />
          </section>
        ) : null}
        {issueModalRepo ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-issue-title"
          >
            <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
              <h2 id="add-issue-title" className="text-lg font-semibold text-white">
                Add issue
              </h2>
              <p className="mt-1 truncate text-sm text-zinc-400">{issueModalRepo.name}</p>
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-zinc-500">
                  Title <span className="text-rose-400">*</span>
                  <input
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                    placeholder="Short summary"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Description
                  <textarea
                    value={issueBody}
                    onChange={(e) => setIssueBody(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                    placeholder="Details, acceptance criteria, links…"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Labels (comma-separated)
                  <input
                    value={issueLabelsText}
                    onChange={(e) => setIssueLabelsText(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                    placeholder="e.g. bug, documentation, good first issue"
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  GitHub issue URL (optional)
                  <input
                    value={issueGithubUrl}
                    onChange={(e) => setIssueGithubUrl(e.target.value)}
                    maxLength={300}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                    placeholder="https://github.com/owner/repo/issues/123"
                  />
                </label>
              </div>
              {issueFormError ? <p className="mt-3 text-sm text-rose-300">{issueFormError}</p> : null}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddIssueModal}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={issueSubmitting}
                  onClick={() => void submitNewIssue()}
                  className="rounded-lg border border-violet-400/50 bg-violet-500/20 px-4 py-2 text-sm text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
                >
                  {issueSubmitting ? "Saving…" : "Save issue"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
