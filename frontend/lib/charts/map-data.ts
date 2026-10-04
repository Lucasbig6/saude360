export interface MapPoint {
  latitude: number
  longitude: number
}

export interface CoordinateFields {
  longitude: string | null
  latitude: string | null
}

export function suggestCoordinateFields(fields: string[]): CoordinateFields {
  const longitude =
    fields.find((field) => /^(lng|lon|long|longitude)$/i.test(field.replace(/[^a-z]/gi, ""))) ??
    fields[0] ??
    null
  const latitude =
    fields.find(
      (field) =>
        field !== longitude &&
        /^(lat|latitude)$/i.test(field.replace(/[^a-z]/gi, ""))
    ) ??
    fields.find((field) => field !== longitude) ??
    null

  return { longitude, latitude }
}

function numericCoordinate(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  if (typeof value === "string" && value.trim() === "") return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function extractMapPoints(
  rows: Record<string, unknown>[],
  longitudeField: string | undefined,
  latitudeField: string | undefined
): MapPoint[] {
  if (!longitudeField || !latitudeField) return []

  return rows.flatMap((row) => {
    const longitude = numericCoordinate(row[longitudeField])
    const latitude = numericCoordinate(row[latitudeField])
    if (
      longitude === null ||
      latitude === null ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      return []
    }
    return [{ latitude, longitude }]
  })
}