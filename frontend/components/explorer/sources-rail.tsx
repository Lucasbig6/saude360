"use client"

import Link from "next/link"
import { Database, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { datasetDisplayName, type DatasetListItem } from "@/lib/api/datasets"
import { chartTypeIcon } from "@/lib/types/charts"
import type { Analysis } from "@/lib/types/analysis"

interface SourcesRailProps {
  projectId: string | null
  projectName: string | null
  datasets: DatasetListItem[]
  loadingDatasets: boolean
  datasetsError: string | null
  selectedDatasetId: number | null
  selectedDatasetName: string | null
  onSelectDataset: (dataset: DatasetListItem) => void
  /** `null` = carregando. Lista vem da página (fonte única de verdade). */
  analyses: Analysis[] | null
  analysesError?: string | null
}

const ANALISES_LIMIT = 6

function railItemActive(active: boolean): string {
  return cn(
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
    active
      ? "bg-primary/10 font-medium text-primary"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
  )
}

export function SourcesRail({
  projectId,
  projectName,
  datasets,
  loadingDatasets,
  datasetsError,
  selectedDatasetId,
  selectedDatasetName,
  onSelectDataset,
  analyses,
  analysesError = null,
}: SourcesRailProps) {
  return (
    <nav
      aria-label="Contexto da investigação"
      className="h-full overflow-y-auto px-3 py-4"
    >
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Contexto da sessão
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3">
          {projectName && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Projeto
              </p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {projectName}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border/80 bg-background/80 px-2.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Fonte ativa
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">
              {selectedDatasetName ?? "Nenhuma fonte selecionada"}
            </p>
          </div>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Fontes disponíveis
          </p>
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {datasets.length}
          </span>
        </div>

        <div className="space-y-1 pt-3">
          {loadingDatasets && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Carregando fontes...
            </div>
          )}

          {datasetsError && (
            <p className="px-2 py-1.5 text-xs text-destructive">{datasetsError}</p>
          )}

          {!loadingDatasets &&
            !datasetsError &&
            datasets.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Nenhuma fonte disponível.
              </p>
            )}

          {!loadingDatasets &&
            datasets.map((dataset) => (
              <button
                key={dataset.id}
                type="button"
                onClick={() => onSelectDataset(dataset)}
                className={railItemActive(dataset.id === selectedDatasetId)}
                title={dataset.table_name}
              >
                <Database size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{datasetDisplayName(dataset)}</span>
              </button>
            ))}
        </div>

        <div className="pt-3">
          <Link
            href={projectId ? `/projetos/${projectId}/fontes` : "/fontes"}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus size={12} />
            Gerenciar fontes
          </Link>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Análises recentes
          </p>
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {analyses?.length ?? 0}
          </span>
        </div>

        <div className="space-y-1 pt-3">
          {analyses === null && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Carregando análises...
            </div>
          )}

          {analyses !== null && analyses.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {analysesError ?? "Nenhuma análise salva ainda."}
            </p>
          )}

          {analyses?.slice(0, ANALISES_LIMIT).map((analysis) => {
            const Icon = chartTypeIcon[analysis.chartType] ?? Database
            return (
              <Link
                key={analysis.id}
                href={
                  analysis.projectId ?? projectId
                    ? `/projetos/${analysis.projectId ?? projectId}/explorar?analysisId=${analysis.id}`
                    : `/explorar?analysisId=${analysis.id}`
                }
                className={railItemActive(false)}
                title={analysis.description || analysis.name}
              >
                <Icon size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{analysis.name}</span>
              </Link>
            )
          })}
        </div>

        <div className="pt-3">
          <Link
            href={projectId ? `/projetos/${projectId}/analises` : "/analises"}
            className="text-xs text-primary hover:underline"
          >
            Ver todas as análises
          </Link>
        </div>
      </section>
    </nav>
  )
}
