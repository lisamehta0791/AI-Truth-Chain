import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/apiClient";
import * as demoApi from "@/services/demoApi";
import { canManageAccounts } from "@/types";

interface Props {
  caseId: string;
  /** Called after any stage is loaded / the case is reset, so the page refetches. */
  onChanged?: () => void;
  /** Which stage keys this page needs before it has something to show. Used for the hint copy. */
  needs?: string[];
  className?: string;
}

/**
 * The demonstration control that lives at the top of EVERY case page.
 *
 * Shows how much of the Riverside Hotel scenario is loaded, and lets a
 * presenter (Deputy Superintendent and above) load the next stage, load
 * everything, or reset — from whichever page they are standing on. While a
 * long load runs, progress is polled so the bar moves stage by stage.
 */
export function DemoStrip({ caseId, onChanged, needs, className = "" }: Props) {
  const { user } = useAuth();
  const presenter = canManageAccounts(user);
  const [status, setStatus] = useState<demoApi.ScenarioStatus | null>(null);
  const [busy, setBusy] = useState<"next" | "all" | "reset" | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      setStatus(await demoApi.getScenario(caseId));
    } catch {
      setStatus(null); // not a demo-capable case or the endpoint is unavailable — stay quiet
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while a long-running load is in flight so the bar advances live.
  useEffect(() => {
    if (busy === "all" || busy === "next") {
      poll.current = window.setInterval(() => {
        void refresh();
        onChanged?.();
      }, 4000);
    }
    return () => {
      if (poll.current) window.clearInterval(poll.current);
      poll.current = null;
    };
  }, [busy, refresh, onChanged]);

  async function run(kind: "next" | "all" | "reset") {
    if (!caseId) return;
    setError(null);
    setBusy(kind);
    try {
      if (kind === "next") setStatus(await demoApi.loadNextStage(caseId));
      if (kind === "all") setStatus(await demoApi.loadAllStages(caseId));
      if (kind === "reset") {
        if (!window.confirm("Reset the demo case? All evidence and AI output for this case will be removed.")) {
          setBusy(null);
          return;
        }
        setStatus(await demoApi.resetScenario(caseId));
      }
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "The scenario action failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!status || (!status.primary && status.loaded_count === 0)) return null;

  const pct = status.total ? status.loaded_count / status.total : 0;
  const missing = needs?.filter((k) => !status.stages.find((s) => s.key === k)?.loaded) ?? [];
  const nextStage = status.stages.find((s) => s.key === status.next_stage_key);

  return (
    <section className={`hud-frame hud-frame--warn relative overflow-hidden ${busy ? "scan-active" : ""} ${className}`} aria-label="Demonstration scenario">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-center gap-3 !overflow-visible text-left" aria-expanded={open}>
          <span className="chip status-warn">Demo</span>
          <span className="truncate text-[14px] font-semibold text-white">Riverside Hotel scenario</span>
          <span className="font-mono text-[11px] text-cot-text3">
            stage {status.loaded_count}/{status.total}
          </span>
        </button>

        {/* Segmented progress */}
        <div className="flex flex-1 items-center gap-1" aria-hidden="true">
          {status.stages.map((s, i) => (
            <motion.span
              key={s.key}
              title={s.title}
              initial={false}
              animate={{ opacity: s.loaded ? 1 : 0.25, scaleY: s.loaded ? 1 : 0.6 }}
              transition={{ delay: i * 0.03 }}
              className={`h-1.5 flex-1 rounded-full ${s.loaded ? "bg-gradient-to-r from-cot-amber via-cot-magenta to-cot-violet shadow-[0_0_10px_rgba(244,114,182,.6)]" : "bg-white/20"}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {status.complete ? (
            <Chip tone="ok" dot>Complete</Chip>
          ) : missing.length > 0 ? (
            <Chip tone="warn">This page needs stage{missing.length > 1 ? "s" : ""} {missing.map((k) => status.stages.findIndex((s) => s.key === k) + 1).join(", ")}</Chip>
          ) : null}
          {presenter ? (
            <>
              {!status.complete && (
                <Button size="sm" variant="primary" busy={busy === "all"} disabled={!!busy} onClick={() => run("all")}>
                  {busy === "all" ? `Loading ${Math.round(pct * 100)}%` : "Load full demo"}
                </Button>
              )}
              {!status.complete && (
                <Button size="sm" busy={busy === "next"} disabled={!!busy} onClick={() => run("next")} title={nextStage?.title}>
                  Next stage
                </Button>
              )}
              <Button size="sm" variant="ghost" busy={busy === "reset"} disabled={!!busy} onClick={() => run("reset")}>
                Reset
              </Button>
            </>
          ) : (
            !status.complete && <span className="text-xs text-cot-text3">Ask an officer of DSP rank or above to load the scenario.</span>
          )}
        </div>
      </div>

      {error && <div className="border-t border-cot-red/30 bg-cot-red/10 px-4 py-2 text-xs text-cot-red">{error}</div>}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/[.06]">
            <ol className="grid gap-1.5 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {status.stages.map((stage, i) => (
                <li key={stage.key} className={`flex items-start gap-3 rounded-lg px-2.5 py-2 text-xs ${stage.loaded ? "text-cot-text2" : stage.key === status.next_stage_key ? "bg-cot-amber/[.07] text-cot-amber" : "text-cot-text3"}`}>
                  <span className={`label-caps mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${stage.loaded ? "border-cot-mint/60 text-cot-mint" : "border-white/15"}`}>{stage.loaded ? "✓" : i + 1}</span>
                  <span>
                    <span className="font-semibold text-white">{stage.title}</span>
                    <span className="ml-2 font-mono text-[10px] text-cot-text3">{stage.item_count} item(s)</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed">{stage.narration}</span>
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
