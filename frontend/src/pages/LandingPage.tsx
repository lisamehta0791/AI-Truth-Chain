import { Navigate } from "react-router-dom";

import { Wordmark } from "@/components/brand/Wordmark";
import { DemoCaseBand } from "@/components/landing/DemoCaseBand";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { ModulesGrid } from "@/components/landing/ModulesGrid";
import { type HeroSection, ScrollHero } from "@/components/ui/ethereal";
import { useAuth } from "@/context/AuthContext";

import "@/styles/landing.css";

/**
 * The public front door. A scroll-driven cinematic hero (the evidence core:
 * a displaced obsidian icosahedron ringed by hash-block chains) carries the
 * product's five claims; below it, how the system works, the fully loaded
 * demo case, every module, and the footer.
 *
 * "AI assists; humans decide" is the project's central commitment and is
 * stated in the hero, not buried in a disclaimer.
 */

const SECTIONS: HeroSection[] = [
  {
    id: "hero",
    headline: "Chain of Truth",
    subheadline: "Evidence · Intelligence · Justice",
    body: "Tamper-evident evidence. AI that cites what it says. Officers who decide.",
    readout: "CASE COT-2026-0001 · RIVERSIDE HOTEL · 10 ITEMS SEALED · CHAIN INTACT",
    ctas: [
      { label: "Open the command centre", to: "/login", variant: "primary" },
      { label: "See the demo case", scrollTo: "demo", variant: "default" },
    ],
  },
  {
    id: "integrity",
    headline: "Immutable",
    subheadline: "Hash-chained custody",
    body: "Every item is SHA-256 sealed on arrival and linked to the one before it. Senior officers anchor the chain outside the database, so even an insider rewriting the record is caught.",
    readout: "SHA-256 · BLOCK 0010 → 0009 · EXTERNAL ANCHOR VERIFIED",
  },
  {
    id: "intelligence",
    headline: "Reasoned",
    subheadline: "The case file reads itself",
    body: "Statements, CCTV, call records and the post-mortem are placed on one timeline and checked against each other. Every claim carries its source excerpt and a confidence score.",
    readout: "35 EVENTS · CONFLICTS FLAGGED · SOURCE EXCERPT ATTACHED · HYPOTHESIS",
  },
  {
    id: "authority",
    headline: "Accountable",
    subheadline: "Rank-aware. Human-decided.",
    body: "Constable to Commissioner, each rank sees and does exactly what the law allows. Nothing becomes fact until an officer confirms it — and that confirmation is itself logged.",
    readout: "RANK: INSPECTOR · ACTION: CONFIRM · WRITTEN TO AUDIT TRAIL",
  },
  {
    id: "closing",
    headline: "Ready",
    subheadline: "Built for the courtroom",
    body: "Chargesheet QA, statement reliability, case similarity and closure readiness — before the file leaves the station.",
    readout: "CHARGESHEET QA · CLOSURE READINESS · SIMILAR CASES · PRE-FILING",
    ctas: [
      { label: "Open the command centre", to: "/login", variant: "primary" },
      { label: "Explore the demo case", scrollTo: "demo", variant: "mint" },
    ],
  },
];

const PALETTE = { primary: "#a78bfa", secondary: "#6366f1", tertiary: "#ec4899", accent: "#06ffa5", dark: "#07060f" };

const MENU = [
  { label: "Integrity", target: "integrity" },
  { label: "Intelligence", target: "intelligence" },
  { label: "Authority", target: "authority" },
  { label: "Demo", target: "demo" },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative min-h-screen bg-cot-bg text-on-surface">
      <ScrollHero
        sections={SECTIONS}
        colorPalette={PALETTE}
        menuItems={MENU}
        signIn={{ label: "Sign in", to: "/login", variant: "primary" }}
        logo={
          <>
            <Wordmark size={34} />
            <span>
              <span className="eh-brand__name">Chain of Truth</span>
              <span className="eh-brand__tag">EVIDENCE · INTELLIGENCE · JUSTICE</span>
            </span>
          </>
        }
      />

      <div className="relative">
        <HowItWorks />
        <div className="ld-wrap divider" />
        <DemoCaseBand />
        <div className="ld-wrap divider" />
        <ModulesGrid />
        <LandingFooter />
      </div>
    </div>
  );
}
