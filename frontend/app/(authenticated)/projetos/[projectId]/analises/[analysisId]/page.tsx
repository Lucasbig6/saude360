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
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(true)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [loadTick, setLoadTick] = useState(0)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    getAnalysis(id)
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
  }, [id, loadTick])

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
          href="/analises"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Minhas Análises
        </Link>

        <div className="mt-8 flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  if (analysisError) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/analises"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Minhas Análises
        </Link>

        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">
            <AlertCircle size={16} />
            {analysisError}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRetryLoad}>
              <RefreshCw size={13} />
              Tentar novamente
            </Button>
            <Link href="/analises">
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
          href="/analises"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Minhas Análises
        </Link>

        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <FileChartColumn size={24} className="text-slate-400" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-slate-900">
            Análise não encontrada
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Esta análise pode ter sido excluída ou o link está incorreto.
          </p>
          <Link href="/analises" className="mt-6">
            <Button variant="outline">Voltar para Minhas Análises</Button>
          </Link>
        </div>
      </div>
    )
  }

  const Icon = chartTypeIcon[analysis.chartType]

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Navigation */}
      <Link
        href="/analises"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
      >
        <ArrowLeft size={14} />
        Minhas Análises
      </Link>

      {/* Header */}
      <section className="mt-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Icon size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {analysis.name}
            </h1>
            {analysis.description && (
              <p className="mt-1 text-sm text-slate-500">
                {analysis.description}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Metadata */}
      <section className="mt-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Detalhes</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-slate-500">Tipo</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-900">
                <Icon size={14} className="text-teal-600" />
                {chartTypeLabel[analysis.chartType]}
              </p>
            </div>

            {analysis.dimension && (
              <div>
                <p className="text-xs font-medium text-slate-500">Dimensão</p>
                <p className="mt-1 text-sm font-mono text-slate-900">
                  {analysis.dimension}
                </p>
              </div>
            )}

            {analysis.metric && (
              <div>
                <p className="text-xs font-medium text-slate-500">Métrica</p>
                <p className="mt-1 text-sm font-mono text-slate-900">
                  {analysis.metric}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-slate-500">Criado em</p>
              <p className="mt-1 text-sm text-slate-900">
                {formatDate(analysis.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">
                Atualizado em
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {formatDate(analysis.updatedAt)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SQL */}
      <section className="mt-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Consulta SQL
            </h2>
            <Button variant="outline" size="sm" onClick={handleCopySql}>
              {copied ? (
                <>
                  <CheckCircle size={14} className="text-teal-600" />
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

          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-sm text-slate-700">
            {analysis.sql}
          </pre>
        </div>
      </section>

      {/* Visualization */}
      <section className="mt-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
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
              <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-12">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Loader2 size={20} className="animate-spin" />
                  Executando consulta...
                </div>
              </div>
            )}

            {executeError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">
                    !
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">
                      Erro ao executar consulta
                    </p>
                    <p className="mt-1 text-sm text-red-600">{executeError}</p>
                  </div>
                </div>
              </div>
            )}

            {!executing && !executeError && result && (
              <>
                {analysis.chartType === "table" ? (
                  <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2 border-b-slate-300 hover:bg-slate-50">
                          {Object.keys(result[0] ?? {}).map((col) => (
                            <TableHead
                              key={col}
                              className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"
                            >
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.map((row, i) => (
                          <TableRow key={i} className="even:bg-slate-50/50">
                            {Object.keys(result[0] ?? {}).map((col) => (
                              <TableCell
                                key={col}
                                className="px-4 py-3 text-sm text-slate-700"
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
                  <div className="h-[400px] rounded-lg border border-slate-200 bg-slate-50/50 p-3">
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
              <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                <p className="text-sm text-slate-500">
                  Não foi possível re-executar a consulta automaticamente.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
