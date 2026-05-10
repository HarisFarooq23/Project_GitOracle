"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { flaskRequest } from "@/lib/flask-api";
import { LeadsTable } from "@/components/ui/leads-data-table";
import type { TrendingRepo } from "@/lib/github-trending";
import { getSessionToken, getSessionUserId } from "@/lib/auth-session";

interface RepositoryResult {
  repo_id: number;
  full_name: string;
  description: string | null;
  stars: number;
  language: string | null;
  html_url: string | null;
  difficulty_score: number | null;
}

interface SearchResponse {
  count: number;
  mode?: "keyword" | "filtered";
  results: RepositoryResult[];
}

type StarsOption = "0" | "100" | "500" | "1000" | "5000" | "10000";
type SearchMode = "keyword" | "filtered";

interface SearchFilters {
  language: string;
  topic: string;
  stars: number;
  keyword: string;
  timeAvailable: "1-3" | "5-10" | "20+";
  limit: number;
}

const DEBOUNCE_MS = 450;
const REQUEST_TIMEOUT_MS = 4000;

export default function FindProjectsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<RepositoryResult[]>([]);
  const [suggestions, setSuggestions] = useState<RepositoryResult[]>([]);
  const [suggestionLabel, setSuggestionLabel] = useState("");
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [language, setLanguage] = useState("");
  const [starsGte, setStarsGte] = useState<StarsOption>("0");
  const [topic, setTopic] = useState("");
  const [timeAvailable, setTimeAvailable] = useState<"1-3" | "5-10" | "20+">("5-10");
  const [mode, setMode] = useState<SearchMode>("filtered");
  const [didSearch, setDidSearch] = useState(false);
  const [showSkillRecommendations, setShowSkillRecommendations] = useState(false);
  const [skillRecommendedProjects, setSkillRecommendedProjects] = useState<RepositoryResult[]>([]);
  const [skillRecLabel, setSkillRecLabel] = useState("");
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyword]);

  const filters = useMemo<SearchFilters>(
    () => ({
      language,
      topic,
      stars: Number.parseInt(starsGte, 10) || 0,
      keyword: debouncedKeyword.trim(),
      timeAvailable,
      limit: 20,
    }),
    [language, topic, starsGte, debouncedKeyword, timeAvailable]
  );

  const weakKeywordReason = useMemo(() => {
    const k = filters.keyword.trim();
    if (!k) return null;
    if (k.length < 3) return "Keyword is too short. Use at least 3 characters.";
    if (/^\d+$/.test(k)) return "Numeric-only keyword is too broad. Try a text keyword.";
    return null;
  }, [filters.keyword]);

  const fetchSuggestions = async (activeFilters: SearchFilters) => {
    const loweredStars = Math.max(100, Math.floor(activeFilters.stars / 2));
    const easierTime: SearchFilters["timeAvailable"] =
      activeFilters.timeAvailable === "20+"
        ? "5-10"
        : activeFilters.timeAvailable === "5-10"
        ? "1-3"
        : "1-3";
    const relaxed: SearchFilters = {
      language: activeFilters.language,
      topic: "",
      stars: activeFilters.stars > 0 ? loweredStars : 100,
      keyword: "",
      timeAvailable: easierTime,
      limit: 10,
    };

    try {
      const data = await flaskRequest<SearchResponse>({
        path: "/api/search",
        method: "POST",
        body: JSON.stringify(relaxed),
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      setSuggestions(data.results);
      setSuggestionLabel(
        relaxed.language
          ? `No repositories match your time preference. Try ${relaxed.timeAvailable} hours and ${relaxed.language} with ${relaxed.stars}+ stars.`
          : `No repositories match your time preference. Try ${relaxed.timeAvailable} hours with ${relaxed.stars}+ stars.`
      );
    } catch {
      setSuggestions([]);
      setSuggestionLabel("");
    }
  };

  const runSearch = async (activeFilters: SearchFilters) => {
    const hasKeyword = Boolean(activeFilters.keyword);
    setMode(hasKeyword ? "keyword" : "filtered");
    setIsLoading(true);
    setError(null);
    setDidSearch(true);
    setSuggestions([]);
    setSuggestionLabel("");

    console.log("Search filters:", activeFilters);

    try {
      const data = await flaskRequest<SearchResponse>({
        path: "/api/search",
        method: "POST",
        body: JSON.stringify(activeFilters),
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      setProjects(data.results);
      setMode(data.mode ?? (hasKeyword ? "keyword" : "filtered"));
      console.log("Results:", data.results.length);
      if (data.results.length === 0) {
        await fetchSuggestions(activeFilters);
      }
    } catch (requestError) {
      setProjects([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to fetch search results from Flask API."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      const timer = window.setTimeout(() => {
        void runSearch(filters);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!weakKeywordReason) {
      const timer = window.setTimeout(() => {
        void runSearch(filters);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, weakKeywordReason]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (weakKeywordReason) {
      setError(weakKeywordReason);
      setProjects([]);
      setDidSearch(true);
      return;
    }
    await runSearch(filters);
  };

  const emptyStateHint = useMemo(() => {
    if (!didSearch || isLoading || error || projects.length > 0) return null;
    if (filters.topic && filters.stars >= 5000) {
      return "Your topic + high star threshold may be too restrictive. Try 1000+ stars.";
    }
    if (filters.timeAvailable === "1-3") {
      return "1-3 hours selects beginner-friendly repositories only. Try 5-10 hours for broader matches.";
    }
    if (filters.language && filters.topic) {
      return "Language + topic combination may be narrow. Try removing topic or changing keyword.";
    }
    if (filters.stars >= 5000) {
      return "Very high star threshold can exclude most repositories. Try 1000+ or 500+.";
    }
    if (filters.keyword) {
      return "Try a broader keyword or remove one filter.";
    }
    return "Try selecting a language or adding a keyword.";
  }, [didSearch, isLoading, error, projects.length, filters]);

  const tableRows = useMemo<TrendingRepo[]>(
    () =>
      projects.map((project, idx) => {
        const diff = project.difficulty_score ?? 3;
        return {
          id: String(project.repo_id ?? idx),
          name: project.full_name,
          owner: project.full_name.split("/")[0] || "unknown",
          url: project.html_url || "#",
          stars: project.stars || 0,
          forks: 0,
          openIssues: Math.max(0, Math.round((project.difficulty_score || 2) * 6)),
          watchers: Math.max(1, Math.round((project.stars || 0) * 0.3)),
          sizeKb: Math.max(100, Math.round((project.stars || 1) * 2)),
          contributors: Math.max(1, Math.round((project.difficulty_score || 2) * 3)),
          pullRequests: Math.max(1, Math.round((project.difficulty_score || 2) * 2)),
          commitActivity: diff <= 2 ? "Low" : diff <= 4 ? "Medium" : "High",
          languages: [project.language || "Unknown"],
          difficulty: diff <= 2 ? "low" : diff <= 4 ? "medium" : diff <= 5 ? "amateur" : "high",
        };
      }),
    [projects]
  );

  const skillRecommendedRows = useMemo<TrendingRepo[]>(
    () =>
      skillRecommendedProjects.map((project, idx) => {
        const diff = project.difficulty_score ?? 3;
        return {
          id: String(project.repo_id ?? idx),
          name: project.full_name,
          owner: project.full_name.split("/")[0] || "unknown",
          url: project.html_url || "#",
          stars: project.stars || 0,
          forks: 0,
          openIssues: Math.max(0, Math.round((project.difficulty_score || 2) * 6)),
          watchers: Math.max(1, Math.round((project.stars || 0) * 0.3)),
          sizeKb: Math.max(100, Math.round((project.stars || 1) * 2)),
          contributors: Math.max(1, Math.round((project.difficulty_score || 2) * 3)),
          pullRequests: Math.max(1, Math.round((project.difficulty_score || 2) * 2)),
          commitActivity: diff <= 2 ? "Low" : diff <= 4 ? "Medium" : "High",
          languages: [project.language || "Unknown"],
          difficulty: diff <= 2 ? "low" : diff <= 4 ? "medium" : diff <= 5 ? "amateur" : "high",
        };
      }),
    [skillRecommendedProjects]
  );

  const handleSaveRepo = async (repo: TrendingRepo) => {
    const userId = getSessionUserId();
    const token = getSessionToken();
    if (!userId) {
      setError("Please sign in first to save repositories.");
      return;
    }
    try {
      await flaskRequest({
        path: "/api/saved-repos",
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: JSON.stringify({ repo_id: Number(repo.id), user_id: userId }),
      });
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save repository.");
    }
  };

  const loadSkillRecommendations = async () => {
    const userId = getSessionUserId();
    const token = getSessionToken();
    if (!userId) {
      setError("Please sign in to get personalized project recommendations.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setShowSkillRecommendations(true);
    try {
      const data = await flaskRequest<{
        count: number;
        skills: string[];
        fallback: boolean;
        results: RepositoryResult[];
      }>({
        path: "/api/search/recommended-by-skills",
        headers: {
          "X-User-Id": String(userId),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeoutMs: 12_000,
      });

      setSkillRecommendedProjects(data.results || []);
      if (data.fallback) {
        setSkillRecLabel(
          "No exact skill match found yet, so here are popular repositories to start with."
        );
      } else if (data.skills.length > 0) {
        setSkillRecLabel(`Recommended from your skills: ${data.skills.slice(0, 6).join(", ")}`);
      } else {
        setSkillRecLabel("Add skills in your account profile to get tighter recommendations.");
      }
    } catch (requestError) {
      setSkillRecommendedProjects([]);
      setSkillRecLabel("");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load personalized recommendations."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold md:text-5xl">Find Projects</h1>
        <p className="mt-3 max-w-3xl text-zinc-300">
          Hybrid search: pick structured filters first, then add a precise keyword for faster,
          smarter results.
        </p>

        <section className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-violet-950/20 to-cyan-950/20 p-5 md:p-8">
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block text-zinc-300">Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-white"
              >
                <option value="">Any</option>
                <option value="Python">Python</option>
                <option value="JavaScript">JavaScript</option>
                <option value="TypeScript">TypeScript</option>
                <option value="Java">Java</option>
                <option value="C++">C++</option>
                <option value="Go">Go</option>
                <option value="Rust">Rust</option>
                <option value="C#">C#</option>
                <option value="PHP">PHP</option>
                <option value="Swift">Swift</option>
                <option value="Kotlin">Kotlin</option>
                <option value="Shell">Shell</option>
                <option value="Dart">Dart</option>
                <option value="Ruby">Ruby</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-zinc-300">Minimum stars</span>
              <select
                value={starsGte}
                onChange={(e) => setStarsGte(e.target.value as StarsOption)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-white"
              >
                <option value="0">0+</option>
                <option value="100">100+</option>
                <option value="500">500+</option>
                <option value="1000">1000+</option>
                <option value="5000">5000+</option>
                <option value="10000">10000+</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-zinc-300">Topic</span>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-white"
              >
                <option value="">Any</option>
                <option value="Backend">Backend</option>
                <option value="Frontend">Frontend</option>
                <option value="Fullstack">Fullstack</option>
                <option value="Machine Learning">Machine Learning</option>
                <option value="AI">AI</option>
                <option value="Data Science">Data Science</option>
                <option value="DevOps">DevOps</option>
                <option value="Cybersecurity">Cybersecurity</option>
                <option value="Mobile">Mobile</option>
                <option value="Game Development">Game Development</option>
                <option value="Systems Programming">Systems Programming</option>
                <option value="Web Development">Web Development</option>
              </select>
            </label>

            <label className="text-sm md:col-span-1">
              <span className="mb-1 block text-zinc-300">Time Available</span>
              <select
                value={timeAvailable}
                onChange={(e) => setTimeAvailable(e.target.value as "1-3" | "5-10" | "20+")}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-white"
              >
                <option value="1-3">1-3 hours</option>
                <option value="5-10">5-10 hours</option>
                <option value="20+">20+ hours</option>
              </select>
            </label>

            <label className="text-sm md:col-span-1">
              <span className="mb-1 block text-zinc-300">Keyword</span>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. authentication, react hooks"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-white placeholder:text-zinc-500"
              />
            </label>

            <div className="md:col-span-4">
              <button
                type="submit"
                className="rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/30"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  setKeyword("");
                  setLanguage("");
                  setStarsGte("0");
                  setTopic("");
                  setTimeAvailable("5-10");
                }}
                className="ml-2 rounded-xl border border-white/20 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-zinc-950/60 p-5 md:p-8">
          <h2 className="text-xl font-semibold">Database Search Results</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Discover high-signal repositories from your InternHub database, ready to explore.
          </p>
          <button
            type="button"
            onClick={() => void loadSkillRecommendations()}
            className="mt-3 rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/20"
          >
            Can&apos;t find projects recommended to your taste? Here are some recommended projects for you
          </button>
          <p className="mt-2 text-xs text-zinc-500">
            Search mode: {mode === "keyword" ? "Keyword + structured filters" : "Structured filters"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Time preference: {filters.timeAvailable} hours
          </p>
          {isLoading && (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="animate-pulse rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <div className="h-5 w-52 rounded bg-slate-600/60" />
                  <div className="mt-2 h-4 w-36 rounded bg-slate-700/70" />
                  <div className="mt-3 h-4 w-full rounded bg-slate-700/70" />
                </div>
              ))}
            </div>
          )}
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
          {!error && !isLoading && projects.length === 0 && didSearch && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-200">No repositories match your time preference.</p>
              {emptyStateHint && <p className="mt-1 text-xs text-amber-100/90">{emptyStateHint}</p>}
            </div>
          )}
          {!isLoading && projects.length > 0 && (
            <div className="mt-4">
              <LeadsTable
                title="Matched Repositories"
                leads={tableRows}
                primaryActionLabel="Save"
                onPrimaryAction={handleSaveRepo}
              />
            </div>
          )}
          {!isLoading && showSkillRecommendations && skillRecommendedRows.length > 0 && (
            <div className="mt-6">
              <LeadsTable
                title="Recommended Repositories (Based on Your Skills)"
                leads={skillRecommendedRows}
                primaryActionLabel="Save"
                onPrimaryAction={handleSaveRepo}
              />
              {skillRecLabel ? <p className="mt-2 text-xs text-cyan-200/90">{skillRecLabel}</p> : null}
            </div>
          )}
          {!isLoading && suggestions.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-cyan-200">Suggested alternatives</h3>
              <p className="mt-1 text-sm text-zinc-400">{suggestionLabel}</p>
              <ul className="mt-3 space-y-4 text-sm">
                {suggestions.map((project) => (
                  <li key={project.repo_id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                    <a href={project.html_url || "#"} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-sky-400 hover:underline">
                      {project.full_name}
                    </a>
                    <div className="mt-1 text-sm text-slate-400">{project.language || "Unknown"} - ⭐ {project.stars?.toLocaleString?.() ?? 0}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!isLoading && projects.length > 0 && (
            <p className="mt-4 text-xs text-zinc-500">
              Showing {projects.length} result(s)
              {filters.keyword ? ` for "${filters.keyword}"` : ""}.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
