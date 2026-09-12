import type { StyleSpecification } from "maplibre-gl";

/**
 * Real-world basemap, key-free.
 *
 * OpenStreetMap's standard tiles are LIGHT. They are toned down here with
 * MapLibre's raster paint properties rather than a CSS filter, because the
 * basemap and the evidence heatmap share one canvas and a CSS invert would
 * recolour the evidence overlay too.
 *
 * Tuning note: an earlier setting (brightness-max 0.16) matched the app's
 * near-black surface but made place names unreadable. Legible labels matter
 * more than a perfect tonal match — a map you cannot read is not a map. The
 * values below keep streets and names clearly readable while staying dark
 * enough that cyan/amber/red markers and the heat layer stand out.
 *
 * ATTRIBUTION IS MANDATORY under ODbL — do not remove it from the source.
 * OSM's tile policy covers low-volume/development use; for a deployed service
 * switch `tiles` to a keyed provider (MapTiler, Stadia, Thunderforest).
 */
export const DARK_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0e0b1f" } },
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm",
      paint: {
        "raster-saturation": -0.55,
        "raster-hue-rotate": 230,
        "raster-brightness-min": 0.06,
        "raster-brightness-max": 0.46,
        "raster-contrast": 0.22,
        // Blends the plate toward the violet surface without losing legibility.
        "raster-opacity": 0.9,
      },
    },
  ],
};

/** Light variant for printing or bright rooms — same source, untouched tiles. */
export const LIGHT_BASEMAP_STYLE: StyleSpecification = {
  ...DARK_BASEMAP_STYLE,
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e8e6e1" } },
    { id: "osm-tiles", type: "raster", source: "osm", paint: { "raster-opacity": 1 } },
  ],
};

/** Chennai waterfront — the demo case's setting. */
export const DEFAULT_MAP_CENTER: [number, number] = [80.272, 13.04];
export const DEFAULT_MAP_ZOOM = 13;
