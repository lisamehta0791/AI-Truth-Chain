import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { ApiError } from "@/lib/apiClient";
import * as copilotApi from "@/services/copilotApi";
import type { Evidence } from "@/types";

interface Turn {
  id: string;
  role: "officer" | "copilot";
  text: string;
  citations?: string[];
  confidence?: number;
  gaps?: string[];
  unavailable?: boolean;
}

interface Props {
  caseId: string;
  evidence: Evidence[];
  className?: string;
  /** Tighter header and shorter transcript for a dashboard rail. */
  compact?: boolean;
  /** Override the server's suggested questions (falls back to /copilot/suggestions). */
  suggestedQuestions?: string[];
  /** Called when an officer clicks a citation chip — the host can highlight that evidence. */
  onCite?: (evidenceId: string) => void;
  /** A question to ask as soon as the panel mounts (e.g. handed over from the dashboard). */
  initialQuestion?: string;
  /** Taller transcript for a page that is mostly the copilot. */
  tall?: boolean;
}

/**
 * Ask the case file. Answers are grounded in this case's evidence only, cite
 * the evidence they rest on, and say when the file doesn't contain an answer.
 * Every question is written to the audit trail server-side.
 */
export function CopilotPanel({ caseId, evidence, className = "", compact = false, suggestedQuestions, onCite, initialQuestion, tall = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [fetched, setFetched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const suggestions = suggestedQuestions ?? fetched;

  useEffect(() => {
    if (suggestedQuestions) return;
    copilotApi.suggestedQuestions().then(setFetched).catch(() => setFetched([]));
  }, [suggestedQuestions]);
  useEffect(() => {
    setTurns([]);
  }, [caseId]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);
  const askedInitial = useRef<string | null>(null);
  useEffect(() => {
    if (initialQuestion && caseId && askedInitial.current !== `${caseId}:${initialQuestion}`) {
      askedInitial.current = `${caseId}:${initialQuestion}`;
      void submit(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, caseId]);

  const nameOf = (id: string) => {
    const e = evidence.find((x) => x.id === id);
    return e?.description ?? e?.original_filename ?? id.slice(0, 8);
  };

  async function submit(q: string) {
    const text = q.trim();
    if (!text || busy || !caseId) return;
    setQuestion("");
    setTurns((t) => [...t, { id: crypto.randomUUID(), role: "officer", text }]);
    setBusy(true);
    try {
      const a = await copilotApi.ask(caseId, text);
      setTurns((t) => [...t, { id: crypto.randomUUID(), role: "copilot", text: a.answer, citations: a.citations, confidence: a.confidence, gaps: a.gaps, unavailable: a.ai_unavailable }]);
    } catch (err) {
      setTurns((t) => [...t, { id: crypto.randomUUID(), role: "copilot", text: err instanceof ApiError ? String(err.detail) : "The copilot could not be reached.", unavailable: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`hud-frame hud-frame--ai flex flex-col ${busy ? "scan-active" : ""} ${className}`} aria-label="Investigation copilot">
      <div className="flex items-center justify-between border-b border-[color:var(--cot-line)] px-4 py-3">
        <div className="min-w-0">
          <span className="eyebrow text-cot-magenta">Investigation copilot</span>
          <h2 className="mt-0.5 text-[13px] leading-tight text-white">Ask the case file</h2>
        </div>
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cot-magenta/40 bg-[rgba(244,114,182,.12)] text-cot-magenta shadow-glow-magenta">
          <ForensicIcon name="brain" size={15} />
          <span className="pulse-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cot-magenta" />
        </span>
      </div>

      <div ref={scroller} className={`cc-scroll flex-1 space-y-3 overflow-y-auto p-4 ${compact ? "max-h-56 min-h-[96px]" : tall ? "max-h-[560px] min-h-[320px]" : "max-h-80 min-h-[140px]"}`}>
        {turns.length === 0 && (
          <p className="text-xs leading-relaxed text-cot-text2">
            Answers come only from evidence logged to this case and cite it. The copilot says when the file does not contain an answer — it never guesses.
          </p>
        )}
        <AnimatePresence initial={false}>
          {turns.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={t.role === "officer" ? "flex justify-end" : ""}>
              <div className={`max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${t.role === "officer" ? "bg-[rgba(124,58,237,.22)] text-white" : t.unavailable ? "border border-cot-amber/30 bg-cot-amber/[.06] text-cot-amber" : "border border-cot-magenta/30 bg-cot-magenta/[.07] text-cot-text"}`}>
                <div className="whitespace-pre-wrap">{t.text}</div>
                {t.role === "copilot" && !t.unavailable && (
                  <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                    {typeof t.confidence === "number" && (
                      <div className="font-mono text-[10px] text-cot-text2">confidence {Math.round(t.confidence * 100)}% · AI-generated, verify against the cited evidence</div>
                    )}
                    {!!t.citations?.length && (
                      <div className="flex flex-wrap gap-1">
                        {t.citations.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => onCite?.(c)}
                            title={onCite ? "Show this evidence in the vault" : nameOf(c)}
                            className={`chip status-neutral !overflow-visible !text-[8px] ${onCite ? "hover:!border-cot-mint hover:!text-cot-mint" : "cursor-default"}`}
                          >
                            <ForensicIcon name="evidence" size={9} /> {nameOf(c).slice(0, 30)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!!t.gaps?.length && <div className="text-[10px] text-cot-amber/85">Not established by the file: {t.gaps.join("; ")}</div>}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex items-center gap-2 text-xs text-cot-magenta">
            {[0, 0.2, 0.4].map((d) => (
              <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-current" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: d }} />
            ))}
            <span className="label-caps">reading the case file</span>
          </div>
        )}
      </div>

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(question); }} className="border-t border-[color:var(--cot-line)] p-3">
        <div className="flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about this case…" className="min-w-0 flex-1 !py-2 !text-[14px]" aria-label="Question for the copilot" />
          <button type="submit" disabled={busy || !question.trim()} className="btn btn-primary !px-3" aria-label="Ask">
            <ForensicIcon name="arrow" size={15} />
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2.5">
            <div className="label-caps mb-1.5 text-cot-text3">Suggested questions</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, compact ? 4 : 6).map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => void submit(s)} className="rounded-full border border-[color:var(--cot-line)] bg-[rgba(167,139,250,.05)] px-2.5 py-1 text-[11.5px] font-semibold text-cot-text2 transition-colors hover:border-cot-magenta/60 hover:text-white">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
