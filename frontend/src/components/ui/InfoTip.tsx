import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Info } from "lucide-react"
import { cn } from "../../utils/cn"

/**
 * Small "i" button that explains a term. Opens on hover, keyboard focus or tap,
 * closes on Escape or blur. Rendered in a portal so it is never clipped by tables.
 */
export const InfoTip: React.FC<{
  label: string
  children: React.ReactNode
  className?: string
  iconClassName?: string
}> = ({ label, children, className, iconClassName }) => {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean }>({ top: 0, left: 0, above: false })

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const tipW = 280
    const tipH = tipRef.current?.offsetHeight ?? 80
    const left = Math.min(Math.max(8, r.left + r.width / 2 - tipW / 2), window.innerWidth - tipW - 8)
    const above = r.bottom + tipH + 12 > window.innerHeight
    const top = above ? r.top - tipH - 8 : r.bottom + 8
    setPos({ top: top + window.scrollY, left: left + window.scrollX, above })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        setPinned(false)
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !tipRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setPinned(false)
      }
    }
    window.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          setPinned(p => !p)
          setOpen(true)
        }}
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-brand",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          className
        )}
      >
        <Info className={cn("size-3.5", iconClassName)} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: 280 }}
            className="absolute z-[100] rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink-2 shadow-pop animate-[tm-fade_100ms_ease-out]"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
