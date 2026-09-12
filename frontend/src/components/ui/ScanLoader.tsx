import { motion } from "motion/react";

import "@/styles/shell.css";

/**
 * Loading state that reads as "the system is scanning the case file", never
 * a spinner.
 *
 *   default   — stacked glass bars with a travelling light and a status line.
 *   hologram  — a three-column holographic grid being assembled cell by cell,
 *               with a sweep passing over it. Use for whole-page loads.
 */
export function ScanLoader({
  label = "Reading the case file…",
  rows = 4,
  className = "",
  variant = "default",
}: {
  label?: string;
  rows?: number;
  className?: string;
  variant?: "default" | "hologram";
}) {
  if (variant === "hologram") {
    const cells = Math.max(3, rows * 3);
    return (
      <div className={`hud-frame scan-active rounded-xl p-4 ${className}`} role="status" aria-live="polite">
        <div className="mb-3 flex items-center gap-2">
          <span className="relative grid h-4 w-4 place-items-center">
            <motion.span className="absolute inset-0 rounded-full border border-cot-magenta/70" animate={{ scale: [0.6, 1.5], opacity: [0.9, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-cot-magenta shadow-[0_0_10px_rgba(244,114,182,.9)]" />
          </span>
          <span className="label-caps text-cot-magenta">{label}</span>
          <span className="mono ml-auto text-[10px] text-cot-text4">SHA-256 · verifying</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: cells }).map((_, i) => (
            <motion.div
              key={i}
              className="holo-cell p-2.5"
              initial={{ opacity: 0, y: 8, clipPath: "inset(0 0 100% 0)" }}
              animate={{ opacity: [0, 1, 1, 0.55, 1], y: 0, clipPath: "inset(0 0 0% 0)" }}
              transition={{ duration: 2.4, repeat: Infinity, delay: (i % 3) * 0.12 + Math.floor(i / 3) * 0.18, ease: "easeOut" }}
            >
              <div className="holo-line mb-2 w-1/2" />
              <div className="holo-line mb-2 w-5/6 opacity-70" />
              <div className="holo-line w-2/3 opacity-40" />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`hud-frame scan-active rounded-xl p-4 ${className}`} role="status" aria-live="polite">
      <div className="mb-3 flex items-center gap-2">
        <motion.span className="h-2 w-2 rounded-full bg-cot-violet shadow-[0_0_10px_rgba(167,139,250,.9)]" animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }} transition={{ duration: 1.2, repeat: Infinity }} />
        <span className="label-caps text-cot-violet">{label}</span>
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div
            key={i}
            className="h-3 rounded bg-gradient-to-r from-[rgba(124,58,237,.22)] via-[rgba(244,114,182,.28)] to-[rgba(124,58,237,.12)]"
            style={{ width: `${78 - i * 12}%` }}
            animate={{ opacity: [0.35, 0.9, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
