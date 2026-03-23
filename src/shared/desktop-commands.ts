export type DesktopCommandId =
  | "file.save"
  | "file.save_as"
  | "file.export"
  | "file.import"
  | "edit.undo"
  | "edit.redo"
  | "view.defaults"
  | "view.edit_flow"
  | "view.toggle_agent_panel"
  | "flow.run"
  | "flow.run_again"
  | "flow.rerun_from_step"
  | "flow.cancel"
  | "flow.batch_run"
  | "flow.history"

export interface DesktopMenuCommandState {
  enabled: boolean
  visible?: boolean
  checked?: boolean
}

export interface DesktopMenuState {
  file: {
    save: DesktopMenuCommandState
    saveAs: DesktopMenuCommandState
    export: DesktopMenuCommandState
    import: DesktopMenuCommandState
  }
  edit: {
    undo: DesktopMenuCommandState
    redo: DesktopMenuCommandState
  }
  view: {
    defaults: DesktopMenuCommandState
    editFlow: DesktopMenuCommandState
    toggleAgentPanel: DesktopMenuCommandState
  }
  flow: {
    run: DesktopMenuCommandState
    runAgain: DesktopMenuCommandState
    rerunFromStep: DesktopMenuCommandState
    cancel: DesktopMenuCommandState
    batchRun: DesktopMenuCommandState
    history: DesktopMenuCommandState
  }
}

function commandState(
  enabled = false,
  overrides: Partial<DesktopMenuCommandState> = {},
): DesktopMenuCommandState {
  return {
    enabled,
    ...overrides,
  }
}

export function createDefaultDesktopMenuState(): DesktopMenuState {
  return {
    file: {
      save: commandState(false),
      saveAs: commandState(false),
      export: commandState(false),
      import: commandState(false),
    },
    edit: {
      undo: commandState(false),
      redo: commandState(false),
    },
    view: {
      defaults: commandState(false),
      editFlow: commandState(false),
      toggleAgentPanel: commandState(false),
    },
    flow: {
      run: commandState(false, { visible: false }),
      runAgain: commandState(false),
      rerunFromStep: commandState(false),
      cancel: commandState(false, { visible: false }),
      batchRun: commandState(false),
      history: commandState(false),
    },
  }
}
