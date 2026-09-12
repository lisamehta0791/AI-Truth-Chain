import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { ForensicIcon, type ForensicIconName } from "@/components/ui/ForensicIcon";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ForensicIconName;
  keywords?: string;
  /** Right-aligned decoration (a shortcut, a chip). */
  trailing?: ReactNode;
  run: () => void;
}

/* ------------------------------------------------------------------ */
/* Fuzzy match: subsequence with bonuses for prefix / word starts /    */
/* consecutive hits. Good enough for a few dozen destinations.         */
/* ------------------------------------------------------------------ */
function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, hits: [] };
  const idx = t.indexOf(q);
  if (idx >= 0) {
    const hits = Array.from({ length: q.length }, (_, i) => idx + i);
    return { score: 100 - idx + (idx === 0 || t[idx - 1] === " " ? 30 : 0), hits };
  }
  const hits: number[] = [];
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found < 0) return null;
    if (found === ti && qi > 0) streak += 1;
    else streak = 0;
    score += 10 + streak * 6 + (found === 0 || t[found - 1] === " " ? 8 : 0) - (found - ti) * 0.5;
    hits.push(found);
    ti = found + 1;
  }
  return { score, hits };
}

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  return (
    <>
      {text.split("").map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : <span key={i}>{ch}</span>))}
    </>
  );
}

export function CommandPalette({
  open,
  onClose,
  items,
  initialQuery = "",
  context,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  initialQuery?: string;
  /** One line above the list — the active case, typically. */
  context?: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setCursor(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open, initialQuery]);

  const results = useMemo(() => {
    const scored = items
      .map((item) => {
        const m = fuzzy(query, item.label) ?? (query ? fuzzy(query, `${item.hint ?? ""} ${item.keywords ?? ""}`) : null);
        if (!m) return null;
        const onLabel = fuzzy(query, item.label) !== null;
        return { item, score: m.score + (onLabel ? 20 : 0), hits: onLabel ? m.hits : [] };
      })
      .filter((r): r is { item: PaletteItem; score: number; hits: number[] } => r !== null);
    if (query) scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [items, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(results.length - 1, c + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[cursor];
        if (r) {
          onClose();
          r.item.run();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, cursor, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Group in display order while keeping the score ordering inside a group.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Array<{ item: PaletteItem; hits: number[]; index: number }>>();
    results.forEach((r, index) => {
      if (!byGroup.has(r.item.group)) {
        byGroup.set(r.item.group, []);
        order.push(r.item.group);
      }
      byGroup.get(r.item.group)!.push({ item: r.item, hits: r.hits, index });
    });
    return order.map((g) => ({ group: g, rows: byGroup.get(g)! }));
  }, [results]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            aria-hidden="true"
            className="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            key="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="palette"
            initial={{ opacity: 0, y: -18, scale: 0.97, x: "-50%", clipPath: "inset(0 0 100% 0 round 16px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%", clipPath: "inset(0 0 0% 0 round 16px)" }}
            exit={{ opacity: 0, y: -10, scale: 0.98, x: "-50%", transition: { duration: 0.14 } }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 border-b border-[color:var(--cot-line)] pl-4">
              <ForensicIcon name="search" size={18} className="shrink-0 text-cot-violet" />
              <input
                ref={inputRef}
                className="palette-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search evidence, people, locations, screens…"
                aria-label="Search"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="mr-4 hidden sm:inline-block">ESC</kbd>
            </div>

            {context && <div className="flex items-center gap-2 border-b border-[color:var(--cot-line-soft)] bg-[rgba(6,255,165,.04)] px-4 py-2">{context}</div>}

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
              {groups.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="label-caps text-cot-text3">No match in this case file</p>
                  <p className="mt-1 text-sm text-cot-text3">Try a screen name, an action, or a keyword such as “hash”, “witness” or “map”.</p>
                </div>
              )}
              {groups.map(({ group, rows }) => (
                <div key={group} className="mb-1">
                  <div className="label-caps px-3 pb-1 pt-2 text-cot-text4">{group}</div>
                  {rows.map(({ item, hits, index }) => (
                    <button
                      key={item.id}
                      type="button"
                      data-index={index}
                      className={`palette-row ${index === cursor ? "active" : ""}`}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => {
                        onClose();
                        item.run();
                      }}
                    >
                      <span className="nav-well">
                        <ForensicIcon name={item.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <Highlight text={item.label} hits={hits} />
                        </span>
                        {item.hint && <span className="block truncate text-[12px] font-medium text-cot-text3">{item.hint}</span>}
                      </span>
                      {item.trailing}
                      {index === cursor && <kbd className="hidden sm:inline-block">↵</kbd>}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-[color:var(--cot-line-soft)] px-4 py-2 text-[11px] text-cot-text3">
              <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
              <span className="ml-auto label-caps text-cot-text4">Ctrl K</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
