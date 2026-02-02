// FILE: src/app/prediction/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { auth } from "@/lib/firebaseClient";
import { EvidenceModal } from "@/components/modal/evidence-modal";


import {
  Sparkles,
  XCircle,
  Target,
  Download,
  Share2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Gauge,
  MoreHorizontal,
  Printer,
  Info,
  MenuIcon,
  ArrowRight,
} from "lucide-react";

import type {
  Status,
  Result,
  NewsEvent,
  N8nPayload,
  MultiItem,
  CaliBidRow,
  Direction,
  Strength,
  EvidenceItem,
} from "@/types/prediction";

// Normalization / parsing / type guards
import {
  toNumberLoose,
  safeJsonParse,
  normalizeN8nPayload,
  labelFromAlignmentScore,
  isApiMultiResponse,
} from "@/lib/prediction/normalize";

// Mapping + justification
import { buildJustification, mapPayloadToResult } from "@/lib/prediction/mappers";

// Storage helpers / constants
import {
  LS_COMMODITY,
  LS_BASIS,
  LS_BASE_PRICE,
  makeStorageKey,
  clearPredictionStorage,
  STORAGE_PREFIX, // only if you reference it directly in the page
} from "@/lib/prediction/storage";

import { COMMODITIES, BASES, normalizeCommodity } from "@/lib/prediction/options";
import { cx, formatUnit, marketBias } from "@/lib/prediction/ui";
import { usePredictionSession } from "@/hooks/usePredictionSession";
import { usePredictionInputs } from "@/hooks/usePredictionInputs";
import { AssessmentLegendTooltip } from "@/components/ui/tooltip/implication-legend";


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

  const [justTab, setJustTab] = useState<"drivers" | "risk" | "evidence" | "cali">("cali");

  const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

  const MAX_BASIS = 2;

  const [evOpen, setEvOpen] = useState(false);
  const [evTitle, setEvTitle] = useState<string>("");
  const [evItems, setEvItems] = useState<NewsEvent[]>([]);

  usePredictionSession({
  commodity,
  basis,
  futureDate,
  status,
  justTab,
  activeIdx,
  multi,
  result,
  bundle,
  basePricesByBasis,
  maxCacheAgeMs: MAX_CACHE_AGE_MS,

  setFutureDate,
  setError,
  setJustTab,
  setBasePricesByBasis,
  setMulti,
  setActiveIdx,
  setBundle,
  setResult,
  setStatus,
});

