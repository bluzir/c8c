import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/cn"

const Tabs = TabsPrimitive.Root

type TabsListVariant = "boxed" | "plain"
type TabsTriggerVariant = "boxed" | "plain"

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: TabsListVariant
  }
>(({ className, variant = "boxed", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      variant === "boxed"
        ? "control-cluster relative isolate inline-flex min-h-control-md items-center justify-center gap-1 rounded-xl p-1 text-muted-foreground"
        : "relative isolate inline-flex items-center justify-center gap-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: TabsTriggerVariant
  }
>(({ className, variant = "boxed", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      variant === "boxed"
        ? "ui-focus-managed relative inline-flex min-h-[calc(var(--control-md)-0.5rem)] items-center justify-center whitespace-nowrap rounded-[0.9rem] border border-transparent px-3 py-1 text-body-sm font-medium transition-[background-color,color,border-color] ui-motion-fast hover:bg-surface-2/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/8 disabled:text-disabled disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor] data-[state=active]:border-hairline data-[state=active]:bg-surface-1 data-[state=active]:text-foreground"
        : "ui-focus-managed relative inline-flex min-h-0 items-center justify-center whitespace-nowrap rounded-full border border-transparent bg-transparent px-3 py-1 text-body-sm font-medium transition-[background-color,color,border-color] ui-motion-fast hover:bg-surface-2/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/8 disabled:text-disabled disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor] data-[state=active]:border-hairline data-[state=active]:bg-surface-1 data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ui-focus-managed mt-2 data-[state=inactive]:hidden focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14",
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
