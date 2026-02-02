// src/hooks/usePredictionInputs.ts
"use client";

import { useEffect } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";

import { LS_COMMODITY, LS_BASIS, LS_BASE_PRICE } from "@/lib/prediction/storage";
import { normalizeCommodity } from "@/lib/prediction/options";
import { toNumberLoose, safeJsonParse } from "@/lib/prediction/normalize";

type Args = {
  searchParams: ReadonlyURLSearchParams;

  // current state values (needed for dependencies / initial fill)
  basis: string[];
  basePricesByBasis: Record<string, string>;

  // setters from the page
  setCommodity: (v: string) => void;
  setBasis: (v: string[]) => void;
  setBasePricesByBasis: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
};

export function usePredictionInputs(a: Args) {
  // 1) commodity: URL or localStorage -> state, then persist
  useEffect(() => {
    const fromUrl = a.searchParams.get("commodity");
    const fromLs = typeof window !== "undefined" ? window.localStorage.getItem(LS_COMMODITY) : null;

    const picked = (fromUrl ?? fromLs ?? "sulphur").trim();
    const normalized = normalizeCommodity(picked);

    a.setCommodity(normalized);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_COMMODITY, normalized.toLowerCase());
      window.dispatchEvent(new Event("ai:commodity"));
    }
  }, [a.searchParams, a.setCommodity]);

  // 2) basis: load once
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_BASIS) : null;
    if (!raw) return;

    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) a.setBasis(arr.map((x) => String(x)));
    } catch {
      a.setBasis([raw]);
    }
  }, [a.setBasis]);

  // 3) basis: persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_BASIS, JSON.stringify(a.basis));
  }, [a.basis]);

  // 4) base prices: load once
  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(LS_BASE_PRICE);
    const maybeNum = toNumberLoose(raw ?? "");
    const parsed = safeJsonParse<Record<string, string>>(raw);

    if (parsed && typeof parsed === "object") {
      a.setBasePricesByBasis(parsed);
      return;
    }

    // backward compat: single number stored, apply to first basis
    if (maybeNum != null) {
      a.setBasePricesByBasis((prev) => {
        const first = (a.basis ?? [])[0];
        if (!first) return prev ?? {};
        return { ...(prev ?? {}), [first]: String(maybeNum) };
      });
    }

    // NOTE: basis is intentionally NOT a dependency to avoid re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.setBasePricesByBasis]);

  // 5) base prices: persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_BASE_PRICE, JSON.stringify(a.basePricesByBasis ?? {}));
  }, [a.basePricesByBasis]);
}