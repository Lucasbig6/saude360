"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getAnalysis } from "@/lib/api/analyses"
import { getDataset, type DatasetColumn } from "@/lib/api/datasets"
import { ApiError } from "@/lib/api"
import type { Analysis } from "@/lib/types/analysis"
import type { DashboardWidget } from "@/lib/types/dashboard"
import type { WidgetConfig } from "@/lib/types/widgets"
import { legacyToWidgetConfig } from "@/lib/types/widgets"
import { ChartConfigPanel } from "./chart-config-panel"

interface WidgetConfigDialogProps {
  /** Widget em edição; null fecha o diálogo. */
  widget: DashboardWidget | null
  onOpenChange: (open: boolean) => void
  onSave: (widgetId: string, config: WidgetConfig) => void
}

interface LoadState {
  /** analysisId a que estes dados pertencem; null = nunca carregado. */
  forId: string | null
  analysis: Analysis | null
  columns: DatasetColumn[]
  error: string | null
}

export function WidgetConfigDialog({
  widget,
  onOpenChange,
  onSave,
}: WidgetConfigDialogProps) {
  const [state, setState] = useState<LoadState>({
    forId: null,
    analysis: null,
    columns: [],
    error: null,
  })

  const analysisId = widget?.analysisId ?? null

  useEffect(() => {
    if (!analysisId) return
    let cancelled = false

    void (async () => {
      try {
        const analysis = await getAnalysis(analysisId)
        let columns: DatasetColumn[] = []

        if (analysis?.datasetId != null) {
          try {
            const dataset = await getDataset(analysis.datasetId)
            columns = dataset.columns ?? []
          } catch {
            // sem dataset/colunas o painel ainda edita tipo e título
            columns = []
          }
        }

        if (!cancelled) {
          setState({ forId: analysisId, analysis, columns, error: null })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            forId: analysisId,
            analysis: null,
            columns: [],
            error:
              err instanceof ApiError
                ? err.detail
                : "Não foi possível carregar a análise do widget.",
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [analysisId])

  const open = widget !== null
  const loading = open && analysisId !== null && state.forId !== analysisId

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) onOpenChange(false)
  }

  const initialConfig =
    widget && state.analysis
      ? (widget.config ?? legacyToWidgetConfig(state.analysis))
      : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar widget</DialogTitle>
          <DialogDescription>
            Ajuste o tipo, os campos e a apresentação deste widget no painel.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando configuração...
          </div>
        )}

        {!loading && state.error && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        )}

        {widget && initialConfig && (
          <ChartConfigPanel
            key={widget.id}
            config={initialConfig}
            columns={state.columns}
            onCancel={() => onOpenChange(false)}
            onApply={(config) => onSave(widget.id, config)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
