import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { EVIDENCE_TYPE_LABEL, evidenceName, humanise, localDateTime, pct, statedTime, timeStated } from "@/components/timeline/format";
import type { EventTone } from "@/components/timeline/TimelineSpine";
import type { Evidence, TimelineEvent } from "@/types";

const TONE_TEXT: Record<EventTone, string> = { mint: "text-cot-mint", magenta: "text-cot-magenta", amber: "text-cot-amber" };
const TONE_GLOW: Record<EventTone, string> = { mint: "rgba(6,255,165,.55)", magenta: "rgba(244,114,182,.55)", amber: "rgba(255,181,71,.55)" };

interface Props {
  event: TimelineEvent;
  tone: EventTone;
  side: "left" | "right";
  evidence?: Evidence;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
  dim: boolean;
  focused: boolean;
  onFocusSource: () => void;
}

export function TimelineEventCard({ event, tone, side, evidence, canConfirm, busy, onConfirm, dim, focused, onFocusSource }: Props) {
  const stated = timeStated(event);
  const unverified = event.verification_status === "ai_extracted_unverified";
  const conf = event.confidence;

  return (
    <article className={`tl-card p-4 ${dim ? "tl-card--dim" : ""} ${focused ? "tl-card--focus" : ""}`} aria-label={event.description}>
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${side === "left" ? "lg:flex-row-reverse lg:text-right" : ""}`}>
        <span className={`font-mono text-[22px] leading-none ${TONE_TEXT[tone]}`} style={{ textShadow: `0 0 18px ${TONE_GLOW[tone]}` }}>
          {stated ? statedTime(event.event_time) : "--:--"}
        </span>
        <Chip tone="neutral">{humanise(event.event_type)}</Chip>
        {typeof conf === "number" && (
          <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-cot-text3" title="Extraction confidence">
            <span className="conf-meter w-14"><i style={{ width: pct(conf) }} /></span>
            {pct(conf)}
          </span>
        )}
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug text-white">{event.description}</p>

      {event.source_excerpt && (
        <blockquote className="mt-2 border-l border-[color:var(--cot-line)] pl-3 text-[13px] italic leading-relaxed text-cot-text2">
          “{event.source_excerpt}”
        </blockquote>
      )}

      {!stated && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-cot-amber/90" title="The source did not state a date and time. This item is ordered by when it was logged.">
          Time not stated in source · logged {localDateTime(event.event_time)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[.06] pt-3">
        {event.source_evidence_id ? (
          <button
            onClick={onFocusSource}
            className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[12px] font-semibold transition-colors ${focused ? "border-cot-violet/60 bg-cot-violet/10 text-white" : "border-[color:var(--cot-line-soft)] text-cot-text2 hover:border-[color:var(--cot-line-strong)] hover:text-white"}`}
            title={focused ? "Show every event" : "Show only events from this source"}
          >
            <ForensicIcon name={evidence?.evidence_type === "autopsy_report" ? "autopsy" : evidence?.evidence_type === "gps_log" ? "map" : "document"} size={13} className="shrink-0 text-cot-violet" />
            <span className="truncate">{evidenceName(evidence, event.source_evidence_id)}</span>
            {evidence && <span className="label-caps shrink-0 text-cot-text4">{EVIDENCE_TYPE_LABEL[evidence.evidence_type]}</span>}
          </button>
        ) : (
          <span className="text-[12px] text-cot-text3">No source evidence linked</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <VerificationBadge status={event.verification_status} />
          {unverified && canConfirm && (
            <Button size="sm" variant="mint" busy={busy} onClick={onConfirm} icon={<ForensicIcon name="check" size={12} />}>
              Confirm
            </Button>
          )}
        </span>
      </div>
      {event.confirmed_at && (
        <div className="mt-2 font-mono text-[10px] text-cot-text3">confirmed {localDateTime(event.confirmed_at)}</div>
      )}
    </article>
  );
}
