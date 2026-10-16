"use client"

import Link from "next/link"
import {
	ChevronDown,
	ChevronRight,
	Database,
	FileChartColumnIncreasing,
	FolderOpen,
	PanelLeftClose,
} from "lucide-react"
import type { SourceListItem } from "@/lib/api/sources"
import type { SourceDataset } from "@/hooks/use-project-sources"
import type { DatasetColumn } from "@/lib/api/datasets"
import { datasetDisplayName } from "@/lib/api/datasets"
import type { Analysis } from "@/lib/types/analysis"

interface WorkspaceSourcesPanelProps {
	projectId: string
	projectName: string
	selectedDatasetId: number | null
	selectedDatasetName: string | null
	selectedColumns?: DatasetColumn[]
	sources: SourceListItem[]
	sourcesLoading: boolean
	sourcesError: string | null
	expandedSourceId: number | null
	datasets: SourceDataset[]
	datasetsLoading: boolean
	datasetsError: string | null
	onToggleSource: (sourceId: number) => void
	onSelectDatasetById: (datasetId: number) => void
	analyses: Analysis[] | null
	analysesError?: string | null
	onCollapse?: () => void
}

export function WorkspaceSourcesPanel({
	projectId,
	projectName,
	selectedDatasetId,
	selectedDatasetName,
	selectedColumns = [],
	sources,
	sourcesLoading,
	sourcesError,
	expandedSourceId,
	datasets,
	datasetsLoading,
	datasetsError,
	onToggleSource,
	onSelectDatasetById,
	analyses,
	analysesError,
	onCollapse,
}: WorkspaceSourcesPanelProps) {
	return (
		<aside className="flex h-full min-h-0 w-full min-w-0 flex-col bg-card text-card-foreground">
			<div className="border-b border-border px-4 py-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							Sessão do projeto
						</p>
						<h2 className="mt-1 truncate text-sm font-semibold">{projectName}</h2>
					</div>
					{onCollapse && (
						<button
							type="button"
							onClick={onCollapse}
							aria-label="Recolher fontes"
							title="Recolher fontes"
							className="hidden size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
						>
							<PanelLeftClose size={15} />
						</button>
					)}
				</div>
				<div className="mt-4 border-l-2 border-primary pl-3">
					<p className="text-xs text-muted-foreground">Fonte ativa</p>
					<p className="mt-0.5 truncate text-sm font-medium">
						{selectedDatasetName ?? "Nenhuma fonte selecionada"}
					</p>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<section className="px-3 py-4" aria-labelledby="project-sources-heading">
					<div className="mb-2 flex items-center justify-between px-1">
						<h3
							id="project-sources-heading"
							className="text-xs font-semibold text-foreground"
						>
							Fontes do projeto
						</h3>
						{!sourcesLoading && !sourcesError && (
							<span className="text-xs tabular-nums text-muted-foreground">
								{sources.length}
							</span>
						)}
					</div>

					{sourcesLoading ? (
						<p className="px-1 py-3 text-xs text-muted-foreground">
							Carregando fontes...
						</p>
					) : sourcesError ? (
						<p role="alert" className="px-1 py-3 text-xs text-destructive">
							{sourcesError}
						</p>
					) : sources.length === 0 ? (
						<p className="px-1 py-3 text-xs text-muted-foreground">
							Nenhuma fonte vinculada a este projeto.
						</p>
					) : (
						<ul className="space-y-1">
							{sources.map((source) => {
								const isExpanded = expandedSourceId === source.id
								return (
									<li key={source.id}>
										<button
											type="button"
											aria-expanded={isExpanded}
											onClick={() => onToggleSource(source.id)}
											className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{isExpanded ? (
												<ChevronDown size={14} className="shrink-0 text-muted-foreground" />
											) : (
												<ChevronRight size={14} className="shrink-0 text-muted-foreground" />
											)}
											<Database size={15} className="shrink-0 text-primary" />
											<span className="min-w-0 flex-1 truncate font-medium">
												{source.database_name}
											</span>
											<span className="shrink-0 text-[10px] text-muted-foreground">
												{source.engine}
											</span>
										</button>

										{isExpanded && (
											<div className="ml-5 border-l border-border py-1 pl-3">
												{datasetsLoading ? (
													<p className="px-2 py-2 text-xs text-muted-foreground">
														Carregando datasets...
													</p>
												) : datasetsError ? (
													<p role="alert" className="px-2 py-2 text-xs text-destructive">
														{datasetsError}
													</p>
												) : datasets.length === 0 ? (
													<p className="px-2 py-2 text-xs text-muted-foreground">
														Nenhum dataset publicado.
													</p>
												) : (
													<ul className="space-y-1">
														{datasets.map((dataset) => (
															<li key={dataset.id}>
																<button
																	type="button"
																	aria-pressed={selectedDatasetId === dataset.id}
																	onClick={() => onSelectDatasetById(dataset.id)}
																	className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary"
																>
																	<FolderOpen size={13} className="shrink-0" />
																	<span className="min-w-0 flex-1 truncate">
																		{datasetDisplayName(dataset)}
																	</span>
																	<span className="shrink-0 text-[10px]">
																		{dataset.schema}
																	</span>
																</button>
															</li>
														))}
													</ul>
												)}
											</div>
										)}
									</li>
								)
							})}
						</ul>
					)}

					<Link
						href={`/projetos/${projectId}/fontes`}
						className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
					>
						<FolderOpen size={14} />
						Gerenciar fontes
					</Link>
				</section>

						{selectedDatasetName && selectedColumns.length > 0 && (
							<section className="border-t border-border px-3 py-4" aria-labelledby="dataset-fields-heading">
								<h3 id="dataset-fields-heading" className="px-1 text-xs font-semibold text-foreground">
									Campos · {selectedDatasetName}
								</h3>
								<ul className="mt-2 space-y-1">
									{selectedColumns.slice(0, 8).map((column) => (
										<li key={column.column_name} className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
											<span className="min-w-0 truncate text-foreground">{column.column_name}</span>
											<span className="shrink-0 text-[10px] text-muted-foreground">{column.type}</span>
										</li>
									))}
								</ul>
							</section>
						)}

				<section className="border-t border-border px-3 py-4" aria-labelledby="recent-analyses-heading">
					<div className="mb-2 flex items-center justify-between px-1">
						<h3
							id="recent-analyses-heading"
							className="text-xs font-semibold text-foreground"
						>
							Análises recentes
						</h3>
						<Link
							href={`/projetos/${projectId}/analises`}
							className="text-[11px] font-medium text-primary hover:underline"
						>
							Ver todas as análises
						</Link>
					</div>

					{analysesError ? (
						<p role="alert" className="px-1 py-2 text-xs text-destructive">
							{analysesError}
						</p>
					) : analyses === null ? (
						<p className="px-1 py-2 text-xs text-muted-foreground">Carregando análises...</p>
					) : analyses.length === 0 ? (
						<p className="px-1 py-2 text-xs text-muted-foreground">
							Nenhuma análise salva.
						</p>
					) : (
						<ul className="space-y-1">
							{analyses.slice(0, 5).map((analysis) => (
								<li key={analysis.id}>
									<Link
										href={`/projetos/${projectId}/explorar?analysisId=${encodeURIComponent(analysis.id)}`}
										className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									>
										<FileChartColumnIncreasing size={14} className="shrink-0" />
										<span className="min-w-0 truncate">{analysis.name}</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</aside>
	)
}
