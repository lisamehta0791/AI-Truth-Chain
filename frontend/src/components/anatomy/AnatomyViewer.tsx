import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Tabs } from "@/components/ui/Tabs";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

import "@/styles/anatomy.css";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export type BodyRegion = "head" | "chest" | "abdomen" | "left_arm" | "right_arm" | "left_leg" | "right_leg";
export type AnatomyLayer = "both" | "bones" | "organs";
export type Severity = "critical" | "warning" | "info";

export interface AnatomyHotspot {
  region: BodyRegion;
  label: string;
  finding?: string;
  severity?: Severity;
  /** Percent position override (0–100) on the figure, per layer. */
  at?: Partial<Record<AnatomyLayer, { x: number; y: number }>>;
  /** Optional detail rows for the expanded card. */
  details?: Array<{ label: string; value: string }>;
  confidence?: number;
}

export interface AnatomyViewerProps {
  hotspots?: AnatomyHotspot[];
  findings?: Set<string>;
  selectedRegion?: BodyRegion | null;
  onSelectRegion?: (region: BodyRegion) => void;
  layer?: AnatomyLayer;
  onLayerChange?: (l: AnatomyLayer) => void;
  /** Small, tool-less variant for dashboard panels. */
  compact?: boolean;
  /** Run the AI "reading → extracting → mapping" sequence when hotspots first arrive. */
  scanOnLoad?: boolean;
  className?: string;
  /** Kept for API compatibility with the old 3D figure; a slow drift is applied when true. */
  autoRotate?: boolean;
}

export const REGION_LABELS: Record<BodyRegion, string> = {
  head: "Head & neck",
  chest: "Thorax",
  abdomen: "Abdomen & pelvis",
  left_arm: "Left upper limb",
  right_arm: "Right upper limb",
  left_leg: "Left lower limb",
  right_leg: "Right lower limb",
};

/* ------------------------------------------------------------------ */
/* Layer imagery                                                       */
/* ------------------------------------------------------------------ */
const LAYERS: Array<{ value: AnatomyLayer; label: string; src: string; aspect: string; caption: string }> = [
  { value: "both", label: "Bones + organs", src: "/anatomy/both.png", aspect: "772 / 724", caption: "Anterior and posterior — skeleton, organs and vasculature" },
  { value: "bones", label: "Skeletal", src: "/anatomy/bones.png", aspect: "552 / 600", caption: "Skeletal system — fractures, dislocations, impact sites" },
  { value: "organs", label: "Organs", src: "/anatomy/organs.png", aspect: "776 / 772", caption: "Viscera and vasculature — haemorrhage, trauma, toxicology" },
];

/** Where each region sits on each image, in percent. Anatomical left = viewer's right (front-facing figure). */
const REGION_POS: Record<AnatomyLayer, Record<BodyRegion, { x: number; y: number }>> = {
  bones: {
    head: { x: 50, y: 9 },
    chest: { x: 50, y: 29 },
    abdomen: { x: 50, y: 46 },
    right_arm: { x: 33, y: 45 },
    left_arm: { x: 67, y: 45 },
    right_leg: { x: 44, y: 79 },
    left_leg: { x: 56, y: 79 },
  },
  organs: {
    head: { x: 50, y: 4 },
    chest: { x: 50, y: 28 },
    abdomen: { x: 50, y: 52 },
    right_arm: { x: 17, y: 46 },
    left_arm: { x: 83, y: 46 },
    right_leg: { x: 40, y: 91 },
    left_leg: { x: 60, y: 91 },
  },
  both: {
    head: { x: 27, y: 9 },
    chest: { x: 27, y: 28 },
    abdomen: { x: 27, y: 44 },
    right_arm: { x: 15, y: 42 },
    left_arm: { x: 39, y: 42 },
    right_leg: { x: 23, y: 78 },
    left_leg: { x: 32, y: 78 },
  },
};

const SEV: Record<Severity, { ring: string; glow: string; text: string; chip: string }> = {
  critical: { ring: "#ff3d71", glow: "rgba(255,61,113,.7)", text: "text-cot-red", chip: "status-critical" },
  warning: { ring: "#ffb547", glow: "rgba(255,181,71,.7)", text: "text-cot-amber", chip: "status-warn" },
  info: { ring: "#06ffa5", glow: "rgba(6,255,165,.6)", text: "text-cot-mint", chip: "status-ok" },
};

