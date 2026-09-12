import * as d3 from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export interface GraphNodeInput {
  id: string;
  name: string;
  group: string;
  color: string;
  /** Optional secondary line (type, role, timestamp). */
  subtitle?: string;
}

export interface GraphLinkInput {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface SimNode extends d3.SimulationNodeDatum, GraphNodeInput {
  degree: number;
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  label: string;
}

interface Props {
  nodes: GraphNodeInput[];
  links: GraphLinkInput[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  height?: number;
}

/** Glyph per entity group, drawn as a small SVG path inside the node card. */
const GLYPHS: Record<string, string> = {
  suspect: "M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Zm-7 18a7 7 0 0 1 14 0v1H5v-1Z",
  witness: "M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7Zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  person: "M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Zm-7 18a7 7 0 0 1 14 0v1H5v-1Z",
  officer: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z",
  doctor: "M11 3h2v6h6v2h-6v6h-2v-6H5V9h6V3Z",
  location: "M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  event: "M4 5h16v4H4V5Zm0 6h16v8H4v-8Z",
  evidence: "M6 2h8l4 4v16H6V2Zm7 1.5V7h3.5L13 3.5Z",
  document: "M6 2h8l4 4v16H6V2Zm2 9h8v2H8v-2Zm0 4h8v2H8v-2Z",
  device: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 17a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
};

const CARD_W = 168;
const CARD_H = 44;

function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  // Gentle curve so parallel/overlapping edges separate visually.
  const dx = tx - sx;
  const dy = ty - sy;
  const mx = sx + dx / 2 - dy * 0.12;
  const my = sy + dy / 2 + dx * 0.12;
  return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
}

/**
 * Interactive force-directed entity graph.
 *
 * Nodes are cards (glyph, name, type) rather than dots, edges are curved and
 * labelled with the relation, and a focused node dims everything outside its
 * neighbourhood. The simulation runs live so nodes can be dragged apart; DOM
 * updates happen inside the tick handler rather than through React state.
 */
export function ForceGraph({ nodes, links, selectedId, onSelect, height = 560 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const linkEls = useRef<Map<string, SVGPathElement>>(new Map());
  const labelEls = useRef<Map<string, SVGTextElement>>(new Map());
  const prefersReducedMotion = usePrefersReducedMotion();

  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 900, height });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const { simNodes, simLinks } = useMemo(() => {
    const degree = new Map<string, number>();
    links.forEach((l) => {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    });
    return {
      simNodes: nodes.map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 })) as SimNode[],
      simLinks: links.map((l) => ({ ...l })) as unknown as SimLink[],
    };
  }, [nodes, links]);

  const focusId = hovered ?? selectedId;
  const neighbourIds = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    links.forEach((l) => {
      if (l.source === focusId) set.add(l.target);
      if (l.target === focusId) set.add(l.source);
    });
    return set;
  }, [focusId, links]);

  useEffect(() => {
    if (simNodes.length === 0) return;
    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(210).strength(0.35))
      .force("charge", d3.forceManyBody<SimNode>().strength((d) => -520 - d.degree * 60))
      .force("center", d3.forceCenter(size.width / 2, size.height / 2))
      .force("collide", d3.forceCollide<SimNode>().radius(CARD_W / 2 + 18))
      .force("x", d3.forceX(size.width / 2).strength(0.04))
      .force("y", d3.forceY(size.height / 2).strength(0.06));

    const paint = () => {
      simLinks.forEach((link) => {
        const s = link.source as SimNode;
        const t = link.target as SimNode;
        if (s?.x == null || t?.x == null) return;
        const el = linkEls.current.get(link.id);
        if (el) el.setAttribute("d", edgePath(s.x, s.y!, t.x, t.y!));
        const lab = labelEls.current.get(link.id);
        if (lab) {
          lab.setAttribute("x", String((s.x + t.x) / 2 - (t.y! - s.y!) * 0.06));
          lab.setAttribute("y", String((s.y! + t.y!) / 2 + (t.x - s.x) * 0.06));
        }
      });
      simNodes.forEach((node) => {
        const el = nodeEls.current.get(node.id);
        if (el && node.x != null) el.setAttribute("transform", `translate(${node.x},${node.y})`);
      });
    };
    sim.on("tick", paint);
    if (prefersReducedMotion) {
      sim.tick(260);
      sim.stop();
      paint();
    }
    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [simNodes, simLinks, size.width, size.height, prefersReducedMotion]);

  function startDrag(event: React.PointerEvent, node: SimNode) {
    event.stopPropagation();
    simRef.current?.alphaTarget(0.25).restart();
    const move = (e: PointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      node.fx = (e.clientX - rect.left - transform.x) / transform.k;
      node.fy = (e.clientY - rect.top - transform.y) / transform.k;
    };
    const up = () => {
      simRef.current?.alphaTarget(0);
      node.fx = null;
      node.fy = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startPan(event: React.PointerEvent) {
    const origin = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    const move = (e: PointerEvent) =>
      setTransform((t) => ({ ...t, x: origin.tx + (e.clientX - origin.x), y: origin.ty + (e.clientY - origin.y) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleWheel(event: React.WheelEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    setTransform((t) => {
      const k = Math.min(2.6, Math.max(0.3, t.k * (event.deltaY < 0 ? 1.1 : 0.9)));
      return { k, x: mx - ((mx - t.x) / t.k) * k, y: my - ((my - t.y) / t.k) * k };
    });
  }

  const dimmed = (id: string) => !!neighbourIds && !neighbourIds.has(id);

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        onPointerDown={startPan}
        onWheel={handleWheel}
        onClick={() => onSelect(null)}
        className="touch-none select-none"
        role="img"
        aria-label={`Entity graph with ${nodes.length} entities and ${links.length} relationships`}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#a78bfa" opacity="0.7" />
          </marker>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(132,147,150,.16)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {simLinks.map((link) => {
            const sId = typeof link.source === "string" ? link.source : (link.source as SimNode).id;
            const tId = typeof link.target === "string" ? link.target : (link.target as SimNode).id;
            const active = !neighbourIds || (neighbourIds.has(sId) && neighbourIds.has(tId));
            const isConflict = /contradict/i.test(link.label);
            const stroke = isConflict ? "#ff3d71" : "#a78bfa";
            return (
              <g key={link.id} opacity={active ? 1 : 0.12} style={{ transition: "opacity .18s" }}>
                <path
                  ref={(el) => (el ? linkEls.current.set(link.id, el) : linkEls.current.delete(link.id))}
                  fill="none"
                  stroke={stroke}
                  strokeOpacity={isConflict ? 0.7 : 0.38}
                  strokeWidth={isConflict ? 2 : 1.4}
                  strokeDasharray={isConflict ? "6 4" : undefined}
                  markerEnd="url(#arrow)"
                />
                <text
                  ref={(el) => (el ? labelEls.current.set(link.id, el) : labelEls.current.delete(link.id))}
                  opacity={neighbourIds && active ? 1 : 0}
                  fontSize={9.5}
                  fontFamily="JetBrains Mono, monospace"
                  fill={isConflict ? "#ff8fb0" : "#c4b5fd"}
                  textAnchor="middle"
                  letterSpacing="0.08em"
                  style={{ textTransform: "uppercase" }}
                  pointerEvents="none"
                >
                  {link.label.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}

          {simNodes.map((node) => {
            const isSelected = node.id === selectedId;
            const glyph = GLYPHS[node.group] ?? GLYPHS.document;
            return (
              <g
                key={node.id}
                ref={(el) => (el ? nodeEls.current.set(node.id, el) : nodeEls.current.delete(node.id))}
                opacity={dimmed(node.id) ? 0.18 : 1}
                style={{ cursor: "grab", transition: "opacity .18s" }}
                onPointerDown={(e) => startDrag(e, node)}
                onPointerEnter={() => setHovered(node.id)}
                onPointerLeave={() => setHovered(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSelected ? null : node.id);
                }}
              >
                {isSelected && (
                  <rect
                    x={-CARD_W / 2 - 5}
                    y={-CARD_H / 2 - 5}
                    width={CARD_W + 10}
                    height={CARD_H + 10}
                    rx={10}
                    fill="none"
                    stroke={node.color}
                    strokeWidth={1.5}
                    filter="url(#glow)"
                  />
                )}
                <rect
                  x={-CARD_W / 2}
                  y={-CARD_H / 2}
                  width={CARD_W}
                  height={CARD_H}
                  rx={8}
                  fill="rgba(11,14,20,.94)"
                  stroke={node.color}
                  strokeOpacity={0.55}
                  strokeWidth={1}
                />
                {/* colour stripe on the left edge — the design system's status stripe */}
                <rect x={-CARD_W / 2} y={-CARD_H / 2 + 6} width={3} height={CARD_H - 12} rx={1.5} fill={node.color} />
                <circle cx={-CARD_W / 2 + 24} cy={0} r={13} fill={node.color} fillOpacity={0.14} stroke={node.color} strokeOpacity={0.5} />
                <path
                  d={glyph}
                  transform={`translate(${-CARD_W / 2 + 24 - 8}, -8) scale(0.66)`}
                  fill={node.color}
                />
                <text x={-CARD_W / 2 + 46} y={-3} fontSize={12} fontWeight={600} fill="#e1e2ea" fontFamily="Inter, sans-serif">
                  {node.name.length > 17 ? `${node.name.slice(0, 17)}…` : node.name}
                </text>
                <text
                  x={-CARD_W / 2 + 46}
                  y={11}
                  fontSize={9}
                  fill="#8a9aa0"
                  fontFamily="JetBrains Mono, monospace"
                  letterSpacing="0.1em"
                  style={{ textTransform: "uppercase" }}
                >
                  {(node.subtitle ?? node.group).slice(0, 22)}
                </text>
                {node.degree > 2 && (
                  <g transform={`translate(${CARD_W / 2 - 14}, ${-CARD_H / 2 + 12})`}>
                    <circle r={8} fill={node.color} fillOpacity={0.9} />
                    <text y={3} fontSize={9} textAnchor="middle" fill="#05070a" fontWeight={700}>
                      {node.degree}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[9px] uppercase tracking-widest text-cot-text4">
        Drag nodes · drag background to pan · scroll to zoom
      </div>
      {(transform.k !== 1 || transform.x !== 0 || transform.y !== 0) && (
        <button
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          className="label-caps absolute right-3 top-3 rounded border border-white/10 bg-cot-bg/70 px-2 py-1 text-cot-text2 backdrop-blur hover:text-cot-text"
        >
          Reset view
        </button>
      )}
    </div>
  );
}
