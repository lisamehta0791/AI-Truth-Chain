import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Route transition — deliberately quiet.
 *
 * Entry (~260 ms): the page fades in and rises ten pixels; a hairline
 * progress bar runs along the top of the viewport for the duration. The
 * earlier wipe / flash / light-sweep treatment was removed at the owner's
 * request — it read as decoration rather than as a working tool.
 *
 * Exit (~200 ms): the outgoing page collapses and blurs. Every page mounts
 * its own shell, so an exit can only run BEFORE navigation: the shell's links
 * call `useShellNavigate()`, which plays the exit and then routes. Links that
 * don't go through it simply get the entry animation on the next page.
 *
 * Once the entry has settled, perspective / clip-path / will-change are
 * removed so the page container no longer acts as a containing block.
 *
 * Controlled only by the in-app motion toggle — never the OS media query.
 */

const ENTER_MS = 260;
const EXIT_MS = 140;
const EASE = [0.22, 1, 0.36, 1] as const;

let exitHandler: (() => Promise<void>) | null = null;

/** Navigate with the exit animation first. Falls back to a plain navigate. */
export function useShellNavigate() {
  const navigate = useNavigate();
  return useCallback(
    async (to: string) => {
      if (exitHandler) await exitHandler();
      navigate(to);
    },
    [navigate]
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [settled, setSettled] = useState(false);
  const [barVisible, setBarVisible] = useState(!reduced);

  useEffect(() => {
    if (reduced) return;
    exitHandler = () =>
      new Promise<void>((resolve) => {
        setLeaving(true);
        window.setTimeout(resolve, EXIT_MS);
      });
    return () => {
      exitHandler = null;
    };
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    setBarVisible(true);
    setSettled(false);
    const t = window.setTimeout(() => setBarVisible(false), ENTER_MS + 120);
    return () => window.clearTimeout(t);
  }, [location.pathname, reduced]);

  if (reduced) return <>{children}</>;

  // NOTE: clipPath must stay in the settled target — a value dropped from
  // `animate` is animated back to its `initial` (inset 100%), which clipped
  // the whole page away half a second after every navigation.
  const enter = { opacity: 1, y: 0, transition: { duration: ENTER_MS / 1000, ease: EASE } };
  const exit = { opacity: 0, y: -6, transition: { duration: EXIT_MS / 1000, ease: "easeIn" as const } };

  return (
    <>
      <AnimatePresence>
        {barVisible && (
          <motion.div
            key="bar"
            className="route-progress"
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: ENTER_MS / 1000, ease: EASE }}
            style={{ width: "100%" }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <div>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={leaving ? exit : enter}
          onAnimationComplete={() => {
            if (!leaving) setSettled(true);
          }}
          style={{ position: "relative", willChange: settled ? "auto" : "transform, opacity" }}
        >
          {children}
        </motion.div>
      </div>
    </>
  );
}
