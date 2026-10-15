"use client"

import { useCallback, useReducer, useState } from "react"
import { useRouter } from "next/navigation"
import { CreateDashboardDialog } from "@/components/dashboard/create-dashboard-dialog"
import { ExploreShell } from "@/components/explorer/explore-shell"
import { ExplorationCenter } from "@/components/explorer/exploration-center"
import { PreviewPanel } from "@/components/explorer/preview-panel"
import { useExplorationEngine } from "@/hooks/use-exploration-engine"
import { useProjectSources } from "@/hooks/use-project-sources"
import {
  createEmptyStudio,
  studioReducer,
} from "@/lib/explorer/studio"
import { WorkspaceHeader } from "./workspace-header"
import { WorkspaceSourcesPanel } from "./workspace-sources-panel"
import { WorkspaceStudio } from "./workspace-studio"
import type { Project } from "@/lib/types/project"
import type { PresentationState, WorkspaceData } from "@/lib/explorer/workspace"
import type { Analysis } from "@/lib/types/analysis"

interface ProjectWorkspaceProps {
  project: Project
}

/**
 * Workspace contínuo do projeto: fontes recolhíveis, investigação e resultados
 * associados a cada turno; itens fixados ficam disponíveis sob demanda.
 */
export function ProjectWorkspace({ project }: ProjectWorkspaceProps) {
  const projectId = project.id
  const router = useRouter()
  const engine = useExplorationEngine({ projectId })
  const sources = useProjectSources(projectId)

  const [studio, dispatchStudio] = useReducer(
    studioReducer,
    undefined,
    createEmptyStudio
  )
  const [createPanelOpen, setCreatePanelOpen] = useState(false)
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false)

  const handlePinResult = useCallback(
    (workspace: WorkspaceData, presentation: PresentationState) => {
      if (workspace.rows.length === 0) return
      dispatchStudio({
        type: "pin",
        workspace,
        presentation,
      })
    },
    []
  )

  const studioNode = (
    <WorkspaceStudio
      projectId={projectId}
      studio={studio}
      onRemove={(id) => dispatchStudio({ type: "remove", id })}
      onPresentationChange={(id, presentation: PresentationState) =>
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

  const handleSelectDatasetById = useCallback(
    (datasetId: number) => {
      void engine.handleSelectDatasetById(datasetId)
    },
    [engine]
  )

  const sourcesPanel = (
    <WorkspaceSourcesPanel
      projectId={projectId}
      projectName={engine.projectName ?? project.name}
      selectedDatasetId={engine.selectedDataset?.id ?? null}
      selectedDatasetName={engine.selectedDataset?.table_name ?? null}
      selectedColumns={engine.datasetColumns}
      sources={sources.sources}
      sourcesLoading={sources.loading}
      sourcesError={sources.error}
      expandedSourceId={sources.expandedSourceId}
      datasets={sources.datasets}
      datasetsLoading={sources.datasetsLoading}
      datasetsError={sources.datasetsError}
      onToggleSource={sources.toggleSource}
      onSelectDatasetById={handleSelectDatasetById}
      analyses={engine.analyses}
      analysesError={engine.analysesError}
    />
  )

  const preview = <PreviewPanel {...engine.previewProps} />

  return (
    <ExploreShell
      header={
        <WorkspaceHeader
          project={project}
          onCreateDashboard={() => setCreatePanelOpen(true)}
        />
      }
      left={sourcesPanel}
      leftCollapsed={sourcesCollapsed}
    >
      <ExplorationCenter
        engine={engine}
        preview={preview}
        sourcesContent={sourcesPanel}
        sourcesCollapsed={sourcesCollapsed}
        onToggleSources={() => setSourcesCollapsed((collapsed) => !collapsed)}
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
