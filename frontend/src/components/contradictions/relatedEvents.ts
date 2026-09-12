import type { TimelineEvent } from "@/types";

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "at", "on", "by", "from", "with", "that", "this", "was", "were", "is", "are", "be", "as", "it", "for", "his", "her", "he", "she", "they", "new", "event", "evidence", "states", "stated", "reports", "records", "while", "yet", "whereas", "which", "who", "after", "before", "same", "not", "no", "any", "did", "see", "saw", "use", "used", "cctv", "witness", "statement", "footage", "source", "id"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9:]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/**
 * Picks the extracted timeline event from one evidence item that best
 * supports the contradiction's explanation — the "what this side actually
 * says" excerpt. Pure word overlap plus a bonus for a shared clock time
 * (20:44, 21:15…): deterministic, explainable, no model call.
 */
export function bestSupportingEvent(explanation: string, events: TimelineEvent[], evidenceId: string): TimelineEvent | null {
  const expl = tokens(explanation);
  const times = explanation.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  let best: { ev: TimelineEvent; score: number } | null = null;
  for (const ev of events) {
    if (ev.source_evidence_id !== evidenceId) continue;
    const evTokens = tokens(`${ev.description} ${ev.source_excerpt ?? ""} ${ev.event_type}`);
    let score = 0;
    evTokens.forEach((t) => expl.has(t) && (score += 1));
    const evTime = ev.event_time.slice(11, 16);
    if (times.some((t) => t.padStart(5, "0") === evTime)) score += 4;
    if (!best || score > best.score) best = { ev, score };
  }
  return best && best.score >= 2 ? best.ev : null;
}
