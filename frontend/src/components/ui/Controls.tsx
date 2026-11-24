import React, { useId, useRef } from "react"
import { cn } from "../../utils/cn"
import { InfoTip } from "./InfoTip"

/* ------------------------------------------------------------------ */
/* Segmented control (single choice, radio group semantics)            */
/* ------------------------------------------------------------------ */

export interface SegmentOption<V extends string | number> {
  value: V
  label: React.ReactNode
  title?: string
}

export function SegmentedControl<V extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: {
  value: V
  onChange: (v: NoInfer<V>) => void
  options: SegmentOption<NoInfer<V>>[]
  ariaLabel: string
  size?: "sm" | "md"
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    let next = -1
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length
    if (e.key === "Home") next = 0
    if (e.key === "End") next = options.length - 1
    if (next >= 0) {
      e.preventDefault()
      onChange(options[next].value)
      refs.current[next]?.focus()
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-md border border-line-strong/70 bg-subtle p-0.5", className)}
    >
      {options.map((opt, i) => {
        const checked = opt.value === value
        return (
          <button
            key={String(opt.value)}
            ref={el => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            onKeyDown={e => onKey(e, i)}
            className={cn(
              "rounded-[5px] font-medium transition-[background-color,color,box-shadow] duration-150 whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              checked
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(6_49_84/0.12)] ring-1 ring-line-strong/60"
                : "text-ink-2 hover:text-ink"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Switch                                                             */
/* ------------------------------------------------------------------ */

export const Switch: React.FC<{
  checked: boolean
  onChange: (v: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
  className?: string
  labelClassName?: string
}> = ({ checked, onChange, label, description, className, labelClassName }) => {
  const id = useId()
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          checked ? "bg-brand border-brand" : "bg-line-strong/60 border-line-strong/60"
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(6_49_84/0.3)] transition-transform duration-150",
            checked ? "translate-x-[17px]" : "translate-x-[1px]"
          )}
        />
      </button>
      <label htmlFor={id} className={cn("cursor-pointer select-none text-sm text-ink", labelClassName)}>
        {label}
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </label>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Checkbox                                                           */
/* ------------------------------------------------------------------ */

export const Checkbox: React.FC<{
  checked: boolean
  onChange: (v: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
  className?: string
}> = ({ checked, onChange, label, description, className }) => {
  const id = useId()
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-[3px] size-4 shrink-0 cursor-pointer rounded-sm accent-[rgb(var(--tm-brand))]"
      />
      <label htmlFor={id} className="cursor-pointer select-none text-sm text-ink">
        {label}
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </label>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Slider with label, live value and help text                        */
/* ------------------------------------------------------------------ */

export const SliderField: React.FC<{
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  hint?: React.ReactNode
  info?: React.ReactNode
  minLabel?: string
  maxLabel?: string
  className?: string
}> = ({ label, value, onChange, min, max, step = 1, format = v => String(v), hint, info, minLabel, maxLabel, className }) => {
  const id = useId()
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="flex items-center gap-1 text-sm font-medium text-ink">
          {label}
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </label>
        <output htmlFor={id} className="num text-sm font-medium text-ink">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={e => onChange(Number(e.target.value))}
        className="tm-range"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      {(minLabel || maxLabel) && (
        <div className="mt-0.5 flex justify-between text-2xs text-ink-3 num">
          <span>{minLabel ?? format(min)}</span>
          <span>{maxLabel ?? format(max)}</span>
        </div>
      )}
      {hint && <p className="tm-hint">{hint}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Text / number field                                                */
/* ------------------------------------------------------------------ */

export const Field: React.FC<{
  label: string
  hint?: React.ReactNode
  info?: React.ReactNode
  error?: string | null
  suffix?: string
  prefix?: string
  className?: string
  children?: (id: string, describedBy?: string) => React.ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "children" | "prefix">> = ({
  label,
  hint,
  info,
  error,
  suffix,
  prefix,
  className,
  children,
  ...input
}) => {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="tm-label flex items-center gap-1">
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </label>
      {children ? (
        children(id, hintId)
      ) : (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-3">
              {prefix}
            </span>
          )}
          <input
            id={id}
            aria-describedby={hintId}
            aria-invalid={!!error || undefined}
            className={cn("tm-input num", prefix && "pl-7", suffix && "pr-12", error && "border-neg focus:border-neg focus:ring-neg/20")}
            {...input}
          />
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-3">
              {suffix}
            </span>
          )}
        </div>
      )}
      {(error || hint) && (
        <p id={hintId} className={cn("tm-hint", error && "text-neg")}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

export function Tabs<V extends string>({
  value,
  onChange,
  tabs,
  ariaLabel,
  className,
}: {
  value: V
  onChange: (v: NoInfer<V>) => void
  tabs: { value: NoInfer<V>; label: React.ReactNode }[]
  ariaLabel: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length
    if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length
    if (next >= 0) {
      e.preventDefault()
      onChange(tabs[next].value)
      refs.current[next]?.focus()
    }
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-5 border-b border-line overflow-x-auto", className)}>
      {tabs.map((t, i) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            ref={el => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={e => onKey(e, i)}
            className={cn(
              "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-none focus-visible:text-ink focus-visible:border-accent",
              selected ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink"
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
