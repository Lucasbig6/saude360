"use client"

import { ReactNode } from "react"
import { Pin, Table2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ContextHeader } from "./context-header"
import { ExplorationTabs } from "./exploration-tabs"
import { AgentInput, SqlInput, VisualInput } from "./exploration-input"
import { ChatSessionHistory } from "./chat-session-history"
import { InvestigationBlock } from "./investigation-block"
import { ExplorationEmptyState } from "./exploration-empty-state"
import { AgentViz } from "./agent-viz"
import { datasetDisplayName } from "@/lib/api/datasets"
import type { ExplorationEngine } from "@/hooks/use-exploration-engine"
import type { WorkspaceData, PresentationState } from "@/lib/explorer/workspace"

interface ExplorationCenterProps {
  engine: ExplorationEngine
  sourcesContent?: ReactNode
  onPinResult?: (workspace: WorkspaceData, presentation: PresentationState) => void
  pinnedContent?: ReactNode
  pinnedCount?: number
  /** Prévia do draft compartilhado para os modos SQL e Visual. */
  preview: ReactNode
}

/**
 * Coluna central da bancada de exploração: cabeçalho da fonte, abas
 * Agente IA · SQL · Visual, conversa persistente e entrada de dados.
 * Compartilhada entre a página `/explorar` e o workspace do projeto.
 */
export function ExplorationCenter({
  engine,
  sourcesContent,
  onPinResult,
  pinnedContent,
  pinnedCount = 0,
  preview,
}: ExplorationCenterProps) {
  const {
    hydratedReady,
    datasets,
    projectId,
    loadingDatasets,
    datasetsError,
    selectedDataset,
    datasetColumns,
    tab,
    handleTabChange,
    manualSql,
    setManualSql,
    composerText,
    setComposerText,
    draft,
    presentation,
    workspace,
    investigations,
    activeSessionId,
    agentBusy,
    chatSessions,
    loadingChatSessions,
    loadingChatSession,
    handleAsk,
    handleAskSql,
    handleSqlExecute,
    handleNewChatSession,
    handleSelectChatSession,
    handleDeleteChatSession,
    retryInvestigation,
    abortInvestigation,
    chatScrollRef,
    handleChatScroll,
    previewProps,
  } = engine

  const onPresentationChange = previewProps.onPresentationChange

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

  return (
    <>
      <ContextHeader
        datasetName={selectedDataset ? datasetDisplayName(selectedDataset) : null}
        loading={loadingDatasets}
      />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col px-4 py-4 sm:px-6">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border pb-3">
          {sourcesContent && (
            <Sheet>
              <SheetTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted md:hidden">
                <Table2 size={14} />
                Fontes
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetTitle className="sr-only">Fontes do projeto</SheetTitle>
                <div className="h-full overflow-y-auto">{sourcesContent}</div>
              </SheetContent>
            </Sheet>
          )}
          <ExplorationTabs
            active={tab}
            onChange={handleTabChange}
            visualDisabled={hydratedReady && draft.data === null}
          />
          <ChatSessionHistory
            sessions={chatSessions}
            activeSessionId={activeSessionId}
            loading={loadingChatSessions}
            disabled={
              !hydratedReady || !selectedDataset || agentBusy || loadingChatSession
            }
            onNewSession={handleNewChatSession}
            onSelectSession={(session) => void handleSelectChatSession(session)}
            onDeleteSession={(session) => void handleDeleteChatSession(session)}
          />
          {pinnedContent && pinnedCount > 0 && (
            <Sheet>
              <SheetTrigger className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <Pin size={13} />
                Fixados <span className="tabular-nums">{pinnedCount}</span>
              </SheetTrigger>
              <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
                <SheetTitle className="sr-only">Resultados fixados</SheetTitle>
                {pinnedContent}
              </SheetContent>
            </Sheet>
          )}
        </div>

        {tab === "ai" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {!selectedDataset && !loadingDatasets && investigations.length === 0 ? (
              <ExplorationEmptyState
                datasetsError={datasetsError}
                hasDatasets={datasets.length > 0}
              />
            ) : investigations.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-6 pb-24">
                <div className="my-auto w-full max-w-3xl">{agentInput}</div>
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
                        projectId={projectId}
                        dataset={datasets.find((item) => item.id === inv.datasetId) ?? null}
                        onRetry={() => void retryInvestigation(inv.id)}
                        onAbort={() => abortInvestigation(inv.id)}
                        onAnalysisSaved={() => engine.refreshAnalyses()}
                        onDatasetPublished={(datasetId) => void engine.handleDatasetPublished(datasetId)}
                        onPinResult={onPinResult}
                      />
                    ))}
                  </div>
                </div>
                <div className="z-20 shrink-0 border-t border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
                  <div className="mx-auto w-full max-w-5xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                    {agentInput}
                  </div>
                </div>
              </>
            )}
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
            <div>{preview}</div>
          </div>
        )}

        {tab === "visual" && (
          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain scrollbar-thin">
            <VisualInput
              workspace={workspace}
              presentation={presentation}
              onPresentationChange={onPresentationChange}
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
                  onPresentationChange={onPresentationChange}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
