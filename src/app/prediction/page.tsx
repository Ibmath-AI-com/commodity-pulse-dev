// FILE: src/app/prediction/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { auth } from "@/lib/firebaseClient";

import {
  Sparkles,
  XCircle,
  Info,
  Target,
  Download,
  Share2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BadgeCheck,
  DollarSign, 
  BarChart3, 
  Gauge,
  MoreHorizontal,
  Printer,
  TextAlignCenter,
} from "lucide-react";

export const dynamic = "force-dynamic";

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
    const normalized = normalizeCommodity(picked);

    setCommodity(normalized);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_COMMODITY, normalized.toLowerCase());
      window.dispatchEvent(new Event("ai:commodity"));
    }
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
    // ✅ Require login
    const u = auth.currentUser;
    if (!u) throw new Error("Not logged in. Please sign in again.");

    // ✅ Firebase ID token -> server verifies it
    const idToken = await u.getIdToken();

    const res = await fetch("/api/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(reqBody),
      cache: "no-store",
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
    <div className="workspace">
      {/* LEFT: Control sidebar */}
      <aside className="control-sidebar">
        <div className="module">
          <div className="module-header">Forecast Parameters</div>
          <div className="module-content">
            <div className="input-row">
              <label className="input-label">Commodity</label>
              <select
                className="tt-select"
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
            </div>

            <div className="input-row">
              <label className="input-label">Future Date</label>
              <input
                className="tt-input"
                type="date"
                value={futureDate}
                onChange={(e) => setFutureDate(e.target.value)}
                disabled={status === "loading"}
              />
            </div>

            <div className="input-row">
              <label className="input-label">Base Price (USD)</label>
              {/* If you have 2 bases selected, we show 2 inputs like your current behavior */}
              <div style={{ display: "grid", gap: 8 }}>
                {selectedBases.map((b) => (
                  <input
                    key={b.value}
                    className="tt-input"
                    inputMode="decimal"
                    placeholder={b.label}
                    value={getBasePriceText(b.value)}
                    onChange={(e) => setBasePriceText(b.value, e.target.value)}
                    disabled={status === "loading"}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="module">
          <div className="module-header">Basis Selection</div>
          <div className="module-content">
            <div className="basis-options">
              {BASES.map((b) => {
                const checked = basis.includes(b.value);
                const limitReached = basis.length >= MAX_BASIS && !checked;

                return (
                  <label key={b.value} className="basis-checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBasis(b.value)}
                      disabled={status === "loading" || limitReached}
                    />
                    <span>{b.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="active-basis">
              ● ACTIVE:{" "}
              {(basis[0] ? (BASES.find((x) => x.value === basis[0])?.label ?? basis[0]) : "—")
                .toUpperCase()}
            </div>
          </div>
        </div>

        <button className="action-button" onClick={runPrediction} disabled={!canRun}>
          {status === "loading" ? "RUNNING..." : "RUN FORECAST"}
        </button>

        {status === "error" ? (
          <div style={{ marginTop: 12, color: "#de350b", fontSize: 13, fontWeight: 700 }}>
            {error ?? "Something went wrong."}
          </div>
        ) : null}
      </aside>

      {/* RIGHT: Main panel */}
      <main className="main-panel">
        <section className="panel-section">
          <div className="section-header">
            <h2 className="section-title">FORECAST RESULTS</h2>
            <div className="section-actions">
              <button className="toolbar-btn" type="button" disabled={status !== "success"}>
                <Download className="h-4 w-4" />
                EXPORT
              </button>

              <button className="toolbar-btn" type="button" onClick={handlePrint} disabled={status !== "success"}>
                <Printer className="h-4 w-4" />
                PRINT
              </button>

              <button className="toolbar-btn" type="button" disabled>
                <Share2 className="h-4 w-4" />
                SHARE
              </button>
            </div>
          </div>

<div className="stats-grid">
  {/* Predicted Price */}
  <div className="stat-box">
    <div className="stat-icon stat-icon-top" aria-hidden="true">
      <DollarSign className="h-6 w-6" />
    </div>
  
    <div className="stat-label">Predicted Price</div>
    <div className="stat-value">
      {bundle?.tender?.tenderPredictedPrice != null ? String(bundle.tender.tenderPredictedPrice) : "--"}
    </div>
    <div className="stat-meta">
      {bundle?.tender?.tenderPredictedPrice != null
        ? `Action: ${tenderAction ?? "—"} • ${formatUnit(tenderUnit)}`
        : "Awaiting forecast"}
    </div>
  </div>

  {/* Market Bias */}
  <div className="stat-box">
   <div className="stat-icon stat-icon-top" aria-hidden="true">
      <BarChart3 className="h-6 w-6" />
    </div>

    <div className="stat-label">Market Bias</div>

    <div
      className={cx(
        "stat-value stat-value-inline",
        bias.label === "Bullish" && "value-positive",
        bias.label === "Bearish" && "value-negative",
        bias.label === "Neutral" && "value-neutral"
      )}
    >
      <span>{sentimentScore != null ? bias.label.toUpperCase() : "NEUTRAL"}</span>

      {/* Bigger arrow, tight to text */}
      {bias.label === "Bullish" ? (
        <TrendingUp className="stat-arrow" />
      ) : bias.label === "Bearish" ? (
        <TrendingDown className="stat-arrow" />
      ) : null}
    </div>

    <div className="stat-meta">
  Confidence:{" "}
  {sentimentScore != null ? `${(sentimentScore * 100).toFixed(0)}%` : "—"}
</div>
  </div>

  {/* Decision Confidence */}
  <div className="stat-box">
    <div className="stat-icon stat-icon-top" aria-hidden="true">
      <Gauge className="h-6 w-6" />
    </div>

    <div className="stat-label">Decision Confidence</div>
    <div className="stat-value value-neutral">{String(decisionConfidence ?? "--").toUpperCase()}</div>
    <div className="stat-meta">Signal alignment strength</div>
  </div>
</div>


        </section>

        <section className="panel-section">
          <div className="section-header">
            <h2 className="section-title">ANALYSIS DETAILS</h2>
          </div>

          <div className="analysis-container">
            <div className="analysis-tabs">
              <button
                className={cx("analysis-tab", justTab === "drivers" && "active")}
                onClick={() => setJustTab("drivers")}
                type="button"
              >
                DRIVERS
              </button>
              <button
                className={cx("analysis-tab", justTab === "risk" && "active")}
                onClick={() => setJustTab("risk")}
                type="button"
              >
                RISKS
              </button>
              <button
                className={cx("analysis-tab", justTab === "evidence" && "active")}
                onClick={() => setJustTab("evidence")}
                type="button"
              >
                EVIDENCE
              </button>
              <button
                className={cx("analysis-tab", justTab === "cali" && "active")}
                onClick={() => setJustTab("cali")}
                type="button"
              >
                CALI BID
              </button>
            </div>

            {justTab !== "cali" ? (
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>FACTOR</th>
                    <th>IMPACT</th>
                    <th>CONFIDENCE</th>
                    <th>ANALYSIS</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleJustification?.length ? (
                    visibleJustification.map((r, idx) => {
                      const imp =
                        r.impact === "Up"
                          ? { cls: "status-optimal", label: "UP" }
                          : r.impact === "Down"
                          ? { cls: "status-danger", label: "DOWN" }
                          : { cls: "status-warning", label: "RISK" };

                      const conf =
                        r.confidence === "High"
                          ? { cls: "status-optimal", label: "HIGH" }
                          : r.confidence === "Low"
                          ? { cls: "status-danger", label: "LOW" }
                          : { cls: "status-info", label: "MEDIUM" };

                      return (
                        <tr key={idx}>
                          <td>{r.factor}</td>
                          <td>
                            <span className={cx("status-label", imp.cls)}>{imp.label}</span>
                          </td>
                          <td>
                            <span className={cx("status-label", conf.cls)}>{conf.label}</span>
                          </td>
                          <td>{r.comment}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: "1.25rem", color: "#7a869a" }}>
                        No analysis data. Run a forecast.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="data-grid">
                <thead>
                  <tr>
                    <th className="w-[10%]">RANGE</th>
                    <th className="w-[13%]">CHANCE</th>
                    <th className="w-[13%]">RISK</th>
                    <th>ASSESSMENT</th>
                    <th className="w-[10%]">MARGIN</th>
                    <th>IMPLICATION</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {(caliRows ?? []).length ? (
                    (caliRows ?? []).map((row: CaliBidRow, idx: number) => {
                      const a = (row.assessment || "").toLowerCase();
                      const cls =
                        a.includes("optimal")
                          ? "status-optimal"
                          : a.includes("acceptable")
                          ? "status-info"
                          : a.includes("attractive") || a.includes("recommended")
                          ? "status-warning"
                          : a.includes("avoid") || a.includes("risky")
                          ? "status-danger"
                          : "status-info";

                      return (
                        <tr key={idx}>
                          <td>{row.caliBidRangeFob || "—"}</td>
                          <td>{row.chanceToWin || "—"}</td>
                          <td>{row.marginRiskDec || "—"}</td>
                          <td>
                            <span className={cx("status-label", cls)}>{(row.assessment || "—").toUpperCase()}</span>
                          </td>
                          <td>{row.marginPerTon || "—"}</td>
                          <td>{row.implication || "—"}</td>
                          
                          <td className="zero-padding" style={{ textAlign: "center" }}>
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
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: "1.25rem", color: "#7a869a" }}>
                        No CALI bid table returned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
      {/* Evidence modal */}
{evOpen ? (
  <div className="fixed inset-0 z-[12000]">
    <div
      className="absolute inset-0"
      style={{ background: "rgba(9,30,66,0.35)" }}
      onClick={closeEvidence}
      aria-hidden="true"
    />

    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div style={{ width: "100%", maxWidth: 980, background: "#fff", border: "1px solid #dfe1e6" }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, letterSpacing: 0.3 }}>EVIDENCE</div>
              <div style={{ marginTop: 2, fontSize: 12, color: "#42526e" }}>
                Cali bid range: <span style={{ fontWeight: 700, color: "#172b4d" }}>{evTitle || "—"}</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: "#7a869a" }}>
                {evItems.length ? `Showing ${evItems.length} linked events` : "No linked events for this row."}
              </div>
            </div>

            <button className="toolbar-btn" type="button" onClick={closeEvidence} title="Close">
              <XCircle className="h-4 w-4" />
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 12, maxHeight: "72vh", overflowY: "auto" }}>
          {evItems.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {evItems.map((e, i) => {
                const impact = (e?.impact_direction ?? "neutral").toString().toLowerCase();
                const impactTone =
                  impact.includes("bear") || impact === "down"
                    ? { bg: "#ffebe6", fg: "#de350b", bd: "#ffbdad" } // red/orange (Atlassian danger)
                    : impact.includes("bull") || impact === "up"
                    ? { bg: "#deebff", fg: "#019664ff", bd: "#22d499ff" } // blue (Atlassian info)
                    : impact.includes("risk")
                    ? { bg: "#fffae6", fg: "#ff8b00", bd: "#ffe2bd" } // amber (warning)
                    : { bg: "#f4f5f7", fg: "#42526e", bd: "#dfe1e6" }; // neutral

                return (
                  <div
                    key={i}
                    style={{
                      border: "1px solid #dfe1e6",
                      background: "#fff",
                      padding: 12,
                    }}
                  >
                    {/* meta row */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 22,
                          padding: "0 8px",
                          borderRadius: 999,
                          border: `1px solid ${impactTone.bd}`,
                          background: impactTone.bg,
                          color: impactTone.fg,
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                        }}
                      >
                        {(e?.impact_direction ?? "neutral").toString().toUpperCase()}
                      </span>

                      {typeof e?.importance_score === "number" ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 22,
                            padding: "0 8px",
                            borderRadius: 999,
                            border: "1px solid #dfe1e6",
                            background: "#f4f5f7",
                            color: "#42526e",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          Importance {e.importance_score.toFixed(2)}
                        </span>
                      ) : null}

                      {e?.event_type ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 22,
                            padding: "0 8px",
                            borderRadius: 999,
                            border: "1px solid #dfe1e6",
                            background: "#f4f5f7",
                            color: "#42526e",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {e.event_type}
                        </span>
                      ) : null}

                      {e?.event_date ? (
                        <span style={{ marginLeft: "auto", fontSize: 12, color: "#7a869a" }}>
                          {e.event_date}
                        </span>
                      ) : null}
                    </div>

                    {/* headline */}
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#172b4d" }}>
                      {e?.headline ?? "—"}
                    </div>

                    {/* evidence summary */}
                    {e?.evidence_summary ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: "#42526e",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {e.evidence_summary}
                      </div>
                    ) : null}

                    {/* regions */}
                    {Array.isArray(e?.regions) && e.regions.length ? (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {e.regions.slice(0, 10).map((r: string, j: number) => (
                          <span
                            key={j}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              height: 22,
                              padding: "0 8px",
                              borderRadius: 999,
                              border: "1px solid #dfe1e6",
                              background: "#f4f5f7",
                              color: "#42526e",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 12, border: "1px solid #dfe1e6", background: "#f4f5f7", color: "#42526e" }}>
              No evidence available.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 12,
            background: "#f8f9fa",
            borderTop: "1px solid #dfe1e6",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="toolbar-btn" type="button" onClick={closeEvidence}>
            Close
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

