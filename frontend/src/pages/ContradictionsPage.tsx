import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ContradictionCard, type ReviewAction } from "@/components/contradictions/ContradictionCard";
import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
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
import * as contradictionApi from "@/services/contradictionApi";
import * as evidenceApi from "@/services/evidenceApi";
import * as timelineApi from "@/services/timelineApi";
import * as userApi from "@/services/userApi";
import { canConfirmAiOutput, type Contradiction, type Evidence, type OfficerDirectoryEntry, type TimelineEvent } from "@/types";

type Filter = "all" | "open" | "confirmed" | "dismissed";

/**
 * Contradiction review — where two pieces of evidence disagree and an officer
 * decides which one the record will believe. The detector flags; it never
 * rules. Nothing here changes the verified record until a human confirms.
 */
export function ContradictionsPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [items, setItems] = useState<Contradiction[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [directory, setDirectory] = useState<OfficerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const canReview = canConfirmAiOutput(user);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [list, ev, tl] = await Promise.all([contradictionApi.listContradictions(id), evidenceApi.listEvidenceForCase(id), timelineApi.listTimeline(id)]);
      setItems(list);
      setEvidence(ev);
      setEvents(tl);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load contradictions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);

  useEffect(() => {
    userApi.listOfficerDirectory().then(setDirectory).catch(() => setDirectory([]));
  }, []);

  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "contradiction.flagged" || event.type === "contradiction.reviewed" || event.type === "evidence.ai_processed") void load(caseId, true);
  });

  async function handleAction(id: string, action: ReviewAction, note: string) {
    setBusyId(id);
    setError(null);
    try {
      const trimmed = note.trim() || undefined;
      let updated: Contradiction;
      if (action === "confirm") updated = await contradictionApi.confirmContradiction(id, trimmed);
      else if (action === "dismiss") updated = await contradictionApi.dismissContradiction(id, trimmed);
      else updated = await contradictionApi.requestReviewContradiction(id, trimmed);
      setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "The review action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const evidenceById = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence]);
  const reviewerName = useCallback((id: string | null) => (id ? (directory.find((d) => d.id === id)?.full_name ?? null) : null), [directory]);

  const sorted = useMemo(() => {
    const rank = (c: Contradiction) => (c.status === "requires_review" ? 0 : c.status === "human_confirmed" || c.status === "verified" ? 1 : 2);
    return [...items].sort((a, b) => rank(a) - rank(b) || (a.severity === b.severity ? b.confidence - a.confidence : a.severity === "major" ? -1 : 1));
  }, [items]);

  const counts = useMemo(
    () => ({
      all: sorted.length,
      open: sorted.filter((c) => c.status === "requires_review").length,
      major: sorted.filter((c) => c.status === "requires_review" && c.severity === "major").length,
      confirmed: sorted.filter((c) => c.status === "human_confirmed" || c.status === "verified").length,
      dismissed: sorted.filter((c) => c.status === "dismissed").length,
    }),
    [sorted]
  );

  const visible = sorted.filter((c) => {
    if (filter === "open") return c.status === "requires_review";
    if (filter === "confirmed") return c.status === "human_confirmed" || c.status === "verified";
    if (filter === "dismissed") return c.status === "dismissed";
    return true;
  });

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Detector · evidence against evidence"
        title="Contradiction review"
        live={counts.open > 0}
        description={
          <>
            Where two items in the file disagree — a statement against a camera, a phone against a witness. The detector flags the clash with a severity and a confidence;
            an officer decides what the record believes.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="contradiction" size={13} />}>Refresh</Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["cctv", "witness", "phone"]} className="mb-5" />}

      {error && <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">{error}</div>}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Open" value={counts.open} tone="red" icon={<ForensicIcon name="contradiction" size={16} />} hint={counts.major ? `${counts.major} rated HIGH severity` : "Nothing waiting on a decision"} />
        <StatTile label="Confirmed" value={counts.confirmed} tone="mint" icon={<ForensicIcon name="check" size={16} />} hint="Officer agreed the sources clash" progress={counts.all ? counts.confirmed / counts.all : 0} />
        <StatTile label="Dismissed" value={counts.dismissed} tone="violet" icon={<ForensicIcon name="shield" size={16} />} hint="Explained away with a recorded note" />
        <StatTile label="Total flagged" value={counts.all} tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint={`${evidence.length} evidence items compared`} />
      </div>

      {loading ? (
        <ScanLoader label="Comparing every source against every other…" rows={5} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="contradiction"
          title="No contradictions flagged for this case"
          body="Each time new evidence is processed, the detector reads it against everything already on file. When the receptionist's statement, the CCTV logs and the call records disagree about who left when, the clashes appear here as A-versus-B cards. Load the CCTV, witness and phone stages from the demo strip above."
        />
      ) : (
        <>
          <Panel className="mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Tabs
                id="contradiction-filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", badge: counts.all },
                  { value: "open", label: "Open", badge: counts.open },
                  { value: "confirmed", label: "Confirmed", badge: counts.confirmed },
                  { value: "dismissed", label: "Dismissed", badge: counts.dismissed },
                ]}
              />
              <span className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[10px] text-cot-text3">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cot-red" /> HIGH = major</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cot-amber" /> MEDIUM = minor</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cot-mint" /> human decided</span>
              </span>
            </div>
          </Panel>

          {visible.length === 0 ? (
            <EmptyState icon="search" title="Nothing in this tab" body="Switch tabs to see the other contradictions on this case." action={<Button size="sm" onClick={() => setFilter("all")}>Show all</Button>} />
          ) : (
            <div className="space-y-5">
              <AnimatePresence initial={true}>
                {visible.map((item, i) => (
                  <ContradictionCard
                    key={item.id}
                    item={item}
                    index={i}
                    evidenceById={evidenceById}
                    events={events}
                    reviewerName={reviewerName}
                    canReview={canReview}
                    busy={busyId === item.id}
                    onAction={(action, note) => void handleAction(item.id, action, note)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
