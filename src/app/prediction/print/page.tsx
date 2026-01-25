// FILE: src/app/prediction/print/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, X } from "lucide-react";

export const dynamic = "force-dynamic";

type TenderOut = {
  tenderAction?: string;
  tenderPredictedPrice?: number | null;
  unit?: string;
  confidence?: string;
  rationale?: string;
  signals?: { trend?: string; sentimentScore?: number };
};

type CaliBidRow = {
  caliBidRangeFob?: string;
  chanceToWin?: string;
  marginRiskDec?: string;
  assessment?: string;
  implication?: string;
  marginPerTon?: string;
};

type MultiReportItem = {
  basisKey?: string;
  basisLabel?: string;
  tender?: TenderOut | null;
  expectedSellingPrice?: string | null;
  spotPricesText?: string | null;
  notes?: string[];
  caliTable?: CaliBidRow[];
  news?: any;
  evidence?: any[];
  currency?: string;
  riskLevel?: string;
};

type ReportPayload = {
  generatedAt?: string;
  commodity?: string;
  basis?: string[];
  futureDate?: string;
  status?: string;

  // ✅ NEW (per-basis base prices)
  basePricesByBasis?: Record<string, string>;
  basePrices?: Array<number | null>;

  // legacy (older reports)
  basePriceMode?: "auto" | "override" | string;
  basePriceOverride?: number | null;

  multiResults?: MultiReportItem[] | null;
  activeBasis?: string | null;

  // legacy single-basis
  tender?: TenderOut | null;
  predictedPrice?: number | null;
  currency?: string;
  riskLevel?: string;
  expectedSellingPrice?: string | null;
  spotPricesText?: string | null;
  notes?: string[];
  caliTable?: CaliBidRow[];
};

const BASES: Record<string, string> = {
  vancouver: "Vancouver",
  "middle-east": "Middle East",
  iran: "Iran",
  "black-sea": "Black Sea",
  "baltic-sea": "Baltic Sea",
  "us-gulf": "US Gulf",
  mediterranean: "Mediterranean",
};

function basisLabel(v: string) {
  return BASES[v] ?? v;
}

const REPORT_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function fmtReportDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : REPORT_DATE_FMT.format(d);
}

function decodeReportPayload(encoded: string): ReportPayload | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json) as ReportPayload;
  } catch {
    return null;
  }
}

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

function fmtMoney(n?: number | null, unit?: string | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const u = safeText(unit ?? "");
  return u && u !== "—" ? `${n} ${u}` : String(n);
}

