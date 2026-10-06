"use client"

import { useEffect, useState } from "react"
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
import { Button } from "@/components/ui/button"
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

export default function FontesPage() {
  const [sources, setSources] = useState<SourceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SourceListItem | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await listSources()
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
  }, [])

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
      <section>
        <Link
          href="/inicio"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
        >
          <Database size={14} />
          Início
        </Link>

        <div className="mt-3 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Fontes de Dados
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Conecte e gerencie as fontes utilizadas nas análises do Saude360.
            </p>
          </div>

          <Link href="/fontes/nova">
            <Button className="bg-teal-600 text-white hover:bg-teal-700">
              <Plus size={16} />
              Adicionar fonte
            </Button>
          </Link>
        </div>
      </section>

      {/* Loading */}
      {loading ? (
        <section className="mt-8">
          <div className="flex items-center justify-center p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </section>
      ) : error ? (
        /* Error */
        <section className="mt-8">
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle size={16} />
            {error}
          </div>
        </section>
      ) : sources.length === 0 ? (
        /* Empty state */
        <section className="mt-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Database size={24} className="text-slate-400" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-slate-900">
              Nenhuma fonte cadastrada
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Adicione sua primeira fonte de dados para começar a explorar
              informações do SUS.
            </p>
            <Link href="/fontes/nova" className="mt-6">
              <Button className="bg-teal-600 text-white hover:bg-teal-700">
                <Plus size={16} />
                Adicionar fonte
              </Button>
            </Link>
          </div>
        </section>
      ) : (
        /* Source cards */
        <section className="mt-6">
          <h2 className="text-base font-semibold text-slate-900">
            Fontes conectadas
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => {
              const typeConfig = getSourceTypeConfig(source.engine)
              const Icon = ICONS[typeConfig.icon] ?? Database

              return (
                <div
                  key={source.id}
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <Icon size={18} />
                    </div>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {typeConfig.label}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-slate-900 line-clamp-1">
                    {source.database_name}
                  </h3>

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={`/fontes/${source.id}`}
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
                      className="shrink-0 text-slate-500 hover:text-red-600"
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
