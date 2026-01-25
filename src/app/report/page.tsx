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

 async function openGeneratedReport(it: ReportListItem) {
  if (!it.hasClean) return;

  setSelected(it);          // keep sidebar in sync (optional but good UX)
  setViewOpen(true);
  setViewLoading(true);
  setViewErr(null);
  setViewJson(null);

  try {
    const res = await fetch(
      `/api/report/read?objectName=${encodeURIComponent(it.cleanObjectName)}`,
      { cache: "no-store" }
    );

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

    setViewJson(
      data.kind === "json"
        ? data.json
        : { kind: data.kind, text: data.text }
    );
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
    <div className="workspace">
      {/* LEFT: Filters sidebar */}
      <aside className="control-sidebar">
        <div className="module">
          <div className="module-header">Filters</div>
          <div className="module-content">
            <div className="input-row">
              <label className="input-label">Commodity</label>
              <input
                className="tt-input"
                type="text"
                placeholder="sulphur"
                value={commodity}
                onChange={(e) => setCommodity(e.target.value)}
              />
            </div>

            <div className="input-row">
              <label className="input-label">Status</label>
              <select
                className="tt-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">All</option>
                <option value="active">Active (incoming)</option>
                <option value="inactive">Inactive (archive)</option>
              </select>
            </div>

            <div className="input-row">
              <label className="input-label">From Date</label>
              <input
                className="tt-input"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            {loadErr ? (
              <div style={{ marginTop: 10, color: "#de350b", fontWeight: 700, fontSize: 13 }}>
                {loadErr}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      {/* RIGHT: Main panel */}
      <main className="main-panel">
        <section className="panel-section">
          <div className="section-header">
            <h2 className="section-title">REPORT FILES</h2>
            <div className="section-actions">
              <button className="toolbar-btn" type="button" onClick={refresh} disabled={loading}>
                <RefreshCwIcon className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

         <div className="tt-uploadTableWrap">
  <table className="data-grid">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Commodity</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

<tbody>
  {rows.length ? (
    rows.map((it) => {
      const activeCls = it.active ? "status-optimal" : "status-warning";

      return (
        <tr
          key={it.id}
          onClick={() => openRow(it)}
          style={{ cursor: "pointer" }}
        >
          <td>{formatDate(it.createdAt)}</td>

          <td>{it.commodity}</td>

          <td>{it.fileName}</td>

          <td>
            <span className={cx("status-label", activeCls)}>
              {it.active ? "ACTIVE" : "INACTIVE"}
            </span>
          </td>

          <td>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="toolbar-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openSigned(it.objectName);
                }}
                title={it.source === "incoming" ? "Download from incoming/" : "Download from archive/"}
              >
                <Download className="h-4 w-4" />
                Download
              </button>

           
              {it.hasClean ? (
  <button
    className="toolbar-btn"
    type="button"
    onClick={(e) => {
      e.stopPropagation(); // prevents row click side-effects
      openGeneratedReport(it);
    }}
    style={{ borderColor: "#0052cc", color: "#0052cc" }}
  >
    <FileText className="h-4 w-4" />
    Generated Report
  </button>
) : null}

            </div>
          </td>
        </tr>
      );
    })
  ) : (
    <tr>
      <td colSpan={5} style={{ padding: "1.25rem", color: "#7a869a" }}>
        {loading ? "Loading..." : "No reports match your filters."}
      </td>
    </tr>
  )}
</tbody>

            </table>
          </div>
        </section>


        {/* Viewer popup (template-styled) */}
        {viewOpen ? (
          <div className="fixed inset-0 z-[13000]">
            <div
              className="absolute inset-0"
              style={{ background: "rgba(9,30,66,0.35)" }}
              onClick={() => setViewOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div style={{ width: "100%", maxWidth: 980, background: "#fff", border: "1px solid #dfe1e6" }}>
                <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900, letterSpacing: 0.3 }}>GENERATED REPORT</div>
                      
                    </div>

                    <button
                      className="toolbar-btn"
                      type="button"
                      onClick={() => setViewOpen(false)}
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                      Close
                    </button>
                  </div>
                </div>

                <div style={{ padding: 12 }}>
                  {viewErr ? (
                    <div style={{ padding: 12, border: "1px solid #dfe1e6", background: "#ffebe6", color: "#de350b", fontWeight: 700 }}>
                      {viewErr}
                    </div>
                  ) : viewLoading ? (
                    <div style={{ padding: 12, color: "#7a869a" }}>Loading…</div>
                  ) : (
                    <iframe
                      title="Report viewer"
                      src={`/report/view?objectName=${encodeURIComponent(selected?.cleanObjectName ?? "")}`}
                      className="h-[72vh] w-full"
                      style={{ border: "1px solid #dfe1e6" }}
                    />
                  )}
                </div>

                <div style={{ padding: 12, background: "#f8f9fa", borderTop: "1px solid #dfe1e6", display: "flex", justifyContent: "flex-end" }}>
                  <button className="toolbar-btn" type="button" onClick={() => setViewOpen(false)}>
                    Close
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

function ActivePill({ active }: { active: boolean }) {
  return (
   <span
  className={cx(
    "status-label",
    active ? "status-optimal" : "status-warning"
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
