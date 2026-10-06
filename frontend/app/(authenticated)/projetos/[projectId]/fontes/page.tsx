"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  Database,
  FileStack,
  FileText,
  Loader2,
  Plus,
  Table,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import {
  listSources,
  deleteSource,
  getSourceTypeConfig,
  type SourceListItem,
} from "@/lib/api/sources"
import { ApiError } from "@/lib/api"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"

const ICONS: Record<string, typeof Database> = {
  Database,
  FileText,
  Table,
  FileStack,
}

export default function FontesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  return <FontesContent projectId={projectId} />
}

function FontesContent({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<SourceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SourceListItem | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await listSources(projectId)
        setSources(data.result ?? [])
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Erro ao carregar fontes de dados."
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteSource(deleteTarget.id)
      setSources((prev) => prev.filter((s) => s.id !== deleteTarget.id))
    } catch {
      // error silently handled
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <PageHeader
        title="Fontes de Dados"
        description="Conecte e gerencie as fontes utilizadas nas análises do Saude360."
        actions={
          <Link href={`/projetos/${projectId}/fontes/nova`}>
            <Button>
              <Plus size={16} />
              Adicionar fonte
            </Button>
          </Link>
        }
      />

      {/* Loading */}
      {loading ? (
        <section className="mt-8">
          <div className="flex items-center justify-center p-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </section>
      ) : error ? (
        /* Error */
        <section className="mt-8">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} />
            {error}
          </div>
        </section>
      ) : sources.length === 0 ? (
        /* Empty state */
        <section className="mt-8">
          <EmptyState
            icon={Database}
            title="Nenhuma fonte cadastrada"
            description="Adicione sua primeira fonte de dados para começar a explorar informações do SUS."
            action={
              <Link href={`/projetos/${projectId}/fontes/nova`}>
                <Button>
                  <Plus size={16} />
                  Adicionar fonte
                </Button>
              </Link>
            }
          />
        </section>
      ) : (
        /* Source cards */
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-foreground">
            Fontes conectadas
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => {
              const typeConfig = getSourceTypeConfig(source.engine)
              const Icon = ICONS[typeConfig.icon] ?? Database

              return (
                <div
                  key={source.id}
                  className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <Badge variant="secondary">{typeConfig.label}</Badge>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-foreground line-clamp-1">
                    {source.database_name}
                  </h3>

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={`/projetos/${projectId}/fontes/${source.id}`}
                      className="flex-1"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        Explorar
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(source)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Excluir fonte"
        itemName={deleteTarget?.database_name ?? ""}
        onConfirm={handleDelete}
      />
    </div>
  )
}
