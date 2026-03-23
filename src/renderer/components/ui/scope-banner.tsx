import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

const scopeBannerVariants = cva("rounded-xl border px-4 py-3", {
  variants: {
    tone: {
      accent: "border-primary/20 bg-primary/6",
      muted: "border-hairline ui-inset-well",
    },
  },
  defaultVariants: {
    tone: "accent",
  },
})

export interface ScopeBannerProps extends VariantProps<
  typeof scopeBannerVariants
> {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function ScopeBanner({
  eyebrow,
  title,
  description,
  actions,
  children,
  tone,
  className,
}: ScopeBannerProps) {
  return (
    <section className={cn(scopeBannerVariants({ tone }), className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="ui-meta-label text-primary/80">{eyebrow}</div>
          ) : null}
          {title ? (
            <div className="mt-1 text-body-md font-medium text-foreground">
              {title}
            </div>
          ) : null}
          {description ? (
            <p
              className={cn(
                "text-body-sm text-foreground",
                title || eyebrow ? "mt-1" : "",
              )}
            >
              {description}
            </p>
          ) : null}
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  )
}
