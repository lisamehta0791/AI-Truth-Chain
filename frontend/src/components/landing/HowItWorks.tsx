import { motion } from "motion/react";

import { ForensicIcon, type ForensicIconName } from "@/components/ui/ForensicIcon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TiltCard } from "@/components/ui/TiltCard";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * The four moves every piece of evidence makes through the system. The
 * step tone tracks the product's colour language: sealing is deterministic
 * cryptography (mint = verified), reasoning is an AI hypothesis (magenta),
 * deciding is a human act (mint again).
 */
const STEPS: Array<{ num: string; icon: ForensicIconName; title: string; body: string; tone: "" | "ld-step--ok" | "ld-step--ai" }> = [
  {
    num: "01",
    icon: "upload",
    title: "Log",
    body: "Two-officer confirmation, device metadata and a live capture locked at the scene. A Constable logs; a senior officer countersigns.",
    tone: "",
  },
  {
    num: "02",
    icon: "lock",
    title: "Seal",
    body: "SHA-256 on arrival, linked to the previous entry and anchored outside the database. Deterministic cryptography — no AI in this step.",
    tone: "ld-step--ok",
  },
  {
    num: "03",
    icon: "brain",
    title: "Reason",
    body: "Entities, times and places extracted and placed on one timeline, each beside the exact excerpt it came from. Every conflict is flagged as a hypothesis.",
    tone: "ld-step--ai",
  },
  {
    num: "04",
    icon: "check",
    title: "Decide",
    body: "An officer confirms or dismisses. Both outcomes — and who made them — are written to the audit trail permanently.",
    tone: "ld-step--ok",
  },
];

export function HowItWorks() {
  const reduced = usePrefersReducedMotion();
  return (
    <section id="how-it-works" className="ld-band">
      <div className="ld-band__glow" aria-hidden="true" />
      <div className="ld-wrap">
        <SectionHeader
          eyebrow="How it works"
          title="Log → Seal → Reason → Decide"
          description="One evidence upload, four reactions. Every module reads from and writes back to a single verified case timeline — which is what makes this one connected system rather than a shelf of tools."
        />
        <ol className="ld-steps">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.num}
              initial={reduced ? false : { opacity: 0, y: 28, rotateX: -8 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <TiltCard className={`hud-frame ld-step ${step.tone}`} intensity={6}>
                <span className="ld-step__num">STEP {step.num}</span>
                <div className="ld-step__icon">
                  <ForensicIcon name={step.icon} size={22} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </TiltCard>
              <span className="ld-step__link" aria-hidden="true" />
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
