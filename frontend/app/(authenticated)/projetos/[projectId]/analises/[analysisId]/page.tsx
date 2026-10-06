"use client"

import { useCallback, use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Copy,
  FileChartColumn,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PreviewChart } from "@/components/explorer/preview-chart"
import { chartConfigToDisplay } from "@/lib/charts/display-options"
import type { Analysis } from "@/lib/types/analysis"
import { chartTypeLabel, chartTypeIcon } from "@/lib/types/charts"
import { getAnalysis } from "@/lib/api/analyses"
import { executeQuery } from "@/lib/api/queries"
import { ApiError } from "@/lib/api"

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function AnaliseDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; analysisId: string }>
}) {
  const { projectId, analysisId } = use(params)

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(true)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [loadTick, setLoadTick] = useState(0)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    getAnalysis(analysisId)
      .then((value) => {
        setAnalysis(value)
        setLoadingAnalysis(false)
      })
      .catch((err) => {
        setAnalysisError(
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar a análise."
        )
        setLoadingAnalysis(false)
      })
  }, [analysisId, loadTick])

  function handleRetryLoad() {
    loadedRef.current = false
    setAnalysis(null)
    setAnalysisError(null)
    setLoadingAnalysis(true)
    setLoadTick((tick) => tick + 1)
  }

  const [result, setResult] = useState<Record<string, unknown>[] | null>(null)
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const hasAutoExecuted = useRef(false)

  const runQuery = useCallback(
    async (sql: string, databaseId: number, dbSchema: string | null) => {
      setExecuting(true)
      setExecuteError(null)
      setResult(null)

      try {
        const response = await executeQuery({
          database_id: databaseId,
          sql,
          db_schema: dbSchema ?? undefined,
        })

        if (response.status === "error") {
          setExecuteError(response.message || "Erro ao executar a consulta.")
        } else {
          setResult(response.data ?? [])
        }
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Não foi possível executar a consulta."
        setExecuteError(msg)
      } finally {
        setExecuting(false)
      }
    },
    []
  )

  useEffect(() => {
    if (analysis && analysis.databaseId && !hasAutoExecuted.current) {
      hasAutoExecuted.current = true
      void runQuery(analysis.sql, analysis.databaseId, analysis.dbSchema)
    }
  }, [analysis, runQuery])

  function handleCopySql() {
    if (!analysis) return
    navigator.clipboard.writeText(analysis.sql).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loadingAnalysis) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/projetos/${projectId}/analises`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          Minhas Análises
        </Link>

        <div className="mt-8 flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (analysisError) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/projetos/${projectId}/analises`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          Minhas Análises
        </Link>

        <div className="mt-8 rounded-lg border border-warning/30 bg-warning/10 px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-warning">
            <AlertCircle size={16} />
            {analysisError}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRetryLoad}>
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
            <Link href={`/projetos/${projectId}/analises`}>
              <Button variant="outline" size="sm">
                Minhas Análises
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/projetos/${projectId}/analises`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          Minhas Análises
        </Link>

        <EmptyState
          className="mt-8"
          icon={FileChartColumn}
          title="Análise não encontrada"
          description="Esta análise pode ter sido excluída ou o link está incorreto."
          action={
            <Link href={`/projetos/${projectId}/analises`}>
              <Button variant="outline">Voltar para Minhas Análises</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const Icon = chartTypeIcon[analysis.chartType]

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Navigation */}
      <Link
        href={`/projetos/${projectId}/analises`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} />
        Minhas Análises
      </Link>

      {/* Header */}
      <section className="mt-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {analysis.name}
            </h1>
            {analysis.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {analysis.description}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Metadata */}
      <section className="p-6">
        <h2 className="text-sm font-semibold text-foreground">Detalhes</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tipo</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
              <Icon size={14} className="text-primary" />
              {chartTypeLabel[analysis.chartType]}
            </p>
          </div>

            {analysis.dimension && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Dimensão</p>
                <p className="mt-1 text-sm font-mono text-foreground">
                  {analysis.dimension}
                </p>
              </div>
            )}

            {analysis.metric && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Métrica</p>
                <p className="mt-1 text-sm font-mono text-foreground">
                  {analysis.metric}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground">Criado em</p>
              <p className="mt-1 text-sm text-foreground">
                {formatDate(analysis.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Atualizado em
              </p>
              <p className="mt-1 text-sm text-foreground">
                {formatDate(analysis.updatedAt)}
              </p>
            </div>
          </div>
      </section>

      {/* SQL */}
      <section className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Consulta SQL
            </h2>
            <Button variant="outline" size="sm" onClick={handleCopySql}>
              {copied ? (
                <>
                  <CheckCircle size={14} className="text-primary" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copiar
                </>
              )}
            </Button>
          </div>

          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-sm text-foreground">
            {analysis.sql}
          </pre>
      </section>

      {/* Visualization */}
      <section className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Visualização
            </h2>
            {analysis.databaseId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  runQuery(
                    analysis.sql,
                    analysis.databaseId,
                    analysis.dbSchema
                  )
                }
                disabled={executing}
              >
                <Play size={14} />
                Executar novamente
              </Button>
            ) : null}
          </div>

          <div className="mt-4">
            {executing && (
              <div className="flex items-center justify-center rounded-lg border border-border bg-muted/50 p-12">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 size={20} className="animate-spin" />
                  Executando consulta...
                </div>
              </div>
            )}

            {executeError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-xs font-bold text-destructive">
                    !
                  </div>
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Erro ao executar consulta
                    </p>
                    <p className="mt-1 text-sm text-destructive">{executeError}</p>
                  </div>
                </div>
              </div>
            )}

            {!executing && !executeError && result && (
              <>
                {analysis.chartType === "table" ? (
                  <div className="max-h-[500px] overflow-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 border-b-border hover:bg-muted/50">
                          {Object.keys(result[0] ?? {}).map((col) => (
                            <TableHead
                              key={col}
                              className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.map((row, i) => (
                          <TableRow key={i} className="even:bg-muted/50/50">
                            {Object.keys(result[0] ?? {}).map((col) => (
                              <TableCell
                                key={col}
                                className="px-4 py-3 text-sm text-foreground"
                              >
                                {row[col] === null || row[col] === undefined
                                  ? "\u2014"
                                  : String(row[col])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="h-[400px] rounded-lg border border-border bg-muted/50/50 p-3">
                    <PreviewChart
                      data={result}
                      chartType={analysis.chartType}
                      dimension={analysis.dimension}
                      metric={analysis.metric}
                      colorField={analysis.chartConfig?.encoding?.color ?? null}
                      display={chartConfigToDisplay(analysis.chartConfig)}
                    />
                  </div>
                )}
              </>
            )}

            {!executing && !executeError && !result && !analysis.databaseId && (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Não foi possível re-executar a consulta automaticamente.
                </p>
              </div>
            )}
          </div>
      </section>
      </div>
    </div>
  )
}
