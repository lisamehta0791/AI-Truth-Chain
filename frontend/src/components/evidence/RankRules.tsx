import { Chip } from "@/components/ui/Chip";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { canConfirmAiOutput, requiresLiveCapture, type User } from "@/types";

/**
 * What this officer's rank must supply when logging evidence. Every rule is
 * enforced server-side as well — this panel just says so up front instead of
 * letting a constable discover it as a rejection.
 */
export function RankRules({ user }: { user: User | null }) {
  if (!user) return null;
  const live = requiresLiveCapture(user);
  const rules: Array<{ label: string; detail: string; tone: "ok" | "warn" | "ai" | "critical" | "neutral"; state: string }> = [
    {
      label: "SHA-256 seal & chain",
      detail: "Every item is hashed on receipt and linked to the previous block of the case. No exceptions for any rank.",
      tone: "ok",
      state: "Always",
    },
    {
      label: "Live camera capture",
      detail: live
        ? "Field ranks must photograph themselves at the point of collection. The capture is hashed and chained with the item."
        : "Not required for your rank. You may still add one to strengthen the custody record.",
      tone: live ? "warn" : "neutral",
      state: live ? "Required" : "Optional",
    },
    {
      label: "Second officer for physical evidence",
      detail: "Photo, video, audio and seized items need a different officer to confirm collection from their own account.",
      tone: "warn",
      state: "By type",
    },
    {
      label: "AI extraction",
      detail: canConfirmAiOutput(user)
        ? "Text content triggers the timeline builder and contradiction detector. Your rank can confirm or dismiss the output."
        : "Text content triggers the timeline builder and contradiction detector. Output stays a hypothesis until a Sub-Inspector or above confirms it.",
      tone: "ai",
      state: "On text",
    },
  ];
  if (user.is_view_only) {
    rules.unshift({ label: "View-only account", detail: "Oversight accounts read at their clearance and never write. Logging is disabled for this session.", tone: "critical", state: "Blocked" });
  }
  return (
    <Panel eyebrow="Rules for your rank" title={`${user.rank_abbreviation} · ${user.rank.replace(/_/g, " ")}`} className="materialise">
      <ul className="space-y-2.5">
        {rules.map((r) => (
          <li key={r.label} className="flex gap-3 rounded-xl border border-[color:var(--cot-line-soft)] bg-[rgba(14,11,31,.5)] p-3">
            <span className="mt-0.5 shrink-0 text-cot-violet">
              <ForensicIcon name={r.tone === "ai" ? "brain" : r.tone === "critical" ? "alert" : r.tone === "warn" ? "shield" : "lock"} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-white">{r.label}</span>
                <Chip tone={r.tone}>{r.state}</Chip>
              </span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-cot-text2">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
