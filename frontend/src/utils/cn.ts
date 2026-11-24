import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge about our custom font-size scale so `text-2xs` is
// treated as a size (not a colour) and does not wipe out `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
