import type { Evidence, EvidenceType, VerificationStatus } from "@/types";

/**
 * Timeline events carry the clock time the SOURCE stated ("20:44 — the figure
 * exits"). The extractor writes that wall-clock time without an offset, so the
 * database holds it as UTC. Rendering it in the browser's zone would shift a
 * CCTV timestamp of 20:44 to 02:14 the next morning — so stated times are
 * always formatted in UTC, exactly as the document reads.
 */
export function statedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function statedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function statedDateTime(iso: string): string {
  return `${statedDate(iso)} · ${statedTime(iso)}`;
}

/** Calendar day key in UTC — used to group the timeline by day. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Real instants (uploads, reviews, verification runs) are shown in local time. */
export function localDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function timeStated(ev: { extracted_entities: unknown }): boolean {
  return (ev.extracted_entities as { time_stated?: boolean } | null)?.time_stated !== false;
}

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  document: "Document",
  statement: "Witness statement",
  forensic_report: "Forensic report",
  autopsy_report: "Post-mortem report",
  cctv_metadata: "CCTV",
  phone_record: "Call records",
  gps_log: "Location data",
  seized_item: "Seized item",
};

export function evidenceName(e: Evidence | undefined | null, fallbackId?: string | null): string {
  if (e) return e.description ?? e.original_filename ?? EVIDENCE_TYPE_LABEL[e.evidence_type];
  return fallbackId ? `Evidence ${fallbackId.slice(0, 8)}` : "Unknown source";
}

export function humanise(s: string): string {
  return s.replace(/_/g, " ");
}

export function pct(n: number | null | undefined): string {
  return typeof n === "number" ? `${Math.round(n * 100)}%` : "—";
}

export type StatusTone = "ok" | "ai" | "warn" | "critical" | "neutral";

export function statusTone(status: VerificationStatus): StatusTone {
  switch (status) {
    case "verified":
    case "human_confirmed":
      return "ok";
    case "ai_extracted_unverified":
    case "ai_hypothesis":
      return "ai";
    case "requires_review":
      return "warn";
    case "dismissed":
    default:
      return "neutral";
  }
}
