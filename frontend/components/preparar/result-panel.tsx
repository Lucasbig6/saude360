"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
} from "lucide-react"

const PAGE_SIZE = 50

interface ResultPanelProps {
  data: Record<string, unknown>[] | null
  loading: boolean
  error: string | null
}

export function ResultPanel({ data, loading, error }: ResultPanelProps) {
  const [page, setPage] = useState(0)

  const columns = useMemo(
    () => (data && data.length > 0 ? Object.keys(data[0]) : []),
    [data]
  )

  const totalPages = data ? Math.ceil(data.length / PAGE_SIZE) : 0
  const start = page * PAGE_SIZE
  const pageData = data ? data.slice(start, start + PAGE_SIZE) : []

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Executando consulta...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        <Inbox size={16} className="mr-2" />
        Execute uma consulta para ver os resultados.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {data.length} registro{data.length !== 1 ? "s" : ""}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 px-2"
            >
              <ChevronLeft size={12} />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-2"
            >
              <ChevronRight size={12} />
            </Button>
          </div>
        )}
      </div>

      <div className="max-h-[300px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="whitespace-nowrap bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row, i) => (
              <TableRow
                key={start + i}
                className="even:bg-muted/50/50"
              >
                {columns.map((col, ci) => (
                  <TableCell
                    key={col}
                    className={cn(
                      "whitespace-nowrap px-4 py-2 text-sm text-foreground max-w-[250px] truncate",
                      ci < columns.length - 1 && "border-r border-r-border"
                    )}
                  >
                    {formatValue(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "\u2014"
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "\u2014"
  if (typeof val === "object") return JSON.stringify(val)
  return String(val)
}
