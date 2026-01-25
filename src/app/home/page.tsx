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
  RefreshCw,
  Search,
  Filter,
  Eye,
  X,
  Trash2,
} from "lucide-react";

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

  outputs?: any;
  error?: any;
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
      if (prev.trim()) return prev; // don't overwrite user typing
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

    return {
      total,
      success,
      error,
      rate,
      last,
      topCommodity: topCommodity === "—" ? "—" : topCommodity.toUpperCase(),
      topCount,
    };
  }, [rows]);

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

  return (
    <AppShell title="Home">
      <div className="workspace">
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
        <main className="main-panel">
          {/* DASHBOARD */}
          <section className="panel-section">
            <div className="section-header">
              <h2 className="section-title">DASHBOARD</h2>
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

            <div className="stats-grid-home">
              <div className="stat-box">
                <div className="stat-icon stat-icon-top" aria-hidden="true">
                  <History className="h-6 w-6" />
                </div>
                <div className="stat-label">Total Runs</div>
                <div className="stat-value-med">{kpis.total}</div>
                <div className="stat-meta">Last: {fmtDate(kpis.last?.createdAt ?? null)}</div>
              </div>

              <div className="stat-box">
                <div className="stat-icon stat-icon-top" aria-hidden="true">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div className="stat-label">Success Rate</div>
                <div className="stat-value-med">{kpis.rate}%</div>
                <div className="stat-meta">
                  Success {kpis.success} • Error {kpis.error}
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-icon stat-icon-top" aria-hidden="true">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="stat-label">Top Commodity</div>
                <div className="stat-value-med">{kpis.topCommodity}</div>
                <div className="stat-meta">Used {kpis.topCount || 0} time(s)</div>
              </div>

              <div className="stat-box">
                <div className="stat-icon stat-icon-top" aria-hidden="true">
                  {kpis.error > 0 ? <XCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                </div>
                <div className="stat-label">Status</div>
                <div className={cx("stat-value-med", kpis.error > 0 ? "value-negative" : "value-positive")}>
                  {kpis.error > 0 ? "NEEDS ATTENTION" : "HEALTHY"}
                </div>
                <div className="stat-meta">
                  {kpis.error > 0 ? "Some runs failed. Review details." : "No failures detected."}
                </div>
              </div>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-header">
              <h2 className="section-title">PREDICTION HISTORY</h2>
              <div className="section-actions">
                <div className="text-xs font-semibold text-slate-600">{filtered.length} item(s)</div>
              </div>
            </div>

            <div className="glass-pro shadow-pro ring-soft rounded-[10px] p-6">
              <div className="mt-1 overflow-x-auto rounded-2xl bg-white/50 ring-soft">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Commodity</th>
                      <th className="px-4 py-3">Future Date</th>
                      <th className="px-4 py-3">Basis</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Runtime</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-800">
                    {filtered.length ? (
                      filtered.map((r) => (
                        <tr key={r.id} className="border-t border-slate-200/60">
                          <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                          <td className="px-4 py-3 font-semibold">{safeUpper(r.commodity)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{r.futureDate || "—"}</td>
                          <td className="px-4 py-3">
                            {(r.basisLabels?.length ? r.basisLabels : r.basisKeys)?.join(" • ") || "—"}
                          </td>
                          <td className="px-4 py-3">{statusPill(r.status)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {typeof r.runtimeMs === "number" ? `${Math.round(r.runtimeMs)} ms` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button className="toolbar-btn" type="button" onClick={() => showDetails(r)} title="Details">
                                <Eye className="h-4 w-4" />
                                Details
                              </button>

                              <button
                                className="toolbar-btn tt-btnDelete"
                                type="button"
                                onClick={() => askDelete(r)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                          {busy ? "Loading..." : "No predictions yet. Run your first forecast from the Prediction page."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

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
                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold text-slate-600">Raw payload (stored)</div>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 12,
                          lineHeight: 1.45,
                          color: "#0f172a",
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
                    </div>
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

          {/* Delete confirmation modal */}
          {delOpen && delRow ? (
            <div className="fixed inset-0 z-[13000]">
              <div
                className="absolute inset-0"
                style={{ background: "rgba(9,30,66,0.35)" }}
                onClick={closeDelete}
                aria-hidden="true"
              />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div style={{ width: "100%", maxWidth: 520, background: "#fff", border: "1px solid #dfe1e6" }}>
                  <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>DELETE RECORD</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#5e6c84" }}>This action can’t be undone.</div>
                  </div>

                  <div style={{ padding: 16, fontSize: 13, color: "#172b4d" }}>
                    You’re about to delete:{" "}
                    <b>
                      {safeUpper(delRow.commodity)} • {delRow.futureDate || "—"} • {fmtDate(delRow.createdAt)}
                    </b>

                    {delErr ? (
                      <div
                        style={{
                          marginTop: 10,
                          padding: 10,
                          border: "1px solid #ffbdad",
                          background: "#ffebe6",
                          color: "#de350b",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {delErr}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, color: "#7a869a" }}>
                        This will permanently remove the prediction history entry.
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      padding: 12,
                      background: "#f8f9fa",
                      borderTop: "1px solid #dfe1e6",
                    }}
                  >
                    <button className="toolbar-btn" type="button" onClick={closeDelete} disabled={deleting}>
                      CANCEL
                    </button>

                    <button className="tt-btn tt-btnDelete" type="button" onClick={confirmDelete} disabled={deleting}>
                      {deleting ? "DELETING..." : "DELETE"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </AppShell>
  );
}
