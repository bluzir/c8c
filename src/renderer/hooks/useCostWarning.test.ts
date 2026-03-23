import { describe, expect, it } from "vitest"
import type { PreflightWarning } from "@/features/execution/preflight"
import { createCostWarningController } from "./useCostWarning"

function createBudgetWarning(
  overrides: Partial<PreflightWarning> = {},
): PreflightWarning {
  return {
    kind: "token_budget",
    title: "Budget warning",
    message: "Large run cost",
    detail: "",
    estimatedCostUsd: 0,
    worstCaseInvocations: 0,
    ...overrides,
  }
}

describe("createCostWarningController", () => {
  it("resolves immediately when there is no token budget warning", async () => {
    const states: Array<{ open: boolean; warning: PreflightWarning | null }> =
      []
    const controller = createCostWarningController((state) =>
      states.push(state),
    )

    await expect(
      controller.handlePreflightWarnings([
        {
          kind: "provider_auth",
          title: "Auth",
          message: "Please sign in",
        } as unknown as PreflightWarning,
      ]),
    ).resolves.toBe(true)
    expect(states).toEqual([])
  })

  it("prevents overlapping dialogs and resolves the active one on confirm", async () => {
    const states: Array<{ open: boolean; warning: PreflightWarning | null }> =
      []
    const controller = createCostWarningController((state) =>
      states.push(state),
    )

    const first = controller.handlePreflightWarnings([createBudgetWarning()])
    await expect(
      controller.handlePreflightWarnings([
        createBudgetWarning({ message: "second" }),
      ]),
    ).resolves.toBe(false)

    controller.confirm()

    await expect(first).resolves.toBe(true)
    expect(states).toEqual([
      { open: true, warning: createBudgetWarning() },
      { open: false, warning: null },
    ])
  })

  it("treats closing the dialog as cancellation", async () => {
    const states: Array<{ open: boolean; warning: PreflightWarning | null }> =
      []
    const controller = createCostWarningController((state) =>
      states.push(state),
    )

    const pending = controller.handlePreflightWarnings([createBudgetWarning()])
    controller.setOpen(false)

    await expect(pending).resolves.toBe(false)
    expect(states[states.length - 1]).toEqual({ open: false, warning: null })
  })
})
