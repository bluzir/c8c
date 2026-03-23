import * as React from "react"

import { Textarea } from "@/components/ui/textarea"

function resizeTextarea(element: HTMLTextAreaElement, maxHeight: number) {
  element.style.height = "auto"
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
}

export interface AutosizeTextareaProps extends React.ComponentProps<
  typeof Textarea
> {
  maxHeight?: number
}

export const AutosizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutosizeTextareaProps
>(({ maxHeight = 240, onChange, value, style, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useImperativeHandle(
    forwardedRef,
    () => innerRef.current as HTMLTextAreaElement,
    [],
  )

  React.useEffect(() => {
    if (!innerRef.current) return
    resizeTextarea(innerRef.current, maxHeight)
  }, [maxHeight, value])

  return (
    <Textarea
      {...props}
      ref={innerRef}
      value={value}
      style={style}
      onChange={(event) => {
        resizeTextarea(event.currentTarget, maxHeight)
        onChange?.(event)
      }}
    />
  )
})

AutosizeTextarea.displayName = "AutosizeTextarea"
