import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import "@/styles/shell.css";

import { Wordmark } from "@/components/brand/Wordmark";
import { PRIMARY_NAV, SECONDARY_NAV, visibleNav, type NavItem } from "@/components/layout/navItems";
import { PageTransition, useShellNavigate } from "@/components/layout/PageTransition";
import { RankBadge } from "@/components/rank/RankBadge";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { CommandPalette, type PaletteItem } from "@/components/ui/CommandPalette";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { MotionToggle } from "@/components/ui/MotionToggle";
import { useAuth } from "@/context/AuthContext";
import { useActiveCase } from "@/hooks/useActiveCase";
import { getReduceMotion, setReduceMotion, usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { Case, CaseStatus } from "@/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const STATUS: Record<CaseStatus, { label: string; tone: ChipTone }> = {
  open: { label: "Active investigation", tone: "ok" },
  under_review: { label: "Under review", tone: "warn" },
  chargesheet_filed: { label: "Chargesheet filed", tone: "ai" },
  closed: { label: "Closed", tone: "neutral" },
};

const ROLE_LABEL: Record<string, string> = {
  investigating_officer: "Investigating officer",
  supervisor: "Supervising officer",
  forensic_reviewer: "Forensic reviewer",
  legal_reviewer: "Legal reviewer",
};

