// src/types/prediction.ts

export type Status = "idle" | "loading" | "success" | "error";

export type Direction = "Bullish" | "Bearish" | "Neutral";
export type Strength = "Strong" | "Moderate" | "Slight" | "N/A";

export type Result = {
  tenderPredictedPrice: number;
  currency: string;
  riskLevel: "Low" | "Medium" | "High";
  notes: string[];
  justification: Array<{
    factor: string;
    impact: "Up" | "Down" | "Risk";
    confidence: "High" | "Medium" | "Low";
    comment: string;
  }>;
};

export type NewsEvent = {
  headline?: string;
  impact_direction?: string;
  importance_score?: number;
  event_type?: string;
  event_date?: string;
  regions?: string[];
  evidence_summary?: string;
};

export type ShortTermSentiment = {
  category?: "Positive" | "Neutral" | "Negative" | string;
  score?: number;
  rationale?: string;
};

export type NewsBundle = {
  shortTermSentiment?: ShortTermSentiment | null;
  events?: NewsEvent[];
};

export type CaliBidRow = {
  caliBidRangeFob: string;
  chanceToWin: string;
  marginRiskDec: string;
  assessment: string;
  implication: string;
  expectedSellingPrice: string;
  spotPricesText: string;
  marginPerTon: string;
  supportingNews?: NewsEvent[];
  reportNewsInterpretation?: string;
};

export type TenderOut = {
  tenderAction: "BUY BID" | "SELL OFFER" | "PASS" | "BID" | "OFFER" | string;
  tenderPredictedPrice: number | null;
  unit: string;
  confidence: "High" | "Medium" | "Low" | string;
  decisionConfidence?: "High" | "Medium" | "Low" | string;
  rationale: string;
  signals?: {
    trend?: string;
    sentimentScore?: number;
    alignmentScore?: number; // 0..1
  };
};

type ExpectedRange = {
  p10?: number;
  p90?: number;
  level?: number;
  method?: string;
  halfWidth?: number;
  n?: number;
  signals?: { alignmentScore?: number };
};

export type N8nPayload = {
  ok?: boolean;
  commodity?: string;
  basis?: string;
  asof_date?: string;
  expectedRange?: ExpectedRange | null;
  expectedSellingPrice?: string;
  spotPricesText?: string;
  notes?: string[];
  tender?: TenderOut;
  caliBidTable?: CaliBidRow[];
  news?: NewsBundle;
  evidence?: NewsEvent[];
};

export type ApiMultiResponse = {
  ok: true;
  commodity?: string;
  futureDate?: string;
  results: Array<{
    basisKey: string;
    basisLabel: string;
    data: any;
  }>;
};

export type MultiItem = {
  basisKey: string;
  basisLabel: string;
  bundle: N8nPayload;
  result: Result;
};

export type SavedSession = {
  savedAt: string;
  commodity: string;
  basis: string[];
  futureDate: string;
  status: Status;
  justTab: "drivers" | "risk" | "evidence" | "cali";
  activeIdx: number;
  multi: Array<{
    basisKey: string;
    basisLabel: string;
    bundle: N8nPayload;
    result: Result;
  }>;
  result: Result | null;
  bundle: N8nPayload | null;
  basePricesByBasis: Record<string, string>;
};

export type EvidenceItem = {
  impact_direction?: string;
  importance_score?: number;
  event_type?: string;
  event_date?: string;
  headline?: string;
  evidence_summary?: string;
  regions?: string[];
};

export type Props = {
  open: boolean;
  title?: string | null;
  items: EvidenceItem[];
  onClose: () => void;
};