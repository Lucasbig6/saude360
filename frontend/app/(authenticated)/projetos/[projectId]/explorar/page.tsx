"use client"

import { Suspense, use, useCallback, useReducer, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Hospital, LayoutDashboard, Loader2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import { ExploreShell } from "@/components/explorer/explore-shell"
import { ExplorationCenter } from "@/components/explorer/exploration-center"
import { PreviewPanel } from "@/components/explorer/preview-panel"
import { useExplorationEngine } from "@/hooks/use-exploration-engine"
import { useProjectSources } from "@/hooks/use-project-sources"
import { WorkspaceSourcesPanel } from "@/components/workspace/workspace-sources-panel"
import { WorkspaceStudio } from "@/components/workspace/workspace-studio"
import { datasetDisplayName } from "@/lib/api/datasets"
import { createEmptyStudio, studioReducer } from "@/lib/explorer/studio"
import type { PresentationState, WorkspaceData } from "@/lib/explorer/workspace"
import type { Analysis } from "@/lib/types/analysis"

function ExplorarContent({ projectId }: { projectId: string }) {
  const router = useRouter()
  const engine = useExplorationEngine({ projectId })
  const projectSources = useProjectSources(projectId)
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false)
  const [createPanelOpen, setCreatePanelOpen] = useState(false)
  const [studio, dispatchStudio] = useReducer(
    studioReducer,
    undefined,
    createEmptyStudio
  )
  const handlePinResult = useCallback(
    (workspace: WorkspaceData, presentation: PresentationState) => {
      if (workspace.rows.length === 0) return
      dispatchStudio({ type: "pin", workspace, presentation })
    },
    []
  )
  const preview = <PreviewPanel {...engine.previewProps} />
  const studioNode = (
    <WorkspaceStudio
      projectId={projectId}
      studio={studio}
      onRemove={(id) => dispatchStudio({ type: "remove", id })}
      onPresentationChange={(id, presentation) =>
        dispatchStudio({ type: "update-presentation", id, presentation })
      }
      onAnalysisSaved={(id, analysis: Analysis) => {
        dispatchStudio({ type: "saved", id, analysisId: analysis.id })
        engine.refreshAnalyses()
      }}
      onDatasetPublished={(datasetId) =>
        void engine.handleDatasetPublished(datasetId)
      }
    />
  )
  const selectDataset = (datasetId: number) => {
    void engine.handleSelectDatasetById(datasetId)
  }
  const sources = (
    <WorkspaceSourcesPanel
      projectId={projectId}
      projectName={engine.projectName ?? "Projeto"}
      selectedDatasetId={engine.selectedDataset?.id ?? null}
      selectedDatasetName={
        engine.selectedDataset ? datasetDisplayName(engine.selectedDataset) : null
      }
      selectedColumns={engine.datasetColumns}
      sources={projectSources.sources}
      sourcesLoading={projectSources.loading}
      sourcesError={projectSources.error}
      expandedSourceId={projectSources.expandedSourceId}
      datasets={projectSources.datasets}
      datasetsLoading={projectSources.datasetsLoading}
      datasetsError={projectSources.datasetsError}
      onToggleSource={projectSources.toggleSource}
      onSelectDatasetById={selectDataset}
      onCollapse={() => setSourcesCollapsed(true)}
      analyses={engine.analyses}
      analysesError={engine.analysesError}
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
            <ArrowLeft size={12} />
          </Link>
          <Hospital size={16} className="ml-2 text-primary" />
          <h1 className="min-w-2 flex-1 truncate text-sm font-semibold text-foreground ml-3">
            {engine.projectName ?? "Projeto"}
          </h1>
          <button
            type="button"
            onClick={() => setCreatePanelOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Novo painel</span>
            <span className="sm:hidden">Painel</span>
          </button>
          <Link
            href={`/projetos/${projectId}/paineis`}
            aria-label="Painéis do projeto"
            title="Painéis do projeto"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LayoutDashboard size={15} />
          </Link>
        </header>
      }
      left={sources}
      leftCollapsed={sourcesCollapsed}
      onToggleLeft={() => setSourcesCollapsed(false)}
    >
      <ExplorationCenter
        engine={engine}
        preview={preview}
        sourcesContent={sources}
        pinnedContent={studioNode}
        pinnedCount={studio.items.length}
        onPinResult={handlePinResult}
      />
      <CreateDashboardDialog
        open={createPanelOpen}
        onOpenChange={setCreatePanelOpen}
        projectId={projectId}
        onCreated={(dashboard) =>
          router.push(`/projetos/${projectId}/paineis/${dashboard.id}`)
        }
      />
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
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
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
