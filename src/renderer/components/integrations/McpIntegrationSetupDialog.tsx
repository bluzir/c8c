import { Loader2 } from "lucide-react"
import type { McpIntegrationStatus } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface McpIntegrationSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrationStatus: McpIntegrationStatus | null
  values: Record<string, string>
  onValueChange: (fieldId: string, value: string) => void
  saving: boolean
  onConfirm: () => void | Promise<void>
}

export function McpIntegrationSetupDialog({
  open,
  onOpenChange,
  integrationStatus,
  values,
  onValueChange,
  saving,
  onConfirm,
}: McpIntegrationSetupDialogProps) {
  const integration = integrationStatus?.integration ?? null
  const requiredFields = integration?.fields ?? []
  const canSubmit =
    integration !== null &&
    requiredFields.every((field) => (values[field.id] ?? "").trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {integration?.setupTitle ?? "Set up integration"}
          </DialogTitle>
          <DialogDescription>
            {integration?.setupDescription ??
              integration?.description ??
              "Add the required credentials so this flow can use the integration before it runs."}
          </DialogDescription>
        </DialogHeader>

        {integration ? (
          <div className="space-y-4">
            {requiredFields.map((field) => (
              <div key={field.id} className="space-y-1">
                <Label htmlFor={`integration-field-${field.id}`}>
                  {field.label}
                </Label>
                <Input
                  id={`integration-field-${field.id}`}
                  type={field.kind === "secret" ? "password" : "text"}
                  value={values[field.id] ?? ""}
                  onChange={(event) =>
                    onValueChange(field.id, event.target.value)
                  }
                  placeholder={field.placeholder}
                  autoComplete="off"
                  disabled={saving}
                />
                {field.description ? (
                  <p className="ui-meta-text text-muted-foreground">
                    {field.description}
                  </p>
                ) : null}
              </div>
            ))}

            <div className="rounded-md border border-hairline/70 px-3 py-2">
              <p className="ui-meta-text text-muted-foreground">
                Stored in the local integrations keyring.
              </p>
              <p className="mt-1 text-body-sm text-foreground break-all">
                {integrationStatus?.keyringPath}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={saving || !canSubmit}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
