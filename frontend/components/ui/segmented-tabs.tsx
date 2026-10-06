"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Tabs segmentadas: controle único no trilho neutro (muted),
 * aba ativa em surface branca com borda de baixo contraste.
 */
export interface SegmentedTabItem<T extends string> {
  id: T
  label: string
  icon?: LucideIcon
}

interface SegmentedTabsProps<T extends string> {
  items: SegmentedTabItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: SegmentedTabsProps<T>) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((tab) => {
        const Icon = tab.icon
        const isActive = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-card text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon size={16} />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
