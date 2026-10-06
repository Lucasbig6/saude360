import { redirect } from "next/navigation"
import { legacyProjectId } from "@/lib/routes"

/** Rota legada de criação de fonte: nova fonte só existe dentro de projeto. */
export default async function NovaFonteLegacyPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const sp = await searchParams
  const projectId = legacyProjectId(sp.projectId)
  redirect(projectId ? `/projetos/${projectId}/fontes/nova` : "/projetos")
}
