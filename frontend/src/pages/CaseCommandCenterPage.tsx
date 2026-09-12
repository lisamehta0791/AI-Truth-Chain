import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { type BodyRegion } from "@/components/anatomy/AnatomyViewer";
import { ForensicBody3D, type Hotspot } from "@/components/autopsy3d/ForensicBody3D";
import { TimelineStrip } from "@/components/dashboard/TimelineStrip";
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
import { TiltCard } from "@/components/ui/TiltCard";
import { useActiveCase } from "@/hooks/useActiveCase";
import { useCaseWebSocket } from "@/hooks/useCaseWebSocket";
import { toBodyRegion } from "@/lib/bodyRegion";
import * as autopsyApi from "@/services/autopsyApi";
import * as closureApi from "@/services/closureApi";
import * as contradictionApi from "@/services/contradictionApi";
import * as evidenceApi from "@/services/evidenceApi";
import * as guidanceApi from "@/services/guidanceApi";
import * as timelineApi from "@/services/timelineApi";
import type { AutopsyFinding, ClosureReadinessScore, Contradiction, Evidence, GuidanceSuggestion, TimelineEvent } from "@/types";

interface Data {
  evidence: Evidence[];
  timeline: TimelineEvent[];
  contradictions: Contradiction[];
  guidance: GuidanceSuggestion[];
  autopsy: AutopsyFinding[];
  integrity: Awaited<ReturnType<typeof evidenceApi.checkChainIntegrity>> | null;
  closure: ClosureReadinessScore | null;
}

const EMPTY: Data = { evidence: [], timeline: [], contradictions: [], guidance: [], autopsy: [], integrity: null, closure: null };

/**
 * The Command Center is an OVERVIEW: how the case stands, the figure, what
 * needs an officer's attention, and a door into every module. Each module
 * owns its detail on its own page — nothing is duplicated here at length.
 */
