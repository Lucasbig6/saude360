"use client"

import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface QueryTab {
  id: string
  label: string
}

interface QueryTabsProps {
  queries: QueryTab[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
}

export function QueryTabs({
  queries,
  activeId,
  onSelect,
  onAdd,
  onClose,
}: QueryTabsProps) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-muted/50 px-2">
      {queries.map((q) => (
        <div
          key={q.id}
          className={cn(
            "group flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors cursor-pointer",
            q.id === activeId
              ? "border-primary bg-card text-primary font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          onClick={() => onSelect(q.id)}
        >
          <span className="max-w-[120px] truncate">{q.label}</span>
          {queries.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose(q.id)
              }}
              className="ml-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 cursor-pointer"
              aria-label={`Fechar ${q.label}`}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="ml-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        aria-label="Nova consulta"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
