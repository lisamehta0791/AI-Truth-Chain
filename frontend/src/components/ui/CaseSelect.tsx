import type { Case } from "@/types";

/** Case picker used in page headers. Bound to useActiveCase by the page. */
export function CaseSelect({ cases, value, onChange, className = "" }: { cases: Case[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <label className={`flex min-w-0 max-w-full items-center gap-2 ${className}`}>
      <span className="label-caps text-cot-text3">Case</span>
      <select aria-label="Select case" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 w-full max-w-[360px] truncate !py-2 !text-[14px] sm:min-w-[240px]">
        {cases.length === 0 && <option value="">No cases available</option>}
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.case_number} — {c.title}
          </option>
        ))}
      </select>
    </label>
  );
}
