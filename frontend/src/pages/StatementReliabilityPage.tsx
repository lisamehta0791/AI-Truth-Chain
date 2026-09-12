import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useAuth } from "@/context/AuthContext";
import { useActiveCase } from "@/hooks/useActiveCase";
import { ApiError } from "@/lib/apiClient";
import * as evidenceApi from "@/services/evidenceApi";
import * as statementApi from "@/services/statementApi";
import { canConfirmAiOutput, type Evidence, type StatementVersion } from "@/types";

type Op = { kind: "same" | "add" | "del"; text: string };

/** Word-level diff (LCS) — small inputs, so the O(n·m) table is fine. */
function diffWords(a: string, b: string): Op[] {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  const push = (kind: Op["kind"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += ` ${text}`;
    else ops.push({ kind, text });
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return ops;
}

const TIME_RE = /\b([01]?\d|2[0-3]):[0-5]\d\b/g;
const NAME_RE = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g;

function facts(text: string) {
  const times = Array.from(new Set(text.match(TIME_RE) ?? []));
  const names = Array.from(new Set((text.match(NAME_RE) ?? []).filter((w) => !/^(The|I|He|She|It|They|We|At|On|In|My|His|Her|Recorded|Statement|Witness|Second|Interview|Thinking|Sub|Inspector|Constable|April|March|May|June|Room)$/.test(w))));
  return { times, names };
}

/**
 * Statement reliability — every version of every statement, and exactly
 * what moved between them: words added and removed, times that shifted,
 * names that appeared or vanished. Change is not guilt; it is a question.
 */
export function StatementReliabilityPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [statements, setStatements] = useState<Evidence[]>([]);
  const [versions, setVersions] = useState<Record<string, StatementVersion[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pair, setPair] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const canAdd = canConfirmAiOutput(user);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const all = await evidenceApi.listEvidenceForCase(id);
      const st = all.filter((e) => e.evidence_type === "statement");
      setStatements(st);
      const entries = await Promise.all(st.map(async (e) => [e.id, await statementApi.listStatementVersions(e.id).catch(() => [] as StatementVersion[])] as const));
      const map = Object.fromEntries(entries.map(([k, v]) => [k, [...v].sort((a, b) => a.version_no - b.version_no)]));
      setVersions(map);
      setSelectedId((cur) => (cur && st.some((e) => e.id === cur) ? cur : (st.find((e) => (map[e.id]?.length ?? 0) > 1)?.id ?? st[0]?.id ?? null)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the statements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);

  const selected = statements.find((s) => s.id === selectedId) ?? null;
  const list = selectedId ? (versions[selectedId] ?? []) : [];
  useEffect(() => {
    setPair(list.length >= 2 ? [list.length - 2, list.length - 1] : null);
  }, [selectedId, list.length]);

  const [va, vb] = pair ? [list[pair[0]], list[pair[1]]] : [undefined, undefined];
  const ops = useMemo(() => (va && vb ? diffWords(va.text, vb.text) : []), [va, vb]);
  const summary = useMemo(() => {
    if (!va || !vb) return null;
    const fa = facts(va.text);
    const fb = facts(vb.text);
    return {
      timesRemoved: fa.times.filter((t) => !fb.times.includes(t)),
      timesAdded: fb.times.filter((t) => !fa.times.includes(t)),
      namesRemoved: fa.names.filter((t) => !fb.names.includes(t)),
      namesAdded: fb.names.filter((t) => !fa.names.includes(t)),
      added: ops.filter((o) => o.kind === "add").reduce((n, o) => n + o.text.split(" ").length, 0),
      removed: ops.filter((o) => o.kind === "del").reduce((n, o) => n + o.text.split(" ").length, 0),
      total: vb.text.split(/\s+/).length,
    };
  }, [va, vb, ops]);
  const stability = summary ? Math.max(0, Math.round(100 - ((summary.added + summary.removed) / Math.max(1, summary.total)) * 100)) : 100;

  async function addVersion() {
    if (!selectedId || !newText.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await statementApi.addStatementVersion(selectedId, newText.trim(), selected?.language ?? "en");
      setNewText("");
      setAddOpen(false);
      await load(caseId, true);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not record the version.");
    } finally {
      setAdding(false);
    }
  }

  const revised = statements.filter((s) => (versions[s.id]?.length ?? 0) > 1).length;
  const totalVersions = Object.values(versions).reduce((n, v) => n + v.length, 0);

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Statements · what changed between tellings"
        title="Statement reliability"
        description={
          <>
            Every version of every statement is kept. Pick two and the page shows exactly what moved — words, times, names. A changed statement is a question to ask, not a conclusion to draw.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            {canAdd && selected && (
              <Button size="sm" variant="primary" onClick={() => setAddOpen((v) => !v)} icon={<ForensicIcon name="plus" size={13} />}>
                Record a new version
              </Button>
            )}
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["witness", "followup"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Statements" value={statements.length} tone="violet" icon={<ForensicIcon name="document" size={16} />} hint="On file for this case" />
        <StatTile label="Revised" value={revised} tone={revised ? "amber" : "mint"} icon={<ForensicIcon name="alert" size={16} />} hint="Statements with more than one version" />
        <StatTile label="Versions kept" value={totalVersions} tone="ice" icon={<ForensicIcon name="timeline" size={16} />} hint="Nothing is overwritten — ever" />
        <StatTile label="Stability" value={stability} suffix="%" tone={stability >= 80 ? "mint" : stability >= 55 ? "amber" : "red"} progress={stability / 100} icon={<ForensicIcon name="shield" size={16} />} hint={summary ? `${summary.added} words added · ${summary.removed} removed` : "Select two versions"} />
      </div>

      {loading ? (
        <ScanLoader label="Reading the statements…" rows={5} />
      ) : statements.length === 0 ? (
        <EmptyState icon="document" title="No statements in this case yet" body="Statements appear here once logged as evidence. Load stage 3 (the receptionist's statement) and stage 8 (his second interview) of the scenario." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3">
            <Panel eyebrow="Statements" title={`${statements.length} on file`} padded>
              <ul className="rise space-y-1.5">
                {statements.map((s) => {
                  const n = versions[s.id]?.length ?? 0;
                  const active = s.id === selectedId;
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => setSelectedId(s.id)} className={`w-full rounded-xl border p-3 text-left ${active ? "border-cot-violet/70 bg-cot-violet/[.08]" : "border-[color:var(--cot-line)] bg-white/[.02] hover:border-[color:var(--cot-line-strong)]"}`}>
                        <div className="flex items-center gap-2">
                          <ForensicIcon name="document" size={14} className="text-cot-violet" />
                          <span className="truncate text-[13.5px] font-semibold text-white">{s.description ?? s.original_filename}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-cot-text3">
                          <Chip tone={n > 1 ? "warn" : "ok"} className="!px-1.5 !text-[7px]">{n} version{n === 1 ? "" : "s"}</Chip>
                          <span className="font-mono">{s.captured_at ? new Date(s.captured_at).toLocaleDateString() : ""}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
            {selected && list.length > 0 && (
              <Panel eyebrow="Versions" title="Pick two to compare">
                <ol className="space-y-1.5">
                  {list.map((v, idx) => {
                    const sel = pair && (pair[0] === idx || pair[1] === idx);
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => setPair((p) => (!p ? [idx, idx] : p[0] === idx ? p : [p[1], idx]))}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${sel ? "border-cot-magenta/70 bg-cot-magenta/[.08]" : "border-[color:var(--cot-line)] hover:border-[color:var(--cot-line-strong)]"}`}
                        >
                          <span className="chip status-ai">v{v.version_no}</span>
                          <span className="font-mono text-[11px] text-cot-text3">{new Date(v.recorded_at).toLocaleString()}</span>
                          <span className="ml-auto text-[11px] text-cot-text3">{v.text.split(/\s+/).length} words</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </Panel>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <AnimatePresence initial={false}>
              {addOpen && selected && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <Panel eyebrow="New version" title={`Record version ${list.length + 1} of ${selected.description ?? "the statement"}`} tone="warn" busy={adding}>
                    <textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={6} placeholder="Paste the re-recorded statement. The previous versions stay on file." className="w-full !text-[14.5px] leading-relaxed" aria-label="New statement version" />
                    <div className="mt-3 flex gap-2">
                      <Button variant="primary" busy={adding} disabled={!newText.trim()} onClick={() => void addVersion()}>
                        Save version
                      </Button>
                      <Button variant="ghost" onClick={() => setAddOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </Panel>
                </motion.div>
              )}
            </AnimatePresence>

            {!va || !vb || va.id === vb.id ? (
              <Panel eyebrow="Statement" title={selected?.description ?? "Statement"}>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-cot-text">{list[list.length - 1]?.text ?? "No text recorded — the statement body lives in the evidence file."}</p>
                {list.length < 2 && <p className="mt-3 border-t border-white/[.06] pt-3 text-[12.5px] text-cot-text3">Only one version on file. When the witness is re-interviewed, record the new version and the differences appear here.</p>}
              </Panel>
            ) : (
              <>
                <Panel eyebrow="What moved" title={`Version ${va.version_no} → version ${vb.version_no}`} tone={summary && (summary.timesAdded.length || summary.timesRemoved.length) ? "crit" : "warn"}>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                      <div className="label-caps text-cot-text3">Words</div>
                      <div className="mt-1 text-[14px] text-cot-text"><b className="text-cot-mint">+{summary?.added}</b> added · <b className="text-cot-red">−{summary?.removed}</b> removed</div>
                    </div>
                    <div className="rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                      <div className="label-caps text-cot-text3">Times</div>
                      <div className="mt-1 text-[14px] text-cot-text">
                        {summary?.timesRemoved.map((t) => <span key={t} className="mr-1 font-mono text-cot-red line-through">{t}</span>)}
                        {summary?.timesAdded.map((t) => <span key={t} className="mr-1 font-mono text-cot-mint">{t}</span>)}
                        {!summary?.timesAdded.length && !summary?.timesRemoved.length && <span className="text-cot-text3">unchanged</span>}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                      <div className="label-caps text-cot-text3">Names</div>
                      <div className="mt-1 text-[14px] text-cot-text">
                        {summary?.namesRemoved.map((t) => <span key={t} className="mr-1 text-cot-red line-through">{t}</span>)}
                        {summary?.namesAdded.map((t) => <span key={t} className="mr-1 text-cot-mint">{t}</span>)}
                        {!summary?.namesAdded.length && !summary?.namesRemoved.length && <span className="text-cot-text3">unchanged</span>}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                      <div className="label-caps text-cot-text3">Recorded</div>
                      <div className="mt-1 font-mono text-[12px] text-cot-text">{new Date(va.recorded_at).toLocaleDateString()} → {new Date(vb.recorded_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </Panel>
                <Panel eyebrow="Word-level difference" title="Removed in red · added in mint" padded>
                  <p className="text-[15.5px] leading-[1.75] text-cot-text">
                    {ops.map((o, i) =>
                      o.kind === "same" ? (
                        <span key={i}>{o.text} </span>
                      ) : o.kind === "add" ? (
                        <mark key={i} className="rounded bg-cot-mint/15 px-1 text-cot-mint">{o.text} </mark>
                      ) : (
                        <del key={i} className="rounded bg-cot-red/15 px-1 text-cot-red">{o.text} </del>
                      )
                    )}
                  </p>
                </Panel>
                <div className="grid gap-4 md:grid-cols-2">
                  {[va, vb].map((v) => (
                    <Panel key={v.id} eyebrow={`Version ${v.version_no}`} title={new Date(v.recorded_at).toLocaleString()}>
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-cot-text2">{v.text}</p>
                    </Panel>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