/* ------------------------------------------------------------------ */
/* AI scan sequence                                                    */
/* ------------------------------------------------------------------ */
type ScanPhase = "idle" | "reading" | "extracting" | "mapping" | "complete";
const SCAN_STEPS: Array<{ phase: Exclude<ScanPhase, "idle" | "complete">; label: string; ms: number }> = [
  { phase: "reading", label: "Reading the post-mortem report", ms: 900 },
  { phase: "extracting", label: "Extracting findings and body regions", ms: 1100 },
  { phase: "mapping", label: "Mapping findings onto the anatomy", ms: 900 },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function AnatomyViewer({
  hotspots = [],
  findings,
  selectedRegion = null,
  onSelectRegion,
  layer: layerProp,
  onLayerChange,
  compact = false,
  scanOnLoad = true,
  className = "",
  autoRotate = false,
}: AnatomyViewerProps) {
  const reduced = usePrefersReducedMotion();
  const [layerState, setLayerState] = useState<AnatomyLayer>(layerProp ?? "both");
  const layer = layerProp ?? layerState;
  const setLayer = (l: AnatomyLayer) => {
    setLayerState(l);
    onLayerChange?.(l);
  };
  const meta = LAYERS.find((l) => l.value === layer)!;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [heatmap, setHeatmap] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Fit the figure inside the root, leaving side margins for the callouts.
  const [box, setBox] = useState({ w: 0, h: 0, sw: 0, sh: 0 });
  const aspect = useMemo(() => {
    const [aw, ah] = meta.aspect.split("/").map((n) => Number(n.trim()));
    return aw / ah;
  }, [meta.aspect]);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const maxW = compact ? w : Math.min(w, w * 0.6);
      const maxH = compact ? h : h - 16;
      let sh = maxH;
      let sw = sh * aspect;
      if (sw > maxW) {
        sw = maxW;
        sh = sw / aspect;
      }
      setBox({ w, h, sw, sh });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, compact]);
  const stageLeft = (box.w - box.sw) / 2;
  const stageTop = (box.h - box.sh) / 2;
  /** Stage-percent → root-percent. */
  const toRoot = (x: number, y: number) => ({ x: box.w ? ((stageLeft + (x / 100) * box.sw) / box.w) * 100 : x, y: box.h ? ((stageTop + (y / 100) * box.sh) / box.h) * 100 : y });

  // --- AI scan -------------------------------------------------------
  const [phase, setPhase] = useState<ScanPhase>(scanOnLoad && hotspots.length > 0 ? "reading" : "complete");
  const [progress, setProgress] = useState(0);
  const scannedFor = useRef<number>(-1);

  const runScan = useCallback(() => {
    setPhase("reading");
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!scanOnLoad) return;
    if (hotspots.length > 0 && scannedFor.current !== hotspots.length) {
      scannedFor.current = hotspots.length;
      runScan();
    }
  }, [hotspots.length, scanOnLoad, runScan]);

  useEffect(() => {
    if (phase === "idle" || phase === "complete") return;
    const idx = SCAN_STEPS.findIndex((s) => s.phase === phase);
    const step = SCAN_STEPS[idx];
    const speed = reduced ? 0.35 : 1;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (step.ms * speed));
      setProgress((idx + t) / SCAN_STEPS.length);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPhase(idx + 1 < SCAN_STEPS.length ? SCAN_STEPS[idx + 1].phase : "complete");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduced]);

  const scanning = phase !== "complete" && phase !== "idle";
  const showMarkers = phase === "complete";

  // --- hotspots placed on this layer ------------------------------------
  const placed = useMemo(
    () =>
      hotspots.map((h, i) => {
        const p = h.at?.[layer] ?? REGION_POS[layer][h.region];
        // Several findings on one region fan out slightly so markers stay distinct.
        const dup = hotspots.slice(0, i).filter((o) => o.region === h.region && !o.at?.[layer]).length;
        return { ...h, x: p.x + (dup % 2 === 1 ? 3.2 : 0) * (dup ? 1 : 0), y: p.y + dup * 4.2, key: `${h.region}-${i}` };
      }),
    [hotspots, layer]
  );

  // Callout placement: left column for markers on the left half, right column otherwise; spread by y.
  const callouts = useMemo(() => {
    if (compact) return [];
    const sorted = [...placed].sort((a, b) => a.y - b.y);
    const oneSided = sorted.every((p) => p.x < 50) || sorted.every((p) => p.x >= 50);
    const withSide = sorted.map((p, i) => ({ ...p, side: oneSided ? (i % 2 === 0 ? "left" : "right") : p.x < 50 ? "left" : "right" }));
    const spread = (arr: typeof withSide) => {
      const out = new Map<string, number>();
      let last = -100;
      arr.forEach((p) => {
        const root = toRoot(p.x, p.y).y;
        const y = Math.min(Math.max(root, last + 15, 13), 90);
        out.set(p.key, y);
        last = y;
      });
      return out;
    };
    const ys = new Map([...spread(withSide.filter((p) => p.side === "left")), ...spread(withSide.filter((p) => p.side === "right"))]);
    return withSide.map((p) => ({ ...p, cy: ys.get(p.key) ?? p.y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, compact, box]);

  // --- pan/zoom ---------------------------------------------------------
  const onWheel = (e: React.WheelEvent) => {
    if (compact) return;
    e.preventDefault();
    setZoom((z) => Math.max(1, Math.min(2.6, z * (e.deltaY < 0 ? 1.12 : 0.9))));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (compact || zoom === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  const selectedHotspot = placed.find((p) => p.region === selectedRegion) ?? null;
  const flaggedRegions = findings ?? new Set<string>();

  return (
    <div ref={rootRef} className={`anatomy ${compact ? "anatomy--compact" : ""} ${className}`} data-layer={layer}>
      {/* stage */}
      <div
        ref={stageRef}
        className={`anatomy-stage ${zoom > 1 ? "is-zoomed" : ""} ${autoRotate && !reduced ? "is-drifting" : ""}`}
        style={box.sw ? { width: box.sw, height: box.sh } : { aspectRatio: meta.aspect, height: "100%" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="anatomy-transform" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.img
              key={layer}
              src={meta.src}
              alt={meta.caption}
              draggable={false}
              className="anatomy-img"
              initial={{ opacity: 0, filter: "brightness(2) blur(6px)" }}
              animate={{ opacity: 1, filter: "brightness(1) blur(0px)" }}
              exit={{ opacity: 0, filter: "brightness(1.6) blur(4px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            />
          </AnimatePresence>
          {/* glow duplicate — softens upscaling and gives the hologram bloom */}
          <img src={meta.src} alt="" aria-hidden="true" className="anatomy-glow" draggable={false} />
          <div className="anatomy-scanlines" aria-hidden="true" />
          <div className="anatomy-vignette" aria-hidden="true" />

          {/* heatmap */}
          {heatmap && showMarkers && (
            <div className="anatomy-heat" aria-hidden="true">
              {placed.map((p) => (
                <span key={p.key} style={{ left: `${p.x}%`, top: `${p.y}%`, background: `radial-gradient(circle, ${SEV[p.severity ?? "info"].glow} 0%, transparent 70%)` }} />
              ))}
            </div>
          )}

          {/* region hit zones */}
          {(Object.keys(REGION_POS[layer]) as BodyRegion[]).map((r) => {
            const p = REGION_POS[layer][r];
            const flagged = flaggedRegions.has(r);
            const sel = selectedRegion === r;
            return (
              <button
                key={r}
                type="button"
                className={`anatomy-zone ${sel ? "is-selected" : ""} ${flagged ? "is-flagged" : ""}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRegion?.(r);
                }}
                aria-label={REGION_LABELS[r]}
                title={REGION_LABELS[r]}
              />
            );
          })}

          {/* markers */}
          <AnimatePresence>
            {showMarkers &&
              placed.map((p, i) => {
                const sev = SEV[p.severity ?? "info"];
                const sel = selectedRegion === p.region;
                return (
                  <motion.button
                    key={p.key}
                    type="button"
                    className={`anatomy-marker ${sel ? "is-selected" : ""}`}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, ["--ring" as string]: sev.ring, ["--glow" as string]: sev.glow }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22, delay: reduced ? 0 : i * 0.08 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRegion?.(p.region);
                    }}
                    onMouseEnter={() => setHover(p.key)}
                    onMouseLeave={() => setHover(null)}
                    aria-label={`${p.label} — ${REGION_LABELS[p.region]}`}
                  >
                    <span className="ping" />
                    <span className="dot" />
                    {compact && (hover === p.key || sel) && <span className="tip">{p.label}</span>}
                  </motion.button>
                );
              })}
          </AnimatePresence>
        </div>

        {/* scan overlay */}
        <AnimatePresence>
          {scanning && (
            <motion.div className="anatomy-scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="polite">
              <div className="beam" style={{ top: `${(progress * 100).toFixed(1)}%` }} />
              {!compact && (
                <div className="anatomy-scan-card">
                  <div className="eyebrow text-cot-magenta">AI analysis in progress</div>
                  <ol>
                    {SCAN_STEPS.map((s, i) => {
                      const idx = SCAN_STEPS.findIndex((x) => x.phase === phase);
                      const state = i < idx ? "done" : i === idx ? "active" : "todo";
                      return (
                        <li key={s.phase} data-state={state}>
                          <span className="n">{state === "done" ? "✓" : i + 1}</span>
                          {s.label}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="bar">
                    <span style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

        {/* callouts with leader lines */}
        {!compact && showMarkers && (
          <>
            <svg className="anatomy-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {callouts.map((c) => {
                const sev = SEV[c.severity ?? "info"];
                const m = toRoot(c.x, c.y);
                const tx = c.side === "left" ? 19.5 : 80.5;
                const elbow = c.side === "left" ? Math.min(m.x - 4, tx + 5) : Math.max(m.x + 4, tx - 5);
                const sel = selectedRegion === c.region;
                return (
                  <g key={c.key}>
                    <path d={`M ${m.x} ${m.y} L ${elbow} ${c.cy} L ${tx} ${c.cy}`} stroke={sev.ring} strokeWidth={sel ? 1.8 : 1.3} fill="none" strokeOpacity={sel ? 1 : 0.85} vectorEffect="non-scaling-stroke" strokeDasharray={sel ? undefined : "5 3"} />
                    <circle cx={tx} cy={c.cy} r={0.5} fill={sev.ring} opacity={0.9} />
                  </g>
                );
              })}
            </svg>
            {callouts.map((c) => {
              const sev = SEV[c.severity ?? "info"];
              const sel = selectedRegion === c.region;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`anatomy-callout ${c.side} ${sel ? "is-selected" : ""}`}
                  style={{ top: `${c.cy}%`, ["--ring" as string]: sev.ring }}
                  onClick={() => onSelectRegion?.(c.region)}
                >
                  <span className="t">
                    <b>{REGION_LABELS[c.region]}</b>
                    <i className={`chip ${sev.chip}`}>{c.severity ?? "info"}</i>
                  </span>
                  <span className="f">{c.label}</span>
                  {sel && c.finding && <span className="d">{c.finding}</span>}
                  {sel && c.details && (
                    <span className="rows">
                      {c.details.map((d) => (
                        <span key={d.label}>
                          <em>{d.label}</em>
                          {d.value}
                        </span>
                      ))}
                    </span>
                  )}
                  {sel && <span className="foot">AI hypothesis — requires forensic review{typeof c.confidence === "number" ? ` · confidence ${Math.round(c.confidence * 100)}%` : ""}</span>}
                </button>
              );
            })}
          </>
        )}
      {/* chrome */}
      {!compact && (
        <>
          <div className="anatomy-tabs">
            <Tabs id="anatomy-layer" value={layer} onChange={setLayer} options={LAYERS.map((l) => ({ value: l.value, label: l.label }))} />
          </div>
          <div className="anatomy-tools" role="toolbar" aria-label="Figure tools">
            <button type="button" title="Zoom in" onClick={() => setZoom((z) => Math.min(2.6, z * 1.2))}>+</button>
            <button type="button" title="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.2))}>−</button>
            <button type="button" title="Reset view" onClick={reset}>⟲</button>
            <button type="button" title="Layers" className={layersOpen ? "is-on" : ""} onClick={() => setLayersOpen((v) => !v)}>▤</button>
            <button type="button" title="Heat map of findings" className={heatmap ? "is-on" : ""} onClick={() => setHeatmap((v) => !v)}>◉</button>
            <button type="button" title="Re-run the AI mapping" onClick={runScan} disabled={scanning || hotspots.length === 0}>⟳</button>
          </div>
          <AnimatePresence>
            {layersOpen && (
              <motion.div className="anatomy-layers" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                {LAYERS.map((l) => (
                  <button key={l.value} type="button" className={layer === l.value ? "is-on" : ""} onClick={() => setLayer(l.value)}>
                    <b>{l.label}</b>
                    <span>{l.caption}</span>
                  </button>
                ))}
                <button type="button" className={heatmap ? "is-on" : ""} onClick={() => setHeatmap((v) => !v)}>
                  <b>Heat map</b>
                  <span>Severity gradients over the injury sites</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="anatomy-hint">
            <span>{zoom > 1 ? "Drag to pan" : "Scroll to zoom"}</span>
            <span>·</span>
            <span>{placed.length} marker{placed.length === 1 ? "" : "s"}</span>
            {selectedHotspot && (
              <>
                <span>·</span>
                <span className={SEV[selectedHotspot.severity ?? "info"].text}>{selectedHotspot.label}</span>
              </>
            )}
          </div>
          <div className="anatomy-caption">{meta.caption}</div>
        </>
      )}
    </div>
  );
}
