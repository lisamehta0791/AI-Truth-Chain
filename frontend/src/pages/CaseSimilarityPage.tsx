import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useActiveCase } from "@/hooks/useActiveCase";
import { ApiError } from "@/lib/apiClient";
import * as similarityApi from "@/services/similarityApi";
import type { CaseSimilarityMatch } from "@/types";

const SIGNAL_LABEL: Record<string, string> = {
  knife: "Knife",
  "thigh wound": "Wound to the thigh",
  "forced rear door": "Rear service door forced",
  "hotel or lodge": "Hotel / lodge room",
  "dark jacket": "Man in a dark jacket",
  backpack: "Black backpack",
  "grey hatchback": "Grey hatchback",
  "argument over money": "Argument over money",
  night: "Late night",
  alcohol: "Alcohol at the scene",
  "no defensive injuries": "No defensive injuries",
};

function Ring({ value, size = 92, stroke = 7, color }: { value: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <span className="stat-value !text-[20px] text-white">
        <CountUp value={Math.round(value * 100)} suffix="%" />
      </span>
    </div>
  );
}

const scoreColor = (s: number) => (s >= 0.35 ? "#ff3d71" : s >= 0.15 ? "#ffb547" : "#a78bfa");

/**
 * Case similarity — has this happened before? Every other case the officer
 * can see is scored against the active one on shared names, places, vehicles
 * and modus-operandi signals, then any two can be compared side by side.
 * Similarity is a lead, never proof; the method is printed on the page.
 */
