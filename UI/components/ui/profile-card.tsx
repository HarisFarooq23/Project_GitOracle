"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Copy, Plus, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProfileCardProps {
  name?: string;
  role?: string;
  email?: string;
  avatarSrc?: string;
  statusText?: string;
  statusColor?: string;
  glowText?: string;
  className?: string;
}

export default function ProfileCard({
  name = "GitOracle Builder",
  role = "Full-Stack Learner",
  email = "builder@gitoracle.dev",
  avatarSrc = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80",
  statusText = "Ready to build",
  statusColor = "bg-emerald-400",
  glowText = "Momentum is high this week",
  className,
}: ProfileCardProps) {
  const [copied, setCopied] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarErrorHandled = useRef(false);
  const defaultAvatar =
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80";

  useEffect(() => {
    setAvatarFailed(false);
    avatarErrorHandled.current = false;
  }, [avatarSrc]);

  const timeText = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, "0");
    const hour12 = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hour12}:${m}${ampm}`;
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("relative w-full max-w-3xl", className)}
    >
      <div className="pointer-events-none absolute inset-x-0 -bottom-9 top-[70%] rounded-[28px] bg-purple-400/80 shadow-[0_40px_80px_-16px_rgba(34,211,238,0.6)]" />
      <div className="pointer-events-none absolute inset-x-0 -bottom-10 mx-auto w-full">
        <div className="flex items-center justify-center gap-2 py-3 text-center text-sm font-medium text-cyan-100">
          <Zap className="h-4 w-4" />
          {glowText}
        </div>
      </div>

      <Card className="relative z-10 mx-auto w-full overflow-visible rounded-[28px] border border-white/10 bg-[radial-gradient(120%_120%_at_30%_10%,#1d1b3a_0%,#111225_55%,#0b0b12_100%)] text-white shadow-2xl">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between text-sm text-neutral-300">
            <div className="flex items-center gap-2">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full animate-pulse", statusColor)} />
              <span>{statusText}</span>
            </div>
            <div className="flex items-center gap-2 opacity-80">
              <Clock className="h-4 w-4" />
              <span className="tabular-nums">{timeText}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-white/10">
              <img
                src={avatarFailed ? defaultAvatar : avatarSrc}
                alt={`${name} avatar`}
                className="h-full w-full object-cover"
                onError={() => {
                  if (avatarErrorHandled.current) return;
                  avatarErrorHandled.current = true;
                  setAvatarFailed(true);
                }}
              />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{name}</h3>
              <p className="mt-0.5 text-sm text-neutral-400">{role}</p>
              <p className="mt-1 truncate text-xs text-cyan-200/90">{email}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Button
              variant="secondary"
              className="h-12 justify-start gap-3 rounded-2xl bg-white/10 text-white hover:bg-white/15"
            >
              <Plus className="h-4 w-4" />
              Add Weekly Goal
            </Button>
            <Button
              variant="secondary"
              onClick={handleCopy}
              className="h-12 justify-start gap-3 rounded-2xl bg-white/10 text-white hover:bg-white/15"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copied Email" : "Copy Email"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
