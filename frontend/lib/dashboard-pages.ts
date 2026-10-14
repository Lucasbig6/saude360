import type { Dashboard, DashboardPage, DashboardWidget } from "@/lib/types/dashboard"

/** Widgets da página (a invariante do parser é: todo widget tem página). */
export function widgetsForPage(
  widgets: DashboardWidget[],
  pageId: string
): DashboardWidget[] {
  return widgets.filter((widget) => widget.pageId === pageId)
}

/**
 * Próximo nome livre no padrão "Página N": usa o menor N ≥ 1 cujo nome
 * ainda não existe (mesmo que as páginas estejam fora de ordem).
 */
export function nextPageName(pages: DashboardPage[]): string {
  const names = new Set(pages.map((page) => page.name))
  for (let n = 1; ; n++) {
    const candidate = `Página ${n}`
    if (!names.has(candidate)) return candidate
  }
}

/** Página exibida: a ativa quando ainda existe, senão a primeira. */
export function resolveActivePageId(dashboard: Dashboard): string {
  if (
    dashboard.activePageId &&
    dashboard.pages.some((page) => page.id === dashboard.activePageId)
  ) {
    return dashboard.activePageId
  }
  return dashboard.pages[0]?.id ?? ""
}

/** Nova página já ativa; nenhum widget nasce nela. */
export function addPage(dashboard: Dashboard): Dashboard {
  const page: DashboardPage = {
    id: crypto.randomUUID(),
    name: nextPageName(dashboard.pages),
  }
  return {
    ...dashboard,
    pages: [...dashboard.pages, page],
    activePageId: page.id,
  }
}

export function renamePage(
  dashboard: Dashboard,
  pageId: string,
  name: string
): Dashboard {
  const trimmed = name.trim()
  if (!trimmed) return dashboard
  return {
    ...dashboard,
    pages: dashboard.pages.map((page) =>
      page.id === pageId ? { ...page, name: trimmed } : page
    ),
  }
}

/** Move a página uma posição (ordem canônica = ordem do array). */
export function movePage(
  dashboard: Dashboard,
  pageId: string,
  direction: "left" | "right"
): Dashboard {
  const index = dashboard.pages.findIndex((page) => page.id === pageId)
  if (index < 0) return dashboard
  const target = direction === "left" ? index - 1 : index + 1
  if (target < 0 || target >= dashboard.pages.length) return dashboard

  const pages = [...dashboard.pages]
  const [moved] = pages.splice(index, 1)
  pages.splice(target, 0, moved)
  return { ...dashboard, pages }
}

/**
 * Exclui a página e os widgets dela (o backend faz cascade). Nunca remove a
 * última página — a UI também bloqueia, mas a guarda fica aqui.
 * A página ativa passa para a primeira sobrevivente.
 */
export function deletePage(
  dashboard: Dashboard,
  pageId: string
): Dashboard {
  if (dashboard.pages.length <= 1) return dashboard
  const pages = dashboard.pages.filter((page) => page.id !== pageId)
  if (pages.length === dashboard.pages.length) return dashboard

  return {
    ...dashboard,
    pages,
    widgets: dashboard.widgets.filter((widget) => widget.pageId !== pageId),
    activePageId:
      dashboard.activePageId === pageId ||
      !pages.some((page) => page.id === dashboard.activePageId)
        ? pages[0].id
        : dashboard.activePageId,
  }
}
