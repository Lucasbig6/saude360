import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../api"
import type {
  Dashboard,
  DashboardAppearance,
  DashboardFilter,
  DashboardPage,
  DashboardWidget,
} from "@/lib/types/dashboard"
import { normalizeWidgetConfig, type WidgetConfig } from "@/lib/types/widgets"
import { normalizeGridLayout } from "@/lib/canvas-layout"
import type { DistinctValuesResponse } from "./datasets"

/**
 * Payload cru de `GET/POST/PUT /api/dashboards` (camelCase do backend).
 *
 * Divergências conhecidas em relação ao tipo `Dashboard` do frontend:
 *   - description   : string|null -> string ("" quando null)
 *   - appearance    : dict livre   -> DashboardAppearance (keys extras ignoradas)
 *   - datasetId     : number|null  -> number (0 quando null; sentinela, nunca é dataset real)
 *   - defaultValue  : string|string[]|null -> string|string[] ("" quando null)
 *   - scope         : string|string[]|null -> "dashboard" | string[] (o frontend só
 *                     grava "dashboard" ou array; outra string qualquer é repassada)
 *   - projectId     : string|null (UUID do projeto; null = sem projeto)
 */
export interface ApiLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface ApiWidget {
  id: string
  analysisId: string | null
  layout: ApiLayout
  /** Config v2 validada pelo backend (presente desde a migração 0004). */
  widget?: unknown
  /** Dados inline da análise — presente no endpoint público /by-slug. */
  analysisData?: unknown
  /** Página dona; null/ausente em dashboards legados sem páginas. */
  pageId?: string | null
}

export interface ApiFilter {
  id: string
  datasetId: number | null
  column: string
  operator: string
  defaultValue: string | string[] | null
  scope: string | string[] | null
  controlType?: string | null
}

export interface ApiPage {
  id: string
  name: string
  position?: number
}

export interface ApiDashboard {
  id: string
  name: string
  description: string | null
  slug: string
  appearance: Record<string, unknown>
  widgets: ApiWidget[]
  filters: ApiFilter[]
  projectId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  /** Ausente/vazio em dashboards legados (antes da migração 0007). */
  pages?: ApiPage[] | null
  activePageId?: string | null
}

export interface WidgetPayload {
  id: string
  analysisId: string | null
  layout: ApiLayout
  widget?: WidgetConfig
  pageId: string | null
}

export interface DashboardPayload {
  name: string
  description?: string | null
  appearance?: DashboardAppearance
  widgets?: WidgetPayload[]
  filters?: DashboardFilter[]
  /** ausente: PUT não altera o vínculo; null: remove; string: associa */
  projectId?: string | null
  /** abas da barra inferior (ordem da lista = posição canônica) */
  pages?: DashboardPage[]
  /** página exibida ao abrir o painel */
  activePageId?: string | null
}

export interface DashboardInput extends DashboardPayload {
  name: string
}

const FILTER_OPERATORS = new Set<string>([
  "eq",
  "in",
  "gte",
  "lte",
  "between",
])

function contractError(what: string): ApiError {
  return new ApiError(502, `Resposta inesperada da API (${what})`)
}

function assertApiDashboard(raw: unknown): ApiDashboard {
  const value = raw as ApiDashboard | null
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.widgets) ||
    !Array.isArray(value.filters)
  ) {
    throw contractError("/api/dashboards: campos obrigatórios ausentes")
  }
  return value
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback
}

function toLayout(layout: ApiLayout | null | undefined): DashboardWidget["layout"] {
  // Repara resíduos da era pixel (painel em pixels/canvas Konva) gravados nas
  // colunas do banco; a grade GridStack é a fonte da verdade.
  return normalizeGridLayout({
    x: finite(layout?.x, 0),
    y: finite(layout?.y, 0),
    w: finite(layout?.w, 4),
    h: finite(layout?.h, 4),
  })
}

function toConfig(raw: unknown): WidgetConfig | undefined {
  if (raw === undefined || raw === null) return undefined
  try {
    return normalizeWidgetConfig(raw)
  } catch {
    // payload inválido/antigo: o renderizador deriva da análise
    return undefined
  }
}

