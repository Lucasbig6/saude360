"use client"

import { Code2, LayoutGrid, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type ExplorationTab = "ai" | "sql" | "visual"

const TABS: Array<{ id: ExplorationTab; label: string; icon: typeof Sparkles }> = [
  { id: "ai", label: "Agente IA", icon: Sparkles },
  { id: "sql", label: "SQL", icon: Code2 },
  { id: "visual", label: "Visual", icon: LayoutGrid },
]

/**
 * Modos de uma mesma ferramenta (não páginas): Agente IA e SQL investigam,
 * Visual configura a apresentação do resultado compartilhado.
 */
export function ExplorationTabs({
  active,
  onChange,
  visualDisabled,
}: {
  active: ExplorationTab
  onChange: (tab: ExplorationTab) => void
  visualDisabled: boolean
}) {
  return (
    <div
      role="tablist"
      aria-label="Modo de exploração"
      className="inline-flex rounded-lg border border-border bg-muted p-0.5"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const disabled = tab.id === "visual" && visualDisabled
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            disabled={disabled}
            title={
              disabled ? "Investigue os dados para configurar o visual" : undefined
            }
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active === tab.id
                ? "bg-card text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground"
            )}
          >
            <Icon size={13} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
