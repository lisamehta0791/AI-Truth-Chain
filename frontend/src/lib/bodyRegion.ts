import type { BodyRegion } from "@/components/anatomy/AnatomyViewer";

/**
 * Maps the free-text body region the AI writes ("right_parietal_head",
 * "left_thigh", "anterior chest wall") onto the seven regions the figure can
 * mark. Returns null when nothing anatomical is named (e.g. a tool-mark
 * finding about a door), which is correct — that finding has no place on a
 * body and should not be pinned to one.
 */
export function toBodyRegion(raw: string | null | undefined): BodyRegion | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const left = /\bleft\b|\bl\b|left_/.test(s);
  const right = /\bright\b|\br\b|right_/.test(s);

  if (/head|skull|cranial|parietal|temporal|occipital|frontal|scalp|face|jaw|neck|cervical/.test(s)) return "head";
  if (/thigh|femur|femoral|knee|leg|shin|tibia|calf|ankle|foot|feet|toe/.test(s)) {
    return right && !left ? "right_leg" : "left_leg";
  }
  if (/arm|forearm|elbow|wrist|hand|finger|shoulder|humer|radius|ulna/.test(s)) {
    return right && !left ? "right_arm" : "left_arm";
  }
  if (/chest|thora|rib|sternum|lung|heart|cardiac|breast/.test(s)) return "chest";
  if (/abdom|pelvi|stomach|liver|spleen|kidney|bowel|groin|hip|lumbar|back/.test(s)) return "abdomen";
  return null;
}
