import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ForensicIcon } from "@/components/ui/ForensicIcon";

import "@/styles/evidence.css";

/**
 * Proof-of-presence capture.
 *
 * Field ranks (Constable / Head Constable / ASI) must photograph themselves
 * with the device camera at the point of collection before evidence can be
 * logged. This is a second independent signal tying a named officer to a
 * place and time — the spec's answer to "one person could fake this alone"
 * (PDF §3.1).
 *
 * Deliberately camera-only: the photo comes from a live MediaStream that this
 * component opens and draws to a canvas itself. There is no file picker,
 * because accepting an uploaded image would defeat the entire point.
 *
 * getUserMedia requires a secure context — it works on localhost and over
 * HTTPS, but will fail on a plain-HTTP LAN address. The error path says so
 * explicitly rather than showing a dead button.
 */

type Phase = "idle" | "starting" | "live" | "captured" | "error";

interface Props {
  onCapture: (blob: Blob | null) => void;
  required?: boolean;
}

export function LiveCapture({ onCapture, required = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [clock, setClock] = useState(() => new Date());

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Release the camera when the component unmounts — leaving the indicator
  // light on after navigating away is alarming and looks like a bug.
  useEffect(() => stopStream, [stopStream]);

  // Revoke the previous object URL whenever it is replaced.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Timestamp overlay on the live viewfinder.
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  async function startCamera() {
    setError(null);
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser will not expose a camera on an insecure origin. Use localhost or HTTPS.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("live");
    } catch (err) {
      stopStream();
      setPhase("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access for this site, then try again."
          : err instanceof Error
            ? err.message
            : "Could not start the camera."
      );
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not read a frame from the camera.");
          return;
        }
        if (preview) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(blob));
        setCapturedAt(new Date());
        setPhase("captured");
        stopStream();
        onCapture(blob);
      },
      "image/jpeg",
      0.9
    );
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedAt(null);
    onCapture(null);
    void startCamera();
  }

  const tone = phase === "captured" ? "ok" : required ? "warn" : "neutral";

  return (
    <div className={`hud-frame p-4 ${tone === "ok" ? "hud-frame--ok" : tone === "warn" ? "hud-frame--warn" : ""}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Proof of presence</p>
          <h3 className="mt-1 text-white">Live camera capture</h3>
          <p className="mt-1 max-w-lg text-[13px] text-cot-text2">
            {required
              ? "Your rank requires proof of presence. Take the photo at the point of collection — it is hashed and chained with the item."
              : "Optional for your rank — adds a second independent signal to the custody record."}
          </p>
        </div>
        <Chip tone={phase === "captured" ? "ok" : required ? "warn" : "neutral"} dot={phase === "live"}>
          {phase === "captured" ? "Captured" : phase === "live" ? "Camera live" : required ? "Required" : "Optional"}
        </Chip>
      </div>

      <div className="cam-frame">
        {/* Video element stays mounted so srcObject can attach before paint. */}
        <video ref={videoRef} playsInline muted className={`aspect-[4/3] w-full object-cover ${phase === "live" ? "block" : "hidden"}`} />

        {phase === "live" && (
          <>
            <span className="cam-frame__grid" aria-hidden="true" />
            <span className="cam-frame__scan" aria-hidden="true" />
            <span className="cam-frame__rec" aria-hidden="true">REC · LIVE</span>
            <span className="cam-frame__stamp">{clock.toISOString().replace("T", " ").slice(0, 19)}Z · facingMode user</span>
          </>
        )}

        <AnimatePresence>
          {phase === "captured" && preview && (
            <motion.img
              key="preview"
              src={preview}
              alt="Live capture preview"
              initial={{ opacity: 0, filter: "brightness(3) blur(6px)" }}
              animate={{ opacity: 1, filter: "brightness(1) blur(0px)" }}
              transition={{ duration: 0.5 }}
              className="aspect-[4/3] w-full object-cover"
            />
          )}
        </AnimatePresence>

        {(phase === "idle" || phase === "starting" || phase === "error") && (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--cot-line)] bg-[rgba(154,216,255,.05)] text-cot-ice">
              <ForensicIcon name="evidence" size={22} />
            </span>
            <p className="label-caps text-cot-text3">{phase === "starting" ? "Starting camera…" : "Camera is off"}</p>
            {phase === "starting" && <span className="h-px w-32 animate-pulse bg-cot-ice/60" />}
          </div>
        )}

        <span className="cam-frame__corner tl" aria-hidden="true" />
        <span className="cam-frame__corner tr" aria-hidden="true" />
        <span className="cam-frame__corner bl" aria-hidden="true" />
        <span className="cam-frame__corner br" aria-hidden="true" />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-cot-red/40 bg-cot-red/10 p-2.5 text-[13px] text-cot-red">
          {error}
        </p>
      )}

      {capturedAt && (
        <p className="mt-3 font-mono text-[11px] text-cot-text2">
          Captured {capturedAt.toLocaleString()} · hashed and chained on upload
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {phase !== "live" && phase !== "captured" && (
          <Button type="button" variant="primary" onClick={startCamera} busy={phase === "starting"}>
            Start camera
          </Button>
        )}
        {phase === "live" && (
          <Button type="button" variant="primary" onClick={capture}>
            Capture photo
          </Button>
        )}
        {phase === "captured" && (
          <Button type="button" variant="ghost" onClick={retake}>
            Retake
          </Button>
        )}
      </div>
    </div>
  );
}
