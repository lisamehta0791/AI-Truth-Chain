import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import { ApiError } from "@/lib/apiClient";
import * as chargesheetApi from "@/services/chargesheetApi";
import * as evidenceApi from "@/services/evidenceApi";
import { canConfirmAiOutput, type ChargesheetCheck, type ChargesheetCheckStatus, type Evidence } from "@/types";

type Filter = "all" | ChargesheetCheckStatus;

const STATUS: Record<ChargesheetCheckStatus, { label: string; tone: "ok" | "warn" | "critical" | "ai"; blurb: string; color: string }> = {
  pass: { label: "Pass", tone: "ok", blurb: "Consistent with the verified evidence.", color: "#06ffa5" },
  warning: { label: "Warning", tone: "warn", blurb: "Supported only by unverified or partial evidence — tighten before filing.", color: "#ffb547" },
  conflict: { label: "Conflict", tone: "critical", blurb: "The evidence says otherwise. Filing this claim invites a challenge in court.", color: "#ff3d71" },
  missing_support: { label: "Missing support", tone: "ai", blurb: "Nothing in the file supports this claim yet.", color: "#f472b6" },
};

const SAMPLE = "It is alleged that on the night of 14 April 2025 the accused, Arvind Sekar, visited Devan Krishnan in Room 412 of the Riverside Hotel. At approximately 20:00 an argument took place. The accused left the hotel through the main lobby at 21:15.";

/**
 * Chargesheet QA — every claim in the draft checked against the verified
 * case timeline before it leaves the station. For a human legal reviewer;
 * not a legal determination.
 */
