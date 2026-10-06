"use client"

import { useCallback, use } from "react"
import { useRouter } from "next/navigation"
import type { Dashboard } from "@/lib/types/dashboard"
import { DashboardDetail } from "@/components/dashboard/dashboard-detail"

/**
 * Rota legada `/paineis/[id]`. Painéis com projeto são canonizados para
 * `/projetos/[projectId]/paineis/[id]`; painéis sem projeto continuam
 * abrindo aqui, com volta para a biblioteca global.
 */
export default function DashboardLegacyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const handleLoaded = useCallback(
    (dashboard: Dashboard) => {
      if (dashboard.projectId) {
        router.replace(
          `/projetos/${dashboard.projectId}/paineis/${dashboard.id}`
        )
      }
    },
    [router]
  )

  return (
    <DashboardDetail dashboardId={id} backHref="/paineis" onLoaded={handleLoaded} />
  )
}