export function CaseSimilarityPage() {
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [matches, setMatches] = useState<CaseSimilarityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<similarityApi.CaseComparison | null>(null);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const m = await similarityApi.findSimilarCases(id);
      setMatches([...m].sort((a, b) => b.similarity_score - a.similarity_score));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not compute similarity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setComparison(null);
    setOtherId(null);
    void load(caseId);
  }, [caseId, load]);

  // Pick the strongest match automatically so the page opens with a comparison.
  useEffect(() => {
    if (!otherId && matches.length > 0) setOtherId(matches[0].matched_case_id);
  }, [matches, otherId]);

  useEffect(() => {
    if (!caseId || !otherId) return;
    let live = true;
    setComparing(true);
    similarityApi
      .compareCases(caseId, otherId)
      .then((c) => live && setComparison(c))
      .catch((err) => live && setError(err instanceof ApiError ? String(err.detail) : "Could not compare the cases."))
      .finally(() => live && setComparing(false));
    return () => {
      live = false;
    };
  }, [caseId, otherId]);

  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const others = cases.filter((c) => c.id !== caseId);
  const strong = matches.filter((m) => m.similarity_score >= 0.15).length;
  const top = matches[0];

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Pattern search · has this happened before?"
        title="Case similarity"
        description={
          <>
            Every case you can see is scored against this one on shared names, places, vehicles and modus operandi — then compared side by side. <span className="text-cot-amber">A match is a lead to pursue, never proof that two cases are connected.</span>
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="graph" size={13} />}>
              Recompute
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId)} needs={["pattern"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Cases compared" value={matches.length} tone="violet" icon={<ForensicIcon name="graph" size={16} />} hint={`${others.length} other case${others.length === 1 ? "" : "s"} visible to you`} />
        <StatTile label="Pattern matches" value={strong} tone={strong ? "red" : "mint"} icon={<ForensicIcon name="alert" size={16} />} hint="Score ≥ 15% — worth a look" />
        <StatTile label="Strongest" value={top ? Math.round(top.similarity_score * 100) : 0} suffix="%" tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint={top ? (caseById.get(top.matched_case_id)?.case_number ?? "—") : "No other cases yet"} />
        <StatTile label="Shared names" value={top ? top.matched_factors.shared_entities.length : 0} tone="ice" icon={<ForensicIcon name="shield" size={16} />} hint="Entities the strongest match has in common" />
      </div>

      {loading ? (
        <ScanLoader label="Scoring every case against this one…" rows={5} />
      ) : matches.length === 0 ? (
        <EmptyState icon="graph" title="Nothing to compare against yet" body="Similarity needs other cases with evidence. Load the final stage of the demo scenario — three earlier files with the same signature are pulled in." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rise space-y-3">
            {matches.map((m) => {
              const c = caseById.get(m.matched_case_id);
              const active = otherId === m.matched_case_id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOtherId(m.matched_case_id)}
                  className={`hud-frame block w-full p-4 text-left !overflow-visible ${active ? "hud-frame--crit" : ""}`}
                  style={active ? { borderColor: scoreColor(m.similarity_score) } : undefined}
                >
                  <div className="flex items-center gap-4">
                    <Ring value={m.similarity_score} size={76} stroke={6} color={scoreColor(m.similarity_score)} />
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-cot-text3">{c?.case_number ?? m.matched_case_id.slice(0, 8)}</div>
                      <div className="truncate text-[14px] font-bold text-white">{c?.title ?? "Case"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.matched_factors.shared_entities.slice(0, 3).map((e) => (
                          <span key={e} className="chip status-neutral !normal-case !tracking-normal !font-[Rajdhani] !text-[11px]">{e}</span>
                        ))}
                        {m.matched_factors.shared_entities.length > 3 && <span className="text-[11px] text-cot-text3">+{m.matched_factors.shared_entities.length - 3}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            <Panel eyebrow="Method" title="How the score is made" tone="ai">
              <p className="text-[12.5px] leading-relaxed text-cot-text2">{comparison?.method ?? top.matched_factors.method}</p>
            </Panel>
          </div>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {comparing && !comparison ? (
                <ScanLoader key="cmp-loading" label="Laying the two files side by side…" rows={6} />
              ) : comparison ? (
                <motion.div key={comparison.b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`space-y-4 ${comparing ? "opacity-60" : ""}`}>
                  <Panel tone={comparison.score >= 0.35 ? "crit" : comparison.score >= 0.15 ? "warn" : "default"} padded>
                    <div className="flex flex-wrap items-center gap-5">
                      <Ring value={comparison.score} size={110} stroke={8} color={scoreColor(comparison.score)} />
                      <div className="min-w-0 flex-1">
                        <div className="eyebrow">Verdict</div>
                        <h2 className="mt-1 text-[18px] text-white">{comparison.verdict}</h2>
                        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                          <Chip tone="neutral">{comparison.shared_signals.length} shared MO signals</Chip>
                          <Chip tone="neutral">{comparison.shared_entities.length} shared names</Chip>
                          <Chip tone="neutral">{comparison.shared_places.length} shared places</Chip>
                          {comparison.shared_plates.length > 0 && <Chip tone="critical">same vehicle {comparison.shared_plates.join(", ")}</Chip>}
                          {comparison.gap_days !== null && <Chip tone="ai">{comparison.gap_days} days apart</Chip>}
                        </div>
                      </div>
                    </div>
                  </Panel>

                  <div className="grid gap-4 md:grid-cols-2">
                    {[comparison.a, comparison.b].map((p, i) => (
                      <Panel key={p.id} eyebrow={i === 0 ? "This case" : "Compared with"} title={`${p.case_number} · ${p.title}`} tone={i === 0 ? "ai" : "warn"}>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                          <dt className="text-cot-text3">Status</dt>
                          <dd className="uppercase text-cot-text">{p.status.replace(/_/g, " ")}</dd>
                          <dt className="text-cot-text3">Evidence</dt>
                          <dd className="text-cot-text">{p.evidence_count} items · {p.event_count} events</dd>
                          <dt className="text-cot-text3">Period</dt>
                          <dd className="font-mono text-cot-text">{p.first_seen ? new Date(p.first_seen).toLocaleDateString() : "—"}{p.last_seen ? ` → ${new Date(p.last_seen).toLocaleDateString()}` : ""}</dd>
                          <dt className="text-cot-text3">People</dt>
                          <dd className="text-cot-text">{p.people.length ? p.people.join(", ") : "—"}</dd>
                          <dt className="text-cot-text3">Places</dt>
                          <dd className="text-cot-text">{p.places.length ? p.places.join(", ") : "—"}</dd>
                          <dt className="text-cot-text3">Vehicles</dt>
                          <dd className="font-mono text-cot-text">{p.plates.length ? p.plates.join(", ") : "—"}</dd>
                        </dl>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {p.signals.map((s) => (
                            <span key={s} className={`chip ${comparison.shared_signals.includes(s) ? "status-critical" : "status-neutral"} !normal-case !tracking-normal !font-[Rajdhani] !text-[11px]`}>{SIGNAL_LABEL[s] ?? s}</span>
                          ))}
                        </div>
                        {p.key_events.length > 0 && (
                          <ol className="mt-3 space-y-1 border-t border-white/[.06] pt-2 text-[12px]">
                            {p.key_events.slice(0, 4).map((ev) => (
                              <li key={ev.time + ev.description} className="flex gap-2">
                                <span className="shrink-0 font-mono text-cot-text3">{new Date(ev.time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                <span className="text-cot-text2">{ev.description}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </Panel>
                    ))}
                  </div>

                  <Panel eyebrow="What the two files share" title="Signature overlap">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="label-caps mb-2 text-cot-red">Modus operandi</div>
                        {comparison.shared_signals.length === 0 ? <p className="text-[12.5px] text-cot-text3">No shared signals.</p> : (
                          <ul className="space-y-1 text-[13px] text-cot-text">
                            {comparison.shared_signals.map((s) => (
                              <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cot-red shadow-[0_0_8px_#ff3d71]" />{SIGNAL_LABEL[s] ?? s}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="label-caps mb-2 text-cot-magenta">Names & things</div>
                        {comparison.shared_entities.length === 0 ? <p className="text-[12.5px] text-cot-text3">No shared entities.</p> : (
                          <ul className="space-y-1 text-[13px] text-cot-text">
                            {comparison.shared_entities.map((e) => (
                              <li key={e.name} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cot-magenta shadow-glow-magenta" />{e.name} <span className="text-[10px] uppercase text-cot-text3">{e.type}</span></li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="label-caps mb-2 text-cot-amber">Places</div>
                        {comparison.shared_places.length === 0 ? <p className="text-[12.5px] text-cot-text3">No evidence within 600 m of each other.</p> : (
                          <ul className="space-y-1 text-[13px] text-cot-text">
                            {comparison.shared_places.map((pl) => (
                              <li key={pl.a} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cot-amber" /><span>{pl.a} <span className="text-cot-text3">↔</span> {pl.b} <span className="font-mono text-[10px] text-cot-text3">{pl.distance_m} m</span></span></li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </Panel>
                </motion.div>
              ) : (
                <EmptyState key="cmp-empty" icon="graph" title="Pick a case on the left" body="The two files are laid side by side: people, places, vehicles, modus operandi and their key events." />
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </AppShell>
  );
}
