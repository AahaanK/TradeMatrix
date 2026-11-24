import React from "react"
import { SegmentedControl } from "../ui/Controls"
import type { RangeKey } from "./lwc"

export const RangeButtons: React.FC<{ value: RangeKey; onChange: (r: RangeKey) => void; label?: string }> = ({
  value,
  onChange,
  label = "Visible period",
}) => (
  <SegmentedControl
    size="sm"
    ariaLabel={label}
    value={value}
    onChange={onChange}
    options={[
      { value: "1Y", label: "1Y", title: "Last year" },
      { value: "3Y", label: "3Y", title: "Last 3 years" },
      { value: "5Y", label: "5Y", title: "Last 5 years" },
      { value: "ALL", label: "All", title: "Full history" },
    ]}
  />
)

/** Small coloured key used under/above charts. */
export const LegendItem: React.FC<{ color: string; label: React.ReactNode; dashed?: boolean; value?: React.ReactNode }> = ({
  color,
  label,
  dashed,
  value,
}) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
    <svg width="14" height="6" aria-hidden="true">
      <line x1="0" y1="3" x2="14" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "3 2" : undefined} />
    </svg>
    {label}
    {value !== undefined && <span className="num font-medium text-ink">{value}</span>}
  </span>
)
