// FILE: src/app/home/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { auth, db } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
  doc,
  deleteDoc,
} from "firebase/firestore";

import {
  History,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  X,
  Trash2,
  UploadCloud,
  FileText,
  Activity,
  Bell,
} from "lucide-react";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

type Point = {
  date: string;           // "2026-01-26"
  predicted?: number;     // 490.5
  actual?: number;        // 502
};

export function PredictionVsActualChart({ data }: { data: Point[] }) {
  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickMargin={8} />
          <YAxis tickMargin={8} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="predicted" name="Predicted" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="actual" name="Actual" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


type PredRow = {
  id: string;
  uid: string;
  createdAt: Date | null;
  runtimeMs?: number | null;

  commodity?: string | null;
  futureDate?: string | null;

  basisLabels?: string[] | null;
  basisKeys?: string[] | null;
  basePrices?: Array<number | null> | null;

  status?: "success" | "error" | string | null;
  n8nHttpStatus?: number | null;

  outputs?: PredOutputs | null;
  error?: any;
};

type PredOutputs = {
  basis?: string;
  unit?: string;
  ok?: boolean;
  tenderAction?: string;
  tenderPredictedPrice?: number;

  signals?: {
    sentimentScore?: number;
    trend?: string;
  };

  confidence?: string;
  rationale?: string;
  notes?: string[];
  expectedSellingPrice?: string;
  spotPricesText?: string;

  tender?: {
    tenderPredictedPrice?: number;
    tenderAction?: string;
    unit?: string;
    confidence?: string;
    decisionConfidence?: string;
    rationale?: string;
    signals?: {
      sentimentScore?: number;
      alignmentScore?: number;
      trend?: string;
    };
  };

  news?: {
    shortTermSentiment?: {
      category?: string;
      score?: number;
      rationale?: string;
    };
    events?: Array<{
      headline?: string;
      evidence_summary?: string;
      event_date?: string;
      event_type?: string;
      impact_direction?: string;
      importance_score?: number;
      regions?: string[];
    }>;
  };

  caliBidTable?: Array<{
    caliBidRangeFob?: string;
    chanceToWin?: string;
    marginRiskDec?: string;
    assessment?: string;
    implication?: string;
    marginPerTon?: string;
    expectedSellingPrice?: string;
    spotPricesText?: string;
  }>;

  perBasis?: Array<{
    basis?: string;
    basisKey?: string;
    unit?: string;
    confidence?: string;
    tenderAction?: string;
    tenderPredictedPrice?: number;
    rationale?: string;
    signals?: { sentimentScore?: number; trend?: string };
  }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "object" && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}



function safeUpper(x: any) {
  const s = String(x ?? "").trim();
  return s ? s.toUpperCase() : "—";
}

const LS_COMMODITY = "ai_commodity_selected";
const LS_BASIS = "ai_basis_selected";
const LS_BASE_PRICE = "ai_base_price_selected";

export default function HomeDashboardPage() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<PredRow[]>([]);
  const [qText, setQText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  // details modal
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PredRow | null>(null);

  // delete modal
  const [delOpen, setDelOpen] = useState(false);
  const [delRow, setDelRow] = useState<PredRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  // Auth gate
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUid(null);
        router.replace("/");
        return;
      }
      setUid(u.uid);
    });
    return () => unsub();
  }, [router]);

  // ✅ First access: prefill qText from localStorage commodity (only if qText is empty)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setQText((prev) => {
      if (prev.trim()) return prev;
      return (window.localStorage.getItem(LS_COMMODITY) ?? "").trim();
    });
  }, []);

  async function load() {
    if (!uid) return;

    setBusy(true);
    setErr(null);

    try {
      const q = query(
        collection(db, "predictions"),
        where("uid", "==", uid),
        orderBy("createdAt", "desc"),
        limit(100)
      );

      const snap = await getDocs(q);
      const out: PredRow[] = snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          uid: x.uid,
          createdAt: toDate(x.createdAt),
          runtimeMs: typeof x.runtimeMs === "number" ? x.runtimeMs : null,

          commodity: x.commodity ?? null,
          futureDate: x.futureDate ?? null,

          basisLabels: Array.isArray(x.basisLabels) ? x.basisLabels : null,
          basisKeys: Array.isArray(x.basisKeys) ? x.basisKeys : null,
          basePrices: Array.isArray(x.basePrices) ? x.basePrices : null,

          status: x.status ?? null,
          n8nHttpStatus: typeof x.n8nHttpStatus === "number" ? x.n8nHttpStatus : null,

          outputs: x.outputs ?? null,
          error: x.error ?? null,
        };
      });

      setRows(out);
    } catch (e: any) {
      setErr(e?.message || "Failed to load history.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return rows.filter((r) => {
      if (statusFilter !== "all") {
        if ((r.status || "").toLowerCase() !== statusFilter) return false;
      }

      if (!t) return true;

      const hay = [
        r.commodity,
        r.futureDate,
        ...(r.basisLabels ?? []),
        ...(r.basisKeys ?? []),
        r.status,
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" | ");

      return hay.includes(t);
    });
  }, [rows, qText, statusFilter]);

  

  const kpis = useMemo(() => {
    const total = rows.length;
    const success = rows.filter((r) => (r.status || "").toLowerCase() === "success").length;
    const error = rows.filter((r) => (r.status || "").toLowerCase() === "error").length;
    const rate = total ? Math.round((success / total) * 100) : 0;

    const last = rows[0] ?? null;

    const byCommodity = new Map<string, number>();
    rows.forEach((r) => {
      const c = String(r.commodity ?? "").trim().toLowerCase();
      if (!c) return;
      byCommodity.set(c, (byCommodity.get(c) ?? 0) + 1);
    });

    let topCommodity = "—";
    let topCount = 0;
    for (const [k, v] of byCommodity.entries()) {
      if (v > topCount) {
        topCount = v;
        topCommodity = k;
      }
    }

    const avgRuntime =
      rows.filter((r) => typeof r.runtimeMs === "number").reduce((a, r) => a + (r.runtimeMs ?? 0), 0) /
      Math.max(1, rows.filter((r) => typeof r.runtimeMs === "number").length);

    return {
      total,
      success,
      error,
      rate,
      last,
      topCommodity: topCommodity === "—" ? "—" : topCommodity.toUpperCase(),
      topCount,
      avgRuntimeMs: Number.isFinite(avgRuntime) ? Math.round(avgRuntime) : null,
    };
  }, [rows]);

  const recent = useMemo(() => filtered.slice(0, 4), [filtered]);

  function showDetails(r: PredRow) {
    setActive(r);
    setOpen(true);
  }

  function closeDetails() {
    setOpen(false);
    setActive(null);
  }

  function clearFilters() {
    setQText("");
    setStatusFilter("all");
  }

  function askDelete(r: PredRow) {
    setDelErr(null);
    setDelRow(r);
    setDelOpen(true);
  }

  function closeDelete() {
    if (deleting) return;
    setDelOpen(false);
    setDelRow(null);
    setDelErr(null);
  }

  async function confirmDelete() {
    if (!delRow) return;
    setDeleting(true);
    setDelErr(null);

    try {
      if (uid && delRow.uid && delRow.uid !== uid) {
        throw new Error("You can only delete your own records.");
      }

      await deleteDoc(doc(db, "predictions", delRow.id));
      setRows((prev) => prev.filter((x) => x.id !== delRow.id));

      setDelOpen(false);
      setDelRow(null);
    } catch (e: any) {
      setDelErr(e?.message || "Failed to delete record.");
    } finally {
      setDeleting(false);
    }
  }

  const statusPill = (s?: string | null) => {
    const v = String(s ?? "").toLowerCase();
    const cls =
      v === "success"
        ? "badge-green"
        : v === "error"
        ? "badge-rose"
        : "bg-slate-500/10 text-slate-700 ring-1 ring-slate-200";
    return <span className={cx("badge", cls)}>{safeUpper(v || "—")}</span>;
  };

  const trendClass = (r: PredRow) => {
    const v = String(r.status ?? "").toLowerCase();
    if (v === "success") return "is-bullish";
    if (v === "error") return "is-bearish";
    return "is-neutral";
  };

  const insights = useMemo(() => {
    const list: Array<{ title: string; text: string; meta: string }> = [];

    list.push({
      title: "Activity",
      text: `You have ${rows.length} total runs. Showing ${filtered.length} after filters.`,
      meta: "Updated now",
    });

    if (kpis.last?.createdAt) {
      list.push({
        title: "Latest run",
        text: `Last execution: ${fmtDate(kpis.last.createdAt)} • Status: ${safeUpper(kpis.last.status)}`,
        meta: "Most recent record",
      });
    }

    if (kpis.error > 0) {
      list.push({
        title: "Attention required",
        text: `${kpis.error} run(s) failed. Review details for HTTP status and stored error payload.`,
        meta: "Risk / quality",
      });
    } else {
      list.push({
        title: "Health",
        text: "No failed runs detected in the last 100 records.",
        meta: "System status",
      });
    }

    if (kpis.avgRuntimeMs) {
      list.push({
        title: "Performance",
        text: `Average runtime (approx): ${kpis.avgRuntimeMs} ms across records with runtimeMs.`,
        meta: "Timing",
      });
    }

    if (kpis.topCommodity !== "—") {
      list.push({
        title: "Top commodity",
        text: `${kpis.topCommodity} is the most frequently used commodity (${kpis.topCount} run(s)).`,
        meta: "Usage",
      });
    }

    return list.slice(0, 6);
  }, [rows.length, filtered.length, kpis.last, kpis.error, kpis.avgRuntimeMs, kpis.topCommodity, kpis.topCount]);

  const demoUrea = {
  id: "__demo_urea__",
  commodity: "urea",
  createdAt: new Date(),              // shows today
  futureDate: "2026-02-05",           // demo
  basisLabels: ["Mediterranean"],
  basisKeys: ["mediterranean"],
  outputs: {
    tenderPredictedPrice: 348.0,
    signals: { trend: "bearish" }, // <- this is the key fix
  },
} as any; // (remove 'as any' if your PredRow type matches fields)

