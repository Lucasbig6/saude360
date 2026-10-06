"use client"

import {
  AlertCircle,
  FileChartColumn,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeLabel, chartTypeIcon } from "@/lib/types/charts"
import { getAnalyses } from "@/lib/api/analyses"
import { ApiError } from "@/lib/api"

interface AddAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (analysis: Analysis) => void
  excludeIds: string[]
}

export function AddAnalysisDialog({
  open,
  onOpenChange,
  onSelect,
  excludeIds,
}: AddAnalysisDialogProps) {
  const [search, setSearch] = useState("")
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      setAnalyses(null)
      try {
        const list = await getAnalyses()
        if (!cancelled) setAnalyses(list)
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError
              ? err.detail
              : "Erro ao carregar análises."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, reloadKey])

  const filtered = useMemo(() => {
    const available = (analyses ?? []).filter((a) => !excludeIds.includes(a.id))

    const searched = !search.trim()
      ? available
      : available.filter((a) => {
          const term = search.toLowerCase()
          return (
            a.name.toLowerCase().includes(term) ||
            a.description.toLowerCase().includes(term)
          )
        })

    return [...searched].sort((a, b) => {
      const aChart = a.chartType !== "table" ? 0 : 1
      const bChart = b.chartType !== "table" ? 0 : 1
      if (aChart !== bChart) return aChart - bChart
      return a.name.localeCompare(b.name)
    })
  }, [analyses, excludeIds, search])

  function handleSelect(analysis: Analysis) {
    onSelect(analysis)
    onOpenChange(false)
    setSearch("")
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearch("")
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar gráfico ou análise</DialogTitle>
          <DialogDescription>
            Selecione um gráfico salvo (preferencialmente) ou uma análise para
            adicionar ao painel.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar gráficos e análises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="mt-2 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-4 text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-warning">
                <AlertCircle size={15} />
                {loadError}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 bg-card"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <RefreshCw size={13} />
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <FileChartColumn size={18} className="text-muted-foreground" />
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                Nenhuma análise encontrada
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {excludeIds.length > 0
                  ? "Todos os itens já foram adicionados a este painel."
                  : "Crie um gráfico ou análise no Explorer primeiro."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((analysis) => {
                const Icon = chartTypeIcon[analysis.chartType]

                return (
                  <button
                    key={analysis.id}
                    type="button"
                    onClick={() => handleSelect(analysis)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {analysis.name}
                      </p>
                      {analysis.description && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {analysis.description}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {analysis.chartType === "table"
                        ? "Análise"
                        : chartTypeLabel[analysis.chartType]}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
