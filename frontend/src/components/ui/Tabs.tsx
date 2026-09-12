import { motion } from "motion/react";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  badge?: number | string;
}

/** Segmented control in the display face with a sliding gradient pill. */
export function Tabs<T extends string>({ value, options, onChange, id = "tabs", className = "" }: { value: T; options: Array<TabOption<T>>; onChange: (v: T) => void; id?: string; className?: string }) {
  return (
    <div className={`tab-row ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)} className={`tab relative ${active ? "text-[#140a2e]" : ""}`}>
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 -z-10 rounded-[9px] bg-gradient-to-r from-[#c4b5fd] via-[#a78bfa] to-[#f472b6] shadow-[0_6px_20px_-8px_rgba(236,72,153,.9)]"
              />
            )}
            <span className="relative">{o.label}</span>
            {o.badge !== undefined && <span className={`relative ml-1.5 rounded-full px-1.5 py-px text-[8px] ${active ? "bg-[#140a2e]/20" : "bg-white/10"}`}>{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