function trendTone(r: any) {
  const t = String(r?.outputs?.signals?.trend ?? "").toLowerCase();
  if (t === "bullish") return "tt-prediction-bias tt-bullish";
  if (t === "bearish") return "tt-prediction-bias tt-bearish";
  if (t) return "tt-bias tt-mixed";
  return "tt-bias";
}

const recentWithDemo = recent?.length ? [...recent, demoUrea] : [demoUrea];

const chartData = [
  { date: "2025-12-22", predicted: 502.5, actual: 495.0 },
  { date: "2025-12-30", predicted: 507.5, actual: 512.0 },
  { date: "2026-01-06", predicted: 490.5, actual: 502.0 },
  { date: "2026-01-14", predicted: 472.5, actual: 470.0 },
  { date: "2026-01-20", predicted: 507.5, actual: 512.0 },
  { date: "2026-01-29", predicted: 486, actual: 484.0 },
];

  return (
    <AppShell title="Home">
      <div className="workspace tt-home">
        {/* LEFT: Filters sidebar */}
        <aside className="control-sidebar">
          <div className="module">
            <div
              className="module-header"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span>Filters</span>

              <button
                className="toolbar-btn"
                type="button"
                onClick={clearFilters}
                disabled={!qText && statusFilter === "all"}
                title="Clear"
                style={{
                  width: "auto",
                  marginTop: 0,
                  justifyContent: "center",
                  padding: "6px 10px",
                  height: 34,
                }}
              >
                Clear filter
              </button>
            </div>

            <div className="module-content">
              <div className="input-row">
                <label className="input-label">Search</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    className="tt-input"
                    style={{ paddingLeft: 34 }}
                    placeholder="Commodity, basis, date, status..."
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-row">
                <label className="input-label">Status</label>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <select
                    className="tt-select"
                    style={{ paddingLeft: 34 }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                  >
                    <option value="all">All</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>

              <div className="text-xs font-semibold text-slate-600">
                Showing {filtered.length} / {rows.length}
              </div>
            </div>
          </div>

          <button
            className="action-button"
            type="button"
            onClick={() => void load()}
            disabled={busy || !uid}
            title="Refresh"
          >
            {busy ? "REFRESHING..." : "REFRESH"}
          </button>

          {err ? (
            <div
              style={{
                marginTop: 12,
                border: "1px solid rgba(244, 63, 94, 0.25)",
                background: "rgba(244, 63, 94, 0.06)",
                padding: 12,
                fontSize: 13,
                fontWeight: 700,
                color: "#9f1239",
              }}
            >
              {err}
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "#be123c" }}>
                If you see an “index required” message, click the link inside the error to create the index.
              </div>
            </div>
          ) : null}
        </aside>

        {/* RIGHT: Main panel */}
        <div className="main-panel">
        
          {/*  cards structure */}
