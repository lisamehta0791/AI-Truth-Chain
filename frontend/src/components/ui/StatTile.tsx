import type { ReactNode } from "react";

import { CountUp } from "@/components/ui/CountUp";
import { TiltCard } from "@/components/ui/TiltCard";

export type StatTone = "violet" | "magenta" | "mint" | "amber" | "red" | "ice";

const TONE: Record<StatTone, { text: string; glow: string; bar: string }> = {
  violet: { text: "text-cot-violet", glow: "rgba(167,139,250,.35)", bar: "from-cot-violet to-cot-magenta" },
  magenta: { text: "text-cot-magenta", glow: "rgba(244,114,182,.35)", bar: "from-cot-magenta to-cot-violet" },
  mint: { text: "text-cot-mint", glow: "rgba(6,255,165,.3)", bar: "from-cot-mint to-cot-violet" },
  amber: { text: "text-cot-amber", glow: "rgba(255,181,71,.3)", bar: "from-cot-amber to-cot-magenta" },
  red: { text: "text-cot-red", glow: "rgba(255,61,113,.3)", bar: "from-cot-red to-cot-magenta" },
  ice: { text: "text-cot-ice", glow: "rgba(154,216,255,.3)", bar: "from-cot-ice to-cot-violet" },
};

interface StatTileProps {
  label: ReactNode;
  value: number | string;
  decimals?: number;
  suffix?: string;
  tone?: StatTone;
  hint?: ReactNode;
  icon?: ReactNode;
  /** 0..1 — draws a progress bar under the value. */
  progress?: number;
  className?: string;
}

/** KPI tile: 3D tilt, glowing display-face number that counts up, optional progress bar. */
export function StatTile({ label, value, decimals = 0, suffix = "", tone = "violet", hint, icon, progress, className = "" }: StatTileProps) {
  const t = TONE[tone];
  return (
    <TiltCard className={`hud-frame p-4 ${className}`} glare>
      <div className="flex items-start justify-between gap-2">
        <span className="label-caps text-cot-text3">{label}</span>
        {icon && <span className={`${t.text} opacity-80`}>{icon}</span>}
      </div>
      <div className={`stat-value mt-2 ${t.text}`} style={{ textShadow: `0 0 26px ${t.glow}` }}>
        {typeof value === "number" ? <CountUp value={value} decimals={decimals} suffix={suffix} /> : value}
      </div>
      {typeof progress === "number" && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[.06]">
          <div className={`h-full rounded-full bg-gradient-to-r ${t.bar} transition-[width] duration-700`} style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      )}
      {hint && <div className="mt-2 text-xs text-cot-text3">{hint}</div>}
    </TiltCard>
  );
}
