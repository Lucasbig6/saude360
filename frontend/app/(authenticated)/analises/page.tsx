import { redirect } from "next/navigation"
import { legacyProjectId } from "@/lib/routes"

/**
 * Rota legada da lista de análises. O escopo por query string vira rota
 * aninhada; sem projeto, o usuário é levado à lista de projetos.
 */
export default async function AnalisesLegacyPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; projectId?: string }>
}) {
  const sp = await searchParams
  const projectId = legacyProjectId(sp.project ?? sp.projectId)
  redirect(projectId ? `/projetos/${projectId}/analises` : "/projetos")
}
