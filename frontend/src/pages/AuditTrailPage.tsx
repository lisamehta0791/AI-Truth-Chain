import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Tabs } from "@/components/ui/Tabs";
import { useActiveCase } from "@/hooks/useActiveCase";
import { ApiError } from "@/lib/apiClient";
import * as auditApi from "@/services/auditApi";
import * as userApi from "@/services/userApi";
import type { AuditLogEntry, OfficerDirectoryEntry } from "@/types";

type Family = "all" | "evidence" | "ai" | "review" | "access" | "demo" | "admin";

function familyOf(action: string): Exclude<Family, "all"> {
  if (/^(evidence|custody|ledger|sync|statement)/.test(action)) return "evidence";
  if (/^(copilot|timeline\.extract|contradiction\.detect|guidance\.suggest|autopsy\.extract|graph|location|chargesheet|closure|similarity)/.test(action)) return "ai";
  if (/confirm|dismiss|acknowledge|review|anchor/.test(action)) return "review";
  if (/^(auth|user\.login|user\.logout|session)/.test(action)) return "access";
  if (/^demo/.test(action)) return "demo";
  return "admin";
}
const FAMILY_TONE: Record<Exclude<Family, "all">, ChipTone> = { evidence: "neutral", ai: "ai", review: "ok", access: "warn", demo: "warn", admin: "critical" };

/**
 * Audit trail — every action, by whom, on what, with what result. Reading
 * this page is itself audited. Only Inspector rank and above can open it.
 */
export function AuditTrailPage() {
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [officers, setOfficers] = useState<OfficerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState<Family>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [log, dir] = await Promise.all([auditApi.listAuditLog(id), userApi.listOfficerDirectory().catch(() => [])]);
      setEntries([...log].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      setOfficers(dir);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not read the audit trail.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);

  const officerName = (id: string | null) => {
    if (!id) return "system";
    const o = officers.find((x) => x.id === id);
    return o ? `${o.full_name} · ${o.badge_number}` : id.slice(0, 8);
  };
  const counts = useMemo(() => {
    const c: Record<Family, number> = { all: entries.length, evidence: 0, ai: 0, review: 0, access: 0, demo: 0, admin: 0 };
    entries.forEach((e) => c[familyOf(e.action)]++);
    return c;
  }, [entries]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => (family === "all" || familyOf(e.action) === family) && (!q || `${e.action} ${e.target_type} ${e.result} ${officerName(e.actor_id)} ${JSON.stringify(e.metadata_json ?? {})}`.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, family, query, officers]);
  const actors = new Set(entries.map((e) => e.actor_id ?? "system")).size;
  const last24 = entries.filter((e) => Date.now() - new Date(e.timestamp).getTime() < 86400000).length;
  const failures = entries.filter((e) => e.result !== "success").length;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Accountability · every action, by whom, with what result"
        title="Audit trail"
        description={
          <>
            Every action on this case — logging, confirming, dismissing, asking the copilot, driving the demo — is written here with the officer, the rank they held and the outcome. Opening this page is itself audited.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="audit" size={13} />}>
              Refresh
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Entries" value={entries.length} tone="violet" icon={<ForensicIcon name="audit" size={16} />} hint="For this case" />
        <StatTile label="Actors" value={actors} tone="ice" icon={<ForensicIcon name="shield" size={16} />} hint="Distinct officers and system processes" />
        <StatTile label="Last 24 hours" value={last24} tone="magenta" icon={<ForensicIcon name="timeline" size={16} />} hint="Recent activity" />
        <StatTile label="Refused / failed" value={failures} tone={failures ? "amber" : "mint"} icon={<ForensicIcon name="alert" size={16} />} hint="Actions the rules or the system stopped" />
      </div>

      {loading ? (
        <ScanLoader label="Reading the audit trail…" rows={6} />
      ) : entries.length === 0 ? (
        <EmptyState icon="audit" title="No actions recorded for this case yet" body="Every action on the case is recorded here as it happens." />
      ) : (
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
            <Tabs
              id="audit-family"
              value={family}
              onChange={setFamily}
              options={[
                { value: "all", label: "All", badge: counts.all },
                { value: "evidence", label: "Evidence", badge: counts.evidence },
                { value: "ai", label: "AI", badge: counts.ai },
                { value: "review", label: "Decisions", badge: counts.review },
                { value: "access", label: "Access", badge: counts.access },
                { value: "demo", label: "Demo", badge: counts.demo },
                { value: "admin", label: "Other", badge: counts.admin },
              ]}
            />
            <label className="relative ml-auto flex min-w-[240px] items-center">
              <ForensicIcon name="search" size={14} className="pointer-events-none absolute left-3 text-cot-text3" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by action, officer, target…" className="w-full !pl-9 !py-2 !text-[14px]" aria-label="Filter audit entries" />
            </label>
          </div>
          <div className="overflow-x-auto px-4 pb-4 pt-3">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="label-caps text-cot-text3">
                  <th className="px-2 py-2 text-left">When</th>
                  <th className="px-2 py-2 text-left">Officer</th>
                  <th className="px-2 py-2 text-left">Action</th>
                  <th className="px-2 py-2 text-left">Target</th>
                  <th className="px-2 py-2 text-left">Result</th>
                  <th className="px-2 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {visible.slice(0, 200).map((e, i) => {
                    const fam = familyOf(e.action);
                    const isOpen = open === e.id;
                    return (
                      <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }} className="border-t border-white/[.06] align-top">
                        <td className="whitespace-nowrap px-2 py-2 font-mono text-[11.5px] text-cot-text2">{new Date(e.timestamp).toLocaleString()}</td>
                        <td className="px-2 py-2">
                          <div className="text-white">{officerName(e.actor_id)}</div>
                          <div className="text-[11px] uppercase tracking-wide text-cot-text3">{e.role.replace(/_/g, " ")}</div>
                        </td>
                        <td className="px-2 py-2"><Chip tone={FAMILY_TONE[fam]} className="!normal-case !tracking-normal !font-[Share_Tech_Mono] !text-[10.5px]">{e.action}</Chip></td>
                        <td className="px-2 py-2 font-mono text-[11px] text-cot-text2">{e.target_type}{e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ""}</td>
                        <td className="px-2 py-2"><Chip tone={e.result === "success" ? "ok" : "critical"}>{e.result}</Chip></td>
                        <td className="px-2 py-2 text-right">
                          {e.metadata_json && Object.keys(e.metadata_json).length > 0 && (
                            <button type="button" onClick={() => setOpen(isOpen ? null : e.id)} className="text-[11px] text-cot-violet hover:text-white">{isOpen ? "hide" : "details"}</button>
                          )}
                          {isOpen && <pre className="mt-2 max-w-[360px] overflow-x-auto whitespace-pre-wrap rounded-lg border border-[color:var(--cot-line)] bg-black/30 p-2 text-left font-mono text-[10.5px] text-cot-text2">{JSON.stringify(e.metadata_json, null, 2)}</pre>}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
            {visible.length > 200 && <p className="mt-2 text-center text-[12px] text-cot-text3">Showing the most recent 200 of {visible.length} entries — narrow the filter to see the rest.</p>}
            {visible.length === 0 && <p className="py-6 text-center text-sm text-cot-text3">Nothing matches this filter.</p>}
          </div>
        </Panel>
      )}
    </AppShell>
  );
}
