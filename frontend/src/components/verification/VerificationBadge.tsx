import { Chip, type ChipTone } from "@/components/ui/Chip";
import type { VerificationStatus } from "@/types";

const STATUS_CONFIG: Record<VerificationStatus, { label: string; tone: ChipTone; dot?: boolean; strike?: boolean }> = {
  verified: { label: "Verified", tone: "ok" },
  human_confirmed: { label: "Human confirmed", tone: "ok" },
  ai_extracted_unverified: { label: "AI extracted · unverified", tone: "ai", dot: true },
  ai_hypothesis: { label: "AI hypothesis", tone: "ai", dot: true },
  dismissed: { label: "Dismissed", tone: "neutral", strike: true },
  requires_review: { label: "Requires review", tone: "warn", dot: true },
};

/**
 * Renders exactly one of: VERIFIED / AI-EXTRACTED-UNVERIFIED / AI HYPOTHESIS /
 * HUMAN CONFIRMED / DISMISSED / REQUIRES REVIEW. Every page that shows an
 * AI-derived record must use this component rather than a bespoke label, so
 * the "AI assists, humans decide" distinction can never drift page-to-page.
 * Mint = a human stood behind it. Magenta = the machine proposed it.
 */
export function VerificationBadge({ status, className = "" }: { status: VerificationStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <Chip tone={config.tone} dot={config.dot} className={`${config.strike ? "line-through decoration-cot-text3" : ""} ${className}`}>
      {config.label}
    </Chip>
  );
}
