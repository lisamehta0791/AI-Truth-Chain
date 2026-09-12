import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Tabs } from "@/components/ui/Tabs";
import { useAuth } from "@/context/AuthContext";
import { useActiveCase } from "@/hooks/useActiveCase";
import { useCaseWebSocket } from "@/hooks/useCaseWebSocket";
import { ApiError } from "@/lib/apiClient";
import * as evidenceApi from "@/services/evidenceApi";
import * as guidanceApi from "@/services/guidanceApi";
import { canConfirmAiOutput, type Evidence, type GuidanceSuggestion } from "@/types";

type Filter = "pending" | "accepted" | "dismissed" | "all";

/**
 * Investigation Copilot — two things side by side: the procedural next steps
 * the system suggests as evidence arrives (each citing the section of the
 * BNSS / BSA it rests on), and the grounded question-answering panel that
 * answers only from this case's evidence.
 */
export function GuidancePage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [params] = useSearchParams();
  const [items, setItems] = useState<GuidanceSuggestion[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const canReview = canConfirmAiOutput(user);
  const initialQuestion = params.get("q") ?? undefined;

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [g, e] = await Promise.all([guidanceApi.listGuidance(id), evidenceApi.listEvidenceForCase(id)]);
      setItems(g);
      setEvidence(e);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the guidance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);
  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "guidance.suggested" || event.type === "guidance.reviewed" || event.type === "evidence.ai_processed") void load(caseId, true);
  });

  async function review(id: string, action: "acknowledge" | "dismiss") {
    setBusyId(id);
    try {
      const updated = action === "acknowledge" ? await guidanceApi.acknowledgeGuidance(id) : await guidanceApi.dismissGuidance(id);
      setItems((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "The review action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    pending: items.filter((g) => g.status === "requires_review").length,
    accepted: items.filter((g) => g.status === "human_confirmed").length,
    dismissed: items.filter((g) => g.status === "dismissed").length,
    all: items.length,
  };
  const visible = useMemo(() => {
    const list = items.filter((g) => (filter === "all" ? true : filter === "pending" ? g.status === "requires_review" : filter === "accepted" ? g.status === "human_confirmed" : g.status === "dismissed"));
    return [...list].sort((a, b) => b.confidence - a.confidence);
  }, [items, filter]);
  const sourceName = (id: string | null) => {
    if (!id) return null;
    const e = evidence.find((x) => x.id === id);
    return e?.description ?? e?.original_filename ?? null;
  };
  const sections = useMemo(() => Array.from(new Set(items.map((g) => g.legal_reference))).length, [items]);

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Investigation Copilot · next steps and grounded answers"
        title="Investigation Copilot"
        live={counts.pending > 0}
        description={
          <>
            As each piece of evidence is read, the copilot proposes the procedural step it calls for and cites the section it rests on. Ask it anything about the file — it answers only from evidence logged to this case and says when the file has no answer.{" "}
            <span className="text-cot-amber">Not legal authority — confirm with a prosecutor or legal reviewer.</span>
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="guidance" size={13} />}>
              Refresh
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["scene", "cctv"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Pending steps" value={counts.pending} tone="amber" icon={<ForensicIcon name="guidance" size={16} />} hint="Suggested by the copilot, awaiting an officer" />
        <StatTile label="Accepted" value={counts.accepted} tone="mint" progress={counts.all ? counts.accepted / counts.all : 0} icon={<ForensicIcon name="check" size={16} />} hint="Added to the investigation plan" />
        <StatTile label="Dismissed" value={counts.dismissed} tone="violet" icon={<ForensicIcon name="alert" size={16} />} hint="Not applicable, with a recorded reason" />
        <StatTile label="Sections cited" value={sections} tone="ice" icon={<ForensicIcon name="document" size={16} />} hint="Distinct BNSS / BSA references" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,1fr)]">
        <div className="min-w-0">
          {loading ? (
            <ScanLoader label="Reading the procedural checklist…" rows={5} />
          ) : items.length === 0 ? (
            <EmptyState icon="guidance" title="No suggested steps yet" body="Steps appear as evidence with readable text is logged — the copilot matches each item against procedural reference material and proposes what to do next. Load the scenario from the demo strip above." />
          ) : (
            <>
              <Tabs
                id="guidance-filter"
                className="mb-3"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "pending", label: "Pending", badge: counts.pending },
                  { value: "accepted", label: "Accepted", badge: counts.accepted },
                  { value: "dismissed", label: "Dismissed", badge: counts.dismissed },
                  { value: "all", label: "All", badge: counts.all },
                ]}
              />
              <div className="rise space-y-3">
                <AnimatePresence initial={false}>
                  {visible.map((g, i) => {
                    const pending = g.status === "requires_review";
                    const src = sourceName(g.triggered_by_evidence_id);
                    return (
                      <motion.article key={g.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`hud-frame ${pending ? "hud-frame--warn" : g.status === "human_confirmed" ? "hud-frame--ok" : ""} p-4`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[color:var(--cot-line)] bg-white/[.03] font-mono text-[11px] text-cot-text2">{String(i + 1).padStart(2, "0")}</span>
                          <Chip tone={pending ? "warn" : g.status === "human_confirmed" ? "ok" : "neutral"} dot={pending}>
                            {pending ? "Requires review" : g.status === "human_confirmed" ? "Accepted" : "Dismissed"}
                          </Chip>
                          <span className="chip status-neutral !normal-case !tracking-normal !font-[Share_Tech_Mono] !text-[10px]">{g.legal_reference}</span>
                          <span className="ml-auto font-mono text-[11px] text-cot-text3">confidence {Math.round(g.confidence * 100)}%</span>
                        </div>
                        <p className="mt-3 text-[15px] leading-snug text-cot-text">{g.suggestion}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/[.06] pt-2.5 text-[11.5px] text-cot-text3">
                          {src && (
                            <span className="flex items-center gap-1.5">
                              <ForensicIcon name="evidence" size={12} /> triggered by {src}
                            </span>
                          )}
                          <span className="ml-auto font-mono">{new Date(g.created_at).toLocaleString()}</span>
                        </div>
                        {pending && canReview && (
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="mint" busy={busyId === g.id} onClick={() => void review(g.id, "acknowledge")} icon={<ForensicIcon name="check" size={12} />}>
                              Add to plan
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busyId === g.id} onClick={() => void review(g.id, "dismiss")}>
                              Dismiss
                            </Button>
                          </div>
                        )}
                        {pending && !canReview && <div className="mt-2 text-[11px] text-cot-amber">Accepting a step needs Sub-Inspector rank or above.</div>}
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
                {visible.length === 0 && <p className="py-6 text-center text-sm text-cot-text3">Nothing under this filter.</p>}
              </div>
            </>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {caseId && <CopilotPanel caseId={caseId} evidence={evidence} tall initialQuestion={initialQuestion} />}
          <Panel eyebrow="How the copilot works" title="Grounded, cited, honest about gaps" tone="ai">
            <ul className="space-y-2 text-[13px] text-cot-text2">
              <li className="flex gap-2"><span className="text-cot-mint">●</span> Reads only evidence logged to the selected case — never the internet, never other cases.</li>
              <li className="flex gap-2"><span className="text-cot-magenta">●</span> Every claim in an answer carries the evidence it rests on; click a citation to open it.</li>
              <li className="flex gap-2"><span className="text-cot-amber">●</span> States what the file does not establish, instead of guessing.</li>
              <li className="flex gap-2"><span className="text-cot-violet">●</span> Every question and answer is written to the audit trail.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
