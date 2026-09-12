import { motion } from "motion/react";

import { EvidenceGlyph, STATUS_META, shortHash, typeMeta } from "@/components/evidence/evidenceMeta";
import { Chip } from "@/components/ui/Chip";
import type { Evidence } from "@/types";

import "@/styles/evidence.css";

interface Props {
  items: Evidence[];
  thumbs: Record<string, string>;
  selectedId?: string | null;
  onSelect?: (item: Evidence) => void;
  /** Show chain position (block index) on the left of each row. */
  showIndex?: boolean;
  compact?: boolean;
}

/**
 * The evidence vault: one row per item with a real thumbnail (or the type
 * glyph), name, short hash and status. Used by the intake page's "recent"
 * list and by the custody page as the selector.
 */
export function EvidenceVaultList({ items, thumbs, selectedId, onSelect, showIndex, compact }: Props) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => {
        const meta = typeMeta(item.evidence_type);
        const status = STATUS_META[item.status] ?? { label: item.status, tone: "neutral" as const };
        const active = selectedId === item.id;
        const label = item.description || item.original_filename || meta.label;
        const Row = (
          <>
            {showIndex && (
              <span className="w-6 shrink-0 text-center font-mono text-[11px] text-cot-text4">{String(i).padStart(2, "0")}</span>
            )}
            <span className="vault-thumb" style={{ color: meta.color }}>
              {thumbs[item.id] ? <img src={thumbs[item.id]} alt="" /> : <EvidenceGlyph type={item.evidence_type} size={20} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="label-caps" style={{ color: meta.color }}>{meta.short}</span>
                {!compact && <Chip tone={status.tone} className="!px-2 !py-px !text-[7.5px]">{status.label}</Chip>}
              </span>
              <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-white">{label}</span>
              <span className="mt-0.5 block font-mono text-[10.5px] text-cot-text3">
                {shortHash(item.sha256_hash)} · {new Date(item.captured_at ?? item.uploaded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </span>
          </>
        );
        return (
          <motion.li key={item.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.35 }}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(item)} className={`vault-item !overflow-visible ${active ? "is-active" : ""}`} aria-pressed={active}>
                {Row}
              </button>
            ) : (
              <div className="vault-item">{Row}</div>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
