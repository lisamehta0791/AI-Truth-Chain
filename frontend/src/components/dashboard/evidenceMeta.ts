import type { ChipTone } from "@/components/ui/Chip";
import type { ForensicIconName } from "@/components/ui/ForensicIcon";
import type { Evidence, EvidenceType, TimelineEvent } from "@/types";

/** Display metadata per evidence type — label, glyph and tint for the fallback thumbnail. */
export const TYPE_META: Record<EvidenceType, { label: string; icon: ForensicIconName; tint: string }> = {
  photo: { label: "Photo", icon: "evidence", tint: "rgba(196,181,253,.55)" },
  video: { label: "Video", icon: "evidence", tint: "rgba(196,181,253,.55)" },
  audio: { label: "Audio", icon: "evidence", tint: "rgba(196,181,253,.55)" },
  document: { label: "Document", icon: "document", tint: "rgba(167,139,250,.5)" },
  statement: { label: "Witness statement", icon: "document", tint: "rgba(244,114,182,.5)" },
  forensic_report: { label: "Forensic report", icon: "shield", tint: "rgba(6,255,165,.45)" },
  autopsy_report: { label: "Post-mortem report", icon: "autopsy", tint: "rgba(255,61,113,.5)" },
  cctv_metadata: { label: "CCTV footage", icon: "evidence", tint: "rgba(154,216,255,.5)" },
  phone_record: { label: "Call records", icon: "document", tint: "rgba(255,181,71,.5)" },
  gps_log: { label: "Location data", icon: "map", tint: "rgba(255,181,71,.5)" },
  seized_item: { label: "Seized item", icon: "custody", tint: "rgba(255,143,176,.5)" },
};

export function typeMeta(e: Pick<Evidence, "evidence_type">) {
  return TYPE_META[e.evidence_type] ?? { label: String(e.evidence_type).replace(/_/g, " "), icon: "evidence" as ForensicIconName, tint: "rgba(125,115,158,.5)" };
}

export function evidenceName(e: Evidence | undefined | null): string {
  if (!e) return "evidence";
  return e.description ?? e.original_filename ?? typeMeta(e).label;
}

/** A short label for tight spaces: "CCTV Camera 07", "Witness statement", "Post-mortem report". */
export function evidenceShortLabel(e: Evidence | undefined | null): string {
  if (!e) return "Evidence";
  const head = (e.description ?? "").split(/\s[—–-]\s/)[0]?.trim() ?? "";
  if (head && head.length <= 22 && !/,/.test(head)) return head;
  return typeMeta(e).label;
}

export function fileExt(name: string | null | undefined): string | null {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name ?? "");
  return m ? m[1].toUpperCase() : null;
}

export type VaultStatus = { label: "Verified" | "AI extracted" | "Pending" | "Flagged"; tone: ChipTone; color: string };

/**
 * Derives the chip an officer sees on a vault row from the evidence record
 * plus what the AI produced from it. Verified = a human stands behind it
 * (witness officer confirmed collection, or an officer confirmed at least one
 * event read from it). AI extracted = the AI has read it, nobody has signed
 * off. Pending = hashed and sealed, nothing read yet.
 */
export function deriveVaultStatus(e: Evidence, timeline: TimelineEvent[]): VaultStatus {
  if (e.status === "flagged") return { label: "Flagged", tone: "critical", color: "var(--cot-red)" };
  if (e.status === "pending_confirmation") return { label: "Pending", tone: "warn", color: "var(--cot-amber)" };
  const events = timeline.filter((t) => t.source_evidence_id === e.id);
  const confirmed = events.some((t) => t.verification_status === "human_confirmed" || t.verification_status === "verified");
  if (e.witness_officer_id || confirmed) return { label: "Verified", tone: "ok", color: "var(--cot-mint)" };
  if (events.length > 0 || e.status === "ai_processed") return { label: "AI extracted", tone: "ai", color: "var(--cot-magenta)" };
  return { label: "Pending", tone: "warn", color: "var(--cot-amber)" };
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/** "HH:MM" in 24-hour local time — used to match times quoted inside AI explanations. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function humanise(s: string | null | undefined): string {
  if (!s) return "";
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Whether the source stated a time for this event (the extractor records `time_stated: false` when it had to fall back). */
export function timeStated(ev: TimelineEvent): boolean {
  return (ev.extracted_entities as { time_stated?: boolean } | null)?.time_stated !== false;
}

export function eventTone(ev: TimelineEvent): { color: string; tone: ChipTone; label: string } {
  switch (ev.verification_status) {
    case "human_confirmed":
    case "verified":
      return { color: "var(--cot-mint)", tone: "ok", label: "Confirmed" };
    case "dismissed":
      return { color: "var(--cot-text-4)", tone: "neutral", label: "Dismissed" };
    case "requires_review":
      return { color: "var(--cot-amber)", tone: "warn", label: "Needs review" };
    default:
      return { color: "var(--cot-magenta)", tone: "ai", label: "AI extracted" };
  }
}
