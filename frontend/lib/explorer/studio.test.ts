import { describe, expect, it } from "vitest"
import {
  createEmptyStudio,
  defaultStudioTitle,
  studioReducer,
  type StudioState,
} from "./studio"
import { presentationFromRows, type WorkspaceData } from "./workspace"

function workspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    rows: [{ municipio: "A", total: 1 }],
    rowCount: 1,
    truncated: false,
    sql: "select 1",
    source: "agent",
    ...overrides,
  }
}

function pinAction(ws: WorkspaceData, title?: string) {
  return {
    type: "pin" as const,
    workspace: ws,
    presentation: presentationFromRows(ws.rows),
    ...(title !== undefined ? { title } : {}),
  }
}

describe("defaultStudioTitle", () => {
  it("prefere a pergunta do agente", () => {
    expect(
      defaultStudioTitle(workspace({ question: "Qual o total?", datasetName: "vendas" }))
    ).toBe("Qual o total?")
  })

  it("usa o dataset quando não há pergunta", () => {
    expect(defaultStudioTitle(workspace({ datasetName: "vendas" }))).toBe("vendas")
  })

  it("sem dados exibíveis usa rótulo neutro", () => {
    expect(defaultStudioTitle(workspace())).toBe("Resultado sem título")
  })
})

describe("studioReducer", () => {
  it("pin cria item mais recente primeiro com título derivado", () => {
    const state = studioReducer(
      createEmptyStudio(),
      pinAction(workspace({ question: "Primeira" }))
    )
    const next = studioReducer(state, pinAction(workspace({ question: "Segunda" })))

    expect(next.items).toHaveLength(2)
    expect(next.items[0].title).toBe("Segunda")
    expect(next.items[1].title).toBe("Primeira")
    expect(next.items[0].id).not.toBe(next.items[1].id)
    expect(next.items[0].savedAnalysisId).toBeNull()
  })

  it("pin aceita título explícito e preserva savedAnalysis existente", () => {
    const state = studioReducer(
      createEmptyStudio(),
      pinAction(
        workspace({ question: "Q", savedAnalysis: { analysisId: "a-1", name: "Análise" } }),
        "  Meu título  "
      )
    )
    expect(state.items[0].title).toBe("Meu título")
    expect(state.items[0].savedAnalysisId).toBe("a-1")
  })

  it("update-presentation altera apenas o item alvo (fixados nunca reescritos)", () => {
    const initial = studioReducer(
      createEmptyStudio(),
      pinAction(workspace({ question: "A" }))
    )
    const state = studioReducer(initial, pinAction(workspace({ question: "B" })))
    const [target, other] = state.items
    const presentation = presentationFromRows([{ x: 1 }])

    const next = studioReducer(state, {
      type: "update-presentation",
      id: target.id,
      presentation,
    })

    expect(next.items[0].presentation).toBe(presentation)
    expect(next.items[1]).toBe(other)
    expect(next.items[1].presentation).toEqual(initial.items[0].presentation)
  })

  it("update-presentation com id desconhecido devolve o mesmo estado", () => {
    const state = studioReducer(createEmptyStudio(), pinAction(workspace()))
    expect(
      studioReducer(state, {
        type: "update-presentation",
        id: "inexistente",
        presentation: presentationFromRows([]),
      })
    ).toBe(state)
  })

  it("saved registra o id da análise salva", () => {
    const state = studioReducer(createEmptyStudio(), pinAction(workspace()))
    const next = studioReducer(state, {
      type: "saved",
      id: state.items[0].id,
      analysisId: "a-42",
    })
    expect(next.items[0].savedAnalysisId).toBe("a-42")
    expect(state.items[0].savedAnalysisId).toBeNull()
  })

  it("remove e clear limpam itens sem tocar em IDs de outros", () => {
    let state = studioReducer(createEmptyStudio(), pinAction(workspace({ question: "A" })))
    state = studioReducer(state, pinAction(workspace({ question: "B" })))
    const keepId = state.items[1].id

    const removed = studioReducer(state, { type: "remove", id: state.items[0].id })
    expect(removed.items.map((item) => item.id)).toEqual([keepId])

    const cleared = studioReducer(removed, { type: "clear" })
    expect(cleared.items).toEqual([])
    expect(removed.items).toHaveLength(1)
  })

  it("estado original nunca é mutado", () => {
    const state: StudioState = studioReducer(
      createEmptyStudio(),
      pinAction(workspace())
    )
    studioReducer(state, { type: "remove", id: state.items[0].id })
    studioReducer(state, { type: "clear" })
    studioReducer(state, {
      type: "saved",
      id: state.items[0].id,
      analysisId: "x",
    })
    expect(state.items).toHaveLength(1)
    expect(state.items[0].savedAnalysisId).toBeNull()
  })
})
