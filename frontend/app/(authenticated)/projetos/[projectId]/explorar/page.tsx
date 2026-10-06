"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FolderOpen, Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { ExploreComposer } from "@/components/explorer/explore-composer"
import type { ExplorationMode } from "@/components/explorer/explore-composer"
import { ExploreShell } from "@/components/explorer/explore-shell"
import { InvestigationBlock } from "@/components/explorer/investigation-block"
import { SourcesRail } from "@/components/explorer/sources-rail"
import { QueryResult } from "@/components/explorer/query-result"
import {
  listDatasets,
  getDataset,
  DatasetListItem,
  DatasetColumn,
} from "@/lib/api/datasets"
import { executeQuery } from "@/lib/api/queries"
import { generatePreviewSql } from "@/lib/explorer/sql"
import { ApiError } from "@/lib/api"
import { getAnalysis, getAnalyses } from "@/lib/api/analyses"
import { getProjects } from "@/lib/api/projects"
import type { Analysis } from "@/lib/types/analysis"
import type { Project } from "@/lib/types/project"

function ExplorarContent() {
  const searchParams = useSearchParams()
  const analysisId = searchParams.get("analysisId")
  const datasetIdParam = searchParams.get("datasetId")
  const projectId = searchParams.get("projectId")

  const [datasets, setDatasets] = useState<DatasetListItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [datasetsError, setDatasetsError] = useState<string | null>(null)

  const [selectedDataset, setSelectedDataset] = useState<DatasetListItem | null>(null)
  const [datasetColumns, setDatasetColumns] = useState<DatasetColumn[]>([])

  const [mode, setMode] = useState<ExplorationMode>("ai")

  const [manualSql, setManualSql] = useState("")
  const [composerText, setComposerText] = useState("")
  const [agentQuestion, setAgentQuestion] = useState<string | null>(null)
  const [analysesVersion, setAnalysesVersion] = useState(0)

  const [result, setResult] = useState<Record<string, unknown>[] | null>(null)
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)

  const [restoreAnalysis, setRestoreAnalysis] = useState<Analysis | null>(null)
  /** Última SQL disparada — base do botão "Tentar novamente". */
  const lastSqlRef = useRef("")
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

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {
      // O nome do projeto é informativo; a bancada continua disponível.
    })
  }, [])

  // Análises salvas do projeto (alimenta o rail esquerdo). Chave derivada:
  // "carregando" = ausência de resultado para a chave atual.
  const [analysesState, setAnalysesState] = useState<{
    key: string
    items: Analysis[]
    error: string | null
  } | null>(null)
  const analysesKey = `${projectId ?? ""}#${analysesVersion}`
  useEffect(() => {
    if (!projectId) {
      setAnalysesState({ key: analysesKey, items: [], error: null })
      return
    }

    let active = true
    getAnalyses(projectId)
      .then((items) => {
        // Defesa adicional: o rail jamais exibe análises de outro projeto,
        // mesmo se uma resposta intermediária chegar fora de ordem.
        if (active) {
          setAnalysesState({
            key: analysesKey,
            items: items.filter((analysis) => analysis.projectId === projectId),
            error: null,
          })
        }
      })
      .catch(() => {
        if (active) {
          setAnalysesState({
            key: analysesKey,
            items: [],
            error: "Erro ao carregar análises.",
          })
        }
      })
    return () => {
      active = false
    }
  }, [projectId, analysesKey])
  const analyses =
    analysesState?.key === analysesKey ? analysesState.items : null
  const analysesError =
    analysesState?.key === analysesKey ? analysesState.error : null

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
    if (!projectId) return
    setSelectedDataset(dataset)
    setResult(null)
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
      !projectId ||
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
  }, [datasetIdParam, projectId, loadingDatasets, datasets])

  // 1) resolve o ?analysisId uma única vez (nunca dispara request repetido)
  // Sem flag `cancelled`: com o guard de loadedRef, Strict Mode descartaria o
  // resultado da 1ª execução e a restauração nunca aplicaria.
  useEffect(() => {
    if (!projectId || !analysisId || analysisLoadedRef.current) return
    analysisLoadedRef.current = true

    getAnalysis(analysisId)
      .then((value) => {
        // Uma análise aberta pela URL só pode ser restaurada no projeto ao
        // qual ela pertence; evita misturar contextos por parâmetros manuais.
        if (value?.projectId === projectId) setRestoreAnalysis(value)
      })
      .catch(() => {
        // análise inacessível: segue sem restauração, editor utilizável
      })
  }, [analysisId, projectId])

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

    lastSqlRef.current = sqlToExecute
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
    handleExecuteQuery(manualSql)
  }

  /**
   * Entrada do composer (interface única): SQL executa direto; linguagem
   * natural alimenta o modo Perguntar, cuja investigação aparece abaixo.
   */
  function handleComposerSubmit(text: string, effectiveMode: ExplorationMode) {
    if (effectiveMode === "sql") {
      setMode("sql")
      setManualSql(text)
      setComposerText("")
      void handleExecuteQuery(text)
      return
    }

    setMode("ai")
    setAgentQuestion(text)
    setComposerText("")
    // Nova investigação: o resultado anterior deixa de ser o contexto.
    setResult(null)
    setExecuteError(null)
    setRestoreAnalysis(null)
  }

  function handleAnalysisSaved() {
    setAnalysesVersion((version) => version + 1)
  }

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

  // Composer compacto assim que existe investigação em andamento.
  const started =
    result !== null ||
    executing ||
    agentQuestion !== null ||
    restoreAnalysis !== null

  const projectName = projectId
    ? projects.find((project) => project.id === projectId)?.name ?? "Projeto atual"
    : "Selecione um projeto"

  const hasResultState = result !== null || executing || executeError !== null
  return (
    <ExploreShell
      header={
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={projectId ? `/projetos/${projectId}` : "/inicio"}
              aria-label="Voltar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft size={17} />
            </Link>
            <span className="hidden h-5 w-px bg-slate-200 sm:block" />
            <h1 className="text-sm font-semibold text-slate-900 sm:text-base">Explorar</h1>
            <span className="hidden text-sm text-slate-500 sm:inline">Projeto:</span>
            <span className="max-w-40 truncate text-sm font-medium text-slate-600 sm:max-w-xs">
              {projectName}
            </span>
          </div>
        </header>
      }
      left={
        <SourcesRail
          projectId={projectId}
          datasets={datasets}
          loadingDatasets={loadingDatasets}
          datasetsError={datasetsError}
          selectedDatasetId={selectedDataset?.id ?? null}
          onSelectDataset={handleSelectDataset}
          analyses={analyses}
          analysesError={analysesError}
        />
      }
      right={
        selectedDataset && hasResultState ? (
          <section className="mx-5 mt-4 min-h-[18rem] sm:mx-8 xl:mx-8 xl:mt-0 xl:py-5">
            <div className="mb-4 flex shrink-0 items-baseline justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Resultado
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">
                  {restoreAnalysis?.name ?? `Resultado de ${selectedDataset.table_name}`}
                </h2>
              </div>
            </div>
            <QueryResult
              data={result}
              loading={executing}
              error={executeError}
              sql={manualSql}
              databaseId={selectedDataset.database.id}
              dbSchema={selectedDataset.schema ?? null}
              datasetId={selectedDataset.id}
              projectId={projectId ?? undefined}
              editingAnalysis={restoreAnalysis}
              onAnalysisSaved={handleAnalysisSaved}
              onDatasetPublished={handleDatasetPublished}
              onRetry={() => void handleExecuteQuery(lastSqlRef.current)}
            />
          </section>
        ) : undefined
      }
    >
      {!projectId ? (
        <section className="flex min-h-[22rem] flex-col items-center justify-center px-5 py-10 text-center sm:px-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <FolderOpen size={21} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            Escolha um projeto para começar
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            As investigações e análises do Explorar pertencem a um projeto. Abra
            um projeto para consultar dados e salvar seus resultados no contexto certo.
          </p>
          <Link
            href="/projetos"
            className="mt-5 inline-flex items-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800"
          >
            Ver projetos
          </Link>
        </section>
      ) : (
        <ExploreComposer
          compact={started}
          mode={mode}
          onModeChange={setMode}
          value={composerText}
          onChange={setComposerText}
          onSubmit={handleComposerSubmit}
          sql={manualSql}
          onSqlChange={setManualSql}
          onSqlExecute={handleSqlExecute}
          datasets={datasets}
          loadingDatasets={loadingDatasets}
          selectedDataset={selectedDataset}
          onSelectDataset={handleSelectDataset}
          columns={datasetColumns}
          executing={executing}
        />
      )}

      {/* A pergunta fica registrada entre o editor e a saída da investigação. */}
      {mode === "ai" && agentQuestion && (
        <section className="mx-5 mt-2 sm:mx-8 xl:mx-8">
          <InvestigationBlock question={agentQuestion} />
        </section>
      )}

    </ExploreShell>
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
