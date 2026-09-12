import type { HTMLAttributes, ReactNode } from "react";

export type PanelTone = "default" | "ai" | "ok" | "warn" | "crit";

const TONE: Record<PanelTone, string> = { default: "", ai: "hud-frame--ai", ok: "hud-frame--ok", warn: "hud-frame--warn", crit: "hud-frame--crit" };

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  tone?: PanelTone;
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  /** Animated conic border for panels that update live. */
  live?: boolean;
  /** Scanning sweep while loading / AI is working. */
  busy?: boolean;
  padded?: boolean;
  as?: "section" | "div" | "article" | "aside";
}

/**
 * The signature surface: obsidian glass, violet hairline, gradient corner
 * brackets. Header row is optional; the body is whatever you pass.
 */
export function Panel({ tone = "default", eyebrow, title, actions, live, busy, padded = true, as = "section", className = "", children, ...rest }: PanelProps) {
  const Tag = as;
  const hasHeader = Boolean(eyebrow || title || actions);
  return (
    <Tag className={`hud-frame ${TONE[tone]} ${live ? "live-border" : ""} ${busy ? "scan-active" : ""} ${className}`} {...rest}>
      {hasHeader && (
        <header className={`flex flex-wrap items-start justify-between gap-3 ${padded ? "px-4 pt-4" : ""} ${children ? "pb-2" : padded ? "pb-4" : ""}`}>
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="mt-1 text-[13px] leading-tight text-white">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children && <div className={padded ? "px-4 pb-4" : ""}>{children}</div>}
    </Tag>
  );
}
