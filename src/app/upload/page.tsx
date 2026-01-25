// FILE: src/app/upload/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useSearchParams } from "next/navigation";

import {
  UploadCloud,
  FileText,
  Sheet,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Trash2,
} from "lucide-react";

type Busy = "idle" | "init" | "uploading" | "verifying" | "listing";
type Mode = "report" | "prices";

type DeleteModalState =
  | null
  | {
      open: true;
      mode: Mode;
      objectNames: string[];
      displayName: string;
      alsoDeletesGenerated: boolean;
    };

type InitResp =
  | { ok: true; bucket: string; objectName: string; uploadUrl: string; expiresMinutes: number }
  | { ok: false; error: string };

type DeleteResp = { ok: true; deleted: string[] } | { ok: false; error: string };

type CompleteResp =
  | {
      ok: true;
      file: { bucket: string; objectName: string; size?: string; contentType?: string; updated?: string };
    }
  | { ok: false; error: string };

type ListResp =
  | {
      ok: true;
      bucket: string;
      prefix: string;
      items: Array<{
        name: string;
        size?: string;
        contentType?: string;
        updated?: string;
        reportExists?: boolean;
        reportObjectName?: string;
        pricesExists?: boolean;
        pricesObjectName?: string;
      }>;
    }
  | { ok: false; error: string };

const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Australia/Sydney",
});

const LS_COMMODITY = "ai_commodity_selected";

const COMMODITIES = [
  { value: "sulphur", label: "Sulphur" },
  { value: "ethylene", label: "Ethylene" },
  { value: "pygas", label: "Pygas" },
  { value: "naphtha", label: "Naphtha" },
  { value: "urea", label: "Urea" },
];

function normalizeCommodity(input: string) {
  const v = (input ?? "").trim().toLowerCase();
  const hit = COMMODITIES.find((c) => c.value === v || c.label.toLowerCase() === v);
  return hit ? hit.value : "sulphur";
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function inferContentType(file: File) {
  const browserType = (file.type || "").trim();
  if (browserType) return browserType;

  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".tsv")) return "text/tab-separated-values";
  return "application/octet-stream";
}

function fmtDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : DATE_FMT.format(d);
}

function fmtSize(bytes?: string) {
  const n = Number(bytes ?? "0");
  if (!Number.isFinite(n) || n <= 0) return "-";
  const kb = n / 1024;
  const mb = kb / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  return `${n} B`;
}

function baseName(path?: string) {
  if (!path) return "-";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "-";
}

function isPdfRow(r: { name: string; contentType?: string }) {
  const n = (r.name || "").toLowerCase();
  const ct = (r.contentType || "").toLowerCase();
  return n.endsWith(".pdf") || ct === "application/pdf";
}

function isExcelRow(r: { name: string; contentType?: string }) {
  const n = (r.name || "").toLowerCase();
  const ct = (r.contentType || "").toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return true;

  return (
    ct === "application/vnd.ms-excel" ||
    ct === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ct === "text/csv" ||
    ct === "application/csv"
  );
}

