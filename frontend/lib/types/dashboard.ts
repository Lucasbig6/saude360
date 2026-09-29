import type { WidgetConfig } from "@/lib/types/widgets"

export interface DashboardFilter {
  id: string
  datasetId: number
  column: string
  operator: "eq" | "in" | "gte" | "lte" | "between"
  defaultValue: string | string[]
  scope: "dashboard" | string[]
}

export interface DashboardWidget {
  id: string
  analysisId: string
  layout: {
    x: number
    y: number
    w: number
    h: number
  }
  /**
   * Config v2 (chart/table/kpi/text/image). Ausente só em payloads antigos:
   * o renderizador deriva da análise legada.
   */
  config?: WidgetConfig
}

export type DashboardWidth = "default" | "wide" | "full"

export interface DashboardAppearance {
  theme?: "light" | "dark"
  showBrand?: boolean
  width?: DashboardWidth
}

export interface Dashboard {
  id: string
  name: string
  description: string
  slug?: string
  widgets: DashboardWidget[]
  filters: DashboardFilter[]
  appearance?: DashboardAppearance
  projectId: string | null
  createdAt: string
  updatedAt: string
}
