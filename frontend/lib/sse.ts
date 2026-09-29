/**
 * Parser de SSE (Server-Sent Events) consumido pelo Copiloto.
 *
 * O backend envia `event: <tipo>\n data: {json}\n\n` por evento. Este módulo
 * não conhece o domínio: apenas separa blocos e devolve `{ event, data }`.
 */

export interface SSEMessage {
  event: string
  data: unknown
}

interface Decoder {
  push(chunk: string): SSEMessage[]
  flush(): SSEMessage[]
}

function parseBlock(block: string): SSEMessage | null {
  if (!block.trim()) return null

  let event = "message"
  const dataLines: string[] = []

  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "")
    if (!line) continue
    const separator = line.indexOf(":")
    if (separator === -1) continue
    const field = line.slice(0, separator)
    let value = line.slice(separator + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "event") event = value
    else if (field === "data") dataLines.push(value)
  }

  if (dataLines.length === 0) return null

  const raw = dataLines.join("\n")
  let data: unknown = raw
  try {
    data = JSON.parse(raw)
  } catch {
    // mantém a string crua quando o payload não é JSON
  }
  return { event, data }
}

/**
 * Decoder incremental: aceita chunks de qualquer tamanho (inclusive no meio
 * de uma linha) e emite os blocos completos.
 */
export function createSSEDecoder(): Decoder {
  let buffer = ""

  function drain(final: boolean): SSEMessage[] {
    const messages: SSEMessage[] = []
    let index = buffer.indexOf("\n\n")
    while (index !== -1) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const message = parseBlock(block)
      if (message) messages.push(message)
      index = buffer.indexOf("\n\n")
    }
    if (final && buffer.trim()) {
      const message = parseBlock(buffer)
      if (message) messages.push(message)
      buffer = ""
    }
    return messages
  }

  return {
    push(chunk: string): SSEMessage[] {
      buffer += chunk
      return drain(false)
    },
    flush(): SSEMessage[] {
      return drain(true)
    },
  }
}

/** Consome um `Response` SSE (fetch) entregando um evento por iteração. */
export async function* readSSE(
  response: Response
): AsyncGenerator<SSEMessage, void, undefined> {
  if (!response.body) {
    throw new Error("Resposta sem corpo para streaming.")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSSEDecoder()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const message of parser.push(decoder.decode(value, { stream: true }))) {
        yield message
      }
    }
    for (const message of parser.push(decoder.decode())) {
      yield message
    }
    for (const message of parser.flush()) {
      yield message
    }
  } finally {
    reader.releaseLock()
  }
}