export default function UploadPage() {
  
  const [commodity, setCommodity] = useState<string>(() => {
    if (typeof window === "undefined") return "sulphur";
    const v = window.localStorage.getItem(LS_COMMODITY);
    return normalizeCommodity((v ?? "sulphur").trim());
  });


  const [region] = useState("global");

  const [docTypeReport, setDocTypeReport] = useState("market_report");
  const [docTypePrices, setDocTypePrices] = useState("prices");
  const [title] = useState("");
  const [introOpen, setIntroOpen] = useState(true);

  const [rows, setRows] = useState<ListResp extends { ok: true } ? ListResp["items"] : any[]>([]);
  const [busyReport, setBusyReport] = useState<Busy>("idle");
  const [busyPrices, setBusyPrices] = useState<Busy>("idle");
  const [listBusy, setListBusy] = useState(false);

  function getBusy(mode: Mode): Busy {
    return mode === "report" ? busyReport : busyPrices;
  }
  function setBusyFor(mode: Mode, v: Busy) {
    if (mode === "report") setBusyReport(v);
    else setBusyPrices(v);
  }

  const [reportFile, setReportFile] = useState<File | null>(null);
  const [pricesFile, setPricesFile] = useState<File | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);


  const [msgReport, setMsgReport] = useState("");
  const [msgPrices, setMsgPrices] = useState("");

    // Auto-hide messages after a short delay
  useEffect(() => {
    if (!msgReport) return;

    const ok = msgReport.startsWith("✓") || msgReport.includes("triggered");
    const ms = ok ? 4000 : 8000;

    const t = window.setTimeout(() => setMsgReport(""), ms);
    return () => window.clearTimeout(t);
  }, [msgReport]);

  useEffect(() => {
    if (!msgPrices) return;

    const ok = msgPrices.startsWith("✓") || msgPrices.includes("triggered");
    const ms = ok ? 4000 : 8000;

    const t = window.setTimeout(() => setMsgPrices(""), ms);
    return () => window.clearTimeout(t);
  }, [msgPrices]);


  const reportInputRef = useRef<HTMLInputElement | null>(null);
  const pricesInputRef = useRef<HTMLInputElement | null>(null);

  const [dragReport, setDragReport] = useState(false);
  const [dragPrices, setDragPrices] = useState(false);

  const searchParams = useSearchParams();

  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(null);

  function isAllowedReportFile(f: File) {
    return (f.name || "").toLowerCase().endsWith(".pdf");
  }
  function isAllowedPricesFile(f: File) {
    const n = (f.name || "").toLowerCase();
    return n.endsWith(".csv") || n.endsWith(".xls") || n.endsWith(".xlsx");
  }

  async function refreshList() {
    if (listBusy) return; // guard: avoid double clicks
    setListBusy(true);

    const qs = new URLSearchParams({
      commodity: commodity.trim().toLowerCase(),
      region: region.trim().toLowerCase(),
    });

    try {
      const res = await fetch(`/api/upload/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await res.json().catch(() => null)) as ListResp | null;

      if (!res.ok || !data?.ok) {
        const err = (data as any)?.error || `List failed (HTTP ${res.status})`;
        setRows([]);
        setMsgReport(err);
        setMsgPrices(err);
        return;
      }

      setRows(Array.isArray(data.items) ? data.items : []);
      setRefreshTick((v) => v + 1);

    } catch (e: any) {
      const err = e?.message || "List failed (network error)";
      setRows([]);
      setMsgReport(err);
      setMsgPrices(err);
    } finally {
      setListBusy(false);
    }
  }


  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("upload:introDismissed");
    if (v === "1") setIntroOpen(false);
  }, []);

  function closeIntro() {
    setIntroOpen(false);
    try {
      window.localStorage.setItem("upload:introDismissed", "1");
    } catch {}
  }

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity, region]);

  // Load commodity from URL or localStorage
  useEffect(() => {
    const fromUrl = searchParams?.get("commodity");
    const fromLs = typeof window !== "undefined" ? window.localStorage.getItem(LS_COMMODITY) : null;
    const picked = (fromUrl ?? fromLs ?? "sulphur").trim();
    setCommodity(normalizeCommodity(picked));
  }, [searchParams]);

useEffect(() => {
  if (typeof window === "undefined") return;
  const v = commodity.trim().toLowerCase();
  if (!v) return;

  window.localStorage.setItem(LS_COMMODITY, v);
  window.dispatchEvent(new Event("ai:commodity"));
}, [commodity]);

  function openDeleteModal(args: { mode: Mode; objectNames: string[]; displayName: string; alsoDeletesGenerated: boolean }) {
    setDeleteModal({ open: true, ...args });
  }

  function closeDeleteModal() {
    setDeleteModal(null);
  }

  async function deleteFilesNow(objectNames: string[], mode: Mode, displayName: string) {
    const names = objectNames.map((s) => String(s ?? "").trim()).filter(Boolean);
    if (!names.length) return;

    const setMsg = mode === "report" ? setMsgReport : setMsgPrices;
    setMsg("");
    setBusyFor(mode, "verifying");

    try {
      const res = await fetch("/api/upload/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectNames: names }),
      });

      const data = (await res.json().catch(() => null)) as DeleteResp | null;

      if (!res.ok || !data?.ok) {
        setMsg(data?.ok ? "Delete failed" : data?.error || `Delete failed (HTTP ${res.status}).`);
        return;
      }

      setMsg(`✓ Deleted: ${displayName}`);
      await refreshList();
    } finally {
      setBusyFor(mode, "idle");
    }
  }

  const pdfRows = useMemo(() => {
    const list = rows.filter((r) => isPdfRow(r));
    list.sort((a: any, b: any) => {
      const ta = new Date(String(a.updated ?? 0)).getTime() || 0;
      const tb = new Date(String(b.updated ?? 0)).getTime() || 0;
      return tb - ta;
    });
    return list;
  }, [rows]);

  const excelRows = useMemo(() => {
    const list = rows.filter((r) => isExcelRow(r) && !isPdfRow(r));
    list.sort((a: any, b: any) => {
      const ta = new Date(String(a.updated ?? 0)).getTime() || 0;
      const tb = new Date(String(b.updated ?? 0)).getTime() || 0;
      return tb - ta;
    });
    return list;
  }, [rows]);

  const hasReport = pdfRows.length > 0;
  const hasPrices = excelRows.length > 0;

  async function generateReport(sourceObjectName: string) {
    if (getBusy("report") !== "idle") return;

    setMsgReport("");
    setBusyFor("report", "verifying");

    try {
      const res = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity, sourceObjectName }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (!res.ok) {
        let details = "";
        try {
          if (isJson) {
            const j = await res.json();
            details = String(j?.error || j?.message || "").trim();
          } else {
            details = (await res.text()).trim();
          }
        } catch {}

        if (details.length > 300) details = details.slice(0, 300) + "…";
        setMsgReport(`Generate failed (${res.status}): ${details || "Unknown error"}`);
        return;
      }

      try {
        if (isJson) await res.json();
        else await res.text();
      } catch {}

      setMsgReport("Report generation triggered. Refreshing list...");
      await refreshList();
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Network error";
      setMsgReport(`Generate failed: ${msg}`);
    } finally {
      setBusyFor("report", "idle");
    }
  }

  async function generatePrices(sourceObjectName: string) {
    if (getBusy("prices") !== "idle") return;

    setMsgPrices("");
    setBusyFor("prices", "verifying");

    try {
      const res = await fetch("/api/prices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity, region, sourceObjectName }),
      });

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");

      if (!res.ok) {
        let details = "";
        try {
          if (isJson) {
            const j = await res.json();
            details = String(j?.error || j?.message || "").trim();
          } else {
            details = (await res.text()).trim();
          }
        } catch {}
        if (details.length > 300) details = details.slice(0, 300) + "…";
        setMsgPrices(`Price generation failed (${res.status}): ${details || "Unknown error"}`);
        return;
      }

      try {
        if (isJson) await res.json();
        else await res.text();
      } catch {}

      setMsgPrices("Price generation triggered. Refreshing list...");
      await refreshList();
    } finally {
      setBusyFor("prices", "idle");
    }
  }

  async function uploadFile(mode: Mode) {
    const file = mode === "report" ? reportFile : pricesFile;
    if (!file) return;

    const setMsg = mode === "report" ? setMsgReport : setMsgPrices;

    setMsg("");
    setBusyFor(mode, "init");

    const initRes = await fetch("/api/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commodity,
        region,
        filename: file.name,
        contentType: inferContentType(file),
      }),
    });

    const initData = (await initRes.json()) as InitResp;

    if (!initRes.ok || !initData.ok) {
      setBusyFor(mode, "idle");
      setMsg(initData.ok ? "Init failed" : initData.error);
      return;
    }

    setBusyFor(mode, "uploading");

    const form = new FormData();
    form.append("file", file);
    form.append("objectName", initData.objectName);
    form.append("bucket", initData.bucket);
    form.append("contentType", inferContentType(file));

    const putRes = await fetch("/api/upload/put", { method: "POST", body: form });
    const putData = await putRes.json().catch(() => null);

    if (!putRes.ok || !putData?.ok) {
      setBusyFor(mode, "idle");
      setMsg(putData?.error ? String(putData.error) : `Upload failed (HTTP ${putRes.status}).`);
      return;
    }

    setBusyFor(mode, "verifying");

    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectName: initData.objectName,
        commodity,
        region,
        docType: mode === "report" ? docTypeReport : docTypePrices,
        title,
      }),
    });

    const completeData = (await completeRes.json()) as CompleteResp;

    if (!completeRes.ok || !completeData.ok) {
      setBusyFor(mode, "idle");
      setMsg(completeData.ok ? "Complete failed" : completeData.error);
      return;
    }

    setBusyFor(mode, "idle");
    setMsg(`✓ Upload successful: ${baseName(completeData.file.objectName)}`);

    if (mode === "report") setReportFile(null);
    else setPricesFile(null);

    await refreshList();
  }

  function Banner({ msg }: { msg: string }) {
    if (!msg) return null;
    const ok = msg.startsWith("✓") || msg.includes("triggered");
    return (
      <div
        className={cx(
          "mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm",
          ok
            ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/50 text-emerald-800"
            : "border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100/50 text-rose-800"
        )}
      >
        {ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
        <span className="flex-1">{msg}</span>
      </div>
    );
  }

  return (
    <AppShell title="Upload">
      <div className="workspace">
        {/* LEFT: sidebar controls */}
        <aside className="control-sidebar">
          <div className="module">
            <div className="module-header">Upload Parameters</div>
            <div className="module-content">
              <div className="input-row">
                <label className="input-label">Commodity</label>
                <select
                  className="tt-select"
                  value={commodity}
                  onChange={(e) => setCommodity(normalizeCommodity(e.target.value))}
                  disabled={listBusy || busyReport !== "idle" || busyPrices !== "idle"}
                >
                  {COMMODITIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-row">
                <label className="input-label">Document Type</label>
                <div className="tt-help">market_report, weekly, outage, freight, tender, policy, prices</div>
              </div>

              <div className="input-row">
                <label className="input-label">Workflow</label>
                <div className="tt-help">
                  Upload exactly two source files per commodity: <b>PDF report</b> + <b>prices sheet</b>.
                </div>
              </div>

              <button type="button" className="toolbar-btn" onClick={() => setIntroOpen(true)}>
                WHAT IS THIS PAGE?
              </button>
            </div>
          </div>

          {(msgReport || msgPrices) ? (
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#172b4d" }}>
              {msgReport || msgPrices}
            </div>
          ) : null}
        </aside>

        {/* RIGHT: main content */}
        <div className="main-panel">
          <section className="panel-section">
            <div className="section-header">
              <h2 className="section-title">UPLOAD SOURCES</h2>
              <div className="section-actions">
                <button
                  className="toolbar-btn"
                  type="button"
                  onClick={refreshList}
                  disabled={listBusy || busyReport !== "idle" || busyPrices !== "idle"}
                >
                  <RefreshCw className={cx("h-4 w-4", listBusy && "animate-spin")} />
                  {listBusy ? "REFRESHING..." : "REFRESH LIST"}
                </button>
              </div>
            </div>

            <div className="tt-section-subheader">
              <p className="tt-section-subtitle">
                Upload <b>two source files</b> per commodity — a <b>market report (PDF)</b> and a{" "}
                <b>historical prices file (CSV/XLS/XLSX)</b>. The report is used to extract events and produce the written
                summary, while the prices file calibrates the forecast with market history.
              </p>
            </div>

            {/* Hidden inputs (required for Choose buttons to work) */}
            <input
              ref={reportInputRef}
              className="hidden"
              type="file"
              accept=".pdf"
              disabled={busyReport !== "idle" || busyPrices !== "idle"}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (!f) return;

                if (!isAllowedReportFile(f)) {
                  setMsgReport("Report must be a PDF file.");
                  e.currentTarget.value = "";
                  return;
                }

                setReportFile(f);
                setMsgReport("");
                e.currentTarget.value = ""; // allow selecting same file again
              }}
            />

            <input
              ref={pricesInputRef}
              className="hidden"
              type="file"
              accept=".csv,.xls,.xlsx"
              disabled={busyReport !== "idle" || busyPrices !== "idle"}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (!f) return;

                if (!isAllowedPricesFile(f)) {
                  setMsgPrices("Prices must be CSV, XLS, or XLSX.");
                  e.currentTarget.value = "";
                  return;
                }

                setPricesFile(f);
                setMsgPrices("");
                e.currentTarget.value = "";
              }}
            />

            <div className="tt-uploadTableWrap" key={refreshTick}>
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Type</th>
                    <th>Generate</th>
                    <th>Size</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {/* ===== PENDING REPORT (LOCAL, NOT UPLOADED YET) ===== */}
                  {reportFile && !pdfRows.length && (
                    <tr className="tt-pendingRow">
                      <td>
                        <div className="tt-fileInfo">
                          <div className={cx("tt-fileIcon", "pdf")}>PDF</div>
                          <div className="tt-fileDetails">
                            <div className="tt-fileNameText">{reportFile.name}</div>
                            <div className="tt-fileMetaText">Pending upload</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="tt-typeBadge">Market Report</span>
                      </td>

                      <td className="tt-sizeText">{fmtSize(String(reportFile.size))}</td>
                      <td className="tt-dateText">—</td>

                      <td className="tt-actionCell">
                        <div className="tt-actionRow">
                          <button
                            className={cx("tt-btn", "tt-btnPrimary")}
                            type="button"
                            onClick={() => uploadFile("report")}
                            disabled={busyReport !== "idle"}
                          >
                            Upload
                          </button>

                          <button
                            className={cx("tt-btn", "tt-btnSecondary")}
                            type="button"
                            onClick={() => setReportFile(null)}
                            disabled={busyReport !== "idle"}
                          >
                            Clear
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* ===== REPORT (PDF) ===== */}
                  {pdfRows.length ? (
                    // CHANGED: removed .slice(0, 1) so refresh shows all rows
                    pdfRows.map((r: any) => {
                      const genExists = !!r.reportExists;
                      const generatedObjectName = r.reportObjectName;

                      return (
                        <React.Fragment key={`pdf-${r.name}`}>
                          <tr>
                            <td>
                              <div className="tt-fileInfo">
                                <div className={cx("tt-fileIcon", "pdf")}>PDF</div>
                                <div className="tt-fileDetails">
                                  <div className="tt-fileNameText" title={r.name}>
                                    {baseName(r.name)}
                                  </div>
                                  <div className="tt-fileMetaText">Report (PDF)</div>
                                </div>
                              </div>
                            </td>

                            <td>
                              <span className="tt-typeBadge">Market Report</span>
                            </td>

                            <td>
                               {!genExists ? (
                                  <button
                                    className={cx("tt-btn", "tt-btnPrimary")}
                                    type="button"
                                    disabled={busyReport !== "idle" || busyPrices !== "idle"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      generateReport(r.name);
                                    }}
                                  >
                                    Generate
                                  </button>
                                ) : (
                                  <span>Generated</span>
                                )}
                            </td>

                            <td className="tt-sizeText">{fmtSize(r.size)}</td>
                            <td className="tt-dateText">{fmtDate(r.updated)}</td>

                            <td className="tt-actionCell">
                              <div className="tt-actionRow">
                               

                                <button
                                  type="button"
                                  className="toolbar-btn tt-btnDelete"
                                  disabled={busyReport !== "idle" || busyPrices !== "idle"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const displayName = baseName(r.name);
                                    const hasGenerated = !!generatedObjectName;

                                    const toDelete: string[] = [r.name];
                                    if (hasGenerated) toDelete.push(generatedObjectName);

                                    openDeleteModal({
                                      mode: "report",
                                      objectNames: toDelete,
                                      displayName,
                                      alsoDeletesGenerated: hasGenerated,
                                    });
                                  }}
                                >
                                   <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>

                          <tr>
                            <td colSpan={6} className="tt-sectionDivider" />
                          </tr>
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <>
                      <tr>
                        <td>
                          <div className="tt-fileInfo">
                            <div className={cx("tt-fileIcon", "pdf")}>PDF</div>
                            <div className="tt-fileDetails">
                              <div className="tt-fileNameText">No report uploaded</div>
                              <div className="tt-fileMetaText">Report (PDF)</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="tt-typeBadge">Market Report</span>
                        </td>

                        <td className="tt-sizeText">—</td>
                        <td className="tt-dateText">—</td>

                        <td className="tt-actionCell">
                          <div className="tt-actionRow">
                            <button
                              type="button"
                              className={cx("tt-btn", "tt-btnSecondary")}
                              disabled={busyReport !== "idle" || busyPrices !== "idle"}
                              onClick={() => reportInputRef.current?.click()}
                            >
                              Select report
                            </button>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td colSpan={6} className="tt-sectionDivider" />
                      </tr>
                    </>
                  )}

                  {/* ===== PENDING PRICES (LOCAL, NOT UPLOADED YET) ===== */}
                  {pricesFile && !excelRows.length && (
                    <tr className="tt-pendingRow">
                      <td>
                        <div className="tt-fileInfo">
                          <div className={cx("tt-fileIcon", "excel")}>XLS</div>
                          <div className="tt-fileDetails">
                            <div className="tt-fileNameText">{pricesFile.name}</div>
                            <div className="tt-fileMetaText">Pending upload</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="tt-typeBadge">Price Data</span>
                      </td>

                      <td className="tt-sizeText">{fmtSize(String(pricesFile.size))}</td>
                      <td className="tt-dateText">—</td>

                      <td className="tt-actionCell">
                        <div className="tt-actionRow">
                          <button
                            className={cx("tt-btn", "tt-btnPrimary")}
                            type="button"
                            onClick={() => uploadFile("prices")}
                            disabled={busyPrices !== "idle"}
                          >
                            Upload
                          </button>

                          <button
                            className={cx("tt-btn", "tt-btnDelete")}
                            type="button"
                            onClick={() => setPricesFile(null)}
                            disabled={busyPrices !== "idle"}
                          >
                            Clear
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* ===== PRICES (EXCEL/CSV) ===== */}
                  {excelRows.length ? (
                    // CHANGED: removed .slice(0, 1) so refresh shows all rows
                    excelRows.map((r: any) => {
                      const genExists = !!r.pricesExists;
                      const generatedObjectName = r.pricesObjectName;

                      return (
                        <tr key={`xls-${r.name}`}>
                          <td>
                            <div className="tt-fileInfo">
                              <div className={cx("tt-fileIcon", "excel")}>XLS</div>
                              <div className="tt-fileDetails">
                                <div className="tt-fileNameText" title={r.name}>
                                  {baseName(r.name)}
                                </div>
                                <div className="tt-fileMetaText">Prices (Excel / CSV)</div>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span className="tt-typeBadge">Price Data</span>
                          </td>

                           <td>
                               {!genExists ? (
                                <button
                                  className={cx("tt-btn", "tt-btnPrimary")}
                                  type="button"
                                  disabled={busyReport !== "idle" || busyPrices !== "idle"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    generatePrices(r.name);
                                  }}
                                >
                                  Generate
                                </button>
                              ) : (
                                <span>Generated</span>
                              )}    

                           </td>

                          <td className="tt-sizeText">{fmtSize(r.size)}</td>
                          <td className="tt-dateText">{fmtDate(r.updated)}</td>

                          <td className="tt-actionCell">
                            <div className="tt-actionRow">
                              <button
                                type="button"
                                className="toolbar-btn tt-btnDelete"
                                disabled={busyReport !== "idle" || busyPrices !== "idle"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const displayName = baseName(r.name);
                                  const hasGenerated = !!generatedObjectName;

                                  const toDelete: string[] = [r.name];
                                  if (hasGenerated) toDelete.push(generatedObjectName);

                                  openDeleteModal({
                                    mode: "prices",
                                    objectNames: toDelete,
                                    displayName,
                                    alsoDeletesGenerated: hasGenerated,
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td>
                        <div className="tt-fileInfo">
                          <div className={cx("tt-fileIcon", "excel")}>XLS</div>
                          <div className="tt-fileDetails">
                            <div className="tt-fileNameText">No prices uploaded</div>
                            <div className="tt-fileMetaText">Prices (Excel / CSV)</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="tt-typeBadge">Price Data</span>
                      </td>

                      <td className="tt-sizeText">—</td>
                      <td className="tt-dateText">—</td>

                      <td className="tt-actionCell">
                        <div className="tt-actionRow">
                          <button
                            type="button"
                            className={cx("tt-btn", "tt-btnSecondary")}
                            disabled={busyReport !== "idle" || busyPrices !== "idle"}
                            onClick={() => pricesInputRef.current?.click()}
                          >
                            Select Prices file
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Keep Banner available (you had it earlier; not removing any functionality) */}
            <Banner msg={msgReport || msgPrices} />
          </section>
        </div>

        {/* Delete modal */}
        {deleteModal?.open ? (
          <div className="fixed inset-0 z-[13000]">
            <div
              className="absolute inset-0"
              style={{ background: "rgba(9,30,66,0.35)" }}
              onClick={closeDeleteModal}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div style={{ width: "100%", maxWidth: 520, background: "#fff", border: "1px solid #dfe1e6" }}>
                <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>DELETE FILE</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#5e6c84" }}>This action can’t be undone.</div>
                </div>

                <div style={{ padding: 16, fontSize: 13, color: "#172b4d" }}>
                  You’re about to delete: <b>{deleteModal.displayName}</b>
                  {deleteModal.alsoDeletesGenerated ? (
                    <div style={{ marginTop: 8, color: "#7a869a" }}>
                      This will also delete the generated output linked to this file.
                    </div>
                  ) : null}
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
                  <button className="toolbar-btn" type="button" onClick={closeDeleteModal}>
                    CANCEL
                  </button>
                  <button
                    className="tt-btn tt-btnDelete"
                    type="button"
                    onClick={async () => {
                      const m = deleteModal;
                      closeDeleteModal();
                      await deleteFilesNow(m.objectNames, m.mode, m.displayName);
                    }}
                  >
                    DELETE
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Intro modal */}
        {introOpen ? (
          <div className="fixed inset-0 z-[12000]">
            <div
              className="absolute inset-0"
              style={{ background: "rgba(9,30,66,0.35)" }}
              onClick={closeIntro}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div style={{ width: "100%", maxWidth: 720, background: "#fff", border: "1px solid #dfe1e6" }}>
                <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>
                    UPLOAD SOURCES FOR THE FORECAST
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#5e6c84" }}>
                    Two files power the analysis and improve the language quality of the report.
                  </div>
                </div>

                <div style={{ padding: 16, fontSize: 13, color: "#172b4d", lineHeight: 1.6 }}>
                  <p>
                    Upload <b>two source files</b> for each commodity: a <b>market report (PDF)</b> and a{" "}
                    <b>historical prices file (CSV/XLS/XLSX)</b>.
                  </p>
                  <p style={{ marginTop: 10, color: "#5e6c84" }}>
                    The report is used to extract events and produce a clear written summary. The prices file calibrates
                    the forecast with real market history.
                  </p>
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
                  <button className="toolbar-btn" type="button" onClick={closeIntro}>
                    GOT IT
                  </button>
                  <button
                    className="toolbar-btn"
                    style={{ borderColor: "#0052cc", color: "#0052cc" }}
                    type="button"
                    onClick={() => setIntroOpen(false)}
                  >
                    START UPLOADING
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
