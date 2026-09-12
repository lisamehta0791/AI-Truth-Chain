import { motion } from "motion/react";

import { ForensicIcon, type ForensicIconName } from "@/components/ui/ForensicIcon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TiltCard } from "@/components/ui/TiltCard";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/** Every module in the command centre, one line each. All of them run on the demo case. */
const MODULES: Array<{ icon: ForensicIconName; title: string; body: string }> = [
  { icon: "evidence", title: "Evidence ingestion", body: "Upload, two-officer confirmation, live capture, SHA-256 seal." },
  { icon: "custody", title: "Chain of custody", body: "Every hand-off logged and hash-linked to the one before." },
  { icon: "graph", title: "Evidence graph", body: "People, places, objects and times as one connected structure." },
  { icon: "timeline", title: "Timeline", body: "Thirty-five events ordered by when they happened, not when they arrived." },
  { icon: "contradiction", title: "Contradictions", body: "Where two items disagree — with both excerpts side by side." },
  { icon: "guidance", title: "Investigative guidance", body: "What to ask next, and why, cited to the record." },
  { icon: "autopsy", title: "Autopsy 3D", body: "Post-mortem findings mapped on an anatomical body and cross-checked." },
  { icon: "map", title: "Predictive location", body: "Transparent heuristic search zones from towers, CCTV and movements." },
  { icon: "document", title: "Chargesheet QA", body: "Every claim in the draft checked against sealed evidence." },
  { icon: "shield", title: "Closure readiness", body: "A scored view of what the court will ask and what is still missing." },
  { icon: "search", title: "Case similarity", body: "Earlier files with the same shape, surfaced with the reason." },
  { icon: "audit", title: "Audit trail & ledger", body: "Who saw, changed or confirmed what — anchored outside the database." },
];

export function ModulesGrid() {
  const reduced = usePrefersReducedMotion();
  return (
    <section id="modules" className="ld-band ld-band--tight">
      <div className="ld-wrap">
        <SectionHeader
          eyebrow="Inside the command centre"
          title="Twelve modules, one sealed timeline"
          description="Each one is live on the demo case the moment you sign in. AI output is shown as a magenta hypothesis until an officer confirms it — then, and only then, it turns mint."
        />
        <ul className="ld-modules">
          {MODULES.map((m, i) => (
            <motion.li
              key={m.title}
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: (i % 4) * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <TiltCard className="hud-frame ld-module" intensity={5}>
                <span className="ld-module__icon">
                  <ForensicIcon name={m.icon} size={18} />
                </span>
                <span>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </span>
              </TiltCard>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
