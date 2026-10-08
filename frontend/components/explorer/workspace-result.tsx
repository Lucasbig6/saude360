"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Check,
  CheckCircle,
  FileCode2,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AgentViz } from "./agent-viz"
import { CopilotMarkdown } from "@/components/dashboard/copilot-markdown"
import { SaveAnalysisDialog } from "./save-analysis-dialog"
import { PublishDatasetDialog } from "@/components/datasets/publish-dataset-dialog"
import { AddToDashboardDialog } from "@/components/dashboard/add-to-dashboard-dialog"
import { buildAnalysisPayload } from "@/lib/explorer/analysis-payload"
import type {
  PresentationState,
  WorkspaceData,
} from "@/lib/explorer/workspace"
import {
  createAnalysis,
  getAnalysis,
  updateAnalysis,
} from "@/lib/api/analyses"
import type { Analysis } from "@/lib/types/analysis"
import { publishDataset } from "@/lib/api/datasets"
import { ApiError } from "@/lib/api"

export interface WorkspaceTraceStep {
  toolCallId: string
  name: string
  status: "running" | "ok" | "error" | "denied" | "pending_confirmation"
}

interface WorkspaceResultProps {
  workspace: WorkspaceData
  presentation: PresentationState
  onPresentationChange: (presentation: PresentationState) => void
  projectId: string
  /** Agente executando (streaming sem resultado final ainda). */
  streaming: boolean
  statusText: string | null
  trace: WorkspaceTraceStep[]
  error: string | null
  onRetry: () => void
  onAbort: () => void
  pendingConfirmation: { toolCallId: string; name: string } | null
  onConfirm: () => void
  onDismissConfirmation: () => void
  /** Restauração via ?analysisId=: salvar atualiza em vez de duplicar. */
  editingAnalysis: Analysis | null
  onAnalysisSaved: (analysis: Analysis) => void
  onDatasetPublished: (datasetId: number) => void
  onEditVisual: () => void
  /**
   * Oculta a explicação em Markdown (a narrativa já aparece na conversa;
   * o painel mostra só a evidência).
   */
  hideExplanation?: boolean
}

const TRACE_LABELS: Record<string, string> = {
  get_dataset_schema: "Schema",
  get_column_values: "Valores",
  execute_query: "Consulta",
  create_analysis: "Salvamento",
}

/**
 * Objeto analítico do workspace: cabeçalho, visualização (AgentViz
 * controlado), insights calculados, explicação compacta da IA, SQL
 * expansível e ações para transformar o resultado em artefato reutilizável.
 */
