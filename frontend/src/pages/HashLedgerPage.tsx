import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { CaseSelect } from "@/components/ui/CaseSelect";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useAuth } from "@/context/AuthContext";
import { useActiveCase } from "@/hooks/useActiveCase";
import { getAccessToken } from "@/lib/session";
import { ApiError } from "@/lib/apiClient";
import * as ledgerApi from "@/services/ledgerApi";
import { MIN_SENIORITY } from "@/types";

/**
 * The Hash Ledger — the chain made visible.
 *
 * Every evidence item is a block: its own SHA-256 plus the hash of the block
 * before it. Verification re-downloads every file and re-hashes it, then
 * walks the links. The page also answers the obvious objection — "what if
 * someone just edits the database?" — with anchors: signed checkpoints that
 * live outside the database, and a drill button that edits a stored hash the
 * way an insider would, so the audience watches the chain catch it.
 */
export function HashLedgerPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [report, setReport] = useState<ledgerApi.LedgerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const senior = !!user && !user.is_view_only && user.seniority >= MIN_SENIORITY.MANAGE_ACCOUNTS;

  const verify = useCallback(async (recompute = true) => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await ledgerApi.getLedger(caseId, recompute));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void verify(true);
  }, [verify]);

  async function run(kind: "anchor" | "tamper" | "restore") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "anchor") setReport(await ledgerApi.anchorChain(caseId, "Anchored from the Hash Ledger page"));
      if (kind === "tamper") setReport(await ledgerApi.simulateTamper(caseId, Math.min(2, Math.max(0, (report?.evidence_count ?? 1) - 1))));
      if (kind === "restore") setReport(await ledgerApi.restoreTamper(caseId));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadCheckpoint() {
    const res = await fetch(ledgerApi.checkpointUrl(caseId), { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chain-checkpoint-${caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const brokenAt = report?.broken_at_index ?? null;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Tamper-evident ledger · deterministic, no AI"
        title="Hash ledger"
        live={report ? !report.is_valid : false}
        description={
          <>
            Every item is a block carrying its own SHA-256 and the hash of the block before it. Verification re-downloads each file, re-hashes it and walks the links. Anchors — signed checkpoints kept outside the database — are the answer to "what if someone edits the database".
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="primary" busy={loading} onClick={() => void verify(true)} icon={<ForensicIcon name="lock" size={13} />}>
              Verify chain now
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void verify(true)} needs={["scene"]} className="mb-5" />}

      {report && (
        <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile label="Blocks" value={report.evidence_count} tone="violet" icon={<ForensicIcon name="evidence" size={16} />} hint="Evidence items in seal order" />
          <StatTile label="Chain" value={report.is_valid ? "VALID" : "BROKEN"} tone={report.is_valid ? "mint" : "red"} icon={<ForensicIcon name="lock" size={16} />} hint={report.is_valid ? "Every file re-hashed, every link verified" : `Broken at block ${report.broken_at_index}`} />
          <StatTile label="Anchors" value={report.anchors.length} tone={report.anchors.some((a) => !a.holds) ? "red" : "ice"} icon={<ForensicIcon name="shield" size={16} />} hint={report.anchors.length ? (report.anchors.every((a) => a.holds) ? "All anchors hold" : "An anchor is violated") : "Not yet anchored"} />
          <StatTile label="Verified" value={new Date(report.verified_at).toLocaleTimeString()} tone="magenta" icon={<ForensicIcon name="check" size={16} />} hint={report.files_verified ? "Files re-downloaded and re-hashed" : "Links only"} />
        </div>
      )}

      {error && <div role="alert" className="hud-frame hud-frame--crit mb-4 rounded-lg px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading && !report && <ScanLoader label="Re-hashing every evidence file…" rows={5} />}

      {report && (
        <div className="space-y-4">
          {/* verdict */}
          <motion.section
            key={`${report.is_valid}-${report.verified_at}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`hud-frame rounded-xl p-5 ${report.is_valid ? "hud-frame--ok" : "hud-frame--crit"}`}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className={`grid h-14 w-14 place-items-center rounded-full text-2xl ${report.is_valid ? "bg-[rgba(6,255,165,.15)] text-[color:var(--cot-green)] shadow-[0_0_24px_rgba(6,255,165,.5)]" : "bg-[rgba(255,61,113,.15)] text-[color:var(--cot-red)] shadow-[0_0_24px_rgba(255,61,113,.5)]"}`}>
                {report.is_valid ? "✓" : "!"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="display text-xl font-bold text-white">
                  {report.is_valid ? "Chain intact — no tampering detected" : `Chain BROKEN at block ${brokenAt}`}
                </div>
                <div className="mt-1 text-sm text-[#b9b0d6]">
                  {report.is_valid
                    ? `${report.evidence_count} blocks · every file re-hashed and every link verified at ${new Date(report.verified_at).toLocaleTimeString()}`
                    : report.broken_reason}
                </div>
                {report.head_hash && (
                  <div className="mt-2 font-mono text-[11px] text-[#b9b0d6]">
                    head <span className="text-[color:var(--cot-cyan)]">{report.head_hash.slice(0, 20)}…</span> · chain digest{" "}
                    <span className="text-[color:var(--cot-cyan)]">{report.chain_digest?.slice(0, 20)}…</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={downloadCheckpoint} className="rounded-md border border-[color:var(--cot-line-strong)] px-3 py-2 text-xs text-[#e9d5ff]">Export checkpoint</button>
                {senior && (
                  <>
                    <button disabled={!!busy || report.evidence_count === 0} onClick={() => run("anchor")} className="rounded-md bg-primary-container px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-40">
                      {busy === "anchor" ? "Anchoring…" : "Anchor chain"}
                    </button>
                    {report.tamper_drill_active ? (
                      <button disabled={!!busy} onClick={() => run("restore")} className="rounded-md border border-[color:var(--cot-green)]/60 px-3 py-2 text-xs text-[color:var(--cot-green)] disabled:opacity-40">
                        {busy === "restore" ? "Restoring…" : "End drill — restore record"}
                      </button>
                    ) : (
                      <button disabled={!!busy || report.evidence_count === 0} onClick={() => run("tamper")} className="rounded-md border border-[color:var(--cot-red)]/60 px-3 py-2 text-xs text-[color:var(--cot-red)] disabled:opacity-40">
                        {busy === "tamper" ? "Editing database…" : "Drill: edit a record in the database"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.section>

          {/* the chain */}
          <section className="hud-frame rounded-xl p-4">
            <span className="eyebrow">The chain</span>
            <div className="mt-3 overflow-x-auto pb-2">
              <ol className="flex min-w-max items-stretch gap-0">
                {report.blocks.map((b, i) => {
                  const bad = b.link_intact === false || b.file_intact === false;
                  const downstream = brokenAt !== null && i > brokenAt;
                  return (
                    <li key={b.evidence_id} className="flex items-center">
                      <motion.button
                        onClick={() => setSelected(selected === i ? null : i)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.05, 0.6) }}
                        className={`w-52 rounded-lg border p-3 text-left ${
                          bad
                            ? "border-[color:var(--cot-red)] bg-[rgba(255,61,113,.1)] shadow-[0_0_24px_rgba(255,61,113,.35)]"
                            : downstream
                              ? "border-cot-amber/50 bg-cot-amber/[.06]"
                              : "border-[color:var(--cot-line-strong)] bg-[rgba(124,58,237,.08)] shadow-[0_0_18px_rgba(167,139,250,.12)]"
                        } ${selected === i ? "ring-2 ring-[color:var(--cot-cyan)]" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="label-caps text-[#b9b0d6]">block {i}</span>
                          <span className={`label-caps ${bad ? "text-[color:var(--cot-red)]" : downstream ? "text-cot-amber" : "text-[color:var(--cot-green)]"}`}>
                            {bad ? "TAMPERED" : downstream ? "UNTRUSTED" : "OK"}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold text-white">{b.description ?? b.evidence_type}</div>
                        <div className="mt-2 font-mono text-[10px] leading-relaxed">
                          <div className="truncate text-[color:var(--cot-cyan)]">hash {b.sha256_hash.slice(0, 16)}…</div>
                          <div className="truncate text-[#b9b0d6]">prev {b.previous_hash ? `${b.previous_hash.slice(0, 16)}…` : "genesis"}</div>
                        </div>
                        {b.file_intact !== null && (
                          <div className={`mt-1 text-[10px] ${b.file_intact ? "text-[color:var(--cot-green)]" : "text-[color:var(--cot-red)]"}`}>
                            file {b.file_intact ? "re-hashed ✓" : "MISMATCH"}
                          </div>
                        )}
                      </motion.button>
                      {i < report.blocks.length - 1 && (
                        <div className={`relative mx-1 h-px w-8 ${bad || downstream ? "bg-[color:var(--cot-red)]/60" : "bg-[color:var(--cot-cyan)]/70"}`}>
                          <span className={`absolute -top-[3px] right-0 h-[7px] w-[7px] rotate-45 border-r border-t ${bad || downstream ? "border-[color:var(--cot-red)]/70" : "border-[color:var(--cot-cyan)]/80"}`} />
                        </div>
                      )}
                    </li>
                  );
                })}
                {report.blocks.length === 0 && <li className="text-sm text-[#b9b0d6]">No evidence yet — the chain begins with the first item logged.</li>}
              </ol>
            </div>

            <AnimatePresence>
              {selected !== null && report.blocks[selected] && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3 grid gap-2 rounded-lg border border-[color:var(--cot-line)] bg-[rgba(7,6,15,.5)] p-4 font-mono text-[11px] md:grid-cols-2">
                    {(() => {
                      const b = report.blocks[selected];
                      return (
                        <>
                          <div><span className="text-[#b9b0d6]">stored hash</span><br /><span className="break-all text-[color:var(--cot-cyan)]">{b.sha256_hash}</span></div>
                          <div><span className="text-[#b9b0d6]">recomputed from file</span><br /><span className={`break-all ${b.file_intact === false ? "text-[color:var(--cot-red)]" : "text-[color:var(--cot-green)]"}`}>{b.recomputed_hash ?? "(not recomputed)"}</span></div>
                          <div><span className="text-[#b9b0d6]">previous hash</span><br /><span className="break-all text-white">{b.previous_hash ?? "genesis — first block"}</span></div>
                          <div><span className="text-[#b9b0d6]">logged</span><br /><span className="text-white">{new Date(b.uploaded_at).toLocaleString()}</span>{b.live_capture_sha256 && <><br /><span className="text-[#b9b0d6]">live capture </span><span className="break-all text-white">{b.live_capture_sha256.slice(0, 24)}…</span></>}</div>
                        </>
                      );
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* anchors + explanation */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="hud-frame rounded-xl p-4">
              <span className="eyebrow">Anchors — proof that lives outside the database</span>
              <p className="mt-2 text-xs leading-relaxed text-[#b9b0d6]">
                A chain proves tampering <em>after</em> the fact. An insider with SQL access could still rewrite every hash
                consistently. Anchoring defeats that: a senior officer records the chain digest here <strong>and</strong> exports a
                signed checkpoint kept where this database cannot reach — the case diary, a court registry, a public
                timestamping service. A rewritten chain no longer matches its anchor, and the mismatch is the evidence.
              </p>
              <ul className="mt-3 space-y-2">
                {report.anchors.map((a) => (
                  <li key={a.id} className={`rounded-md border p-3 text-xs ${a.holds ? "border-[color:var(--cot-green)]/40 bg-[rgba(6,255,165,.05)]" : "border-[color:var(--cot-red)]/50 bg-[rgba(255,61,113,.08)]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="label-caps text-[#b9b0d6]">{new Date(a.anchored_at).toLocaleString()} · {a.evidence_count} blocks</span>
                      <span className={`label-caps ${a.holds ? "text-[color:var(--cot-green)]" : "text-[color:var(--cot-red)]"}`}>{a.holds ? "holds" : "VIOLATED"}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-[color:var(--cot-cyan)]">digest {a.chain_digest}</div>
                    {a.note && <div className="mt-1 text-[#b9b0d6]">{a.note}</div>}
                  </li>
                ))}
                {report.anchors.length === 0 && <li className="text-xs text-[#b9b0d6]">No anchors yet. A Deputy Superintendent or above can anchor the chain at any milestone — after the scene, before filing.</li>}
              </ul>
            </section>

            <section className="hud-frame rounded-xl p-4">
              <span className="eyebrow">What this defends against — honestly</span>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-[#b9b0d6]">
                <li><span className="text-[color:var(--cot-green)]">■</span> <strong className="text-white">An evidence file edited or replaced</strong> — its re-computed hash no longer matches the one recorded at collection.</li>
                <li><span className="text-[color:var(--cot-green)]">■</span> <strong className="text-white">A record deleted, inserted, back-dated or reordered</strong> — the previous-hash links break from that point on.</li>
                <li><span className="text-[color:var(--cot-green)]">■</span> <strong className="text-white">A hash edited directly in the database</strong> — the file no longer re-hashes to it, and every later link breaks. Use the drill to watch it happen.</li>
                <li><span className="text-cot-amber">■</span> <strong className="text-white">A full, consistent rewrite by a database administrator</strong> — only an <em>anchor held outside the system</em> catches this. That is why anchoring exists and why a real deployment should publish digests to an independent service.</li>
                <li><span className="text-[color:var(--cot-red)]">■</span> <strong className="text-white">Fabricated evidence uploaded in the first place</strong> — no hash can detect a lie told at collection. That is what two-officer confirmation, device metadata and live capture are for.</li>
              </ul>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
