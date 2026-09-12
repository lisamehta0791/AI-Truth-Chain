import type { SVGProps } from "react";

import type { CustodyAction, EvidenceStatus, EvidenceType } from "@/types";

/**
 * One source of truth for how each evidence type is presented across the
 * intake stepper, the custody vault, the graph and the map: display label,
 * accent colour, glyph, and whether a second officer must witness collection.
 *
 * `requiresWitness` mirrors backend evidence_service — physical / captured
 * media needs a second officer; records and reports do not. The server is the
 * authority; this only lets the form ask up front.
 */
export interface EvidenceTypeMeta {
  value: EvidenceType;
  label: string;
  short: string;
  requiresWitness: boolean;
  /** Accent for markers, chips and glyph discs. Stays inside the contract palette. */
  color: string;
  hint: string;
}

export const EVIDENCE_TYPES: EvidenceTypeMeta[] = [
  { value: "photo", label: "Photograph", short: "Photo", requiresWitness: true, color: "#f472b6", hint: "Scene or item photograph. Second officer must witness." },
  { value: "video", label: "Video", short: "Video", requiresWitness: true, color: "#f472b6", hint: "Recorded footage. Second officer must witness." },
  { value: "audio", label: "Audio", short: "Audio", requiresWitness: true, color: "#f472b6", hint: "Recording or call audio. Second officer must witness." },
  { value: "seized_item", label: "Seized item", short: "Seized", requiresWitness: true, color: "#ff3d71", hint: "Physical object recovered. Second officer must witness." },
  { value: "statement", label: "Statement", short: "Statement", requiresWitness: false, color: "#a78bfa", hint: "Witness or suspect statement. Text feeds AI extraction." },
  { value: "document", label: "Document", short: "Document", requiresWitness: false, color: "#a78bfa", hint: "Report, register or paper record." },
  { value: "forensic_report", label: "Forensic report", short: "FSL", requiresWitness: false, color: "#06ffa5", hint: "Laboratory findings — prints, blood, tool marks." },
  { value: "autopsy_report", label: "Autopsy report", short: "Autopsy", requiresWitness: false, color: "#06ffa5", hint: "Post-mortem report. Cross-checked against the body map." },
  { value: "cctv_metadata", label: "CCTV metadata", short: "CCTV", requiresWitness: false, color: "#ffb547", hint: "Camera export log with verified clock." },
  { value: "phone_record", label: "Phone record", short: "CDR", requiresWitness: false, color: "#ffb547", hint: "Call detail records and tower hits." },
  { value: "gps_log", label: "GPS / ANPR log", short: "GPS", requiresWitness: false, color: "#ffb547", hint: "Vehicle or device movement trace." },
];

export const TYPE_META: Record<EvidenceType, EvidenceTypeMeta> = Object.fromEntries(EVIDENCE_TYPES.map((t) => [t.value, t])) as Record<EvidenceType, EvidenceTypeMeta>;

export function typeMeta(type: EvidenceType | string): EvidenceTypeMeta {
  return TYPE_META[type as EvidenceType] ?? { value: "document", label: String(type).replace(/_/g, " "), short: String(type), requiresWitness: false, color: "#a78bfa", hint: "" };
}

/** Status presentation. Mirrors EvidenceStatus. */
export const STATUS_META: Record<EvidenceStatus, { label: string; tone: "ai" | "ok" | "warn" | "critical" | "neutral" }> = {
  pending_confirmation: { label: "Awaiting witness", tone: "warn" },
  logged: { label: "Sealed", tone: "ok" },
  ai_processed: { label: "AI processed", tone: "ai" },
  flagged: { label: "Flagged", tone: "critical" },
};

/** Custody action presentation. Mirrors CustodyAction. */
export const ACTION_META: Record<CustodyAction, { label: string; tone: "ai" | "ok" | "warn" | "critical" | "neutral"; color: string; blurb: string }> = {
  collected: { label: "Collected", tone: "neutral", color: "#a78bfa", blurb: "Item taken into custody by the logging officer." },
  witness_confirmed: { label: "Witness confirmed", tone: "ok", color: "#06ffa5", blurb: "Second officer confirmed collection from their own account." },
  hash_logged: { label: "Hash sealed", tone: "ok", color: "#06ffa5", blurb: "SHA-256 computed and chained to the previous block." },
  viewed: { label: "Viewed", tone: "neutral", color: "#b9b0d6", blurb: "Read access recorded." },
  transferred: { label: "Transferred", tone: "warn", color: "#ffb547", blurb: "Custody moved to another officer or unit." },
  ai_processed: { label: "AI processed", tone: "ai", color: "#f472b6", blurb: "Extraction ran; output is a hypothesis until confirmed." },
  synced_from_offline: { label: "Synced from offline", tone: "warn", color: "#ffb547", blurb: "Captured offline, replayed with its original timestamp and hash." },
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function shortHash(hash: string | null | undefined, n = 12): string {
  if (!hash) return "genesis";
  return `${hash.slice(0, n)}…${hash.slice(-4)}`;
}

/** Client-side SHA-256 of a file via Web Crypto — the officer sees the seal before it leaves the device. */
export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Line-art glyph per evidence type, drawn in the current colour. */
export function EvidenceGlyph({ type, size = 18, ...props }: SVGProps<SVGSVGElement> & { type: EvidenceType | string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...props };
  switch (type) {
    case "photo":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <path d="M8 6l1.5-2h5L16 6" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3z" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M4 12h2l2-5 3 10 3-8 2 3h4" />
        </svg>
      );
    case "seized_item":
      return (
        <svg {...common}>
          <path d="M4 8l8-4 8 4-8 4-8-4z" />
          <path d="M4 8v8l8 4 8-4V8" />
          <path d="M12 12v8" />
        </svg>
      );
    case "statement":
      return (
        <svg {...common}>
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5M9 12h6M9 16h5" />
        </svg>
      );
    case "forensic_report":
      return (
        <svg {...common}>
          <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
          <path d="M7.5 15h9" />
        </svg>
      );
    case "autopsy_report":
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="2" />
          <path d="M9 9h6l2 6-5 3-5-3z" />
          <path d="M9 10 6 14M15 10l3 4M10 18l-2 3M14 18l2 3" />
        </svg>
      );
    case "cctv_metadata":
      return (
        <svg {...common}>
          <path d="M3 8l12-4 2 5-12 4z" />
          <path d="M6 13l-1 5M15 9l3 1v3" />
          <circle cx="13" cy="7" r="1" />
        </svg>
      );
    case "phone_record":
      return (
        <svg {...common}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M11 18h2" />
          <path d="M3 8c0-2 1-3 2-3M3 12h2M3 16c0 2 1 3 2 3" />
        </svg>
      );
    case "gps_log":
      return (
        <svg {...common}>
          <path d="M12 21s6-6 6-11a6 6 0 0 0-12 0c0 5 6 11 6 11z" />
          <circle cx="12" cy="10" r="2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5" />
        </svg>
      );
  }
}
