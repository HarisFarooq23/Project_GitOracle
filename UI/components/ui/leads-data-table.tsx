"use client";

import type { ElementType } from "react";
import { motion } from "framer-motion";
import { GitPullRequest, GitFork, Star, Eye, AlertCircle } from "lucide-react";
import type { TrendingRepo } from "@/lib/github-trending";

interface LeadsTableProps {
  title?: string;
  leads?: TrendingRepo[];
  className?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: (repo: TrendingRepo) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (repo: TrendingRepo) => void;
}

const difficultyStyles: Record<TrendingRepo["difficulty"], string> = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  medium: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  amateur: "bg-violet-500/15 text-violet-300 border-violet-400/30",
  high: "bg-rose-500/15 text-rose-300 border-rose-400/30",
};

export function LeadsTable({
  title = "Trending Repositories",
  leads = [],
  className = "",
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: LeadsTableProps) {
  const primaryOn = Boolean(primaryActionLabel && onPrimaryAction);
  const secondaryOn = Boolean(secondaryActionLabel && onSecondaryAction);
  const hasAction = primaryOn || secondaryOn;
  const actionsHeader = primaryOn && secondaryOn ? "Actions" : "Action";
  return (
    <div className={`w-full ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-xs text-zinc-400">Live GitHub trending scan with difficulty tags</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
        <div className={`grid ${hasAction ? "grid-cols-9" : "grid-cols-8"} gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-zinc-400`}>
          <div className="col-span-2">Repository</div>
          <div>Stars</div>
          <div>Forks</div>
          <div>Watchers</div>
          <div>Open Issues</div>
          <div>PRs</div>
          <div>Difficulty</div>
          {hasAction ? <div>{actionsHeader}</div> : null}
        </div>

        {leads.map((repo, idx) => (
          <motion.div
            key={repo.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06, duration: 0.25 }}
            className={`grid ${hasAction ? "grid-cols-9" : "grid-cols-8"} gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.03]`}
          >
            <div className="col-span-2 min-w-0">
              <a href={repo.url} target="_blank" rel="noreferrer" className="truncate font-medium text-white hover:underline">
                {repo.name}
              </a>
              <div className="mt-1 truncate text-xs text-zinc-400">
                {repo.languages.slice(0, 3).join(" • ") || "No languages detected"}
              </div>
            </div>
            <Metric icon={Star} value={repo.stars.toLocaleString()} />
            <Metric icon={GitFork} value={repo.forks.toLocaleString()} />
            <Metric icon={Eye} value={repo.watchers.toLocaleString()} />
            <Metric icon={AlertCircle} value={repo.openIssues.toLocaleString()} />
            <Metric icon={GitPullRequest} value={repo.pullRequests.toLocaleString()} />
            <div className="flex items-center">
              <span className={`rounded-full border px-2 py-1 text-xs capitalize ${difficultyStyles[repo.difficulty]}`}>
                {repo.difficulty}
              </span>
            </div>
            {hasAction ? (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {primaryOn ? (
                  <button
                    type="button"
                    onClick={() => onPrimaryAction?.(repo)}
                    className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20"
                  >
                    {primaryActionLabel}
                  </button>
                ) : null}
                {secondaryOn ? (
                  <button
                    type="button"
                    onClick={() => onSecondaryAction?.(repo)}
                    className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-xs text-violet-200 hover:bg-violet-500/20"
                  >
                    {secondaryActionLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value }: { icon: ElementType; value: string }) {
  return (
    <div className="flex items-center gap-1 text-sm text-zinc-300">
      <Icon className="h-3.5 w-3.5 text-zinc-500" />
      <span>{value}</span>
    </div>
  );
}
