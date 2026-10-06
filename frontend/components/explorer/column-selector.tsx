"use client"

import { Check, ChevronDown } from "lucide-react"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface ColumnSelectorOption {
  value: string
  label: string
}

interface ColumnSelectorProps {
  label: string
  options: ColumnSelectorOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
}

export function ColumnSelector({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
}: ColumnSelectorProps) {
  const selectedOption = options.find((option) => option.value === value)

  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <DropdownMenu disabled={disabled}>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={label}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm transition-colors hover:border-border focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            disabled && "bg-muted/50"
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown
            size={16}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-48">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className="cursor-pointer justify-between"
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && (
                <Check size={15} className="shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
