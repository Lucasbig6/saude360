"use client"

import { useRef, useState } from "react"
import { CheckCircle, FileCode2, LayoutDashboard, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { SaveAnalysisDialog } from "./save-analysis-dialog"
import { PublishDatasetDialog } from "./publish-dataset-dialog"
import { AddToDashboardDialog } from "@/components/dashboard/add-to-dashboard-dialog"
import { buildAnalysisPayload } from "@/lib/explorer/analysis-payload"
import type { PresentationState, WorkspaceData } from "@/lib/explorer/workspace"
import {
  createAnalysis,
  getAnalysis,
  updateAnalysis,
} from "@/lib/api/analyses"
import type { Analysis } from "@/lib/types/analysis"
import { publishDataset } from "@/lib/api/datasets"
import { ApiError } from "@/lib/api"

export interface ResultActionsProps {
  workspace: WorkspaceData
  presentation: PresentationState
  projectId: string
  /** Restauração via ?analysisId=: salvar atualiza em vez de duplicar. */
  editingAnalysis: Analysis | null
  onAnalysisSaved: (analysis: Analysis) => void
  onDatasetPublished: (datasetId: number) => void
  onShowSql: () => void
  onEditVisual: () => void
  /** Compact mode for inline use in AI conversation. */
  compact?: boolean
}

export function ResultActions({
  workspace,
  presentation,
  projectId,
  editingAnalysis,
  onAnalysisSaved,
  onDatasetPublished,
  onShowSql,
  onEditVisual,
  compact = false,
}: ResultActionsProps) {
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
    <>
      {workspace.rows.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t border-border pt-3",
            compact ? "mt-3" : "mt-4"
          )}
        >
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors"
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
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dashboardLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <LayoutDashboard size={13} />
            )}
            {dashboardLoading ? "Carregando..." : "Adicionar ao painel"}
          </button>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Publicar
          </button>
          <button
            type="button"
            onClick={onShowSql}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileCode2 size={13} />
            Ver SQL
          </button>
          <button
            type="button"
            onClick={onEditVisual}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Editar visual
          </button>
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <CheckCircle size={13} />
              Salva
            </span>
          )}
        </div>
      )}
      {dashboardError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {dashboardError}
        </p>
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
        sql={workspace.sql ?? ""}
        databaseId={workspace.databaseId!}
        dbSchema={workspace.dbSchema ?? null}
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
    </>
  )
}
