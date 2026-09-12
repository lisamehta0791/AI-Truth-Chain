import type { ReactNode } from "react";

import { ForensicIcon, type ForensicIconName } from "@/components/ui/ForensicIcon";

/**
 * Empty state that explains what WOULD be here and how to get it — never a
 * blank panel. Pages pass `action` (usually a demo loader) so a presenter
 * can fill the page in one click.
 */
export function EmptyState({ icon = "evidence", title, body, action, className = "" }: { icon?: ForensicIconName; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`hud-frame flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-[color:var(--cot-line)] bg-[rgba(167,139,250,.06)] text-cot-violet">
        <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle,rgba(167,139,250,.25),transparent_70%)] blur-md" />
        <ForensicIcon name={icon} size={26} className="relative" />
      </div>
      <h3 className="text-sm text-white">{title}</h3>
      {body && <p className="max-w-md text-sm text-cot-text2">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
