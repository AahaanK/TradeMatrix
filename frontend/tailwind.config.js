/** @type {import('tailwindcss').Config} */
const token = name => `rgb(var(--tm-${name}) / <alpha-value>)`

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand palette (fixed values, identical in both themes)
        scooter: "#2F9D94",
        alabaster: "#F7F6F2",
        heather: "#BCC5CC",
        "blue-lagoon": "#025F67",
        sapphire: "#063154",

        // Semantic tokens (switch with the theme, see index.css)
        canvas: token("bg"),
        surface: token("surface"),
        subtle: token("subtle"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        brand: token("brand"),
        "brand-hover": token("brand-hover"),
        "brand-fg": token("brand-fg"),
        accent: token("accent"),
        pos: token("pos"),
        neg: token("neg"),
        warn: token("warn"),
        nav: token("nav"),
        // Kept for backwards compatibility with older class names
        loss: token("neg"),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "14px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        md: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "26px" }],
        xl: ["22px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "34px" }],
        "3xl": ["36px", { lineHeight: "42px" }],
        "4xl": ["48px", { lineHeight: "52px" }],
        "5xl": ["60px", { lineHeight: "62px" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
      },
      boxShadow: {
        pop: "0 1px 2px rgb(6 49 84 / 0.06), 0 8px 24px -6px rgb(6 49 84 / 0.18)",
        hairline: "0 1px 0 rgb(6 49 84 / 0.04)",
      },
      maxWidth: {
        page: "1440px",
      },
    },
  },
  plugins: [],
}
