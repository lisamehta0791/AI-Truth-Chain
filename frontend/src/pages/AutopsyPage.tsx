import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { REGION_LABELS, type AnatomyLayer, type BodyRegion } from "@/components/anatomy/AnatomyViewer";
import { ForensicBody3D, type Hotspot } from "@/components/autopsy3d/ForensicBody3D";
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
import { toBodyRegion } from "@/lib/bodyRegion";
import { ApiError } from "@/lib/apiClient";
import * as autopsyApi from "@/services/autopsyApi";
import * as contradictionApi from "@/services/contradictionApi";
import * as evidenceApi from "@/services/evidenceApi";
import * as timelineApi from "@/services/timelineApi";
import { canConfirmAiOutput, type AutopsyFinding, type Contradiction, type Evidence, type TimelineEvent } from "@/types";

type Filter = "all" | "hypothesis" | "confirmed" | "dismissed";

const REGION_KEYWORDS: Record<BodyRegion, RegExp> = {
  head: /head|skull|neck|face|jaw|scalp/i,
  chest: /chest|thora|rib|lung|heart|sternum/i,
  abdomen: /abdom|pelvi|stomach|liver|hip|groin|back/i,
  left_arm: /left (arm|hand|wrist|forearm|shoulder)/i,
  right_arm: /right (arm|hand|wrist|forearm|shoulder)/i,
  left_leg: /left (leg|thigh|knee|femur|foot|ankle)|femoral/i,
  right_leg: /right (leg|thigh|knee|femur|foot|ankle)/i,
};

function severityOf(f: AutopsyFinding): Hotspot["severity"] {
  if (f.status === "dismissed") return "info";
  if (f.status === "human_confirmed") return "warning";
  return /fatal|haemorr|hemorr|stab|fracture|wound|penetrat|cause of death/i.test(`${f.finding_type} ${f.ai_hypothesis}`) ? "critical" : "warning";
}

/**
 * Autopsy cross-check — post-mortem findings mapped onto the anatomy and
 * checked against what the rest of the case file says about the same part
 * of the body. Findings come only from an actual post-mortem report logged
 * as evidence; nothing here is invented.
 */
