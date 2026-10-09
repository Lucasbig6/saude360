import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ChatSessionHistory } from "./chat-session-history"
import type { AISession } from "@/lib/api/ai"

const session = {
  id: "session-1",
  title: "Atendimentos por município",
} as AISession

describe("ChatSessionHistory", () => {
  it("inicia uma sessão e permite retomar uma conversa do histórico", () => {
    const onNewSession = vi.fn()
    const onSelectSession = vi.fn()
    const onDeleteSession = vi.fn()
    render(
      <ChatSessionHistory
        sessions={[session]}
        activeSessionId={null}
        loading={false}
        disabled={false}
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Nova sessão" }))
    fireEvent.click(screen.getByText("Histórico"))
    fireEvent.click(screen.getByRole("button", { name: session.title! }))
    fireEvent.click(
      screen.getByRole("button", {
        name: `Excluir sessão: ${session.title}`,
      })
    )

    expect(onNewSession).toHaveBeenCalledOnce()
    expect(onSelectSession).toHaveBeenCalledWith(session)
    expect(onDeleteSession).toHaveBeenCalledWith(session)
  })
})