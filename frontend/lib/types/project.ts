export interface Project {
  id: string
  name: string
  description: string
  analysisCount: number
  chartCount: number
  dashboardCount: number
  sourceCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectInput {
  name: string
  description?: string | null
}

/**
 * PUT parcial do backend: campo ausente não altera o valor atual;
 * `description: null` limpa a descrição.
 */
export type ProjectUpdateInput = Partial<ProjectInput>
