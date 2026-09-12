import type { Evidence } from "@/types";

/**
 * Renders each evidence item as a linked block showing a shortened hash and
 * a link line to the previous block's hash. Deliberately plain CSS/SVG (not
 * WebGL) — this is a data-integrity visualization, not a decorative one, and
 * per Section 8 of the architecture doc it should stay lightweight.
 */
export function HashChainStrip({ items }: { items: Evidence[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-on-surface-variant font-mono">No evidence logged for this case yet.</p>;
  }

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center shrink-0">
          <div className="rounded-md border border-primary/40 bg-surface-container-high px-3 py-2 min-w-[180px]">
            <p className="text-[10px] font-mono uppercase text-on-surface-variant">
              Block {index} · {item.evidence_type.replace(/_/g, " ")}
            </p>
            <p className="text-xs font-mono text-primary mt-1 truncate" title={item.sha256_hash}>
              {item.sha256_hash.slice(0, 16)}…
            </p>
            <p className="text-[10px] font-mono text-on-surface-variant mt-1 truncate">
              prev: {item.previous_hash ? `${item.previous_hash.slice(0, 12)}…` : "genesis"}
            </p>
          </div>
          {index < items.length - 1 && (
            <svg width="28" height="24" viewBox="0 0 28 24" className="shrink-0 text-outline">
              <line x1="0" y1="12" x2="28" y2="12" stroke="currentColor" strokeWidth="2" />
              <polygon points="20,6 28,12 20,18" fill="currentColor" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
