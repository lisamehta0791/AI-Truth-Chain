import type { User } from "@/types";

/**
 * Rank chip. Colour tracks seniority band rather than exact rank, so the
 * hierarchy reads at a glance without needing eleven distinct colours that
 * nobody could tell apart.
 */
function bandFor(seniority: number): { ring: string; text: string; label: string } {
  if (seniority >= 100) return { ring: "border-[#ffb547]/50", text: "text-[#ffb547]", label: "Command" };
  if (seniority >= 70) return { ring: "border-[#f9a8d4]/50", text: "text-[#f9a8d4]", label: "Senior" };
  if (seniority >= 50) return { ring: "border-[#a78bfa]/50", text: "text-[#c4b5fd]", label: "Supervisory" };
  if (seniority >= 40) return { ring: "border-[#06ffa5]/45", text: "text-[#06ffa5]", label: "Investigating" };
  return { ring: "border-white/20", text: "text-cot-text2", label: "Field" };
}

export function RankBadge({ user, showBand = false }: { user: User; showBand?: boolean }) {
  const band = bandFor(user.seniority);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        title={user.rank.replace(/_/g, " ")}
        className={`label-caps rounded border ${band.ring} ${band.text} bg-white/[.03] px-2 py-1`}
      >
        {user.rank_abbreviation}
      </span>
      {showBand && <span className="text-xs text-on-surface-variant">{band.label}</span>}
      {user.is_view_only && (
        <span
          title="Oversight account — read access only"
          className="label-caps rounded border border-[#f9a8d4]/40 bg-[#be185d]/15 px-2 py-1 text-[#f9a8d4]"
        >
          View only
        </span>
      )}
    </span>
  );
}
