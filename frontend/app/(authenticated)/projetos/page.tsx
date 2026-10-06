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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
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
  return <Badge className={className}>{plural(count, one, many)}</Badge>
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
      <PageHeader
        title="Projetos"
        description="Organize análises, gráficos e painéis por tema ou iniciativa de trabalho."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Novo projeto
          </Button>
        }
      />

      {projects !== null && projects.length > 0 && (
        <section className="mt-5">
          <div className="relative max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar projeto..."
              aria-label="Buscar projeto"
              className="h-9 border-border bg-card pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-ring/60"
            />
          </div>
        </section>
      )}

      {/* Loading */}
      {projects === null && !loadError && (
        <section className="mt-8">
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        </section>
      )}

      {/* Load error */}
      {projects === null && loadError && (
        <section className="mt-8">
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-6 py-8 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-warning">
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
          <EmptyState
            icon={Hospital}
            title="Nenhum projeto ainda"
            description="Crie um projeto para agrupar análises, gráficos e painéis do mesmo tema em um único espaço de trabalho."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Novo projeto
              </Button>
            }
          />
        </section>
      ) : projects !== null && filtered.length === 0 ? (
        /* Busca sem resultados */
        <section className="mt-8">
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              Nenhum projeto encontrado para “{query.trim()}”
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
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
                className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Hospital size={18} />
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Ações de ${project.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                  className="mt-3 block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1 transition-colors group-hover:text-primary">
                    {project.name}
                  </h3>

                  {project.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {countBadge(
                      project.analysisCount,
                      "análise",
                      "análises",
                      "bg-primary/10 text-primary"
                    )}
                    {countBadge(
                      project.chartCount,
                      "gráfico",
                      "gráficos",
                      "bg-chart-4/10 text-chart-4"
                    )}
                    {countBadge(
                      project.dashboardCount,
                      "painel",
                      "painéis",
                      "bg-muted text-muted-foreground"
                    )}
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
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
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
