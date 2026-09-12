import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { DropZone } from "@/components/evidence/DropZone";
import { EvidenceVaultList } from "@/components/evidence/EvidenceVaultList";
import { EvidenceGlyph, STATUS_META, TYPE_META, shortHash } from "@/components/evidence/evidenceMeta";
import { HashChainStrip } from "@/components/evidence/HashChainStrip";
import { LiveCapture } from "@/components/evidence/LiveCapture";
import { RankRules } from "@/components/evidence/RankRules";
import { StepRail, type StepDef } from "@/components/evidence/StepRail";
import { TypeTiles } from "@/components/evidence/TypeTiles";
import { AppShell } from "@/components/layout/AppShell";
import { Button, LinkButton } from "@/components/ui/Button";
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
import { useCaseWebSocket } from "@/hooks/useCaseWebSocket";
import { useEvidenceThumbnails } from "@/hooks/useEvidenceThumbnails";
import * as evidenceApi from "@/services/evidenceApi";
import * as userApi from "@/services/userApi";
import { requiresLiveCapture, type Evidence, type EvidenceType, type OfficerDirectoryEntry } from "@/types";

import "@/styles/evidence.css";

type StepKey = "file" | "details" | "capture" | "submit";
type Phase = "form" | "sealing" | "done";

const LANGUAGES = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["mr", "Marathi"],
  ["bn", "Bengali"],
  ["other", "Other"],
] as const;

const stepVariants = {
  enter: { opacity: 0, x: 28, filter: "blur(4px)" },
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -28, filter: "blur(4px)" },
};

