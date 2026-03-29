import { useState } from "react"
import { useAtomValue } from "jotai"
import type { WorkflowFile } from "@shared/types"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { FlowRenameDialog } from "@/components/FlowRenameDialog"
import { CursorMenu } from "@/components/ui/cursor-menu"
import { workflowExecutionStatesAtom } from "@/features/execution/state"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import { SidebarConfirmDialog } from "./SidebarConfirmDialog"
import { projectFolderName } from "./projectSidebarUtils"

export type SidebarContextMenuState =
  | {
      x: number
      y: number
      scope: "workflow"
      workflow: WorkflowFile
      projectPath: string
    }
  | {
      x: number
      y: number
      scope: "global_workflow"
      workflow: WorkflowFile
    }
  | {
      x: number
      y: number
      scope: "project"
      projectPath: string
    }
  | {
      x: number
      y: number
      scope: "chat"
      chatId: string
      chatName: string
      projectPath: string
    }

interface SidebarWorkflowDialogsProps {
  sidebarContextMenu: SidebarContextMenuState | null
  setSidebarContextMenu: (value: SidebarContextMenuState | null) => void
  selectWorkflow: (
    workflow: WorkflowFile,
    projectPath?: string,
  ) => Promise<void>
  selectGlobalWorkflow: (workflow: WorkflowFile) => Promise<void>
  requestRenameWorkflow: (workflow: WorkflowFile) => void
  duplicateWorkflow: (
    workflow: WorkflowFile,
    projectPath?: string,
  ) => Promise<void>
  requestDeleteWorkflow: (workflow: WorkflowFile) => void
  pendingRenameWorkflow: WorkflowFile | null
  setPendingRenameWorkflow: (workflow: WorkflowFile | null) => void
  renameInput: string
  setRenameInput: (value: string) => void
  commitRenameWorkflow: () => Promise<void>
  pendingDeleteWorkflow: WorkflowFile | null
  setPendingDeleteWorkflow: (workflow: WorkflowFile | null) => void
  selectedWorkflowPath: string | null
  workflowDirty: boolean
  commitDeleteWorkflow: () => Promise<void>
  selectedProject: string | null
  copyWorkflowToProject: (
    workflow: WorkflowFile,
    projectPath: string,
  ) => Promise<void>
  pendingRemoveProject: string | null
  setPendingRemoveProject: (projectPath: string | null) => void
  pendingRemoveProjectFlowCount: number
  removingSelectedDirtyProject: boolean
  commitRemoveProject: () => Promise<void>
  openProjectFlow: (projectPath: string) => void
  onArchiveChat: (projectPath: string, chatId: string) => void
  onDeleteChat: (projectPath: string, chatId: string) => void
  onRenameChat: (
    projectPath: string,
    chatId: string,
    newName: string,
  ) => void
}

