"use client"

import type React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FieldDropSlotProps {
  value: string | null
  label: string
  dragOver: boolean
  error: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onRemove: () => void
}

export function FieldDropSlot({
  value,
  label,
  dragOver,
  error,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemove,
}: FieldDropSlotProps) {
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-primary/25 bg-card px-3 text-sm text-foreground">
        <span className="truncate font-medium">{value}</span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Remover ${value}`}
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex h-10 items-center justify-center rounded-lg border-2 border-dashed px-3 text-sm transition-colors",
        error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : dragOver
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-muted/50/50 text-muted-foreground hover:border-border"
      )}
    >
      {error ? "Tipo incompatível" : label}
    </div>
  )
}
