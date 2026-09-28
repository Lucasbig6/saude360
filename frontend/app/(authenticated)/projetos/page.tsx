"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  Hospital,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog"
import type { Project } from "@/lib/types/project"
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
} from "@/lib/api/projects"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true
  return normalize(haystack).includes(normalize(query))
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function countBadge(count: number, one: string, many: string, className: string) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      {plural(count, one, many)}
    </span>
  )
}

export default function ProjetosPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState("")

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getProjects()
      .then((list) => {
        if (!cancelled) setProjects(list)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError ? err.detail : "Erro ao carregar os projetos."
        )
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function handleRetry() {
    setProjects(null)
    setLoadError(null)
    setReloadKey((key) => key + 1)
  }

  const filtered = useMemo(() => {
    const list = projects ?? []
    const trimmed = query.trim()
    if (!trimmed) return list
    return list.filter((project) =>
      matchesQuery(`${project.name} ${project.description}`, trimmed)
    )
  }, [projects, query])

  async function handleCreate() {
    const trimmed = createName.trim()
    if (!trimmed || creating) return

    setCreating(true)
    setCreateError(null)

    try {
      const project = await createProject({
        name: trimmed,
        description: createDescription.trim() || null,
      })
      setProjects((prev) => [project, ...(prev ?? [])])
      setCreateOpen(false)
      setCreateName("")
      setCreateDescription("")
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.detail : "Erro ao criar o projeto."
      )
    } finally {
      setCreating(false)
    }
  }

  function openEdit(project: Project) {
    setEditTarget(project)
    setEditName(project.name)
    setEditDescription(project.description)
    setEditError(null)
  }

  function closeEdit() {
    setEditTarget(null)
    setEditError(null)
  }

  async function handleSaveEdit() {
    const trimmed = editName.trim()
    if (!trimmed || savingEdit || !editTarget) return

    setSavingEdit(true)
    setEditError(null)

    try {
      const updated = await updateProject(editTarget.id, {
        name: trimmed,
        description: editDescription.trim() || null,
      })
      setProjects((prev) =>
        (prev ?? []).map((project) =>
          project.id === updated.id ? updated : project
        )
      )
      closeEdit()
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.detail : "Erro ao salvar as alterações."
      )
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)

    try {
      await deleteProject(deleteTarget.id)
      setProjects((prev) =>
        (prev ?? []).filter((project) => project.id !== deleteTarget.id)
      )
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setProjects((prev) =>
          (prev ?? []).filter((project) => project.id !== deleteTarget.id)
        )
        setDeleteTarget(null)
      } else {
        setDeleteError(
          err instanceof ApiError ? err.detail : "Erro ao excluir o projeto."
        )
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Projetos
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Organize análises, gráficos e painéis por tema ou iniciativa de
              trabalho.
            </p>
          </div>

          <Button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 bg-teal-600 text-white hover:bg-teal-700"
          >
            <Plus size={16} />
            Novo projeto
          </Button>
        </div>

        {projects !== null && projects.length > 0 && (
          <div className="relative mt-5 max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar projeto..."
              aria-label="Buscar projeto"
              className="h-9 border-slate-200 bg-white pl-9 text-sm shadow-sm placeholder:text-slate-400 focus-visible:ring-teal-500/40"
            />
          </div>
        )}
      </section>

      {/* Loading */}
      {projects === null && !loadError && (
        <section className="mt-8">
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </section>
      )}

      {/* Load error */}
      {projects === null && loadError && (
        <section className="mt-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">
              <AlertCircle size={16} />
              {loadError}
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw size={13} />
                Tentar novamente
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Empty state */}
      {projects !== null && projects.length === 0 ? (
        <section className="mt-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
              <Hospital size={24} className="text-teal-600" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-slate-900">
              Nenhum projeto ainda
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Crie um projeto para agrupar análises, gráficos e painéis do mesmo
              tema em um único espaço de trabalho.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-6 bg-teal-600 text-white hover:bg-teal-700"
            >
              <Plus size={16} />
              Novo projeto
            </Button>
          </div>
        </section>
      ) : projects !== null && filtered.length === 0 ? (
        /* Busca sem resultados */
        <section className="mt-8">
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">
              Nenhum projeto encontrado para “{query.trim()}”
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tente outro termo.
            </p>
          </div>
        </section>
      ) : projects !== null ? (
        /* Cards */
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Hospital size={18} />
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Ações de ${project.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-500"
                    >
                      <MoreVertical size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => openEdit(project)}
                      >
                        <Pencil size={14} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        className="cursor-pointer gap-2"
                        onClick={() => setDeleteTarget(project)}
                      >
                        <Trash2 size={14} />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Link
                  href={`/projetos/${project.id}`}
                  className="mt-3 block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-1 transition-colors group-hover:text-teal-700">
                    {project.name}
                  </h3>

                  {project.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {countBadge(
                      project.analysisCount,
                      "análise",
                      "análises",
                      "bg-teal-50 text-teal-700"
                    )}
                    {countBadge(
                      project.chartCount,
                      "gráfico",
                      "gráficos",
                      "bg-purple-50 text-purple-700"
                    )}
                    {countBadge(
                      project.dashboardCount,
                      "painel",
                      "painéis",
                      "bg-slate-100 text-slate-600"
                    )}
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Atualizado em {formatDate(project.updatedAt)}
                  </p>
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setCreateName("")
            setCreateDescription("")
            setCreateError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
            <DialogDescription>
              Dê um nome para o projeto para encontrá-lo facilmente depois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertCircle size={15} className="shrink-0" />
                {createError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="project-name">Nome *</Label>
              <Input
                id="project-name"
                placeholder="Ex: Atendimentos Hospitalares"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleCreate()
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Descrição</Label>
              <Input
                id="project-description"
                placeholder="Ex: Indicadores de demanda e ocupação hospitalar."
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false)
                setCreateName("")
                setCreateDescription("")
                setCreateError(null)
              }}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={!createName.trim() || creating}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar projeto</DialogTitle>
            <DialogDescription>
              Renomeie o projeto ou atualize a descrição.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertCircle size={15} className="shrink-0" />
                {editError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="project-edit-name">Nome *</Label>
              <Input
                id="project-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleSaveEdit()
                  }
                }}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-edit-description">Descrição</Label>
              <Input
                id="project-edit-description"
                placeholder="Sem descrição"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={!editName.trim() || savingEdit}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {savingEdit && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        title="Excluir projeto"
        itemName={deleteTarget?.name ?? ""}
        description={
          deleteTarget
            ? `Tem certeza que deseja excluir "${deleteTarget.name}"? As análises, gráficos e painéis do projeto não serão excluídos — apenas deixarão de pertencer a ele. Esta ação não pode ser desfeita.`
            : undefined
        }
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  )
}
