"use client"

import type { InsightStat } from "@/lib/explorer/insights"

/** Bloco INSIGHTS: estatísticas calculadas do resultado, sem texto livre. */
export function ResultInsights({ stats }: { stats: InsightStat[] }) {
  if (stats.length === 0) return null
  return (
    <section aria-label="Insights do resultado">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        Insights
      </p>
      <div className="mt-2 space-y-3">
        {stats.map((stat, index) => (
          <div
            key={`${stat.value}-${index}`}
            className="border-l-2 border-primary/40 pl-3"
          >
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
