import { useCallback, useEffect, useState } from "react";

import * as caseApi from "@/services/caseApi";
import type { Case } from "@/types";

const KEY = "cot:active-case";
const EVENT = "cot:active-case-change";

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function store(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode — selection lives in memory only */
  }
}

/**
 * The case the officer is currently working. One selection, shared by every
 * page (persisted per browser), so the demo case chosen on the Command
 * Center is the case shown on Timeline, Contradictions, Autopsy and so on.
 */
export function useActiveCase() {
  const [cases, setCases] = useState<Case[]>([]);
  const [caseId, setCaseIdState] = useState<string>(() => readStored() ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setCaseId = useCallback((id: string) => {
    setCaseIdState(id);
    store(id);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
  }, []);

  const refresh = useCallback(() => {
    return caseApi
      .listMyCases()
      .then((list) => {
        setCases(list);
        setError(null);
        const stored = readStored();
        // Default to the case that was opened first — for the demo that is the
        // Riverside file, not whichever related case sorts first by number.
        const oldest = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        const valid = stored && list.some((c) => c.id === stored) ? stored : (oldest?.id ?? "");
        setCaseIdState(valid);
        if (valid && valid !== stored) store(valid);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load cases. Is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = (e: Event) => setCaseIdState(String((e as CustomEvent).detail));
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const activeCase = cases.find((c) => c.id === caseId) ?? null;
  return { cases, caseId, setCaseId, activeCase, loading, error, refresh };
}
