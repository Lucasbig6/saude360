"use client"

import { StudioItemCard } from "./studio-item"
import type { StudioState } from "@/lib/explorer/studio"
import type { PresentationState } from "@/lib/explorer/workspace"
import type { Analysis } from "@/lib/types/analysis"

interface WorkspaceStudioProps {
  projectId: string
  studio: StudioState
  onRemove: (id: string) => void
  onPresentationChange: (id: string, presentation: PresentationState) => void
  onAnalysisSaved: (id: string, analysis: Analysis) => void
  onDatasetPublished: (datasetId: number) => void
}

/**
 * Coleção sob demanda de resultados fixados para comparação. O resultado
 * corrente permanece no turno da investigação que o produziu.
 */
export function WorkspaceStudio({
  projectId,
  studio,
  onRemove,
  onPresentationChange,
  onAnalysisSaved,
  onDatasetPublished,
}: WorkspaceStudioProps) {
  return (
    <section className="h-full overflow-y-auto px-4 py-4">
      <h2 className="mb-4 text-sm font-semibold text-foreground">
        Resultados fixados
      </h2>
      {studio.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum resultado fixado.</p>
      ) : (
        <div className="space-y-3">
          {studio.items.map((item) => (
            <StudioItemCard
              key={item.id}
              item={item}
              projectId={projectId}
              onRemove={onRemove}
              onPresentationChange={onPresentationChange}
              onAnalysisSaved={onAnalysisSaved}
              onDatasetPublished={onDatasetPublished}
            />
          ))}
        </div>
      )}
    </section>
  )
}
