import * as React from "react"
import { cn } from "@/lib/cn"
import {
  AutosizeTextarea,
  type AutosizeTextareaProps,
} from "@/components/ui/autosize-textarea"

export interface PromptComposerProps extends Omit<
  AutosizeTextareaProps,
  "className"
> {
  shellClassName?: string
  headerClassName?: string
  bodyClassName?: string
  textareaClassName?: string
  footerClassName?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  action?: React.ReactNode
}

export const PromptComposer = React.forwardRef<
  HTMLTextAreaElement,
  PromptComposerProps
>(
  (
    {
      shellClassName,
      headerClassName,
      bodyClassName,
      textareaClassName,
      footerClassName,
      header,
      footer,
      action,
      maxHeight = 240,
      ...props
    },
    forwardedRef,
  ) => {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-2xl surface-panel ui-transition-surface focus-within:border-ring/50 focus-within:ring-[3px] focus-within:ring-ring/10",
          shellClassName,
        )}
      >
        {header ? (
          <div className={cn("px-5 pt-4", headerClassName)}>{header}</div>
        ) : null}
        <div className={cn("relative", bodyClassName)}>
          <AutosizeTextarea
            {...props}
            ref={forwardedRef}
            maxHeight={maxHeight}
            className={cn(
              "w-full min-h-28 resize-none border-0 bg-transparent px-5 pb-5 pt-4 pr-20 shadow-none hover:border-transparent hover:bg-transparent",
              header && "pt-3",
              "text-body-md leading-7 text-foreground placeholder:text-muted-foreground/74",
              "focus-visible:border-transparent focus-visible:ring-transparent",
              "disabled:bg-surface-2/80 disabled:text-disabled disabled:cursor-not-allowed",
              textareaClassName,
            )}
          />
          {action ? (
            <div className="absolute bottom-3 right-3">{action}</div>
          ) : null}
        </div>
        {footer ? (
          <div
            className={cn(
              "border-t border-hairline px-5 py-3.5",
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    )
  },
)

PromptComposer.displayName = "PromptComposer"
