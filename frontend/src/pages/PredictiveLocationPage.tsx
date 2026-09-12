import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { typeMeta } from "@/components/evidence/evidenceMeta";
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
import { DARK_BASEMAP_STYLE, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/mapStyle";
import { ApiError } from "@/lib/apiClient";
import * as evidenceApi from "@/services/evidenceApi";
import * as locationApi from "@/services/locationApi";
import { canConfirmAiOutput, type Evidence, type LocationScore } from "@/types";
import { useAuth } from "@/context/AuthContext";

import "@/styles/map.css";

const scoreColor = (s: number) => (s >= 0.75 ? "#ff3d71" : s >= 0.5 ? "#ffb547" : "#a78bfa");
const scoreBand = (s: number) => (s >= 0.75 ? "High priority" : s >= 0.5 ? "Medium priority" : "Low priority");
const MOVEMENT_TYPES = new Set(["gps_log", "phone_record", "cctv_metadata"]);

/**
 * Predictive location — a transparent, rule-based scoring surface over the
 * places already recorded in the case, drawn on a real map. Every evidence
 * item with coordinates is a marker; movement evidence is joined into a
 * track; scored cells show their own arithmetic. Not a trained model.
 */
export function PredictiveLocationPage() {
  const { user } = useAuth();
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [scores, setScores] = useState<LocationScore[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const canCompute = canConfirmAiOutput(user);

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([locationApi.listLocationScores(id).catch(() => [] as LocationScore[]), evidenceApi.listEvidenceForCase(id)]);
      setScores(s);
      setEvidence(e);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not load the location surface.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(caseId);
  }, [caseId, load]);
  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "location.updated" || event.type === "evidence.logged") void load(caseId, true);
  });

  // ---- map -------------------------------------------------------------
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: mapEl.current, style: DARK_BASEMAP_STYLE, center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    map.on("load", () => setMapReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const located = useMemo(() => evidence.filter((e) => e.gps_lat != null && e.gps_lng != null), [evidence]);
  const track = useMemo(
    () =>
      located
        .filter((e) => MOVEMENT_TYPES.has(e.evidence_type) && e.captured_at)
        .sort((a, b) => (a.captured_at ?? "").localeCompare(b.captured_at ?? ""))
        .map((e) => [Number(e.gps_lng), Number(e.gps_lat)] as [number, number]),
    [located]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];

    const heat: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: scores.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.gps_lng, s.gps_lat] }, properties: { score: s.score } })) };
    const line: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: track.length > 1 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: track }, properties: {} }] : [] };

    const heatSrc = map.getSource("scores") as maplibregl.GeoJSONSource | undefined;
    if (heatSrc) heatSrc.setData(heat);
    else {
      map.addSource("scores", { type: "geojson", data: heat });
      map.addLayer({
        id: "scores-heat",
        type: "heatmap",
        source: "scores",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0.15, 1, 1],
          "heatmap-intensity": 1.2,
          "heatmap-radius": 52,
          "heatmap-opacity": 0.6,
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "rgba(167,139,250,0.35)", 0.45, "rgba(154,216,255,0.5)", 0.7, "rgba(255,181,71,0.6)", 1, "rgba(255,61,113,0.8)"],
        },
      });
    }
    const lineSrc = map.getSource("track") as maplibregl.GeoJSONSource | undefined;
    if (lineSrc) lineSrc.setData(line);
    else {
      map.addSource("track", { type: "geojson", data: line });
      map.addLayer({ id: "track-glow", type: "line", source: "track", paint: { "line-color": "#f472b6", "line-width": 9, "line-opacity": 0.18, "line-blur": 6 } });
      map.addLayer({ id: "track-line", type: "line", source: "track", paint: { "line-color": "#f472b6", "line-width": 2, "line-dasharray": [2, 1.5], "line-opacity": 0.9 } });
    }

    // evidence markers
    located.forEach((e) => {
      const meta = typeMeta(e.evidence_type);
      const el = document.createElement("div");
      el.className = "map-evidence";
      el.style.setProperty("--c", meta.color);
      el.innerHTML = `<span class="ring"></span><span class="pin"></span>`;
      el.title = e.description ?? e.original_filename ?? "evidence";
      const popup = new maplibregl.Popup({ offset: 16, closeButton: false, className: "map-popup" }).setHTML(
        `<div class="map-popup-body"><div class="k">${meta.label}</div><div class="t">${(e.description ?? e.original_filename ?? "").replace(/</g, "&lt;")}</div><div class="m">${e.captured_at ? new Date(e.captured_at).toLocaleString() : "time not stated"}</div></div>`
      );
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([Number(e.gps_lng), Number(e.gps_lat)]).setPopup(popup).addTo(map));
    });
    // scored cells
    scores.forEach((s) => {
      const el = document.createElement("div");
      el.className = "map-score";
      el.style.setProperty("--c", scoreColor(s.score));
      el.style.setProperty("--s", `${16 + s.score * 22}px`);
      el.innerHTML = `<span class="pulse"></span><span class="core">${Math.round(s.score * 100)}</span>`;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Scored location ${Math.round(s.score * 100)} percent`);
      el.addEventListener("click", () => setFocus(s.id));
      const popup = new maplibregl.Popup({ offset: 22, closeButton: false, className: "map-popup" }).setHTML(
        `<div class="map-popup-body"><div class="k" style="color:${scoreColor(s.score)}">${Math.round(s.score * 100)}% · ${scoreBand(s.score)}</div><div class="m">recency ${s.explanation.recency_weight} · reliability ${s.explanation.reliability_weight} · ${s.explanation.evidence_count} item(s)</div><div class="m i">${s.explanation.method}</div></div>`
      );
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([s.gps_lng, s.gps_lat]).setPopup(popup).addTo(map));
    });

    const pts = [...scores.map((s) => [s.gps_lng, s.gps_lat] as [number, number]), ...located.map((e) => [Number(e.gps_lng), Number(e.gps_lat)] as [number, number])];
    if (pts.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      pts.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, { padding: 90, maxZoom: 14.5, duration: 900 });
    }
  }, [scores, located, track, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const s = scores.find((x) => x.id === focus);
    if (!map || !s) return;
    map.flyTo({ center: [s.gps_lng, s.gps_lat], zoom: 15.5, duration: 900 });
  }, [focus, scores]);

  async function recompute() {
    if (!caseId) return;
    setComputing(true);
    setError(null);
    try {
      setScores(await locationApi.computeLocationScores(caseId));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Recompute failed.");
    } finally {
      setComputing(false);
    }
  }

  const ranked = useMemo(() => [...scores].sort((a, b) => b.score - a.score), [scores]);
  const evidenceAt = (s: LocationScore) => s.explanation.evidence_ids.map((id) => evidence.find((e) => e.id === id)).filter(Boolean) as Evidence[];
  const top = ranked[0];

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Geospatial · rule-based search priority"
        title="Predictive location"
        description={
          <>
            Every place the evidence records is drawn on a real map; movement evidence is joined into a track; each scored cell shows its own arithmetic. <span className="text-cot-amber">Heuristic score — not a trained model.</span>
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            {canCompute && (
              <Button size="sm" variant="primary" busy={computing} onClick={() => void recompute()} icon={<ForensicIcon name="map" size={13} />}>
                Recompute scores
              </Button>
            )}
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["movements"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Geo-tagged evidence" value={located.length} tone="violet" icon={<ForensicIcon name="evidence" size={16} />} hint={`of ${evidence.length} items carry coordinates`} />
        <StatTile label="Scored cells" value={scores.length} tone="ice" icon={<ForensicIcon name="map" size={16} />} hint="~110 m grid cells with evidence" />
        <StatTile label="Top priority" value={top ? Math.round(top.score * 100) : 0} suffix="%" tone={top ? (top.score >= 0.75 ? "red" : top.score >= 0.5 ? "amber" : "violet") : "violet"} icon={<ForensicIcon name="alert" size={16} />} hint={top ? `${top.gps_lat.toFixed(4)}, ${top.gps_lng.toFixed(4)}` : "No scores yet"} />
        <StatTile label="Movement track" value={track.length} tone="magenta" icon={<ForensicIcon name="timeline" size={16} />} hint="ANPR, tower and camera points in time order" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel padded={false} className="relative overflow-hidden">
          <div ref={mapEl} className="w-full" style={{ height: "64vh", minHeight: 460 }} />
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <span className="chip status-neutral"><i className="h-1.5 w-1.5 rounded-full bg-cot-violet" /> low</span>
            <span className="chip status-warn"><i className="h-1.5 w-1.5 rounded-full bg-cot-amber" /> medium</span>
            <span className="chip status-critical"><i className="h-1.5 w-1.5 rounded-full bg-cot-red" /> high</span>
            <span className="chip status-ai"><i className="h-0.5 w-3 bg-cot-magenta" /> movement track</span>
          </div>
          {loading && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-[rgba(7,6,15,.55)] backdrop-blur-sm">
              <ScanLoader label="Placing the evidence on the map…" rows={3} className="w-80" />
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel eyebrow="Search priority" title={ranked.length ? `${ranked.length} scored locations` : "No scored locations"} busy={computing}>
            {ranked.length === 0 ? (
              <p className="text-sm text-cot-text2">The surface is built from evidence that carries GPS coordinates. {canCompute ? "Recompute once geo-tagged evidence exists." : "Ask an officer of Sub-Inspector rank or above to recompute."}</p>
            ) : (
              <ol className="rise space-y-2">
                {ranked.map((s, i) => {
                  const items = evidenceAt(s);
                  const active = focus === s.id;
                  return (
                    <motion.li key={s.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                      <button type="button" onClick={() => setFocus(s.id)} className={`w-full rounded-xl border p-3 text-left ${active ? "border-cot-magenta/70 bg-cot-magenta/[.06]" : "border-[color:var(--cot-line)] bg-white/[.02] hover:border-[color:var(--cot-line-strong)]"}`}>
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[12px] font-bold text-[#140a2e]" style={{ background: scoreColor(s.score), boxShadow: `0 0 16px ${scoreColor(s.score)}88` }}>{Math.round(s.score * 100)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-white">{scoreBand(s.score)}</span>
                            <span className="block font-mono text-[11px] text-cot-text3">{s.gps_lat.toFixed(4)}, {s.gps_lng.toFixed(4)}</span>
                          </span>
                          <Chip tone="neutral" className="!px-1.5 !text-[7px]">{s.explanation.evidence_count} item{s.explanation.evidence_count === 1 ? "" : "s"}</Chip>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-cot-text3">
                          <span>recency <b className="text-cot-text">{Math.round(s.explanation.recency_weight * 100)}%</b><span className="ml-1 block h-1 rounded-full bg-white/[.06]"><span className="block h-full rounded-full bg-cot-ice" style={{ width: `${s.explanation.recency_weight * 100}%` }} /></span></span>
                          <span>reliability <b className="text-cot-text">{Math.round(s.explanation.reliability_weight * 100)}%</b><span className="ml-1 block h-1 rounded-full bg-white/[.06]"><span className="block h-full rounded-full bg-cot-mint" style={{ width: `${s.explanation.reliability_weight * 100}%` }} /></span></span>
                        </div>
                        {items.length > 0 && (
                          <ul className="mt-2 space-y-0.5 border-t border-white/[.06] pt-2 text-[12px] text-cot-text2">
                            {items.slice(0, 3).map((e) => (
                              <li key={e.id} className="flex items-center gap-1.5 truncate"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: typeMeta(e.evidence_type).color }} />{e.description ?? e.original_filename}</li>
                            ))}
                          </ul>
                        )}
                      </button>
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </Panel>
          {located.length === 0 && !loading && <EmptyState icon="map" title="No coordinates in this case yet" body="Log evidence with a GPS position or load stage 7 of the scenario." className="!py-6" />}
          <Panel eyebrow="Method" title="How a cell is scored" tone="ai">
            <p className="text-[12.5px] leading-relaxed text-cot-text2">score = 0.5 × recency (48-hour half-life on when the evidence arrived) + 0.5 × reliability (objective sources such as GPS, CCTV and tower records score 1.0; a verbal statement 0.7; two-officer confirmation lifts it). Every factor is stored with the cell and shown in its popup.</p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
