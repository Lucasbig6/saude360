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
      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-teal-200 bg-white px-3 text-sm text-slate-900 shadow-sm">
        <span className="truncate font-medium">{value}</span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
          ? "border-red-300 bg-red-50 text-red-500"
          : dragOver
            ? "border-teal-500 bg-teal-50 text-teal-700"
            : "border-slate-200 bg-slate-50/50 text-slate-500 hover:border-slate-300"
      )}
    >
      {error ? "Tipo incompatível" : label}
    </div>
  )
}
