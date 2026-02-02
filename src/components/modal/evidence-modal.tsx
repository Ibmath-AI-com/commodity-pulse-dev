// FILE: src/components/evidence-modal.tsx
"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { XCircle } from "lucide-react";
import type {
  Props,
  EvidenceItem,
} from "@/types/prediction";

function toneForImpact(impactRaw: string) {
  const impact = (impactRaw ?? "neutral").toString().toLowerCase();

  if (impact.includes("bear") || impact === "down") {
    return { bg: "#ffebe6", fg: "#de350b", bd: "#ffbdad" };
  }
  if (impact.includes("bull") || impact === "up") {
    // NOTE: your original had unusual colors; keep them to avoid UI regression
    return { bg: "#deebff", fg: "#019664ff", bd: "#22d499ff" };
  }
  if (impact.includes("risk")) {
    return { bg: "#fffae6", fg: "#ff8b00", bd: "#ffe2bd" };
  }
  return { bg: "#f4f5f7", fg: "#42526e", bd: "#dfe1e6" };
}

export function EvidenceModal({ open, title, items, onClose }: Props) {
  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const content = useMemo(() => {
    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[12000]">
        <div
          className="absolute inset-0"
          style={{ background: "rgba(9,30,66,0.35)" }}
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="absolute inset-0 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Evidence">
          <div style={{ width: "100%", maxWidth: 980, background: "#fff", border: "1px solid #dfe1e6" }}>
            <div style={{ padding: "14px 16px", background: "#e9ecef", borderBottom: "1px solid #dfe1e6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, letterSpacing: 0.3 }}>EVIDENCE</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#42526e" }}>
                    Cali bid range:{" "}
                    <span style={{ fontWeight: 700, color: "#172b4d" }}>{title || "—"}</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#7a869a" }}>
                    {items.length ? `Showing ${items.length} linked events` : "No linked events for this row."}
                  </div>
                </div>

                <button className="toolbar-btn" type="button" onClick={onClose} title="Close">
                  <XCircle className="h-4 w-4" />
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: 12, maxHeight: "72vh", overflowY: "auto" }}>
              {items.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.map((e, i) => {
                    const impactRaw = (e?.impact_direction ?? "neutral").toString();
                    const tone = toneForImpact(impactRaw);

                    return (
                      <div key={i} style={{ border: "1px solid #dfe1e6", background: "#fff", padding: 12 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              height: 22,
                              padding: "0 8px",
                              borderRadius: 999,
                              border: `1px solid ${tone.bd}`,
                              background: tone.bg,
                              color: tone.fg,
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                            }}
                          >
                            {impactRaw.toUpperCase()}
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
                            <span style={{ marginLeft: "auto", fontSize: 12, color: "#7a869a" }}>{e.event_date}</span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#172b4d" }}>
                          {e?.headline ?? "—"}
                        </div>

                        {e?.evidence_summary ? (
                          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: "#42526e", whiteSpace: "pre-line" }}>
                            {e.evidence_summary}
                          </div>
                        ) : null}

                        {Array.isArray(e?.regions) && e.regions.length ? (
                          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {e.regions.slice(0, 10).map((r, j) => (
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
              <button className="toolbar-btn" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [open, title, items, onClose]);

  if (!open) return null;

  // Portal to body to avoid z-index / overflow clipping by parent containers
  return createPortal(content, document.body);
}