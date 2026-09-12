import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { type ReactNode, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * A panel that tilts toward the cursor in 3D with a moving light reflection —
 * the "glass slab" behaviour the interface is built around. Wrap any hud-frame.
 * The glare is violet with a magenta rim so it reads as the same light that
 * lives everywhere else in the product.
 */
export function TiltCard({
  children,
  className = "",
  intensity = 7,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [intensity, -intensity]), { stiffness: 220, damping: 24 });
  const ry = useSpring(useTransform(mx, [0, 1], [-intensity, intensity]), { stiffness: 220, damping: 24 });
  const glareX = useTransform(mx, [0, 1], [0, 100]);
  const glareY = useTransform(my, [0, 1], [0, 100]);
  const glareBg = useMotionTemplate`radial-gradient(380px circle at ${glareX}% ${glareY}%, rgba(196,181,253,.16), rgba(244,114,182,.05) 45%, transparent 65%)`;

  function onMove(e: React.PointerEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    mx.set(0.5);
    my.set(0.5);
  }

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", transformPerspective: 1100 }}
      className={`relative ${className}`}
    >
      {children}
      {glare && <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glareBg }} />}
    </motion.div>
  );
}
