import type { Dashboard } from "@/lib/types/dashboard"

export { cn } from "cn"

// Espelha a função de slug do módulo legado de storage (arquivo órfão nesta
// etapa, removido numa etapa posterior); só entra em jogo sem slug vindo da API.
function slugifyDashboardName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return base || "dashboard"
}

export function getDashboardSharePath(dashboard: Dashboard): string {
  const slug = dashboard.slug?.trim() || slugifyDashboardName(dashboard.name)
  return `/painel/${slug}`
}
