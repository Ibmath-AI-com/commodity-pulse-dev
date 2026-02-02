// FILE: src/app/report/view/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";


type SummarySection = { section_title: string; content: string };

type NormalizedReport = {
  main_theme: string;
  document_summary: SummarySection[];
  events: any[];
};

type ReadResp =
  | { ok: true; kind: "json"; objectName: string; json: any }
  | { ok: true; kind: "text"; objectName: string; text: string }
  | { ok: false; error: string };

function baseName(path?: string) {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function tryParseJson(v: any) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Supports:
 *  A) normalized clean JSON object:
 *     { main_theme, document_summary, events }
 *  B) normalized clean JSON array:
 *     [ { main_theme, document_summary, events } ]
 *  C) wrapper:
 *     { ok, kind, objectName, json: [ { main_theme, document_summary, events } ] }
 *  D) legacy n8n steps-array JSON:
 *     [ { data: [ {output: {...}}, {output: "...json..."}, {output:{message:{events}}} ] } ]
 */
function normalizeCleanReport(raw: any): NormalizedReport {
  const out: NormalizedReport = {
    main_theme: "",
    document_summary: [],
    events: [],
  };

  const applyNormalized = (obj: any) => {
    if (!obj || typeof obj !== "object") return;

    if (typeof obj.main_theme === "string") out.main_theme = obj.main_theme.trim();

    const ds = obj.document_summary;
    if (Array.isArray(ds)) {
      out.document_summary = ds
        .map((s: any): SummarySection => ({
          section_title: String(s?.section_title ?? s?.title ?? "").trim(),
          content: String(s?.content ?? s?.text ?? "").trim(),
        }))
        .filter((s: SummarySection) => Boolean(s.section_title || s.content));
    }

    const ev = obj.events;
    if (Array.isArray(ev)) out.events = ev;
  };

  // 0) wrapper object { json: [...] }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (Array.isArray((raw as any).json) && (raw as any).json.length) {
      applyNormalized((raw as any).json[0]);
      if (out.main_theme || out.document_summary.length || out.events.length) return out;
    }

    // 1) already normalized object
    applyNormalized(raw);
    if (out.main_theme || out.document_summary.length || out.events.length) return out;
  }

  // 2) normalized array [ { main_theme, document_summary, events } ]
  if (Array.isArray(raw) && raw.length && raw[0] && typeof raw[0] === "object") {
    if (
      typeof (raw[0] as any).main_theme === "string" ||
      Array.isArray((raw[0] as any).document_summary) ||
      Array.isArray((raw[0] as any).events)
    ) {
      applyNormalized(raw[0]);
      if (out.main_theme || out.document_summary.length || out.events.length) return out;
    }
  }

  // 3) legacy steps-array
  let root = raw;
  if (Array.isArray(root) && root.length) root = root[0];

  const steps: any[] | null = Array.isArray(root?.data) ? root.data : null;
  if (!steps) return out;

  for (const step of steps) {
    const rawOut = step?.output;
    const obj1 = tryParseJson(rawOut) ?? rawOut;
    if (!obj1 || typeof obj1 !== "object") continue;

    if (typeof (obj1 as any).main_theme === "string" && (obj1 as any).main_theme.trim()) {
      out.main_theme = (obj1 as any).main_theme.trim();
    }

    const msg = (obj1 as any).message;
    const msgParsed1: any = tryParseJson(msg) ?? msg;
    const msgParsed2: any = tryParseJson(msgParsed1) ?? msgParsed1;

    const ds =
      (obj1 as any).document_summary ??
      msgParsed2?.document_summary ??
      msgParsed1?.document_summary;

    if (Array.isArray(ds) && ds.length) {
      out.document_summary = ds
        .map((s: any): SummarySection => ({
          section_title: String(s?.section_title ?? s?.title ?? "").trim(),
          content: String(s?.content ?? s?.text ?? "").trim(),
        }))
        .filter((s: SummarySection) => Boolean(s.section_title || s.content));
    }

    const ev = (obj1 as any).events ?? (obj1 as any)?.message?.events ?? msgParsed2?.events;
    if (Array.isArray(ev) && ev.length) out.events = ev;
  }

  return out;
}

