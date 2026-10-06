"use client"

import { Plus, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DashboardFilter } from "@/lib/types/dashboard"

interface DashboardFiltersBarProps {
  filters: DashboardFilter[]
  editing: boolean
  filterValues: Record<string, string | string[]>
  loadingDistinct: boolean
  distinctValues: Record<string, string[]>
  onAdd: () => void
  onRemove: (filterId: string) => void
  onValueChange: (filterId: string, value: string | string[]) => void
}

function FilterInlineControl({
  filter,
  value,
  distinctValues,
  loadingDistinct,
  onValueChange,
}: {
  filter: DashboardFilter
  value: string | string[]
  distinctValues: string[]
  loadingDistinct: boolean
  onValueChange: (value: string | string[]) => void
}) {
  if (loadingDistinct) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
      </div>
    )
  }

  if (filter.operator === "in") {
    const selected = Array.isArray(value) ? value : []
    return (
      <select
        multiple
        value={selected}
        onChange={(e) => {
          const opts = Array.from(e.target.selectedOptions, (o) => o.value)
          onValueChange(opts)
        }}
        className="h-7 max-w-[180px] rounded-md border border-border bg-card px-1.5 text-xs"
        size={1}
      >
        {distinctValues.length > 0
          ? distinctValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))
          : selected.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
      </select>
    )
  }

  if (filter.operator === "between") {
    const arr = Array.isArray(value) ? value : ["", ""]
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={arr[0] ?? ""}
          onChange={(e) => onValueChange([e.target.value, arr[1] ?? ""])}
          className="h-7 w-[130px] text-xs"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={arr[1] ?? ""}
          onChange={(e) => onValueChange([arr[0] ?? "", e.target.value])}
          className="h-7 w-[130px] text-xs"
        />
      </div>
    )
  }

  if (filter.operator === "gte" || filter.operator === "lte") {
    return (
      <Input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-7 w-[150px] text-xs"
      />
    )
  }

  // eq
  const currentVal = typeof value === "string" ? value : ""
  if (distinctValues.length > 0) {
    return (
      <select
        value={currentVal}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-7 max-w-[180px] rounded-md border border-border bg-card px-1.5 text-xs"
      >
        <option value="">Todos</option>
        {distinctValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    )
  }

  return (
    <Input
      placeholder="Valor"
      value={currentVal}
      onChange={(e) => onValueChange(e.target.value)}
      className="h-7 w-[140px] text-xs"
    />
  )
}

export function DashboardFiltersBar({
  filters,
  editing,
  filterValues,
  loadingDistinct,
  distinctValues,
  onAdd,
  onRemove,
  onValueChange,
}: DashboardFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <div
          key={filter.id}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs"
        >
          <span className="font-medium text-foreground">{filter.column}</span>
          <FilterInlineControl
            filter={filter}
            value={filterValues[filter.id] ?? filter.defaultValue ?? ""}
            distinctValues={distinctValues[filter.id] ?? []}
            loadingDistinct={loadingDistinct}
            onValueChange={(val) => onValueChange(filter.id, val)}
          />
          {editing && (
            <button
              type="button"
              onClick={() => onRemove(filter.id)}
              className="ml-0.5 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer"
            >
              <X size={11} />
            </button>
          )}
        </div>
      ))}

      {editing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="h-7 rounded-md text-xs"
        >
          <Plus size={12} />
          Adicionar filtro
        </Button>
      )}
    </div>
  )
}
