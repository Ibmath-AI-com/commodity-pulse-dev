// src/lib/prediction/options.ts

export const COMMODITIES = [
  { value: "sulphur", label: "Sulphur" },
  { value: "ethylene", label: "Ethylene" },
  { value: "pygas", label: "Pygas" },
  { value: "naphtha", label: "Naphtha" },
  { value: "urea", label: "Urea" },
] as const;

export const BASES = [
  { value: "vancouver", label: "Vancouver" },
  { value: "middle-east", label: "Middle East" },
  { value: "iran", label: "Iran" },
  { value: "black-sea", label: "Black Sea" },
  { value: "baltic-sea", label: "Baltic Sea" },
  { value: "us-gulf", label: "US Gulf" },
  { value: "mediterranean", label: "Mediterranean" },
] as const;

export function normalizeCommodity(input: string) {
  const v = (input ?? "").trim().toLowerCase();
  const hit = COMMODITIES.find((c) => c.value === v || c.label.toLowerCase() === v);
  return hit ? hit.value : "sulphur";
}