async function readJsonOrText(res: Response) {
  const text = await res.text().catch(() => "");
  const parsed = tryParseJson(text);

  if (parsed == null) {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 160)}`);
  }

  return parsed as ReadResp;
}

function toTitleCase(s: string) {
  const x = String(s ?? "").trim();
  if (!x) return "";
  return x.charAt(0).toUpperCase() + x.slice(1);
}

function metaSeparator(items: Array<string | null | undefined>) {
  return items.filter(Boolean).join(" • ");
}

export default function ReportViewPage() {
  const sp = useSearchParams();
  const objectName = useMemo(() => (sp.get("objectName") ?? "").trim(), [sp]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<ReadResp | null>(null);

  useEffect(() => {
    if (!objectName) return;

    (async () => {
      setBusy(true);
      setErr("");
      setData(null);

      try {
        const res = await fetch(`/api/report/read?objectName=${encodeURIComponent(objectName)}`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = await readJsonOrText(res);

        if (!res.ok || !payload.ok) {
          setErr(payload.ok ? "Failed" : payload.error);
          setData(null);
          return;
        }

        setData(payload);
      } catch (e: any) {
        setErr(e?.message ?? "Failed");
        setData(null);
      } finally {
        setBusy(false);
      }
    })();
  }, [objectName]);

  const pageTitle = stripExt(baseName(objectName));

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Print + word-like typography */}
      <style jsx global>{`
        @page {
          size: A4;
          margin: 16mm;
        }
        * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          [data-print-hide] {
            display: none !important;
          }
          html,
          body {
            background: white !important;
          }
        }

        /* Word-like text defaults inside the paper */
        .word-doc {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          color: #0f172a;
          font-size: 13.5px;
          line-height: 1.75;
        }
        .word-doc h1 {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans",
            "Apple Color Emoji", "Segoe UI Emoji";
          font-size: 28px;
          line-height: 1.15;
          font-weight: 800;
          margin: 0 0 6px 0;
          letter-spacing: -0.02em;
        }
        .word-doc .subtitle {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 12px;
          color: #475569;
          margin: 0 0 18px 0;
        }
        .word-doc h2 {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 16px;
          font-weight: 800;
          margin: 22px 0 10px 0;
          letter-spacing: -0.01em;
        }
        .word-doc h3 {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 13px;
          font-weight: 800;
          margin: 16px 0 6px 0;
        }
        .word-doc p {
          margin: 0 0 10px 0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .word-doc .rule {
          height: 1px;
          background: rgba(148, 163, 184, 0.55);
          margin: 14px 0 18px 0;
        }
        .word-doc .event {
          padding: 12px 0;
          border-top: 1px solid rgba(148, 163, 184, 0.45);
        }
        .word-doc .event:first-of-type {
          border-top: 0;
          padding-top: 0;
        }
        .word-doc .event-title {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-weight: 800;
          font-size: 14px;
          margin: 0 0 4px 0;
        }
        .word-doc .event-meta {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 11px;
          color: #64748b;
          margin: 0 0 10px 0;
        }
        .word-doc table {
          width: 100%;
          border-collapse: collapse;
          margin: 8px 0 0 0;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans";
          font-size: 12px;
        }
        .word-doc th,
        .word-doc td {
          border-top: 1px solid rgba(148, 163, 184, 0.45);
          padding: 8px 10px;
          text-align: left;
          vertical-align: top;
        }
        .word-doc thead th {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #475569;
          font-weight: 800;
          background: rgba(2, 132, 199, 0.06);
          border-top: 1px solid rgba(148, 163, 184, 0.55);
        }
      `}</style>

      {/* Simple top toolbar (only print button, no dialogs) */}
      <div data-print-hide className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {busy ? "Loading…" : pageTitle || "Report"}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              Viewer mode (Word-like). Print for PDF.
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="toolbar-btn"
            type="button"
            title="Print"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Paper */}
      <div className="mx-auto max-w-5xl px-6 py-10">
        {err ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {err}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-10 py-10">
            <div className="word-doc">
              {!data ? (
                <p style={{ color: "#64748b" }}>{busy ? "Loading…" : "No data."}</p>
              ) : data.ok && data.kind === "text" ? (
                <>
                  <h1>{pageTitle || "Report"}</h1>
                  <div className="subtitle">{metaSeparator([baseName(objectName), data.kind])}</div>
                  <div className="rule" />
                  <p>{data.text}</p>
                </>
              ) : data.ok && data.kind === "json" ? (
                <ReportWordDoc json={data.json} title={pageTitle || "Report"} objectName={objectName} />
              ) : (
                <p style={{ color: "#64748b" }}>{!data.ok ? data.error : "No data."}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportWordDoc({ json, title, objectName }: { json: any; title: string; objectName: string }) {
  const doc = normalizeCleanReport(json);

  const mainTheme = (doc.main_theme ?? "").trim();
  const summary: SummarySection[] = Array.isArray(doc.document_summary) ? doc.document_summary : [];
  const events = Array.isArray(doc.events) ? doc.events : [];

  const hasStructure = Boolean(mainTheme) || summary.length > 0 || events.length > 0;

  return (
    <>
      <h1>{title}</h1>
      <div className="subtitle">{metaSeparator([baseName(objectName), hasStructure ? "Structured report" : "Raw report"])}</div>
      <div className="rule" />

      {mainTheme ? (
        <>
          <h2>Main theme</h2>
          <p>{mainTheme}</p>
        </>
      ) : null}

      {summary.length > 0 ? (
        <>
          <h2>Document summary</h2>
          {summary.map((s, idx) => (
            <div key={idx}>
              <h3>{s.section_title?.trim() ? s.section_title.trim() : `Section ${idx + 1}`}</h3>
              <p>{String(s.content ?? "").trim()}</p>
            </div>
          ))}
        </>
      ) : null}

      {events.length > 0 ? (
        <>
          <h2>Key events</h2>
          {events.map((e: any, idx: number) => {
            const headline = String(e?.headline ?? "").trim() || `Event ${idx + 1}`;
            const eventType = String(e?.event_type ?? "").trim();
            const impact = String(e?.impact_direction ?? "").trim();
            const date = String(e?.event_date ?? "").trim();
            const score = typeof e?.importance_score === "number" ? e.importance_score : null;
            const evidence = String(e?.evidence_summary ?? e?.summary ?? "").trim();
            const regions = Array.isArray(e?.regions) ? e.regions : [];

            const meta = metaSeparator([
              eventType ? toTitleCase(eventType) : null,
              impact ? toTitleCase(impact) : null,
              date || null,
              score != null ? `Score ${score.toFixed(2)}` : null,
              regions.length ? `Regions: ${regions.join(", ")}` : null,
            ]);

            return (
              <div key={idx} className="event">
                <div className="event-title">{headline}</div>
                {meta ? <div className="event-meta">{meta}</div> : null}
                {evidence ? <p>{evidence}</p> : null}

                {Array.isArray(e?.numbers) && e.numbers.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "22%" }}>Value</th>
                        <th style={{ width: "18%" }}>Unit</th>
                        <th>Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.numbers.map((n: any, j: number) => (
                        <tr key={j}>
                          <td>{String(n?.value ?? "")}</td>
                          <td>{String(n?.unit ?? "")}</td>
                          <td>{String(n?.context ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}

      {!hasStructure ? (
        <>
          <h2>Note</h2>
          <p>
            The report JSON did not match the expected structured schema (main theme / document summary / events). If you
            want, paste one sample JSON payload and I’ll adjust the normalizer to match your n8n output reliably.
          </p>
        </>
      ) : null}
    </>
  );
}