export function AutopsyPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [findings, setFindings] = useState<AutopsyFinding[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [layer, setLayer] = useState<AnatomyLayer>("both");
  const canReview = canConfirmAiOutput(user);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [f, e, t, c] = await Promise.all([
        autopsyApi.listAutopsyFindings(id),
        evidenceApi.listEvidenceForCase(id),
        timelineApi.listTimeline(id),
        contradictionApi.listContradictions(id),
      ]);
      setFindings(f);
      setEvidence(e);
      setTimeline(t);
      setContradictions(c);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the post-mortem findings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedRegion(null);
    void load(caseId);
  }, [caseId, load]);

  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "autopsy.finding_added" || event.type === "autopsy.reviewed" || event.type === "evidence.ai_processed") void load(caseId, true);
  });

  async function review(id: string, action: "confirm" | "dismiss") {
    setBusyId(id);
    try {
      const updated = action === "confirm" ? await autopsyApi.confirmAutopsyFinding(id) : await autopsyApi.dismissAutopsyFinding(id);
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "The review action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const placed = useMemo(() => findings.map((f) => ({ f, region: toBodyRegion(f.body_region) })), [findings]);
  const hotspots = useMemo<Hotspot[]>(
    () =>
      placed
        .filter((x): x is { f: AutopsyFinding; region: BodyRegion } => x.region !== null && x.f.status !== "dismissed")
        .map(({ f, region }) => ({
          region,
          label: f.finding_type.replace(/_/g, " "),
          finding: f.ai_hypothesis,
          severity: severityOf(f),
          confidence: f.confidence,
          details: [
            { label: "Stated region", value: (f.body_region ?? "—").replace(/_/g, " ") },
            { label: "Status", value: f.status.replace(/_/g, " ") },
          ],
        })),
    [placed]
  );
  const flagged = useMemo(() => new Set(placed.filter((p) => p.region && p.f.status !== "dismissed").map((p) => p.region as string)), [placed]);

  const counts = {
    all: findings.length,
    hypothesis: findings.filter((f) => f.status === "ai_hypothesis").length,
    confirmed: findings.filter((f) => f.status === "human_confirmed").length,
    dismissed: findings.filter((f) => f.status === "dismissed").length,
  };

  const visible = useMemo(
    () =>
      placed.filter(({ f, region }) => {
        if (selectedRegion && region !== selectedRegion) return false;
        if (filter === "hypothesis") return f.status === "ai_hypothesis";
        if (filter === "confirmed") return f.status === "human_confirmed";
        if (filter === "dismissed") return f.status === "dismissed";
        return true;
      }),
    [placed, selectedRegion, filter]
  );

  const report = useMemo(() => evidence.find((e) => e.evidence_type === "autopsy_report"), [evidence]);
  const sourceName = (id: string) => evidence.find((e) => e.id === id)?.description ?? evidence.find((e) => e.id === id)?.original_filename ?? "post-mortem report";

  // Cross-check: what else in the file talks about the selected region.
  const crossCheck = useMemo(() => {
    if (!selectedRegion) return { events: [] as TimelineEvent[], conflicts: [] as Contradiction[] };
    const re = REGION_KEYWORDS[selectedRegion];
    return {
      events: timeline.filter((t) => re.test(`${t.description} ${t.source_excerpt ?? ""}`)).slice(0, 6),
      conflicts: contradictions.filter((c) => re.test(c.explanation)).slice(0, 4),
    };
  }, [selectedRegion, timeline, contradictions]);

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Forensic medicine · post-mortem findings on the figure"
        title="Autopsy cross-check"
        live={counts.hypothesis > 0}
        description={
          <>
            Findings the AI read from the post-mortem report, pinned to the body and checked against statements, CCTV and the timeline. Each is a{" "}
            <span className="text-cot-magenta">hypothesis</span> until the forensic medical officer confirms it.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="autopsy" size={13} />}>
              Refresh
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["autopsy"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Findings" value={counts.all} tone="ice" icon={<ForensicIcon name="autopsy" size={16} />} hint={report ? `From ${report.description ?? report.original_filename}` : "Awaiting a post-mortem report"} />
        <StatTile label="AI hypotheses" value={counts.hypothesis} tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint="Awaiting the forensic medical officer" />
        <StatTile label="Confirmed" value={counts.confirmed} tone="mint" progress={counts.all ? counts.confirmed / counts.all : 0} icon={<ForensicIcon name="check" size={16} />} hint="Entered into the verified record" />
        <StatTile label="Regions flagged" value={flagged.size} tone="red" icon={<ForensicIcon name="alert" size={16} />} hint={Array.from(flagged).map((r) => REGION_LABELS[r as BodyRegion]).join(" · ") || "No anatomical site flagged"} />
      </div>

      {loading ? (
        <ScanLoader label="Reading the post-mortem report…" rows={6} />
      ) : findings.length === 0 ? (
        <EmptyState icon="autopsy" title="No post-mortem findings for this case yet" body="Findings appear the moment a post-mortem report with readable text is logged as evidence — the AI extracts each injury, its body region and a confidence, and pins it to the figure. Load stage 6 of the scenario from the demo strip above." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]">
          <Panel padded={false} className="min-h-[680px] overflow-hidden">
            <div className="h-[680px]">
              <ForensicBody3D hotspots={hotspots} findings={flagged} selectedRegion={selectedRegion} onSelectRegion={(r) => setSelectedRegion((cur) => (cur === r ? null : r))} layer={layer} onLayerChange={setLayer} autoRotate />
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel
              eyebrow="Findings"
              title={selectedRegion ? REGION_LABELS[selectedRegion] : "Whole body"}
              actions={
                selectedRegion ? (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedRegion(null)}>
                    Clear region
                  </Button>
                ) : null
              }
            >
              <Tabs
                id="autopsy-filter"
                className="mb-3"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", badge: counts.all },
                  { value: "hypothesis", label: "AI", badge: counts.hypothesis },
                  { value: "confirmed", label: "Confirmed", badge: counts.confirmed },
                  { value: "dismissed", label: "Dismissed", badge: counts.dismissed },
                ]}
              />
              <div className="rise space-y-2.5">
                <AnimatePresence initial={false}>
                  {visible.map(({ f, region }) => {
                    const sev = severityOf(f);
                    const active = region !== null && selectedRegion === region;
                    return (
                      <motion.article
                        key={f.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`rounded-xl border p-3 transition-colors ${active ? "border-cot-ice/70 bg-cot-ice/[.06] shadow-[0_0_28px_-10px_rgba(154,216,255,.7)]" : "border-[color:var(--cot-line)] bg-white/[.02] hover:border-[color:var(--cot-line-strong)]"}`}
                        onClick={() => region && setSelectedRegion(region)}
                        role={region ? "button" : undefined}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={f.status === "human_confirmed" ? "ok" : f.status === "dismissed" ? "neutral" : sev === "critical" ? "critical" : "ai"} dot={f.status === "ai_hypothesis"}>
                            {f.status === "ai_hypothesis" ? "AI hypothesis" : f.status.replace(/_/g, " ")}
                          </Chip>
                          <span className="label-caps text-cot-text3">{f.finding_type.replace(/_/g, " ")}</span>
                          <span className="ml-auto font-mono text-[11px] text-cot-text3">confidence {Math.round(f.confidence * 100)}%</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-cot-text3">
                          <ForensicIcon name="map" size={12} />
                          <span className="capitalize">{(f.body_region ?? "no anatomical site").replace(/_/g, " ")}</span>
                          {region && <span className="text-cot-ice">· {REGION_LABELS[region]}</span>}
                        </div>
                        <p className="mt-2 text-[14px] leading-snug text-cot-text">{f.ai_hypothesis}</p>
                        <div className="mt-2 flex items-center gap-2 border-t border-white/[.06] pt-2 text-[11px] text-cot-text3">
                          <ForensicIcon name="document" size={12} /> {sourceName(f.source_evidence_id)}
                          <span className="ml-auto font-mono">{new Date(f.created_at).toLocaleDateString()}</span>
                        </div>
                        {f.status === "ai_hypothesis" && canReview && (
                          <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="mint" busy={busyId === f.id} onClick={() => void review(f.id, "confirm")} icon={<ForensicIcon name="check" size={12} />}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busyId === f.id} onClick={() => void review(f.id, "dismiss")}>
                              Dismiss
                            </Button>
                          </div>
                        )}
                        {f.status === "ai_hypothesis" && !canReview && <div className="mt-2 text-[11px] text-cot-amber">Confirmation needs the forensic medical officer or Sub-Inspector rank and above.</div>}
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
                {visible.length === 0 && <p className="py-4 text-center text-sm text-cot-text3">No findings match — pick another region or filter.</p>}
              </div>
            </Panel>

            <Panel eyebrow="Cross-check" title={selectedRegion ? `What the file says about the ${REGION_LABELS[selectedRegion].toLowerCase()}` : "Select a region on the figure"} tone={crossCheck.conflicts.length ? "crit" : "default"}>
              {!selectedRegion ? (
                <p className="text-sm text-cot-text2">Click a marker or a region: the timeline events, statements and contradictions that mention the same part of the body are listed here so the medical finding can be read against the rest of the case.</p>
              ) : crossCheck.events.length + crossCheck.conflicts.length === 0 ? (
                <p className="text-sm text-cot-text2">Nothing else in the case file mentions this region — the post-mortem is the only source. That is a gap worth noting.</p>
              ) : (
                <div className="space-y-2">
                  {crossCheck.conflicts.map((c) => (
                    <Link key={c.id} to="/contradictions" className="block rounded-lg border border-cot-red/40 bg-cot-red/[.07] p-2.5 text-[13px] text-cot-text hover:border-cot-red">
                      <span className="label-caps text-cot-red">Contradiction · {c.severity}</span>
                      <span className="mt-1 block">{c.explanation}</span>
                    </Link>
                  ))}
                  {crossCheck.events.map((t) => (
                    <Link key={t.id} to="/timeline" className="block rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] p-2.5 text-[13px] hover:border-[color:var(--cot-line-strong)]">
                      <span className="font-mono text-[11px] text-cot-text3">{new Date(t.event_time).toLocaleString()}</span>
                      <span className="mt-0.5 block text-cot-text">{t.description}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            {report && (
              <Panel eyebrow="Source" title="Post-mortem report" tone="ok">
                <div className="flex items-start gap-3 text-[13px]">
                  <ForensicIcon name="document" size={18} className="mt-0.5 shrink-0 text-cot-mint" />
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{report.description ?? report.original_filename}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-cot-text3">sha256 {report.sha256_hash.slice(0, 18)}… · {report.status.replace(/_/g, " ")}</div>
                    <Link to="/chain-of-custody" className="mt-1.5 inline-block text-[12px] text-cot-violet hover:text-white">
                      Custody trail →
                    </Link>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
