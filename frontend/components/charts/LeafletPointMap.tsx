"use client"

import { useEffect } from "react"
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet"
import type { MapPoint } from "@/lib/charts/map-data"

function Viewport({ center }: { center: [number, number] }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, 5)
  }, [center, map])

  return null
}

export function LeafletPointMap({
  points,
}: {
  points: MapPoint[]
}) {
  const center: [number, number] = points.length
    ? [
        points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
        points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      ]
    : [0, 0]

  return (
    <MapContainer
      center={center}
      zoom={5}
      scrollWheelZoom
      className="h-full min-h-[280px] w-full rounded-md"
    >
      <Viewport center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point, index) => (
        <CircleMarker
          key={`${point.latitude}-${point.longitude}-${index}`}
          center={[point.latitude, point.longitude]}
          radius={7}
          pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.8 }}
        >
          <Popup>
            {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}