function toWidgets(rawWidgets: ApiWidget[]): DashboardWidget[] {
  const widgets = rawWidgets.map((widget, index) => {
    if (
      typeof widget?.id !== "string" ||
      (widget.analysisId !== null && typeof widget.analysisId !== "string") ||
      (widget.analysisId === null && !widget.widget)
    ) {
      throw contractError(`/api/dashboards: widget[${index}] inválido`)
    }

    // Parse analysisData embutida (apenas no endpoint público /by-slug)
    let analysisData: DashboardWidget["analysisData"] | undefined
    if (widget.analysisData && typeof widget.analysisData === "object") {
      const raw = widget.analysisData as Record<string, unknown>
      analysisData = {
        id: typeof raw.id === "string" ? raw.id : "",
        name: typeof raw.name === "string" ? raw.name : "",
        sql: typeof raw.sql === "string" ? raw.sql : null,
        databaseId: typeof raw.databaseId === "number" ? raw.databaseId : null,
        dbSchema: typeof raw.dbSchema === "string" ? raw.dbSchema : null,
        chartType: typeof raw.chartType === "string" ? raw.chartType : null,
        dimension: typeof raw.dimension === "string" ? raw.dimension : null,
        metric: typeof raw.metric === "string" ? raw.metric : null,
      }
    }

    return {
      id: widget.id,
      analysisId: typeof widget.analysisId === "string" ? widget.analysisId : null,
      layout: toLayout(widget.layout),
      config: toConfig(widget.widget),
      pageId: typeof widget.pageId === "string" ? widget.pageId : null,
      ...(analysisData ? { analysisData } : {}),
    }
  })

  // ordem determinística: a API devolve created_at, a UI espera grade (y, x)
  return widgets.sort(
    (a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x
  )
}

function toFilters(rawFilters: ApiFilter[]): DashboardFilter[] {
  return rawFilters.map((filter, index) => {
    if (
      typeof filter?.id !== "string" ||
      typeof filter.column !== "string" ||
      !filter.column ||
      typeof filter.operator !== "string" ||
      !FILTER_OPERATORS.has(filter.operator)
    ) {
      throw contractError(`/api/dashboards: filter[${index}] inválido`)
    }

    // a API aceita qualquer string; o frontend só grava "dashboard" ou array
    const scope = (filter.scope ?? "dashboard") as DashboardFilter["scope"]

    return {
      id: filter.id,
      datasetId: typeof filter.datasetId === "number" ? filter.datasetId : 0,
      column: filter.column,
      operator: filter.operator as DashboardFilter["operator"],
      defaultValue: filter.defaultValue ?? "",
      scope,
      controlType:
        filter.controlType === "multi-select" ||
        filter.controlType === "list" ||
        filter.controlType === "date-range"
          ? filter.controlType
          : "dropdown",
    }
  })
}

function toAppearance(raw: Record<string, unknown> | null): DashboardAppearance {
  if (raw === null || raw === undefined) return {}
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw contractError("/api/dashboards: appearance inválido")
  }
  // a API guarda dict livre; só theme/showBrand são do tipo do frontend
  return raw as DashboardAppearance
}

function toPages(raw: unknown): DashboardPage[] {
  if (!Array.isArray(raw)) return []
  const pages: DashboardPage[] = []
  for (const page of raw) {
    const value = page as ApiPage | null
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      pages.some((existing) => existing.id === value.id)
    ) {
      throw contractError("/api/dashboards: página inválida")
    }
    pages.push({ id: value.id, name: value.name })
  }
  // a API devolve as páginas já ordenadas por position; a ordem do array é
  // a posição canônica (o payload de PUT reenvia nessa mesma ordem).
  return pages
}

export function toDashboard(raw: unknown): Dashboard {
  const value = assertApiDashboard(raw)
  const appearance = toAppearance(value.appearance)
  const apiPages = toPages(value.pages)

  let pages: DashboardPage[]
  let activePageId: string | null
  let widgets = toWidgets(value.widgets)

  if (apiPages.length === 0) {
    // Dashboard legado (sem páginas no banco): sintetiza a "Página 1" em
    // memória e associa todos os widgets — nenhuma linha fictícia é gravada;
    // a primeira edição materializa de verdade via PUT.
    const synthesized: DashboardPage = {
      id: crypto.randomUUID(),
      name: "Página 1",
    }
    pages = [synthesized]
    activePageId = synthesized.id
    widgets = widgets.map((widget) => ({ ...widget, pageId: synthesized.id }))
  } else {
    pages = apiPages
    const known = new Set(apiPages.map((page) => page.id))
    activePageId =
      typeof value.activePageId === "string" && known.has(value.activePageId)
        ? value.activePageId
        : apiPages[0].id
    // invariante de visibilidade: widget sem página (ou órfã) cai na primeira
    widgets = widgets.map((widget) =>
      widget.pageId && known.has(widget.pageId)
        ? widget
        : { ...widget, pageId: apiPages[0].id }
    )
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description ?? "",
    slug: value.slug,
    widgets,
    filters: toFilters(value.filters),
    appearance,
    projectId: typeof value.projectId === "string" ? value.projectId : null,
    createdBy: typeof value.createdBy === "string" ? value.createdBy : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    pages,
    activePageId,
  }
}

/**
 * Widgets JSON-safe. A sentinela `y: Infinity` ("novo, embaixo") não sobrevive
 * ao JSON: ela é convertida para a primeira linha livre abaixo dos widgets já
 * posicionados, para o widget não voltar ao topo ao recarregar. O cálculo é
 * por página: widgets de outras abas não empilham o Y da página atual.
 */
