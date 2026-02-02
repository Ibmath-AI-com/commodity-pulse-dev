export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatUnit(unit: string) {
  const u = String(unit ?? "").trim();
  if (!u) return "";
  if (u.toLowerCase().includes("/t")) return `${u} • per ton`;
  return u;
}


  export function marketBias(score: number | null) {
    if (score == null) return { label: "Neutral", color: "orange" as const };
    if (score >= 0.2) return { label: "Bullish", color: "green" as const };
    if (score <= -0.2) return { label: "Bearish", color: "red" as const };
    return { label: "Neutral", color: "orange" as const };
  }