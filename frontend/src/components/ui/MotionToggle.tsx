import { getReduceMotion, setReduceMotion, usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * The in-app motion switch. Motion is on by default; this is the only thing
 * that turns it off (the OS media query is deliberately ignored).
 */
export function MotionToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const on = !reduced;
  const toggle = () => setReduceMotion(!getReduceMotion());

  if (compact) {
    return (
      <button type="button" onClick={toggle} className={`motion-btn ${className}`} role="switch" aria-checked={on} aria-label={`Motion FX ${on ? "on" : "off"}`} data-tip={`Motion FX ${on ? "on" : "off"}`}>
        <span className={`motion-switch ${on ? "on" : ""}`}>
          <span className="knob" />
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={toggle} role="switch" aria-checked={on} className={`motion-btn flex w-full items-center gap-3 rounded-xl border border-[color:var(--cot-line-soft)] bg-[rgba(167,139,250,.04)] px-3 py-2 text-left hover:border-[color:var(--cot-line)] ${className}`}>
      <span className={`motion-switch ${on ? "on" : ""}`}>
        <span className="knob" />
      </span>
      <span className="min-w-0">
        <span className="label-caps block text-cot-text2">Motion FX {on ? "on" : "off"}</span>
        <span className="block text-[11px] leading-tight text-cot-text3">{on ? "Transitions and hover effects" : "Static interface"}</span>
      </span>
    </button>
  );
}
