export type OutputTabValue = "nodes" | "result" | "log" | "history"
// Active tabs: "nodes" (Progress) and "result" (on completion)
// "log" and "history" kept for type compat but tabs removed from UI

export interface OutputTabRequest {
  tab: OutputTabValue
  nodeId?: string
  nonce: number
}
