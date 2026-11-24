import React, { useEffect, useId, useRef, useState } from "react"
import { HelpCircle } from "lucide-react"
import { METRIC_TOOLTIPS } from "../../utils/format"
import { cn } from "../../utils/cn"

interface MetricCardProps {
  id: string
  label: string
  value: string | number
  subValue?: React.ReactNode
  trend?: "positive" | "negative" | "neutral"
  highlight?: boolean
  className?: string
}

/**
 * A single key number with an optional plain-language definition.
 * The "?" button toggles a definition that includes the formula.
 */
export const MetricCard: React.FC<MetricCardProps> = ({
  id,
  label,
  value,
  subValue,
  trend,
  highlight = false,
  className,
}) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const meta = METRIC_TOOLTIPS[id]
  const tipId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTooltip) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setShowTooltip(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowTooltip(false)
    document.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [showTooltip])

  const valueColor =
    trend === "positive" ? "text-pos" : trend === "negative" ? "text-loss" : "text-ink"

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex min-w-0 flex-col justify-between rounded-lg border bg-surface px-3.5 py-3",
        highlight ? "border-brand/50 shadow-[inset_0_2px_0_rgb(var(--tm-brand))]" : "border-line",
        className
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="line-clamp-2 text-sm text-ink-2">{label}</span>
        {meta && (
          <button
            type="button"
            onClick={() => setShowTooltip(s => !s)}
            aria-expanded={showTooltip}
            aria-controls={showTooltip ? tipId : undefined}
            className="-m-1 rounded p-1 text-ink-3 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={`Definition of ${label}`}
          >
            <HelpCircle className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className={cn("num mt-1.5 text-xl font-semibold tracking-[-0.01em]", valueColor)}>{value}</div>
      {subValue && <div className="num mt-0.5 text-xs text-ink-3">{subValue}</div>}

      {meta && showTooltip && (
        <div
          id={tipId}
          role="note"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-md border border-line bg-surface p-3 text-sm shadow-pop animate-[tm-pop_120ms_ease-out] sm:left-auto sm:w-72"
        >
          <div className="font-medium text-ink">{meta.label}</div>
          <p className="mt-1 text-ink-2">{meta.description}</p>
          <div className="mt-2 rounded bg-subtle px-2 py-1 font-mono text-xs text-ink-2">Formula: {meta.formula}</div>
        </div>
      )}
    </div>
  )
}
