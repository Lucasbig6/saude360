"use client"

/** Cabeçalho de contexto: fonte atual do workspace. */
export function ContextHeader({
  datasetName,
  loading,
}: {
  datasetName: string | null
  loading: boolean
}) {
  return (
    <div className="border-b border-border px-5 py-4 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Fonte de dados
      </p>
      <h2 className="mt-1 truncate text-base font-semibold text-foreground">
        {loading ? (
          <span className="inline-block h-5 w-40 animate-pulse rounded bg-muted" />
        ) : (
          (datasetName ?? "Nenhuma fonte selecionada")
        )}
      </h2>
    </div>
  )
}
