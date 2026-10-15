"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api"
import {
  getSourceDatasets,
  listSources,
  type SourceListItem,
} from "@/lib/api/sources"

/** Dataset publicado de uma fonte (resposta de getSourceDatasets). */
export interface SourceDataset {
  id: number
  table_name: string
  schema: string
  description?: string | null
}

interface SourceDatasetsResponse {
  count?: number
  result?: SourceDataset[]
}

export interface UseProjectSourcesResult {
  /** Fontes do projeto — escopadas por projectId (nunca a lista global). */
  sources: SourceListItem[]
  loading: boolean
  error: string | null
  /** Fonte com datasets abertos — expand único (estado levantado). */
  expandedSourceId: number | null
  datasets: SourceDataset[]
  datasetsLoading: boolean
  datasetsError: string | null
  /** Abre/fecha a fonte; ao abrir, busca seus datasets publicados. */
  toggleSource: (sourceId: number) => void
  reload: () => void
}

/**
 * Fontes de dados do projeto para o painel esquerdo do workspace:
 * `listSources(projectId)` + datasets da fonte via `getSourceDatasets`
 * sob demanda. Um único source fica expandido por vez; uma resposta
 * atrasada de outro source é ignorada (guarda por identidade).
 */
export function useProjectSources(
  projectId: string | null
): UseProjectSourcesResult {
  // Estado versionado: loading/error derivam da chave — sem setState síncrono
  // no corpo do effect (padrão do engine de exploração).
  const [sourcesState, setSourcesState] = useState<{
    key: string
    items: SourceListItem[]
    loading: boolean
    error: string | null
  }>(() => ({
    key: projectId ?? "",
    items: [],
    loading: Boolean(projectId),
    error: null,
  }))
  const [reloadKey, setReloadKey] = useState(0)

  const [expandedSourceId, setExpandedSourceId] = useState<number | null>(null)
  const [datasets, setDatasets] = useState<SourceDataset[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)
  const [datasetsError, setDatasetsError] = useState<string | null>(null)

  const datasetsRequestRef = useRef(0)
  const sourcesKey = `${projectId ?? ""}#${reloadKey}`

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    listSources(projectId)
      .then((data) => {
        if (cancelled) return
        setSourcesState({
          key: sourcesKey,
          items: data.result ?? [],
          loading: false,
          error: null,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setSourcesState({
          key: sourcesKey,
          items: [],
          loading: false,
          error:
            err instanceof ApiError ? err.detail : "Erro ao carregar fontes.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [projectId, sourcesKey])

  const loadDatasets = useCallback(async (sourceId: number) => {
    const requestId = ++datasetsRequestRef.current
    setDatasetsLoading(true)
    setDatasetsError(null)
    setDatasets([])
    try {
      const data = (await getSourceDatasets(sourceId)) as SourceDatasetsResponse
      if (datasetsRequestRef.current !== requestId) return
      setDatasets(data.result ?? [])
    } catch (err) {
      if (datasetsRequestRef.current !== requestId) return
      setDatasets([])
      setDatasetsError(
        err instanceof ApiError ? err.detail : "Erro ao carregar datasets."
      )
    } finally {
      if (datasetsRequestRef.current === requestId) setDatasetsLoading(false)
    }
  }, [])

  const toggleSource = useCallback(
    (sourceId: number) => {
      if (expandedSourceId === sourceId) {
        // Fecha: invalida qualquer busca em andamento.
        datasetsRequestRef.current += 1
        setExpandedSourceId(null)
        setDatasets([])
        setDatasetsLoading(false)
        setDatasetsError(null)
        return
      }
      setExpandedSourceId(sourceId)
      void loadDatasets(sourceId)
    },
    [expandedSourceId, loadDatasets]
  )

  const reload = useCallback(() => {
    setExpandedSourceId(null)
    setDatasets([])
    setDatasetsLoading(false)
    setDatasetsError(null)
    setReloadKey((key) => key + 1)
  }, [])

  const current =
    sourcesState.key === sourcesKey
      ? sourcesState
      : { key: sourcesKey, items: [], loading: Boolean(projectId), error: null }

  return {
    sources: current.items,
    loading: current.loading,
    error: current.error,
    expandedSourceId,
    datasets,
    datasetsLoading,
    datasetsError,
    toggleSource,
    reload,
  }
}
