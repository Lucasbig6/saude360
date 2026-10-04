"use client"

import { Check, ChevronDown, Database, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { datasetDisplayName, type DatasetListItem } from "@/lib/api/datasets"

interface DatasetChipProps {
  datasets: DatasetListItem[]
  loading: boolean
  disabled: boolean
  selected: DatasetListItem | null
  onSelect: (dataset: DatasetListItem) => void
}

/**
 * Fonte de dados como chip do composer (`🗄 fonte ▾`): abre um menu para
 * trocar a fonte sem um card separado de "Conjunto de dados".
 */
export function DatasetChip({
  datasets,
  loading,
  disabled,
  selected,
  onSelect,
}: DatasetChipProps) {
  const label = loading
    ? "Carregando fontes..."
    : selected
      ? datasetDisplayName(selected)
      : "Escolher fonte"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Fonte de dados"
        className={cn(
          "inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
          selected
            ? "border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        )}
      >
        {loading ? (
          <Loader2 size={13} className="shrink-0 animate-spin" />
        ) : (
          <Database size={13} className="shrink-0" />
        )}
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>Fontes de dados</DropdownMenuLabel>
        {datasets.length === 0 && (
          <DropdownMenuItem disabled>
            Nenhuma fonte disponível
          </DropdownMenuItem>
        )}
        {datasets.map((dataset) => (
          <DropdownMenuItem
            key={dataset.id}
            onClick={() => onSelect(dataset)}
            className="cursor-pointer justify-between"
            title={dataset.table_name}
          >
            <span className="truncate">
              {datasetDisplayName(dataset)}
            </span>
            {dataset.id === selected?.id && (
              <Check size={15} className="shrink-0 text-teal-700" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
