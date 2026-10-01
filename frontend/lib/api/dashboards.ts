import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../api"
import type {
  Dashboard,
  DashboardAppearance,
  DashboardFilter,
  DashboardWidget,
} from "@/lib/types/dashboard"
import { normalizeWidgetConfig, type WidgetConfig } from "@/lib/types/widgets"

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
  analysisId: string
  layout: ApiLayout
  /** Config v2 validada pelo backend (presente desde a migração 0004). */
  widget?: unknown
  /** Dados inline da análise — presente no endpoint público /by-slug. */
  analysisData?: unknown
}

export interface ApiFilter {
  id: string
  datasetId: number | null
  column: string
  operator: string
  defaultValue: string | string[] | null
  scope: string | string[] | null
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
}

export interface WidgetPayload {
  id: string
  analysisId: string
  layout: ApiLayout
  widget?: WidgetConfig
}

export interface DashboardPayload {
  name: string
  description?: string | null
  appearance?: DashboardAppearance
  widgets?: WidgetPayload[]
  filters?: DashboardFilter[]
  /** ausente: PUT não altera o vínculo; null: remove; string: associa */
  projectId?: string | null
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
  return {
    x: finite(layout?.x, 0),
    y: finite(layout?.y, 0),
    w: finite(layout?.w, 4),
    h: finite(layout?.h, 4),
  }
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
      typeof widget.analysisId !== "string"
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
      analysisId: widget.analysisId,
      layout: toLayout(widget.layout),
      config: toConfig(widget.widget),
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

export function toDashboard(raw: unknown): Dashboard {
  const value = assertApiDashboard(raw)

  return {
    id: value.id,
    name: value.name,
    description: value.description ?? "",
    slug: value.slug,
    widgets: toWidgets(value.widgets),
    filters: toFilters(value.filters),
    appearance: toAppearance(value.appearance),
    projectId: typeof value.projectId === "string" ? value.projectId : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

/**
 * Widgets JSON-safe. A sentinela `y: Infinity` ("novo, embaixo") não sobrevive
 * ao JSON: ela é convertida para a primeira linha livre abaixo dos widgets já
 * posicionados, para o widget não voltar ao topo ao recarregar.
 */
function toWidgetsPayload(widgets: DashboardWidget[]): WidgetPayload[] {
  const appendY = widgets.reduce((max, widget) => {
    const y = widget.layout?.y
    const h = widget.layout?.h
    if (!Number.isFinite(y) || !Number.isFinite(h)) return max
    return Math.max(max, y + h)
  }, 0)

  return widgets.map((widget) => ({
    id: widget.id,
    analysisId: widget.analysisId,
    layout: {
      x: finite(widget.layout?.x, 0),
      y: Number.isFinite(widget.layout?.y) ? widget.layout.y : appendY,
      w: finite(widget.layout?.w, 4),
      h: finite(widget.layout?.h, 4),
    },
    ...(widget.config ? { widget: widget.config } : {}),
  }))
}

/**
 * PUT completo. `slug` NUNCA é enviado: a identidade do slug é do backend.
 * `projectId` é enviado sempre (round-trip do objeto): manter o valor atual
 * preserva o vínculo; `null` limpa.
 */
export function toDashboardPayload(dashboard: Dashboard): DashboardPayload {
  return {
    name: dashboard.name,
    description: dashboard.description,
    appearance: dashboard.appearance ?? {},
    widgets: toWidgetsPayload(dashboard.widgets),
    filters: dashboard.filters.map((filter) => ({
      id: filter.id,
      datasetId: filter.datasetId,
      column: filter.column,
      operator: filter.operator,
      defaultValue: filter.defaultValue,
      scope: filter.scope,
    })),
    projectId: dashboard.projectId,
  }
}

function toCreatePayload(data: DashboardInput): DashboardPayload {
  const payload: DashboardPayload = {
    name: data.name,
    description: data.description ?? null,
    appearance: data.appearance ?? {},
    widgets: data.widgets ? toWidgetsPayload(data.widgets) : undefined,
    filters: data.filters?.map((filter) => ({
      id: filter.id,
      datasetId: filter.datasetId,
      column: filter.column,
      operator: filter.operator,
      defaultValue: filter.defaultValue,
      scope: filter.scope,
    })),
  }
  // ausente -> cria sem projeto; null -> cria sem projeto; string -> associa.
  if (data.projectId !== undefined) {
    payload.projectId = data.projectId
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
