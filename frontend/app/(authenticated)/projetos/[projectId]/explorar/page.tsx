"use client"

import { Suspense, use, useEffect, useRef, useState } from "react"
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
import { HistoryDropdown } from "@/components/explorer/history-dropdown"
import { InvestigationBlock } from "@/components/explorer/investigation-block"
import { WorkspaceResult } from "@/components/explorer/workspace-result"
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
import type { Analysis } from "@/lib/types/analysis"
import {
  groupHistoryByDay,
  presentationFromRows,
  workspaceFromInvestigation,
  type HistoryEntry,
  type PresentationState,
  type WorkspaceData,
} from "@/lib/explorer/workspace"
import { presentationFromAnalysis } from "@/lib/explorer/analysis-payload"
import {
  buildPromptWithContext,
  displayQuestion,
} from "@/lib/explorer/chat-context"

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
  const searchParams = useSearchParams()
  const analysisId = searchParams.get("analysisId")
  const datasetIdParam = searchParams.get("datasetId")

  const [datasets, setDatasets] = useState<DatasetListItem[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [datasetsError, setDatasetsError] = useState<string | null>(null)

  const [selectedDataset, setSelectedDataset] = useState<DatasetListItem | null>(null)
  const [datasetColumns, setDatasetColumns] = useState<DatasetColumn[]>([])

  // Tabs: Agente IA e SQL investigam; Visual configura a apresentação do
  // resultado compartilhado. O resultado nunca some ao trocar de aba.
  const [tab, setTab] = useState<ExplorationTab>("ai")

  const [manualSql, setManualSql] = useState("")
  const [composerText, setComposerText] = useState("")
  const [analysesVersion, setAnalysesVersion] = useState(0)

  const {
    investigations,
    ask,
    retry,
    abort,
    abortAll,
    confirmPending,
    dismissPending,
  } = useExplorerAgent()

  // Navegação mobile (<xl): Conversa | Resultado.
  const [mobileView, setMobileView] = useState<"chat" | "result">("chat")

  // Workspace compartilhado (dados) + apresentação (visual). É o espelho do
  // resultado atual no painel direito: alimentado pela IA (último resultado),
  // pelo SQL, pelo histórico ou pelo "Editar visual" de um turno.
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [presentation, setPresentation] = useState<PresentationState>(() =>
    presentationFromRows([])
  )
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)

  const [restoreAnalysis, setRestoreAnalysis] = useState<Analysis | null>(null)
  /** Última SQL disparada — base do botão "Tentar novamente". */
  const lastSqlRef = useRef("")
  const analysisLoadedRef = useRef(false)
  const restoreAppliedRef = useRef(false)
  const datasetIdLoadedRef = useRef(false)
  const historyIdsRef = useRef(new Set<string>())
  const resultRef = useRef<HTMLDivElement>(null)
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
    // Troca de fonte invalida streams em andamento (sessão é por pergunta,
    // ancorada no dataset anterior) e limpa o workspace.
    abortAll()
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

  // 2) aplica a restauração quando análise e datasets estiverem resolvidos:
  // SQL no editor, apresentação restaurada, dataset selecionado.
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

  /** Nova pergunta com contexto da conversa injetado no prompt. */
  function handleAsk(text: string) {
    if (!selectedDataset) return
    const prompt = buildPromptWithContext(
      text,
      investigations.filter((inv) => inv.datasetId === selectedDataset.id)
    )
    setComposerText("")
    setRestoreAnalysis(null)
    setExecuteError(null)
    void ask(prompt, selectedDataset)
  }

  function handleAskSql(text: string) {
    if (!selectedDataset) return
    setComposerText("")
    void handleExecuteQuery(text)
  }

  function handleTabChange(next: ExplorationTab) {
    setTab(next)
    // Aba SQL mostra a consulta do resultado atual (agente ou manual),
    // editável e executável sobre o mesmo workspace.
    if (next === "sql" && workspace?.sql) {
      setManualSql(workspace.sql)
    }
  }

  function handleEditVisual() {
    setTab("visual")
    // No mobile a configuração do visual fica na coluna Conversa.
    setMobileView("chat")
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Investigações anteriores: espelha investigations (discreto, por dia).
  // setHistory com updater que devolve `prev` quando nada mudou — sem isso
  // cada token do streaming geraria um loop de renders.
  useEffect(() => {
    setHistory((prev) => {
      let changed = false
      const synced = prev.map((entry) => {
        const inv = investigations.find((item) => item.id === entry.id)
        if (!inv) return entry
        const hasResult = inv.queryData !== null
        if (entry.status !== inv.status || entry.hasResult !== hasResult) {
          changed = true
          return { ...entry, status: inv.status, hasResult }
        }
        return entry
      })
      const fresh = investigations.filter(
        (inv) => !historyIdsRef.current.has(inv.id)
      )
      if (fresh.length > 0) {
        changed = true
        const now = Date.now()
        fresh.forEach((inv) => historyIdsRef.current.add(inv.id))
        synced.push(
          ...fresh.map((inv) => ({
            id: inv.id,
            question: displayQuestion(inv.question),
            datasetId: inv.datasetId,
            datasetName: inv.datasetName,
            at: now,
            status: inv.status,
            hasResult: inv.queryData !== null,
          }))
        )
      }
      return changed ? synced : prev
    })
  }, [investigations])

  // Espelha o resultado mais recente do agente no painel Resultado.
  // Cada nova pergunta atualiza o painel; a conversa preserva a narrativa.
  // setStates adiados para o próximo frame (mesmo idioma dos efeitos de
  // restauração desta página).
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
        if (window.matchMedia("(max-width: 1279.5px)").matches) {
          setMobileView("result")
        }
        return
      }
      // Insight e salvamento fluem ao vivo sem resetar a apresentação.
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

  function handleRestoreHistory(entry: HistoryEntry) {
    const inv = investigations.find((item) => item.id === entry.id)
    if (!inv?.queryData) return
    const dataset = datasets.find((item) => item.id === inv.datasetId) ?? null
    if (dataset && dataset.id !== selectedDataset?.id) {
      setSelectedDataset(dataset)
      void getDataset(dataset.id)
        .then((detail) => {
          const columns =
            (detail as unknown as { columns?: DatasetColumn[] }).columns ?? []
          setDatasetColumns(columns)
        })
        .catch(() => setDatasetColumns(dataset.columns ?? []))
    }
    // Restaura como resultado corrente (para Visual/SQL) sem apagar a conversa.
    appliedQueryRef.current = inv.queryData
    applyWorkspace(workspaceFromInvestigation(inv, dataset))
    setMobileView("result")
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  function handleAnalysisSaved() {
    setAnalysesVersion((version) => version + 1)
  }

  // Análise salva pelo agente (create_analysis confirmada) atualiza o rail.
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

  // Rolagem da conversa: acompanha o início de um turno e a conclusão
  // (sem forçar a cada token para não roubar a leitura).
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

  const historyGroups = groupHistoryByDay(history)

  // Investigação que alimenta o painel Resultado: a do workspace atual, ou
  // a que estiver transmitindo (cada nova pergunta atualiza o resultado).
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

  const resultPanel = workspace ? (
    <WorkspaceResult
      workspace={workspace}
      presentation={presentation}
      onPresentationChange={setPresentation}
      projectId={projectId}
      streaming={panelStreaming}
      statusText={panelStatusText}
      trace={(panelInv?.toolTrace ?? []).map((step) => ({
        toolCallId: step.toolCallId,
        name: step.name,
        status: step.status,
      }))}
      error={panelError}
      onRetry={handlePanelRetry}
      onAbort={handlePanelAbort}
      pendingConfirmation={panelInv?.pendingConfirmation ?? null}
      onConfirm={handlePanelConfirm}
      onDismissConfirmation={handlePanelDismiss}
      editingAnalysis={restoreAnalysis}
      onAnalysisSaved={handleAnalysisSaved}
      onDatasetPublished={handleDatasetPublished}
      onEditVisual={handleEditVisual}
      hideExplanation={workspace.source === "agent" && tab === "ai"}
    />
  ) : panelStreaming || executeError ? (
    <WorkspaceResult
      workspace={{
        rows: [],
        rowCount: 0,
        truncated: false,
        sql: null,
        question: "Investigando...",
        source: "agent",
        datasetId: selectedDataset?.id ?? null,
        datasetName: selectedDataset?.table_name ?? null,
      }}
      presentation={presentation}
      onPresentationChange={setPresentation}
      projectId={projectId}
      streaming={panelStreaming}
      statusText={panelStatusText ?? "Analisando..."}
      trace={(panelInv?.toolTrace ?? []).map((step) => ({
        toolCallId: step.toolCallId,
        name: step.name,
        status: step.status,
      }))}
      error={executeError}
      onRetry={() => void handleExecuteQuery(lastSqlRef.current)}
      onAbort={handlePanelAbort}
      pendingConfirmation={null}
      onConfirm={() => {}}
      onDismissConfirmation={() => {}}
      editingAnalysis={restoreAnalysis}
      onAnalysisSaved={handleAnalysisSaved}
      onDatasetPublished={handleDatasetPublished}
      onEditVisual={handleEditVisual}
      hideExplanation
    />
  ) : (
    <div className="mx-5 mt-4 sm:mx-8 xl:mx-8 xl:mt-0 xl:py-5">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Resultado
      </p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Faça uma pergunta à IA ou execute uma consulta SQL para ver aqui o
        gráfico, a tabela e os insights da investigação atual.
      </p>
    </div>
  )

  return (
    <ExploreShell
      centerClassName={mobileView === "result" ? "hidden xl:block" : undefined}
      rightClassName={mobileView === "chat" ? "hidden xl:block" : undefined}
      header={
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/projetos/${projectId}`}
              aria-label="Voltar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft size={17} />
            </Link>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground sm:text-base">
                Explorar
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Ambiente de investigação de dados
              </p>
            </div>
          </div>
          <div
            className="inline-flex rounded-lg border border-border bg-muted p-0.5 xl:hidden"
            role="group"
            aria-label="Alternar entre conversa e resultado"
          >
            {(
              [
                { id: "chat", label: "Conversa" },
                { id: "result", label: "Resultado" },
              ] as const
            ).map((view) => (
              <button
                key={view.id}
                type="button"
                aria-pressed={mobileView === view.id}
                onClick={() => setMobileView(view.id)}
                className={
                  mobileView === view.id
                    ? "rounded-md bg-card px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border"
                    : "px-3 py-1.5 text-xs font-medium text-muted-foreground"
                }
              >
                {view.label}
              </button>
            ))}
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
        <div ref={resultRef} className="scroll-mt-4">
          {resultPanel}
        </div>
      }
    >
      <ContextHeader
        datasetName={
          selectedDataset ? selectedDataset.table_name : null
        }
        loading={loadingDatasets}
      />

      <div className="mx-auto w-full max-w-5xl px-5 py-5 sm:px-8">
        {/* Modos de uma mesma ferramenta */}
        <div className="flex flex-wrap items-center gap-3">
          <ExplorationTabs
            active={tab}
            onChange={handleTabChange}
            visualDisabled={workspace === null}
          />
          <div className="ml-auto min-w-0 max-w-full sm:max-w-64">
            <HistoryDropdown
              groups={historyGroups}
              currentId={lastInvestigation?.id ?? null}
              onSelect={handleRestoreHistory}
            />
          </div>
        </div>

        {/* Aba Agente IA: conversa com os dados + composer fixo */}
        {tab === "ai" && (
          <>
            {investigations.length === 0 ? (
              <div className="mx-auto mt-8 w-full max-w-2xl text-center">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Converse com seus dados
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Faça perguntas em linguagem natural, explore tendências,
                  compare indicadores e transforme resultados em análises.
                </p>
              </div>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {investigations.map((inv) => (
                  <InvestigationBlock
                    key={inv.id}
                    investigation={inv}
                    onRetry={() => void retry(inv.id)}
                    onAbort={() => abort(inv.id)}
                  />
                ))}
              </div>
            )}
            <div
              ref={chatEndRef}
              aria-hidden="true"
              className="h-1"
            />
            <div className="sticky bottom-0 z-10 -mx-5 border-t border-border bg-card/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-8 sm:px-8">
              <div className="mx-auto w-full max-w-3xl">
                <AgentInput
                  value={composerText}
                  onChange={setComposerText}
                  onAsk={handleAsk}
                  onAskSql={handleAskSql}
                  disabled={!selectedDataset}
                  busy={agentBusy}
                  hasDataset={selectedDataset !== null}
                  columns={datasetColumns}
                  hideSuggestions={investigations.length > 0}
                />
              </div>
            </div>
          </>
        )}

        {/* Entrada das abas SQL/Visual */}
        <div className="mt-5">
          {tab === "sql" && (
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
          )}
          {tab === "visual" && (
            <VisualInput
              workspace={workspace}
              presentation={presentation}
              onPresentationChange={setPresentation}
            />
          )}
        </div>
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
