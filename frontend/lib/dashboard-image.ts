const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"])
/** Maior lado permitido para PNG/JPEG — acima disso a imagem é reduzida. */
const MAX_RASTER_SIDE = 1600

function byteLengthOfDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(",")
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."))
    img.src = src
  })
}

/**
 * Reduz PNG/JPEG grandes para caber no limite do widget sem estourar o
 * payload do painel. Devolve o dataURL (comprimido quando necessário).
 */
export async function compressRasterImage(
  dataUrl: string,
  mimeType: string
): Promise<string> {
  if (typeof document === "undefined") return dataUrl
  const img = await loadImage(dataUrl)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return dataUrl
  const scale = Math.min(1, MAX_RASTER_SIDE / Math.max(width, height))
  if (scale >= 1 && byteLengthOfDataUrl(dataUrl) <= MAX_IMAGE_BYTES) {
    return dataUrl
  }
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const output = mimeType === "image/jpeg" ? "image/jpeg" : "image/png"
  const compressed =
    output === "image/jpeg"
      ? canvas.toDataURL(output, 0.85)
      : canvas.toDataURL(output)
  if (byteLengthOfDataUrl(compressed) > MAX_IMAGE_BYTES) {
    throw new Error("A imagem deve ter até 2 MB, mesmo após compressão.")
  }
  return compressed
}

export async function prepareDashboardImage(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use uma imagem PNG, JPEG ou SVG.")
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("A imagem deve ter até 2 MB.")
  }

  if (file.type === "image/svg+xml") {
    const source = await file.text()
    const sanitized = sanitizeSvg(source)
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(sanitized)))}`
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("Não foi possível ler a imagem."))
    }
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."))
    reader.readAsDataURL(file)
  })
  return compressRasterImage(dataUrl, file.type)
}

export function sanitizeSvg(source: string): string {
  const document = new DOMParser().parseFromString(source, "image/svg+xml")
  const root = document.documentElement
  if (root.localName !== "svg" || document.querySelector("parsererror")) {
    throw new Error("O arquivo SVG é inválido.")
  }

  for (const element of Array.from(root.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video"))) {
    element.remove()
  }

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (
        name.startsWith("on") ||
        name === "src" ||
        name === "style" ||
        ((name === "href" || name.endsWith(":href")) && !value.startsWith("#")) ||
        /url\s*\(|javascript:|data:/i.test(value)
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return new XMLSerializer().serializeToString(root)
}
