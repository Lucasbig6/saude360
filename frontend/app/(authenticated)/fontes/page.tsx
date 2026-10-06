import { redirect } from "next/navigation"
import { legacyProjectId } from "@/lib/routes"

/**
 * Rota legada da lista de fontes: sem projeto na query string, o usuário vai
 * para a lista de projetos (as fontes passam a ser um recurso do projeto).
 */
export default async function FontesLegacyPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const sp = await searchParams
  const projectId = legacyProjectId(sp.projectId)
  redirect(projectId ? `/projetos/${projectId}/fontes` : "/projetos")
}