<div className="stats-grid-home mb-5">
  {/* Active Forecasts */}
  <div className="stat-box">
    <div className="stat-icon stat-icon-top" aria-hidden="true">
      <History className="h-4 w-4" />
    </div>

    <div className="stat-label">Active Forecasts</div>
    <div className="stat-value">7
      
    </div>
    <div className="stat-meta mt-3">
      <span className="tt-change tt-up">▲ 12.5%</span>{" "}
      <span className="tt-muted">this week</span>
    </div>
  </div>
  

  {/* Accuracy Rate */}
  <div className="stat-box">
      <div className="stat-icon stat-icon-top" aria-hidden="true">
        <History className="h-4 w-4" />
      </div>

      <div className="stat-label">Accuracy Rate</div>
      <div className="stat-value">87%</div>
      <div className="stat-meta mt-5">
        <span className="tt-change tt-up">▲ 3.2%</span>{" "}
        <span className="tt-muted">vs last month</span>
      </div>
    </div>

  {/* Market Signals */}
   <div className="stat-box">
      <div className="stat-icon stat-icon-top" aria-hidden="true">
        <History className="h-4 w-4" />
      </div>

      <div className="stat-label">Market Signals</div>
      <div className="stat-value">34</div>
      <div className="stat-meta mt-5">
        <span className="tt-change tt-up">▲ 8</span>{" "}
        <span className="tt-muted">new today</span>
      </div>
    </div>