export function ChargesheetQaPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [checks, setChecks] = useState<ChargesheetCheck[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const canRun = canConfirmAiOutput(user);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [c, e] = await Promise.all([chargesheetApi.listChargesheetChecks(id), evidenceApi.listEvidenceForCase(id)]);
      setChecks(c);
      setEvidence(e);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the chargesheet checks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);

  async function run() {
    if (!caseId || !draft.trim()) return;
    setRunning(true);
    setError(null);
    try {
      setChecks(await chargesheetApi.runChargesheetQa(caseId, draft));
      setDraftOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "The QA run failed.");
    } finally {
      setRunning(false);
    }
  }

  const counts = useMemo(
    () => ({
      all: checks.length,
      pass: checks.filter((c) => c.status === "pass").length,
      warning: checks.filter((c) => c.status === "warning").length,
      conflict: checks.filter((c) => c.status === "conflict").length,
      missing_support: checks.filter((c) => c.status === "missing_support").length,
    }),
    [checks]
  );
  const visible = useMemo(() => (filter === "all" ? checks : checks.filter((c) => c.status === filter)), [checks, filter]);
  const readiness = counts.all ? Math.round(((counts.pass + counts.warning * 0.5) / counts.all) * 100) : 0;
  const evidenceName = (id: string) => {
    const e = evidence.find((x) => x.id === id);
    return e?.description ?? e?.original_filename ?? id.slice(0, 8);
  };

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Pre-filing · claims against the verified record"
        title="Chargesheet QA"
        live={counts.conflict > 0}
        description={
          <>
            Each claim in the draft is checked against the case timeline and the evidence behind it. Conflicts and unsupported claims are flagged before the file leaves the station. <span className="text-cot-amber">For a legal reviewer — not a legal determination.</span>
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            {canRun && (
              <Button size="sm" variant="primary" onClick={() => setDraftOpen((v) => !v)} icon={<ForensicIcon name="document" size={13} />}>
                {draftOpen ? "Hide draft" : "Check a draft"}
              </Button>
            )}
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["prefiling"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Claims checked" value={counts.all} tone="violet" icon={<ForensicIcon name="document" size={16} />} hint="From the last QA run" />
        <StatTile label="Pass" value={counts.pass} tone="mint" icon={<ForensicIcon name="check" size={16} />} hint="Consistent with evidence" />
        <StatTile label="Warning" value={counts.warning} tone="amber" icon={<ForensicIcon name="alert" size={16} />} hint="Weakly supported" />
        <StatTile label="Conflict" value={counts.conflict} tone="red" icon={<ForensicIcon name="contradiction" size={16} />} hint="Evidence says otherwise" />
        <StatTile label="Unsupported" value={counts.missing_support} tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint="Nothing in the file yet" />
        <StatTile label="Filing readiness" value={readiness} suffix="%" tone={readiness >= 70 ? "mint" : readiness >= 40 ? "amber" : "red"} progress={readiness / 100} icon={<ForensicIcon name="shield" size={16} />} hint="pass + ½ warning, over all claims" />
      </div>

      <AnimatePresence initial={false}>
        {draftOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
            <Panel eyebrow="Draft chargesheet" title="Paste the claims to check" busy={running} tone="warn">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} placeholder={SAMPLE} className="w-full font-[Rajdhani] !text-[14.5px] leading-relaxed" aria-label="Chargesheet draft text" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" busy={running} disabled={!draft.trim()} onClick={() => void run()} icon={<ForensicIcon name="check" size={13} />}>
                  Run QA
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDraft(SAMPLE)}>
                  Use a sample draft
                </Button>
                <span className="ml-auto text-[12px] text-cot-text3">Each sentence is treated as one claim and matched against the timeline.</span>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <ScanLoader label="Reading the last QA run…" rows={5} />
      ) : checks.length === 0 ? (
        <EmptyState icon="document" title="No chargesheet has been checked yet" body="Paste a draft above and run QA, or load stage 9 of the scenario — it checks a draft with seven claims, two of which the evidence contradicts." action={canRun ? <Button size="sm" variant="primary" onClick={() => setDraftOpen(true)}>Check a draft</Button> : undefined} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Tabs
              id="cs-filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", badge: counts.all },
                { value: "conflict", label: "Conflict", badge: counts.conflict },
                { value: "warning", label: "Warning", badge: counts.warning },
                { value: "missing_support", label: "Unsupported", badge: counts.missing_support },
                { value: "pass", label: "Pass", badge: counts.pass },
              ]}
            />
            <span className="ml-auto font-mono text-[11px] text-cot-text3">last run {new Date(checks[0].created_at).toLocaleString()}</span>
          </div>
          <div className="rise space-y-3">
            <AnimatePresence initial={false}>
              {visible.map((c, i) => {
                const st = STATUS[c.status];
                return (
                  <motion.article key={c.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="hud-frame p-4" style={{ borderLeft: `3px solid ${st.color}` }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg border border-[color:var(--cot-line)] bg-white/[.03] font-mono text-[11px] text-cot-text2">{String(i + 1).padStart(2, "0")}</span>
                      <Chip tone={st.tone} dot={c.status === "conflict"}>{st.label}</Chip>
                      <span className="text-[12px] text-cot-text3">{st.blurb}</span>
                    </div>
                    <p className="mt-3 text-[15.5px] leading-snug text-white">“{c.claim_text}”</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[.06] pt-2.5">
                      {c.linked_evidence_ids && c.linked_evidence_ids.length > 0 ? (
                        <>
                          <span className="label-caps text-cot-text3">{c.status === "conflict" ? "Contradicted by" : "Rests on"}</span>
                          {c.linked_evidence_ids.map((id) => (
                            <Link key={id} to="/chain-of-custody" className="chip status-neutral !normal-case !tracking-normal !font-[Rajdhani] !text-[11.5px] hover:!border-cot-violet hover:text-white">
                              <ForensicIcon name="evidence" size={10} /> {evidenceName(id)}
                            </Link>
                          ))}
                        </>
                      ) : (
                        <span className="text-[12px] text-cot-text3">No evidence in the file bears on this claim.</span>
                      )}
                      {c.status === "conflict" && (
                        <Link to="/timeline" className="ml-auto text-[12px] text-cot-red hover:text-white">
                          See the timeline →
                        </Link>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
            {visible.length === 0 && <p className="py-6 text-center text-sm text-cot-text3">Nothing under this filter.</p>}
          </div>
        </>
      )}
    </AppShell>
  );
}
