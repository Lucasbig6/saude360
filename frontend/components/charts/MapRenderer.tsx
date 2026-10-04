"use client"

import dynamic from "next/dynamic"
import { extractMapPoints } from "@/lib/charts/map-data"
import type { MapPoint } from "@/lib/charts/map-data"

const LeafletPointMap = dynamic(
  () => import("./LeafletPointMap").then((module) => module.LeafletPointMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-500">
        Carregando mapa...
      </div>
    ),
  }
)

export function MapRenderer({
  rows,
  longitudeField,
  latitudeField,
  className,
}: {
  rows: Record<string, unknown>[]
  longitudeField?: string
  latitudeField?: string
  className?: string
}) {
  const points: MapPoint[] = extractMapPoints(
    rows,
    longitudeField,
    latitudeField
  ).slice(0, 2000)

  if (points.length === 0) {
    return (
      <div className={`flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center ${className ?? ""}`}>
        <p className="text-sm text-slate-500">
          Nenhuma linha tem coordenadas válidas de latitude e longitude.
        </p>
      </div>
    )
  }

  return (
    <div className={className ?? "h-full w-full"}>
      <LeafletPointMap points={points} />
    </div>
  )
}