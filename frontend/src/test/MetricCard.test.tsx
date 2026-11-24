import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { MetricCard } from "../components/ui/MetricCard"

describe("MetricCard Component", () => {
  it("renders metric label, value, and subValue correctly", () => {
    render(
      <MetricCard
        id="sharpe_ratio"
        label="Sharpe Ratio"
        value="1.85"
        subValue="Annualized (rf=0.0%)"
        trend="positive"
      />
    )

    expect(screen.getByText("Sharpe Ratio")).toBeInTheDocument()
    expect(screen.getByText("1.85")).toBeInTheDocument()
    expect(screen.getByText("Annualized (rf=0.0%)")).toBeInTheDocument()
  })

  it("reveals definition and formula tooltip on help click", () => {
    render(
      <MetricCard
        id="sharpe_ratio"
        label="Sharpe Ratio"
        value="1.85"
      />
    )

    const helpBtn = screen.getByLabelText("Definition of Sharpe Ratio")
    expect(helpBtn).toBeInTheDocument()

    // Initially tooltip text is not visible
    expect(screen.queryByText(/Excess return over risk-free rate/i)).not.toBeInTheDocument()

    // Click to toggle tooltip
    fireEvent.click(helpBtn)

    // Now formula and description should be displayed
    expect(screen.getByText(/Formula:/i)).toBeInTheDocument()
    expect(screen.getByText(/Excess return over risk-free rate/i)).toBeInTheDocument()
  })

  it("applies negative trend styling when specified", () => {
    const { container } = render(
      <MetricCard
        id="max_drawdown"
        label="Max Drawdown"
        value="-18.5%"
        trend="negative"
      />
    )

    const valueEl = screen.getByText("-18.5%")
    expect(valueEl.className).toContain("text-loss")
  })
})