usePredictionInputs({
  searchParams,
  basis,
  basePricesByBasis,
  setCommodity,
  setBasis,
  setBasePricesByBasis,
});

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

  function toggleBasis(v: string) {
    setBasis((prev) => {
      const has = prev.includes(v);
      if (has) return prev.filter((x) => x !== v);
      if (prev.length >= MAX_BASIS) return prev;
      return [...prev, v];
    });
  }


  function resetPredictionScreenState() {
    setStatus("idle");
    setError(null);
    setResult(null);
    setBundle(null);
    setMulti([]);
    setActiveIdx(0);

    setJustTab("cali");

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



  const canRun =
    commodity.trim().length > 0 && futureDate.trim().length > 0 && basis.length > 0 && status !== "loading";


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
      const u = auth.currentUser;
      if (!u) throw new Error("Not logged in. Please sign in again.");

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
        setJustTab("cali");
        setStatus("success");
        return;
      }

      const payload = normalizeN8nPayload(data);
      setBundle(payload);

      const mapped = mapPayloadToResult(payload);
      setResult(mapped);
      setJustTab("cali");
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
  
  const [legendOpen, setLegendOpen] = useState(false);


  const score =
  typeof sentimentScore === "number" && Number.isFinite(sentimentScore)
    ? sentimentScore
    : null;
    
  const direction: Direction =
    score == null ? "Neutral"
    : score > 0.15 ? "Bullish"
    : score < -0.15 ? "Bearish"
    : "Neutral";

  const strength: Strength =
    score == null ? "N/A"
    : Math.abs(score) >= 0.70 ? "Strong"
    : Math.abs(score) >= 0.40 ? "Moderate"
    : Math.abs(score) >= 0.15 ? "Slight"
    : "N/A";

  // ✅ CRITICAL FIX:
  // Never show "--" if alignmentScore exists (even if workflow forgot decisionConfidence)
  const alignmentScore = bundle?.tender?.signals?.alignmentScore;
  const decisionConfidence =
    (bundle?.tender?.decisionConfidence ??
      (typeof alignmentScore === "number" ? labelFromAlignmentScore(alignmentScore) : null) ??
      bundle?.tender?.confidence ??
      "--");
  const expectedRange = bundle?.expectedRange ?? null;
  const p10 = expectedRange?.p10;
  const p90 = expectedRange?.p90;
  const visibleJustification = useMemo(() => {
    if (!bundle) return result?.justification ?? [];
    if (justTab === "drivers") return buildJustification(bundle, "drivers");
    if (justTab === "risk") return buildJustification(bundle, "risk");
    if (justTab === "evidence") return buildJustification(bundle, "evidence");
    return result?.justification ?? [];
  }, [bundle, justTab, result]);

  const caliRows = Array.isArray(bundle?.caliBidTable) ? bundle!.caliBidTable! : [];

  const optimalRow = useMemo(() => {
    const rows = Array.isArray(bundle?.caliBidTable) ? bundle!.caliBidTable! : [];
    return (
      rows.find((r: any) => String(r?.assessment ?? "").toLowerCase().includes("optimal")) ??
      rows[0] ??
      null
    );
  }, [bundle]);

  function handlePrint() {
    if (status !== "success") return;

    const payload = {
      generatedAt: new Date().toISOString(),
      commodity,
      basis,
      futureDate,
      status: statusLabel,
      basePricesByBasis,
      basePrices: (basis ?? []).slice(0, MAX_BASIS).map((b) => toNumberLoose((basePricesByBasis as any)?.[b] ?? "")),
      multiResults:
        multi.length > 0
          ? multi.map((m) => ({
              basisKey: m.basisKey,
              basisLabel: m.basisLabel,
              tender: m.bundle?.tender ?? null,
              expectedRange: Array.isArray(m.bundle?.expectedRange) ? m.bundle?.expectedRange : [],
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
      activeBasis: multi.length > 0 ? multi[activeIdx]?.basisLabel ?? null : null,
      tender: bundle?.tender ?? null,
      predictedPrice: bundle?.tender?.tenderPredictedPrice ?? null,
      currency: result?.currency ?? bundle?.tender?.unit ?? "USD/t",
      riskLevel: result?.riskLevel ?? "Medium",
      expectedRange: Array.isArray(bundle?.expectedRange) ? bundle?.expectedRange : [],
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

    const features = [`popup=yes`, `width=${w}`, `height=${h}`, `left=${left}`, `top=${top}`, `scrollbars=yes`, `resizable=yes`, `noreferrer=yes`].join(",");

    window.open(`/prediction/print?k=${encodeURIComponent(key)}`, "print_preview", features);
  }

return (
  <AppShell title="Prediction">
    <div className="cp-root">
      {/* Header + Sub-nav are already in AppShell in your app.
          If AppShell does NOT provide them, we can embed them here, but it’s usually global. */}

      <div className="cp-container">
        {/* LEFT SIDEBAR (template: .sidebar) */}
        <aside className="cp-sidebar">
          <div className="cp-sidebar-section">
            <h3>Forecast Parameters</h3>

            <div className="cp-form-group">
              <label>Commodity</label>
              <select
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

            <div className="cp-form-group">
              <label>Future Date</label>
              <input
                type="date"
                value={futureDate}
                onChange={(e) => setFutureDate(e.target.value)}
                disabled={status === "loading"}
              />
            </div>

            <div className="cp-form-group">
              <label>Spot / Base Price (USD)</label>
              <div style={{ display: "grid", gap: 8 }}>
                {selectedBases.map((b) => (
                  <input
                    key={b.value}
                    inputMode="decimal"
                    placeholder={b.label}
                    value={String(basePricesByBasis?.[b.value] ?? "")}
                    onChange={(e) => setBasePriceText(b.value, e.target.value)}
                    disabled={status === "loading"}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="cp-sidebar-section">
            <h3>Basis Selection</h3>

            <div className="cp-checkbox-group">
              {BASES.map((b) => {
                const checked = basis.includes(b.value);
                const limitReached = basis.length >= MAX_BASIS && !checked;

                return (
                  <label
                    key={b.value}
                    className={cx("cp-checkbox-item", checked && "selected")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBasis(b.value)}
                      disabled={status === "loading" || limitReached}
                    />
                    <span>{b.label}</span>
                    {checked && b.value === basis[0] ? (
                      <span className="cp-active-tag">ACTIVE</span>
                    ) : null}
                  </label>
                );
              })}
            </div>

            <div className="cp-note">
              ● ACTIVE:{" "}
              {(basis[0]
                ? (BASES.find((x) => x.value === basis[0])?.label ?? basis[0])
                : "—"
              ).toUpperCase()}
            </div>
          </div>

          <button className="cp-run-btn" onClick={runPrediction} disabled={!canRun}>
            {status === "loading" ? "RUNNING..." : "RUN FORECAST"}
          </button>

          {status === "error" ? (
            <div className="cp-error">{error ?? "Something went wrong."}</div>
          ) : null}
        </aside>

        {/* MAIN CONTENT (template: .main-content) */}
        <main className="cp-main">
          {/* Recommendation header (template) */}
          <div className="cp-card cp-rec-card">
            <div className="cp-rec-header">
              <div className="cp-rec-text">
                <h2>
                  <ArrowRight size={14} className="th-inline" /> Recommended Action:
                  <strong>
                    {bundle?.tender?.tenderAction ? String(bundle.tender.tenderAction) : "—"} at{" "}
                    {optimalRow?.caliBidRangeFob ? String(optimalRow.caliBidRangeFob).replace(/\s*-\s*/g, "–") : "—"}{" "}
                    {tenderUnit}{" - "}
                    {selectedBases?.[0]?.label ?? "—"}
                  </strong>
                </h2>

                <p>
                  <strong>Rationale:</strong>{" "}
                  {optimalRow ? (
                    <>
                      {String(optimalRow?.chanceToWin ?? "—")} win probability + balanced margin (
                      {String(optimalRow?.marginPerTon ?? "—")})
                    </>
                  ) : (
                    bundle?.tender?.rationale ? String(bundle.tender.rationale) : "Run a forecast to generate rationale."
                  )}
                </p>
              </div>
              <div className="cp-actions">
                <button className="cp-btn-outline" type="button" disabled={status !== "success"}>
                  <Download size={14} /> EXPORT
                </button>

                <button className="cp-btn-outline" type="button" onClick={handlePrint} disabled={status !== "success"}>
                  <Printer size={14} /> PRINT
                </button>

                <button className="cp-btn-outline" type="button" disabled>
                  <Share2 size={14} /> SHARE
                </button>
              </div>
            </div>
          </div>

          {/* Two-column grid: Forecast + Risk */}

<div className="dashboard-grid">
  <div className="card p-4">
    <div className="table-header">
      <span className="cp-card-head">FORECAST RESULTS</span>
      <Info size={16} />
    </div>

    <div className="forecast-stats">
      <div className="stat-box">
        <div className="stat-label">Predicted Price</div>
        <div className="stat-value">
          {bundle?.tender?.tenderPredictedPrice != null ? String(bundle.tender.tenderPredictedPrice) : "--"} <span className="stat-unit">({tenderUnit})</span>
        </div>
        <div className="stat-sub">
          Recent average: +8.3% <i className="fas fa-arrow-up" aria-hidden="true" />
        </div>
      </div>

      <div className="stat-box">
        <div className="stat-label">Expected Range</div>
        <div className="stat-value">
          {Number.isFinite(p10) && Number.isFinite(p90) ? `${p10}–${p90}` : "--"} <span className="stat-unit">({tenderUnit})</span>
        </div>
        <div className="stat-sub">Recent average error: +5.2%</div>
      </div>
    </div>

    <div className="market-bias">
      <div className="mb-left mr-8">
        <div className="mb-title">Market Bias:</div>
        <div className="mb-sub">Sentiment score: {sentimentScore != null ? sentimentScore.toFixed(2) : "—"}</div>
      </div>

      <div
        className={cx(
          "cp-bias-indicator mb-center",
          direction === "Bullish" && "bull",
          direction === "Bearish" && "bear",
          direction === "Neutral" && "neutral",
          strength === "Strong" && "strong",
          strength === "Moderate" && "moderate",
          strength === "Slight" && "slight"
        )}
      >
        <span className="cp-bias-text">
          {strength !== "N/A" ? `${strength.toUpperCase()} ` : ""}
          <br />
          {direction.toUpperCase()}
        </span>

        {direction === "Bullish" ? (
          <TrendingUp size={16} />
        ) : direction === "Bearish" ? (
          <TrendingDown size={16} />
        ) : null}
      </div>

      <div className="mb-right ml-8">60th percentile • 1% outliers</div>
    </div>
  </div>

  <div className="card p-4">
    <div className="table-header">
      <div className="th-left">
        <span className="cp-card-head">RISK ANALYSIS</span>
         <MenuIcon size={16} />
      </div>

      <div className="th-meta">
        Data last updated <strong>Apr 24, 2024 10:45 AM</strong>{" "}
        <i className="fas fa-robot" aria-hidden="true" /> Model version 1{" "}
        <i className="fas fa-save" aria-hidden="true" />
      </div>
    </div>

    <div className="risk-item risk-bg-high">
      <div className="risk-header">
        Downside Risk <span className="risk-sep">|</span>{" "}
        <span className="risk-badge bg-high">HIGH</span>
      </div>
      <div className="risk-desc">23% downside from margin band (-20 USD/t max)</div>
    </div>

    <div className="risk-item risk-bg-med">
      <div className="risk-header">
        Margin Compression <span className="risk-sep">|</span>{" "}
        <span className="risk-badge bg-med-yellow">MEDIUM</span>
      </div>
      <div className="risk-desc">Risk margins tightening: (+10 USD/t threshold)</div>
    </div>

    <div className="risk-item risk-bg-low">
      <div className="risk-header">
        Execution <span className="risk-sep">|</span>{" "}
        <span className="risk-badge bg-low">LOW</span>
      </div>
      <div className="risk-desc">Strong liquidity for this bid range</div>
    </div>
  </div>
</div>



          {/* Detailed Bid Analysis (template table) */}
          <div className="card pl-4 pr-4 pb-4">
            <div className="table-header">
              <div className="th-left">
               <span className="cp-card-head">DETAILED BID ANALYSIS</span>
              </div>
              <div className="th-right">
                            <div className="tt-sub-nav mt-3 mb-2">
                  <button 
                   className={cx("tt-sub-navLink", justTab === "drivers" && "tt-navLinkActive")} 
                   onClick={() => setJustTab("drivers")} type="button">
                    DRIVERS
                  </button>
                  <button 
                     className={cx("tt-sub-navLink", justTab === "risk" && "tt-navLinkActive")}
                    onClick={() => setJustTab("risk")} type="button">
                    RISKS
                  </button>
                  <button 
                   className={cx("tt-sub-navLink", justTab === "evidence" && "tt-navLinkActive")}
                   onClick={() => setJustTab("evidence")} type="button">
                    EVIDENCE
                  </button>
                  <button 
                    className={cx("tt-sub-navLink", justTab === "cali" && "tt-navLinkActive")} 
                   onClick={() => setJustTab("cali")} type="button">
                    CALI BID
                  </button>
            </div>
                 </div>
            </div>



            {justTab !== "cali" ? (
              <table className="cp-table">
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
                          <td><span className={cx("status-label", imp.cls)}>{imp.label}</span></td>
                          <td><span className={cx("status-label", conf.cls)}>{conf.label}</span></td>
                          <td>{r.comment}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="cp-empty">No analysis data. Run a forecast.</td>
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
                     <th>
                       <span className="th-inline flex items-center gap-2">
    ASSESSMENT

    {/* anchor container MUST be relative */}
    <span
      className="relative inline-flex"
      onMouseEnter={() => setLegendOpen(true)}
      onMouseLeave={() => setLegendOpen(false)}
    >
      <Info
        size={16}
        className="text-slate-500 hover:text-slate-900 cursor-help"
        aria-label="Assessment legend"
      />

      <AssessmentLegendTooltip open={legendOpen} align="left" />
    </span>
  </span>
                     
                      </th>
                    <th className="w-[10%]">MARGIN</th>
                      <th>Report / News interpretation</th>
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
                          : "st-info";

                      const highlight = a.includes("optimal");

                      return (
                        <tr key={idx} className={highlight ? "cp-row-highlight" : undefined}>
                          <td>{row.caliBidRangeFob || "—"}</td>
                          <td>{row.chanceToWin || "—"}</td>
                          <td>{row.marginRiskDec || "—"}</td>
                          <td><span className={cx("status-label", cls)}>{String(row.assessment ?? "—").toLowerCase()}</span></td>
                          <td>{row.marginPerTon || "—"}</td>
                         
                          <td>
                            {row.reportNewsInterpretation ? (
                              <span className="line-clamp-2">{row.reportNewsInterpretation}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="cp-empty">No CALI bid table returned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

           </main>
      </div>

      <EvidenceModal open={evOpen} title={evTitle} items={evItems} onClose={closeEvidence} />
    </div>
  </AppShell>
);
}
