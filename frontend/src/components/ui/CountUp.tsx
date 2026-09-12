import { animate, useInView } from "motion/react";
import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/** A number that counts up to its value when it enters the viewport. */
export function CountUp({ value, decimals = 0, suffix = "", prefix = "", className = "", duration = 1.1 }: { value: number; decimals?: number; suffix?: string; prefix?: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || !inView) {
      el.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [value, decimals, suffix, prefix, duration, inView, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