export function EvidenceIngestionPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase, loading: casesLoading } = useActiveCase();
  const liveCaptureRequired = requiresLiveCapture(user);
  const viewOnly = !!user?.is_view_only;

  // ---- form state (unchanged payload surface) ----
  const [liveCapture, setLiveCapture] = useState<Blob | null>(null);
  const [locating, setLocating] = useState(false);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("statement");
  const [file, setFile] = useState<File | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [witnessOfficerId, setWitnessOfficerId] = useState("");
  const [officers, setOfficers] = useState<OfficerDirectoryEntry[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [language, setLanguage] = useState("en");
  const [description, setDescription] = useState("");
  const [textContent, setTextContent] = useState("");
  const [chainItems, setChainItems] = useState<Evidence[]>([]);
  const [chainLoading, setChainLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [created, setCreated] = useState<Evidence | null>(null);

  // ---- stepper ----
  const steps: StepDef[] = useMemo(
    () => [
      { key: "file", label: "File & type" },
      { key: "details", label: "Details" },
      { key: "capture", label: "Live capture", skipped: !liveCaptureRequired },
      { key: "submit", label: "Witness & seal" },
    ],
    [liveCaptureRequired]
  );
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const stepKey = steps[step]?.key as StepKey;

  const selectedTypeConfig = TYPE_META[evidenceType];
  const thumbs = useEvidenceThumbnails(chainItems);

  useEffect(() => {
    userApi.listOfficerDirectory().then(setOfficers).catch(() => setOfficers([]));
  }, []);

  const reloadChain = useCallback(() => {
    if (!caseId) return Promise.resolve([] as Evidence[]);
    setChainLoading(true);
    return evidenceApi
      .listEvidenceForCase(caseId)
      .then((list) => {
        setChainItems(list);
        return list;
      })
      .catch(() => {
        setChainItems([]);
        return [] as Evidence[];
      })
      .finally(() => setChainLoading(false));
  }, [caseId]);

  useEffect(() => {
    void reloadChain();
  }, [reloadChain]);

  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "evidence.logged" || event.type === "evidence.witness_confirmed" || event.type === "evidence.ai_processed") void reloadChain();
  });

  function next() {
    setError(null);
    if (stepKey === "file" && !file) {
      setError("Select a file to upload.");
      return;
    }
    if (stepKey === "details") {
      if (gpsLat && Number.isNaN(parseFloat(gpsLat))) return setError("Latitude must be a decimal number.");
      if (gpsLng && Number.isNaN(parseFloat(gpsLng))) return setError("Longitude must be a decimal number.");
    }
    if (stepKey === "capture" && liveCaptureRequired && !liveCapture) {
      setError("Your rank requires a live camera capture before evidence can be logged.");
      return;
    }
    let target = step + 1;
    while (steps[target]?.skipped) target += 1;
    if (target >= steps.length) return;
    setStep(target);
    setMaxReached((m) => Math.max(m, target));
  }

  function back() {
    setError(null);
    let target = step - 1;
    while (target >= 0 && steps[target]?.skipped) target -= 1;
    if (target >= 0) setStep(target);
  }

  function useDeviceLocation() {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude.toFixed(6));
        setGpsLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Could not read the device location. Enter the coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
    if (!navigator.geolocation) {
      setError("This device does not expose a location service. Enter the coordinates manually.");
      setLocating(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Select a file to upload.");
      return;
    }
    if (selectedTypeConfig?.requiresWitness && !witnessOfficerId) {
      setError("Select the second officer who witnessed the collection.");
      return;
    }
    // Mirrors the server-side gate so a field officer gets an instant answer
    // rather than a round-trip rejection. The server still enforces it.
    if (liveCaptureRequired && !liveCapture) {
      setError("Your rank requires a live camera capture before evidence can be logged.");
      return;
    }

    setPhase("sealing");
    const started = Date.now();
    try {
      const evidence = await evidenceApi.uploadEvidence({
        case_id: caseId,
        evidence_type: evidenceType,
        file,
        witness_officer_id: witnessOfficerId || undefined,
        device_metadata: deviceId ? { device_id: deviceId } : undefined,
        captured_at: capturedAt ? new Date(capturedAt).toISOString() : undefined,
        gps_lat: gpsLat ? parseFloat(gpsLat) : undefined,
        gps_lng: gpsLng ? parseFloat(gpsLng) : undefined,
        language,
        description: description || undefined,
        text_content: textContent || undefined,
        live_capture: liveCapture,
      });
      // Let the sealing animation read as a deliberate act, not a flicker.
      const remaining = 1500 - (Date.now() - started);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      setCreated(evidence);
      setPhase("done");
      void reloadChain();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPhase("form");
    }
  }

  function resetForm() {
    setFile(null);
    setDigest(null);
    setDescription("");
    setTextContent("");
    setLiveCapture(null);
    setWitnessOfficerId("");
    setCapturedAt("");
    setCreated(null);
    setPhase("form");
    setStep(0);
    setMaxReached(0);
    setError(null);
  }

  const recent = useMemo(() => [...chainItems].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)).slice(0, 6), [chainItems]);
  const withGps = chainItems.filter((i) => i.gps_lat != null && i.gps_lng != null).length;
  const pendingWitness = chainItems.filter((i) => i.status === "pending_confirmation").length;
  const withText = chainItems.filter((i) => i.status === "ai_processed").length;
  const createdIndex = created ? chainItems.findIndex((i) => i.id === created.id) : -1;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Evidence intake"
        title="Log evidence"
        description="Every item is SHA-256 sealed and chained to the previous block the moment it lands. Physical evidence needs a second officer; field ranks add a live capture. AI reads the text — officers decide what is true."
        actions={<CaseSelect cases={cases} value={caseId} onChange={setCaseId} />}
      />
      <DemoStrip caseId={caseId} onChanged={() => void reloadChain()} needs={["scene"]} className="mb-5" />

      <div className="rise mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sealed items" value={chainItems.length} tone="violet" icon={<ForensicIcon name="lock" size={16} />} hint={activeCase ? activeCase.case_number : "No case"} />
        <StatTile label="With GPS" value={withGps} tone="amber" icon={<ForensicIcon name="map" size={16} />} progress={chainItems.length ? withGps / chainItems.length : 0} hint="Feed the location surface" />
        <StatTile label="Awaiting witness" value={pendingWitness} tone={pendingWitness ? "red" : "mint"} icon={<ForensicIcon name="shield" size={16} />} hint="Second-officer confirmation" />
        <StatTile label="AI processed" value={withText} tone="magenta" icon={<ForensicIcon name="brain" size={16} />} hint="Hypotheses until confirmed" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------- Stepper ---------------- */}
        <Panel eyebrow="Intake stepper" title={phase === "done" ? "Record sealed" : `Step ${step + 1} of ${steps.filter((s) => !s.skipped).length}`} busy={phase === "sealing"} tone={phase === "done" ? "ok" : "default"} className="materialise" padded>
          {viewOnly && (
            <div className="mb-4 rounded-xl border border-cot-red/40 bg-cot-red/10 p-3 text-[13px] text-cot-red">
              This is a view-only account. You can review the intake flow, but the server will refuse to log evidence from it.
            </div>
          )}
          {phase !== "done" && (
            <div className="mb-6 mt-2">
              <StepRail steps={steps} current={step} maxReached={maxReached} onJump={setStep} />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <AnimatePresence mode="wait" initial={false}>
              {phase === "sealing" && (
                <motion.div key="sealing" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35 }}>
                  <div className="sealing">
                    <span className="sealing__ring" />
                    <span className="sealing__ring" />
                    <span className="sealing__ring" />
                    <span className="sealing__core">
                      <ForensicIcon name="lock" size={24} />
                    </span>
                    <span className="sealing__hex">{digest ? `${digest.slice(0, 20)}…` : "hashing"}</span>
                  </div>
                  <p className="label-caps text-center text-cot-violet">Sealing · hashing on server · chaining to block {chainItems.length}</p>
                  <p className="mt-1 text-center text-[13px] text-cot-text3">Storing the file, recomputing SHA-256, linking previous hash, writing the custody record.</p>
                </motion.div>
              )}

              {phase === "done" && created && (
                <motion.div key="done" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.4 }} className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cot-mint/50 bg-cot-mint/10 text-cot-mint shadow-glow-mint">
                      <ForensicIcon name="check" size={22} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-white">Evidence sealed into the chain</h3>
                      <p className="text-[13px] text-cot-text2">
                        {created.description || created.original_filename} · {TYPE_META[created.evidence_type]?.label ?? created.evidence_type}
                      </p>
                    </div>
                    <Chip tone={STATUS_META[created.status]?.tone ?? "neutral"} className="ml-auto" dot>
                      {STATUS_META[created.status]?.label ?? created.status}
                    </Chip>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="hud-frame p-3">
                      <span className="label-caps text-cot-text3">Chain position</span>
                      <div className="stat-value mt-1 text-cot-violet">{createdIndex >= 0 ? `#${createdIndex}` : `#${chainItems.length}`}</div>
                      <span className="mt-1 block font-mono text-[11px] text-cot-text3">block index in {activeCase?.case_number ?? "case"}</span>
                    </div>
                    <div className="hud-frame p-3">
                      <span className="label-caps text-cot-text3">Previous hash</span>
                      <div className="mt-2 font-mono text-[12.5px] text-cot-text2">{shortHash(created.previous_hash, 16)}</div>
                      <span className="mt-1 block font-mono text-[11px] text-cot-text3">{created.previous_hash ? "linked" : "genesis block"}</span>
                    </div>
                    <div className="hud-frame p-3">
                      <span className="label-caps text-cot-text3">Live capture</span>
                      <div className="mt-2 font-mono text-[12.5px] text-cot-text2">{created.live_capture_sha256 ? shortHash(created.live_capture_sha256, 16) : "none supplied"}</div>
                      <span className="mt-1 block font-mono text-[11px] text-cot-text3">{created.live_capture_at ? new Date(created.live_capture_at).toLocaleTimeString() : "—"}</span>
                    </div>
                  </div>

                  <div className="seal">
                    <span className="label-caps text-cot-text3">Server seal · SHA-256</span>
                    <p className="seal__hash mt-2">{created.sha256_hash}</p>
                    {digest && (
                      <p className="mt-2 font-mono text-[11px] text-cot-text3">
                        Device digest {digest === created.sha256_hash ? <span className="text-cot-mint">matches</span> : <span className="text-cot-amber">differs (server hashes file plus metadata)</span>} · {shortHash(digest, 16)}
                      </p>
                    )}
                  </div>

                  {textContent && (
                    <div className="rounded-xl border border-cot-magenta/40 bg-cot-magenta/10 p-3 text-[13px] text-cot-text2">
                      <span className="label-caps text-cot-magenta">AI extraction running</span>
                      <p className="mt-1">The timeline builder and contradiction detector are reading the text now. Their output is a hypothesis until an officer confirms it — see Timeline and Contradictions.</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <LinkButton to="/chain-of-custody" variant="primary">
                      Open chain of custody
                    </LinkButton>
                    <LinkButton to="/ledger" variant="mint">
                      View ledger block
                    </LinkButton>
                    <Button type="button" variant="ghost" onClick={resetForm}>
                      Log another item
                    </Button>
                  </div>
                </motion.div>
              )}

              {phase === "form" && stepKey === "file" && (
                <motion.div key="file" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-5">
                  <div>
                    <span className="field-label">Evidence file</span>
                    <DropZone file={file} onFile={setFile} evidenceType={evidenceType} onDigest={setDigest} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="field-label !mb-0">Evidence type</span>
                      <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-cot-text3">
                        <span className="h-1.5 w-1.5 rounded-full bg-cot-amber shadow-[0_0_8px_#ffb547]" /> needs a witnessing officer
                      </span>
                    </div>
                    <TypeTiles value={evidenceType} onChange={setEvidenceType} />
                    <p className="mt-2 text-[12.5px] text-cot-text3">{selectedTypeConfig.hint}</p>
                  </div>
                </motion.div>
              )}

              {phase === "form" && stepKey === "details" && (
                <motion.div key="details" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="field-label" htmlFor="ev-desc">Description</label>
                      <textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full" placeholder="What this item is and where it was found — e.g. Kitchen knife recovered from drain grate, rear service lane" />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="ev-captured">Captured at</label>
                      <input id="ev-captured" type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} className="w-full font-mono !text-[13px]" />
                      <p className="mt-1 text-[11px] text-cot-text3">When the item was collected or the record was made. Upload time is recorded separately.</p>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="ev-device">Device ID</label>
                      <input id="ev-device" type="text" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="w-full font-mono !text-[13px]" placeholder="e.g. PC-7781-tablet" />
                      <p className="mt-1 text-[11px] text-cot-text3">Stored as metadata and locked after upload.</p>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="ev-lat">GPS latitude</label>
                      <input id="ev-lat" type="text" inputMode="decimal" value={gpsLat} onChange={(e) => setGpsLat(e.target.value)} placeholder="13.0418" className="w-full font-mono !text-[13px]" />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="ev-lng">GPS longitude</label>
                      <input id="ev-lng" type="text" inputMode="decimal" value={gpsLng} onChange={(e) => setGpsLng(e.target.value)} placeholder="80.2775" className="w-full font-mono !text-[13px]" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                      <Button type="button" size="sm" busy={locating} onClick={useDeviceLocation} icon={<ForensicIcon name="map" size={14} />}>
                        Use device location
                      </Button>
                      <span className="text-[11.5px] text-cot-text3">Feeds the predictive location surface — leave blank if this evidence has no known location.</span>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="ev-lang">Original language</label>
                      <select id="ev-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full">
                        {LANGUAGES.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-cot-text3">Preserved and displayed as-is — the system never auto-translates statements.</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label" htmlFor="ev-text">
                        Evidence text <span className="text-cot-magenta">· read by AI</span>
                      </label>
                      <textarea
                        id="ev-text"
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        rows={5}
                        placeholder="Paste the statement text, CCTV log notes, or a transcription/caption here. The Timeline Builder and Contradiction Detector only run on evidence with text content."
                        className="w-full font-mono !text-[12.5px]"
                      />
                      <p className="mt-1 text-[11px] text-cot-text3">Optional — leave blank for evidence with nothing readable (a raw photo with no caption). Output is a magenta hypothesis until an officer confirms it.</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {phase === "form" && stepKey === "capture" && (
                <motion.div key="capture" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                  <LiveCapture required={liveCaptureRequired} onCapture={setLiveCapture} />
                </motion.div>
              )}

              {phase === "form" && stepKey === "submit" && (
                <motion.div key="submit" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-4">
                  {selectedTypeConfig?.requiresWitness ? (
                    <div className="hud-frame hud-frame--warn p-4">
                      <label className="field-label" htmlFor="ev-witness">Witnessing officer <span className="text-cot-amber">· required for {selectedTypeConfig.label.toLowerCase()}</span></label>
                      <select id="ev-witness" value={witnessOfficerId} onChange={(e) => setWitnessOfficerId(e.target.value)} className="w-full">
                        <option value="">Select the officer who witnessed collection…</option>
                        {officers
                          .filter((o) => o.id !== user?.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.rank_abbreviation} · {o.full_name} ({o.badge_number})
                            </option>
                          ))}
                      </select>
                      <p className="mt-2 text-[12px] text-cot-text2">Physical evidence needs a second officer to confirm collection — a different person from the uploader. They will be asked to confirm from their own account; until then the item is “awaiting witness”.</p>
                    </div>
                  ) : (
                    <div className="hud-frame p-4">
                      <span className="label-caps text-cot-text3">Witnessing officer</span>
                      <p className="mt-1 text-[13px] text-cot-text2">Not required for {selectedTypeConfig.label.toLowerCase()}. Records and reports are sealed on the logging officer's authority; the hash chain and custody trail still record every touch.</p>
                    </div>
                  )}

                  <div>
                    <span className="field-label">Review before sealing</span>
                    <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-[color:var(--cot-line-soft)] bg-[rgba(14,11,31,.55)] p-4 text-[13px] sm:grid-cols-2">
                      <Row k="Case" v={activeCase ? `${activeCase.case_number} — ${activeCase.title}` : caseId} />
                      <Row k="Type" v={<span className="inline-flex items-center gap-2" style={{ color: selectedTypeConfig.color }}><EvidenceGlyph type={evidenceType} size={14} />{selectedTypeConfig.label}</span>} />
                      <Row k="File" v={file ? `${file.name}` : "—"} />
                      <Row k="Device digest" v={<span className="font-mono text-cot-mint">{digest ? shortHash(digest, 18) : "—"}</span>} />
                      <Row k="Captured at" v={capturedAt ? new Date(capturedAt).toLocaleString() : "not set"} />
                      <Row k="GPS" v={gpsLat && gpsLng ? <span className="font-mono">{gpsLat}, {gpsLng}</span> : "none"} />
                      <Row k="Language" v={LANGUAGES.find((l) => l[0] === language)?.[1] ?? language} />
                      <Row k="Live capture" v={liveCapture ? <span className="text-cot-mint">captured</span> : liveCaptureRequired ? <span className="text-cot-red">missing</span> : "not supplied"} />
                      <Row k="AI text" v={textContent ? `${textContent.length} characters — extraction will run` : "none — no AI stage"} />
                      <Row k="Witness" v={witnessOfficerId ? officers.find((o) => o.id === witnessOfficerId)?.full_name ?? witnessOfficerId : selectedTypeConfig.requiresWitness ? <span className="text-cot-amber">select above</span> : "not needed"} />
                    </dl>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && phase === "form" && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="mt-4 rounded-lg border border-cot-red/40 bg-cot-red/10 px-3 py-2 text-[13px] text-cot-red">
                {error}
              </motion.p>
            )}

            {phase === "form" && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--cot-line-soft)] pt-4">
                <Button type="button" variant="ghost" onClick={back} disabled={step === 0}>
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  <span className="hidden font-mono text-[11px] text-cot-text4 sm:inline">
                    {file ? `${file.name} · ${digest ? "digest ready" : "hashing"}` : "no file selected"}
                  </span>
                  {stepKey === "submit" ? (
                    <Button type="submit" variant="primary" size="lg" disabled={!caseId || viewOnly || casesLoading} icon={<ForensicIcon name="lock" size={14} />}>
                      Seal & log evidence
                    </Button>
                  ) : (
                    <Button type="button" variant="primary" onClick={next} icon={<ForensicIcon name="arrow" size={14} />}>
                      Continue
                    </Button>
                  )}
                </div>
              </div>
            )}
          </form>
        </Panel>

        {/* ---------------- Right rail ---------------- */}
        <div className="space-y-5">
          <Panel
            eyebrow="Recent evidence"
            title={activeCase ? activeCase.case_number : "Active case"}
            actions={<LinkButton to="/chain-of-custody" size="sm" variant="ghost">Custody vault</LinkButton>}
            busy={chainLoading && chainItems.length === 0}
            className="materialise"
          >
            {chainLoading && chainItems.length === 0 ? (
              <ScanLoader label="Reading the evidence vault…" rows={4} className="!border-0 !bg-transparent !p-0 !shadow-none" />
            ) : recent.length === 0 ? (
              <EmptyState icon="evidence" title="No evidence sealed yet" body="Items logged for this case will appear here with their seal and status. Load the Riverside Hotel scenario above to fill the vault." className="!py-8" />
            ) : (
              <EvidenceVaultList items={recent} thumbs={thumbs} compact />
            )}
          </Panel>
          <RankRules user={user} />
        </div>
      </div>

      <Panel eyebrow="Hash chain" title={`Live ledger · ${chainItems.length} block${chainItems.length === 1 ? "" : "s"}`} className="mt-5 materialise" actions={<LinkButton to="/ledger" size="sm" variant="ghost">Full ledger</LinkButton>}>
        <HashChainStrip items={chainItems} />
      </Panel>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[.04] pb-1.5 last:border-0">
      <dt className="label-caps shrink-0 text-cot-text3">{k}</dt>
      <dd className="min-w-0 truncate text-right text-cot-text">{v}</dd>
    </div>
  );
}
