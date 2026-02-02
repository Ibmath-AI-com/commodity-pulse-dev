// src/hooks/usePredictionSession.ts
"use client";

import { useEffect } from "react";
import type { SavedSession, Status, Result, N8nPayload, MultiItem } from "@/types/prediction";
import { safeJsonParse } from "@/lib/prediction/normalize";
import { makeStorageKey } from "@/lib/prediction/storage";

type Args = {
  commodity: string;
  basis: string[];
  futureDate: string;
  status: Status;
  justTab: "drivers" | "risk" | "evidence" | "cali";
  activeIdx: number;
  multi: MultiItem[];
  result: Result | null;
  bundle: N8nPayload | null;
  basePricesByBasis: Record<string, string>;
  maxCacheAgeMs: number;

  // setters
  setFutureDate: (v: string) => void;
  setError: (v: string | null) => void;
  setJustTab: (v: "drivers" | "risk" | "evidence" | "cali") => void;
  setBasePricesByBasis: (v: Record<string, string>) => void;
  setMulti: (v: MultiItem[]) => void;
  setActiveIdx: (v: number) => void;
  setBundle: (v: N8nPayload | null) => void;
  setResult: (v: Result | null) => void;
  setStatus: (v: Status) => void;
};

export function usePredictionSession(a: Args) {
  // RESTORE
  useEffect(() => {
    if (typeof window === "undefined") return;

    const key = makeStorageKey(a.commodity, a.basis);
    const cached = safeJsonParse<SavedSession>(window.localStorage.getItem(key));
    if (!cached?.savedAt) return;

    const ageMs = Date.now() - new Date(cached.savedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > a.maxCacheAgeMs) {
      window.localStorage.removeItem(key);
      return;
    }
    if (a.status === "loading") return;

    a.setFutureDate(cached.futureDate ?? "");
    a.setError(null);
    a.setJustTab(cached.justTab ?? "cali");
    a.setBasePricesByBasis(cached.basePricesByBasis ?? {});

    const restoredMulti = Array.isArray(cached.multi) ? cached.multi : [];
    const restoredIdx = typeof cached.activeIdx === "number" ? cached.activeIdx : 0;

    a.setMulti(restoredMulti as any);
    const clampedIdx = Math.max(0, Math.min(restoredIdx, Math.max(0, restoredMulti.length - 1)));
    a.setActiveIdx(clampedIdx);

    if (restoredMulti.length > 0) {
      const active = restoredMulti[clampedIdx] as any;
      a.setBundle(active?.bundle ?? null);
      a.setResult(active?.result ?? null);
      a.setStatus(active?.result ? "success" : "idle");
    } else {
      a.setBundle(cached.bundle ?? null);
      a.setResult(cached.result ?? null);
      a.setStatus(cached.result ? "success" : "idle");
    }
  }, [a.commodity, a.basis]); // keep same deps as your page

  // SAVE
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (a.status !== "success") return;
    if (!a.result && !a.bundle && a.multi.length === 0) return;

    const key = makeStorageKey(a.commodity, a.basis);
    const snapshot: SavedSession = {
      savedAt: new Date().toISOString(),
      commodity: a.commodity,
      basis: a.basis,
      futureDate: a.futureDate,
      status: a.status,
      justTab: a.justTab,
      activeIdx: a.activeIdx,
      multi: (a.multi ?? []).map((m) => ({
        basisKey: m.basisKey,
        basisLabel: m.basisLabel,
        bundle: m.bundle,
        result: m.result,
      })),
      result: a.result,
      bundle: a.bundle,
      basePricesByBasis: a.basePricesByBasis ?? {},
    };

    window.localStorage.setItem(key, JSON.stringify(snapshot));
  }, [
    a.status,
    a.commodity,
    a.basis,
    a.futureDate,
    a.justTab,
    a.activeIdx,
    a.multi,
    a.result,
    a.bundle,
    a.basePricesByBasis,
  ]);
}