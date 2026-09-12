import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useEffect, useRef, useState } from "react";

import { EvidenceGlyph, formatBytes, sha256Hex } from "@/components/evidence/evidenceMeta";
import { Button } from "@/components/ui/Button";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import type { EvidenceType } from "@/types";

import "@/styles/evidence.css";

interface Props {
  file: File | null;
  onFile: (f: File | null) => void;
  evidenceType: EvidenceType;
  /** Called whenever the client-side digest changes (null while computing / no file). */
  onDigest?: (hex: string | null) => void;
}

/**
 * Drag-and-drop intake surface. The moment a file lands, its SHA-256 is
 * computed in the browser with Web Crypto and shown as the provisional seal,
 * so the officer sees the digest before a single byte leaves the device.
 */
export function DropZone({ file, onFile, evidenceType, onDigest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setDigest(null);
      setPreview(null);
      onDigest?.(null);
      return;
    }
    let cancelled = false;
    setComputing(true);
    setDigest(null);
    onDigest?.(null);
    sha256Hex(file)
      .then((hex) => {
        if (cancelled) return;
        setDigest(hex);
        onDigest?.(hex);
      })
      .catch(() => {
        if (!cancelled) setDigest(null);
      })
      .finally(() => {
        if (!cancelled) setComputing(false);
      });

    let url: string | null = null;
    if (file.type.startsWith("image/")) {
      url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // onDigest is a stable setter from the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  const ext = file?.name.split(".").pop()?.toUpperCase() ?? "";

  return (
    <div className="space-y-3">
      <div
        className={`dropzone holo-border ${over ? "is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Drop an evidence file here or press to browse"
      >
        <span className="dropzone__beam" aria-hidden="true" />
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <AnimatePresence mode="wait" initial={false}>
          {!file ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative z-[1] flex flex-col items-center gap-4 px-6 py-10 text-center"
            >
              <div className="dropzone__ring float">
                <ForensicIcon name="upload" size={30} />
              </div>
              <div>
                <p className="label-caps text-cot-text">Drop the evidence file here</p>
                <p className="mt-1.5 text-sm text-cot-text2">
                  or <span className="text-cot-violet underline decoration-dotted underline-offset-4">browse the device</span>. Photos, video, audio, scans, exports and text records are accepted.
                </p>
              </div>
              <p className="font-mono text-[11px] text-cot-text3">Digest is computed on this device · SHA-256 · nothing leaves until you submit</p>
            </motion.div>
          ) : (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative z-[1] flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="thumb relative h-28 w-full shrink-0 overflow-hidden rounded-xl border border-[color:var(--cot-line)] sm:h-32 sm:w-44">
                {preview ? (
                  <img src={preview} alt="File preview" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-cot-violet">
                    <EvidenceGlyph type={evidenceType} size={34} />
                    <span className="label-caps text-cot-text3">{ext || "FILE"}</span>
                  </div>
                )}
                <span className="absolute bottom-2 left-2 z-[1] chip status-neutral !py-0.5">{ext || file.type || "file"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-white">{file.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-cot-text3">
                  {formatBytes(file.size)} · {file.type || "unknown media type"} · modified {new Date(file.lastModified).toLocaleString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" type="button" onClick={() => inputRef.current?.click()}>
                    Replace file
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => onFile(null)}>
                    Remove
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`seal ${computing ? "is-computing" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="label-caps text-cot-text3">Provisional seal · SHA-256</span>
          <span className={`chip ${digest ? "status-ok" : computing ? "status-ai" : "status-neutral"}`}>
            {digest ? "Digest ready" : computing ? "Hashing" : "Awaiting file"}
          </span>
        </div>
        <p className={`seal__hash mt-2 ${digest ? "" : "seal__hash--pending"}`}>
          {digest ?? (computing ? "computing digest on device…" : "0000000000000000000000000000000000000000000000000000000000000000")}
        </p>
        <p className="mt-1.5 text-[11px] text-cot-text3">The server recomputes this digest on receipt and chains it to the previous block of the case. A mismatch is a rejection, never a silent overwrite.</p>
      </div>
    </div>
  );
}
