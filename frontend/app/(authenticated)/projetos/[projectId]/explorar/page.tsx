"use client"

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useReducer,
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
import { PreviewPanel } from "@/components/explorer/preview-panel"
import { useExplorerAgent, type Investigation } from "@/hooks/use-explorer-agent"
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
  workspaceFromInvestigation,
  type WorkspaceData,
} from "@/lib/explorer/workspace"
import {
  analysisDraftReducer,
  configFromPresentation,
  createEmptyDraft,
  workspaceFromDraft,
  type DraftMeta,
} from "@/lib/explorer/analysis-draft"
import { presentationFromAnalysis } from "@/lib/explorer/analysis-payload"
import { getProject } from "@/lib/api/projects"
import { cn } from "@/lib/utils"

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
    case "preview_analysis":
      return "Gerando a prévia da análise..."
    case "create_analysis":
      return "Salvando a análise..."
    case null:
      return "Analisando..."
    default:
      return "Processando..."
  }
}

function metaFromInvestigation(
  inv: Investigation,
  dataset: DatasetListItem | null
): DraftMeta {
  const workspace = workspaceFromInvestigation(inv, dataset)
  return {
    question: workspace.question,
    insight: workspace.insight,
    source: "agent",
    databaseId: workspace.databaseId,
    dbSchema: workspace.dbSchema,
    datasetId: workspace.datasetId,
    datasetName: workspace.datasetName,
    investigationId: workspace.investigationId,
    savedAnalysis: workspace.savedAnalysis,
  }
}

