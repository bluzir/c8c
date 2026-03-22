import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/cn"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "control-cluster relative isolate inline-flex min-h-control-md items-center justify-center gap-1 rounded-xl p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ui-focus-managed relative inline-flex min-h-[calc(var(--control-md)-0.5rem)] items-center justify-center whitespace-nowrap rounded-[0.9rem] border border-transparent px-3 py-1 text-body-sm font-medium transition-[background-color,color,box-shadow,border-color] ui-motion-fast hover:bg-surface-2/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/8 disabled:text-disabled disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor] data-[state=active]:border-hairline/65 data-[state=active]:bg-surface-1 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_1px_0_var(--inset-highlight),0_1px_2px_hsl(var(--foreground)/0.06)]",
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
