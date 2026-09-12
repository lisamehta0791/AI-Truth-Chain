import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Page title block: eyebrow, glowing display headline, one-line intent, actions. */
export function SectionHeader({ eyebrow, title, description, actions, live }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; live?: boolean }) {
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <span className="eyebrow text-cot-magenta">
            {live && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cot-magenta" />}
            {eyebrow}
          </span>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-1 text-2xl text-white glow-text lg:text-[30px]"
        >
          {title}
        </motion.h1>
        {description && <p className="mt-1.5 max-w-3xl text-[15px] text-cot-text2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
