import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { ACTION_META, EvidenceGlyph, STATUS_META, shortHash, typeMeta } from "@/components/evidence/evidenceMeta";
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
import { useActiveCase } from "@/hooks/useActiveCase";
import { useCaseWebSocket } from "@/hooks/useCaseWebSocket";
import { useEvidenceThumbnails } from "@/hooks/useEvidenceThumbnails";
import { ApiError } from "@/lib/apiClient";
import * as evidenceApi from "@/services/evidenceApi";
import * as userApi from "@/services/userApi";
import type { ChainIntegrityReport, ChainOfCustodyEvent, Evidence, OfficerDirectoryEntry } from "@/types";

/**
 * Chain of custody — every touch of every exhibit. The left column is the
 * sealed chain (block order); the right column is the selected item's trail:
 * collection, witness, hashing, AI processing, transfers to the lab, views by
 * senior officers. Each event carries the hash the item had at that moment.
 */
export function ChainOfCustodyPage() {
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [items, setItems] = useState<Evidence[]>([]);
  const [integrity, setIntegrity] = useState<ChainIntegrityReport | null>(null);
  const [officers, setOfficers] = useState<OfficerDirectoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trail, setTrail] = useState<ChainOfCustodyEvent[]>([]);
  const [trailLoading, setTrailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const thumbs = useEvidenceThumbnails(items);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [list, report, dir] = await Promise.all([evidenceApi.listEvidenceForCase(id), evidenceApi.checkChainIntegrity(id).catch(() => null), userApi.listOfficerDirectory().catch(() => [])]);
      setItems(list);
      setIntegrity(report);
      setOfficers(dir);
      setSelectedId((cur) => (cur && list.some((e) => e.id === cur) ? cur : (list[0]?.id ?? null)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the evidence chain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);
  useCaseWebSocket(caseId || null, () => void load(caseId, true));

  useEffect(() => {
    if (!selectedId) {
      setTrail([]);
      return;
    }
    let live = true;
    setTrailLoading(true);
    evidenceApi
      .getChainOfCustody(selectedId)
      .then((t) => live && setTrail([...t].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))))
      .catch(() => live && setTrail([]))
      .finally(() => live && setTrailLoading(false));
    return () => {
      live = false;
    };
  }, [selectedId]);

  const selected = items.find((e) => e.id === selectedId) ?? null;
  const selectedIndex = items.findIndex((e) => e.id === selectedId);
  const officerName = (id: string) => {
    const o = officers.find((x) => x.id === id);
    return o ? `${o.full_name} · ${o.badge_number}` : "officer";
  };
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((e) => `${e.description ?? ""} ${e.original_filename ?? ""} ${e.evidence_type}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const witnessed = items.filter((e) => e.witness_officer_id).length;
  const liveCaptured = items.filter((e) => e.live_capture_sha256).length;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Custody · who touched what, when, and the hash it carried"
        title="Chain of custody"
        description={
          <>
            Every exhibit is a block in the case chain; every action on it — collection, witness confirmation, hashing, AI processing, transfer, access — is a custody event stamped with the hash at that moment.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="custody" size={13} />}>
              Refresh
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["scene", "forensics"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Sealed items" value={items.length} tone="violet" icon={<ForensicIcon name="evidence" size={16} />} hint="Blocks in the case chain" />
        <StatTile label="Chain" value={integrity === null ? "—" : integrity.is_valid ? "INTACT" : "BROKEN"} tone={integrity?.is_valid === false ? "red" : "mint"} icon={<ForensicIcon name="lock" size={16} />} hint={integrity?.is_valid === false ? `Broken at block ${integrity.broken_at_index}` : "Every link verified"} />
        <StatTile label="Two-officer" value={witnessed} tone="ice" progress={items.length ? witnessed / items.length : 0} icon={<ForensicIcon name="shield" size={16} />} hint="Physical evidence confirmed by a second officer" />
        <StatTile label="Live captured" value={liveCaptured} tone="magenta" icon={<ForensicIcon name="check" size={16} />} hint="Field ranks proved presence with a live photo" />
      </div>

      {loading ? (
        <ScanLoader label="Walking the custody chain…" rows={6} />
      ) : items.length === 0 ? (
        <EmptyState icon="custody" title="No evidence in this case yet" body="The chain starts with the first item logged. Load the scenario from the demo strip above, or log evidence." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Panel padded={false} eyebrow="The chain" title={`${items.length} blocks in seal order`} className="min-w-0">
            <div className="px-3 pb-3">
              <label className="relative mb-3 flex items-center">
                <ForensicIcon name="search" size={14} className="pointer-events-none absolute left-3 text-cot-text3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an exhibit…" className="w-full !pl-9 !py-2 !text-[14px]" aria-label="Filter evidence" />
              </label>
              <ol className="rise max-h-[720px] space-y-1.5 overflow-y-auto pr-1">
                {visible.map((e) => {
                  const idx = items.indexOf(e);
                  const meta = typeMeta(e.evidence_type);
                  const active = e.id === selectedId;
                  const thumb = thumbs[e.id];
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(e.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${active ? "border-cot-violet/70 bg-cot-violet/[.08] shadow-[0_0_24px_-10px_rgba(167,139,250,.8)]" : "border-[color:var(--cot-line)] bg-white/[.02] hover:border-[color:var(--cot-line-strong)]"}`}
                      >
                        <span className="thumb grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ color: meta.color }}>
                          {thumb ? <img src={thumb} alt="" /> : <EvidenceGlyph type={e.evidence_type} size={20} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-cot-text3">#{String(idx).padStart(2, "0")}</span>
                            <span className="truncate text-[13.5px] font-semibold text-white">{e.description ?? e.original_filename}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-cot-text3">
                            <span style={{ color: meta.color }}>{meta.short}</span>
                            <span className="font-mono">{shortHash(e.sha256_hash, 10)}</span>
                            <Chip tone={STATUS_META[e.status].tone} className="ml-auto !px-1.5 !text-[7px]">{STATUS_META[e.status].label}</Chip>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Panel>

          <div className="min-w-0 space-y-4">
            {selected && (
              <Panel tone={integrity?.is_valid === false && integrity.broken_at_index === selectedIndex ? "crit" : "ok"} eyebrow={`Block ${String(selectedIndex).padStart(2, "0")} · ${typeMeta(selected.evidence_type).label}`} title={selected.description ?? selected.original_filename ?? "Evidence"} actions={<Link to="/ledger" className="label-caps text-cot-violet hover:text-white">Open in ledger →</Link>}>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                  <div className="rounded-xl border border-[color:var(--cot-line)] bg-black/20 p-3">
                    <div className="label-caps text-cot-text3">SHA-256 seal</div>
                    <div className="mt-1 break-all font-mono text-[12px] text-cot-mint">{selected.sha256_hash}</div>
                    <div className="mt-2 label-caps text-cot-text3">Previous block</div>
                    <div className="mt-1 break-all font-mono text-[11px] text-cot-text2">{selected.previous_hash ?? "genesis — first item in the case"}</div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
                    <dt className="text-cot-text3">Status</dt>
                    <dd><Chip tone={STATUS_META[selected.status].tone}>{STATUS_META[selected.status].label}</Chip></dd>
                    <dt className="text-cot-text3">Logged by</dt>
                    <dd className="text-cot-text">{officerName(selected.uploaded_by)}</dd>
                    <dt className="text-cot-text3">Witnessed by</dt>
                    <dd className="text-cot-text">{selected.witness_officer_id ? officerName(selected.witness_officer_id) : <span className="text-cot-text3">not required</span>}</dd>
                    <dt className="text-cot-text3">Captured</dt>
                    <dd className="font-mono text-cot-text">{selected.captured_at ? new Date(selected.captured_at).toLocaleString() : "—"}</dd>
                    <dt className="text-cot-text3">Sealed</dt>
                    <dd className="font-mono text-cot-text">{new Date(selected.uploaded_at).toLocaleString()}</dd>
                    <dt className="text-cot-text3">Location</dt>
                    <dd className="font-mono text-cot-text">{selected.gps_lat != null ? `${Number(selected.gps_lat).toFixed(4)}, ${Number(selected.gps_lng).toFixed(4)}` : "—"}</dd>
                    <dt className="text-cot-text3">Live capture</dt>
                    <dd className="font-mono text-cot-text">{selected.live_capture_sha256 ? shortHash(selected.live_capture_sha256, 14) : <span className="text-cot-text3">none</span>}</dd>
                  </dl>
                </div>
              </Panel>
            )}

            <Panel eyebrow="Custody trail" title={trailLoading ? "Reading the trail…" : `${trail.length} custody events`} busy={trailLoading}>
              {trail.length === 0 && !trailLoading ? (
                <p className="text-sm text-cot-text2">No custody events recorded for this item.</p>
              ) : (
                <ol className="relative ml-3 border-l border-[color:var(--cot-line)] pl-6">
                  <AnimatePresence initial={false}>
                    {trail.map((ev, i) => {
                      const meta = ACTION_META[ev.action];
                      return (
                        <motion.li key={ev.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative pb-5 last:pb-0">
                          <span className="absolute -left-[31px] top-1 grid h-5 w-5 place-items-center rounded-full border bg-[#0e0b1f]" style={{ borderColor: meta.color, boxShadow: `0 0 12px ${meta.color}66` }}>
                            <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                          </span>
                          <div className="rounded-xl border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Chip tone={meta.tone}>{meta.label}</Chip>
                              <span className="text-[13px] font-semibold text-white">{officerName(ev.actor_id)}</span>
                              <span className="ml-auto font-mono text-[11px] text-cot-text3">{new Date(ev.occurred_at).toLocaleString()}</span>
                            </div>
                            <p className="mt-1.5 text-[13px] text-cot-text2">{ev.notes ?? meta.blurb}</p>
                            {ev.hash_at_event && <div className="mt-1.5 font-mono text-[10.5px] text-cot-text3">hash at event {shortHash(ev.hash_at_event, 16)}</div>}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}
