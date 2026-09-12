import { motion } from "motion/react";

import { LinkButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * The demo case, front and centre. COT-2026-0001 is fully loaded on the
 * demo backend — every module has data — so the landing page says so and
 * hands the visitor straight to sign-in.
 */
const OFFICERS = [
  { initials: "LM", name: "Lisa Mathew", rank: "Inspector · IO" },
  { initials: "AR", name: "Ananya Rao", rank: "Sub-Inspector" },
  { initials: "AP", name: "Arjun Pillai", rank: "Constable" },
  { initials: "MI", name: "Dr. Meera Iyer", rank: "DSP · Forensic" },
  { initials: "VN", name: "Vikram Nair", rank: "Superintendent" },
  { initials: "RM", name: "Rajesh Menon", rank: "Commissioner" },
  { initials: "SK", name: "Sameer Kulkarni", rank: "Prosecutor · view-only" },
];

export function DemoCaseBand() {
  const reduced = usePrefersReducedMotion();
  const rise = (delay = 0) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 26 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-60px" },
          transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section id="demo" className="ld-band ld-band--tight">
      <div className="ld-wrap">
        <SectionHeader
          eyebrow="Demo case"
          live
          title="Riverside Hotel — Suspicious Death"
          description="A complete fictional investigation is loaded and sealed on the demo server. Sign in as any rank and walk it end to end: evidence, timeline, contradictions, autopsy, chargesheet, closure."
          actions={
            <LinkButton to="/login" variant="primary" size="lg">
              Open the demo case
              <ForensicIcon name="arrow" size={14} />
            </LinkButton>
          }
        />

        <div className="ld-demo">
          <motion.div {...rise(0)}>
            <Panel tone="ok" className="ld-demo__case h-full" padded={false}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="ld-demo__id">CASE COT-2026-0001</span>
                <Chip tone="ok" dot>
                  Chain intact
                </Chip>
                <Chip tone="ai">Hypotheses awaiting review</Chip>
              </div>
              <h3 className="ld-demo__title">Room 412, Riverside Hotel, Chennai — a guest found dead; the timings do not agree</h3>
              <p className="text-[15px] leading-relaxed text-cot-text2">
                Ten sealed items arrive in stages, the way a real file does: scene report, lobby and service-corridor CCTV, a receptionist&rsquo;s
                statement, call detail records, forensics, the post-mortem. The receptionist says the suspect left at 21:15; CCTV has him
                leaving at 20:47; his phone stays on the hotel tower until 22:05; the post-mortem places the death after he was gone. The AI
                finds each conflict and cites the excerpt. The Inspector decides.
              </p>
              <div>
                <p className="label-caps mb-2 text-cot-text3">Seven demo officers · Constable to Commissioner</p>
                <div className="ld-demo__people">
                  {OFFICERS.map((o) => (
                    <span className="ld-demo__person" key={o.initials} title={o.rank}>
                      <i>{o.initials}</i>
                      {o.name}
                      <span className="text-cot-text4">· {o.rank}</span>
                    </span>
                  ))}
                </div>
              </div>
              <p className="mono text-[11px] tracking-[.08em] text-cot-text4">
                password DemoPass!2026 · all names, places and records are fictional
              </p>
            </Panel>
          </motion.div>

          <motion.div className="ld-demo__stats" {...rise(0.12)}>
            <StatTile label="Evidence items" value={10} tone="violet" icon={<ForensicIcon name="evidence" />} hint="All ten SHA-256 sealed" progress={1} />
            <StatTile label="Timeline events" value={35} tone="violet" icon={<ForensicIcon name="timeline" />} hint="Statements, CCTV, calls, post-mortem" />
            <StatTile label="Autopsy findings" value={4} tone="magenta" icon={<ForensicIcon name="autopsy" />} hint="Mapped on the 3D body" />
            <StatTile label="Chain integrity" value={100} suffix="%" tone="mint" icon={<ForensicIcon name="shield" />} hint="Ledger anchored by the Superintendent" progress={1} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
