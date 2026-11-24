import { describe, it, expect } from "vitest"
import { toCsv } from "../utils/csv"
import { formatPercent, formatLoss, regimeName, describeParams } from "../utils/format"

describe("CSV export", () => {
  it("quotes values that contain commas, quotes or newlines", () => {
    const csv = toCsv([{ a: "x,y", b: 'say "hi"', c: 3 }])
    expect(csv).toBe('a,b,c\n"x,y","say ""hi""",3\n')
  })

  it("uses column labels when provided", () => {
    const csv = toCsv([{ date: "2024-01-02", close: 1.5 }], [
      { key: "date", label: "Date" },
      { key: "close", label: "Close" },
    ])
    expect(csv.split("\n")[0]).toBe("Date,Close")
  })
})

describe("Formatting helpers", () => {
  it("formats percentages with a true minus sign", () => {
    expect(formatPercent(0.1234)).toBe("+12.34%")
    expect(formatPercent(-0.05)).toBe("−5.00%")
    expect(formatPercent(null)).toBe("—")
  })

  it("shows loss magnitudes as negative numbers", () => {
    expect(formatLoss(0.0123)).toBe("−1.23%")
  })

  it("maps API regime labels to plain names", () => {
    expect(regimeName("Bull/Low Vol")).toBe("Calm uptrend")
    expect(regimeName("Bear/High Vol")).toBe("Volatile downtrend")
    expect(regimeName("something else")).toBe("Not enough history")
  })

  it("describes strategy parameters in words", () => {
    expect(describeParams({ fast: 20, slow: 50 })).toBe("Fast MA 20 days, Slow MA 50 days")
    expect(describeParams({ threshold: 0.02, mode: "long_flat" })).toBe("Threshold 2%, Mode buy or cash")
  })
})
