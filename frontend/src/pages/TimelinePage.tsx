import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { TimelineSpine, eventTone } from "@/components/timeline/TimelineSpine";
import { evidenceName, statedDateTime, timeStated } from "@/components/timeline/format";
import { Button } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
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
import * as timelineApi from "@/services/timelineApi";
import { canConfirmAiOutput, type Evidence, type TimelineEvent } from "@/types";

type Filter = "all" | "unverified" | "confirmed" | "unstated";

/**
 * Case timeline — every event the AI extracted from the case file, in the
 * order the sources state it, with the officer's confirmations recorded on
 * top. Magenta is the machine's proposal; mint is a human's decision.
 */
export function TimelinePage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [focusSource, setFocusSource] = useState<string | null>(null);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const canConfirm = canConfirmAiOutput(user);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [ev, list] = await Promise.all([timelineApi.listTimeline(id), evidenceApi.listEvidenceForCase(id)]);
      setEvents(ev);
      setEvidence(list);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the timeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setFocusSource(null);
    void load(caseId);
  }, [caseId, load]);

  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "timeline.event_extracted" || event.type === "timeline.event_confirmed" || event.type === "evidence.ai_processed") {
      setLiveNote(event.type === "timeline.event_extracted" ? `New event extracted: ${event.description}` : "Timeline updated");
      void load(caseId, true);
      window.setTimeout(() => setLiveNote(null), 4500);
    }
  });

  async function handleConfirm(eventId: string) {
    setConfirmingId(eventId);
    try {
      const updated = await timelineApi.confirmTimelineEvent(eventId);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Confirmation failed.");
    } finally {
      setConfirmingId(null);
    }
  }

  const evidenceById = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence]);
  const sorted = useMemo(() => [...events].sort((a, b) => a.event_time.localeCompare(b.event_time) || a.created_at.localeCompare(b.created_at)), [events]);

  const counts = useMemo(
    () => ({
      all: sorted.length,
      unverified: sorted.filter((e) => e.verification_status === "ai_extracted_unverified").length,
      confirmed: sorted.filter((e) => eventTone(e) === "mint").length,
      unstated: sorted.filter((e) => !timeStated(e)).length,
    }),
    [sorted]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((e) => {
      if (filter === "unverified" && e.verification_status !== "ai_extracted_unverified") return false;
      if (filter === "confirmed" && eventTone(e) !== "mint") return false;
      if (filter === "unstated" && timeStated(e)) return false;
      if (q) {
        const hay = `${e.description} ${e.event_type} ${e.source_excerpt ?? ""} ${evidenceName(evidenceById.get(e.source_evidence_id ?? ""), e.source_evidence_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, filter, query, evidenceById]);

  const span = useMemo(() => {
    const stated = sorted.filter(timeStated);
    if (stated.length < 2) return null;
    return { from: stated[0].event_time, to: stated[stated.length - 1].event_time };
  }, [sorted]);

  const sources = useMemo(() => {
    const m = new Map<string, number>();
    sorted.forEach((e) => e.source_evidence_id && m.set(e.source_evidence_id, (m.get(e.source_evidence_id) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sorted]);

  const progress = counts.all ? counts.confirmed / counts.all : 0;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Chronology · AI extracts, officers confirm"
        title="Case timeline"
        live={counts.unverified > 0}
        description={
          <>
            Every event the AI read out of the case file, ordered by the time the source states. Each one is a{" "}
            <span className="text-cot-magenta">hypothesis</span> until an officer of Sub-Inspector rank or above confirms it — then it turns{" "}
            <span className="text-cot-mint">mint</span> and enters the verified record.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="timeline" size={13} />}>
              Refresh
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["scene", "cctv", "witness", "phone"]} className="mb-5" />}

      <AnimatePresence>
        {liveNote && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 flex items-center gap-2 rounded-lg border border-cot-magenta/40 bg-cot-magenta/10 px-4 py-2 text-sm text-white">
            <span className="pulse-dot h-2 w-2 rounded-full bg-cot-magenta" /> {liveNote}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatTile label="Events" value={counts.all} tone="violet" icon={<ForensicIcon name="timeline" size={16} />} hint={span ? `${statedDateTime(span.from)} → ${statedDateTime(span.to)}` : "No stated span yet"} />
        <StatTile label="Confirmed" value={counts.confirmed} tone="mint" progress={progress} icon={<ForensicIcon name="check" size={16} />} hint={`${Math.round(progress * 100)}% of the chronology is officer-confirmed`} />
        <StatTile label="Unverified" value={counts.unverified} tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint="AI proposals awaiting a decision" />
        <StatTile label="Time not stated" value={counts.unstated} tone="amber" icon={<ForensicIcon name="alert" size={16} />} hint="Ordered by when they were logged" />
        <StatTile label="Sources" value={sources.length} tone="ice" icon={<ForensicIcon name="evidence" size={16} />} hint={sources[0] ? `Richest: ${evidenceName(evidenceById.get(sources[0][0]), sources[0][0]).slice(0, 34)}` : "Evidence items feeding the timeline"} />
      </div>

      {loading ? (
        <ScanLoader label="Reading the chronology…" rows={6} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="timeline"
          title="No events on the timeline yet"
          body="As soon as evidence with readable text is logged — the scene report, CCTV logs, the receptionist's statement — the AI extracts every dated event and lays it out here for confirmation. Load the Riverside Hotel scenario from the demo strip above to see 35 events appear."
        />
      ) : (
        <>
          <Panel padded className="mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Tabs
                id="timeline-filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", badge: counts.all },
                  { value: "unverified", label: "Unverified", badge: counts.unverified },
                  { value: "confirmed", label: "Confirmed", badge: counts.confirmed },
                  { value: "unstated", label: "Time not stated", badge: counts.unstated },
                ]}
              />
              <label className="relative ml-auto flex min-w-[240px] flex-1 items-center md:max-w-sm">
                <ForensicIcon name="search" size={14} className="pointer-events-none absolute left-3 text-cot-text3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter events — knife, lobby, 20:44, Ramesh…" className="w-full !pl-9 !py-2 !text-[14px]" aria-label="Filter timeline events" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="label-caps text-cot-text3">Sources</span>
              {sources.map(([id, n]) => {
                const active = focusSource === id;
                return (
                  <button
                    key={id}
                    onClick={() => setFocusSource(active ? null : id)}
                    className={`chip ${active ? "status-ai" : "status-neutral"} !normal-case !tracking-normal !font-[Rajdhani] !text-[12px] !font-semibold`}
                    title={active ? "Show every source" : "Highlight events from this source"}
                  >
                    {evidenceName(evidenceById.get(id), id).slice(0, 40)}
                    <span className="font-mono opacity-70">{n}</span>
                  </button>
                );
              })}
              {focusSource && (
                <button onClick={() => setFocusSource(null)} className="text-[12px] text-cot-text3 underline decoration-dotted hover:text-white">
                  clear
                </button>
              )}
              <span className="ml-auto flex items-center gap-3 font-mono text-[10px] text-cot-text3">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cot-mint shadow-glow-mint" /> confirmed</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cot-magenta shadow-glow-magenta" /> AI · unverified</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cot-amber" /> time not stated</span>
              </span>
            </div>
          </Panel>

          {visible.length === 0 ? (
            <EmptyState icon="search" title="Nothing matches this filter" body="Try another tab or clear the keyword — the events are still on the timeline." action={<Button size="sm" onClick={() => { setFilter("all"); setQuery(""); setFocusSource(null); }}>Show everything</Button>} />
          ) : (
            <TimelineSpine
              key={`${filter}-${query}`}
              events={visible}
              evidenceById={evidenceById}
              canConfirm={canConfirm}
              confirmingId={confirmingId}
              onConfirm={handleConfirm}
              focusSource={focusSource}
              onFocusSource={setFocusSource}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
