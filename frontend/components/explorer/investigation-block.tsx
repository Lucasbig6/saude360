"use client"

import { Sparkles } from "lucide-react"

interface InvestigationBlockProps {
  /** Pergunta enviada no modo Perguntar. */
  question: string
}

/**
 * Estrutura da investigação gerada pelo modo Perguntar: pergunta no topo e,
 * abaixo, o espaço onde ficam insight, gráfico/tabela, dados utilizados, SQL
 * expansível e ações (salvar análise / adicionar ao painel). O conteúdo é
 * preenchido quando o Agente IA for conectado (etapa seguinte).
 */
export function InvestigationBlock({ question }: InvestigationBlockProps) {
  return (
    <section className="border-t border-border pt-6">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Pergunta
      </p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{question}</h2>

      <div
        role="status"
        className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/50/60 px-4 py-8 text-center"
      >
        <Sparkles size={18} className="text-chart-4" />
        <p className="max-w-md text-sm text-muted-foreground">
          O Agente IA responderá aqui com o insight principal, o gráfico ou
          tabela, os dados utilizados, o SQL gerado e as ações de salvar a
          análise ou adicioná-la ao painel.
        </p>
      </div>
    </section>
  )
}
