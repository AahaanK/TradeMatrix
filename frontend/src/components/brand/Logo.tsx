import React from "react"
import { cn } from "../../utils/cn"

/**
 * TradeMatrix mark: a 3 x 3 matrix whose filled cells rise column by column,
 * so it reads both as a grid and as a climbing bar chart. The top-right cell
 * is the one "answer" cell and is drawn in Alabaster.
 */
export const LogoMark: React.FC<{ size?: number; className?: string; tone?: "default" | "inverse" }> = ({
  size = 28,
  className,
  tone = "default",
}) => {
  const tile = tone === "inverse" ? "#F7F6F2" : "#063154"
  const idle = tone === "inverse" ? "#063154" : "#F7F6F2"
  const peak = tone === "inverse" ? "#063154" : "#F7F6F2"
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill={tile} />
      <g fill={idle} fillOpacity={0.14}>
        <rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
        <rect x="13" y="4.5" width="6" height="6" rx="1.2" />
        <rect x="4.5" y="13" width="6" height="6" rx="1.2" />
      </g>
      <g fill="#2F9D94">
        <rect x="4.5" y="21.5" width="6" height="6" rx="1.2" />
        <rect x="13" y="13" width="6" height="6" rx="1.2" />
        <rect x="13" y="21.5" width="6" height="6" rx="1.2" />
        <rect x="21.5" y="13" width="6" height="6" rx="1.2" />
        <rect x="21.5" y="21.5" width="6" height="6" rx="1.2" />
      </g>
      <rect x="21.5" y="4.5" width="6" height="6" rx="1.2" fill={peak} />
    </svg>
  )
}

export const Logo: React.FC<{
  className?: string
  size?: number
  wordmarkClassName?: string
  tone?: "default" | "inverse"
}> = ({ className, size = 28, wordmarkClassName, tone }) => (
  <span className={cn("inline-flex items-center gap-2.5", className)}>
    <LogoMark size={size} tone={tone} />
    <span className={cn("text-[17px] font-semibold tracking-[-0.01em] leading-none", wordmarkClassName)}>
      TradeMatrix
    </span>
  </span>
)
