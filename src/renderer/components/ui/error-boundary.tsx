import { Component, type ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "./button"

interface ErrorBoundaryProps {
  children: ReactNode
  sectionName?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class SectionErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[SectionErrorBoundary] ${this.props.sectionName || "section"} crashed:`,
      error,
      errorInfo,
    )
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="surface-danger-soft flex h-full min-h-[140px] flex-col items-center justify-center gap-3 rounded-lg p-4 text-center">
          <AlertCircle className="h-8 w-8 text-status-danger" />
          <p className="text-body-md font-medium text-foreground">
            Failed to render {this.props.sectionName || "section"}
          </p>
          <p className="max-w-[380px] ui-meta-text text-status-danger/90">
            {this.state.error?.message || "An unexpected UI error occurred."}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
