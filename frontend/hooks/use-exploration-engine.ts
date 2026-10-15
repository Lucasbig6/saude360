"use client"

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useSearchParams } from "next/navigation"
import { useExplorerAgent, type Investigation } from "./use-explorer-agent"
import {
  listDatasets,
  getDataset,
  type DatasetListItem,
  type DatasetColumn,
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
  type AnalysisDraft,
  type DraftMeta,
} from "@/lib/explorer/analysis-draft"
import { presentationFromAnalysis } from "@/lib/explorer/analysis-payload"
import { getProject } from "@/lib/api/projects"
import type { ExplorationTab } from "@/components/explorer/exploration-tabs"
import type { PreviewPanelProps } from "@/components/explorer/preview-panel"

const subscribeToHydration = () => () => {}
const getHydratedSnapshot = () => true
const getServerHydratedSnapshot = () => false

export type MobilePane = "chat" | "result"

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

export interface ExplorationEngine {
  projectId: string
  hydratedReady: boolean
  /** Datasets disponíveis (fonte de dados do rail/buscador). */
  datasets: DatasetListItem[]
  loadingDatasets: boolean
  datasetsError: string | null
  /** Fonte ativa da investigação. */
  selectedDataset: DatasetListItem | null
  datasetColumns: DatasetColumn[]
  projectName: string | null
  /** `null` = carregando. */
  analyses: Analysis[] | null
  analysesError: string | null
  tab: ExplorationTab
  handleTabChange: (next: ExplorationTab) => void
  mobilePane: MobilePane
  setMobilePane: (pane: MobilePane) => void
  manualSql: string
  setManualSql: (sql: string) => void
  composerText: string
  setComposerText: (text: string) => void
  /** Estado único da análise em edição (draft = escritor único do resultado). */
  draft: AnalysisDraft
  presentation: AnalysisDraft["presentation"]
  workspace: WorkspaceData | null
  restoreAnalysis: Analysis | null
  investigations: Investigation[]
  activeSessionId: string | null
  agentBusy: boolean
  chatSessions: AISession[]
  loadingChatSessions: boolean
  loadingChatSession: boolean
  handleSelectDataset: (dataset: DatasetListItem) => Promise<void>
  /** Seleciona pelo id (painel de fontes do workspace — carrega o detalhe). */
  handleSelectDatasetById: (datasetId: number) => Promise<void>
  handleAsk: (text: string) => void
  handleAskSql: (text: string) => void
  handleSqlExecute: () => void
  handleNewChatSession: () => void
  handleSelectChatSession: (session: AISession) => Promise<void>
  handleDeleteChatSession: (session: AISession) => Promise<void>
  handleAnalysisSaved: (analysis: Analysis) => void
  handleDatasetPublished: (publishedId?: number) => Promise<void>
  handleEditVisual: () => void
  /** Restaura uma análise do projeto na bancada (via ?analysisId ou painel). */
  openAnalysis: (analysisId: string) => void
  /** Invalida a lista de análises (rail/paneis). */
  refreshAnalyses: () => void
  retryInvestigation: (id: string) => void
  abortInvestigation: (id: string) => void
  /** Props prontas do PreviewPanel (prévia do resultado atual). */
  previewProps: PreviewPanelProps
  chatScrollRef: { current: HTMLDivElement | null }
  handleChatScroll: () => void
}

/**
 * Núcleo compartilhado de exploração (Agente IA · SQL · Visual).
 * Extraído da página do Explorar para ser embarcado também no
 * workspace do projeto — a página vira casca fina sobre este hook.
 */
export function useExplorationEngine({
  projectId,
}: {
  projectId: string
}): ExplorationEngine {
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

  const [selectedDataset, setSelectedDataset] =
    useState<DatasetListItem | null>(null)
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
      (chatSessionState?.datasetId !== selectedDataset.id ||
        chatSessionState.loading)
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
          err instanceof ApiError ? err.detail : "Erro ao carregar datasets."
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

  /** Troca de fonte: aborta streams, zera sessão/draft e roda o preview. */
  async function applySelectedDataset(
    dataset: DatasetListItem,
    columns: DatasetColumn[]
  ) {
    abortAll()
    startNewSession()
    setSelectedDataset(dataset)
    dispatchDraft({ type: "reset" })
    setRestoreAnalysis(null)
    setManualSql("")
    setDatasetColumns(columns)
    await runPreview(dataset)
  }

  async function handleSelectDataset(dataset: DatasetListItem) {
    if (!projectId) return
    let columns = dataset.columns ?? []
    try {
      const detail = await getDataset(dataset.id)
      columns = detail.columns ?? columns
    } catch {
      columns = dataset.columns ?? []
    }
    await applySelectedDataset(dataset, columns)
  }

  async function handleSelectDatasetById(datasetId: number) {
    if (!projectId) return
    try {
      const detail = await getDataset(datasetId)
      await applySelectedDataset(detail, detail.columns ?? [])
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Erro ao carregar o dataset."
      setDatasetsError(msg)
    }
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

  /** Carrega e restaura uma análise do projeto na bancada. */
  function openAnalysis(nextAnalysisId: string) {
    if (!projectId) return
    getAnalysis(nextAnalysisId)
      .then((value) => {
        if (value?.projectId === projectId) {
          restoreAppliedRef.current = false
          setRestoreAnalysis(value)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!projectId || !analysisId || analysisLoadedRef.current) return
    analysisLoadedRef.current = true
    openAnalysis(analysisId)
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

  function refreshAnalyses() {
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

  const previewProps: PreviewPanelProps = {
    workspace,
    presentation,
    onPresentationChange: (next) =>
      dispatchDraft({ type: "patch-presentation", presentation: next }),
    filters: presentation.filters,
    streaming: panelStreaming,
    statusText: panelStatusText,
    error: panelError,
    pendingConfirmation: panelInv?.pendingConfirmation ?? null,
    onRetry: handlePanelRetry,
    onAbort: handlePanelAbort,
    onConfirm: handlePanelConfirm,
    onDismiss: handlePanelDismiss,
    projectId,
    editingAnalysis: restoreAnalysis,
    onAnalysisSaved: handleAnalysisSaved,
    onDatasetPublished: (id) => void handleDatasetPublished(id),
    onEditVisual: handleEditVisual,
    showInsight: tab !== "ai",
  }

  return {
    projectId,
    hydratedReady,
    datasets,
    loadingDatasets,
    datasetsError,
    selectedDataset,
    datasetColumns,
    projectName,
    analyses,
    analysesError,
    tab,
    handleTabChange,
    mobilePane,
    setMobilePane,
    manualSql,
    setManualSql,
    composerText,
    setComposerText,
    draft,
    presentation,
    workspace,
    restoreAnalysis,
    investigations,
    activeSessionId,
    agentBusy,
    chatSessions,
    loadingChatSessions,
    loadingChatSession,
    handleSelectDataset,
    handleSelectDatasetById,
    handleAsk,
    handleAskSql,
    handleSqlExecute,
    handleNewChatSession,
    handleSelectChatSession,
    handleDeleteChatSession,
    handleAnalysisSaved,
    handleDatasetPublished,
    handleEditVisual,
    openAnalysis,
    refreshAnalyses,
    retryInvestigation: retry,
    abortInvestigation: abort,
    previewProps,
    chatScrollRef,
    handleChatScroll,
  }
}
