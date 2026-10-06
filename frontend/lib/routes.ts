/**
 * Helpers de rota do workspace centrado no projeto.
 *
 * Mantém centralizado o conhecimento de "onde um item vive": itens de um
 * projeto ficam em `/projetos/[projectId]/...`; itens sem projeto caem nas
 * rotas globais antigas, que redirecionam.
 */

export function projectPath(projectId: string, suffix = ""): string {
  return `/projetos/${projectId}${suffix}`
}

export function analysisHref(
  projectId: string | null | undefined,
  analysisId: string
): string {
  return projectId
    ? `/projetos/${projectId}/analises/${analysisId}`
    : `/analises/${analysisId}`
}

export function dashboardHref(dashboard: {
  id: string
  projectId: string | null
}): string {
  return dashboard.projectId
    ? `/projetos/${dashboard.projectId}/paineis/${dashboard.id}`
    : `/paineis/${dashboard.id}`
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Valor legado de escopo de projeto (`?project=`/`?projectId=`).
 *
 * `all`, `none` e ausência não apontam para um projeto; só um uuid vira rota.
 */
export function legacyProjectId(
  raw: string | null | undefined
): string | null {
  return raw && UUID_RE.test(raw) ? raw : null
}