export function SidebarWorkflowDialogs({
  sidebarContextMenu,
  setSidebarContextMenu,
  selectWorkflow,
  selectGlobalWorkflow,
  requestRenameWorkflow,
  duplicateWorkflow,
  requestDeleteWorkflow,
  pendingRenameWorkflow,
  setPendingRenameWorkflow,
  renameInput,
  setRenameInput,
  commitRenameWorkflow,
  pendingDeleteWorkflow,
  setPendingDeleteWorkflow,
  selectedWorkflowPath,
  workflowDirty,
  commitDeleteWorkflow,
  selectedProject,
  copyWorkflowToProject,
  pendingRemoveProject,
  setPendingRemoveProject,
  pendingRemoveProjectFlowCount,
  removingSelectedDirtyProject,
  commitRemoveProject,
  openProjectFlow,
  onArchiveChat,
  onDeleteChat,
  onRenameChat,
}: SidebarWorkflowDialogsProps) {
  const executionStates = useAtomValue(workflowExecutionStatesAtom)
  const [pendingRenameChat, setPendingRenameChat] = useState<{
    chatId: string
    projectPath: string
  } | null>(null)
  const [chatRenameInput, setChatRenameInput] = useState("")
  const [pendingDeleteChat, setPendingDeleteChat] = useState<{
    chatId: string
    chatName: string
    projectPath: string
  } | null>(null)
  const contextWorkflowPath =
    sidebarContextMenu?.scope === "workflow" ||
    sidebarContextMenu?.scope === "global_workflow"
      ? sidebarContextMenu.workflow.path
      : null
  const contextRunFolder = contextWorkflowPath
    ? (executionStates[toWorkflowExecutionKey(contextWorkflowPath)]
        ?.workspace ?? null)
    : null

  return (
    <>
      <CursorMenu
        open={sidebarContextMenu !== null}
        x={sidebarContextMenu?.x || 0}
        y={sidebarContextMenu?.y || 0}
        onOpenChange={(open) => {
          if (!open) setSidebarContextMenu(null)
        }}
      >
        {sidebarContextMenu?.scope === "workflow" && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                void selectWorkflow(
                  sidebarContextMenu.workflow,
                  sidebarContextMenu.projectPath,
                )
                setSidebarContextMenu(null)
              }}
            >
              Open flow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestRenameWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Rename flow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                const workflow = sidebarContextMenu.workflow
                const projectPath = sidebarContextMenu.projectPath
                setSidebarContextMenu(null)
                void duplicateWorkflow(workflow, projectPath)
              }}
            >
              Duplicate flow
            </DropdownMenuItem>
            {contextRunFolder && (
              <DropdownMenuItem
                onSelect={() => {
                  void window.api.showInFinder(contextRunFolder)
                  setSidebarContextMenu(null)
                }}
              >
                Show output files
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-status-danger focus:text-status-danger"
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestDeleteWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Delete flow
            </DropdownMenuItem>
          </>
        )}
        {sidebarContextMenu?.scope === "global_workflow" && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                void selectGlobalWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Open flow
            </DropdownMenuItem>
            {selectedProject ? (
              <DropdownMenuItem
                onSelect={() => {
                  if (!sidebarContextMenu || !selectedProject) return
                  setSidebarContextMenu(null)
                  void copyWorkflowToProject(
                    sidebarContextMenu.workflow,
                    selectedProject,
                  )
                }}
              >
                Copy to {projectFolderName(selectedProject)}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestRenameWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Rename flow
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (!sidebarContextMenu) return
                const workflow = sidebarContextMenu.workflow
                setSidebarContextMenu(null)
                void duplicateWorkflow(workflow)
              }}
            >
              Duplicate flow
            </DropdownMenuItem>
            {contextRunFolder && (
              <DropdownMenuItem
                onSelect={() => {
                  void window.api.showInFinder(contextRunFolder)
                  setSidebarContextMenu(null)
                }}
              >
                Show output files
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-status-danger focus:text-status-danger"
              onSelect={() => {
                if (!sidebarContextMenu) return
                requestDeleteWorkflow(sidebarContextMenu.workflow)
                setSidebarContextMenu(null)
              }}
            >
              Delete flow
            </DropdownMenuItem>
          </>
        )}
        {sidebarContextMenu?.scope === "project" &&
          sidebarContextMenu.projectPath && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  if (!sidebarContextMenu.projectPath) return
                  openProjectFlow(sidebarContextMenu.projectPath)
                  setSidebarContextMenu(null)
                }}
              >
                New flow
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-status-danger focus:text-status-danger"
                onSelect={() => {
                  if (!sidebarContextMenu.projectPath) return
                  setPendingRemoveProject(sidebarContextMenu.projectPath)
                  setSidebarContextMenu(null)
                }}
              >
                Remove project
              </DropdownMenuItem>
            </>
          )}
        {sidebarContextMenu?.scope === "chat" && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                if (sidebarContextMenu.scope !== "chat") return
                setChatRenameInput(sidebarContextMenu.chatName)
                setPendingRenameChat({
                  chatId: sidebarContextMenu.chatId,
                  projectPath: sidebarContextMenu.projectPath,
                })
                setSidebarContextMenu(null)
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (sidebarContextMenu.scope !== "chat") return
                onArchiveChat(
                  sidebarContextMenu.projectPath,
                  sidebarContextMenu.chatId,
                )
                setSidebarContextMenu(null)
              }}
            >
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-status-danger focus:text-status-danger"
              onSelect={() => {
                if (sidebarContextMenu.scope !== "chat") return
                setPendingDeleteChat({
                  chatId: sidebarContextMenu.chatId,
                  chatName: sidebarContextMenu.chatName,
                  projectPath: sidebarContextMenu.projectPath,
                })
                setSidebarContextMenu(null)
              }}
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      </CursorMenu>

      <FlowRenameDialog
        open={pendingRenameWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRenameWorkflow(null)
        }}
        value={renameInput}
        onValueChange={setRenameInput}
        onCommit={() => void commitRenameWorkflow()}
      />

      <SidebarConfirmDialog
        open={pendingDeleteWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteWorkflow(null)
        }}
        title="Delete flow"
        description={
          `Delete "${pendingDeleteWorkflow?.name || "flow"}"?` +
          (pendingDeleteWorkflow?.path === selectedWorkflowPath && workflowDirty
            ? " You have unsaved changes that will be lost."
            : "") +
          " The flow file will be permanently removed."
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        note="This cannot be undone."
        onConfirm={() => void commitDeleteWorkflow()}
      />

      <SidebarConfirmDialog
        open={pendingRemoveProject !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveProject(null)
        }}
        title="Remove project"
        description={(() => {
          const name = pendingRemoveProject
            ? projectFolderName(pendingRemoveProject)
            : "project"
          const flowNote =
            pendingRemoveProjectFlowCount > 0
              ? ` (${pendingRemoveProjectFlowCount} flow${pendingRemoveProjectFlowCount === 1 ? "" : "s"})`
              : ""
          return removingSelectedDirtyProject
            ? `Remove "${name}"${flowNote} from Projects? This will discard unsaved flow changes. Files on disk will not be deleted.`
            : `Remove "${name}"${flowNote} from Projects? This will not delete files on disk.`
        })()}
        confirmLabel="Remove"
        onConfirm={() => void commitRemoveProject()}
      />

      <FlowRenameDialog
        open={pendingRenameChat !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRenameChat(null)
        }}
        value={chatRenameInput}
        onValueChange={setChatRenameInput}
        onCommit={() => {
          if (!pendingRenameChat || !chatRenameInput.trim()) return
          onRenameChat(
            pendingRenameChat.projectPath,
            pendingRenameChat.chatId,
            chatRenameInput.trim(),
          )
          setPendingRenameChat(null)
        }}
      />

      <SidebarConfirmDialog
        open={pendingDeleteChat !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteChat(null)
        }}
        title="Delete thread"
        description={`Delete "${pendingDeleteChat?.chatName || "thread"}"? All runs and history will be permanently removed.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        note="This cannot be undone."
        onConfirm={() => {
          if (!pendingDeleteChat) return
          onDeleteChat(pendingDeleteChat.projectPath, pendingDeleteChat.chatId)
          setPendingDeleteChat(null)
        }}
      />
    </>
  )
}
