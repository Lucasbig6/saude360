"use client"

import {
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { ExploreShell } from "@/components/explorer/explore-shell"
import { SourcesRail } from "@/components/explorer/sources-rail"
import { ContextHeader } from "@/components/explorer/context-header"
import {
  ExplorationTabs,
  type ExplorationTab,
} from "@/components/explorer/exploration-tabs"
import {
  AgentInput,
  SqlInput,
  VisualInput,
} from "@/components/explorer/exploration-input"
import { ChatSessionHistory } from "@/components/explorer/chat-session-history"
import { InvestigationBlock } from "@/components/explorer/investigation-block"
import { AgentViz } from "@/components/explorer/agent-viz"
import { ResultActions } from "@/components/explorer/result-actions"
import { useExplorerAgent } from "@/hooks/use-explorer-agent"
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
import {
  deleteAISession,
  listExplorerAISessions,
  type AISession,
} from "@/lib/api/ai"
import type { Analysis } from "@/lib/types/analysis"
import {
  presentationFromRows,
  workspaceFromInvestigation,
  type PresentationState,
  type WorkspaceData,
} from "@/lib/explorer/workspace"
import { presentationFromAnalysis } from "@/lib/explorer/analysis-payload"
import { getProject } from "@/lib/api/projects"

const subscribeToHydration = () => () => {}
const getHydratedSnapshot = () => true
const getServerHydratedSnapshot = () => false

function agentStatusText(currentTool: string | null): string {
  switch (currentTool) {
    case "get_dataset_schema":
      return "Lendo o schema..."
    case "get_column_values":
      return "Buscando valores..."
    case "execute_query":
      return "Executando a consulta..."
    case "create_analysis":
      return "Salvando a análise..."
    case null:
      return "Analisando..."
    default:
      return "Processando..."
  }
}

function ExplorarContent({ projectId }: { projectId: string }) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  )
  const hydratedReady = Boolean(hydrated)
  const searchParams = useSearchParams()
  const analysisId = searchParams.get("analysisId")
  const datasetIdParam = searchParams.get("datasetId")

  const [datasets, setDatasets] = useState<DatasetListItem[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [datasetsError, setDatasetsError] = useState<string | null>(null)

  const [selectedDataset, setSelectedDataset] = useState<DatasetListItem | null>(null)
  const [datasetColumns, setDatasetColumns] = useState<DatasetColumn[]>([])
  const [projectName, setProjectName] = useState<string | null>(null)

  const [tab, setTab] = useState<ExplorationTab>("ai")

  const [manualSql, setManualSql] = useState("")
  const [composerText, setComposerText] = useState("")
  const [analysesVersion, setAnalysesVersion] = useState(0)
  const [chatSessionState, setChatSessionState] = useState<{
    datasetId: number
    sessions: AISession[]
    loading: boolean
  } | null>(null)
  const [loadingChatSession, setLoadingChatSession] = useState(false)
  const chatSessions =
    selectedDataset && chatSessionState?.datasetId === selectedDataset.id
      ? chatSessionState.sessions
      : []
  const loadingChatSessions = Boolean(
    selectedDataset &&
      (chatSessionState?.datasetId !== selectedDataset.id || chatSessionState.loading)
  )

  const {
    investigations,
    activeSessionId,
    ask,
    startNewSession,
    loadSession,
    retry,
    abort,
    abortAll,
    confirmPending,
    dismissPending,
  } = useExplorerAgent()

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [presentation, setPresentation] = useState<PresentationState>(() =>
    presentationFromRows([])
  )

  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)

  const [restoreAnalysis, setRestoreAnalysis] = useState<Analysis | null>(null)
  const lastSqlRef = useRef("")
  const analysisLoadedRef = useRef(false)
  const restoreAppliedRef = useRef(false)
  const datasetIdLoadedRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const workspaceKeyRef = useRef(0)

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
    const datasetId = selectedDataset?.id
    if (datasetId == null) return

    let active = true
    listExplorerAISessions(datasetId)
      .then((sessions) => {
        if (active) {
          setChatSessionState({ datasetId, sessions, loading: false })
        }
      })
      .catch(() => {
        if (active) {
          setChatSessionState({ datasetId, sessions: [], loading: false })
        }
      })

    return () => {
      active = false
    }
  }, [selectedDataset?.id])

  useEffect(() => {
    if (!projectId) return
    getProject(projectId)
      .then((project) => {
        if (project) setProjectName(project.name)
      })
      .catch(() => {})
  }, [projectId])

  const [analysesState, setAnalysesState] = useState<{
    key: string
    items: Analysis[]
    error: string | null
  } | null>(null)
  const analysesKey = `${projectId ?? ""}#${analysesVersion}`
  useEffect(() => {
    if (!projectId) return

    let active = true
    getAnalyses(projectId)
      .then((items) => {
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
    !projectId
      ? []
      : analysesState?.key === analysesKey
        ? analysesState.items
        : null
  const analysesError =
    !projectId
      ? null
      : analysesState?.key === analysesKey
        ? analysesState.error
        : null

  function applyWorkspace(data: WorkspaceData) {
    workspaceKeyRef.current += 1
    setWorkspace(data)
    setPresentation(presentationFromRows(data.rows))
  }

  function datasetDatabase(dataset: DatasetListItem): number | null {
    return dataset.database?.id ?? null
  }

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

    try {
      const response = await executeQuery({
        database_id: dataset.database.id,
        sql: previewSql,
        db_schema: dataset.schema || undefined,
      })

      if (response.status === "error") {
        setExecuteError(response.message || "Erro ao carregar os dados do dataset.")
      } else {
        const rows = response.data ?? []
        applyWorkspace({
          rows,
          rowCount: rows.length,
          truncated: false,
          executionMs: undefined,
          sql: previewSql,
          source: "sql",
          databaseId: datasetDatabase(dataset),
          dbSchema: dataset.schema ?? null,
          datasetId: dataset.id,
          datasetName: dataset.table_name,
        })
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
    abortAll()
    startNewSession()
    setSelectedDataset(dataset)
    setWorkspace(null)
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
  }, [datasetIdParam, projectId, loadingDatasets, datasets])

  useEffect(() => {
    if (!projectId || !analysisId || analysisLoadedRef.current) return
    analysisLoadedRef.current = true

    getAnalysis(analysisId)
      .then((value) => {
        if (value?.projectId === projectId) setRestoreAnalysis(value)
      })
      .catch(() => {})
  }, [analysisId, projectId])

  useEffect(() => {
    if (!restoreAnalysis || loadingDatasets || restoreAppliedRef.current) {
      return
    }

    const analysis = restoreAnalysis
    restoreAppliedRef.current = true

    requestAnimationFrame(() => {
      if (analysis.sql) {
        setManualSql(analysis.sql)
        setTab("sql")
      }
      setPresentation(presentationFromAnalysis(analysis))
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

    try {
      const response = await executeQuery({
        database_id: selectedDataset.database.id,
        sql: sqlToExecute,
        db_schema: selectedDataset.schema || undefined,
      })

      if (response.status === "error") {
        setExecuteError(response.message || "Erro ao executar a consulta.")
      } else {
        const rows = response.data ?? []
        applyWorkspace({
          rows,
          rowCount: rows.length,
          truncated: false,
          executionMs: undefined,
          sql: sqlToExecute,
          source: "sql",
          databaseId: datasetDatabase(selectedDataset),
          dbSchema: selectedDataset.schema ?? null,
          datasetId: selectedDataset.id,
          datasetName: selectedDataset.table_name,
        })
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
    void handleExecuteQuery(manualSql)
  }

  function handleAsk(text: string) {
    if (!selectedDataset) return
    setComposerText("")
    setRestoreAnalysis(null)
    setExecuteError(null)
    void ask(text, selectedDataset).then(() =>
      listExplorerAISessions(selectedDataset.id)
        .then((sessions) =>
          setChatSessionState({
            datasetId: selectedDataset.id,
            sessions,
            loading: false,
          })
        )
        .catch(() => {})
    )
  }

  function handleAskSql(text: string) {
    if (!selectedDataset) return
    setComposerText("")
    void handleExecuteQuery(text)
  }

  function handleTabChange(next: ExplorationTab) {
    setTab(next)
    if (next === "sql" && workspace?.sql) {
      setManualSql(workspace.sql)
    }
  }

  function handleEditVisual() {
    setTab("visual")
  }

  function handleNewChatSession() {
    startNewSession()
    setTab("ai")
    setWorkspace(null)
    setComposerText("")
    setExecuteError(null)
    setManualSql("")
    appliedQueryRef.current = null
  }

  async function handleSelectChatSession(session: AISession) {
    if (!selectedDataset) return
    setLoadingChatSession(true)
    setTab("ai")
    setWorkspace(null)
    setComposerText("")
    setExecuteError(null)
    appliedQueryRef.current = null
    try {
      await loadSession(session.id, selectedDataset)
    } catch (err) {
      setExecuteError(
        err instanceof ApiError
          ? err.detail
          : "Não foi possível carregar esta sessão."
      )
    } finally {
      setLoadingChatSession(false)
    }
  }

  async function handleDeleteChatSession(session: AISession) {
    const title = session.title || "Nova conversa"
    if (!window.confirm(`Excluir "${title}" e todas as mensagens desta sessão?`)) {
      return
    }

    try {
      await deleteAISession(session.id)
      setChatSessionState((current) => {
        if (!current || current.datasetId !== selectedDataset?.id) return current
        return {
          ...current,
          sessions: current.sessions.filter((item) => item.id !== session.id),
        }
      })
      if (activeSessionId === session.id) handleNewChatSession()
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.detail
          : "Não foi possível excluir esta sessão."
      window.alert(message)
    }
  }

  const appliedQueryRef = useRef<unknown>(null)
  useEffect(() => {
    const inv = [...investigations].reverse().find((i) => i.queryData)
    if (!inv || !inv.queryData) return
    const queryData = inv.queryData
    const frame = requestAnimationFrame(() => {
      if (appliedQueryRef.current !== queryData) {
        appliedQueryRef.current = queryData
        const dataset =
          datasets.find((item) => item.id === inv.datasetId) ?? null
        applyWorkspace(workspaceFromInvestigation(inv, dataset))
        return
      }
      setWorkspace((prev) =>
        prev && prev.investigationId === inv.id
          ? {
              ...prev,
              insight: inv.insight || null,
              savedAnalysis: inv.savedAnalysis,
            }
          : prev
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [investigations, datasets])

  function handleAnalysisSaved() {
    setAnalysesVersion((version) => version + 1)
  }

  const savedAnalysesRef = useRef(new Set<string>())
  useEffect(() => {
    const newlySaved = investigations.some((inv) =>
      inv.toolTrace.some(
        (trace) =>
          trace.name === "create_analysis" &&
          trace.status === "ok" &&
          !savedAnalysesRef.current.has(trace.toolCallId)
      )
    )
    if (!newlySaved) return
    for (const inv of investigations) {
      for (const trace of inv.toolTrace) {
        if (trace.name === "create_analysis" && trace.status === "ok") {
          savedAnalysesRef.current.add(trace.toolCallId)
        }
      }
    }
    setAnalysesVersion((version) => version + 1)
  }, [investigations])

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

  const chatCursorRef = useRef("")
  const lastInvestigation = investigations[investigations.length - 1]
  const chatCursor = `${investigations.length}:${lastInvestigation?.status ?? ""}`
  useEffect(() => {
    if (chatCursorRef.current === chatCursor) return
    const prevParts = chatCursorRef.current.split(":")
    const nextParts = chatCursor.split(":")
    chatCursorRef.current = chatCursor
    const isNewTurn = prevParts[0] !== nextParts[0]
    const finishedStreaming =
      prevParts[1] === "streaming" && nextParts[1] !== "streaming"
    if ((isNewTurn || finishedStreaming) && tab === "ai") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [chatCursor, tab])

  const agentBusy = investigations.some(
    (inv) =>
      inv.status === "streaming" || inv.status === "awaiting_confirmation"
  )

  const reversedInvestigations = [...investigations].reverse()
  const streamingInv =
    reversedInvestigations.find((i) => i.status === "streaming") ?? null
  const panelInv =
    (workspace?.investigationId
      ? (investigations.find((i) => i.id === workspace.investigationId) ??
        null)
      : null) ?? streamingInv

  const panelStreaming =
    panelInv?.status === "streaming" || (executing && tab === "sql")
  const panelStatusText = panelInv?.status === "streaming"
    ? agentStatusText(panelInv.currentTool)
    : executing && tab === "sql"
      ? "Executando consulta..."
      : null
  const panelError =
    panelInv?.error ?? (workspace?.source === "sql" ? executeError : null)

  function handlePanelRetry() {
    if (workspace?.source === "sql" || (!panelInv && executeError)) {
      void handleExecuteQuery(lastSqlRef.current)
    } else if (panelInv) {
      void retry(panelInv.id)
    }
  }

  function handlePanelAbort() {
    if (panelInv) abort(panelInv.id)
  }

  function handlePanelConfirm() {
    if (panelInv) void confirmPending(panelInv.id)
  }

  function handlePanelDismiss() {
    if (panelInv) dismissPending(panelInv.id)
  }

  const [showSql, setShowSql] = useState(false)

  const resultPanel = workspace ? (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          Resultado
        </p>
        {panelStreaming && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            {panelStatusText ?? "Processando..."}
          </p>
        )}
      </div>
      {panelStreaming && workspace.rows.length === 0 ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <AgentViz
            rows={workspace.rows}
            rowCount={workspace.rowCount}
            truncated={workspace.truncated}
            executionMs={workspace.executionMs}
            presentation={presentation}
            onPresentationChange={setPresentation}
          />
          {workspace.source === "agent" && workspace.insight && tab !== "ai" && (
            <div className="mt-3 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
              {workspace.insight}
            </div>
          )}
          {panelError && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-destructive/40 bg-card px-4 py-3"
            >
              <p className="text-sm font-medium text-destructive">
                Não foi possível concluir.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{panelError}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handlePanelRetry}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Tentar novamente
                </button>
                {panelStreaming && (
                  <button
                    type="button"
                    onClick={handlePanelAbort}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Interromper
                  </button>
                )}
              </div>
            </div>
          )}
          {panelInv?.pendingConfirmation && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-primary/40 bg-card px-4 py-3"
            >
              <p className="text-sm font-medium text-foreground">
                O agente quer salvar esta investigação como análise. Confirmar?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handlePanelConfirm}
                  disabled={panelStreaming}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirmar e salvar
                </button>
                <button
                  type="button"
                  onClick={handlePanelDismiss}
                  disabled={panelStreaming}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
          <ResultActions
            workspace={workspace}
            presentation={presentation}
            projectId={projectId}
            editingAnalysis={restoreAnalysis}
            onAnalysisSaved={handleAnalysisSaved}
            onDatasetPublished={handleDatasetPublished}
            onShowSql={() => setShowSql((v) => !v)}
            onEditVisual={handleEditVisual}
          />
          {showSql && workspace.sql && (
            <details
              open
              className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5"
            >
              <summary
                className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault()
                  setShowSql(false)
                }}
              >
                Ocultar SQL
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
                {workspace.sql}
              </pre>
            </details>
          )}
        </>
      )}
    </div>
  ) : panelStreaming || executeError ? (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Resultado
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        {panelStatusText ?? "Processando..."}
      </div>
      <div className="mt-3 space-y-2" aria-hidden="true">
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  ) : null

  return (
    <ExploreShell
      header={
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-4 sm:px-6 lg:px-8">
          <Link
            href={`/projetos/${projectId}`}
            aria-label="Voltar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={17} />
          </Link>
        </header>
      }
      left={
        <SourcesRail
          projectId={projectId}
          projectName={projectName}
          datasets={datasets}
          loadingDatasets={loadingDatasets}
          datasetsError={datasetsError}
          selectedDatasetId={selectedDataset?.id ?? null}
          selectedDatasetName={selectedDataset?.table_name ?? null}
          onSelectDataset={handleSelectDataset}
          analyses={analyses}
          analysesError={analysesError}
        />
      }
    >
      <ContextHeader
        datasetName={
          selectedDataset ? selectedDataset.table_name : null
        }
        loading={loadingDatasets}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <ExplorationTabs
            active={tab}
            onChange={handleTabChange}
            visualDisabled={hydratedReady && workspace === null}
          />
          <ChatSessionHistory
            sessions={chatSessions}
            activeSessionId={activeSessionId}
            loading={loadingChatSessions}
            disabled={!hydratedReady || !selectedDataset || agentBusy || loadingChatSession}
            onNewSession={handleNewChatSession}
            onSelectSession={(session) => void handleSelectChatSession(session)}
            onDeleteSession={(session) => void handleDeleteChatSession(session)}
          />
        </div>

        {tab === "ai" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 pb-28">
              {investigations.length === 0 ? (
                null
              ) : (
                <div className="divide-y divide-border">
                  {investigations.map((inv) => (
                    <InvestigationBlock
                      key={inv.id}
                      investigation={inv}
                      onRetry={() => void retry(inv.id)}
                      onAbort={() => abort(inv.id)}
                      presentation={presentation}
                      onPresentationChange={setPresentation}
                      projectId={projectId}
                      editingAnalysis={restoreAnalysis}
                      onDatasetPublished={handleDatasetPublished}
                      onEditVisual={handleEditVisual}
                    />
                  ))}
                </div>
              )}
              <div
                ref={chatEndRef}
                aria-hidden="true"
                className="h-1"
              />
            </div>
            <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
              <div className="mx-auto w-full max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                <AgentInput
                  value={composerText}
                  onChange={setComposerText}
                  onAsk={handleAsk}
                  onAskSql={handleAskSql}
                  disabled={!hydratedReady || !selectedDataset || loadingChatSession}
                  busy={agentBusy || loadingChatSession}
                  hasDataset={selectedDataset !== null}
                  columns={datasetColumns}
                  hideSuggestions={investigations.length > 0}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "sql" && (
          <div className="mt-5 space-y-4">
            <SqlInput
              sql={manualSql}
              onSqlChange={setManualSql}
              onExecute={handleSqlExecute}
              executing={executing}
              disabled={!selectedDataset}
              hasDataset={selectedDataset !== null}
              datasets={datasets}
              columns={datasetColumns}
            />
            {resultPanel}
          </div>
        )}

        {tab === "visual" && (
          <div className="mt-5 space-y-4">
            <VisualInput
              workspace={workspace}
              presentation={presentation}
              onPresentationChange={setPresentation}
            />
            {workspace && workspace.rows.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                  Preview
                </p>
                <AgentViz
                  rows={workspace.rows}
                  rowCount={workspace.rowCount}
                  truncated={workspace.truncated}
                  executionMs={workspace.executionMs}
                  presentation={presentation}
                  onPresentationChange={setPresentation}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </ExploreShell>
  )
}

export default function ExplorarPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center p-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <ExplorarContent projectId={projectId} />
    </Suspense>
  )
}
