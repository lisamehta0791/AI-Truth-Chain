import type { ReactNode } from "react";

export type ChipTone = "ai" | "ok" | "warn" | "critical" | "neutral";

const TONE: Record<ChipTone, string> = {
  ai: "status-ai",
  ok: "status-ok",
  warn: "status-warn",
  critical: "status-critical",
  neutral: "status-neutral",
};

/** Small status pill in the display face. */
export function Chip({ tone = "neutral", children, className = "", dot }: { tone?: ChipTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={`chip ${TONE[tone]} ${className}`}>
      {dot && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
