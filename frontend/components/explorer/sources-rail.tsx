"use client"

import Link from "next/link"
import { Database, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { datasetDisplayName, type DatasetListItem } from "@/lib/api/datasets"
import { chartTypeIcon } from "@/lib/types/charts"
import type { Analysis } from "@/lib/types/analysis"

interface SourcesRailProps {
  projectId: string | null
  datasets: DatasetListItem[]
  loadingDatasets: boolean
  datasetsError: string | null
  selectedDatasetId: number | null
  onSelectDataset: (dataset: DatasetListItem) => void
  /** `null` = carregando. Lista vem da página (fonte única de verdade). */
  analyses: Analysis[] | null
  analysesError?: string | null
}

const ANALISES_LIMIT = 6

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
      {children}
    </p>
  )
}

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
  datasets,
  loadingDatasets,
  datasetsError,
  selectedDatasetId,
  onSelectDataset,
  analyses,
  analysesError = null,
}: SourcesRailProps) {
  return (
    <nav
      aria-label="Contexto da investigação"
      className="h-full overflow-y-auto px-5 py-6"
    >
      <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Contexto
      </h2>
      <section>
        <RailLabel>Fontes</RailLabel>
        <div className="space-y-0.5 pb-2 pt-2">
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
        <div className="pb-2 pt-1">
          <Link
            href={projectId ? `/projetos/${projectId}/fontes` : "/fontes"}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus size={12} />
            Gerenciar fontes
          </Link>
        </div>
      </section>

      <section className="mt-6">
        <RailLabel>Análises</RailLabel>
        <div className="space-y-0.5 pb-2 pt-2">
          {analyses === null && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Carregando análises...
            </div>
          )}

          {analyses !== null && analyses.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {analysesError ?? "Nenhuma análise salva nesta etapa ainda."}
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
        <div className="pb-2 pt-1">
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