</div>


          {/* 3) CONTENT GRID (same 2 panels: recent list + quick actions) */}
{/* 3) CONTENT GRID (RECENT + CHART SIDE BY SIDE) */}
<div className="tt-content-grid tt-content-grid-2 mt-10">
  {/* Left: Recent predictions */}
  <section className="panel-section">
    <div className="section-header">
      <h2 className="section-title">RECENT PREDICTIONS</h2>
      <div className="section-actions">
        <button
          className="toolbar-btn"
          type="button"
          onClick={() => void load()}
          disabled={busy || !uid}
          title="Refresh"
        >
          <RefreshCw className={cx("h-4 w-4", busy && "animate-spin")} />
          Refresh
        </button>
      </div>
    </div>

    <div className="section-content">
      <div className="tt-prediction-list">
        {recentWithDemo.length ? (
          recentWithDemo.map((r) => (
            <div
              key={r.id}
              className={cx("tt-prediction-item", trendClass(r))}
              role="button"
              tabIndex={0}
              onClick={() => showDetails(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") showDetails(r);
              }}
            >
              <div className="tt-prediction-icon" aria-hidden="true">
                <Activity className="h-5 w-5" />
              </div>

              <div className="tt-prediction-details">
                <h4>{safeUpper(r.commodity)}</h4>
                <div className="tt-prediction-meta">
                  <span>{fmtDate(r.createdAt)}</span>
                  <span>{r.futureDate || "—"}</span>
                  <span>
                    {(r.basisLabels?.length ? r.basisLabels : r.basisKeys)?.[0]
                      ? safeUpper((r.basisLabels?.length ? r.basisLabels : r.basisKeys)?.[0])
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="tt-prediction-result">
                <div className="tt-prediction-price">
                  {typeof r.outputs?.tenderPredictedPrice === "number"
                    ? `${r.outputs.tenderPredictedPrice.toFixed(1)} USD/t`
                    : "—"}
                </div>
                <div className={trendTone(r)}>
                  {safeUpper(r.outputs?.signals?.trend ?? "—")}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="tt-empty">
            {busy ? "Loading..." : "No predictions yet. Run your first forecast from the Prediction page."}
          </div>
        )}
      </div>
    </div>
  </section>

  {/* Right: Chart */}
  <section className="panel-section">
    <div className="section-content">
      <PredictionVsActualChart data={chartData} />
    </div>
  </section>
</div>


          {/* 4) BOTTOM GRID (same two panels: table + insights) */}

          
          <div className="bottom-grid">
  <div className="panel-section">
    <div className="section-header">
      <h2 className="section-title">Top Performing Commodities</h2>
      <div className="section-actions">
        <button className="toolbar-btn" type="button">Export</button>
      </div>
    </div>

    <div className="section-content" style={{ padding: 0 }}>
      <table className="data-grid">
        <thead>
          <tr>
            <th>Commodity</th>
            <th>Current Price</th>
            <th>Change</th>
            <th>Trend</th>
            <th>Predictions</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td><strong>Sulphur</strong></td>
            <td>$518.0</td>
            <td className="tt-bullish">▲ 3.1%</td>
            <td><span className="status-label status-optimal">BULLISH</span></td>
            <td>6</td>
          </tr>

          <tr>
            <td><strong>Urea</strong></td>
            <td>$348.0</td>
            <td className="tt-bearish">▼ 0.8%</td>
            <td><span className="status-label status-danger">BEARISH</span></td>
            <td>4</td>
          </tr>

          <tr>
            <td><strong>Ethylene</strong></td>
            <td>$890.0</td>
            <td className=".tt-bullish">▲ 1.2%</td>
            <td><span className="status-label status-warning">NEUTRAL</span></td>
            <td>3</td>
          </tr>

          <tr>
            <td><strong>Pygas</strong></td>
            <td>$645.0</td>
            <td className=".tt-bullish">▲ 2.4%</td>
            <td><span className="status-label status-optimal">BULLISH</span></td>
            <td>1</td>
          </tr>

          <tr>
            <td><strong>Naphtha</strong></td>
            <td>$712.0</td>
            <td className="tt-bearish">▼ 1.1%</td>
            <td><span className="status-label status-danger">BEARISH</span></td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>


          {/* Details modal */}
          {open && active ? (
            <div className="fixed inset-0 z-[13000]">
              <div
                className="absolute inset-0"
                style={{ background: "rgba(9,30,66,0.35)" }}
                onClick={closeDetails}
                aria-hidden="true"
              />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div style={{ width: "100%", maxWidth: 980, background: "#fff", border: "1px solid #dfe1e6" }}>
                  <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, letterSpacing: 0.3 }}>PREDICTION DETAILS</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: "#42526e" }}>
                          <span style={{ fontWeight: 800, color: "#172b4d" }}>{safeUpper(active.commodity)}</span>{" "}
                          • {fmtDate(active.createdAt)} • {active.futureDate || "—"}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 12, color: "#7a869a" }}>
                          Basis:{" "}
                          {(active.basisLabels?.length ? active.basisLabels : active.basisKeys)?.join(" • ") || "—"}{" "}
                          • Status: {safeUpper(active.status)}
                        </div>
                      </div>

                      <button className="toolbar-btn" type="button" onClick={closeDetails} title="Close">
                        <X className="h-4 w-4" />
                        Close
                      </button>
                    </div>
                  </div>

               <div style={{ padding: 12, maxHeight: "72vh", overflowY: "auto" }}>
  {/* Summary cards (2 columns) */}
  <div
    className="details-grid"
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      alignItems: "start",
    }}
  >
    {/* Left: Decision */}
    <div className="rounded-[12px] border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="text-xs font-extrabold text-slate-600">DECISION</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: "#0f172a" }}>
            {safeUpper(active.outputs?.tender?.tenderAction ?? active.outputs?.tenderAction ?? "—")}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#42526e" }}>
            {active.outputs?.unit ?? active.outputs?.tender?.unit ?? "USD/t"}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div className="text-xs font-extrabold text-slate-600">PREDICTED</div>
          <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
            {typeof active.outputs?.tenderPredictedPrice === "number"
              ? `${active.outputs.tenderPredictedPrice}`
              : typeof active.outputs?.tender?.tenderPredictedPrice === "number"
              ? `${active.outputs.tender.tenderPredictedPrice}`
              : "—"}
          </div>
          <div className="text-xs font-bold text-slate-500" style={{ marginTop: 4 }}>
            {active.outputs?.unit ?? active.outputs?.tender?.unit ?? "USD/t"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">TREND</div>
          <div className={trendTone({ outputs: { signals: active.outputs?.signals } })} style={{ marginTop: 6 }}>
            {safeUpper(active.outputs?.signals?.trend ?? "—")}
          </div>
        </div>

        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">SENTIMENT</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {typeof active.outputs?.signals?.sentimentScore === "number"
              ? active.outputs.signals.sentimentScore.toFixed(2)
              : typeof active.outputs?.tender?.signals?.sentimentScore === "number"
              ? active.outputs.tender.signals.sentimentScore.toFixed(2)
              : "—"}
          </div>
          <div className="text-[11px] font-bold text-slate-500" style={{ marginTop: 2 }}>
            short-term score
          </div>
        </div>

        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">CONFIDENCE</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {active.outputs?.confidence ?? active.outputs?.tender?.confidence ?? "—"}
          </div>
          <div className="text-[11px] font-bold text-slate-500" style={{ marginTop: 2 }}>
            decision quality
          </div>
        </div>
      </div>
    </div>

    {/* Right: Market */}
    <div className="rounded-[12px] border border-slate-200 bg-white p-4">
      <div className="text-xs font-extrabold text-slate-600">MARKET CONTEXT</div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">BASIS</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {active.outputs?.basis ?? (active.basisLabels?.[0] ?? active.basisKeys?.[0] ?? "—")}
          </div>
        </div>

        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">ANCHOR</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {active.outputs?.spotPricesText ?? "—"}
          </div>
        </div>

        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">OPTIMAL BAND</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {(() => {
              const n = active.outputs?.notes ?? [];
              const band = n.find((x) => String(x).toLowerCase().includes("optimal band"));
              return band ? band.replace(/^Optimal band\s*\(.*?\)\s*:\s*/i, "") : "—";
            })()}
          </div>
        </div>

        <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold text-slate-600">EXPECTED SELL</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
            {active.outputs?.expectedSellingPrice ?? "—"}
          </div>
        </div>
      </div>

    
    </div>
  </div>

  {/* News events */}
  <div style={{ marginTop: 12 }} className="rounded-[12px] border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs font-extrabold text-slate-600">KEY NEWS (TOP)</div>
      <div className="text-[11px] font-bold text-slate-500">
        {active.outputs?.news?.events?.length ?? 0} events
      </div>
    </div>

    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      {(active.outputs?.news?.events ?? [])
        .slice(0, 12)
        .map((ev, i) => {
          const dir = String(ev?.impact_direction ?? "").toLowerCase();
          const pill =
            dir === "bullish"
              ? "badge-green"
              : dir === "bearish"
              ? "badge-rose"
              : "bg-slate-500/10 text-slate-700 ring-1 ring-slate-200";

          return (
            <div key={i} className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a", lineHeight: 1.35 }}>
                    {ev?.headline ?? "—"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#42526e" }}>
                    {ev?.event_date ? `Date: ${ev.event_date}` : "Date: —"} •{" "}
                    {ev?.event_type ? `Type: ${ev.event_type}` : "Type: —"}
                    {Array.isArray(ev?.regions) && ev.regions.length ? ` • Regions: ${ev.regions.join(", ")}` : ""}
                  </div>
                </div>

                <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                  <span className={cx("badge", pill)}>{safeUpper(dir || "neutral")}</span>
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "#0f172a" }}>
                    {typeof ev?.importance_score === "number"
                      ? `Importance: ${ev.importance_score.toFixed(2)}`
                      : "Importance: —"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: "#0f172a" }}>
                {ev?.evidence_summary ?? "—"}
              </div>
            </div>
          );
        })}
    </div>
  </div>

  {/* Raw payload */}
  <details style={{ marginTop: 12 }} className="rounded-[12px] border border-slate-200 bg-white p-4">
    <summary style={{ cursor: "pointer", fontWeight: 900, color: "#0f172a" }}>
      Raw payload (stored)
    </summary>
    <pre
      style={{
        marginTop: 10,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: 12,
        lineHeight: 1.45,
        color: "#0f172a",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 12,
      }}
    >
      {JSON.stringify(
        {
          commodity: active.commodity,
          futureDate: active.futureDate,
          basisLabels: active.basisLabels,
          basisKeys: active.basisKeys,
          basePrices: active.basePrices,
          status: active.status,
          n8nHttpStatus: active.n8nHttpStatus,
          runtimeMs: active.runtimeMs,
          outputs: active.outputs,
          error: active.error,
        },
        null,
        2
      )}
    </pre>
  </details>
</div>



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
                    <button className="toolbar-btn" type="button" onClick={closeDetails}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}



        </div>
      </div>
    </AppShell>
  );
}
