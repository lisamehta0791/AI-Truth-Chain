import type { ReactNode, SVGProps } from "react";

export type ForensicIconName =
  | "dashboard" | "evidence" | "timeline" | "contradiction" | "guidance" | "graph"
  | "autopsy" | "custody" | "audit" | "settings" | "logout" | "search" | "plus"
  | "arrow" | "shield" | "alert" | "check" | "brain" | "lock" | "map" | "document" | "upload";

export function ForensicIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: ForensicIconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...props };
  const paths: Record<ForensicIconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    evidence: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5A2.5 2.5 0 0 0 17.5 16H4z"/><path d="M4 5.5V20h13.5A2.5 2.5 0 0 0 20 17.5"/><path d="M8 7h8M8 11h8"/></>,
    timeline: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/></>,
    contradiction: <><path d="M12 3 21 20H3z"/><path d="M12 8v5M12 17h.01"/></>,
    guidance: <><path d="M9 18h6M10 21h4"/><path d="M8.4 14.5A7 7 0 1 1 15.7 14c-.8.5-1.3 1.2-1.5 2H9.8c-.2-.6-.6-1.1-1.4-1.5Z"/><path d="M12 6v4M10 8h4"/></>,
    graph: <><circle cx="5" cy="12" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="m7 11 9-4M7 13l9 4"/></>,
    autopsy: <><circle cx="12" cy="5" r="2"/><path d="M9 9h6l2 6-5 3-5-3z"/><path d="M9 10 6 14M15 10l3 4M10 18l-2 3M14 18l2 3"/></>,
    custody: <><path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6z"/><path d="m8 12 2.5 2.5L16 9"/></>,
    audit: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8.1 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.2 1Z"/></>,
    logout: <><path d="M10 5H5v14h5"/><path d="m14 8 4 4-4 4M18 12H9"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h13M13 7l5 5-5 5"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5M12 16h.01"/></>,
    check: <path d="m5 12 4 4L19 7"/>,
    brain: <><path d="M9.5 4.5a3 3 0 0 0-5 2.2A3 3 0 0 0 5 12a3 3 0 0 0 2 5.5A3 3 0 0 0 12 19V5a3 3 0 0 0-2.5-.5Z"/><path d="M14.5 4.5a3 3 0 0 1 5 2.2A3 3 0 0 1 19 12a3 3 0 0 1-2 5.5A3 3 0 0 1 12 19V5a3 3 0 0 1 2.5-.5Z"/><path d="M7 8h2M6.5 13h2M15 8h2M15.5 13h2"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>,
    document: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h5"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
