import React from "react"
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react"
import { Button } from "./Button"
import { cn } from "../../utils/cn"

interface EmptyStateProps {
  title: string
  description: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  secondary?: React.ReactNode
  icon?: "database" | "error"
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  secondary,
  icon = "database",
  className,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong/70 bg-surface px-6 py-12 text-center",
      className
    )}
  >
    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-subtle">
      {icon === "error" ? (
        <AlertTriangle className="size-5 text-neg" aria-hidden="true" />
      ) : (
        <Inbox className="size-5 text-ink-3" aria-hidden="true" />
      )}
    </div>
    <h3 className="text-md font-semibold">{title}</h3>
    <p className="mt-1 max-w-md text-sm text-ink-2">{description}</p>
    {(actionLabel || secondary) && (
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {actionLabel && onAction && (
          <Button variant="primary" onClick={onAction} icon={icon === "error" ? <RefreshCw /> : undefined}>
            {actionLabel}
          </Button>
        )}
        {secondary}
      </div>
    )}
  </div>
)

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("tm-skeleton rounded-md", className)} aria-hidden="true" />
)

/** Page-level loading placeholder that mirrors the layout it will become. */
export const LoadingState: React.FC<{ message?: string; variant?: "page" | "panel" }> = ({
  message = "Loading…",
  variant = "page",
}) => (
  <div role="status" aria-live="polite" className="space-y-4">
    <span className="sr-only">{message}</span>
    {variant === "page" && (
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
    )}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[84px]" />
      ))}
    </div>
    <Skeleton className="h-[320px]" />
    <p className="text-sm text-ink-3">{message}</p>
  </div>
)

/** Error panel with a retry button and a plain-language explanation. */
export const ErrorState: React.FC<{
  error: unknown
  onRetry?: () => void
  title?: string
  hint?: React.ReactNode
  secondary?: React.ReactNode
}> = ({ error, onRetry, title = "We couldn't load this data", hint, secondary }) => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error")
  // A TypeError from fetch() means the request never reached the server
  const offline = error instanceof TypeError && /fetch|network|load failed/i.test(message)
  const download = message.match(/Failed to fetch market data for '([^']+)'/i)
  return (
    <EmptyState
      icon="error"
      title={title}
      description={
        <>
          {offline
            ? "The analysis server isn't responding. Start the backend (make run-backend) and try again."
            : download
              ? `Prices for ${download[1]} couldn't be downloaded from Yahoo Finance. Check your internet connection and that the symbol is correct, or use the built-in SPY data.`
              : message}
          {hint && <span className="mt-2 block">{hint}</span>}
        </>
      }
      actionLabel={onRetry ? "Try again" : undefined}
      onAction={onRetry}
      secondary={secondary}
    />
  )
}
