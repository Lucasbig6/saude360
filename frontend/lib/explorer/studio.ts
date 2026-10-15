import type { PresentationState, WorkspaceData } from "./workspace"

/**
 * Item fixado no Estúdio — cópia autônoma do resultado no momento do pin.
 * Depois de fixado, o item NUNCA é sobrescrito por novas mensagens, novas
 * execuções ou nova sessão: só o próprio Estúdio altera seu estado
 * (apresentação editada no item, análise salva, remoção).
 */
export interface StudioItem {
  id: string
  createdAt: number
  title: string
  workspace: WorkspaceData
  presentation: PresentationState
  savedAnalysisId: string | null
}

export interface StudioState {
  /** Mais recente primeiro. */
  items: StudioItem[]
}

export type StudioAction =
  | {
      type: "pin"
      workspace: WorkspaceData
      presentation: PresentationState
      title?: string
    }
  | { type: "update-presentation"; id: string; presentation: PresentationState }
  | { type: "saved"; id: string; analysisId: string }
  | { type: "remove"; id: string }
  | { type: "clear" }

export function createEmptyStudio(): StudioState {
  return { items: [] }
}

function newStudioId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Título derivado do resultado — sem dados inventados. */
export function defaultStudioTitle(workspace: WorkspaceData): string {
  return (
    workspace.question?.trim() ||
    workspace.datasetName?.trim() ||
    "Resultado sem título"
  )
}

export function studioReducer(
  state: StudioState,
  action: StudioAction
): StudioState {
  switch (action.type) {
    case "pin": {
      const item: StudioItem = {
        id: newStudioId(),
        createdAt: Date.now(),
        title: action.title?.trim() || defaultStudioTitle(action.workspace),
        workspace: action.workspace,
        presentation: action.presentation,
        savedAnalysisId: action.workspace.savedAnalysis?.analysisId ?? null,
      }
      return { items: [item, ...state.items] }
    }

    case "update-presentation": {
      const index = state.items.findIndex((item) => item.id === action.id)
      if (index === -1) return state
      const items = state.items.slice()
      items[index] = { ...items[index], presentation: action.presentation }
      return { items }
    }

    case "saved": {
      const index = state.items.findIndex((item) => item.id === action.id)
      if (index === -1) return state
      const items = state.items.slice()
      items[index] = { ...items[index], savedAnalysisId: action.analysisId }
      return { items }
    }

    case "remove":
      if (!state.items.some((item) => item.id === action.id)) return state
      return { items: state.items.filter((item) => item.id !== action.id) }

    case "clear":
      if (state.items.length === 0) return state
      return createEmptyStudio()

    default:
      return state
  }
}
