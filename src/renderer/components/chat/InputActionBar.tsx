import { Plus } from "lucide-react"
import { ProjectPickerPill } from "./ProjectPickerPill"
import { FileAttachmentPill } from "./FileAttachmentPill"

interface InputActionBarProps {
  projectName: string | null
  projects: Array<{ path: string; name: string }>
  attachedFiles: Array<{ id: string; name: string; path: string }>
  onSelectProject: (path: string | null) => void
  onAttachFiles: () => void
  onRemoveFile: (id: string) => void
}

const MAX_VISIBLE_FILES = 2

export function InputActionBar({
  projectName,
  projects,
  attachedFiles,
  onSelectProject,
  onAttachFiles,
  onRemoveFile,
}: InputActionBarProps) {
  const visibleFiles = attachedFiles.slice(0, MAX_VISIBLE_FILES)
  const overflowCount = attachedFiles.length - MAX_VISIBLE_FILES

  return (
    <div className="flex items-center gap-1.5 px-1 flex-wrap">
      <button
        type="button"
        onClick={onAttachFiles}
        aria-label="Attach files"
        className="ui-icon-button h-control-sm w-control-sm rounded-md"
      >
        <Plus size={15} aria-hidden="true" />
      </button>

      <ProjectPickerPill
        projectName={projectName}
        projects={projects}
        onSelect={onSelectProject}
      />

      {visibleFiles.map((f) => (
        <FileAttachmentPill
          key={f.id}
          name={f.name}
          onRemove={() => onRemoveFile(f.id)}
        />
      ))}

      {overflowCount > 0 && (
        <span className="bg-surface-2/60 rounded-md px-2 h-control-sm text-body-sm text-muted-foreground inline-flex items-center">
          +{overflowCount} files
        </span>
      )}
    </div>
  )
}
