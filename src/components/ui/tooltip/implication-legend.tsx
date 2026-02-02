"use client";

import * as React from "react";

type LegendItem = {
  key: string;
  label: string;
  dotClass: string;
  implication: string;
};

const LEGEND: LegendItem[] = [
  { key: "not_recommended", label: "Not Recommended", dotClass: "bg-amber-400", implication: "Excellent margin but almost zero chance of acceptance." },
  { key: "attractive_margin", label: "Attractive Margin", dotClass: "bg-amber-400", implication: "Strong profitability; still aggressive for tender standards." },
  { key: "optimal_balance", label: "Optimal Balance", dotClass: "bg-emerald-500", implication: "Best mix of win probability + safety + margin." },
  { key: "acceptable", label: "Acceptable", dotClass: "bg-blue-500", implication: "Potentially profitable; cushion reduces as bid rises." },
  { key: "risky", label: "Risky", dotClass: "bg-red-500", implication: "Very high win probability; margins tighten significantly." },
  { key: "avoid", label: "Avoid", dotClass: "bg-red-500", implication: "Award likely; downside risk dominates economics." },
];

export function AssessmentLegendTooltip(props: {
  open: boolean;
  align?: "left" | "right";
}) {
  const { open, align = "left" } = props;

  if (!open) return null;

  return (
    <div
      role="tooltip"
      className={[
        "absolute z-[1000] mt-2 w-[360px] max-w-[80vw]",
        "rounded-xl border border-slate-200 bg-white shadow-xl",
        "p-3 text-slate-900",
        "normal-case",
        align === "right" ? "right-0" : "left-0",
      ].join(" ")}
    >
      {/* arrow */}
      <div
        className={[
          "absolute -top-2 h-4 w-4 rotate-45",
          "border-l border-t border-slate-200 bg-white",
          align === "right" ? "right-3" : "left-3",
        ].join(" ")}
      />

      <div className="grid grid-cols-1 gap-2">
        {LEGEND.map((it) => (
          <div key={it.key} className="flex items-start gap-2">
            <span className="mt-[5px] inline-block h-2.5 w-2.5 rounded-full ring-2 ring-slate-100">
              <span className={`block h-2.5 w-2.5 rounded-full ${it.dotClass}`} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] normal-case font-semibold text-slate-900">{it.label}</div>
              <div className="text-[10px] normal-case text-slate-600">{it.implication}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}