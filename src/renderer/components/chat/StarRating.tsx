import { useState } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/cn"

interface StarRatingProps {
  value: number // 0 = unrated, 1-5 = rated
  onChange: (rating: number) => void
  disabled?: boolean
}

export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hovered !== null ? star <= hovered : star <= value
        return (
          <button
            key={star}
            disabled={disabled}
            onMouseEnter={() => !disabled && setHovered(star)}
            onClick={() => !disabled && onChange(star === value ? 0 : star)}
            className={cn(
              "ui-motion-fast",
              filled
                ? hovered !== null
                  ? "text-status-warning/60"
                  : "text-status-warning"
                : "text-muted-foreground/30",
              disabled ? "cursor-default opacity-50" : "cursor-pointer hover:scale-110",
            )}
          >
            <Star size={14} fill={filled ? "currentColor" : "none"} />
          </button>
        )
      })}
    </div>
  )
}
