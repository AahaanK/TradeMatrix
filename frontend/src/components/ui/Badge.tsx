import React from "react"
import { cn } from "../../utils/cn"
import { regimeMeta } from "../../utils/format"
import { useDataset } from "../../hooks/useDataset"

interface BadgeProps {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "error" | "regime" | "neutral" | "danger" | "brand"
  regime?: string
  size?: "sm" | "md"
  className?: string
  title?: string
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = "default", regime, size = "sm", className, title }) => {
  if (variant === "regime" && regime) {
    return (
      <RegimeBadge label={regime} size={size} className={className}>
        {children}
      </RegimeBadge>
    )
  }
  const tone = {
    default: "bg-subtle text-ink-2 border-line",
    neutral: "bg-subtle text-ink-2 border-line",
    brand: "bg-brand/10 text-brand border-brand/25",
    success: "bg-accent/10 text-pos border-accent/30",
    warning: "bg-warn/10 text-warn border-warn/30",
    error: "bg-neg/10 text-neg border-neg/30",
    danger: "bg-neg/10 text-neg border-neg/30",
    regime: "bg-subtle text-ink-2 border-line",
  }[variant]
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border font-medium",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-sm",
        tone,
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * Market-condition label. Shows the plain-English name with a colour swatch;
 * the technical label is kept in the tooltip for people who know it.
 */
export const RegimeBadge: React.FC<{
  label: string
  size?: "sm" | "md"
  className?: string
  children?: React.ReactNode
}> = ({ label, size = "sm", className, children }) => {
  const { theme } = useDataset()
  const meta = regimeMeta(label)
  const color = theme === "dark" ? meta.darkColor : meta.color
  return (
    <span
      title={`${meta.name} (${label}). ${meta.description}`}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-line bg-surface font-medium text-ink",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-sm",
        className
      )}
    >
      <span className="inline-block size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden="true" />
      {children && typeof children === "string" && children === label ? meta.name : children ?? meta.name}
    </span>
  )
}

export const RegimeSwatch: React.FC<{ label: string; className?: string }> = ({ label, className }) => {
  const { theme } = useDataset()
  const meta = regimeMeta(label)
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", className)}
      style={{ backgroundColor: theme === "dark" ? meta.darkColor : meta.color }}
      aria-hidden="true"
    />
  )
}
