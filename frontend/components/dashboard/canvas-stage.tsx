"use client"

import { useCallback, useEffect, useRef, useState } from "react"
// Core avoids Konva's Node canvas entrypoint during SSR/tests. Shapes are
// registered explicitly, which also keeps the browser bundle small.
import { Layer, Line, Rect, Stage } from "react-konva/lib/ReactKonvaCore"
import "konva/lib/shapes/Line"
import "konva/lib/shapes/Rect"
import { Minus, Move, Plus, Scan } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CanvasGeometry, CanvasPageLayout } from "@/lib/canvas-layout"

export interface CanvasItem extends CanvasGeometry { id: string }
export interface CanvasDropAnalysisData { analysisId?: string; config?: import("@/lib/types/widgets").WidgetConfig; x: number; y: number; w: number; h: number }

interface CanvasStageProps {
  items: CanvasItem[]; page: CanvasPageLayout; editable?: boolean; selectedId?: string | null
  onSelect?: (id: string | null) => void; onLayoutChange?: (items: CanvasItem[]) => void
  onDropAnalysis?: (data: CanvasDropAnalysisData) => void; children: (item: CanvasItem, style: React.CSSProperties) => React.ReactNode
}

export function CanvasStage({ items, page, editable = false, selectedId, onSelect, onLayoutChange, onDropAnalysis, children }: CanvasStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 800, height: 680 })
  const [zoom, setZoom] = useState(0.7)
  const [pan, setPan] = useState({ x: 32, y: 32 })
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: CanvasItem } | null>(null)
  const panDragRef = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null)

  useEffect(() => { const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: Math.max(420, entry.contentRect.height) })); if (viewportRef.current) observer.observe(viewportRef.current); return () => observer.disconnect() }, [])
  const fit = useCallback(() => { const x = Math.max(24, (viewport.width - page.width * 0.78) / 2); setZoom(Math.min(1, Math.max(0.35, (viewport.width - 48) / page.width))); setPan({ x, y: 32 }) }, [page.width, viewport.width])
  const emit = useCallback((id: string, patch: Partial<CanvasItem>) => onLayoutChange?.(items.map((item) => item.id === id ? { ...item, ...patch } : item)), [items, onLayoutChange])
  const point = (clientX: number, clientY: number) => { const rect = viewportRef.current!.getBoundingClientRect(); return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom } }
  const onPointerMove = (event: React.PointerEvent) => { const panning = panDragRef.current; if (panning) { setPan({ x: panning.x + event.clientX - panning.clientX, y: panning.y + event.clientY - panning.clientY }); return }; const drag = dragRef.current; if (!drag) return; const p = point(event.clientX, event.clientY); emit(drag.id, { x: Math.max(0, Math.round(drag.origin.x + p.x - drag.startX)), y: Math.max(0, Math.round(drag.origin.y + p.y - drag.startY)) }) }
  const finish = () => { dragRef.current = null; panDragRef.current = null }
  const beginDrag = (event: React.PointerEvent, item: CanvasItem) => { if (!editable || (event.target as HTMLElement).closest("button,input,textarea,select")) return; event.preventDefault(); const p = point(event.clientX, event.clientY); dragRef.current = { id: item.id, startX: p.x, startY: p.y, origin: item }; onSelect?.(item.id) }
  const resize = (event: React.PointerEvent, item: CanvasItem) => { event.preventDefault(); event.stopPropagation(); const start = point(event.clientX, event.clientY); const move = (e: PointerEvent) => { const p = point(e.clientX, e.clientY); emit(item.id, { w: Math.max(80, Math.round(item.w + p.x - start.x)), h: Math.max(64, Math.round(item.h + p.y - start.y)) }) }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true }) }
  const drop = (event: React.DragEvent) => { if (!editable || !onDropAnalysis) return; const json = event.dataTransfer.getData("application/json"); const plain = event.dataTransfer.getData("text/plain"); let parsed: { analysisId?: string; config?: CanvasDropAnalysisData["config"] } = {}; try { parsed = json ? JSON.parse(json) : {} } catch {} if (!parsed.analysisId && !parsed.config && !plain) return; event.preventDefault(); const p = point(event.clientX, event.clientY); onDropAnalysis({ ...parsed, ...(parsed.analysisId || !plain ? {} : { analysisId: plain }), x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)), w: parsed.config ? 360 : 560, h: parsed.config?.type === "text" ? 120 : 300 }) }

  return <div className="overflow-hidden rounded-xl border border-border bg-muted/70 shadow-sm">
    {editable && <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5"><Move size={14} className="ml-1 text-muted-foreground" /><span className="mr-auto text-xs text-muted-foreground">Prancheta livre</span><Button aria-label="Diminuir zoom" variant="ghost" size="icon-sm" onClick={() => setZoom(z => Math.max(.25, z - .1))}><Minus size={14}/></Button><span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span><Button aria-label="Aumentar zoom" variant="ghost" size="icon-sm" onClick={() => setZoom(z => Math.min(2, z + .1))}><Plus size={14}/></Button><Button variant="ghost" size="sm" onClick={fit}><Scan size={14}/>Ajustar</Button></div>}
    <div ref={viewportRef} className="relative h-[min(72vh,820px)] touch-none" onPointerDown={e => { if (e.altKey || e.button === 1) { e.preventDefault(); panDragRef.current = { ...pan, clientX: e.clientX, clientY: e.clientY } } else if ((e.target as HTMLElement).tagName === "CANVAS") onSelect?.(null) }} onPointerMove={onPointerMove} onPointerUp={finish} onPointerLeave={finish} onDragOver={e => editable && e.preventDefault()} onDrop={drop}>
      <Stage width={viewport.width} height={viewport.height} onMouseDown={e => { if (e.target === e.target.getStage()) onSelect?.(null) }}><Layer listening={false}><Rect x={pan.x} y={pan.y} width={page.width * zoom} height={page.height * zoom} fill={page.background ?? "#fff"} shadowBlur={12} shadowColor="#64748b" shadowOpacity={.22}/>{Array.from({ length: Math.floor(page.width / 40) }, (_, i) => <Line key={`x${i}`} points={[pan.x + i * 40 * zoom, pan.y, pan.x + i * 40 * zoom, pan.y + page.height * zoom]} stroke="#e2e8f0" strokeWidth={.5}/>)}</Layer><Layer>{items.filter(i => i.visible).map(item => <Rect key={item.id} x={pan.x + item.x * zoom} y={pan.y + item.y * zoom} width={item.w * zoom} height={item.h * zoom} stroke={selectedId === item.id ? "#0f766e" : "transparent"} strokeWidth={2} dash={selectedId === item.id ? [5, 4] : undefined}/>)}</Layer></Stage>
      {items.filter(i => i.visible).map(item => <div key={item.id} className="absolute" style={{ transform: `translate(${pan.x + item.x * zoom}px, ${pan.y + item.y * zoom}px)`, width: item.w * zoom, height: item.h * zoom, zIndex: item.zIndex + 2 }} onPointerDown={e => beginDrag(e, item)}>{children(item, { width: "100%", height: "100%" })}{editable && selectedId === item.id && <button aria-label="Redimensionar widget" className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-primary bg-background" onPointerDown={e => resize(e, item)} />}</div>)}
    </div>
  </div>
}
