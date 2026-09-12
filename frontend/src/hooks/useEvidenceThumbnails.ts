import { useEffect, useState } from "react";

import * as evidenceApi from "@/services/evidenceApi";
import type { Evidence } from "@/types";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/**
 * Resolves short-lived download URLs for evidence that has an image file, so
 * the vault can show real thumbnails. Legal reviewers (and any role without
 * raw-evidence access) get a 403 from the download route — that is correct
 * behaviour, not an error, so those items simply fall back to an icon.
 */
export function useEvidenceThumbnails(evidence: Evidence[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const candidates = evidence.filter(
      (e) => e.storage_key && (e.evidence_type === "photo" || IMAGE_EXT.test(e.original_filename ?? "")) && !urls[e.id]
    );
    if (candidates.length === 0) return;

    Promise.all(
      candidates.map((e) =>
        evidenceApi
          .getDownloadUrl(e.id)
          .then((r) => [e.id, r.url] as const)
          .catch(() => null)
      )
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      pairs.forEach((p) => {
        if (p) next[p[0]] = p[1];
      });
      if (Object.keys(next).length) setUrls((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
    // urls intentionally excluded: we only want to fetch for newly-seen ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence]);

  return urls;
}
