import { AnatomyViewer, REGION_LABELS, type AnatomyHotspot, type AnatomyLayer, type BodyRegion } from "@/components/anatomy/AnatomyViewer";

export type { BodyRegion } from "@/components/anatomy/AnatomyViewer";
export { REGION_LABELS };

export interface Hotspot extends AnatomyHotspot {
  /** Retained for callers written against the old three.js figure; ignored. */
  position?: [number, number, number];
}

export interface ForensicBody3DProps {
  selectedRegion?: BodyRegion | null;
  findings?: Set<string>;
  hotspots?: Hotspot[];
  onSelectRegion?: (region: BodyRegion) => void;
  autoRotate?: boolean;
  compact?: boolean;
  layer?: AnatomyLayer;
  onLayerChange?: (layer: AnatomyLayer) => void;
  scanOnLoad?: boolean;
  className?: string;
}

/**
 * The forensic figure.
 *
 * Renders the owner's anatomical reference imagery (bones + organs / bones /
 * organs) with holographic treatment, severity markers, leader-line callouts
 * and the AI "reading → extracting → mapping" sequence. The component name is
 * kept so every page that used the earlier three.js figure keeps working.
 */
export function ForensicBody3D({ hotspots = [], className = "", ...rest }: ForensicBody3DProps) {
  return <AnatomyViewer hotspots={hotspots} className={className} {...rest} />;
}
