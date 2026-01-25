// FILE: src/app/upload/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useSearchParams } from "next/navigation";

import {
  Tag,
  Info,
  UploadCloud,
  FileText,
  Sheet,
  XCircle,
  CheckCircle2,
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
  const [commodity, setCommodity] = useState<string>("sulphur");
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

  const [msgReport, setMsgReport] = useState("");
  const [msgPrices, setMsgPrices] = useState("");

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

  // clear previous list errors (optional)
  // setMsgReport("");
  // setMsgPrices("");

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

  // Persist commodity selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = commodity.trim();
    if (v) window.localStorage.setItem(LS_COMMODITY, v.toLowerCase());
  }, [commodity]);


  function openDeleteModal(args: {
    mode: Mode;
    objectNames: string[];
    displayName: string;
    alsoDeletesGenerated: boolean;
  }) {
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

  const pdfRows = useMemo(() => rows.filter((r) => isPdfRow(r)), [rows]);
  const excelRows = useMemo(() => rows.filter((r) => isExcelRow(r) && !isPdfRow(r)), [rows]);

  const hasReport = pdfRows.length > 0;
  const hasPrices = excelRows.length > 0;

async function generateReport(sourceObjectName: string) {
   if (getBusy("report") !== "idle") return; // hard guard

  setMsgReport("");
  setBusyFor("report", "verifying");

  try {
    const res = await fetch("/api/report/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commodity, sourceObjectName }),
    });

    // Try JSON first (both ok and error), fallback to text
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
      } catch {
        // ignore parsing errors
      }

      // Prevent flooding UI (e.g., Cloudflare HTML)
      if (details.length > 300) details = details.slice(0, 300) + "…";

      setMsgReport(`Generate failed (${res.status}): ${details || "Unknown error"}`);
      return;
    }

    // Success payload (keep it for future use)
    let okPayload: any = null;
    try {
      okPayload = isJson ? await res.json() : await res.text();
    } catch {
      okPayload = null;
    }

    setMsgReport("Report generation triggered. Refreshing list...");
    await refreshList();

    // Optional: if your API returns something useful
    // e.g., okPayload.jobId, okPayload.objectName, etc.
    // console.log("generateReport ok:", okPayload);
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

  function UploadBox(props: {
    mode: Mode;
    file: File | null;
    setFile: (f: File | null) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    drag: boolean;
    setDrag: (v: boolean) => void;
    accept: string;
    hint: string;
  }) {
    const { mode, file, setFile, inputRef, drag, setDrag, accept, hint } = props;

    const titleTxt = mode === "report" ? "Upload Report PDF" : "Upload Prices File";
    const Icon = mode === "report" ? FileText : Sheet;
    const busy = getBusy(mode);

    return (
      <div className="mt-6">
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept={accept}
          disabled={busy !== "idle"}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) return setFile(null);

            if (mode === "report") {
              if (!isAllowedReportFile(f)) {
                setMsgReport("Report must be a PDF file.");
                setFile(null);
                return;
              }
              setMsgReport("");
              setFile(f);
              return;
            }

            if (!isAllowedPricesFile(f)) {
              setMsgPrices("Prices must be CSV, XLS, or XLSX.");
              setFile(null);
              return;
            }
            setMsgPrices("");
            setFile(f);
          }}
        />

        <div
          role="button"
          tabIndex={0}
          aria-disabled={busy !== "idle"}
          onClick={() => {
            if (busy !== "idle") return;
            inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (busy !== "idle") return;
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busy !== "idle") return;
            setDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busy !== "idle") return;
            setDrag(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(false);
            if (busy !== "idle") return;

            const dropped = e.dataTransfer.files?.[0] ?? null;
            if (!dropped) return;

            if (mode === "report" && !isAllowedReportFile(dropped)) {
              setMsgReport("Report must be a PDF file.");
              setFile(null);
              return;
            }
            if (mode === "prices" && !isAllowedPricesFile(dropped)) {
              setMsgPrices("Prices must be CSV, XLS, or XLSX.");
              setFile(null);
              return;
            }

            setFile(dropped);
          }}
          className={cx(
            "group relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300",
            "cursor-pointer shadow-sm",
            drag
              ? "border-indigo-400 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-lg scale-[1.02]"
              : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-gradient-to-br hover:from-slate-50 hover:to-white",
            busy !== "idle" && "cursor-not-allowed opacity-60"
          )}
        >
          <div
            className={cx(
              "absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 transition-opacity duration-300",
              "group-hover:opacity-100"
            )}
          />

          <div className="relative">
           <div
            className={cx(
              "mx-auto grid h-16 w-16 place-items-center rounded-2xl shadow-md transition-all duration-300",
              "bg-[linear-gradient(135deg,#3FA575,#63C989)]",
              drag ? "scale-110" : "group-hover:scale-105"
            )}
          >
            <UploadCloud className="h-8 w-8 text-white" />
          </div>

            <div className="mt-5">
              <div className="text-base font-bold text-slate-900">{titleTxt}</div>
              <div className="mt-2 text-sm text-slate-600">{hint}</div>
              <div className="mt-3 text-xs font-medium text-slate-500">Drag & drop here or click to browse</div>
            </div>

            {file && (
              <div className="mx-auto mt-6 max-w-md">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white shadow-sm">
                    <Icon className="h-5 w-5 pf-accent" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate font-mono text-xs font-semibold text-slate-900" title={file.name}>
                      {file.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{fmtSize(String(file.size))}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-400 shadow-sm transition-all hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

<div className="mt-5 flex items-center justify-end gap-3">
  <button
    className={cx("pf-btn pf-btn-secondary")}
    onClick={refreshList}
    disabled={listBusy || busy !== "idle"}
    type="button"
  >
    {listBusy ? (
      <>
        <Clock className="h-4 w-4 animate-spin" />
        Refreshing...
      </>
    ) : (
      <>
        <Clock className="h-4 w-4" />
        Refresh
      </>
    )}
  </button>

  <button
    className={cx("pf-btn pf-btn-primary")}
    onClick={() => uploadFile(mode)}
    disabled={!file || busy !== "idle"}
    type="button"
  >
    {busy === "init" ? (
      <>
        <Clock className="h-4 w-4 animate-spin" />
        Preparing...
      </>
    ) : busy === "uploading" ? (
      <>
        <Clock className="h-4 w-4 animate-spin" />
        Uploading...
      </>
    ) : busy === "verifying" ? (
      <>
        <Clock className="h-4 w-4 animate-spin" />
        Verifying...
      </>
    ) : (
      <>
        <UploadCloud className="h-4 w-4" />
        Upload File
      </>
    )}
  </button>
</div>

      </div>
    );
  }

  function Card(props: {
    title: string;
    icon: React.ReactNode;
    mode: Mode;
    rows: typeof rows;
    msg: string;
    hasFile: boolean;
    childrenWhenMissing: React.ReactNode;
  }) {
    const { title, icon, mode, rows: cardRows, msg, hasFile, childrenWhenMissing } = props;
    const subtitle = mode === "report" ? "One PDF required per commodity" : "One Excel/CSV required per commodity";
    const busy = getBusy(mode);

    return (
<div className="pf-card">
  {/* Header */}
  <div className="pf-card-header">
    <div className="flex items-start gap-3">
      <span className="mt-1 text-emerald-600">{icon}</span>

      <div className="flex flex-col">
        <div className="pf-title-md" style={{ fontSize: 20, gap: 10 }}>
          {title}
        </div>
        <div className="mt-1 text-sm font-medium text-slate-500">{subtitle}</div>
      </div>
    </div>

    <span className={cx("pf-status", busy !== "idle" && "opacity-90")}>
      {busy === "idle" ? "Ready" : busy.charAt(0).toUpperCase() + busy.slice(1)}
    </span>
  </div>

  <Banner msg={msg} />

  {/* Body */}
  <div className="mt-6 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200/70">
    {cardRows.length ? (
      <div className="divide-y divide-slate-200">
        {cardRows.map((r) => {
          const exists = mode === "report" ? !!r.reportExists : !!r.pricesExists;
          const objectName = mode === "report" ? r.reportObjectName : r.pricesObjectName;

          return (
            <div key={r.name} className="px-5 py-4 transition hover:bg-emerald-50/20">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-200 ring-1 ring-slate-200/70">
                  {mode === "report" ? (
                    <FileText className="h-6 w-6 text-slate-700" />
                  ) : (
                    <Sheet className="h-6 w-6 text-slate-700" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[15px] font-semibold tracking-tight text-slate-900"
                    title={r.name}
                  >
                    {baseName(r.name)}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200/70">
                      {fmtSize(r.size)}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600">{fmtDate(r.updated)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/70 pt-4">
                {!exists ? (
                  <button
                    className={cx("pf-btn btn-primary-sm", "h-10 w-auto px-5")}
                    onClick={() => (mode === "report" ? generateReport(r.name) : generatePrices(r.name))}
                    disabled={busy !== "idle"}
                  >
                    Generate
                  </button>
                ):  <div
                      className={cx(
                        "h-10 inline-flex items-center px-5",
                        "rounded-xl border border-slate-300 bg-slate-50",
                        "text-sm font-semibold text-slate-700",
                        "select-none"
                      )}
                      aria-label="Generated"
                    >
                      Generated
                    </div>}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();

                    const displayName = baseName(r.name);
                    const hasGenerated = !!objectName;

                    const toDelete: string[] = [r.name];
                    if (hasGenerated) toDelete.push(objectName!);

                    openDeleteModal({
                      mode,
                      objectNames: toDelete,
                      displayName,
                      alsoDeletesGenerated: hasGenerated,
                    });
                  }}
                  disabled={busy !== "idle"}
                  className="pf-btn pf-btn-danger"
                >
                  <Trash2 className="h-5 w-5" />
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ) : null}
  </div>

  {!hasFile && <div className="mt-6">{childrenWhenMissing}</div>}
</div>

    );
  }

  return (
    <AppShell title="Upload">
  <div className="pf-page">
    <div className="pf-container-ref">
      <section>
  {introOpen ? (
    <div className="fixed inset-0 z-[12000]">
      {/* backdrop */}
      <div className="absolute inset-0 pf-modal-backdrop" onClick={closeIntro} aria-hidden="true" />

        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="pf-modal">
            {/* header */}
            <div className="pf-modal-head">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgba(63,165,117,0.12)] ring-1 ring-emerald-200/60">
                    <Info className="h-5 w-5 text-emerald-700" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900 tracking-tight">
                      Upload Sources for the Forecast
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Two files power the analysis and improve the language quality of the report.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeIntro}
                  className="grid h-9 w-9 place-items-center rounded-2xl bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-700"
                  title="Close"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="px-6 py-6">
              <div className="space-y-4 text-sm text-slate-700 leading-6">
                <p>
                  On this page, you upload <span className="font-semibold text-slate-900">two source files</span> for each
                  commodity: a <span className="font-semibold text-slate-900">market report (PDF)</span> and a{" "}
                  <span className="font-semibold text-slate-900">historical prices file (CSV/XLS/XLSX)</span>.
                </p>

                <p>
                  The system uses the report to extract key market events and produce a{" "}
                  <span className="font-semibold text-slate-900">clear written summary</span>, and it uses the prices file
                  to calibrate the forecast with <span className="font-semibold text-slate-900">real market history</span>.
                </p>
              </div>

              {/* cards */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">Report PDF</div>
                      <div className="text-xs text-slate-600">Events → explanation → better wording</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60">
                      <Sheet className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">Historical Prices</div>
                      <div className="text-xs text-slate-600">Trend + levels → stronger forecast</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="pf-modal-foot">
              <button type="button" onClick={closeIntro} className="pf-btn w-auto px-5">
                Got it
              </button>

              <button type="button" onClick={() => setIntroOpen(false)} className="pf-btn-primary w-auto px-5">
                Start uploading
              </button>
            </div>
          </div>
        </div>
    </div>
  ) : null}

  <div className="grid gap-6 lg:grid-cols-2">
    {/* cards unchanged */}
    <Card
      title="Report (PDF)"
      icon={<FileText className="h-6 w-6" />}
      mode="report"
      rows={pdfRows}
      msg={msgReport}
      hasFile={hasReport}
      childrenWhenMissing={
        <UploadBox
          mode="report"
          file={reportFile}
          setFile={setReportFile}
          inputRef={reportInputRef}
          drag={dragReport}
          setDrag={setDragReport}
          accept=".pdf"
          hint="Upload the report PDF (required)."
        />
      }
    />

    <Card
      title="Prices (Excel / CSV)"
      icon={<Sheet className="h-6 w-6" />}
      mode="prices"
      rows={excelRows}
      msg={msgPrices}
      hasFile={hasPrices}
      childrenWhenMissing={
        <UploadBox
          mode="prices"
          file={pricesFile}
          setFile={setPricesFile}
          inputRef={pricesInputRef}
          drag={dragPrices}
          setDrag={setDragPrices}
          accept=".csv,.xls,.xlsx"
          hint="Upload the prices file (required): CSV/XLS/XLSX."
        />
      }
    />
  </div>
</section>
        <section>
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200/80">
            
             <div className="mb-3 flex items-center justify-between gap-3">
              <div className="pf-sidebar-title">Tips</div>

              <button
                type="button"
                onClick={() => setIntroOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <Info className="h-4 w-4 pf-accent" />
                What is this page?
              </button>
            </div>

            <div className="mt-2 text-sm text-slate-600">
              This page expects exactly two source files per commodity: one PDF report + one prices sheet.
            </div>

            <div className="pf-section">
              <div className="pf-secondary-info">
  <label className="pf-section-label">Commodity</label>

  <div className="pf-field mt-2">
    <span className="pf-field-icon">
      <Tag className="h-5 w-5" />
    </span>

    <select
      className="pf-select"
      value={commodity}
      onChange={(e) => {
        const next = normalizeCommodity(e.target.value);
        setCommodity(next);
        try {
          window.localStorage.setItem(LS_COMMODITY, next);
        } catch {}
      }}
      disabled={listBusy || busyReport !== "idle" || busyPrices !== "idle"}
    >
      {COMMODITIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  </div>
</div>


              <div className="pf-secondary-info">
                <label className="pf-section-label">Document Type</label>
                <div className="font-semibold">market_report, weekly, outage, freight, tender, policy, prices</div>
              </div>

              <div className="pf-secondary-info">
                <label className="pf-section-label">Workflow</label>
                <div className="font-semibold">If a source is missing, upload it in the matching card.</div>
              </div>
            </div>
          </div>
        </section>



      {deleteModal?.open ? (
<div className="fixed inset-0 z-[13000]">
  {/* backdrop */}
  <div
    className="absolute inset-0 pf-modal-backdrop"
    onClick={closeDeleteModal}
    aria-hidden="true"
  />

  <div className="absolute inset-0 flex items-center justify-center p-4">
    <div className="pf-message">
      {/* head */}
      <div className="pf-message-head">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgba(63,165,117,0.12)] ring-1 ring-emerald-200/60">
              <Trash2 className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900 tracking-tight">
                Delete file
              </div>
              <div className="mt-1 text-sm text-slate-600">
                This action can’t be undone.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={closeDeleteModal}
            disabled={getBusy(deleteModal.mode) !== "idle"}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-2xl bg-white text-slate-500 ring-1 ring-slate-200",
              "hover:bg-slate-50 hover:text-slate-700",
              getBusy(deleteModal.mode) !== "idle" && "cursor-not-allowed opacity-50"
            )}
            title="Close"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="px-6 py-6">
        <div className="text-sm text-slate-700">You’re about to delete:</div>

        <div className="mt-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">File</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 break-words">
            {deleteModal.displayName}
          </div>

          {deleteModal.alsoDeletesGenerated ? (
            <div className="mt-3 text-xs text-slate-600">
              This will also delete the generated output linked to this file.
            </div>
          ) : null}
        </div>
      </div>

      {/* foot */}
      <div className="pf-message-foot">
        <button
          type="button"
          onClick={closeDeleteModal}
          disabled={getBusy(deleteModal.mode) !== "idle"}
          className={cx("pf-btn w-auto px-5", getBusy(deleteModal.mode) !== "idle" && "opacity-50")}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={async () => {
            const m = deleteModal;
            closeDeleteModal();
            await deleteFilesNow(m.objectNames, m.mode, m.displayName);
          }}
          disabled={getBusy(deleteModal.mode) !== "idle"}
          className={cx(
            "pf-btn pf-btn-danger w-auto px-5 border-rose-200 bg-rose-50 text-rose-700",
            "hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800",
            getBusy(deleteModal.mode) !== "idle" && "cursor-not-allowed opacity-50"
          )}
        >
          Delete
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
