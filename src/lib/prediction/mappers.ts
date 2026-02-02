import type { N8nPayload, Result } from "@/types/prediction";
import { actionToImpact, normalizeConfidence, toNumberLoose } from "@/lib/prediction/normalize";

// Exported so other files can import them
export function buildJustification(
  payload: N8nPayload | null,
  tab: "drivers" | "risk" | "evidence"
): Result["justification"] {
  const t = payload?.tender;
  const notes = Array.isArray(payload?.notes) ? payload!.notes! : [];

  if (tab === "drivers") {
    const action = String(t?.tenderAction ?? "PASS");
    const impact: "Up" | "Down" | "Risk" = actionToImpact(action);

    const trend = t?.signals?.trend ? String(t.signals.trend) : "";
    const sScore = typeof t?.signals?.sentimentScore === "number" ? t.signals.sentimentScore : null;

    const driverCommentParts = [
      t?.rationale ? String(t.rationale) : "",
      trend ? `Signals: ${trend}` : "",
      sScore !== null ? `Sentiment: ${sScore.toFixed(2)}` : "",
    ].filter(Boolean);

    return [
      {
        factor: "Tender Action",
        impact,
        confidence: normalizeConfidence(t?.decisionConfidence ?? t?.confidence),
        comment: driverCommentParts.join(" • "),
      },
    ];
  }

  if (tab === "risk") {
    const missing = [
      !payload?.expectedRange ? "Expected renge missing" : null,
      !payload?.expectedSellingPrice ? "Expected selling price missing" : null,
      !payload?.spotPricesText ? "Spot prices text missing" : null,
      !Array.isArray(payload?.caliBidTable) ? "Cali table missing" : null,
    ].filter(Boolean);

    return [
      {
        factor: "Model Limits",
        impact: "Risk",
        confidence: "Medium",
        comment:
          missing.length > 0
            ? `Some fields are not provided by the workflow: ${missing.join(", ")}.`
            : "Risk is not explicitly returned by the workflow; using a default risk pill for now.",
      },
    ];
  }

  const sent = payload?.news?.shortTermSentiment ?? null;
  const ev = Array.isArray(payload?.evidence) ? payload!.evidence! : [];
  const out: Result["justification"] = [];

  if (sent?.category || sent?.score != null) {
    out.push({
      factor: "Short-term sentiment",
      impact: sent?.category === "Positive" ? "Up" : sent?.category === "Negative" ? "Down" : "Risk",
      confidence: "Medium",
      comment: `${sent?.category ?? "—"}${typeof sent?.score === "number" ? ` (${sent.score})` : ""}`,
    });

    if (sent?.rationale) {
      out.push({
        factor: "Sentiment rationale",
        impact: "Risk",
        confidence: "Medium",
        comment: sent.rationale,
      });
    }
  }

  if (ev.length) {
    ev.slice(0, 6).forEach((e, idx) => {
      out.push({
        factor: idx === 0 ? "Top market-moving events" : "Event",
        impact: e.impact_direction === "bullish" ? "Up" : e.impact_direction === "bearish" ? "Down" : "Risk",
        confidence: "Medium",
        comment: `${e.headline ?? "—"}${
          typeof e.importance_score === "number" ? ` (importance ${e.importance_score})` : ""
        }`,
      });
    });
    return out;
  }

  if (notes.length) {
    return notes.slice(0, 6).map((n, idx) => ({
      factor: idx === 0 ? "Evidence Notes" : "Note",
      impact: "Risk",
      confidence: "Medium",
      comment: String(n),
    }));
  }

  return [{ factor: "Evidence", impact: "Risk", confidence: "Low", comment: "No evidence returned." }];
}

export function mapPayloadToResult(payload: N8nPayload): Result {
  const tender = payload?.tender;
  const predictedNum = toNumberLoose(tender?.tenderPredictedPrice);
  const unit = String(tender?.unit ?? "USD/t");

  return {
    tenderPredictedPrice: predictedNum ?? 0,
    currency: unit,
    riskLevel: "Medium",
    notes: Array.isArray(payload?.notes) ? payload.notes : [],
    justification: buildJustification(payload, "drivers"),
  };
}