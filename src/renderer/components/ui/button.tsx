import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  "ui-pressable ui-focus-managed inline-flex appearance-none items-center justify-center whitespace-nowrap rounded-md text-body-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] ui-motion-fast focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14 disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary/90 bg-primary !text-primary-foreground [-webkit-text-fill-color:hsl(var(--primary-foreground))] shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.2),0_0_0_1px_hsl(var(--hairline)/0.24)] hover:bg-primary/90 hover:border-primary active:bg-primary/82 active:border-primary/85 active:!text-primary-foreground active:[-webkit-text-fill-color:hsl(var(--primary-foreground))] disabled:bg-primary/70 disabled:border-primary/70 disabled:!text-primary-foreground disabled:[-webkit-text-fill-color:hsl(var(--primary-foreground))] disabled:shadow-none",
        destructive:
          "border border-destructive/80 bg-destructive !text-destructive-foreground [-webkit-text-fill-color:hsl(var(--destructive-foreground))] shadow-[inset_0_1px_0_hsl(var(--destructive-foreground)/0.18),0_0_0_1px_hsl(var(--hairline)/0.24)] hover:bg-destructive/90 active:bg-destructive/82 active:border-destructive/85 active:!text-destructive-foreground active:[-webkit-text-fill-color:hsl(var(--destructive-foreground))] disabled:bg-destructive/70 disabled:border-destructive/70 disabled:!text-destructive-foreground disabled:[-webkit-text-fill-color:hsl(var(--destructive-foreground))] disabled:shadow-none",
        send:
          "border border-transparent bg-foreground text-background shadow-[inset_0_1px_0_hsl(var(--background)/0.08)] hover:bg-foreground/90 active:bg-foreground/85 disabled:bg-surface-3 disabled:text-muted-foreground/70 disabled:shadow-none",
        outline:
          "border border-border bg-surface-1 text-foreground shadow-[inset_0_1px_0_var(--inset-highlight-strong),0_0_0_1px_hsl(var(--hairline)/0.2)] hover:bg-surface-2 hover:border-hairline active:bg-surface-3 active:text-foreground active:border-hairline disabled:border-border/80 disabled:bg-surface-2/80 disabled:text-disabled disabled:shadow-none",
        secondary:
          "border border-border bg-surface-2 text-secondary-foreground shadow-[inset_0_1px_0_var(--inset-highlight)] hover:bg-surface-3 active:bg-surface-3/95 active:text-secondary-foreground active:border-border disabled:border-border/70 disabled:bg-surface-3/80 disabled:text-disabled disabled:shadow-none",
        ghost:
          "border border-transparent text-muted-foreground hover:bg-surface-3 hover:text-foreground hover:border-hairline/70 active:bg-surface-3/95 active:text-foreground active:border-hairline/70 active:scale-[0.985] disabled:text-disabled disabled:bg-transparent disabled:border-transparent",
        link: "text-primary underline-offset-4 hover:underline active:text-primary disabled:text-disabled disabled:no-underline",
      },
      size: {
        bare: "h-auto rounded-md p-0 text-body-sm",
        auto: "h-auto rounded-md px-3 py-2 text-body-sm",
        xs: "h-control-xs rounded-md px-2 text-body-sm",
        sm: "h-control-sm rounded-md px-3 text-body-sm",
        default: "h-control-md rounded-md px-3",
        lg: "h-control-lg rounded-md px-4",
        "icon-xs": "h-control-xs w-control-xs rounded-md",
        icon: "h-control-sm w-control-sm rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const type = !asChild ? (props.type ?? "button") : undefined
    const content = isLoading && !asChild ? (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {loadingText || children}
      </>
    ) : children

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        type={type}
        {...props}
      >
        {content}
      </Comp>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
