"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Hospital, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectWorkspace } from "@/components/workspace/project-workspace"
import type { Project } from "@/lib/types/project"
import { getProject } from "@/lib/api/projects"
import { ApiError } from "@/lib/api"

/**
 * Workspace do projeto — casca fina: carrega o projeto (guard 404) e
 * renderiza o ambiente de 3 painéis (Fontes · Exploração · Estúdio).
 */
export default function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getProject(projectId)
      .then((value) => {
        if (cancelled) return
        if (value === null) {
          setNotFound(true)
          return
        }
        setProject(value)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError ? err.detail : "Erro ao carregar o projeto."
        )
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadKey])

  function handleRetry() {
    setProject(null)
    setLoadError(null)
    setNotFound(false)
    setReloadKey((key) => key + 1)
  }

  if (project) {
    return <ProjectWorkspace key={project.id} project={project} />
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {!loadError && !notFound && (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {loadError && (
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
      )}

      {notFound && !loadError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Hospital size={24} className="text-primary" />
          </div>
          <h1 className="mt-4 text-sm font-semibold text-foreground">
            Projeto não encontrado
          </h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Ele pode ter sido excluído ou o link está incorreto.
          </p>
          <Link href="/projetos" className="mt-6">
            <Button variant="outline">
              <ArrowLeft size={14} />
              Voltar para Projetos
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
