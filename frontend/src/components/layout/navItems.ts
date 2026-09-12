import type { ForensicIconName } from "@/components/ui/ForensicIcon";
import { canManageAccounts, canViewAuditLog, type User } from "@/types";

/**
 * Every destination in the shell, in one place, so the sidebar, the icon
 * rail and the command palette can never disagree about what exists or who
 * may see it. Visibility rules are a courtesy only — the server enforces them.
 */
export interface NavItem {
  label: string;
  path: string;
  icon: ForensicIconName;
  /** Short line for the command palette. */
  hint: string;
  keywords?: string;
  visible?: (user: User | null) => boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Command Center", path: "/dashboard", icon: "dashboard", hint: "Live case workspace", keywords: "home dashboard overview" },
  { label: "Timeline", path: "/timeline", icon: "timeline", hint: "Reconstructed sequence of events", keywords: "events chronology" },
  { label: "Contradictions", path: "/contradictions", icon: "contradiction", hint: "Where the evidence disagrees", keywords: "conflicts discrepancies" },
  { label: "Investigation Copilot", path: "/guidance", icon: "guidance", hint: "Gaps, next steps and questions", keywords: "ai guidance ask assistant" },
  { label: "Autopsy Cross-Check", path: "/autopsy", icon: "autopsy", hint: "Post-mortem findings on the 3D figure", keywords: "body forensic post-mortem" },
  { label: "Hash Ledger", path: "/ledger", icon: "lock", hint: "Tamper-evident hash chain", keywords: "integrity sha256 blockchain" },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Log Evidence", path: "/evidence/ingest", icon: "upload", hint: "Capture and hash a new item", keywords: "add upload ingest vault" },
  { label: "Evidence Graph", path: "/evidence/graph", icon: "graph", hint: "People, places and items as a network", keywords: "network nodes links" },
  { label: "Chain of Custody", path: "/chain-of-custody", icon: "custody", hint: "Who handled what, and when", keywords: "handling transfers" },
  { label: "Predictive Location", path: "/location", icon: "map", hint: "Where the suspect was likely to be", keywords: "map geo gps" },
  { label: "Case Review", path: "/closure-score", icon: "check", hint: "Closure readiness score", keywords: "closure readiness score" },
  { label: "Chargesheet QA", path: "/chargesheet", icon: "document", hint: "Pre-filing completeness checks", keywords: "filing prosecution checks" },
  { label: "Statement Reliability", path: "/statements", icon: "document", hint: "Version drift across witness statements", keywords: "witness versions" },
  { label: "Case Similarity", path: "/case-similarity", icon: "graph", hint: "Prior cases with the same pattern", keywords: "similar pattern precedent" },
  { label: "Audit Trail", path: "/audit", icon: "audit", hint: "Every access, in order", keywords: "log access history", visible: canViewAuditLog },
  { label: "Personnel & Access", path: "/personnel", icon: "shield", hint: "Provision accounts and ranks", keywords: "users officers accounts", visible: canManageAccounts },
  { label: "Offline Sync", path: "/offline-sync", icon: "upload", hint: "Queued field captures", keywords: "queue offline field" },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

export function visibleNav(items: NavItem[], user: User | null): NavItem[] {
  return items.filter((i) => !i.visible || i.visible(user));
}

export function navFor(path: string): NavItem | undefined {
  return ALL_NAV.find((i) => i.path === path);
}
