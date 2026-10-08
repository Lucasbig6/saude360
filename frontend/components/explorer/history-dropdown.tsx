"use client"

import { ChevronDown, History } from "lucide-react"
import type { HistoryEntry, HistoryGroup } from "@/lib/explorer/workspace"

/**
 * Investigações anteriores — acesso discreto (agrupado por dia), sem
 * transformar a tela em histórico de chat.
 */
export function HistoryDropdown({
  groups,
  currentId,
  onSelect,
}: {
  groups: HistoryGroup[]
  currentId: string | null
  onSelect: (entry: HistoryEntry) => void
}) {
  if (groups.length === 0) return null
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <History size={13} />
        Investigações anteriores
        <ChevronDown
          size={13}
          className="ml-auto transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="max-h-64 overflow-y-auto border-t border-border px-2 py-2">
        {groups.map((group) => (
          <div key={group.label} className="mt-1 first:mt-0">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul>
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(entry)}
                    aria-current={entry.id === currentId || undefined}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {entry.question}
                    </span>
                    {entry.status === "streaming" && (
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
