import { Database, Sparkles } from "lucide-react"

export function ExplorationEmptyState({
  datasetsError,
  hasDatasets,
}: {
  datasetsError: string | null
  hasDatasets: boolean
}) {
  if (datasetsError) {
    return (
      <p role="alert" className="m-auto max-w-md px-6 py-8 text-center text-sm text-destructive">
        {datasetsError}
      </p>
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-8 sm:px-6">
      <article className="w-full rounded-2xl border border-border bg-card/80 p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles size={14} />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Agente
          </span>
        </div>
        <div className="mt-3 space-y-2 text-sm leading-6 text-foreground">
          <p>Oi! Estou aqui para ajudar você a explorar seus dados.</p>
          <p className="text-muted-foreground">
            {hasDatasets
              ? "Para começar, selecione um dataset na lista de fontes do projeto. Depois, é só perguntar o que você quer descobrir."
              : "Para começar, vincule uma fonte com datasets publicados ao projeto. Assim que ela estiver disponível, você poderá escolher um dataset e perguntar o que quiser sobre os dados."}
          </p>
        </div>
        {hasDatasets && (
          <div className="mt-4 inline-flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <Database size={14} />
            <span>Selecione um dataset nas fontes do projeto</span>
          </div>
        )}
      </article>
    </section>
  )
}