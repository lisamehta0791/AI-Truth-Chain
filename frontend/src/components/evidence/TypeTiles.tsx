import { motion } from "motion/react";

import { EVIDENCE_TYPES, EvidenceGlyph } from "@/components/evidence/evidenceMeta";
import type { EvidenceType } from "@/types";

import "@/styles/evidence.css";

/** Evidence type picker as glowing icon tiles. Amber dot = needs a witnessing officer. */
export function TypeTiles({ value, onChange }: { value: EvidenceType; onChange: (t: EvidenceType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Evidence type">
      {EVIDENCE_TYPES.map((t, i) => {
        const active = t.value === value;
        return (
          <motion.button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(t.value)}
            className={`type-tile ${active ? "is-active" : ""}`}
            style={{ ["--tile-color" as string]: t.color }}
            title={t.hint}
          >
            {t.requiresWitness && <span className="type-tile__flag" title="Requires a witnessing officer" />}
            <span className="type-tile__glyph">
              <EvidenceGlyph type={t.value} size={16} />
            </span>
            <span className="type-tile__label">{t.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