export function WorkspaceResult({
  workspace,
  presentation,
  onPresentationChange,
  projectId,
  streaming,
  statusText,
  trace,
  error,
  onRetry,
  onAbort,
  pendingConfirmation,
  onConfirm,
  onDismissConfirmation,
  editingAnalysis,
  onAnalysisSaved,
  onDatasetPublished,
  onEditVisual,
  hideExplanation = false,
}: WorkspaceResultProps) {
  const [showSql, setShowSql] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const publishedIdRef = useRef<number | null>(null)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [dashboardAnalysis, setDashboardAnalysis] = useState<Analysis | null>(
    editingAnalysis
  )
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)

  const title =
    workspace.source === "agent" && workspace.question
      ? workspace.question
      : `Resultado de ${workspace.datasetName ?? "consulta"}`

  const subtitle = [
    workspace.datasetName,
    `${workspace.rowCount} linha(s)`,
    workspace.executionMs !== undefined
      ? `${workspace.executionMs} ms`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const savedForDashboard =
    dashboardAnalysis ?? editingAnalysis ?? null

  async function handleSave(
    name: string,
    description: string,
    selectedProjectId: string | null
  ) {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = buildAnalysisPayload({
        name,
        description,
        projectId: selectedProjectId,
        workspace,
        presentation,
      })
      const saved = editingAnalysis
        ? await updateAnalysis(editingAnalysis.id, payload)
        : await createAnalysis(payload)
      setDashboardAnalysis(saved)
      onAnalysisSaved(saved)
      setSaveOpen(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.detail : "Erro ao salvar a análise."
      )
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish(name: string, description: string) {
    if (!workspace.databaseId) {
      throw new Error("Fonte de dados sem database para publicar.")
    }
    // O diálogo exibe progresso/erro/sucesso; aqui só executa e guarda o
    // id para atualizar a lista de fontes no onSuccess.
    const published = await publishDataset({
      database_id: workspace.databaseId,
      sql: workspace.sql ?? "",
      db_schema: workspace.dbSchema ?? null,
      name,
      description: description || null,
    })
    publishedIdRef.current = published.id
  }

  async function handleAddToDashboard() {
    if (dashboardAnalysis) {
      setDashboardOpen(true)
      return
    }
    // Restauração via ?analysisId= já é uma análise completa.
    if (editingAnalysis) {
      setDashboardAnalysis(editingAnalysis)
      setDashboardOpen(true)
      return
    }
    const analysisId = workspace.savedAnalysis?.analysisId ?? null
    if (!analysisId) return
    setDashboardLoading(true)
    setDashboardError(null)
    try {
      const full = await getAnalysis(analysisId)
      if (!full) {
        setDashboardError("Análise salva não encontrada.")
        return
      }
      setDashboardAnalysis(full)
      setDashboardOpen(true)
    } catch (err) {
      setDashboardError(
        err instanceof ApiError
          ? err.detail
          : "Não foi possível carregar a análise salva."
      )
    } finally {
      setDashboardLoading(false)
    }
  }

  const canAddToDashboard =
    dashboardAnalysis != null ||
    editingAnalysis != null ||
    workspace.savedAnalysis != null

  return (
    <section aria-label="Resultado da investigação" className="mt-6">
      {/* Cabeçalho do objeto analítico */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          Resultado
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {/* Progresso do agente (antes do primeiro resultado) */}
      {streaming && workspace.rows.length === 0 && (
        <div role="status" className="mt-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {statusText ?? "Analisando..."}
          </p>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      )}

      {/* Etapas (discretas, durante e depois) */}
      {trace.length > 0 && (
        <ul
          className="mt-3 flex flex-wrap gap-1.5"
          aria-label="Etapas da investigação"
        >
          {trace.map((step) => (
            <li
              key={step.toolCallId}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
                step.status === "running"
                  ? "border-border bg-muted text-muted-foreground"
                  : step.status === "ok"
                    ? "border-border bg-card text-muted-foreground"
                    : "border-destructive/40 bg-card text-destructive"
              )}
            >
              {step.status === "running" && (
                <Loader2 size={11} className="animate-spin" />
              )}
              {step.status === "ok" && <Check size={11} />}
              {TRACE_LABELS[step.name] ?? step.name}
            </li>
          ))}
        </ul>
      )}

      {/* Visualização do resultado */}
      {workspace.rows.length > 0 && (
        <div className="mt-4 min-w-0">
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

      {/* Explicação da IA (Markdown com GFM: tabelas, código, listas) */}
      {!hideExplanation && workspace.source === "agent" && workspace.insight && (
        <div className="mt-4 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
          <CopilotMarkdown>{workspace.insight}</CopilotMarkdown>
        </div>
      )}

      {/* Erro + retry / interromper */}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-card px-4 py-3"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle size={14} />
            Não foi possível concluir.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
      {streaming && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onAbort}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Interromper
          </button>
        </div>
      )}

      {/* Confirmação de salvamento do agente */}
      {pendingConfirmation && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-primary/40 bg-card px-4 py-3"
        >
          <p className="text-sm font-medium text-foreground">
            O agente quer salvar esta investigação como análise. Confirmar?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={streaming}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              Confirmar e salvar
            </button>
            <button
              type="button"
              onClick={onDismissConfirmation}
              disabled={streaming}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Análise salva pelo agente */}
      {workspace.savedAnalysis && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle size={14} />
          Análise salva: {workspace.savedAnalysis.name} ·{" "}
          <Link
            href={`/projetos/${projectId}/analises/${workspace.savedAnalysis.analysisId}`}
            className="underline underline-offset-2"
          >
            Ver análise
          </Link>
        </p>
      )}

      {saveSuccess && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle size={14} />
          Análise salva com sucesso.
        </p>
      )}

      {/* Ações do resultado */}
      {workspace.rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowSql((value) => !value)}
            aria-expanded={showSql}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileCode2 size={13} />
            Ver SQL
          </button>
          <button
            type="button"
            onClick={onEditVisual}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Editar visual
          </button>
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors"
          >
            Salvar análise
          </button>
          <button
            type="button"
            onClick={handleAddToDashboard}
            disabled={dashboardLoading || !canAddToDashboard}
            title={
              canAddToDashboard
                ? "Adicionar ao painel"
                : "Salve a análise antes de adicioná-la a um painel"
            }
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dashboardLoading ? "Carregando..." : "Adicionar ao painel"}
          </button>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Publicar
          </button>
        </div>
      )}
      {dashboardError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {dashboardError}
        </p>
      )}

      {/* SQL expansível */}
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

      <SaveAnalysisDialog
        open={saveOpen}
        onOpenChange={(next) => {
          if (!next) setSaveError(null)
          setSaveOpen(next)
        }}
        onSave={handleSave}
        saving={saving}
        error={saveError}
        title="Salvar análise"
        dialogDescription="Dê um nome para esta análise para reutilizá-la depois."
        defaultProjectId={editingAnalysis?.projectId ?? projectId ?? null}
        initialName={editingAnalysis?.name ?? ""}
        initialDescription={editingAnalysis?.description ?? ""}
      />
      <PublishDatasetDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublish={handlePublish}
        onSuccess={() => {
          if (publishedIdRef.current != null) {
            onDatasetPublished(publishedIdRef.current)
            publishedIdRef.current = null
          }
        }}
      />
      <AddToDashboardDialog
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
        analysis={savedForDashboard}
      />
    </section>
  )
}
