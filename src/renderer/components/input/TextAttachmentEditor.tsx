import { useState, useEffect } from "react"
import { useAtom } from "jotai"
import { inputAttachmentsAtom } from "@/lib/store"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

interface TextAttachmentEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When editing an existing text attachment, pass its index. */
  editIndex?: number
}

export function TextAttachmentEditor({
  open,
  onOpenChange,
  editIndex,
}: TextAttachmentEditorProps) {
  const [attachments, setAttachments] = useAtom(inputAttachmentsAtom)
  const [label, setLabel] = useState("")
  const [content, setContent] = useState("")

  const editing = editIndex != null ? attachments[editIndex] : null
  const isEdit = editing != null && editing.kind === "text"

  useEffect(() => {
    if (open && isEdit && editing.kind === "text") {
      setLabel(editing.label)
      setContent(editing.content)
    } else if (open) {
      setLabel("")
      setContent("")
    }
  }, [open, isEdit, editing])

  const handleSave = () => {
    const trimmedLabel = label.trim() || "Text snippet"
    const entry = { kind: "text" as const, label: trimmedLabel, content }

    if (isEdit && editIndex != null) {
      setAttachments((prev) =>
        prev.map((a, i) => (i === editIndex ? entry : a)),
      )
    } else {
      setAttachments((prev) => [...prev, entry])
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent className="p-0 gap-0 flex flex-col" showCloseButton>
        <CanvasDialogHeader className="border-b border-hairline">
          <DialogTitle>
            {isEdit ? "Edit Text Snippet" : "Add Text Snippet"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Enter a label and content for the text snippet
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <label htmlFor="text-att-label" className="ui-meta-label">
              Label
            </label>
            <Input
              id="text-att-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Design notes"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="text-att-content" className="ui-meta-label">
              Content
            </label>
            <Textarea
              id="text-att-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste or type your text here..."
              rows={6}
              className="resize-y min-h-[6rem] max-h-[20rem]"
            />
          </div>
        </CanvasDialogBody>

        <CanvasDialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!content.trim()}>
            {isEdit ? "Update" : "Add"}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
