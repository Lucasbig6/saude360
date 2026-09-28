"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { AlertCircle, Database, Loader2 } from "lucide-react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { DatasetSelector } from "@/components/explorer/dataset-selector"
import { QueryResult } from "@/components/explorer/query-result"
import {
  ExplorationTabs,
  type ExplorationMode,
} from "@/components/explorer/exploration-tabs"
import {
  ExplorationConfig,
  type ExplorationRequest,
} from "@/components/explorer/exploration-config"
import { AiAgentTab } from "@/components/explorer/ai-agent-tab"
import {
  listDatasets,
  getDataset,
  DatasetListItem,
  DatasetColumn,
} from "@/lib/api/datasets"
import { executeQuery } from "@/lib/api/queries"
import { generateExplorationSql, generatePreviewSql } from "@/lib/explorer/sql"
import { ApiError } from "@/lib/api"
import { getAnalysis } from "@/lib/api/analyses"
import type { Analysis } from "@/lib/types/analysis"

const SqlEditor = dynamic(
  () =>
    import("@/components/explorer/sql-editor").then((m) => ({
      default: m.SqlEditor,
    })),
  { ssr: false }
)

function ExplorarContent() {
  const searchParams = useSearchParams()
  const analysisId = searchParams.get("analysisId")
  const datasetIdParam = searchParams.get("datasetId")
  const projectId = searchParams.get("projectId")

  const [datasets, setDatasets] = useState<DatasetListItem[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [datasetsError, setDatasetsError] = useState<string | null>(null)

  const [selectedDataset, setSelectedDataset] = useState<DatasetListItem | null>(null)
  const [datasetColumns, setDatasetColumns] = useState<DatasetColumn[]>([])

  const [mode, setMode] = useState<ExplorationMode>("sql")

  const [manualSql, setManualSql] = useState("")
  const [generatedSql, setGeneratedSql] = useState<string | null>(null)

  const [result, setResult] = useState<Record<string, unknown>[] | null>(null)
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)

  const [restoreAnalysis, setRestoreAnalysis] = useState<Analysis | null>(null)
  const analysisLoadedRef = useRef(false)
  const restoreAppliedRef = useRef(false)
  const datasetIdLoadedRef = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await listDatasets()
        setDatasets(data.result ?? [])
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar datasets."
        setDatasetsError(msg)
      } finally {
        setLoadingDatasets(false)
      }
    }
    load()
  }, [])

  async function runPreview(dataset: DatasetListItem) {
    let previewSql: string
    try {
      previewSql = generatePreviewSql(dataset.table_name)
    } catch (err) {
      setExecuteError(
        err instanceof Error ? err.message : "Erro ao gerar SQL de preview."
      )
      return
    }

    setManualSql(previewSql)
    setGeneratedSql(null)
    setExecuting(true)
    setExecuteError(null)
    setResult(null)

    try {
      const response = await executeQuery({
        database_id: dataset.database.id,
        sql: previewSql,
        db_schema: dataset.schema || undefined,
      })

      if (response.status === "error") {
        setExecuteError(response.message || "Erro ao carregar os dados do dataset.")
      } else {
        setResult(response.data ?? [])
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Não foi possível carregar os dados do dataset."
      setExecuteError(msg)
    } finally {
      setExecuting(false)
    }
  }

  async function handleSelectDataset(dataset: DatasetListItem) {
    setSelectedDataset(dataset)
    setResult(null)
    setGeneratedSql(null)
    setExecuteError(null)
    setManualSql("")

    try {
      const detail = await getDataset(dataset.id)
      const columns = (detail as unknown as { columns?: DatasetColumn[] }).columns ?? []
      setDatasetColumns(columns)
    } catch {
      setDatasetColumns(dataset.columns ?? [])
    }

    await runPreview(dataset)
  }

  useEffect(() => {
    if (
      !datasetIdParam ||
      datasetIdLoadedRef.current ||
      loadingDatasets ||
      datasets.length === 0
    ) {
      return
    }

    const targetId = Number(datasetIdParam)
    if (!Number.isFinite(targetId)) return

    const match = datasets.find((ds) => ds.id === targetId)
    if (!match) return

    datasetIdLoadedRef.current = true
    requestAnimationFrame(() => {
      void handleSelectDataset(match)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetIdParam, loadingDatasets, datasets])

  // 1) resolve o ?analysisId uma única vez (nunca dispara request repetido)
  // Sem flag `cancelled`: com o guard de loadedRef, Strict Mode descartaria o
  // resultado da 1ª execução e a restauração nunca aplicaria.
  useEffect(() => {
    if (!analysisId || analysisLoadedRef.current) return
    analysisLoadedRef.current = true

    getAnalysis(analysisId)
      .then((value) => setRestoreAnalysis(value))
      .catch(() => {
        // análise inacessível: segue sem restauração, editor utilizável
      })
  }, [analysisId])

  // 2) aplica a restauração quando análise e datasets estiverem resolvidos
  useEffect(() => {
    if (!restoreAnalysis || loadingDatasets || restoreAppliedRef.current) {
      return
    }

    const analysis = restoreAnalysis
    restoreAppliedRef.current = true

    requestAnimationFrame(() => {
      if (analysis.sql) {
        setManualSql(analysis.sql)
        setMode("sql")
      }
      if (datasets.length > 0 && analysis.databaseId) {
        const match = datasets.find((ds) => ds.database.id === analysis.databaseId)
        if (match) {
          setSelectedDataset(match)
          void getDataset(match.id)
            .then((detail) => {
              const columns =
                (detail as unknown as { columns?: DatasetColumn[] }).columns ?? []
              setDatasetColumns(columns)
            })
            .catch(() => setDatasetColumns(match.columns ?? []))
        }
      }
    })
  }, [restoreAnalysis, loadingDatasets, datasets])

  async function handleExecuteQuery(sqlToExecute: string) {
    if (!selectedDataset || !sqlToExecute.trim()) return

    setExecuting(true)
    setExecuteError(null)
    setResult(null)

    try {
      const response = await executeQuery({
        database_id: selectedDataset.database.id,
        sql: sqlToExecute,
        db_schema: selectedDataset.schema || undefined,
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
  }

  function handleSqlExecute() {
    setGeneratedSql(null)
    handleExecuteQuery(manualSql)
  }

  function handleBuilderExecute(config: ExplorationRequest) {
    if (!selectedDataset) return

    try {
      const sql = generateExplorationSql(
        config,
        selectedDataset.table_name,
        datasetColumns
      )
      setGeneratedSql(sql)
      handleExecuteQuery(sql)
    } catch (err) {
      setExecuteError(
        err instanceof Error ? err.message : "Erro ao gerar SQL."
      )
    }
  }

  const activeSql = generatedSql ?? manualSql

  async function handleDatasetPublished(publishedId?: number) {
    try {
      const data = await listDatasets()
      const next = data.result ?? []
      setDatasets(next)
      setDatasetsError(null)

      if (publishedId != null) {
        const match = next.find((ds) => ds.id === publishedId)
        if (match) {
          datasetIdLoadedRef.current = true
          await handleSelectDataset(match)
        }
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Erro ao atualizar a lista de datasets."
      setDatasetsError(msg)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Explorar dados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Consulte, analise e explore os dados disponíveis no Saude360.
        </p>
      </section>

      {/* Dataset selector */}
      <section className="mt-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Conjunto de dados</h2>
              <p className="text-xs text-slate-500">
                Selecione o conjunto de dados para análise.
              </p>
            </div>
          </div>

          <div className="mt-4">
            {datasetsError ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertCircle size={16} />
                {datasetsError}
              </div>
            ) : (
              <DatasetSelector
                datasets={datasets}
                value={selectedDataset?.id ?? null}
                onChange={handleSelectDataset}
                loading={loadingDatasets}
              />
            )}
          </div>
        </div>
      </section>

      {/* Tabs */}
      {selectedDataset && (
        <section className="mt-6">
          <ExplorationTabs mode={mode} onModeChange={setMode} />
        </section>
      )}

      {/* Tab content */}
      {selectedDataset && (
        <section className="mt-6">
          {mode === "sql" && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Consulta SQL</h2>
              <p className="mt-1 text-xs text-slate-500">
                Consulte o dataset selecionado. Use Ctrl+Enter
                para executar. O resultado e o salvamento de dataset funcionam da
                mesma forma nas abas SQL e Visual.
              </p>

              <div className="mt-4">
                <SqlEditor
                  value={manualSql}
                  onChange={setManualSql}
                  onExecute={handleSqlExecute}
                  loading={executing}
                  datasets={datasets}
                  columns={datasetColumns}
                />
              </div>
            </div>
          )}

          {mode === "ai" && <AiAgentTab />}

          {mode === "builder" && (
            <ExplorationConfig
              columns={datasetColumns}
              onExecute={handleBuilderExecute}
              loading={executing}
            />
          )}
        </section>
      )}

      {/* Generated SQL preview (Visual mode) */}
      {generatedSql && (
        <section className="mt-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 mb-2">SQL gerado:</p>
            <pre className="text-xs text-slate-700 bg-slate-50 rounded-lg p-3 overflow-x-auto">
              {generatedSql}
            </pre>
          </div>
        </section>
      )}

      {/* Result */}
      <section className="mt-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Resultado</h2>

          <div className="mt-4">
            <QueryResult
              data={result}
              loading={executing}
              error={executeError}
              sql={activeSql}
              databaseId={selectedDataset?.database.id}
              dbSchema={selectedDataset?.schema ?? null}
              datasetId={selectedDataset?.id ?? null}
              projectId={projectId ?? undefined}
              onDatasetPublished={handleDatasetPublished}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

export default function ExplorarPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </div>
      }
    >
      <ExplorarContent />
    </Suspense>
  )
}
