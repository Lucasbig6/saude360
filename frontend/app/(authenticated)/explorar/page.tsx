import { redirect } from "next/navigation"
import { legacyProjectId } from "@/lib/routes"

/**
 * Rota legada do Explorar: a bancada vive dentro do projeto. Os demais params
 * (`?analysisId=`, `?datasetId=`) seguem junto na rota nova.
 */
export default async function ExplorarLegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const projectId = legacyProjectId(
    typeof sp.projectId === "string" ? sp.projectId : undefined
  )

  const rest = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (key === "projectId" || key === "project") continue
    if (typeof value === "string") rest.set(key, value)
  }

  const query = rest.toString()
  redirect(
    projectId
      ? `/projetos/${projectId}/explorar${query ? `?${query}` : ""}`
      : "/projetos"
  )
}