export function CaseCommandCenterPage() {
  const navigate = useNavigate();
  const { cases, caseId, setCaseId, activeCase, error: caseError } = useActiveCase();
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion | null>(null);
  const [question, setQuestion] = useState("");

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [evidence, timeline, contradictions, guidance, autopsy, integrity, closure] = await Promise.all([
        evidenceApi.listEvidenceForCase(id),
        timelineApi.listTimeline(id),
        contradictionApi.listContradictions(id),
        guidanceApi.listGuidance(id),
        autopsyApi.listAutopsyFindings(id),
        evidenceApi.checkChainIntegrity(id).catch(() => null),
        closureApi.getClosureReadiness(id).catch(() => null),
      ]);
      setData({ evidence, timeline, contradictions, guidance, autopsy, integrity, closure });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the case overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);
  useCaseWebSocket(caseId || null, () => void load(caseId, true));

  const openContradictions = data.contradictions.filter((c) => c.status === "requires_review");
  const pendingGuidance = data.guidance.filter((g) => g.status === "requires_review");
  const unverifiedEvents = data.timeline.filter((t) => t.verification_status === "ai_extracted_unverified");
  const aiFindings = data.autopsy.filter((f) => f.status === "ai_hypothesis");
  const reviewed = data.timeline.filter((t) => t.verification_status === "human_confirmed").length + data.contradictions.filter((c) => c.status !== "requires_review").length + data.autopsy.filter((f) => f.status !== "ai_hypothesis").length;
  const integrityOk = data.integrity?.is_valid ?? null;
  const score = data.closure?.score ?? null;

  const placed = useMemo(() => data.autopsy.map((f) => ({ f, region: toBodyRegion(f.body_region) })), [data.autopsy]);
  const hotspots = useMemo<Hotspot[]>(
    () =>
      placed
        .filter((x): x is { f: AutopsyFinding; region: BodyRegion } => x.region !== null && x.f.status !== "dismissed")
        .map(({ f, region }) => ({ region, label: f.finding_type.replace(/_/g, " "), finding: f.ai_hypothesis, severity: f.status === "ai_hypothesis" ? "critical" : "warning", confidence: f.confidence })),
    [placed]
  );
  const flagged = useMemo(() => new Set(placed.filter((p) => p.region && p.f.status !== "dismissed").map((p) => p.region as string)), [placed]);

  const evidenceName = (id: string) => data.evidence.find((e) => e.id === id)?.description ?? data.evidence.find((e) => e.id === id)?.original_filename ?? "evidence";

  const attention = useMemo(() => {
    const items: Array<{ key: string; tone: "critical" | "warn" | "ai"; title: string; body: string; to: string; cta: string }> = [];
    openContradictions.slice(0, 2).forEach((c) =>
      items.push({ key: `c-${c.id}`, tone: c.severity === "major" ? "critical" : "warn", title: `${evidenceName(c.evidence_a_id)} vs ${evidenceName(c.evidence_b_id)}`, body: c.explanation, to: "/contradictions", cta: "Review" })
    );
    if (aiFindings.length) items.push({ key: "autopsy", tone: "ai", title: `${aiFindings.length} post-mortem finding${aiFindings.length > 1 ? "s" : ""} await the forensic officer`, body: aiFindings[0].ai_hypothesis, to: "/autopsy", cta: "Cross-check" });
    if (pendingGuidance.length) items.push({ key: "guidance", tone: "warn", title: `${pendingGuidance.length} suggested next step${pendingGuidance.length > 1 ? "s" : ""}`, body: pendingGuidance[0].suggestion, to: "/guidance", cta: "Open copilot" });
    if (integrityOk === false) items.unshift({ key: "chain", tone: "critical", title: "Hash chain broken", body: "A stored hash no longer matches its file or its link. Open the ledger to see which block.", to: "/ledger", cta: "Ledger" });
    return items.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openContradictions, aiFindings, pendingGuidance, integrityOk, data.evidence]);

  const modules: Array<{ to: string; icon: ForensicIconName; label: string; count: string; hint: string; tone?: "ai" | "ok" | "warn" | "critical" | "neutral" }> = [
    { to: "/timeline", icon: "timeline", label: "Timeline", count: `${data.timeline.length}`, hint: `${unverifiedEvents.length} unverified`, tone: unverifiedEvents.length ? "ai" : "ok" },
    { to: "/contradictions", icon: "contradiction", label: "Contradictions", count: `${openContradictions.length}`, hint: "open for decision", tone: openContradictions.length ? "critical" : "ok" },
    { to: "/guidance", icon: "guidance", label: "Investigation Copilot", count: `${pendingGuidance.length}`, hint: "next steps pending", tone: pendingGuidance.length ? "warn" : "ok" },
    { to: "/autopsy", icon: "autopsy", label: "Autopsy cross-check", count: `${data.autopsy.length}`, hint: `${aiFindings.length} hypotheses`, tone: aiFindings.length ? "ai" : "ok" },
    { to: "/ledger", icon: "lock", label: "Hash ledger", count: integrityOk === null ? "—" : integrityOk ? "VALID" : "BROKEN", hint: `${data.evidence.length} blocks`, tone: integrityOk === false ? "critical" : "ok" },
    { to: "/evidence/graph", icon: "graph", label: "Evidence graph", count: "", hint: "people · places · devices", tone: "neutral" },
    { to: "/chain-of-custody", icon: "custody", label: "Chain of custody", count: `${data.evidence.length}`, hint: "sealed items", tone: "neutral" },
    { to: "/location", icon: "map", label: "Predictive location", count: `${data.evidence.filter((e) => e.gps_lat != null).length}`, hint: "geo-tagged items", tone: "neutral" },
    { to: "/closure-score", icon: "check", label: "Case review", count: score === null ? "—" : `${Math.round(score)}%`, hint: "closure readiness", tone: score === null ? "neutral" : score >= 70 ? "ok" : score >= 40 ? "warn" : "critical" },
    { to: "/chargesheet", icon: "document", label: "Chargesheet QA", count: "", hint: "claims vs evidence", tone: "neutral" },
    { to: "/statements", icon: "document", label: "Statement reliability", count: `${data.evidence.filter((e) => e.evidence_type === "statement").length}`, hint: "statements on file", tone: "neutral" },
    { to: "/case-similarity", icon: "graph", label: "Case similarity", count: "", hint: "same pattern elsewhere?", tone: "neutral" },
  ];

  function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    navigate(`/guidance?q=${encodeURIComponent(q)}`);
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Overview · live investigation workspace"
        live
        title={activeCase?.title ?? "Command Center"}
        description={
          activeCase ? (
            <span className="font-mono text-[12px] text-cot-text3">
              {activeCase.case_number} · opened {new Date(activeCase.created_at).toLocaleDateString()} · status <span className="uppercase text-cot-mint">{activeCase.status.replace(/_/g, " ")}</span>
            </span>
          ) : (
            "Select a case to see where it stands."
          )
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <LinkButton to="/evidence/ingest" variant="primary" size="sm">
              <ForensicIcon name="plus" size={13} /> Add evidence
            </LinkButton>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} className="mb-5" />}

      {(error || caseError) && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error ?? caseError}
        </div>
      )}

      {loading ? (
        <ScanLoader label="Assembling the case overview…" rows={6} />
      ) : !caseId ? (
        <EmptyState icon="dashboard" title="No case selected" body="Create a case or pick one from the selector to open its command centre." />
      ) : (
        <>
          {/* KPI row */}
          <div className="rise mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Evidence items" value={data.evidence.length} tone="violet" icon={<ForensicIcon name="evidence" size={16} />} hint={`${data.evidence.filter((e) => e.live_capture_sha256).length} with live capture`} />
            <StatTile label="Timeline events" value={data.timeline.length} tone="ice" icon={<ForensicIcon name="timeline" size={16} />} progress={data.timeline.length ? (data.timeline.length - unverifiedEvents.length) / data.timeline.length : 0} hint={`${data.timeline.length - unverifiedEvents.length} officer-confirmed`} />
            <StatTile label="Open contradictions" value={openContradictions.length} tone="red" icon={<ForensicIcon name="contradiction" size={16} />} hint={`${data.contradictions.length - openContradictions.length} decided`} />
            <StatTile label="AI hypotheses" value={unverifiedEvents.length + aiFindings.length + pendingGuidance.length} tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint="awaiting an officer's decision" />
            <StatTile label="Human reviewed" value={reviewed} tone="mint" icon={<ForensicIcon name="check" size={16} />} hint="decisions in the audit trail" />
            <StatTile label="Chain integrity" value={integrityOk === null ? "—" : integrityOk ? "VALID" : "BROKEN"} tone={integrityOk === false ? "red" : "mint"} icon={<ForensicIcon name="lock" size={16} />} hint={`${data.evidence.length} blocks · SHA-256 linked`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
            {/* the figure */}
            <Panel padded={false} className="relative min-h-[600px] overflow-hidden">
              <div className="absolute right-4 top-4 z-20 flex items-center gap-2 pointer-events-none">
                <span className="chip status-ai" style={{ pointerEvents: "auto" }}>{data.autopsy.length} post-mortem findings</span>
                <Link to="/autopsy" className="chip status-neutral hover:text-white" style={{ pointerEvents: "auto" }}>Open cross-check →</Link>
              </div>
              <div className="h-[600px] pt-0">
                {data.autopsy.length === 0 ? (
                  <div className="grid h-full place-items-center px-6 text-center">
                    <div>
                      <ForensicIcon name="autopsy" size={34} className="mx-auto text-cot-violet" />
                      <h3 className="mt-3 text-sm text-white">No post-mortem report on file</h3>
                      <p className="mt-1 max-w-sm text-sm text-cot-text2">The figure fills in when a post-mortem report is logged as evidence. Load stage 6 of the demo scenario above.</p>
                    </div>
                  </div>
                ) : (
                  <ForensicBody3D hotspots={hotspots} findings={flagged} selectedRegion={selectedRegion} onSelectRegion={(r) => setSelectedRegion((cur) => (cur === r ? null : r))} autoRotate />
                )}
              </div>
            </Panel>

            {/* at a glance */}
            <div className="space-y-4">
              <Panel eyebrow="Needs an officer" title={`Attention queue · ${attention.length}`} tone={attention.some((a) => a.tone === "critical") ? "crit" : "warn"}>
                {attention.length === 0 ? (
                  <p className="text-sm text-cot-text2">Nothing is waiting on a decision. The file is in the officers' hands.</p>
                ) : (
                  <ul className="rise space-y-2">
                    {attention.map((a) => (
                      <li key={a.key} className={`rounded-xl border p-3 ${a.tone === "critical" ? "border-cot-red/40 bg-cot-red/[.06]" : a.tone === "warn" ? "border-cot-amber/40 bg-cot-amber/[.06]" : "border-cot-magenta/40 bg-cot-magenta/[.06]"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold text-white">{a.title}</div>
                            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-cot-text2">{a.body}</p>
                          </div>
                          <LinkButton to={a.to} size="sm" variant={a.tone === "critical" ? "danger" : "default"} className="shrink-0">
                            {a.cta}
                          </LinkButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel eyebrow="Closure readiness" title={score === null ? "Not yet scored" : `${Math.round(score)}% ready`} actions={<Link to="/closure-score" className="label-caps text-cot-violet hover:text-white">Case review →</Link>}>
                <div className="flex items-center gap-4">
                  <div className="relative grid h-20 w-20 shrink-0 place-items-center">
                    <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
                      <motion.circle cx="40" cy="40" r="34" fill="none" stroke={score !== null && score >= 70 ? "#06ffa5" : score !== null && score >= 40 ? "#ffb547" : "#ff3d71"} strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 34} initial={{ strokeDashoffset: 2 * Math.PI * 34 }} animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - (score ?? 0) / 100) }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
                    </svg>
                    <span className="stat-value !text-[20px] text-white">{score === null ? "—" : <CountUp value={score} />}</span>
                  </div>
                  <ul className="grid flex-1 gap-1 text-[12.5px] text-cot-text2">
                    <li className="flex justify-between"><span>Unverified timeline events</span><b className="text-cot-magenta">{unverifiedEvents.length}</b></li>
                    <li className="flex justify-between"><span>Open contradictions</span><b className="text-cot-red">{openContradictions.length}</b></li>
                    <li className="flex justify-between"><span>Pending guidance</span><b className="text-cot-amber">{pendingGuidance.length}</b></li>
                    <li className="flex justify-between"><span>Hash chain</span><b className={integrityOk === false ? "text-cot-red" : "text-cot-mint"}>{integrityOk === null ? "—" : integrityOk ? "valid" : "broken"}</b></li>
                  </ul>
                </div>
              </Panel>

              <Panel eyebrow="Investigation Copilot" title="Ask the case file">
                <form onSubmit={ask} className="flex gap-2">
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Where was the suspect between 20:44 and 21:15?" className="min-w-0 flex-1 !py-2 !text-[14px]" aria-label="Ask the copilot" />
                  <Button type="submit" variant="primary" size="sm" icon={<ForensicIcon name="arrow" size={13} />}>
                    Ask
                  </Button>
                </form>
                <p className="mt-2 text-[12px] text-cot-text3">Answers cite only evidence logged to this case, and say when the file does not contain an answer.</p>
              </Panel>
            </div>
          </div>

          {/* chronology strip */}
          <div className="mt-5">
            <TimelineStrip events={data.timeline} evidence={data.evidence} onShowEvidence={() => navigate("/chain-of-custody")} />
          </div>

          {/* modules */}
          <div className="mt-5">
            <div className="eyebrow mb-3">Modules · each has its own page</div>
            <div className="rise grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {modules.map((m) => (
                <TiltCard key={m.to} className="hud-frame" glare>
                  <Link to={m.to} className="block h-full p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-lg border border-[color:var(--cot-line)] bg-[rgba(167,139,250,.08)] text-cot-violet">
                        <ForensicIcon name={m.icon} size={17} />
                      </span>
                      {m.count && <span className={`stat-value !text-[18px] ${m.tone === "critical" ? "text-cot-red" : m.tone === "ai" ? "text-cot-magenta" : m.tone === "warn" ? "text-cot-amber" : m.tone === "ok" ? "text-cot-mint" : "text-white"}`}>{m.count}</span>}
                    </div>
                    <div className="mt-3 text-[13.5px] font-bold text-white">{m.label}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11.5px] text-cot-text3">
                      <span>{m.hint}</span>
                      {m.tone && m.tone !== "neutral" && <Chip tone={m.tone} className="!px-1.5 !text-[7px]">{m.tone === "ok" ? "clear" : "act"}</Chip>}
                    </div>
                  </Link>
                </TiltCard>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
