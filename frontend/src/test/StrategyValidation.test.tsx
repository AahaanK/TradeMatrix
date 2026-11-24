import { describe, it, expect } from "vitest"

describe("Quantitative Strategy Validation Rules", () => {
  it("rejects fast MA period greater than or equal to slow period", () => {
    const validateMaParams = (fast: number, slow: number): string | null => {
      if (fast >= slow) {
        return `Fast period (${fast}) must be strictly less than Slow period (${slow}).`
      }
      return null
    }

    expect(validateMaParams(50, 20)).toBe("Fast period (50) must be strictly less than Slow period (20).")
    expect(validateMaParams(50, 50)).toBe("Fast period (50) must be strictly less than Slow period (50).")
    expect(validateMaParams(20, 50)).toBeNull()
  })

  it("rejects Bollinger entry z-score greater than or equal to exit z-score", () => {
    const validateMeanReversionParams = (entryZ: number, exitZ: number): string | null => {
      if (entryZ >= exitZ) {
        return `Entry Z-score (${entryZ}) must be strictly less than Exit Z-score (${exitZ}).`
      }
      return null
    }

    expect(validateMeanReversionParams(0.5, -1.0)).toBe(
      "Entry Z-score (0.5) must be strictly less than Exit Z-score (-1)."
    )
    expect(validateMeanReversionParams(-1.5, -0.5)).toBeNull()
  })

  it("validates transaction cost and slippage constraints", () => {
    const validateCosts = (commissionBps: number, slippageBps: number): boolean => {
      return commissionBps >= 0 && slippageBps >= 0 && commissionBps + slippageBps <= 500
    }

    expect(validateCosts(5, 5)).toBe(true)
    expect(validateCosts(-1, 5)).toBe(false)
    expect(validateCosts(300, 300)).toBe(false)
  })
})
