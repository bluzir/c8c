// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SidebarChatRow } from "./SidebarChatRow"
import type { ChatSummary } from "@shared/types"

afterEach(cleanup)

function makeChatSummary(overrides?: Partial<ChatSummary>): ChatSummary {
  return {
    id: "chat-1",
    name: "My test thread",
    createdAt: Date.now() - 3600_000,
    lastActivityAt: Date.now() - 60_000,
    archived: false,
    runCount: 1,
    latestRunId: "run-1",
    latestRunStatus: "completed",
    ...overrides,
  }
}

describe("SidebarChatRow", () => {
  it("renders thread name", () => {
    render(
      <SidebarChatRow
        chat={makeChatSummary()}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText("My test thread")).toBeTruthy()
  })

  it("renders relative time label", () => {
    render(
      <SidebarChatRow
        chat={makeChatSummary({ lastActivityAt: Date.now() - 60_000 })}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    // formatRelativeTime should show "1m" for 60s ago
    expect(screen.getByText("1m")).toBeTruthy()
  })

  it("highlights when selected via aria-current", () => {
    render(
      <SidebarChatRow
        chat={makeChatSummary()}
        isSelected={true}
        onClick={() => {}}
      />,
    )
    const button = screen.getByRole("button")
    expect(button.getAttribute("aria-current")).toBe("page")
  })

  it("shows run count when > 1", () => {
    render(
      <SidebarChatRow
        chat={makeChatSummary({ runCount: 3 })}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText("3")).toBeTruthy()
  })

  it("shows project name when present", () => {
    render(
      <SidebarChatRow
        chat={makeChatSummary({ projectName: "My Project" })}
        isSelected={false}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText("My Project")).toBeTruthy()
  })
})
