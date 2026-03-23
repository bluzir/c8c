import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import {
  appendInboxNotification,
  closeSkillPickerAtom,
  currentWorkflowAtom,
  openSkillPickerAtom,
  pruneInboxNotificationsByPersistentKeys,
  selectedWorkflowPathAtom,
  skillPickerOpenAtom,
  skillPickerRequestAtom,
  type InboxNotification,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
} from "./store"
import { workflowSnapshot } from "./workflow-snapshot"

describe("inbox notification helpers", () => {
  it("upserts persistent notifications in place without duplicating them", () => {
    const existing: InboxNotification[] = [
      {
        id: "notif-1",
        title: "Old title",
        description: "Old description",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-1",
          label: "Open approval",
        },
        createdAt: 10,
        read: true,
      },
    ]

    const next = appendInboxNotification(
      existing,
      {
        title: "Updated title",
        description: "Updated description",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-1",
          workflowPath: "/tmp/workflow.chain",
          label: "Open approval",
        },
      },
      20,
    )

    expect(next).toEqual([
      {
        id: "notif-1",
        title: "Updated title",
        description: "Updated description",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-1",
          workflowPath: "/tmp/workflow.chain",
          label: "Open approval",
        },
        createdAt: 10,
        read: true,
      },
    ])
  })

  it("does not collapse different persistent approvals that share copy", () => {
    const existing: InboxNotification[] = []

    const withFirst = appendInboxNotification(
      existing,
      {
        title: "Approval needs attention",
        description: "Open the inbox task to continue.",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-1",
        },
      },
      100,
    )

    const withSecond = appendInboxNotification(
      withFirst,
      {
        title: "Approval needs attention",
        description: "Open the inbox task to continue.",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-2",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace::approval-2",
        },
      },
      101,
    )

    expect(withSecond).toHaveLength(2)
    expect(withSecond[0]?.persistentKey).toBe(
      "approval-needed:/tmp/workspace::approval-2",
    )
    expect(withSecond[1]?.persistentKey).toBe(
      "approval-needed:/tmp/workspace::approval-1",
    )
  })

  it("removes stale persistent notifications without touching unrelated history", () => {
    const existing: InboxNotification[] = [
      {
        id: "notif-1",
        title: "Approval needed",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace::approval-1",
        createdAt: 10,
        read: false,
      },
      {
        id: "notif-2",
        title: "Flow completed",
        level: "success",
        source: "workflow",
        createdAt: 20,
        read: true,
      },
    ]

    expect(
      pruneInboxNotificationsByPersistentKeys(existing, [
        "approval-needed:/tmp/workspace::approval-1",
      ]),
    ).toEqual([
      {
        id: "notif-2",
        title: "Flow completed",
        level: "success",
        source: "workflow",
        createdAt: 20,
        read: true,
      },
    ])
  })
})

describe("workflowDirtyAtom", () => {
  it("stays clean for a fresh empty draft", () => {
    const store = createStore()
    expect(store.get(workflowDirtyAtom)).toBe(false)
  })

  it("becomes dirty after a meaningful mutation", () => {
    const store = createStore()
    store.set(currentWorkflowAtom, {
      version: 1,
      name: "Dirty draft",
      description: "",
      defaults: {
        model: "sonnet",
        maxTurns: 120,
        timeout_minutes: 30,
        maxParallel: 8,
      },
      nodes: [],
      edges: [],
    })

    expect(store.get(workflowDirtyAtom)).toBe(true)
  })

  it("returns to clean after saving the current snapshot", () => {
    const store = createStore()
    const workflow = {
      version: 1,
      name: "Saved draft",
      description: "",
      defaults: {
        model: "sonnet",
        maxTurns: 120,
        timeout_minutes: 30,
        maxParallel: 8,
      },
      nodes: [],
      edges: [],
    }
    store.set(currentWorkflowAtom, workflow)

    expect(store.get(workflowDirtyAtom)).toBe(true)

    store.set(workflowSavedSnapshotAtom, workflowSnapshot(workflow))
    expect(store.get(workflowDirtyAtom)).toBe(false)
  })

  it("returns to clean when undo restores the saved workflow snapshot", () => {
    const store = createStore()
    const savedWorkflow = {
      version: 1,
      name: "Saved workflow",
      description: "",
      defaults: {
        model: "sonnet",
        maxTurns: 120,
        timeout_minutes: 30,
        maxParallel: 8,
      },
      nodes: [],
      edges: [],
    }
    store.set(selectedWorkflowPathAtom, "/tmp/saved.chain")
    store.set(currentWorkflowAtom, savedWorkflow)
    store.set(workflowSavedSnapshotAtom, workflowSnapshot(savedWorkflow))

    store.set(currentWorkflowAtom, {
      ...savedWorkflow,
      description: "Edited",
    })
    expect(store.get(workflowDirtyAtom)).toBe(true)

    store.set(currentWorkflowAtom, savedWorkflow)
    expect(store.get(workflowDirtyAtom)).toBe(false)
  })
})

describe("skill picker session atoms", () => {
  it("opens with a request payload", () => {
    const store = createStore()
    store.set(openSkillPickerAtom, {
      title: "Choose skill",
      attachTargetLabel: "this step",
    })

    expect(store.get(skillPickerOpenAtom)).toBe(true)
    expect(store.get(skillPickerRequestAtom)).toMatchObject({
      title: "Choose skill",
      attachTargetLabel: "this step",
    })
  })

  it("clears stale request state on close and generic reopen", () => {
    const store = createStore()
    store.set(openSkillPickerAtom, {
      title: "Attach skill",
      attachTargetLabel: "this flow",
    })
    store.set(closeSkillPickerAtom)

    expect(store.get(skillPickerOpenAtom)).toBe(false)
    expect(store.get(skillPickerRequestAtom)).toBeNull()

    store.set(openSkillPickerAtom)
    expect(store.get(skillPickerOpenAtom)).toBe(true)
    expect(store.get(skillPickerRequestAtom)).toBeNull()
  })
})
