import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DemoStrip } from "@/components/demo/DemoStrip";
import { ForceGraph, type GraphLinkInput, type GraphNodeInput } from "@/components/graph/ForceGraph";
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
import { ApiError } from "@/lib/apiClient";
import * as graphApi from "@/services/graphApi";
import type { CaseGraph, EntityType, RelationType } from "@/types";

const TYPE_COLORS: Record<EntityType, string> = {
  person: "#e9d5ff",
  officer: "#6ee7c7",
  doctor: "#6ee7c7",
  suspect: "#ff3d71",
  witness: "#c4b5fd",
  location: "#ffb547",
  event: "#f9a8d4",
  evidence: "#f9a8d4",
  document: "#7d739e",
  device: "#5fb8c8",
};

const LEGEND: Array<{ type: EntityType; label: string }> = [
  { type: "suspect", label: "Suspect" },
  { type: "witness", label: "Witness" },
  { type: "person", label: "Person" },
  { type: "officer", label: "Officer" },
  { type: "location", label: "Location" },
  { type: "evidence", label: "Evidence" },
  { type: "device", label: "Device" },
];

const RELATION_TONE: Record<RelationType, "ok" | "critical" | "ai" | "neutral" | "warn"> = {
  supports: "ok",
  contradicts: "critical",
  mentions: "ai",
  related_to: "neutral",
  located_at: "warn",
  derived_from: "neutral",
};

/**
 * Evidence graph — people, places, devices and exhibits, joined by what the
 * AI extracted and by shared GPS positions. Click a node to isolate its
 * neighbourhood; the panel on the right explains every connection.
 */
