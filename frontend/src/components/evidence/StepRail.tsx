import "@/styles/evidence.css";

export interface StepDef {
  key: string;
  label: string;
  /** Rendered but greyed and unreachable — e.g. live capture for ranks that do not need it. */
  skipped?: boolean;
}

/**
 * Horizontal progress rail for the intake stepper. Completed steps turn
 * mint, the current one glows in the gradient, skipped ones are dashed.
 * Completed steps are clickable so the officer can go back and change
 * something without losing what they entered.
 */
export function StepRail({ steps, current, maxReached, onJump }: { steps: StepDef[]; current: number; maxReached: number; onJump: (i: number) => void }) {
  const fill = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;
  return (
    <div className="step-rail" role="list" aria-label="Intake steps">
      <div className="step-rail__track" aria-hidden="true">
        <div className="step-rail__fill" style={{ width: `${fill}%` }} />
      </div>
      {steps.map((s, i) => {
        const state = s.skipped ? "is-skipped" : i < current ? "is-done" : i === current ? "is-current" : "";
        const reachable = !s.skipped && i <= maxReached && i !== current;
        return (
          <button
            key={s.key}
            type="button"
            role="listitem"
            aria-current={i === current ? "step" : undefined}
            disabled={!reachable}
            onClick={() => reachable && onJump(i)}
            className={`step-rail__node ${state} !overflow-visible`}
            style={{ opacity: 1 }}
          >
            <span className="step-rail__dot relative">{i < current && !s.skipped ? "✓" : i + 1}</span>
            <span className="step-rail__label">{s.label}{s.skipped ? " · skipped" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
