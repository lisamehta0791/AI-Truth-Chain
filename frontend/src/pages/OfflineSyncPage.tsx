import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
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
import * as syncApi from "@/services/syncApi";
import { canConfirmAiOutput, type OfflineSyncQueueEntry } from "@/types";

/** Devices the demo knows about; any id can be typed in. */
const KNOWN_DEVICES = ["field-tablet-07", "demo-field-tablet-01", "bodycam-PC-7781"];

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Offline sync — what a field device captured while it had no connection,
 * with the timestamp and hash it recorded at that moment. When the device
 * reconnects the queue is reconciled: the original hash is what the record
 * is judged against, not the time it happened to reach the server.
 */
export function OfflineSyncPage() {
  const { user } = useAuth();
  const { caseId } = useActiveCase();
  const [deviceId, setDeviceId] = useState(KNOWN_DEVICES[0]);
  const [entries, setEntries] = useState<OfflineSyncQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("Photo of tool marks on the rear door frame");
  const canQueue = canConfirmAiOutput(user) || !!user;

  const load = useCallback(async (device: string, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const list = await syncApi.getSyncStatus(device);
      setEntries([...list].sort((a, b) => a.original_timestamp.localeCompare(b.original_timestamp)));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not read the device queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(deviceId);
  }, [deviceId, load]);

  async function queueCapture() {
    setQueuing(true);
    setError(null);
    try {
      const ts = new Date(Date.now() - 1000 * 60 * 37).toISOString(); // captured 37 minutes ago, offline
      const hash = await sha256(`${note}|${ts}|${deviceId}`);
      await syncApi.submitOfflineBatch(deviceId, [{ payload: { type: "photo", note, device: deviceId, captured_while_offline: true }, original_timestamp: ts, original_hash: hash }]);
      await load(deviceId, true);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not queue the capture.");
    } finally {
      setQueuing(false);
    }
  }

  const stats = useMemo(() => {
    const synced = entries.filter((e) => e.synced_at).length;
    const drift = entries.map((e) => (new Date(e.created_at).getTime() - new Date(e.original_timestamp).getTime()) / 60000);
    const maxDrift = drift.length ? Math.max(...drift) : 0;
    return { synced, pending: entries.length - synced, maxDrift };
  }, [entries]);

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Field devices · captured without a connection"
        title="Offline sync"
        description="What a tablet or body camera recorded while it was out of coverage — with the timestamp and hash it wrote at the moment of capture. On reconnection the queue reconciles; the original hash, not the arrival time, is what the record is judged against."
        actions={
          <label className="flex items-center gap-2">
            <span className="label-caps text-cot-text3">Device</span>
            <input list="cot-devices" value={deviceId} onChange={(e) => setDeviceId(e.target.value.trim())} className="min-w-[220px] !py-2 !text-[14px] font-mono" aria-label="Device id" />
            <datalist id="cot-devices">
              {KNOWN_DEVICES.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(deviceId, true)} needs={["prefiling"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Queued captures" value={entries.length} tone="violet" icon={<ForensicIcon name="upload" size={16} />} hint={`device ${deviceId}`} />
        <StatTile label="Reconciled" value={stats.synced} tone="mint" progress={entries.length ? stats.synced / entries.length : 0} icon={<ForensicIcon name="check" size={16} />} hint="Original hash verified on arrival" />
        <StatTile label="Awaiting" value={stats.pending} tone={stats.pending ? "amber" : "mint"} icon={<ForensicIcon name="alert" size={16} />} hint="Not yet reconciled" />
        <StatTile label="Max clock drift" value={Math.round(stats.maxDrift)} suffix=" min" tone="ice" icon={<ForensicIcon name="timeline" size={16} />} hint="Capture time → arrival at the server" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {loading ? (
          <ScanLoader label="Reading the device queue…" rows={4} />
        ) : entries.length === 0 ? (
          <EmptyState icon="upload" title="Nothing queued from this device" body="Queue a capture on the right to see how the original timestamp and hash survive the sync, or load stage 9 of the scenario (a field tablet syncs two photos)." />
        ) : (
          <Panel padded={false} eyebrow="Queue" title={`${entries.length} captures from ${deviceId}`}>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="label-caps text-cot-text3">
                    <th className="px-2 py-2 text-left">Captured (device clock)</th>
                    <th className="px-2 py-2 text-left">Payload</th>
                    <th className="px-2 py-2 text-left">Original hash</th>
                    <th className="px-2 py-2 text-left">Arrived</th>
                    <th className="px-2 py-2 text-left">State</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {entries.map((e, i) => {
                      const drift = Math.round((new Date(e.created_at).getTime() - new Date(e.original_timestamp).getTime()) / 60000);
                      const payload = e.payload as Record<string, unknown>;
                      return (
                        <motion.tr key={e.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="border-t border-white/[.06] align-top">
                          <td className="px-2 py-2.5 font-mono text-[12px] text-cot-text">{new Date(e.original_timestamp).toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-cot-text2">
                            <span className="text-white">{String(payload.note ?? payload.type ?? "capture")}</span>
                            {payload.type ? <span className="ml-2 chip status-neutral !px-1.5 !text-[7px]">{String(payload.type)}</span> : null}
                          </td>
                          <td className="px-2 py-2.5 font-mono text-[11px] text-cot-mint" title={e.original_hash}>{e.original_hash.slice(0, 18)}…</td>
                          <td className="px-2 py-2.5 font-mono text-[12px] text-cot-text3">
                            {new Date(e.created_at).toLocaleString()}
                            {drift > 5 && <span className="ml-2 text-cot-amber">+{drift} min</span>}
                          </td>
                          <td className="px-2 py-2.5">{e.synced_at ? <Chip tone="ok">Reconciled</Chip> : <Chip tone="warn" dot>Awaiting</Chip>}</td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <div className="space-y-4">
          <Panel eyebrow="Field capture" title="Queue a capture from this device" tone="warn" busy={queuing}>
            <label className="field-label">What was captured</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full !text-[14px]" aria-label="Capture note" />
            <p className="mt-2 text-[12px] text-cot-text3">The device stamps the capture 37 minutes ago and hashes it locally — exactly what a tablet does before it has signal.</p>
            <Button className="mt-3" variant="primary" busy={queuing} disabled={!canQueue || !note.trim()} onClick={() => void queueCapture()} icon={<ForensicIcon name="upload" size={13} />}>
              Sync when connected
            </Button>
          </Panel>
          <Panel eyebrow="Why it matters" title="The clock that counts is the one at capture" tone="ai">
            <ul className="space-y-2 text-[13px] text-cot-text2">
              <li className="flex gap-2"><span className="text-cot-mint">●</span> The hash is computed on the device at the moment of capture, before any network exists.</li>
              <li className="flex gap-2"><span className="text-cot-magenta">●</span> The server keeps both clocks: capture time and arrival time. Drift is shown, never hidden.</li>
              <li className="flex gap-2"><span className="text-cot-amber">●</span> A payload whose hash no longer matches on arrival is rejected, not silently corrected.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
