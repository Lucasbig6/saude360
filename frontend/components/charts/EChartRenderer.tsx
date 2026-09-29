"use client"

import { useEffect, useMemo, useRef } from "react"
import type { ChartConfig } from "@/lib/charts/chart-config"
import { toEChartsOption } from "@/lib/charts/echarts-adapter"
import { echarts, type ChartInstance } from "@/lib/charts/register"
import { prepareData, type Row } from "@/lib/charts/transform"

export interface EChartRendererProps {
  config: ChartConfig
  rows: Row[]
  height?: number | string
  className?: string
}

export function EChartRenderer({
  config,
  rows,
  height = "100%",
  className,
}: EChartRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ChartInstance | null>(null)

  const option = useMemo(
    () => toEChartsOption(config, prepareData(rows, config)),
    [config, rows],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof window === "undefined") {
      return
    }

    const chart = echarts.init(container)
    chartRef.current = chart

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => chart.resize())
        : null
    observer?.observe(container)

    return () => {
      observer?.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height }}
    />
  )
}