function initialsOf(name: string | undefined): string {
  if (!name) return "CT";
  const parts = name.replace(/^(Dr\.|Adv\.|Supt\.)\s*/, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function caseTitle(c: Case): string {
  return c.title.replace(/\s*\((demo|demonstration)\)\s*$/i, "");
}

/** A case may carry a location in future schema versions; use it if present. */
function caseLocation(c: Case): string | null {
  const loc = (c as Case & { location?: string | null }).location;
  return loc && loc.trim() ? loc : null;
}

function openedOn(c: Case): string {
  const d = new Date(c.created_at);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

// The shell remounts on every navigation; remember the last case so the
// sidebar card and top bar never flash empty between pages.
let lastCase: Case | null = null;

/** Ripple on any button press, delegated once at the shell. */
function useRipples(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn || btn.disabled || btn.classList.contains("palette-row")) return;
      const r = btn.getBoundingClientRect();
      const span = document.createElement("span");
      const size = Math.max(r.width, r.height);
      span.className = "ripple";
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - r.left - size / 2}px`;
      span.style.top = `${e.clientY - r.top - size / 2}px`;
      btn.appendChild(span);
      setTimeout(() => span.remove(), 650);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, [enabled]);
}

/* ------------------------------------------------------------------ */
/* Sidebar pieces                                                      */
/* ------------------------------------------------------------------ */
function NavigationItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const go = useShellNavigate();
  const { pathname } = useLocation();
  const active = pathname === item.path;
  return (
    <NavLink
      to={item.path}
      data-tip={item.label}
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        e.preventDefault();
        onNavigate();
        if (!active) void go(item.path);
      }}
      className={`nav-item rail-center ${active ? "active" : ""}`}
    >
      {active && <motion.span layoutId="nav-active-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden="true" />}
      <span className="nav-well">
        <ForensicIcon name={item.icon} size={16} />
      </span>
      <span className="rail-hide min-w-0 truncate">{item.label}</span>
    </NavLink>
  );
}

function ActiveCaseCard({ activeCase, loading, onNavigate }: { activeCase: Case | null; loading: boolean; onNavigate: () => void }) {
  const go = useShellNavigate();
  const { pathname } = useLocation();
  const c = activeCase ?? lastCase;
  const status = c ? STATUS[c.status] : null;

  return (
    <button
      type="button"
      className="case-card rail-center"
      data-tip={c ? `${c.case_number} · ${status?.label ?? ""}` : "No active case"}
      onClick={() => {
        onNavigate();
        if (pathname !== "/dashboard") void go("/dashboard");
      }}
    >
      <span className="rail-only">
        <span className="relative grid h-9 w-9 place-items-center rounded-lg border border-[rgba(6,255,165,.35)] bg-[rgba(6,255,165,.08)] text-cot-mint">
          <ForensicIcon name="evidence" size={16} />
          <span className="pulse-dot absolute -right-1 -top-1 h-2 w-2 rounded-full bg-cot-mint shadow-[0_0_8px_rgba(6,255,165,.9)]" />
        </span>
      </span>
      <span className="rail-hide block min-w-0 flex-1">
        {c ? (
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="mono text-[11px] tracking-wide text-cot-mint">{c.case_number}</span>
              <ForensicIcon name="arrow" size={13} className="text-cot-text3" />
            </span>
            <span className="mt-0.5 block truncate text-[14px] font-semibold leading-tight text-white">{caseTitle(c)}</span>
            {status && (
              <span className="mt-2 block">
                <Chip tone={status.tone} dot>
                  {status.label}
                </Chip>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="label-caps block text-cot-text3">{loading ? "Locating case file…" : "No case assigned"}</span>
            <span className="mt-1 block text-[13px] text-cot-text2">{loading ? "Reading your assignments" : "Open the Command Center to create one"}</span>
          </>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const reduced = usePrefersReducedMotion();
  const go = useShellNavigate();
  const { cases, activeCase, setCaseId, loading: caseLoading } = useActiveCase();

  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSeed, setPaletteSeed] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useRipples(!reduced);
  if (activeCase) lastCase = activeCase;
  const shownCase = activeCase ?? lastCase;

  // Ctrl/Cmd+K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteSeed("");
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // User menu: click outside / Esc closes.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const closeDrawer = useCallback(() => setDrawer(false), []);
  const openPalette = useCallback((seed = "") => {
    setPaletteSeed(seed);
    setPaletteOpen(true);
  }, []);

  const primary = visibleNav(PRIMARY_NAV, user);
  const secondary = visibleNav(SECONDARY_NAV, user);
  const initials = initialsOf(user?.full_name);
  const status = shownCase ? STATUS[shownCase.status] : null;

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = [...primary, ...secondary].map((n) => ({
      id: `nav:${n.path}`,
      label: n.label,
      hint: n.hint,
      keywords: n.keywords,
      group: "Screens",
      icon: n.icon,
      run: () => void go(n.path),
    }));
    const num = shownCase?.case_number ?? "the active case";
    const actions: PaletteItem[] = shownCase
      ? [
          { id: "act:evidence", label: `Log evidence on ${num}`, hint: "Capture, hash and chain a new item", group: "Case actions", icon: "upload", keywords: "add new upload", run: () => void go("/evidence/ingest") },
          { id: "act:copilot", label: "Ask the copilot about this case", hint: "Answers cite the evidence they came from", group: "Case actions", icon: "brain", keywords: "question ai", run: () => void go("/guidance") },
          { id: "act:contra", label: "Review open contradictions", hint: "Where CCTV, phone data and statements disagree", group: "Case actions", icon: "contradiction", run: () => void go("/contradictions") },
          { id: "act:custody", label: "Verify chain of custody", hint: "Every hand-off with its hash", group: "Case actions", icon: "custody", run: () => void go("/chain-of-custody") },
          { id: "act:ledger", label: "Check the hash ledger", hint: "Tamper-evident record of every item", group: "Case actions", icon: "lock", keywords: "integrity", run: () => void go("/ledger") },
          { id: "act:qa", label: "Run chargesheet QA", hint: "Pre-filing completeness checks", group: "Case actions", icon: "document", run: () => void go("/chargesheet") },
        ]
      : [];
    const switches: PaletteItem[] = cases
      .filter((c) => c.id !== shownCase?.id)
      .map((c) => ({
        id: `case:${c.id}`,
        label: `Switch to ${c.case_number}`,
        hint: caseTitle(c),
        group: "Cases",
        icon: "evidence",
        run: () => setCaseId(c.id),
      }));
    const system: PaletteItem[] = [
      { id: "sys:motion", label: `Turn motion FX ${getReduceMotion() ? "on" : "off"}`, hint: "Page transitions and hover effects", group: "System", icon: "settings", run: () => setReduceMotion(!getReduceMotion()) },
      { id: "sys:logout", label: "Sign out", hint: "End this session on this device", group: "System", icon: "logout", run: () => void logout() },
    ];
    return [...nav, ...actions, ...switches, ...system];
  }, [primary, secondary, shownCase, cases, go, setCaseId, logout]);

  return (
    <div className="forensic-shell relative min-h-screen text-cot-text">
      <div className="app-backdrop" aria-hidden="true" />

      {/* ------------------------------------------------ mobile drawer scrim */}
      <AnimatePresence>
        {drawer && (
          <motion.div
            key="scrim"
            role="button"
            tabIndex={-1}
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-[rgba(4,3,10,.7)] backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------ sidebar */}
      <aside
        className={`shell-sidebar fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:translate-x-0 ${drawer ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Primary"
      >
        {/* brand */}
        <div className="rail-center flex items-center gap-3 px-4 pb-3 pt-4">
          <NavLink to="/dashboard" className="flex min-w-0 items-center gap-3" onClick={closeDrawer} aria-label="Chain of Truth home">
            <Wordmark size={40} className="drop-shadow-[0_0_14px_rgba(167,139,250,.6)]" />
            <span className="rail-hide min-w-0">
              <span className="display block text-[14px] font-extrabold leading-none tracking-[.08em] text-white glow-text">CHAIN OF TRUTH</span>
              <span className="label-caps mt-1.5 block text-[8.5px] text-cot-text3">Evidence · Intelligence · Justice</span>
            </span>
          </NavLink>
          <button className="ml-auto rounded-md border border-[color:var(--cot-line)] px-2 py-1 text-cot-text2 md:hidden" onClick={closeDrawer} aria-label="Close navigation">
            ×
          </button>
        </div>
        <div className="divider mx-4 rail-hide" />

        {/* nav */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-3">
          <div className="label-caps rail-hide mb-2 px-2 text-cot-text4">Investigation</div>
          <nav className="space-y-0.5" aria-label="Investigation">
            {primary.map((item) => (
              <NavigationItem key={item.path} item={item} onNavigate={closeDrawer} />
            ))}
          </nav>
          <div className="my-3 h-px bg-[color:var(--cot-line-soft)]" />
          <div className="label-caps rail-hide mb-2 px-2 text-cot-text4">Analysis &amp; controls</div>
          <nav className="space-y-0.5" aria-label="Analysis and controls">
            {secondary.map((item) => (
              <NavigationItem key={item.path} item={item} onNavigate={closeDrawer} />
            ))}
          </nav>
        </div>

        {/* bottom: case, officer, motion, sign out */}
        <div className="shrink-0 space-y-2 border-t border-[color:var(--cot-line-soft)] px-3 pb-3 pt-3">
          <ActiveCaseCard activeCase={activeCase} loading={caseLoading} onNavigate={closeDrawer} />
          {user && (
            <div className="officer-card rail-center" data-tip={`${user.full_name} · ${user.rank_abbreviation}`}>
              <span className="avatar-grad h-9 w-9 text-[12px]">{initials}</span>
              <span className="rail-hide min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold leading-tight text-white">{user.full_name}</span>
                <span className="block truncate text-[11.5px] leading-tight text-cot-text3">{user.station ?? "Station unassigned"}</span>
                <span className="mt-1.5 block">
                  <RankBadge user={user} showBand />
                </span>
              </span>
            </div>
          )}
          <div className="rail-hide flex items-center gap-2">
            <MotionToggle className="flex-1" />
            <button
              type="button"
              onClick={() => void logout()}
              className="grid h-[46px] w-11 shrink-0 place-items-center rounded-xl border border-[color:var(--cot-line-soft)] text-cot-text3 hover:border-cot-red/50 hover:bg-cot-red/10 hover:text-cot-red"
              aria-label="Sign out"
              title="Sign out"
            >
              <ForensicIcon name="logout" size={16} />
            </button>
          </div>
          <div className="rail-only flex-col items-center gap-2">
            <MotionToggle compact />
            <button type="button" onClick={() => void logout()} className="grid h-9 w-9 place-items-center rounded-lg text-cot-text3 hover:bg-cot-red/10 hover:text-cot-red" aria-label="Sign out" data-tip="Sign out">
              <ForensicIcon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------ top bar */}
      <header className="shell-topbar fixed right-0 top-0 z-40">
        <div className="flex h-full items-center gap-3 px-3 lg:gap-4 lg:px-5">
          <button className="grid h-9 w-9 place-items-center rounded-lg border border-[color:var(--cot-line)] text-cot-text2 md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <span className="block h-px w-4 bg-current shadow-[0_5px_0_currentColor,0_-5px_0_currentColor]" />
          </button>

          {/* case context */}
          <div className="hidden min-w-0 items-center gap-3 sm:flex lg:max-w-[38%]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgba(6,255,165,.3)] bg-[rgba(6,255,165,.07)] text-cot-mint shadow-[0_0_16px_-4px_rgba(6,255,165,.6)]">
              <ForensicIcon name="evidence" size={16} />
            </span>
            <div className="min-w-0">
              {shownCase ? (
                <>
                  <div className="display truncate text-[12.5px] font-bold tracking-wide text-white">{caseTitle(shownCase)}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-cot-text2">
                    <span className="truncate">{caseLocation(shownCase) ?? shownCase.case_number}</span>
                    <span className="hidden text-cot-text4 md:inline">·</span>
                    <span className="mono hidden whitespace-nowrap text-[11px] text-cot-text3 md:inline">{openedOn(shownCase)}</span>
                    {status && (
                      <Chip tone={status.tone} dot className="hidden xl:inline-flex">
                        {status.label}
                      </Chip>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="display text-[12.5px] font-bold tracking-wide text-white">{caseLoading ? "Locating case file" : "No case selected"}</div>
                  <div className="mt-0.5 text-[12px] text-cot-text3">{caseLoading ? "Reading your assignments…" : "Choose a case from the Command Center"}</div>
                </>
              )}
            </div>
          </div>

          {/* search → command palette */}
          <div className="mx-auto min-w-0 flex-1 md:max-w-[520px]">
            <div className="relative">
              <ForensicIcon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cot-text3" />
              <input
                type="text"
                readOnly
                value=""
                data-command-palette-trigger
                placeholder="Search evidence, people, locations…"
                aria-label="Search this case file (opens the command palette)"
                className="shell-search cursor-pointer !pl-9 !pr-16"
                onMouseDown={(e) => {
                  e.preventDefault();
                  openPalette();
                }}
                onFocus={() => openPalette()}
                onKeyDown={(e) => {
                  if (e.key.length === 1) {
                    e.preventDefault();
                    openPalette(e.key);
                  }
                }}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <kbd className="!text-[9px]">CTRL</kbd>
                <kbd className="!text-[9px]">K</kbd>
              </span>
            </div>
          </div>

          {/* right cluster */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 xl:flex" title="Hash chain verified continuously">
              <span className="pulse-dot h-2 w-2 rounded-full bg-cot-mint shadow-[0_0_10px_rgba(6,255,165,.9)]" />
              <span className="label-caps text-cot-mint">Integrity monitoring</span>
            </div>
            <div className="hidden h-7 w-px bg-[color:var(--cot-line)] xl:block" />
            {user && (
              <div className="relative" ref={menuRef}>
                <button type="button" className="user-chip" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
                  <span className="avatar-grad h-8 w-8 text-[11px]">{initials}</span>
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block max-w-[180px] truncate text-[13px] font-semibold text-white">{user.full_name}</span>
                    <span className="label-caps block text-cot-text3">
                      {user.rank_abbreviation} · {ROLE_LABEL[user.role] ?? user.role.replace(/_/g, " ")}
                    </span>
                  </span>
                  <motion.span animate={{ rotate: menuOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="hidden text-cot-text3 md:block">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </motion.span>
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      key="menu"
                      role="menu"
                      className="user-menu"
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="flex items-start gap-3 border-b border-[color:var(--cot-line-soft)] p-4">
                        <span className="avatar-grad h-11 w-11 text-[14px]">{initials}</span>
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold text-white">{user.full_name}</div>
                          <div className="truncate text-[12px] text-cot-text3">{ROLE_LABEL[user.role] ?? user.role}</div>
                          <div className="mono mt-1 text-[11px] text-cot-text2">Badge {user.badge_number}</div>
                          <div className="mt-2">
                            <RankBadge user={user} showBand />
                          </div>
                        </div>
                      </div>
                      <div className="border-b border-[color:var(--cot-line-soft)] px-4 py-3 text-[12px] text-cot-text3">
                        <div className="truncate">{user.station ?? "Station unassigned"}</div>
                        <div className="mono truncate text-[11px]">{user.email}</div>
                      </div>
                      <div className="p-2">
                        <MotionToggle />
                      </div>
                      <button type="button" role="menuitem" className="menu-row border-t border-[color:var(--cot-line-soft)] hover:!text-cot-red" onClick={() => void logout()}>
                        <ForensicIcon name="logout" size={15} /> Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- main */}
      <main className="shell-main relative z-10 min-w-0">
        <div className="mx-auto max-w-[1700px] p-4 lg:p-6">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        initialQuery={paletteSeed}
        context={
          shownCase ? (
            <>
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cot-mint" />
              <span className="label-caps text-cot-mint">Active case</span>
              <span className="mono text-[11px] text-cot-text2">{shownCase.case_number}</span>
              <span className="truncate text-[13px] text-cot-text2">{caseTitle(shownCase)}</span>
            </>
          ) : undefined
        }
      />
    </div>
  );
}
