import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button, LinkButton } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForensicIcon, type ForensicIconName } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useActiveCase } from "@/hooks/useActiveCase";
import { ApiError } from "@/lib/apiClient";
import * as closureApi from "@/services/closureApi";
import * as timelineApi from "@/services/timelineApi";
import type { ClosureReadinessScore } from "@/types";

const bandColor = (s: number) => (s >= 70 ? "#06ffa5" : s >= 40 ? "#ffb547" : "#ff3d71");
const bandLabel = (s: number) => (s >= 70 ? "Ready for review" : s >= 40 ? "Work remaining" : "Not ready");

/**
 * Case review — closure readiness. One honest number and the arithmetic
 * behind it: how much of the timeline is still unverified, how many
 * contradictions are open, how many suggested steps are pending, and whether
 * the hash chain holds. Every blocker links to the page that clears it.
 */
export function CaseClosureReadinessPage() {
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [score, setScore] = useState<ClosureReadinessScore | null>(null);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([closureApi.getClosureReadiness(id), timelineApi.listTimeline(id).catch(() => [])]);
      setScore(s);
      setTimelineTotal(t.length);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not compute closure readiness.");
      setScore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);

  async function recompute() {
    setComputing(true);
    await load(caseId, true);
    setComputing(false);
  }

  const f = score?.factors;
  const unverifiedShare = f && timelineTotal ? f.unverified_timeline_events / timelineTotal : 0;
  const penalties = f
    ? [
        { key: "timeline", label: "Unverified timeline events", value: `${f.unverified_timeline_events} of ${timelineTotal}`, penalty: Math.round(40 * unverifiedShare), max: 40, to: "/timeline", icon: "timeline" as ForensicIconName, fix: "Confirm or dismiss each AI-extracted event." },
        { key: "contradictions", label: "Open contradictions", value: `${f.open_contradictions}`, penalty: Math.min(30, Math.round(8 * f.open_contradictions)), max: 30, to: "/contradictions", icon: "contradiction" as ForensicIconName, fix: "Decide each contradiction with a recorded note." },
        { key: "guidance", label: "Pending guidance", value: `${f.pending_guidance_items}`, penalty: Math.min(15, Math.round(1.5 * f.pending_guidance_items)), max: 15, to: "/guidance", icon: "guidance" as ForensicIconName, fix: "Accept or dismiss each suggested step." },
        { key: "chain", label: "Hash chain", value: f.hash_chain_valid ? "valid" : "BROKEN", penalty: f.hash_chain_valid ? 0 : 40, max: 40, to: "/ledger", icon: "lock" as ForensicIconName, fix: f.hash_chain_valid ? "Every link verified." : "Investigate the broken block before anything else." },
      ]
    : [];
  const s = score?.score ?? 0;
  const R = 84;
  const C = 2 * Math.PI * R;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Pre-filing · is this file ready to leave the station?"
        title="Case review"
        description={
          <>
            One honest readiness number and the arithmetic behind it. Nothing here is a legal determination; it is a checklist of what an officer still has to decide.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="primary" busy={computing} onClick={() => void recompute()} icon={<ForensicIcon name="check" size={13} />}>
              Recompute
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["prefiling"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      {loading ? (
        <ScanLoader label="Scoring the file…" rows={5} />
      ) : !score || !f ? (
        <EmptyState icon="check" title="No readiness score yet" body="The score is computed from the timeline, contradictions, guidance and the hash chain. Load evidence or the scenario, then recompute." />
      ) : (
        <>
          <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile label="Evidence items" value={f.evidence_count} tone="violet" icon={<ForensicIcon name="evidence" size={16} />} hint="Sealed in the chain" />
            <StatTile label="Unverified events" value={f.unverified_timeline_events} tone="magenta" icon={<ForensicIcon name="timeline" size={16} />} hint={`${Math.round(unverifiedShare * 100)}% of the timeline`} />
            <StatTile label="Open contradictions" value={f.open_contradictions} tone={f.open_contradictions ? "red" : "mint"} icon={<ForensicIcon name="contradiction" size={16} />} hint="Awaiting an officer's decision" />
            <StatTile label="Pending guidance" value={f.pending_guidance_items} tone={f.pending_guidance_items ? "amber" : "mint"} icon={<ForensicIcon name="guidance" size={16} />} hint="Suggested steps not yet decided" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Panel padded className="grid place-items-center">
              <div className="relative grid h-56 w-56 place-items-center">
                <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
                  <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="14" />
                  <motion.circle cx="100" cy="100" r={R} fill="none" stroke={bandColor(s)} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - s / 100) }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} style={{ filter: `drop-shadow(0 0 10px ${bandColor(s)})` }} />
                </svg>
                <div className="text-center">
                  <div className="stat-value !text-[46px]" style={{ color: bandColor(s) }}>
                    <CountUp value={s} decimals={0} />
                    <span className="text-[22px]">%</span>
                  </div>
                  <div className="label-caps mt-1 text-cot-text3">{bandLabel(s)}</div>
                </div>
              </div>
              <div className="mt-3 text-center">
                <Chip tone={s >= 70 ? "ok" : s >= 40 ? "warn" : "critical"} dot>{bandLabel(s)}</Chip>
                <div className="mt-2 font-mono text-[11px] text-cot-text3">computed {new Date(score.computed_at).toLocaleString()}</div>
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel eyebrow="The arithmetic" title="100 − penalties = readiness">
                <ul className="rise space-y-3">
                  {penalties.map((p) => (
                    <li key={p.key} className="rounded-xl border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[color:var(--cot-line)] text-cot-violet">
                          <ForensicIcon name={p.icon} size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] font-semibold text-white">{p.label}</span>
                            <span className="font-mono text-[12px] text-cot-text2">{p.value}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                            <motion.span className="block h-full rounded-full" style={{ background: p.penalty > 0 ? "#ff3d71" : "#06ffa5" }} initial={{ width: 0 }} animate={{ width: `${(p.penalty / p.max) * 100}%` }} transition={{ duration: 0.9 }} />
                          </div>
                        </div>
                        <span className={`stat-value !text-[18px] ${p.penalty ? "text-cot-red" : "text-cot-mint"}`}>−{p.penalty}</span>
                        <LinkButton to={p.to} size="sm" variant={p.penalty ? "default" : "ghost"}>
                          {p.penalty ? "Clear" : "View"}
                        </LinkButton>
                      </div>
                      <p className="mt-2 text-[12.5px] text-cot-text3">{p.fix} <span className="text-cot-text4">(up to −{p.max})</span></p>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel eyebrow="Method" title={f.method} tone="ai">
                <p className="text-[12.5px] leading-relaxed text-cot-text2">
                  Deterministic. Unverified share of the timeline weighs the most because an unverified chronology is what a defence will attack first; a broken hash chain is disqualifying on its own. The <Link to="/audit" className="text-cot-violet hover:text-white">audit trail</Link> records every decision that moved this number.
                </p>
              </Panel>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
