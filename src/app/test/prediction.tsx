// FILE: src/app/prediction/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";

import {
  Sparkles,
  Trophy,
  Search,
  Target,
  MoreHorizontal,
  XCircle,
  Info,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Printer,
} from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

type Result = {
  tenderPredictedPrice: number;
  currency: string;
  riskLevel: "Low" | "Medium" | "High";
  notes: string[];
  justification: Array<{
    factor: string;
    impact: "Up" | "Down" | "Risk";
    confidence: "High" | "Medium" | "Low";
    comment: string;
  }>;
};

type NewsEvent = {
  headline?: string;
  impact_direction?: string;
  importance_score?: number;
  event_type?: string;
  event_date?: string;
  regions?: string[];
  evidence_summary?: string;
};

type ShortTermSentiment = {
  category?: "Positive" | "Neutral" | "Negative" | string;
  score?: number;
  rationale?: string;
};

type NewsBundle = {
  shortTermSentiment?: ShortTermSentiment | null;
  events?: NewsEvent[];
};

type CaliBidRow = {
  caliBidRangeFob: string;
  chanceToWin: string;
  marginRiskDec: string;
  assessment: string;
  implication: string;
  expectedSellingPrice: string;
  spotPricesText: string;
  marginPerTon: string;
  supportingNews?: NewsEvent[];
};

type TenderOut = {
  tenderAction: "BUY BID" | "SELL OFFER" | "PASS" | string;
  tenderPredictedPrice: number | null;
  unit: string;
  confidence: "High" | "Medium" | "Low" | string;
  rationale: string;
  signals?: {
    trend?: string;
    sentimentScore?: number;
  };
};

type N8nPayload = {
  ok?: boolean;
  commodity?: string;
  basis?: string;
  asof_date?: string;
  expectedSellingPrice?: string;
  spotPricesText?: string;
  notes?: string[];
  tender?: TenderOut;
  caliBidTable?: CaliBidRow[];
  news?: NewsBundle;
  evidence?: NewsEvent[];
};

type ApiMultiResponse = {
  ok: true;
  commodity?: string;
  futureDate?: string;
  results: Array<{
    basisKey: string;
    basisLabel: string;
    data: any;
  }>;
};

type MultiItem = {
  basisKey: string;
  basisLabel: string;
  bundle: N8nPayload;
  result: Result;
};


function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const LS_COMMODITY = "ai_commodity_selected";
const LS_BASIS = "ai_basis_selected";
const LS_BASE_PRICE = "ai_base_price_selected";

function formatUnit(unit: string) {
  const u = String(unit ?? "").trim();
  if (!u) return "";
  if (u.toLowerCase().includes("/t")) return `${u} • per ton`;
  return u;
}


function RiskPill({ v }: { v: "Low" | "Medium" | "High" | "--" }) {
  const cls =
    v === "Low"
      ? "badge-green"
      : v === "Medium"
      ? "badge-amber"
      : v === "High"
      ? "badge-rose"
      : "bg-slate-500/10 text-slate-700 ring-1 ring-slate-200";
  return (
    <span className={cx("badge", cls)}>
      {v}
    </span>
  );
}