export function EvidenceGraphPage() {
  const { cases, caseId, setCaseId, activeCase } = useActiveCase();
  const [graph, setGraph] = useState<CaseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<EntityType | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (id: string, quiet = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setGraph(await graphApi.getCaseGraph(id));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not build the graph.");
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedId(null);
    void load(caseId);
  }, [caseId, load]);
  useCaseWebSocket(caseId || null, (event) => {
    if (event.type === "evidence.ai_processed") void load(caseId, true);
  });

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    graph?.relationships.forEach((r) => {
      m.set(r.from_entity_id, (m.get(r.from_entity_id) ?? 0) + 1);
      m.set(r.to_entity_id, (m.get(r.to_entity_id) ?? 0) + 1);
    });
    return m;
  }, [graph]);

  const nodes: GraphNodeInput[] = useMemo(
    () =>
      (graph?.entities ?? [])
        .filter((e) => !typeFilter || e.entity_type === typeFilter)
        .map((e) => ({
          id: e.id,
          name: e.name,
          group: e.entity_type,
          subtitle: String((e.attributes as Record<string, unknown> | null)?.role ?? e.entity_type).replace(/_/g, " "),
          color: TYPE_COLORS[e.entity_type] ?? "#7d739e",
        })),
    [graph, typeFilter]
  );
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const links: GraphLinkInput[] = useMemo(
    () => (graph?.relationships ?? []).filter((r) => nodeIds.has(r.from_entity_id) && nodeIds.has(r.to_entity_id)).map((r) => ({ id: r.id, source: r.from_entity_id, target: r.to_entity_id, label: r.relation_type })),
    [graph, nodeIds]
  );

  const selectedEntity = graph?.entities.find((e) => e.id === selectedId);
  const connected = graph?.relationships.filter((r) => r.from_entity_id === selectedId || r.to_entity_id === selectedId) ?? [];
  const nameOf = (id: string) => graph?.entities.find((e) => e.id === id)?.name ?? "unknown";
  const typeOf = (id: string) => graph?.entities.find((e) => e.id === id)?.entity_type ?? "person";
  const counts = useMemo(() => {
    const c: Partial<Record<EntityType, number>> = {};
    graph?.entities.forEach((e) => (c[e.entity_type] = (c[e.entity_type] ?? 0) + 1));
    return c;
  }, [graph]);
  const hubs = useMemo(() => [...(graph?.entities ?? [])].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, 6), [graph, degree]);
  const contradictions = graph?.relationships.filter((r) => r.relation_type === "contradicts").length ?? 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (graph?.entities ?? []).filter((e) => e.name.toLowerCase().includes(q)).slice(0, 6) : [];
  }, [query, graph]);

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Entities · who, where, what — and how they connect"
        title="Evidence graph"
        description={
          <>
            People, locations, devices and exhibits, joined by what the AI extracted and by shared positions. Click a node to isolate its neighbourhood; drag to untangle; the panel explains every edge.
            {activeCase && <span className="ml-1 font-mono text-[12px] text-cot-text3">{activeCase.case_number}</span>}
          </>
        }
        actions={
          <>
            <CaseSelect cases={cases} value={caseId} onChange={setCaseId} />
            <Button size="sm" variant="ghost" onClick={() => void load(caseId)} disabled={loading} icon={<ForensicIcon name="graph" size={13} />}>
              Rebuild
            </Button>
          </>
        }
      />

      {caseId && <DemoStrip caseId={caseId} onChanged={() => void load(caseId, true)} needs={["scene", "cctv", "witness"]} className="mb-5" />}

      {error && (
        <div role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </div>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatTile label="Entities" value={graph?.entities.length ?? 0} tone="violet" icon={<ForensicIcon name="graph" size={16} />} hint="Extracted from the evidence" />
        <StatTile label="Relationships" value={graph?.relationships.length ?? 0} tone="ice" icon={<ForensicIcon name="timeline" size={16} />} hint="Edges between them" />
        <StatTile label="People" value={(counts.person ?? 0) + (counts.suspect ?? 0) + (counts.witness ?? 0)} tone="magenta" icon={<ForensicIcon name="shield" size={16} />} hint={`${counts.suspect ?? 0} suspect · ${counts.witness ?? 0} witness`} />
        <StatTile label="Places" value={counts.location ?? 0} tone="amber" icon={<ForensicIcon name="map" size={16} />} hint="Named or geo-tagged" />
        <StatTile label="Conflicting edges" value={contradictions} tone={contradictions ? "red" : "mint"} icon={<ForensicIcon name="contradiction" size={16} />} hint="Relationships the evidence disputes" />
      </div>

      {loading ? (
        <ScanLoader label="Extracting entities and relationships…" rows={6} />
      ) : !graph || graph.entities.length === 0 ? (
        <EmptyState icon="graph" title="No entities extracted yet" body="Entities appear once evidence with readable text has been logged and the AI extraction has run. Load the first stages of the scenario from the demo strip." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[.06] px-3 py-2">
              <label className="relative flex min-w-[200px] items-center">
                <ForensicIcon name="search" size={14} className="pointer-events-none absolute left-3 text-cot-text3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an entity…" className="w-full !pl-9 !py-1.5 !text-[13px]" aria-label="Find entity" />
                {matches.length > 0 && (
                  <ul className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-[color:var(--cot-line-strong)] bg-[#120d26] p-1 shadow-glow">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => { setSelectedId(m.id); setQuery(""); }} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] text-cot-text hover:bg-white/[.05] !overflow-visible">
                          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[m.entity_type] }} />
                          {m.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {LEGEND.map((l) => (
                  <button key={l.type} type="button" onClick={() => setTypeFilter((t) => (t === l.type ? null : l.type))} className={`chip !overflow-visible ${typeFilter === l.type ? "status-ai" : "status-neutral"}`} style={typeFilter === l.type ? undefined : { color: TYPE_COLORS[l.type] }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLORS[l.type] }} />
                    {l.label} {counts[l.type] ? <span className="opacity-70">{counts[l.type]}</span> : null}
                  </button>
                ))}
                {typeFilter && (
                  <button type="button" onClick={() => setTypeFilter(null)} className="text-[11px] text-cot-text3 underline decoration-dotted hover:text-white !overflow-visible">
                    all
                  </button>
                )}
              </div>
            </div>
            <ForceGraph nodes={nodes} links={links} selectedId={selectedId} onSelect={setSelectedId} height={620} />
          </Panel>

          <div className="space-y-4">
            {selectedEntity ? (
              <Panel eyebrow={selectedEntity.entity_type.replace(/_/g, " ")} title={selectedEntity.name} tone={selectedEntity.entity_type === "suspect" ? "crit" : "ai"} actions={<Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>Clear</Button>}>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Chip tone="neutral">{connected.length} connection{connected.length === 1 ? "" : "s"}</Chip>
                  {selectedEntity.attributes && Object.entries(selectedEntity.attributes as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                    <Chip key={k} tone="neutral" className="!normal-case !tracking-normal !font-[Rajdhani] !text-[11px]">{k}: {String(v)}</Chip>
                  ))}
                </div>
                <ul className="space-y-1.5">
                  {connected.map((r) => {
                    const otherId = r.from_entity_id === selectedId ? r.to_entity_id : r.from_entity_id;
                    return (
                      <li key={r.id} className="rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Chip tone={RELATION_TONE[r.relation_type]} className="!px-1.5 !text-[7.5px]">{r.relation_type.replace(/_/g, " ")}</Chip>
                          <span className="font-mono text-[10px] text-cot-text3">{r.from_entity_id === selectedId ? "→" : "←"}</span>
                        </div>
                        <button type="button" onClick={() => setSelectedId(otherId)} className="mt-1 flex items-center gap-2 text-left text-[13.5px] text-cot-text hover:text-white !overflow-visible">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[typeOf(otherId)] }} />
                          {nameOf(otherId)}
                        </button>
                      </li>
                    );
                  })}
                  {connected.length === 0 && <li className="text-[12.5px] text-cot-text3">No connections recorded.</li>}
                </ul>
                {selectedEntity.entity_type === "suspect" && (
                  <Link to="/case-similarity" className="mt-3 inline-block text-[12px] text-cot-violet hover:text-white">
                    Has this name appeared in another case? →
                  </Link>
                )}
              </Panel>
            ) : (
              <Panel eyebrow="Most connected" title="Hubs of the case">
                <ol className="space-y-1.5">
                  {hubs.map((h, i) => (
                    <li key={h.id}>
                      <button type="button" onClick={() => setSelectedId(h.id)} className="flex w-full items-center gap-3 rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] px-3 py-2 text-left hover:border-[color:var(--cot-line-strong)] !overflow-visible">
                        <span className="font-mono text-[11px] text-cot-text3">{String(i + 1).padStart(2, "0")}</span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[h.entity_type] }} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-white">{h.name}</span>
                        <span className="font-mono text-[11px] text-cot-text3">{degree.get(h.id) ?? 0}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[12px] text-cot-text3">Click a node in the graph or a hub here to see every relationship it has and where it came from.</p>
              </Panel>
            )}
            <Panel eyebrow="Reading the graph" title="Edges are claims, not facts" tone="ai">
              <ul className="space-y-1.5 text-[12.5px] text-cot-text2">
                <li><Chip tone="ok" className="mr-2 !px-1.5 !text-[7.5px]">supports</Chip>two sources agree</li>
                <li><Chip tone="critical" className="mr-2 !px-1.5 !text-[7.5px]">contradicts</Chip>the sources disagree — see Contradictions</li>
                <li><Chip tone="ai" className="mr-2 !px-1.5 !text-[7.5px]">mentions</Chip>named in an item's text</li>
                <li><Chip tone="warn" className="mr-2 !px-1.5 !text-[7.5px]">located at</Chip>shares a position with</li>
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}
