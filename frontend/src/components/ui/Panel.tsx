import React from "react"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"
import { cn } from "../../utils/cn"

/** Page title block used at the top of every dashboard screen. */
export const PageHeader: React.FC<{
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}> = ({ title, description, actions, children }) => (
  <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0 max-w-3xl">
      <h1 className="text-xl font-semibold tracking-[-0.01em] sm:text-2xl">{title}</h1>
      {description && <p className="mt-1.5 text-base text-ink-2">{description}</p>}
      {children}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
  </header>
)

/** Bordered content section with an optional header row. */
export const Panel: React.FC<{
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  /** Remove body padding (for edge-to-edge tables and charts) */
  flush?: boolean
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
  id?: string
}> = ({ title, description, actions, footer, flush, className, bodyClassName, children, id }) => (
  <section id={id} className={cn("rounded-lg border border-line bg-surface", className)}>
    {(title || actions) && (
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          {title && <h2 className="text-md font-semibold leading-6">{title}</h2>}
          {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={cn(!flush && "p-4", bodyClassName)}>{children}</div>
    {footer && <div className="border-t border-line px-4 py-2.5 text-sm text-ink-2">{footer}</div>}
  </section>
)

/** Inline message for tips, warnings and errors. */
export const Alert: React.FC<{
  tone?: "info" | "success" | "warning" | "error"
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}> = ({ tone = "info", title, children, action, className }) => {
  const styles = {
    info: { box: "border-line bg-subtle", icon: <Info className="size-4 text-brand" /> },
    success: { box: "border-accent/40 bg-accent/[0.07]", icon: <CheckCircle2 className="size-4 text-pos" /> },
    warning: { box: "border-warn/35 bg-warn/[0.07]", icon: <AlertTriangle className="size-4 text-warn" /> },
    error: { box: "border-neg/35 bg-neg/[0.06]", icon: <XCircle className="size-4 text-neg" /> },
  }[tone]
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-3.5 py-3 text-sm sm:flex-nowrap", styles.box, className)}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {styles.icon}
      </span>
      <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] text-ink-2 sm:basis-auto">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 pl-7 sm:pl-0">{action}</div>}
    </div>
  )
}

/** A label/value pair used inside panels. */
export const Stat: React.FC<{
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: "pos" | "neg" | "neutral"
  className?: string
}> = ({ label, value, sub, tone = "neutral", className }) => (
  <div className={className}>
    <div className="text-xs text-ink-3">{label}</div>
    <div
      className={cn(
        "num mt-0.5 text-md font-semibold",
        tone === "pos" && "text-pos",
        tone === "neg" && "text-neg",
        tone === "neutral" && "text-ink"
      )}
    >
      {value}
    </div>
    {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
  </div>
)