function IconTag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M4 10.5V5.5A1.5 1.5 0 0 1 5.5 4h5L20 13.5 13.5 20 4 10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.2 8.2h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpark({ className }: { className?: string }) {
  return (
    <svg className={cx("h-5 w-5", className)} viewBox="0 0 24 24" fill="none">
      <path
        d="M13 2 3 14h7l-1 8 12-14h-7l-1-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M12 22s8-3.5 8-10.5V6l-8-3-8 3v5.5C4 18.5 12 22 12 22Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 12.5l2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFileText({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3v3h3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 12h8M8 16h8M8 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconTable({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 10h16M8 4v18M16 4v18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function badgeForAssessment(a: string) {
  const v = (a || "").toLowerCase();
  if (v.includes("acceptable") || v.includes("optimal")) return { Icon: Target, cls: "badge-green", label: a };
  if (v.includes("attractive")) return { Icon: Target, cls: "badge-amber", label: a };
  if (v.includes("recommended")) return { Icon: AlertTriangle, cls: "badge-amber", label: a };
  if (v.includes("avoid") || v.includes("risky")) return { Icon: AlertTriangle, cls: "badge-rose", label: a };
  return { Icon: Sparkles, cls: "badge-indigo", label: a || "—" };
}

function badgeForConfidence(c: string) {
  const v = (c || "").toLowerCase();
  if (v.includes("high")) return { Icon: ShieldCheck, cls: "badge-green", label: c || "—" };
  if (v.includes("low")) return { Icon: AlertTriangle, cls: "badge-rose", label: c || "—" };
  return { Icon: ShieldAlert, cls: "badge-amber", label: c || "—" };
}

function badgeForImpact(v: "Up" | "Down" | "Risk") {
  if (v === "Up") return { Icon: TrendingUp, cls: "badge-green", label: "Up" };
  if (v === "Down") return { Icon: TrendingDown, cls: "badge-rose", label: "Down" };
  return { Icon: AlertTriangle, cls: "badge-amber", label: "Risk" };
}

function marginTone(text: string) {
  const t = (text || "").trim();
  if (t.includes("-")) return { Icon: TrendingDown, cls: "text-rose-700", value: t };
  if (t.includes("+")) return { Icon: TrendingUp, cls: "text-emerald-700", value: t };
  return { Icon: TrendingUp, cls: "text-slate-700", value: t || "—" };
}

// ---- Options ----
const COMMODITIES = [
  { value: "sulphur", label: "Sulphur" },
  { value: "ethylene", label: "Ethylene" },
  { value: "pygas", label: "Pygas" },
  { value: "naphtha", label: "Naphtha" },
  { value: "urea", label: "Urea" },
];

const BASES = [
  { value: "vancouver", label: "Vancouver" },
  { value: "middle-east", label: "Middle East" },
  { value: "iran", label: "Iran" },
  { value: "black-sea", label: "Black Sea" },
  { value: "baltic-sea", label: "Baltic Sea" },
  { value: "us-gulf", label: "US Gulf" },
  { value: "mediterranean", label: "Mediterranean" },
];

function normalizeCommodity(input: string) {
  const v = (input ?? "").trim().toLowerCase();
  const hit = COMMODITIES.find((c) => c.value === v || c.label.toLowerCase() === v);
  return hit ? hit.value : "sulphur";
}

export default function PredictionPage() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const [commodity, setCommodity] = useState<string>("sulphur");
  const [futureDate, setFutureDate] = useState<string>("");

  const [basis, setBasis] = useState<string[]>(["middle-east"]);

  const [basePricesByBasis, setBasePricesByBasis] = useState<Record<string, string>>({});

  const [result, setResult] = useState<Result | null>(null);
  const [bundle, setBundle] = useState<N8nPayload | null>(null);

  const [multi, setMulti] = useState<MultiItem[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);

  const [justTab, setJustTab] = useState<"drivers" | "risk" | "evidence" | "cali">("drivers");

  const STORAGE_PREFIX = "prediction:lastResult:v2:";
  const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

  const MAX_BASIS = 2;

  const [evOpen, setEvOpen] = useState(false);
  const [evTitle, setEvTitle] = useState<string>("");
  const [evItems, setEvItems] = useState<NewsEvent[]>([]);

  function openEvidence(rangeLabel: string, items: NewsEvent[]) {
    setEvTitle(rangeLabel);
    setEvItems(Array.isArray(items) ? items : []);
    setEvOpen(true);
  }
  function closeEvidence() {
    setEvOpen(false);
    setEvTitle("");
    setEvItems([]);
  }

  function dirPill(dir?: string) {
    const d = String(dir ?? "").toLowerCase();
    if (d === "bullish") return "badge-green";
    if (d === "bearish") return "badge-rose";
    return "bg-slate-500/10 text-slate-700 ring-1 ring-slate-200";
  }

  function toggleBasis(v: string) {
    setBasis((prev) => {
      const has = prev.includes(v);
      if (has) return prev.filter((x) => x !== v);
      if (prev.length >= MAX_BASIS) return prev;
      return [...prev, v];
    });
  }

  function clearPredictionStorage() {
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

  function resetPredictionScreenState() {
    setStatus("idle");
    setError(null);
    setResult(null);
    setBundle(null);
    setMulti([]);
    setActiveIdx(0);

    setJustTab("drivers");

    setFutureDate("");
    setBasis(["middle-east"]);
    setBasePricesByBasis({});

    setEvOpen(false);
    setEvTitle("");
    setEvItems([]);
  }

  function handleCommodityChange(nextRaw: string) {
    const next = normalizeCommodity(nextRaw);
    if (next === commodity) return;

    clearPredictionStorage();
    resetPredictionScreenState();

    setCommodity(next);
    try {
      window.localStorage.setItem(LS_COMMODITY, next.toLowerCase());
      window.dispatchEvent(new Event("ai:commodity"));
    } catch {
      // ignore
    }
  }


  type SavedSession = {
    savedAt: string;
    commodity: string;
    basis: string[];
    futureDate: string;
    status: Status;
    justTab: "drivers" | "risk" | "evidence" | "cali";
    activeIdx: number;
    multi: Array<{
      basisKey: string;
      basisLabel: string;
      bundle: N8nPayload;
      result: Result;
    }>;
    result: Result | null;
    bundle: N8nPayload | null;
    basePricesByBasis: Record<string, string>;
  };

  function parseMaybeJsonString(v: unknown) {
    if (typeof v !== "string") return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  function toNumberLoose(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const m = v.match(/-?\d+(\.\d+)?/);
      if (!m) return null;
      const n = Number(m[0]);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  function normalizeN8nPayload(raw: any): N8nPayload {
    let p: any = Array.isArray(raw) ? raw[0] : raw;

    if (p && typeof p.output === "string") {
      const parsed = parseMaybeJsonString(p.output);
      if (parsed) p = parsed;
    }

    if (p && typeof p.output === "object" && p.output) {
      const o = p.output as any;
      if (o.tender || o.caliBidTable || o.tenderPredictedPrice || o.tenderAction) p = o;
    }

    if (!p?.tender && (p?.tenderAction || p?.tenderPredictedPrice != null || p?.unit)) {
      p = {
        ...p,
        tender: {
          tenderAction: p.tenderAction ?? "PASS",
          tenderPredictedPrice: p.tenderPredictedPrice ?? null,
          unit: p.unit ?? "USD/t",
          confidence: p.confidence ?? "Medium",
          rationale: p.rationale ?? "",
          signals: p.signals ?? undefined,
        },
      };
    }

    return p as N8nPayload;
  }

  function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  function makeStorageKey(commodity: string, basisArr: string[]) {
    const basisKey = (basisArr ?? []).slice().sort().join("|").toLowerCase();
    return `${STORAGE_PREFIX}${commodity.toLowerCase()}::${basisKey}`;
  }

  function isApiMultiResponse(x: any): x is ApiMultiResponse {
    return !!x && typeof x === "object" && Array.isArray(x.results);
  }

  function mapPayloadToResult(payload: N8nPayload): Result {
    const tender = payload?.tender;
    const predictedNum = toNumberLoose(tender?.tenderPredictedPrice);
    const unit = String(tender?.unit ?? "USD/t");
    return {
      tenderPredictedPrice: predictedNum ?? 0,
      currency: unit,
      riskLevel: "Medium",
      notes: Array.isArray(payload?.notes) ? payload.notes : [],
      justification: buildJustification(payload, "drivers"),
    };
  }

  const selectedBases = useMemo(() => {
    return (basis ?? [])
      .map((v) => ({
        value: v,
        label: BASES.find((b) => b.value === v)?.label ?? v,
      }))
      .slice(0, MAX_BASIS);
  }, [basis]);

  function getBasePriceText(basisKey: string) {
    return String(basePricesByBasis?.[basisKey] ?? "");
  }

  function setBasePriceText(basisKey: string, v: string) {
    setBasePricesByBasis((prev) => ({ ...(prev ?? {}), [basisKey]: v }));
  }

  function marketBias(score: number | null) {
    if (score == null) return { label: "Neutral", color: "orange" as const };
    if (score >= 0.3) return { label: "Bullish", color: "green" as const };
    if (score <= -0.3) return { label: "Bearish", color: "red" as const };
    return { label: "Neutral", color: "orange" as const };
  }


  useEffect(() => {
    const fromUrl = searchParams.get("commodity");
    const fromLs = typeof window !== "undefined" ? window.localStorage.getItem(LS_COMMODITY) : null;
    const picked = (fromUrl ?? fromLs ?? "sulphur").trim();
    setCommodity(normalizeCommodity(picked));
  }, [searchParams]);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_BASIS) : null;
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) setBasis(arr.map((x) => String(x)));
    } catch {
      setBasis([raw]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_BASIS, JSON.stringify(basis));
  }, [basis]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LS_BASE_PRICE);

    const maybeNum = toNumberLoose(raw ?? "");
    const parsed = safeJsonParse<Record<string, string>>(raw);

    if (parsed && typeof parsed === "object") {
      setBasePricesByBasis(parsed);
    } else if (maybeNum != null) {
      setBasePricesByBasis((prev) => {
        const first = (basis ?? [])[0];
        if (!first) return prev ?? {};
        return { ...(prev ?? {}), [first]: String(maybeNum) };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_BASE_PRICE, JSON.stringify(basePricesByBasis ?? {}));
  }, [basePricesByBasis]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = makeStorageKey(commodity, basis);
    const cached = safeJsonParse<SavedSession>(window.localStorage.getItem(key));
    if (!cached?.savedAt) return;

    const ageMs = Date.now() - new Date(cached.savedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > MAX_CACHE_AGE_MS) {
      window.localStorage.removeItem(key);
      return;
    }
    if (status === "loading") return;

    setFutureDate(cached.futureDate ?? "");
    setError(null);
    setJustTab(cached.justTab ?? "drivers");

    setBasePricesByBasis(cached.basePricesByBasis ?? {});

    const restoredMulti = Array.isArray(cached.multi) ? cached.multi : [];
    const restoredIdx = typeof cached.activeIdx === "number" ? cached.activeIdx : 0;

    setMulti(restoredMulti as any);
    setActiveIdx(Math.max(0, Math.min(restoredIdx, Math.max(0, restoredMulti.length - 1))));

    if (restoredMulti.length > 0) {
      const active = restoredMulti[Math.max(0, Math.min(restoredIdx, restoredMulti.length - 1))] as any;
      setBundle(active?.bundle ?? null);
      setResult(active?.result ?? null);
      setStatus(active?.result ? "success" : "idle");
    } else {
      setBundle(cached.bundle ?? null);
      setResult(cached.result ?? null);
      setStatus(cached.result ? "success" : "idle");
    }
  }, [commodity, basis]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "success") return;
    if (!result && !bundle && multi.length === 0) return;

    const key = makeStorageKey(commodity, basis);
    const snapshot: SavedSession = {
      savedAt: new Date().toISOString(),
      commodity,
      basis,
      futureDate,
      status,
      justTab,
      activeIdx,
      multi: (multi ?? []).map((m) => ({
        basisKey: m.basisKey,
        basisLabel: m.basisLabel,
        bundle: m.bundle,
        result: m.result,
      })),
      result,
      bundle,
      basePricesByBasis: basePricesByBasis ?? {},
    };

    window.localStorage.setItem(key, JSON.stringify(snapshot));
  }, [status, commodity, basis, futureDate, justTab, activeIdx, multi, result, bundle, basePricesByBasis]);

  const canRun = commodity.trim().length > 0 && futureDate.trim().length > 0 && basis.length > 0 && status !== "loading";

  function normalizeConfidence(v: unknown): "High" | "Medium" | "Low" {
    const x = String(v ?? "").trim().toLowerCase();
    if (x === "high") return "High";
    if (x === "low") return "Low";
    return "Medium";
  }

  function buildJustification(payload: N8nPayload | null, tab: "drivers" | "risk" | "evidence"): Result["justification"] {
    const t = payload?.tender;
    const notes = Array.isArray(payload?.notes) ? payload!.notes! : [];

    if (tab === "drivers") {
      const action = String(t?.tenderAction ?? "PASS");
      const impact: "Up" | "Down" | "Risk" = action === "BUY BID" ? "Up" : action === "SELL OFFER" ? "Down" : "Risk";

      const trend = t?.signals?.trend ? String(t.signals.trend) : "";
      const sScore = typeof t?.signals?.sentimentScore === "number" ? t.signals.sentimentScore : null;

      const driverCommentParts = [
        t?.rationale ? String(t.rationale) : "",
        trend ? `Signals: ${trend}` : "",
        sScore !== null ? `Sentiment: ${sScore}` : "",
      ].filter(Boolean);

      return [
        {
          factor: "Tender Action",
          impact,
          confidence: normalizeConfidence(t?.confidence),
          comment: driverCommentParts.join(" • "),
        },
      ];
    }

    if (tab === "risk") {
      const missing = [
        !payload?.expectedSellingPrice ? "Expected selling price missing" : null,
        !payload?.spotPricesText ? "Spot prices text missing" : null,
        !Array.isArray(payload?.caliBidTable) ? "Cali table missing" : null,
      ].filter(Boolean);

      return [
        {
          factor: "Model Limits",
          impact: "Risk",
          confidence: "Medium",
          comment:
            missing.length > 0
              ? `Some fields are not provided by the workflow: ${missing.join(", ")}.`
              : "Risk is not explicitly returned by the workflow; using a default risk pill for now.",
        },
      ];
    }

    const sent = payload?.news?.shortTermSentiment ?? null;
    const ev = Array.isArray(payload?.evidence) ? payload!.evidence! : [];
    const out: Result["justification"] = [];

    if (sent?.category || sent?.score != null) {
      out.push({
        factor: "Short-term sentiment",
        impact: sent?.category === "Positive" ? "Up" : sent?.category === "Negative" ? "Down" : "Risk",
        confidence: "Medium",
        comment: `${sent?.category ?? "—"}${typeof sent?.score === "number" ? ` (${sent.score})` : ""}`,
      });

      if (sent?.rationale) {
        out.push({
          factor: "Sentiment rationale",
          impact: "Risk",
          confidence: "Medium",
          comment: sent.rationale,
        });
      }
    }

    if (ev.length) {
      ev.slice(0, 6).forEach((e, idx) => {
        out.push({
          factor: idx === 0 ? "Top market-moving events" : "Event",
          impact: e.impact_direction === "bullish" ? "Up" : e.impact_direction === "bearish" ? "Down" : "Risk",
          confidence: "Medium",
          comment: `${e.headline ?? "—"}${typeof e.importance_score === "number" ? ` (importance ${e.importance_score})` : ""}`,
        });
      });
      return out;
    }

    if (notes.length) {
      return notes.slice(0, 6).map((n, idx) => ({
        factor: idx === 0 ? "Evidence Notes" : "Note",
        impact: "Risk",
        confidence: "Medium",
        comment: String(n),
      }));
    }

    return [{ factor: "Evidence", impact: "Risk", confidence: "Low", comment: "No evidence returned." }];
  }

  async function runPrediction() {
    if (!canRun) return;

    setStatus("loading");
    setError(null);
    setResult(null);
    setBundle(null);
    setMulti([]);
    setActiveIdx(0);

    const basePrices = (basis ?? []).slice(0, MAX_BASIS).map((b) => toNumberLoose(basePricesByBasis?.[b] ?? ""));

    const reqBody: any = {
      commodity,
      basis,
      futureDate,
      basePrices,
    };

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`API failed (${res.status}): ${msg || "Unknown error"}`);
      }

      const data = await res.json();

      if (isApiMultiResponse(data) && data.results.length > 0) {
        const items: MultiItem[] = data.results.map((r) => {
          const payload = normalizeN8nPayload(r.data);
          const mapped = mapPayloadToResult(payload);
          return { basisKey: r.basisKey, basisLabel: r.basisLabel, bundle: payload, result: mapped };
        });

        setMulti(items);
        setActiveIdx(0);
        setBundle(items[0].bundle);
        setResult(items[0].result);
        setJustTab("drivers");
        setStatus("success");
        return;
      }

      const payload = normalizeN8nPayload(data);
      setBundle(payload);

      const mapped = mapPayloadToResult(payload);
      setResult(mapped);
      setJustTab("drivers");
      setStatus("success");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setStatus("error");
    }
  }

  const statusLabel = useMemo(() => {
    if (status === "loading") return "Running";
    if (status === "success") return "Done";
    if (status === "error") return "Error";
    return "Idle";
  }, [status]);

  const tenderAction = bundle?.tender?.tenderAction ? String(bundle.tender.tenderAction) : null;
  const tenderUnit = result?.currency ? String(result.currency) : "USD/t";

  const sentimentScore = bundle?.tender?.signals?.sentimentScore ?? null;
  const bias = marketBias(sentimentScore);
  const decisionConfidence = bundle?.tender?.confidence ?? "--";

  const visibleJustification = useMemo(() => {
    if (!bundle) return result?.justification ?? [];
    if (justTab === "drivers") return buildJustification(bundle, "drivers");
    if (justTab === "risk") return buildJustification(bundle, "risk");
    if (justTab === "evidence") return buildJustification(bundle, "evidence");
    return result?.justification ?? [];
  }, [bundle, justTab, result]);

  const caliRows = Array.isArray(bundle?.caliBidTable) ? bundle!.caliBidTable! : [];

  function handlePrint() {
    if (status !== "success") return;

    const payload = {
      generatedAt: new Date().toISOString(),
      commodity,
      basis,
      futureDate,
      status: statusLabel,
      basePricesByBasis,
      basePrices: (basis ?? []).slice(0, MAX_BASIS).map((b) =>
        toNumberLoose((basePricesByBasis as any)?.[b] ?? "")
      ),
      multiResults:
        multi.length > 0
          ? multi.map((m) => ({
              basisKey: m.basisKey,
              basisLabel: m.basisLabel,
              tender: m.bundle?.tender ?? null,
              expectedSellingPrice: m.bundle?.expectedSellingPrice ?? null,
              spotPricesText: m.bundle?.spotPricesText ?? null,
              notes: Array.isArray(m.bundle?.notes) ? m.bundle?.notes : [],
              caliTable: Array.isArray(m.bundle?.caliBidTable) ? m.bundle?.caliBidTable : [],
              news: m.bundle?.news ?? null,
              evidence: m.bundle?.evidence ?? [],
              currency: m.result?.currency ?? m.bundle?.tender?.unit ?? "USD/t",
              riskLevel: m.result?.riskLevel ?? "Medium",
            }))
          : null,
      activeBasis: multi.length > 0 ? (multi[activeIdx]?.basisLabel ?? null) : null,
      tender: bundle?.tender ?? null,
      predictedPrice: bundle?.tender?.tenderPredictedPrice ?? null,
      currency: result?.currency ?? bundle?.tender?.unit ?? "USD/t",
      riskLevel: result?.riskLevel ?? "Medium",
      expectedSellingPrice: bundle?.expectedSellingPrice ?? null,
      spotPricesText: bundle?.spotPricesText ?? null,
      notes: Array.isArray(bundle?.notes) ? bundle?.notes : [],
      caliTable: Array.isArray(bundle?.caliBidTable) ? bundle?.caliBidTable : [],
      news: bundle?.news ?? null,
      evidence: bundle?.evidence ?? [],
    };

    const key = `print:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to store print payload", e);
      alert("Print payload is too large to store locally. Try again or reduce included fields.");
      return;
    }

    const w = 980;
    const h = 780;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));

    const features = [
      `popup=yes`,
      `width=${w}`,
      `height=${h}`,
      `left=${left}`,
      `top=${top}`,
      `scrollbars=yes`,
      `resizable=yes`,
      `noreferrer=yes`,
    ].join(",");

    window.open(`/prediction/print?k=${encodeURIComponent(key)}`, "print_preview", features);
  }


  return (
    <AppShell title="Prediction">
      <div className="pf-page">
        <div className="pf-container">
          {/* LEFT SIDEBAR */}
          <section>
            <div className="pf-sidebar">
              <div className="pf-sidebar-header">
                <h2 className="pf-sidebar-title">Run prediction</h2>
                <span className="pf-status">
                  <IconSpark className="h-4 w-4" />
                  {statusLabel}
                </span>
              </div>

              {/* Commodity */}
              <div className="pf-section">
                <label className="pf-section-label">Selected Commodity</label>
                <div className="pf-field">
                  <span className="pf-field-icon">
                    <IconTag className="h-5 w-5" />
                  </span>

                  <select
                    className="pf-select"
                    value={commodity}
                    onChange={(e) => handleCommodityChange(e.target.value)}
                    disabled={status === "loading"}
                  >
                    {COMMODITIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  <span className="pf-field-chevron">
                    <IconChevronDown className="h-5 w-5" />
                  </span>
                </div>
              </div>

              {/* Basis */}
              <div className="pf-section">
                <label className="pf-section-label">Basis</label>

                <div className="pf-checkbox-grid">
                  {BASES.map((b) => {
                    const active = basis.includes(b.value);
                    const limitReached = basis.length >= MAX_BASIS && !active;
                    const id = `basis-${b.value}`;

                    return (
                      <div key={b.value} className="pf-check">
                        <input
                          id={id}
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleBasis(b.value)}
                          disabled={status === "loading" || limitReached}
                        />
                        <label htmlFor={id}>
                          <span className="box">
                            <svg className="mark" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          {b.label}
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="pf-selected-info">
                  Selected: {basis.length ? basis.map((v) => BASES.find((x) => x.value === v)?.label ?? v).join(", ") : "—"}
                </div>
              </div>

              {/* Future date */}
              <div className="pf-section">
                <label className="pf-section-label">Future date</label>
                <div className="pf-field">
                  <span className="pf-field-icon">
                    <IconCalendar className="h-5 w-5" />
                  </span>

                  <input
                    className="pf-input"
                    type="date"
                    value={futureDate}
                    onChange={(e) => setFutureDate(e.target.value)}
                    disabled={status === "loading"}
                  />
                </div>
              </div>

              {/* Base price */}
              <div className="pf-section">
                <label className="pf-section-label">Base price</label>

                <div style={{ display: "grid", gap: 10 }}>
                  {selectedBases.map((b) => (
                    <div key={b.value} className="pf-field">
                      <input
                        className="pf-input"
                        inputMode="decimal"
                        placeholder={b.label}
                        value={getBasePriceText(b.value)}
                        onChange={(e) => setBasePriceText(b.value, e.target.value)}
                        disabled={status === "loading"}
                        style={{ paddingLeft: 16 }}
                      />
                    </div>
                  ))}
                </div>

                <div className="pf-secondary-info">
                  Leave empty to use workflow auto / null.
                </div>
              </div>

              {/* Run button */}
              <button className="pf-btn pf-btn-primary" onClick={runPrediction} disabled={!canRun}>
                {status === "loading" ? "Running..." : "Run forecast"}
              </button>
            </div>
          </section>

          {/* RIGHT PANEL */}
          <section>
            {/* Error */}
            {status === "error" && (
              <div className="pf-card" style={{ background: "#fef2f2", border: "2px solid #fecaca", marginBottom: "1.5rem" }}>
                <div style={{ color: "#991b1b", fontWeight: 600, fontSize: "14px" }}>
                  {error ?? "Something went wrong."}
                </div>
              </div>
            )}

            {/* Forecast Results */}
            <div className="pf-card">
              <div className="pf-card-header">
                <h2 className="pf-title-lg">
                  <BarChart3 className="h-7 w-7" />
                  Forecast Results
                </h2>

                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <RiskPill v={result ? result.riskLevel : "--"} />

                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={status !== "success"}
                    className="pf-btn-print"
                  >
                    <Printer className="h-4 w-4" />
                    Print Report
                  </button>
                </div>
              </div>

              <div className="pf-metrics">
                {/* Metric 1 */}
                <div className="pf-metric">
                  <div className="pf-metric-label">Predicted Price</div>
                  <div className="pf-metric-value">
                    {bundle?.tender?.tenderPredictedPrice != null ? String(bundle.tender.tenderPredictedPrice) : "--"}
                  </div>
                  <div className="pf-metric-sub">
                    {bundle?.tender?.tenderPredictedPrice != null
                      ? `${tenderAction ? `Action: ${tenderAction}` : ""} • ${formatUnit(tenderUnit)}`
                      : "Awaiting forecast"}
                  </div>

                  <div className="pf-metric-icon">
                    <Trophy className="h-5 w-5" />
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="pf-metric">
                  <div className="pf-metric-label">Market Bias</div>

                  <div className={cx("pf-metric-value", bias.label === "Neutral" && "neutral")}>
                    {sentimentScore != null ? `${bias.label} (${sentimentScore.toFixed(2)})` : "Neutral"}
                  </div>

                  <div className="pf-metric-sub">Short-term market sentiment</div>

                  <div className="pf-metric-icon">
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="pf-metric">
                  <div className="pf-metric-label">Decision Confidence</div>
                  <div className="pf-metric-value">{decisionConfidence}</div>
                  <div className="pf-metric-sub">Signal alignment strength</div>

                  <div className="pf-metric-icon">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis Details */}
            <div className="pf-card" style={{ marginTop: "1.5rem" }}>
              <div className="pf-card-header">
                <h2 className="pf-title-md">
                  <Search className="h-6 w-6" />
                  Analysis Details
                </h2>

                {/* Tabs */}
                <div className="pf-tabs">
                  {(
                    [
                      { k: "drivers", label: "Drivers", icon: IconSpark },
                      { k: "risk", label: "Risks", icon: IconShield },
                      { k: "evidence", label: "Evidence", icon: IconFileText },
                      { k: "cali", label: "Cali Bid", icon: IconTable },
                    ] as const
                  ).map((it) => {
                    const active = justTab === it.k;
                    const Ico = it.icon;

                    return (
                      <button
                        key={it.k}
                        onClick={() => setJustTab(it.k)}
                        className={cx("pf-tab", active && "pf-tab-active")}
                      >
                        <Ico className="h-4 w-4" />
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              <div style={{ marginTop: "2rem" }}>
                {justTab !== "cali" ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="table-compact">
                      <thead>
                        <tr>
                          <th className="tcell">Factor</th>
                          <th className="tcell">Impact</th>
                          <th className="tcell">Confidence</th>
                          <th className="tcell">Analysis</th>
                        </tr>
                      </thead>

                      <tbody>
                        {visibleJustification?.length ? (
                          visibleJustification.map((r, idx) => {
                            const conf = badgeForConfidence(r.confidence);
                            const imp = badgeForImpact(r.impact);
                            return (
                              <tr key={idx}>
                                <td className="tcell">
                                  <div className="mono-mini">{r.factor}</div>
                                </td>
                                <td className="tcell">
                                  <span className={cx("badge", imp.cls)}>
                                    <imp.Icon className="h-3.5 w-3.5" />
                                    {imp.label}
                                  </span>
                                </td>
                                <td className="tcell">
                                  <span className={cx("badge", conf.cls)}>
                                    <conf.Icon className="h-3.5 w-3.5" />
                                    {conf.label}
                                  </span>
                                </td>
                                <td className="tcell">
                                  <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#475569" }}>{r.comment}</div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4}>
                              <div className="pf-empty">
                                <div className="pf-empty-icon">
                                  <BarChart3 className="h-10 w-10" />
                                </div>
                                <div className="pf-empty-title">No Analysis Data</div>
                                <div className="pf-empty-text">Run a forecast to view analysis details</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="table-compact">
                      <thead>
                        <tr>
                          <th className="tcell" style={{ width: "12%" }}>Range</th>
                          <th className="tcell" style={{ width: "15%" }}>Chance</th>
                          <th className="tcell" style={{ width: "15%" }}>Risk</th>
                          <th className="tcell" style={{ width: "22%" }}>Assessment</th>
                          <th className="tcell" style={{ width: "12%" }}>Margin</th>
                          <th className="tcell" style={{ width: "22%" }}>Implication</th>
                          <th className="tcell" style={{ width: "2%" }}></th>
                        </tr>
                      </thead>

                      <tbody>
                        {(caliRows ?? []).map((row: CaliBidRow, idx: number) => {
                          const assess = badgeForAssessment(row.assessment);
                          const m = marginTone(row.marginPerTon);

                          return (
                            <tr key={idx}>
                              <td className="tcell mono-mini">
                                {row.caliBidRangeFob || "—"}
                              </td>
                              <td className="tcell">{row.chanceToWin || "—"}</td>
                              <td className="tcell">{row.marginRiskDec || "—"}</td>
                              <td className="tcell">
                                <span className={cx("badge", assess.cls)}>
                                  <assess.Icon className="h-3.5 w-3.5" />
                                  {assess.label}
                                </span>
                              </td>

                              <td className="tcell">
                                <div className={cx("flex items-center gap-2", m.cls)} style={{ fontSize: "12px" }}>
                                  {m.value || "—"}
                                </div>
                                <div style={{ fontSize: "11px", color: "#94a3b8" }}>USD/t</div>
                              </td>

                              <td className="tcell" style={{ maxWidth: "260px", fontSize: "12px", color: "#475569" }}>
                                {row.implication || "—"}
                              </td>
                              <td className="tcell" style={{ textAlign: "right" }}>
                                <button
                                  onClick={() => openEvidence(row.caliBidRangeFob || `Row ${idx + 1}`, row.supportingNews ?? [])}
                                  disabled={!row.supportingNews?.length}
                                  style={{
                                    width: "40px",
                                    height: "40px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: "12px",
                                    border: "none",
                                    background: row.supportingNews?.length ? "transparent" : "transparent",
                                    color: row.supportingNews?.length ? "#94a3b8" : "#cbd5e1",
                                    cursor: row.supportingNews?.length ? "pointer" : "not-allowed",
                                    transition: "all 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (row.supportingNews?.length) {
                                      e.currentTarget.style.background = "rgba(63, 165, 117, 0.05)";
                                      e.currentTarget.style.color = "#3FA575";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.color = row.supportingNews?.length ? "#94a3b8" : "#cbd5e1";
                                  }}
                                  title="Evidence"
                                >
                                  <MoreHorizontal className="h-5 w-5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Evidence modal */}
        {evOpen ? (
          <div className="fixed inset-0 z-[12000]">
            <div className="pf-modal-backdrop" onClick={closeEvidence} aria-hidden="true" />

            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="pf-modal">
                <div className="pf-modal-head">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div style={{
                        width: "40px",
                        height: "40px",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "16px",
                        background: "rgba(63, 165, 117, 0.12)",
                        border: "1px solid rgba(34, 197, 94, 0.2)"
                      }}>
                        <Info className="h-5 w-5" style={{ color: "#3FA575" }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>Evidence</div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                          Cali bid range: {evTitle || "—"}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "11px", color: "#64748b" }}>
                          {evItems.length ? `Showing ${evItems.length} linked events` : "No linked events for this row."}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeEvidence}
                      style={{
                        width: "36px",
                        height: "36px",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "16px",
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        color: "#64748b",
                        cursor: "pointer"
                      }}
                      title="Close"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "1.5rem" }}>
                  {evItems.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {evItems.map((e, i) => (
                        <div key={i} style={{
                          borderRadius: "16px",
                          background: "#fff",
                          border: "1px solid rgba(226, 232, 240, 0.7)",
                          padding: "1rem"
                        }}>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                            <span className={cx("badge", dirPill(e.impact_direction))}>
                              {(e.impact_direction ?? "neutral").toString().toUpperCase()}
                            </span>

                            {typeof e.importance_score === "number" ? (
                              <span className="badge">
                                Importance {e.importance_score.toFixed(2)}
                              </span>
                            ) : null}

                            {e.event_type ? (
                              <span className="badge">
                                {e.event_type}
                              </span>
                            ) : null}

                            {e.event_date ? (
                              <span style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>{e.event_date}</span>
                            ) : null}
                          </div>

                          <div style={{ marginTop: "0.5rem", fontSize: "12px", color: "#1e293b" }}>{e.headline ?? "—"}</div>

                          {e.evidence_summary ? (
                            <div style={{ marginTop: "0.5rem", fontSize: "12px", lineHeight: 1.5, color: "#475569", whiteSpace: "pre-line" }}>
                              {e.evidence_summary}
                            </div>
                          ) : null}

                          {Array.isArray(e.regions) && e.regions.length ? (
                            <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                              {e.regions.slice(0, 8).map((r, j) => (
                                <span
                                  key={j}
                                  className="badge"
                                  style={{ fontSize: "11px" }}
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      borderRadius: "16px",
                      background: "rgba(255, 255, 255, 0.6)",
                      padding: "1rem",
                      fontSize: "14px",
                      color: "#64748b",
                      border: "1px solid #e2e8f0"
                    }}>
                      No evidence available.
                    </div>
                  )}
                </div>

                <div className="pf-modal-foot">
                  <button
                    type="button"
                    onClick={closeEvidence}
                    className="pf-btn pf-btn-secondary"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={closeEvidence}
                    className="pf-btn pf-btn-primary-fixed"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}