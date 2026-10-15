"use client"

/** Contexto da fonte ativa, sem competir com a conversa. */
export function ContextHeader({
  datasetName,
  loading,
}: {
  datasetName: string | null
  loading: boolean
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
      <span className="text-[11px] font-medium text-muted-foreground">Contexto</span>
      <span aria-hidden="true" className="text-xs text-border">/</span>
      <p className="min-w-0 truncate text-xs font-medium text-foreground">
        {loading ? (
          <span className="inline-block h-3 w-32 animate-pulse rounded bg-muted" />
        ) : (
          (datasetName ?? "Demonstração · atendimentos de saúde")
        )}
      </p>
    </div>
  )
}
