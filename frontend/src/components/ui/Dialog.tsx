import React, { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "./Button"

/** Accessible confirmation dialog (replaces window.confirm). */
export const ConfirmDialog: React.FC<{
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel: string
  tone?: "danger" | "primary"
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}> = ({ open, title, description, confirmLabel, tone = "primary", loading, onConfirm, onCancel }) => {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      lastFocus.current?.focus?.()
    }
  }, [open, onCancel])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-sapphire/40 animate-[tm-fade_120ms_ease-out]" onClick={onCancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-pop animate-[tm-pop_140ms_ease-out]"
      >
        <h2 id={titleId} className="text-md font-semibold">
          {title}
        </h2>
        {description && (
          <div id={descId} className="mt-1.5 text-sm text-ink-2">
            {description}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