function fmtBasePriceText(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Minimal “word-like” table tones: no gradients, compact, print-friendly
function pillClass() {
  return "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700";
}

function kpiKey() {
  return "text-[10px] font-semibold text-slate-500";
}

function kpiVal() {
  return "mt-0.5 text-[12px] font-semibold text-slate-900";
}

export default function PredictionPrintPage() {
  const searchParams = useSearchParams();
  const k = searchParams.get("k") ?? "";
  const p = searchParams.get("p") ?? "";

  const [mounted, setMounted] = useState(false);
  const [payload, setPayload] = useState<ReportPayload | null>(null);

  useEffect(() => {
    setMounted(true);

    // Prefer storage key
    if (k) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) {
          setPayload(null);
          return;
        }
        const obj = JSON.parse(raw) as ReportPayload;

        setPayload(obj);
        window.setTimeout(() => {
          try {
            localStorage.removeItem(k);
          } catch {}
        }, 5 * 60 * 1000); // 5 minutes
        return;
      } catch {
        setPayload(null);
        return;
      }
    }

    // Legacy fallback
    if (p) {
      setPayload(decodeReportPayload(p));
      return;
    }

    setPayload(null);
  }, [k, p]);

  // ✅ IMPORTANT: all hooks below must run on every render (no early returns above)

  const basisText = useMemo(() => {
    const arr = Array.isArray(payload?.basis) ? payload!.basis! : [];
    return arr.length ? arr.map(basisLabel).join(", ") : "—";
  }, [payload]);

  const selectedBasis = useMemo(() => {
    const arr = Array.isArray(payload?.basis) ? payload!.basis! : [];
    return arr.slice(0, 2);
  }, [payload]);

  const basePriceRows = useMemo(() => {
    const map =
      payload?.basePricesByBasis && typeof payload.basePricesByBasis === "object"
        ? payload.basePricesByBasis
        : {};

    const arr = Array.isArray(payload?.basePrices) ? payload!.basePrices! : [];

    return selectedBasis.map((bKey, idx) => {
      const label = basisLabel(bKey);
      const rawText = (map as any)[bKey];
      const txt = fmtBasePriceText(rawText);

      const fromArr =
        typeof arr[idx] === "number" && Number.isFinite(arr[idx] as number)
          ? String(arr[idx])
          : "";

      return {
        basisKey: bKey,
        basisLabel: label,
        value: txt !== "—" ? txt : fromArr ? fromArr : "—",
      };
    });
  }, [payload, selectedBasis]);

  const hasMulti = useMemo(() => {
    return Array.isArray(payload?.multiResults) && (payload?.multiResults?.length ?? 0) > 0;
  }, [payload]);

  const tenderSingle = payload?.tender ?? null;
  const notesSingle = Array.isArray(payload?.notes) ? payload!.notes! : [];
  const caliSingle = Array.isArray(payload?.caliTable) ? payload!.caliTable! : [];

  const predictedSingle =
    (typeof tenderSingle?.tenderPredictedPrice === "number" &&
    Number.isFinite(tenderSingle.tenderPredictedPrice)
      ? tenderSingle.tenderPredictedPrice
      : null) ??
    (typeof payload?.predictedPrice === "number" && Number.isFinite(payload.predictedPrice)
      ? payload.predictedPrice
      : null);

  const unitSingle = payload?.currency ?? tenderSingle?.unit ?? "USD/t";

  const signalsSingle = {
    trend: tenderSingle?.signals?.trend,
    sentimentScore: tenderSingle?.signals?.sentimentScore,
  };

  // ✅ Now it's safe to render conditionally

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] p-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-base font-semibold">Loading report…</div>
          <p className="mt-1 text-sm text-slate-600">Preparing print preview.</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] p-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-base font-semibold">Report not available</div>
          <p className="mt-1 text-sm text-slate-600">
            This print page requires a report payload. Go back to Prediction, run a forecast, then click Print.
          </p>
        </div>
      </div>
    );
  }

  const UI = {
    page: "min-h-screen bg-[#F5F5F5] p-6 text-slate-900",
    wrap: "mx-auto max-w-[900px] space-y-3",
    paper: "rounded-xl border border-slate-200 bg-white",
    paperPad: "px-8 py-7", // compact but readable

    toolbarBtn:
      "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50",

    title: "text-[20px] font-bold tracking-tight text-slate-900",
    subtitle: "mt-0.5 text-[11px] text-slate-600",
    metaLine: "mt-2 text-[11px] text-slate-600",

    section: "mt-4",
    sectionTitle: "text-[12px] font-bold tracking-wide text-slate-900",
    sectionRule: "mt-2 border-t border-slate-200",

    th: "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-slate-700",
    td: "border-b border-slate-200 px-3 py-2 text-[11px] text-slate-800",
    tdStrong: "border-b border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-900",

    list: "mt-1 list-disc pl-5 text-[11px] text-slate-800 space-y-1",
    small: "text-[10px] text-slate-500",
  } as const;

  return (
    <>
      <div className={UI.page}>
        {/* Toolbar (screen only) */}
        <div data-toolbar className="mx-auto mb-3 flex max-w-[900px] items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Print Preview</div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
               className="toolbar-btn"
              type="button"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>

            <button
              onClick={() => {
                try {
                  if (k) localStorage.removeItem(k);
                } catch {}
                window.close();
              }}
              className="toolbar-btn"
              type="button"
              title="Close"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>
        </div>

        {/* Paper */}
        <div className={UI.wrap}>
          <div className={UI.paper}>
            <div className={cx(UI.paperPad, "report-doc")}>
              {/* Header */}
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className={UI.title}>Commodity Forecast Report</div>
                  <div className={UI.subtitle}>Tender decisioning, predicted pricing, and Cali Bid guidance.</div>
                </div>

                <div className="min-w-[300px] text-right">
                  <div className="text-[11px] text-slate-700">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold text-slate-700">Generated</span>
                      <span>{fmtReportDate(payload.generatedAt)}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3">
                      <span className="font-semibold text-slate-700">Status</span>
                      <span>{safeText(payload.status)}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3">
                      <span className="font-semibold text-slate-700">Future date</span>
                      <span>{safeText(payload.futureDate)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={UI.sectionRule} />

              {/* KPIs (compact, no “cards”) */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className={kpiKey()}>Commodity</div>
                  <div className={kpiVal()}>{safeText(payload.commodity)}</div>
                </div>
                <div>
                  <div className={kpiKey()}>Basis</div>
                  <div className={kpiVal()}>{basisText}</div>
                </div>
                <div>
                  <div className={kpiKey()}>Risk level</div>
                  <div className={kpiVal()}>{safeText(payload.riskLevel)}</div>
                </div>
              </div>

              {/* Base prices (keep important part; compact) */}
              {basePriceRows.length ? (
                <div className="mt-3">
                  <div className={UI.sectionTitle}>Base prices used (USD/t)</div>
                  <div className={UI.sectionRule} />
                  <div className="mt-2 grid gap-1">
                    {basePriceRows.map((r) => (
                      <div key={r.basisKey} className="flex justify-between text-[11px] text-slate-800">
                        <span className="font-semibold">{r.basisLabel}</span>
                        <span className="font-semibold text-slate-900">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Multi-basis sections */}
              {hasMulti ? (
                (payload.multiResults ?? []).map((m, idx) => {
                  const tender = m.tender ?? null;
                  const notes = Array.isArray(m.notes) ? m.notes : [];
                  const cali = Array.isArray(m.caliTable) ? m.caliTable : [];
                  const basisTitle = safeText(m.basisLabel ?? m.basisKey ?? `Basis ${idx + 1}`);

                  return (
                    <div key={`${m.basisKey ?? idx}`} className={UI.section}>
                      <div className={UI.sectionTitle}>Market Result — {basisTitle}</div>
                      <div className={UI.sectionRule} />

                      {/* Summary */}
                      <div className="mt-3">
                        <div className={UI.sectionTitle}>Summary</div>
                        <div className={UI.sectionRule} />

                        <table className="w-full border-collapse">
                          <tbody>
                            <tr>
                              <th className={UI.th} style={{ width: 170 }}>
                                Tender action
                              </th>
                              <td className={UI.td}>{safeText(tender?.tenderAction)}</td>
                              <th className={UI.th} style={{ width: 170 }}>
                                Confidence
                              </th>
                              <td className={UI.td}>{safeText(tender?.confidence)}</td>
                            </tr>

                            <tr>
                              <th className={UI.th} style={{ width: 170 }}>
                                Predicted price
                              </th>
                              <td className={UI.tdStrong}>
                                {fmtMoney(tender?.tenderPredictedPrice ?? null, m.currency ?? tender?.unit ?? "USD/t")}
                              </td>
                              <th className={UI.th} style={{ width: 170 }}>
                                Signals
                              </th>
                              <td className={UI.td}>
                                {tender?.signals?.trend ? `Trend: ${tender.signals.trend}` : "Trend: —"}
                                {typeof tender?.signals?.sentimentScore === "number"
                                  ? ` • Sentiment: ${tender.signals.sentimentScore}`
                                  : ""}
                              </td>
                            </tr>

                            <tr>
                              <th className={UI.th} style={{ width: 170 }}>
                                Rationale
                              </th>
                              <td className={UI.td} colSpan={3}>
                                <div className="whitespace-normal break-words">{safeText(tender?.rationale)}</div>
                              </td>
                            </tr>

                            {/* Keep these important fields for multi too */}
                            <tr>
                              <th className={UI.th} style={{ width: 170 }}>
                                Expected selling price
                              </th>
                              <td className={UI.td}>{safeText(m.expectedSellingPrice)}</td>
                              <th className={UI.th} style={{ width: 170 }}>
                                Spot prices
                              </th>
                              <td className={UI.td}>{safeText(m.spotPricesText)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Notes */}
                      <div className="mt-3">
                        <div className={UI.sectionTitle}>Evidence notes</div>
                        <div className={UI.sectionRule} />

                        {notes.length ? (
                          <ul className={UI.list}>
                            {notes.slice(0, 12).map((n, i) => (
                              <li key={i} className="whitespace-normal break-words">
                                {safeText(n)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-2 text-[11px] text-slate-700">No supporting notes returned.</div>
                        )}
                      </div>

                      {/* Cali */}
                      <div className="mt-3">
                        <div className={UI.sectionTitle}>Cali Bid Table</div>
                        <div className={UI.sectionRule} />

                        <table className="w-full border-collapse">
                          <thead>
                            <tr>
                              <th className={UI.th} style={{ width: 110 }}>
                                Range
                              </th>
                              <th className={UI.th} style={{ width: 90 }}>
                                Chance
                              </th>
                              <th className={UI.th} style={{ width: 110 }}>
                                Margin risk
                              </th>
                              <th className={UI.th} style={{ width: 140 }}>
                                Assessment
                              </th>
                              <th className={UI.th} style={{ width: 120 }}>
                                Margin / ton
                              </th>
                              <th className={UI.th}>Implication</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cali.length ? (
                              cali.map((r, i) => (
                                <tr key={i}>
                                  <td className={UI.td}>
                                    <div className="whitespace-normal break-words">{safeText(r.caliBidRangeFob)}</div>
                                  </td>
                                  <td className={UI.td}>{safeText(r.chanceToWin)}</td>
                                  <td className={UI.td}>{safeText(r.marginRiskDec)}</td>
                                  <td className={UI.tdStrong}>{safeText(r.assessment)}</td>
                                  <td className={UI.tdStrong}>{safeText(r.marginPerTon)}</td>
                                  <td className={UI.td}>
                                    <div className="whitespace-normal break-words">{safeText(r.implication)}</div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className={UI.td} colSpan={6}>
                                  No Cali Bid table returned.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Optional: keep important info without “dialog” styling */}
                      {(m.news || (Array.isArray(m.evidence) && m.evidence.length)) ? (
                        <div className="mt-3">
                          <div className={UI.sectionTitle}>Additional context</div>
                          <div className={UI.sectionRule} />
                          <div className="mt-2 text-[11px] text-slate-800 whitespace-normal break-words">
                            {m.news ? safeText(typeof m.news === "string" ? m.news : JSON.stringify(m.news)) : null}
                            {Array.isArray(m.evidence) && m.evidence.length ? (
                              <div className="mt-2">
                                <div className="text-[10px] font-semibold text-slate-500">Evidence objects</div>
                                <div className="mt-1 text-[11px] text-slate-700">
                                  {safeText(JSON.stringify(m.evidence))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <>
                  {/* Legacy single-basis sections */}
                  <div className={UI.section}>
                    <div className={UI.sectionTitle}>Summary</div>
                    <div className={UI.sectionRule} />
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr>
                          <th className={UI.th} style={{ width: 170 }}>
                            Tender action
                          </th>
                          <td className={UI.td}>{safeText(tenderSingle?.tenderAction)}</td>
                          <th className={UI.th} style={{ width: 170 }}>
                            Confidence
                          </th>
                          <td className={UI.td}>{safeText(tenderSingle?.confidence)}</td>
                        </tr>

                        <tr>
                          <th className={UI.th} style={{ width: 170 }}>
                            Predicted price
                          </th>
                          <td className={UI.tdStrong}>{fmtMoney(predictedSingle, unitSingle)}</td>
                          <th className={UI.th} style={{ width: 170 }}>
                            Signals
                          </th>
                          <td className={UI.td}>
                            {signalsSingle.trend ? `Trend: ${signalsSingle.trend}` : "Trend: —"}
                            {typeof signalsSingle.sentimentScore === "number"
                              ? ` • Sentiment: ${signalsSingle.sentimentScore}`
                              : ""}
                          </td>
                        </tr>

                        <tr>
                          <th className={UI.th} style={{ width: 170 }}>
                            Rationale
                          </th>
                          <td className={UI.td} colSpan={3}>
                            <div className="whitespace-normal break-words">{safeText(tenderSingle?.rationale)}</div>
                          </td>
                        </tr>

                        <tr>
                          <th className={UI.th} style={{ width: 170 }}>
                            Expected selling price
                          </th>
                          <td className={UI.td}>{safeText(payload?.expectedSellingPrice)}</td>
                          <th className={UI.th} style={{ width: 170 }}>
                            Spot prices
                          </th>
                          <td className={UI.td}>{safeText(payload?.spotPricesText)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className={UI.section}>
                    <div className={UI.sectionTitle}>Evidence notes</div>
                    <div className={UI.sectionRule} />
                    {notesSingle.length ? (
                      <ul className={UI.list}>
                        {notesSingle.slice(0, 12).map((n, i) => (
                          <li key={i} className="whitespace-normal break-words">
                            {safeText(n)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-700">No supporting notes returned.</div>
                    )}
                  </div>

                  <div className={UI.section}>
                    <div className={UI.sectionTitle}>Cali Bid Table</div>
                    <div className={UI.sectionRule} />
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className={UI.th} style={{ width: 110 }}>
                            Range
                          </th>
                          <th className={UI.th} style={{ width: 90 }}>
                            Chance
                          </th>
                          <th className={UI.th} style={{ width: 110 }}>
                            Margin risk
                          </th>
                          <th className={UI.th} style={{ width: 140 }}>
                            Assessment
                          </th>
                          <th className={UI.th} style={{ width: 120 }}>
                            Margin / ton
                          </th>
                          <th className={UI.th}>Implication</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caliSingle.length ? (
                          caliSingle.map((r, i) => (
                            <tr key={i}>
                              <td className={UI.td}>
                                <div className="whitespace-normal break-words">{safeText(r.caliBidRangeFob)}</div>
                              </td>
                              <td className={UI.td}>{safeText(r.chanceToWin)}</td>
                              <td className={UI.td}>{safeText(r.marginRiskDec)}</td>
                              <td className={UI.tdStrong}>{safeText(r.assessment)}</td>
                              <td className={UI.tdStrong}>{safeText(r.marginPerTon)}</td>
                              <td className={UI.td}>
                                <div className="whitespace-normal break-words">{safeText(r.implication)}</div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className={UI.td} colSpan={6}>
                              No Cali Bid table returned.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="mt-5 border-t border-slate-200 pt-2 text-center text-[10px] text-slate-500">
                Confidential · For internal use only
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print CSS: clean + compact + word-like (no gradients) */}
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Word-like typography for content body */
        .report-doc {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          font-size: 12px;
          line-height: 1.55;
          color: #0f172a;
        }

        @media print {
          [data-toolbar] {
            display: none !important;
          }
          html,
          body {
            background: #ffffff !important;
          }
        }
      `}</style>
    </>
  );
}
