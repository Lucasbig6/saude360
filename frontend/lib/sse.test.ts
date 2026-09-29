import { describe, expect, it } from "vitest"
import { createSSEDecoder, readSSE } from "@/lib/sse"

function sseBody(...events: string[]): string {
  return events.join("\n\n") + "\n\n"
}

describe("createSSEDecoder", () => {
  it("separa blocos event/data completos", () => {
    const decoder = createSSEDecoder()
    const messages = decoder.push(sseBody('event: token\ndata: {"delta":"Oi"}'))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({ event: "token", data: { delta: "Oi" } })
  })

  it("tolera chunks que dividem linhas no meio", () => {
    const decoder = createSSEDecoder()
    const raw = sseBody(
      'event: message_start\ndata: {"agentType":"dashboard_copilot"}',
      'event: token\ndata: {"delta":"Olá mundo"}'
    )

    const collected = []
    for (let index = 0; index < raw.length; index += 7) {
      collected.push(...decoder.push(raw.slice(index, index + 7)))
    }
    collected.push(...decoder.flush())

    expect(collected.map((message) => message.event)).toEqual([
      "message_start",
      "token",
    ])
    expect(collected[1].data).toEqual({ delta: "Olá mundo" })
  })

  it("acumula data multi-linha e ignora campos desconhecidos", () => {
    const decoder = createSSEDecoder()
    const messages = decoder.push(
      "event: error\nid: 7\nretry: 1000\ndata: linha1\ndata: linha2\n\n"
    )

    expect(messages).toHaveLength(1)
    expect(messages[0].event).toBe("error")
    expect(messages[0].data).toBe("linha1\nlinha2")
  })

  it("mantém payload não-JSON como texto", () => {
    const decoder = createSSEDecoder()
    const messages = decoder.push("event: error\ndata: falhou\n\n")

    expect(messages[0].data).toBe("falhou")
  })
})

describe("readSSE", () => {
  it("consome um Response e entrega os eventos na ordem", async () => {
    const body = sseBody(
      'event: message_start\ndata: {}',
      'event: token\ndata: {"delta":"x"}',
      'event: message_complete\ndata: {"content":"x"}'
    )
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
          controller.close()
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    )

    const events = []
    for await (const message of readSSE(response)) {
      events.push(message)
    }

    expect(events.map((message) => message.event)).toEqual([
      "message_start",
      "token",
      "message_complete",
    ])
  })

  it("lança erro quando a resposta não tem corpo", async () => {
    const response = { body: null } as unknown as Response
    const iterator = readSSE(response)
    await expect(iterator.next()).rejects.toThrow("Resposta sem corpo")
  })
})
