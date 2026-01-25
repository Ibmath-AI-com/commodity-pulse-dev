// FILE: src/app/reports/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  FileText,
  Filter,
  RefreshCwIcon,
  Download,
  ExternalLink,
  X,
} from "lucide-react";

type ReportStatus = "Ready" | "Running" | "Failed";

type ReportListItem = {
  id: string;
  createdAt: string; // ISO
  commodity: string;
  region: string;
  fileName: string;

  source: "incoming" | "archive";
  active: boolean;

  objectName: string;      // incoming/... or archive/...
  cleanObjectName: string; // clean/...json
  hasClean: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function ReportsPage() {
  const [commodity, setCommodity] = useState("");
  const [region, setRegion] = useState("");

  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<ReportListItem | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [selectedReportErr, setSelectedReportErr] = useState<string | null>(null);
  const [selectedReportLoading, setSelectedReportLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [fromDate, setFromDate] = useState<string>(""); // YYYY-MM-DD from <input type="date">

  const [status, setStatus] = useState<"idle" | "running">("idle"); // keep your header pill UI
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const [viewJson, setViewJson] = useState<any | null>(null);

  async function openGeneratedReport() {
    if (!selected?.hasClean) return;
    setViewOpen(true);
    setViewLoading(true);
    setViewErr(null);
    setViewJson(null);

    try {
      const res = await fetch(`/api/report/read?objectName=${encodeURIComponent(selected.cleanObjectName)}`, {
        cache: "no-store",
      });

      const txt = await res.text().catch(() => "");
      let data: any;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch {
        throw new Error(`Non-JSON response (${res.status}): ${txt.slice(0, 160)}`);
      }

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error ?? `Read failed (${res.status})`);
      }

      setViewJson(data.kind === "json" ? data.json : { kind: data.kind, text: data.text });
    } catch (e: any) {
      setViewErr(e?.message ?? "Failed to load generated report");
    } finally {
      setViewLoading(false);
    }
  }

    async function refresh() {
      setLoading(true);
      setLoadErr(null);
      try {
        const res = await fetch("/api/report/list", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error ?? `List failed (${res.status})`);
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        setLoadErr(e?.message ?? "Failed to load");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

  useEffect(() => {
    refresh();
  }, []);

const rows = useMemo(() => {
  const c = commodity.trim().toLowerCase();

  // fromDate is "YYYY-MM-DD" from <input type="date">
  const fromTs =
    fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)
      ? new Date(fromDate + "T00:00:00").getTime()
      : null;

  return items.filter((it) => {
    // Commodity filter
    const okCommodity = !c || String(it.commodity ?? "").toLowerCase().includes(c);

    // Status filter
    const isActive = Boolean(it.active);
    const okStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);

    // Date filter (createdAt can be number or string)
    const createdTs =
      typeof it.createdAt === "number" ? it.createdAt : new Date(String(it.createdAt ?? "")).getTime();

    const okDate =
      fromTs == null || (Number.isFinite(createdTs) && createdTs >= fromTs);

    return okCommodity && okStatus && okDate;
  });
}, [items, commodity, statusFilter, fromDate]);


  function statusFromItem(it: ReportListItem): ReportStatus {
    // You asked: "View generated report read from clean"
    // So "Ready" means clean exists, otherwise "Failed".
    return it.hasClean ? "Ready" : "Failed";
  }

  async function openRow(it: ReportListItem) {
    setSelected(it);
    setSelectedReport(null);
    setSelectedReportErr(null);

    if (!it.hasClean) return; // no clean report to load

    setSelectedReportLoading(true);
    try {
      const res = await fetch(`/api/report/read?objectName=${encodeURIComponent(it.cleanObjectName)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `Read failed (${res.status})`);
      setSelectedReport(data.kind === "json" ? data.json : { text: data.text, kind: data.kind });
    } catch (e: any) {
      setSelectedReportErr(e?.message ?? "Failed to read generated report");
      setSelectedReport(null);
    } finally {
      setSelectedReportLoading(false);
    }
  }

  async function openSigned(objectName: string) {
    const res = await fetch(`/api/files/signedread?objectName=${encodeURIComponent(objectName)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.url) throw new Error(data?.error ?? "Signed URL failed");
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  async function generateMockReport() {
    // Keep your button; now it just refreshes.
    setStatus("running");
    try {
      await refresh();
    } finally {
      setStatus("idle");
    }
  }

  return (
    <AppShell title="Reports">
       <div className="pf-page">
        <div className="pf-container-ref">
        {/* Left: filters + list */}
        <section>
          {/* Filters (fancy header card) */}
          <div className="rounded-3xl bg-white p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Filter className="h-7 w-7 text-emerald-600" />
                  <div className="text-2xl font-bold text-slate-900">Filters</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 ring-soft">
                    {status === "idle" ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Idle
                      </>
                    ) : (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Running
                      </>
                    )}
                  </span>

                  <button
                    className="pf-btn pf-btn-secondary "
                    onClick={generateMockReport}
                    disabled={status === "running"}
                    title="Refresh from GCS"
                  >
                    <RefreshCwIcon className="h-3 w-3" />
                    {status === "running" ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="group relative rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-7 transition hover:-translate-y-1 hover:border-emerald-600 hover:shadow-[0_12px_32px_rgba(63,165,117,0.12)]">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#683E00]">Commodity</div>
                    <div className="mt-1 text-[11px] text-slate-500">Select Commodity, e.g., sulphur</div>
                    <input
                      type="text"
                      placeholder="sulphur"
                      className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-300"
                      value={commodity}
                      onChange={(e) => setCommodity(e.target.value)}
                    />
                  </div>

                  {/* Status filter */}
                  <div className="group relative rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-7 transition hover:-translate-y-1 hover:border-emerald-600 hover:shadow-[0_12px_32px_rgba(63,165,117,0.12)]">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#683E00]">Status</div>
                    <div className="mt-1 text-[11px] text-slate-500">Active (incoming) vs Inactive (archive)</div>
                    <select
                      className="mt-3 w-full rounded-xl  px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-300"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Date filter */}
                  <div className="group relative rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-7 transition hover:-translate-y-1 hover:border-emerald-600 hover:shadow-[0_12px_32px_rgba(63,165,117,0.12)]">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#683E00]">Date</div>
                    <div className="mt-1 text-[11px] text-slate-500">Show reports created on/after this date</div>
                    <input
                      type="date"
                      className="mt-3 w-full rounded-xl  px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-indigo-300"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
              </div>


              {loadErr ? (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                  {loadErr}
                </div>
              ) : null}
            </div>
          </div>

          {/* Report history table */}
           <div className="rounded-3xl bg-white p-10 shadow-[0_8px_32px_rgba(0,0,0,0.08)] mt-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
  
                <div className="flex items-start gap-3">
                  <FileText className="h-6 w-6 text-emerald-600" />
                  <div className="text-2xl font-bold text-slate-900">Report files</div>
                </div>

                <div className="text-xs font-semibold text-gray-400">
                  {loading ? "Loading..." : `${rows.length} items`}
                </div>
              </div>

         

              {/* Table */}
              <div className="overflow-x-auto mt-7">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="rounded-tl-xl bg-slate-50 px-4 py-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-[#683E00] border-b-2 border-slate-200">Date</th>
                      <th className="rounded-tl-xl bg-slate-50 px-4 py-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-[#683E00] border-b-2 border-slate-200">Commodity</th>
                      <th className="rounded-tl-xl bg-slate-50 px-4 py-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-[#683E00] border-b-2 border-slate-200">File</th>
                      <th className="rounded-tl-xl bg-slate-50 px-4 py-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-[#683E00] border-b-2 border-slate-200">Status</th>
                      <th className="rounded-tl-xl bg-slate-50 px-4 py-4 text-left text-[11px] font-extrabold uppercase tracking-wide text-[#683E00] border-b-2 border-slate-200">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.length ? (
                      rows.map((it) => {
                        const st = statusFromItem(it);
                        return (
                          <tr key={it.id} className="transition hover:bg-emerald-50/30">
                            <td className="border-b border-slate-100 px-4 py-4 align-top">
                              <div className="text-xs text-slate-900">{formatDate(it.createdAt)}</div>
                            </td>

                            <td className="border-b border-slate-100 px-4 py-4 align-top">
                              <div className="text-xs text-slate-900">{it.commodity}</div>
                            </td>
                            
                            <td className="border-b border-slate-100 px-4 py-4 align-top">
                              <div className="text-xs text-slate-900">{it.fileName}</div>
                            </td>

                           
                            <td className="border-b border-slate-100 px-4 py-4 align-top">
                              <ActivePill active={it.active} />
                            </td>

                            <td className="border-b border-slate-100 px-4 py-4 align-top">
                              <button
                                onClick={() => openRow(it)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                title={it.hasClean ? "View generated report (clean)" : "No generated report found in clean"}
                              >
                                <ExternalLink className="h-4 w-4" />
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                          {loading ? "Loading..." : "No reports match your filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            
          </div>
        </section>
        {/* Right: detail panel */}
        <section>
          <div className="pf-sidebar">
              <div className="mb-3 flex items-center justify-between gap-3">
                 <div className="pf-sidebar-title">Details</div>

                  {selected && (
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      onClick={() => {
                        setSelected(null);
                        setSelectedReport(null);
                        setSelectedReportErr(null);
                        setViewOpen(false);
                        setViewErr(null);
                        setViewJson(null);
                      }}
                      title="Clear selection"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  )}
                </div>

            {!selected ? (
              <div className="mt-6 rounded-2xl bg-white/55 p-4 text-sm text-slate-700 ring-soft">
                No report selected.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="group relative rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-7 transition hover:-translate-y-1 hover:border-emerald-600 hover:shadow-[0_12px_32px_rgba(63,165,117,0.12)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#683E00]">File</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{selected.fileName}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {selected.source === "incoming" ? "incoming (active)" : "archive (inactive)"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <KV label="Commodity" value={selected.commodity} />
                    <KV label="Created" value={formatDate(selected.createdAt)} />
                  </div>
                </div>

                <div className="grid gap-3">
                  {/* Download: always, but uses selected.objectName which is already incoming or archive */}
                  <button
                    className="pf-btn pf-btn-secondary"
                    onClick={() => openSigned(selected.objectName)}
                    title={selected.source === "incoming" ? "Download from incoming/" : "Download from archive/"}
                  >
                    <Download className="h-4 w-4" />
                    Download file
                  </button>

                  {/* View generated report: only for ACTIVE (incoming) and only if clean exists */}
                  {selected.source === "incoming" ? (
                    <button
                      className="pf-btn pf-btn-primary"
                      onClick={openGeneratedReport}
                      title={selected?.hasClean ? "Open generated report from clean/" : "No clean report found"}
                    >
                      <FileText className="h-4 w-4" />
                      {viewLoading ? "Loading..." : "View generated report"}
                    </button>
                  ) : null}

                </div>
              </div>
            )}
            
          </div>

          {/* Generated report popup */}
          {viewOpen && (
            <div className="fixed inset-0 z-[13000]">
              <div
                className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
                onClick={() => setViewOpen(false)}
              />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_30px_80px_-35px_rgba(0,0,0,0.65)]">
                  <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-white/90">Generated report</div>
                      </div>

                      <button
                        onClick={() => setViewOpen(false)}
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15"
                        title="Close"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    {viewErr ? (
                      <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                        {viewErr}
                      </div>
                    ) : viewLoading ? (
                      <div className="text-sm text-slate-700">Loading...</div>
                    ) : (
                      <div className="bg-white">
                        <iframe
                          title="Report viewer"
                          src={`/report/view?objectName=${encodeURIComponent(selected?.cleanObjectName ?? "")}`}
                          className="h-[72vh] w-full"
                        />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex justify-end gap-3">
                    <button
                      onClick={() => setViewOpen(false)}
                      className="h-11 rounded-2xl bg-slate-100 px-5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
       </div>       
      </div>
    </AppShell>
  );
}

function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1",
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-slate-50 text-slate-600 ring-slate-200"
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}


function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/60 p-3 ring-soft">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function FieldFancy({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/55 p-4 ring-soft">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-600">{label}</div>
        {hint ? <div className="text-[11px] font-semibold text-slate-500">{hint}</div> : null}
      </div>
      <input
        className={cx(
          "mt-2 w-full rounded-2xl bg-gray-50  px-3 py-2.5 text-sm text-slate-900 ring-1 ring-slate-200/70",
          "shadow-sm outline-none transition focus:ring-4 focus:ring-indigo-200/60"
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "Australia/Sydney",
});

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return DATE_FMT.format(d);
}
