import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { bestSupportingEvent } from "@/components/contradictions/relatedEvents";
import { EVIDENCE_TYPE_LABEL, evidenceName, localDateTime, pct, statedTime } from "@/components/timeline/format";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ForensicIcon, type ForensicIconName } from "@/components/ui/ForensicIcon";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import type { Contradiction, Evidence, TimelineEvent } from "@/types";

import "@/styles/investigation.css";

export type ReviewAction = "confirm" | "dismiss" | "request-review";

interface Props {
  item: Contradiction;
  index: number;
  evidenceById: Map<string, Evidence>;
  events: TimelineEvent[];
  reviewerName: (id: string | null) => string | null;
  canReview: boolean;
  busy: boolean;
  onAction: (action: ReviewAction, note: string) => void;
}

const TYPE_ICON: Partial<Record<Evidence["evidence_type"], ForensicIconName>> = {
  cctv_metadata: "evidence",
  statement: "document",
  forensic_report: "shield",
  autopsy_report: "autopsy",
  phone_record: "document",
  gps_log: "map",
  seized_item: "custody",
  document: "document",
  photo: "evidence",
  video: "evidence",
  audio: "evidence",
};

function EvidencePane({ letter, evidence, id, event }: { letter: "A" | "B"; evidence?: Evidence; id: string; event: TimelineEvent | null }) {
  const name = evidenceName(evidence, id);
  const icon = evidence ? (TYPE_ICON[evidence.evidence_type] ?? "document") : "document";
  return (
    <div className={`ev-pane ev-pane--${letter.toLowerCase()} min-w-0 flex-1 p-4`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${letter === "A" ? "border-cot-violet/50 text-cot-violet" : "border-cot-magenta/50 text-cot-magenta"} bg-[rgba(7,6,15,.5)]`}>
          <ForensicIcon name={icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`label-caps ${letter === "A" ? "text-cot-violet" : "text-cot-magenta"}`}>Evidence {letter}</span>
            {evidence && <Chip tone="neutral">{EVIDENCE_TYPE_LABEL[evidence.evidence_type]}</Chip>}
          </div>
          <div className="mt-1 truncate text-[15px] font-bold text-white" title={name}>{name}</div>
          <div className="mt-0.5 font-mono text-[10px] text-cot-text3">
            {evidence?.captured_at ? `captured ${localDateTime(evidence.captured_at)}` : evidence ? `logged ${localDateTime(evidence.uploaded_at)}` : "not accessible at your clearance"}
            {evidence && <span className="ml-2 text-cot-text4">sha {evidence.sha256_hash.slice(0, 10)}…</span>}
          </div>
        </div>
      </div>
      {event ? (
        <div className="mt-3 rounded-lg border border-white/[.06] bg-[rgba(7,6,15,.45)] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] text-white">{statedTime(event.event_time)}</span>
            <span className="label-caps text-cot-text3">what this source states</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-cot-text2">{event.description}</p>
          {event.source_excerpt && <p className="mt-1 text-[12px] italic leading-snug text-cot-text3">“{event.source_excerpt}”</p>}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-cot-text3">No single extracted event pins this side — read the AI explanation below.</p>
      )}
    </div>
  );
}

/** One contradiction as an A-versus-B confrontation with the AI's reasoning underneath. */
export function ContradictionCard({ item, index, evidenceById, events, reviewerName, canReview, busy, onAction }: Props) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const major = item.severity === "major";
  const open = item.status === "requires_review";
  const tone = item.status === "human_confirmed" || item.status === "verified" ? "ok" : item.status === "dismissed" ? "default" : major ? "crit" : "warn";
  const evA = evidenceById.get(item.evidence_a_id);
  const evB = evidenceById.get(item.evidence_b_id);
  const eventA = bestSupportingEvent(item.explanation, events, item.evidence_a_id);
  const eventB = bestSupportingEvent(item.explanation, events, item.evidence_b_id);
  const reviewer = reviewerName(item.reviewed_by);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(index * 0.06, 0.4) }}
      className={`hud-frame ${tone === "crit" ? "hud-frame--crit" : tone === "warn" ? "hud-frame--warn" : tone === "ok" ? "hud-frame--ok" : ""} ${item.status === "dismissed" ? "opacity-70" : ""}`}
      style={{ ["--vs-c" as string]: major ? "var(--cot-red)" : "var(--cot-amber)" }}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[.06] px-4 py-3">
        <span className="task-index">{String(index + 1).padStart(2, "0")}</span>
        <Chip tone={major ? "critical" : "warn"} dot={open}>{major ? "High · major" : "Medium · minor"}</Chip>
        <VerificationBadge status={item.status} />
        <span className="flex items-center gap-2 font-mono text-[10px] text-cot-text3" title="Detector confidence">
          <span className={`conf-meter w-20 ${major ? "" : "conf-meter--warn"}`}><i style={{ width: pct(item.confidence) }} /></span>
          {pct(item.confidence)} confidence
        </span>
        <span className="ml-auto font-mono text-[10px] text-cot-text3">flagged {localDateTime(item.created_at)}</span>
      </header>

      <div className="flex flex-col gap-2 p-4 md:flex-row md:items-stretch">
        <EvidencePane letter="A" evidence={evA} id={item.evidence_a_id} event={eventA} />
        <div className="vs-seam" aria-hidden="true">
          <span className="vs-badge">VS</span>
        </div>
        <EvidencePane letter="B" evidence={evB} id={item.evidence_b_id} event={eventB} />
      </div>

      <div className="mx-4 mb-4 rounded-lg border border-cot-magenta/30 bg-[rgba(244,114,182,.06)] p-4">
        <div className="flex items-center gap-2">
          <ForensicIcon name="brain" size={14} className="text-cot-magenta" />
          <span className="label-caps text-cot-magenta">AI explanation · hypothesis, not a finding</span>
        </div>
        <p className="mt-2 text-[14.5px] leading-relaxed text-cot-text">{item.explanation}</p>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-white/[.06] px-4 py-3">
        {open ? (
          canReview ? (
            <>
              <Button size="sm" variant="mint" busy={busy} onClick={() => onAction("confirm", note)} icon={<ForensicIcon name="check" size={12} />}>Confirm contradiction</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("dismiss", note)}>Dismiss</Button>
              <Button size="sm" disabled={busy} onClick={() => onAction("request-review", note)}>Escalate for review</Button>
              <button onClick={() => setNoteOpen((v) => !v)} className="ml-auto text-[12px] text-cot-text2 underline decoration-dotted hover:text-white">
                {noteOpen ? "Hide note" : note ? "Edit note" : "Add a review note"}
              </button>
            </>
          ) : (
            <span className="text-[12px] text-cot-text3">Awaiting review by an officer of Sub-Inspector rank or above.</span>
          )
        ) : (
          <span className="flex items-center gap-2 text-[12px] text-cot-text2">
            <ForensicIcon name={item.status === "dismissed" ? "alert" : "shield"} size={13} className={item.status === "dismissed" ? "text-cot-text3" : "text-cot-mint"} />
            {item.status === "dismissed" ? "Dismissed" : "Confirmed"} by <span className="font-semibold text-white">{reviewer ?? "an officer"}</span>
            {item.reviewed_at && <span className="font-mono text-[10px] text-cot-text3">{localDateTime(item.reviewed_at)}</span>}
          </span>
        )}
      </footer>
      <AnimatePresence initial={false}>
        {open && canReview && noteOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4">
              <label className="field-label" htmlFor={`note-${item.id}`}>Review note (recorded in the audit trail)</label>
              <textarea id={`note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full" placeholder="Why you confirmed, dismissed or escalated this…" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
