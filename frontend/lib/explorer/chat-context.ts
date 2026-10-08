import type { Investigation } from "@/hooks/use-explorer-agent"

const MAX_TURNS = 3
const MAX_ROWS_SAMPLE = 3
const MAX_CELL_LENGTH = 60
const MAX_CONTEXT_LENGTH = 6000

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—"
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value)
  return text.length > MAX_CELL_LENGTH
    ? `${text.slice(0, MAX_CELL_LENGTH)}…`
    : text
}

/** Resumo de um turno anterior para injeção de contexto no prompt. */
export function summarizeTurn(inv: Investigation): string | null {
  if (!inv.queryData && !inv.sql && !inv.insight) return null
  const lines = [`Pergunta: ${inv.question}`]
  if (inv.sql) lines.push(`SQL executado: ${inv.sql}`)
  if (inv.queryData) {
    const { columns, rows, rowCount } = inv.queryData
    lines.push(
      `Resultado: ${rowCount} linha(s); colunas: ${columns.join(", ") || "—"}`
    )
    rows.slice(0, MAX_ROWS_SAMPLE).forEach((row, index) => {
      const cells = columns
        .map((column) => `${column}=${formatCell(row[column])}`)
        .join(", ")
      lines.push(`Amostra ${index + 1}: ${cells}`)
    })
  } else if (inv.insight) {
    lines.push(`Resposta: ${inv.insight.slice(0, 500)}`)
  }
  return lines.join("\n")
}

/**
 * Monta a pergunta com contexto da conversa (últimos turnos com resultado).
 * O backend abre 1 sessão por pergunta sem histórico — este bloco prefixado
 * é o que permite perguntas de acompanhamento ("agora separa por
 * município"). Puro e testável; nunca ultrapassa o limite da API (descarta
 * os turnos mais antigos até caber).
 */
export function buildPromptWithContext(
  question: string,
  previous: Investigation[]
): string {
  const withContent = previous.filter(
    (inv) => inv.status === "done" && inv.queryData !== null
  )
  let recent = withContent.slice(-MAX_TURNS)

  while (recent.length > 0) {
    const blocks = recent
      .map(summarizeTurn)
      .filter((block): block is string => block !== null)
    if (blocks.length === 0) return question
    const context = [
      "Contexto da conversa (turnos anteriores com a mesma fonte de dados):",
      ...blocks.map((block, index) => `--- Turno ${index + 1} ---\n${block}`),
      "--- Fim do contexto ---",
      "Leve o contexto em conta (ex.: filtros, dimensões e recortes já usados).",
      "Se a pergunta atual referenciar o resultado anterior, adapte a consulta.",
    ].join("\n")
    const prompt = `${context}\n\nPergunta atual: ${question}`
    if (prompt.length <= MAX_CONTEXT_LENGTH) return prompt
    recent = recent.slice(1)
  }
  return question
}

/** Marcador que separa o contexto injetado da pergunta real do usuário. */
const PROMPT_MARKER = "\n\nPergunta atual: "

/**
 * Texto a exibir na conversa: remove o bloco de contexto injetado (que é
 * apenas um detalhe de engenharia de prompt) e mostra só a pergunta real.
 */
export function displayQuestion(question: string): string {
  const index = question.lastIndexOf(PROMPT_MARKER)
  return index === -1 ? question : question.slice(index + PROMPT_MARKER.length)
}
