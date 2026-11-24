/** Builds a CSV string. Values containing commas, quotes or new lines are quoted. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return ""
  const cols = columns ?? Object.keys(rows[0]).map(k => ({ key: k, label: k }))
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ""
    const s = typeof v === "object" ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.map(c => esc(c.label)).join(",")
  const body = rows.map(r => cols.map(c => esc(r[c.key])).join(",")).join("\n")
  return `${header}\n${body}\n`
}

/** Triggers a browser download of the given rows as a CSV file. */
export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: { key: string; label: string }[]
): void {
  const blob = new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
