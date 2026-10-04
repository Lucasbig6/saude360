import { describe, expect, it } from "vitest"
import { extractMapPoints, suggestCoordinateFields } from "./map-data"

describe("extractMapPoints", () => {
  it("converte coordenadas numéricas e descarta valores inválidos", () => {
    expect(
      extractMapPoints(
        [
          { lng: "-46.6333", lat: "-23.5505" },
          { lng: 181, lat: 0 },
          { lng: 10, lat: -91 },
          { lng: "", lat: 5 },
        ],
        "lng",
        "lat"
      )
    ).toEqual([{ latitude: -23.5505, longitude: -46.6333 }])
  })

  it("retorna lista vazia sem os dois campos de coordenadas", () => {
    expect(extractMapPoints([{ lng: 10, lat: 20 }], "lng", undefined)).toEqual([])
  })
})

describe("suggestCoordinateFields", () => {
  it("prioriza colunas reconhecidas de longitude e latitude", () => {
    expect(suggestCoordinateFields(["latitude", "total", "lng"])).toEqual({
      longitude: "lng",
      latitude: "latitude",
    })
  })

  it("usa os dois primeiros campos quando os nomes não são reconhecidos", () => {
    expect(suggestCoordinateFields(["coord_x", "coord_y"])).toEqual({
      longitude: "coord_x",
      latitude: "coord_y",
    })
  })
})