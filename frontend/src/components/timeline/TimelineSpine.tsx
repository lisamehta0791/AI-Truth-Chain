import { motion } from "motion/react";
import { useMemo } from "react";

import { TimelineEventCard } from "@/components/timeline/TimelineEventCard";
import { dayKey, dayLabel, timeStated } from "@/components/timeline/format";
import type { Evidence, TimelineEvent } from "@/types";

import "@/styles/investigation.css";

export type EventTone = "mint" | "magenta" | "amber";

export const TONE_COLOR: Record<EventTone, string> = {
  mint: "var(--cot-mint)",
  magenta: "var(--cot-magenta)",
  amber: "var(--cot-amber)",
};

export function eventTone(ev: TimelineEvent): EventTone {
  if (ev.verification_status === "human_confirmed" || ev.verification_status === "verified") return "mint";
  if (!timeStated(ev)) return "amber";
  return "magenta";
}

interface Props {
  events: TimelineEvent[];
  evidenceById: Map<string, Evidence>;
  canConfirm: boolean;
  confirmingId: string | null;
  onConfirm: (id: string) => void;
  /** When set, events from other sources are dimmed. */
  focusSource: string | null;
  onFocusSource: (evidenceId: string | null) => void;
}

/**
 * The chronology as a glowing vertical spine. Events alternate sides on wide
 * screens and stack on the right on phones; each day gets a sticky header so
 * the officer never loses the date while scrolling a long night.
 */
export function TimelineSpine({ events, evidenceById, canConfirm, confirmingId, onConfirm, focusSource, onFocusSource }: Props) {
  const days = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const k = dayKey(ev.event_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  let index = 0;

  return (
    <div className="tl-wrap pb-6">
      <div className="tl-spine" aria-hidden="true" />
      {days.map(([key, dayEvents]) => (
        <section key={key} className="relative">
          <div className="tl-day mb-4 flex pl-12 lg:justify-center lg:pl-0">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="holo-border inline-flex items-center gap-3 rounded-full bg-[rgba(14,11,31,.92)] px-4 py-1.5 backdrop-blur-xl"
            >
              <span className="label-caps text-white">{dayLabel(key)}</span>
              <span className="font-mono text-[10px] text-cot-text3">{dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}</span>
            </motion.div>
          </div>

          <ol className="space-y-4 lg:space-y-0">
            {dayEvents.map((ev, j) => {
              const i = index++;
              const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
              const tone = eventTone(ev);
              const dim = !!focusSource && ev.source_evidence_id !== focusSource;
              return (
                <li key={ev.id} className={`tl-row ${side === "left" ? "tl-row--left" : ""} ${j > 0 ? "lg:-mt-14" : ""}`} style={{ ["--tl-c" as string]: TONE_COLOR[tone] }}>
                  <span className="tl-dot" aria-hidden="true" />
                  <span className="tl-lead" aria-hidden="true" />
                  <div className={`grid pl-12 lg:grid-cols-2 lg:gap-x-24 lg:pl-0`}>
                    <motion.div
                      initial={{ opacity: 0, x: side === "left" ? -28 : 28 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px 0px" }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(i * 0.04, 0.4) }}
                      className={side === "left" ? "lg:col-start-1" : "lg:col-start-2"}
                    >
                      <TimelineEventCard
                        event={ev}
                        tone={tone}
                        side={side}
                        evidence={ev.source_evidence_id ? evidenceById.get(ev.source_evidence_id) : undefined}
                        canConfirm={canConfirm}
                        busy={confirmingId === ev.id}
                        onConfirm={() => onConfirm(ev.id)}
                        dim={dim}
                        focused={!!focusSource && ev.source_evidence_id === focusSource}
                        onFocusSource={() => onFocusSource(focusSource === ev.source_evidence_id ? null : ev.source_evidence_id)}
                      />
                    </motion.div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
