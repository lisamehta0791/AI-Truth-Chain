import "@/styles/dashboard.css";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { eventTone, evidenceShortLabel, fmtDate, fmtTime, humanise, timeStated } from "@/components/dashboard/evidenceMeta";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Evidence, TimelineEvent } from "@/types";

interface Props {
  events: TimelineEvent[];
  evidence: Evidence[];
  onShowEvidence: (evidenceId: string) => void;
}

/**
 * The case as a line of moments. Dots are coloured by verification state, so
 * the ratio of magenta (AI) to mint (officer-confirmed) is the state of the
 * investigation at a glance. Events whose source gave no time sit at the end,
 * dimmed, rather than being placed at a time nobody stated.
 */
export function TimelineStrip({ events, evidence, onShowEvidence }: Props) {
  const { stated, unstated } = useMemo(() => {
    const s = events.filter(timeStated).sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
    const u = events.filter((e) => !timeStated(e));
    return { stated: s, unstated: u };
  }, [events]);
  const confirmed = events.filter((e) => e.verification_status === "human_confirmed" || e.verification_status === "verified").length;
  const ai = events.filter((e) => e.verification_status === "ai_extracted_unverified").length;

  return (
    <section className="hud-frame min-w-0" aria-label="Evidence timeline">
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 pb-1">
        <div>
          <div className="eyebrow">Evidence chronology</div>
          <h2 className="mt-1 text-[13px] leading-tight text-white">Evidence timeline · {events.length} moments</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="ok">{confirmed} confirmed</Chip>
          <Chip tone="ai">{ai} AI extracted</Chip>
          {unstated.length > 0 && <Chip tone="neutral">{unstated.length} undated</Chip>}
          <Link to="/timeline" className="label-caps text-cot-violet hover:text-white">View full timeline →</Link>
        </div>
      </header>

      {events.length === 0 ? (
        <div className="p-4">
          <EmptyState icon="timeline" title="No moments extracted yet" body="As the AI reads each piece of evidence it places the moments it finds here, marked until an officer confirms them. Load a demo stage above." className="!py-6" />
        </div>
      ) : (
        <div className="cc-strip">
          <ol className="cc-strip-track">
            {[...stated, ...unstated].map((ev, i) => {
              const tone = eventTone(ev);
              const src = ev.source_evidence_id ? evidence.find((e) => e.id === ev.source_evidence_id) : undefined;
              const undated = !timeStated(ev);
              const prev = i > 0 ? [...stated, ...unstated][i - 1] : null;
              const newDay = !undated && (!prev || fmtDate(prev.event_time) !== fmtDate(ev.event_time));
              return (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.035, 0.6), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`cc-strip-card ${undated ? "cc-strip-card--muted" : ""}`}
                  style={{ "--cc-dot": tone.color } as React.CSSProperties}
                >
                  <span className="cc-dot" aria-hidden="true" />
                  <span className="cc-stem" aria-hidden="true" />
                  {newDay && <span className="absolute -top-[42px] left-0 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-wider text-cot-text3">{fmtDate(ev.event_time)}</span>}
                  <article>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold" style={{ color: undated ? "var(--cot-text-3)" : tone.color }}>
                        {undated ? "time not stated" : fmtTime(ev.event_time)}
                      </span>
                      {ev.confidence !== null && <span className="font-mono text-[9.5px] text-cot-text3">{Math.round(ev.confidence * 100)}%</span>}
                    </div>
                    <div className="mt-0.5 label-caps text-[8px] text-cot-text3">{humanise(ev.event_type)}</div>
                    <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-cot-text">{ev.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Chip tone={tone.tone} className="!px-1.5 !py-px !text-[7.5px]">{tone.label}</Chip>
                      {src && (
                        <button type="button" onClick={() => onShowEvidence(src.id)} className="truncate font-mono text-[9.5px] text-cot-text3 hover:text-cot-violet" title={src.description ?? undefined}>
                          {evidenceShortLabel(src)}
                        </button>
                      )}
                    </div>
                  </article>
                </motion.li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
