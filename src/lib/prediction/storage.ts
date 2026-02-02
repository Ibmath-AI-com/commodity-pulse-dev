// src/lib/prediction/storage.ts

export const LS_COMMODITY = "ai_commodity_selected";
export const LS_BASIS = "ai_basis_selected";
export const LS_BASE_PRICE = "ai_base_price_selected";

export const STORAGE_PREFIX = "prediction:lastResult:v2:";

export function makeStorageKey(commodity: string, basisArr: string[]) {
  const basisKey = (basisArr ?? []).slice().sort().join("|").toLowerCase();
  return `${STORAGE_PREFIX}${commodity.toLowerCase()}::${basisKey}`;
}

export function clearPredictionStorage() {
  if (typeof window === "undefined") return;

  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;

      if (k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
      if (k.startsWith("print:")) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));

    window.localStorage.removeItem(LS_BASIS);
    window.localStorage.removeItem(LS_BASE_PRICE);
  } catch {
    // ignore
  }
}