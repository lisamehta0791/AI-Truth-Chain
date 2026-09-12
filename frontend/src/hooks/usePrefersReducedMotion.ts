import { useEffect, useState } from "react";

/**
 * Motion preference for the whole interface.
 *
 * This is an IN-APP setting (persisted per browser), not the OS media query.
 * The OS flag `prefers-reduced-motion` is switched on by default on a
 * surprising number of Windows installs, which previously stripped every
 * transition from the product without the user ever choosing that. Motion is
 * therefore on by default; the shell exposes a toggle (see AppShell) and the
 * OS preference is offered as a one-time suggestion only.
 */
const KEY = "cot:reduce-motion";
const EVENT = "cot:motion-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function apply(reduced: boolean) {
  if (typeof document === "undefined") return;
  if (reduced) document.documentElement.setAttribute("data-reduce-motion", "1");
  else document.documentElement.removeAttribute("data-reduce-motion");
}

export function setReduceMotion(reduced: boolean) {
  try {
    localStorage.setItem(KEY, reduced ? "1" : "0");
  } catch {
    /* private mode — keep it in memory only */
  }
  apply(reduced);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: reduced }));
}

export function getReduceMotion(): boolean {
  return read();
}

// Apply once at module load so the first paint already respects the choice.
if (typeof window !== "undefined") apply(read());

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => (typeof window !== "undefined" ? read() : false));

  useEffect(() => {
    const onChange = (e: Event) => setReduced(Boolean((e as CustomEvent).detail));
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  return reduced;
}
