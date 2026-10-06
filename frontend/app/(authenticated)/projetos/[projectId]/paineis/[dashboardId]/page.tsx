"use client"

import { use } from "react"
import { DashboardDetail } from "@/components/dashboard/dashboard-detail"

export default function DashboardDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; dashboardId: string }>
}) {
  const { projectId, dashboardId } = use(params)
  return (
    <DashboardDetail
      dashboardId={dashboardId}
      backHref={`/projetos/${projectId}/paineis`}
    />
  )
}
