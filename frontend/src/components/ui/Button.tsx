import React from "react"
import { Link, type LinkProps } from "react-router-dom"
import { cn } from "../../utils/cn"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet"
export type ButtonSize = "sm" | "md" | "lg"

const base =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none " +
  "rounded-md border transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas " +
  "disabled:pointer-events-none disabled:opacity-50 active:translate-y-px"

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-fg border-brand-hover/60 hover:bg-brand-hover " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_1px_rgb(6_49_84/0.12)]",
  secondary:
    "bg-surface text-ink border-line-strong/80 hover:bg-subtle hover:border-line-strong " +
    "shadow-[0_1px_1px_rgb(6_49_84/0.05)]",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-subtle hover:text-ink",
  quiet: "bg-subtle text-ink border-transparent hover:bg-line/70",
  danger:
    "bg-surface text-neg border-neg/35 hover:bg-neg hover:text-white hover:border-neg",
}

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-sm [&_svg]:size-3.5",
  md: "h-9 px-3.5 text-sm [&_svg]:size-4",
  lg: "h-11 px-5 text-[15px] [&_svg]:size-4",
}

export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
)
Button.displayName = "Button"

export const ButtonLink: React.FC<
  LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode }
> = ({ variant = "secondary", size = "md", icon, className, children, ...rest }) => (
  <Link className={buttonClasses(variant, size, cn("no-underline", className as string))} {...rest}>
    {icon}
    {children}
  </Link>
)

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }
>(({ label, size = "md", className, children, type = "button", ...rest }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    title={label}
    className={cn(
      "inline-flex items-center justify-center rounded-md text-ink-2 border border-transparent transition-colors",
      "hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      "disabled:opacity-40 disabled:pointer-events-none",
      size === "sm" ? "size-7 [&_svg]:size-3.5" : "size-9 [&_svg]:size-4",
      className
    )}
    {...rest}
  >
    {children}
  </button>
))
IconButton.displayName = "IconButton"

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
    <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
