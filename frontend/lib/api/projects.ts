import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../api"
import type {
  Project,
  ProjectInput,
  ProjectUpdateInput,
} from "@/lib/types/project"

/**
 * Payload cru de `GET/POST/PUT /api/projects` (camelCase do backend).
 *
 * Divergências conhecidas em relação ao tipo `Project` do frontend:
 *   - description : string|null -> string ("" quando null)
 *   - createdBy   : existe só na API, fora do tipo do frontend
 */
export interface ApiProject {
  id: string
  name: string
  description: string | null
  analysisCount: number
  chartCount: number
  dashboardCount: number
  sourceCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

function contractError(what: string): ApiError {
  return new ApiError(502, `Resposta inesperada da API (${what})`)
}

function assertApiProject(raw: unknown): ApiProject {
  const value = raw as ApiProject | null
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw contractError("/api/projects: campos obrigatórios ausentes")
  }
  return value
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function toProject(raw: unknown): Project {
  const value = assertApiProject(raw)

  return {
    id: value.id,
    name: value.name,
    description: value.description ?? "",
    analysisCount: count(value.analysisCount),
    chartCount: count(value.chartCount),
    dashboardCount: count(value.dashboardCount),
    sourceCount: count(value.sourceCount),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

/**
 * Campos undefined são omitidos do JSON: no PUT isso mantém a semântica de
 * "campo ausente não altera"; `null` explícito é enviado e limpa o valor.
 */
function toProjectPayload(
  data: ProjectInput | ProjectUpdateInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (data.name !== undefined) payload.name = data.name
  if (data.description !== undefined) payload.description = data.description
  return payload
}

export async function getProjects(): Promise<Project[]> {
  const raw = await apiGet<unknown>("/api/projects")
  if (!Array.isArray(raw)) {
    throw contractError("/api/projects: esperava uma lista")
  }
  return raw.map(toProject)
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    return toProject(await apiGet<unknown>(`/api/projects/${id}`))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createProject(data: ProjectInput): Promise<Project> {
  const raw = await apiPost<unknown>("/api/projects", toProjectPayload(data))
  return toProject(raw)
}

export async function updateProject(
  id: string,
  data: ProjectUpdateInput
): Promise<Project> {
  const raw = await apiPut<unknown>(`/api/projects/${id}`, toProjectPayload(data))
  return toProject(raw)
}

export async function deleteProject(id: string): Promise<void> {
  await apiDelete(`/api/projects/${id}`)
}
