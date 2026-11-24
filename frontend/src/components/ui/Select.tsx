import React, { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { cn } from "../../utils/cn"

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  /** Short secondary text shown under the label in the menu */
  description?: string
  /** Small text shown on the right of the row (e.g. a ticker) */
  meta?: string
  group?: string
  disabled?: boolean
}

interface SelectProps<V extends string> {
  value: V
  onChange: (value: NoInfer<V>) => void
  options: SelectOption<NoInfer<V>>[]
  /** Visible label rendered above the trigger */
  label?: string
  /** Accessible name when there is no visible label */
  ariaLabel?: string
  placeholder?: string
  /** Show a filter box at the top of the menu */
  searchable?: boolean
  searchPlaceholder?: string
  /** Lets the user pick a value that is not in the list (e.g. a custom ticker) */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
  /** Normalise free-text before it is offered as a custom value */
  normalizeQuery?: (query: string) => string
  size?: "sm" | "md"
  className?: string
  menuClassName?: string
  /** Render the trigger's text differently from the option label */
  renderValue?: (option: SelectOption<NoInfer<V>> | undefined) => React.ReactNode
  disabled?: boolean
  align?: "start" | "end"
  hint?: string
}

/**
 * Accessible single-select dropdown.
 * - Trigger is a button with aria-haspopup="listbox".
 * - Arrow keys, Home/End, Enter/Space, Escape and Tab behave like a native select.
 * - Optional search box filters the list; typing on a closed trigger jumps to matching options.
 */
export function Select<V extends string>({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Search…",
  onCreate,
  createLabel = q => `Use "${q}"`,
  normalizeQuery = q => q.trim(),
  size = "md",
  className,
  menuClassName,
  renderValue,
  disabled,
  align = "start",
  hint,
}: SelectProps<V>) {
  const id = useId()
  const listId = `${id}-list`
  const labelId = `${id}-label`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ text: "", at: 0 })

  const selected = options.find(o => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      o =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false) ||
        (o.meta?.toLowerCase().includes(q) ?? false)
    )
  }, [options, query])

  const createValue = onCreate ? normalizeQuery(query) : ""
  const showCreate =
    !!onCreate && createValue.length > 0 && !options.some(o => o.value.toLowerCase() === createValue.toLowerCase())
  const rowCount = filtered.length + (showCreate ? 1 : 0)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  // On open: reset search, highlight the current value, focus the right element
  useEffect(() => {
    if (!open) return
    setQuery("")
    const idx = Math.max(0, options.findIndex(o => o.value === value))
    setActive(idx)
    requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus()
      else listRef.current?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (active >= rowCount) setActive(Math.max(0, rowCount - 1))
  }, [rowCount, active])

  // Keep the active row visible
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const commit = (index: number) => {
    if (index < filtered.length) {
      const opt = filtered[index]
      if (opt.disabled) return
      onChange(opt.value)
    } else if (showCreate) {
      onCreate?.(createValue)
    }
    close()
  }

  const move = (delta: number) => {
    if (rowCount === 0) return
    setActive(a => {
      let next = a
      for (let i = 0; i < rowCount; i++) {
        next = (next + delta + rowCount) % rowCount
        if (next >= filtered.length || !filtered[next].disabled) break
      }
      return next
    })
  }

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        move(1)
        break
      case "ArrowUp":
        e.preventDefault()
        move(-1)
        break
      case "Home":
        e.preventDefault()
        setActive(0)
        break
      case "End":
        e.preventDefault()
        setActive(rowCount - 1)
        break
      case "Enter":
        e.preventDefault()
        commit(active)
        break
      case " ":
        if (!searchable) {
          e.preventDefault()
          commit(active)
        }
        break
      case "Escape":
        e.preventDefault()
        close()
        break
      case "Tab":
        setOpen(false)
        break
      default:
        if (!searchable && e.key.length === 1) jumpTo(e.key)
    }
  }

  const jumpTo = (char: string) => {
    const now = Date.now()
    const t = typeahead.current
    t.text = now - t.at < 600 ? t.text + char.toLowerCase() : char.toLowerCase()
    t.at = now
    const idx = options.findIndex(o => o.label.toLowerCase().startsWith(t.text))
    if (idx >= 0) {
      if (open) setActive(idx)
      else onChange(options[idx].value)
    }
  }

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault()
      setOpen(true)
    } else if (e.key.length === 1 && !searchable) {
      jumpTo(e.key)
    }
  }

  // Group headings (only when not filtering)
  let lastGroup: string | undefined
  const activeId = rowCount > 0 ? `${id}-opt-${active}` : undefined

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {label && (
        <span id={labelId} className="tm-label">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={label ? `${labelId} ${id}-value` : undefined}
        aria-label={label ? undefined : ariaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onTriggerKey}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-md border bg-surface text-left text-ink transition-colors",
          "border-line-strong/80 hover:border-ink-3 focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25",
          open && "border-accent ring-2 ring-accent/25",
          size === "sm" ? "h-8 pl-2.5 pr-2 text-sm" : "h-9 pl-3 pr-2.5 text-sm",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span id={`${id}-value`} className={cn("truncate", !selected && "text-ink-3")}>
          {renderValue ? renderValue(selected) : selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-150", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {hint && <p className="tm-hint">{hint}</p>}

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 min-w-full w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface shadow-pop",
            "origin-top animate-[tm-pop_120ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-2.5">
              <Search className="size-4 text-ink-3" aria-hidden="true" />
              <input
                ref={searchRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                aria-label={searchPlaceholder}
                value={query}
                onChange={e => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onListKey}
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            aria-activedescendant={searchable ? undefined : activeId}
            onKeyDown={searchable ? undefined : onListKey}
            className="max-h-72 overflow-y-auto p-1 focus:outline-none"
          >
            {filtered.map((opt, i) => {
              const heading = !query && opt.group && opt.group !== lastGroup ? opt.group : null
              lastGroup = opt.group
              const isSelected = opt.value === value
              return (
                <React.Fragment key={opt.value}>
                  {heading && (
                    <li role="presentation" className="px-2 pb-1 pt-2 text-xs font-medium text-ink-3">
                      {heading}
                    </li>
                  )}
                  <li
                    id={`${id}-opt-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseMove={() => setActive(i)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => commit(i)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm text-ink",
                      i === active && "bg-subtle",
                      opt.disabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <Check
                      className={cn("mt-0.5 size-4 shrink-0 text-brand", !isSelected && "invisible")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opt.label}</span>
                      {opt.description && <span className="block text-xs text-ink-3">{opt.description}</span>}
                    </span>
                    {opt.meta && <span className="mt-px text-xs text-ink-3 num">{opt.meta}</span>}
                  </li>
                </React.Fragment>
              )
            })}
            {showCreate && (
              <li
                id={`${id}-opt-${filtered.length}`}
                data-index={filtered.length}
                role="option"
                aria-selected={false}
                onMouseMove={() => setActive(filtered.length)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => commit(filtered.length)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink",
                  active === filtered.length && "bg-subtle"
                )}
              >
                <span className="size-4" aria-hidden="true" />
                {createLabel(createValue)}
              </li>
            )}
            {rowCount === 0 && <li className="px-2 py-3 text-sm text-ink-3">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
