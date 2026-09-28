"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Tabs segmentadas no mesmo padrão visual do `ExplorationTabs`
 * (`components/explorer/exploration-tabs.tsx`): controle único no trilho
 * `bg-slate-100`, aba ativa em branco com shadow.
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
      className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
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
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
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