type MobilePane = "chat" | "result"

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
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat")

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

  // Estado único da análise em edição — fonte de verdade do painel, das
  // abas SQL/Visual e do salvamento (reducer = escritor único).
  const [draft, dispatchDraft] = useReducer(
    analysisDraftReducer,
    undefined,
    createEmptyDraft
  )
  const presentation = draft.presentation
  const workspace: WorkspaceData | null = workspaceFromDraft(draft)

  const [restoreAnalysis, setRestoreAnalysis] = useState<Analysis | null>(null)
  const lastSqlRef = useRef("")
  // Identidade do último dado do agente aplicado ao draft (respostas
  // antigas nunca sobrescrevem solicitações mais novas).
  const appliedQueryRef = useRef<unknown>(null)
  const analysisLoadedRef = useRef(false)
  const restoreAppliedRef = useRef(false)
  const datasetIdLoadedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

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

  function datasetDatabase(dataset: DatasetListItem): number | null {
    return dataset.database?.id ?? null
  }

  /** Execução autorizada (Superset) — caminho único das abas SQL/preview. */
  async function runSql(dataset: DatasetListItem, sqlToExecute: string) {
    if (!sqlToExecute.trim()) return

    lastSqlRef.current = sqlToExecute
    dispatchDraft({ type: "running" })

    try {
      const response = await executeQuery({
        database_id: dataset.database.id,
        sql: sqlToExecute,
        db_schema: dataset.schema || undefined,
      })

      if (response.status === "error") {
        dispatchDraft({
          type: "error",
          message: response.message || "Erro ao executar a consulta.",
        })
      } else {
        const rows = response.data ?? []
        dispatchDraft({
          type: "result",
          data: {
            columns: rows.length > 0 ? Object.keys(rows[0]) : [],
            rows,
            rowCount: rows.length,
            truncated: false,
          },
          sql: sqlToExecute,
          meta: {
            source: "sql",
            databaseId: datasetDatabase(dataset),
            dbSchema: dataset.schema ?? null,
            datasetId: dataset.id,
            datasetName: dataset.table_name,
          },
        })
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Não foi possível executar a consulta."
      dispatchDraft({ type: "error", message: msg })
    }
  }

  async function runPreview(dataset: DatasetListItem) {
    let previewSql: string
    try {
      previewSql = generatePreviewSql(dataset.table_name)
    } catch (err) {
      dispatchDraft({
        type: "error",
        message:
          err instanceof Error ? err.message : "Erro ao gerar SQL de preview.",
      })
      return
    }

    setManualSql(previewSql)
    await runSql(dataset, previewSql)
  }

  async function handleSelectDataset(dataset: DatasetListItem) {
    if (!projectId) return
    abortAll()
    startNewSession()
    setSelectedDataset(dataset)
    dispatchDraft({ type: "reset" })
    setRestoreAnalysis(null)
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

  // Restauração de ?analysisId=: restaura config/apresentação e EXECUTA a
  // SQL pelo mecanismo autorizado para repovoar os dados da prévia.
  useEffect(() => {
    if (!restoreAnalysis || loadingDatasets || restoreAppliedRef.current) {
      return
    }

    const analysis = restoreAnalysis
    restoreAppliedRef.current = true

    requestAnimationFrame(() => {
      const restoredPresentation = presentationFromAnalysis(analysis)
      const match =
        datasets.find((ds) => ds.database.id === analysis.databaseId) ?? null

      dispatchDraft({
        type: "restore",
        analysisId: analysis.id,
        config: configFromPresentation(restoredPresentation, analysis.sql ?? ""),
        presentation: restoredPresentation,
        meta: {
          source: "sql",
          databaseId: analysis.databaseId,
          dbSchema: analysis.dbSchema,
          datasetId: analysis.datasetId,
          datasetName: match?.table_name ?? null,
          question: analysis.name,
        },
      })

      if (analysis.sql) {
        setManualSql(analysis.sql)
        setTab("sql")
      }

      if (match) {
        setSelectedDataset(match)
        void getDataset(match.id)
          .then((detail) => {
            const columns =
              (detail as unknown as { columns?: DatasetColumn[] }).columns ?? []
            setDatasetColumns(columns)
          })
          .catch(() => setDatasetColumns(match.columns ?? []))
        if (analysis.sql) {
          void runSql(match, analysis.sql)
        }
      }
    })
  }, [restoreAnalysis, loadingDatasets, datasets])

  async function handleExecuteQuery(sqlToExecute: string) {
    if (!selectedDataset || !sqlToExecute.trim()) return
    await runSql(selectedDataset, sqlToExecute)
  }

  function handleSqlExecute() {
    void handleExecuteQuery(manualSql)
  }

  function handleAsk(text: string) {
    if (!selectedDataset) return
    setComposerText("")
    dispatchDraft({ type: "clear-error" })
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
    if (next === "sql" && draft.sql) {
      setManualSql(draft.sql)
    }
  }

  function handleEditVisual() {
    setTab("visual")
  }

  function handleNewChatSession() {
    startNewSession()
    setTab("ai")
    setMobilePane("chat")
    dispatchDraft({ type: "reset" })
    setComposerText("")
    setManualSql("")
    appliedQueryRef.current = null
  }

  async function handleSelectChatSession(session: AISession) {
    if (!selectedDataset) return
    setLoadingChatSession(true)
    setTab("ai")
    setMobilePane("chat")
    dispatchDraft({ type: "reset" })
    setComposerText("")
    appliedQueryRef.current = null
    try {
      await loadSession(session.id, selectedDataset)
    } catch (err) {
      dispatchDraft({
        type: "error",
        message:
          err instanceof ApiError
            ? err.detail
            : "Não foi possível carregar esta sessão.",
      })
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

  // Último resultado do agente → draft. Identidade do objeto de dados
  // guardada contra respostas antigas sobrescrevendo em novas solicitações.
  useEffect(() => {
    const inv = [...investigations].reverse().find((i) => i.queryData)
    if (!inv || !inv.queryData) return
    const queryData = inv.queryData
    const frame = requestAnimationFrame(() => {
      if (appliedQueryRef.current !== queryData) {
        appliedQueryRef.current = queryData
        const dataset =
          datasets.find((item) => item.id === inv.datasetId) ?? null
        const meta = metaFromInvestigation(inv, dataset)
        if (inv.previewConfig) {
          dispatchDraft({
            type: "preview",
            config: inv.previewConfig,
            data: queryData,
            meta,
          })
        } else {
          dispatchDraft({
            type: "result",
            data: queryData,
            sql: inv.sql,
            meta,
          })
        }
        return
      }
      dispatchDraft({
        type: "meta",
        meta: {
          insight: inv.insight || null,
          savedAnalysis: inv.savedAnalysis,
          investigationId: inv.id,
          source: "agent",
        },
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [investigations, datasets])

  function handleAnalysisSaved(analysis: Analysis) {
    // Identidade preservada: próximos salvamentos atualizam em vez de duplicar.
    setRestoreAnalysis(analysis)
    dispatchDraft({ type: "saved", analysisId: analysis.id })
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

  const NEAR_BOTTOM_PX = 80

  const scrollChatToBottom = useCallback(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    nearBottomRef.current = true
  }, [])

  function handleChatScroll() {
    const el = chatScrollRef.current
    if (!el) return
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
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
    if (tab !== "ai") return
    if (isNewTurn) {
      scrollChatToBottom()
    } else if (finishedStreaming && nearBottomRef.current) {
      scrollChatToBottom()
    }
  }, [chatCursor, tab, scrollChatToBottom])

  // Acompanha o streaming token a token, sem puxar quem lê o histórico.
  const streamingInsightLength =
    investigations.find((inv) => inv.status === "streaming")?.insight.length ??
    0
  useEffect(() => {
    if (tab !== "ai" || streamingInsightLength === 0) return
    if (nearBottomRef.current) scrollChatToBottom()
  }, [streamingInsightLength, tab, scrollChatToBottom])

  // Volta para a aba Agente IA (container remonta no fim) ou retoma sessão.
  useEffect(() => {
    if (tab === "ai") scrollChatToBottom()
  }, [tab, scrollChatToBottom])
  useEffect(() => {
    if (loadingChatSession) return
    scrollChatToBottom()
  }, [loadingChatSession, scrollChatToBottom])

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

  const panelStreaming = panelInv?.status === "streaming" || draft.executing
  const panelStatusText =
    panelInv?.status === "streaming"
      ? agentStatusText(panelInv.currentTool)
      : draft.executing
        ? "Executando consulta..."
        : null
  const panelError = panelInv?.error ?? draft.error

  function handlePanelRetry() {
    if (panelInv && workspace?.source === "agent") {
      void retry(panelInv.id)
    } else if (selectedDataset && lastSqlRef.current) {
      void runSql(selectedDataset, lastSqlRef.current)
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

  const agentInput = (
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
  )

  const previewPanel = (
    <PreviewPanel
      workspace={workspace}
      presentation={presentation}
      onPresentationChange={(next) =>
        dispatchDraft({ type: "patch-presentation", presentation: next })
      }
      filters={presentation.filters}
      streaming={panelStreaming}
      statusText={panelStatusText}
      error={panelError}
      pendingConfirmation={panelInv?.pendingConfirmation ?? null}
      onRetry={handlePanelRetry}
      onAbort={handlePanelAbort}
      onConfirm={handlePanelConfirm}
      onDismiss={handlePanelDismiss}
      projectId={projectId}
      editingAnalysis={restoreAnalysis}
      onAnalysisSaved={handleAnalysisSaved}
      onDatasetPublished={(id) => void handleDatasetPublished(id)}
      onEditVisual={handleEditVisual}
      showInsight={tab !== "ai"}
    />
  )

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
      right={tab === "ai" ? previewPanel : undefined}
    >
      <ContextHeader
        datasetName={
          selectedDataset ? selectedDataset.table_name : null
        }
        loading={loadingDatasets}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-6">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <ExplorationTabs
            active={tab}
            onChange={handleTabChange}
            visualDisabled={hydratedReady && draft.data === null}
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
          {tab === "ai" && (
            <div
              className="ml-auto inline-flex rounded-lg border border-border bg-muted p-0.5 xl:hidden"
              role="group"
              aria-label="Alternar entre conversa e resultado"
            >
              {(
                [
                  { id: "chat", label: "Conversa" },
                  { id: "result", label: "Resultado" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mobilePane === option.id}
                  onClick={() => setMobilePane(option.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    mobilePane === option.id
                      ? "bg-card text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === "ai" && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              mobilePane === "result" && "hidden xl:flex"
            )}
          >
            {investigations.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-6 pb-24">
                <div className="my-auto w-full max-w-2xl">{agentInput}</div>
              </div>
            ) : (
              <>
                <div
                  ref={chatScrollRef}
                  onScroll={handleChatScroll}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
                >
                  <div className="divide-y divide-border">
                    {investigations.map((inv) => (
                      <InvestigationBlock
                        key={inv.id}
                        investigation={inv}
                        onRetry={() => void retry(inv.id)}
                        onAbort={() => abort(inv.id)}
                      />
                    ))}
                  </div>
                </div>
                <div className="z-20 shrink-0 border-t border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
                  <div className="mx-auto w-full max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                    {agentInput}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "ai" && mobilePane === "result" && (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin xl:hidden">
            {previewPanel}
          </div>
        )}

        {tab === "sql" && (
          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain scrollbar-thin">
            <SqlInput
              sql={manualSql}
              onSqlChange={setManualSql}
              onExecute={handleSqlExecute}
              executing={draft.executing}
              disabled={!selectedDataset}
              hasDataset={selectedDataset !== null}
              datasets={datasets}
              columns={datasetColumns}
            />
            {previewPanel}
          </div>
        )}

        {tab === "visual" && (
          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain scrollbar-thin">
            <VisualInput
              workspace={workspace}
              presentation={presentation}
              onPresentationChange={(next) =>
                dispatchDraft({ type: "patch-presentation", presentation: next })
              }
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
                  onPresentationChange={(next) =>
                    dispatchDraft({
                      type: "patch-presentation",
                      presentation: next,
                    })
                  }
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