function toWidgetsPayload(
  widgets: DashboardWidget[],
  fallbackPageId: string | null
): WidgetPayload[] {
  const appendYByPage = new Map<string, number>()
  for (const widget of widgets) {
    const pageKey = widget.pageId ?? "__none__"
    const y = widget.layout?.y
    const h = widget.layout?.h
    if (!Number.isFinite(y) || !Number.isFinite(h)) continue
    appendYByPage.set(pageKey, Math.max(appendYByPage.get(pageKey) ?? 0, y + h))
  }

  return widgets.map((widget) => {
    const pageKey = widget.pageId ?? "__none__"
    const appendY = appendYByPage.get(pageKey) ?? 0
    return {
      id: widget.id,
      analysisId: widget.analysisId,
      layout: {
        x: finite(widget.layout?.x, 0),
        y: Number.isFinite(widget.layout?.y) ? widget.layout.y : appendY,
        w: finite(widget.layout?.w, 4),
        h: finite(widget.layout?.h, 4),
      },
      ...(widget.config ? { widget: widget.config } : {}),
      pageId: widget.pageId ?? fallbackPageId,
    }
  })
}

/**
 * PUT completo. `slug` NUNCA é enviado: a identidade do slug é do backend.
 * `projectId` é enviado sempre (round-trip do objeto): manter o valor atual
 * preserva o vínculo; `null` limpa. `pages`/`activePageId` são sempre
 * enviados: a primeira edição materializa as páginas sintetizadas.
 */
export function toDashboardPayload(dashboard: Dashboard): DashboardPayload {
  const fallbackPageId = dashboard.pages[0]?.id ?? null
  return {
    name: dashboard.name,
    description: dashboard.description,
    appearance: dashboard.appearance ?? {},
    widgets: toWidgetsPayload(dashboard.widgets, fallbackPageId),
    filters: dashboard.filters.map((filter) => ({
      id: filter.id,
      datasetId: filter.datasetId,
      column: filter.column,
      operator: filter.operator,
      defaultValue: filter.defaultValue,
      scope: filter.scope,
      controlType: filter.controlType ?? "dropdown",
    })),
    projectId: dashboard.projectId,
    pages: dashboard.pages.map((page) => ({ id: page.id, name: page.name })),
    activePageId: dashboard.activePageId ?? fallbackPageId,
  }
}

function toCreatePayload(data: DashboardInput): DashboardPayload {
  const payload: DashboardPayload = {
    name: data.name,
    description: data.description ?? null,
    appearance: data.appearance ?? {},
    widgets: data.widgets
      ? toWidgetsPayload(data.widgets, data.pages?.[0]?.id ?? null)
      : undefined,
    filters: data.filters?.map((filter) => ({
      id: filter.id,
      datasetId: filter.datasetId,
      column: filter.column,
      operator: filter.operator,
      defaultValue: filter.defaultValue,
      scope: filter.scope,
      controlType: filter.controlType ?? "dropdown",
    })),
  }
  // ausente -> cria sem projeto; null -> cria sem projeto; string -> associa.
  if (data.projectId !== undefined) {
    payload.projectId = data.projectId
  }
  // ausente -> cria sem páginas (o parse sintetiza a "Página 1");
  // presente -> materializa já na criação.
  if (data.pages !== undefined) {
    payload.pages = data.pages
    payload.activePageId = data.activePageId ?? data.pages[0]?.id ?? null
  }
  return payload
}

export async function getDashboards(projectId?: string): Promise<Dashboard[]> {
  const path = projectId
    ? `/api/dashboards?projectId=${encodeURIComponent(projectId)}`
    : "/api/dashboards"
  const raw = await apiGet<unknown>(path)
  if (!Array.isArray(raw)) {
    throw contractError("/api/dashboards: esperava uma lista")
  }
  return raw.map(toDashboard)
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  try {
    return toDashboard(await apiGet<unknown>(`/api/dashboards/${id}`))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function getDashboardBySlug(slug: string): Promise<Dashboard | null> {
  try {
    return toDashboard(
      await apiGet<unknown>(`/api/dashboards/by-slug/${encodeURIComponent(slug)}`)
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/**
 * Opções de um filtro no link compartilhado (sem auth). O backend só expõe
 * datasets referenciados pelos filtros do próprio painel.
 */
export async function getPublicFilterDistinct(
  slug: string,
  filterId: string
): Promise<DistinctValuesResponse> {
  return apiGet<DistinctValuesResponse>(
    `/api/dashboards/by-slug/${encodeURIComponent(slug)}/filters/${encodeURIComponent(filterId)}/distinct`
  )
}

export async function createDashboard(data: DashboardInput): Promise<Dashboard> {
  const raw = await apiPost<unknown>("/api/dashboards", toCreatePayload(data))
  return toDashboard(raw)
}

export async function updateDashboard(
  id: string,
  payload: DashboardPayload
): Promise<Dashboard> {
  const raw = await apiPut<unknown>(`/api/dashboards/${id}`, payload)
  return toDashboard(raw)
}

export async function deleteDashboard(id: string): Promise<void> {
  await apiDelete(`/api/dashboards/${id}`)
}
