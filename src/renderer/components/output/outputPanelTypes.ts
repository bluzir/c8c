export type OutputTabValue = "nodes" | "log" | "result" | "history"

export interface OutputTabRequest {
  tab: OutputTabValue
  nodeId?: string
  nonce: number
}
