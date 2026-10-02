// Freehand strokes for the Canvas pen. A stroke is captured in flow
// coordinates, simplified, and stored as a `drawing` node: the node sits at
// the stroke's top-left and its path is relative to that corner.

export type Point = { x: number; y: number }

export const PEN_COLORS = ['#f8fafc', '#facc15', '#f87171', '#4ade80', '#60a5fa'] as const
export const PEN_WIDTHS = [2, 4, 8] as const
// Room around the path so thick strokes aren't clipped by the node box.
export const STROKE_PADDING = 8

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

// Ramer–Douglas–Peucker: drops points that add less than `tolerance` of
// deviation, keeping the stroke's shape with far fewer points.
export function simplifyStroke(points: Point[], tolerance = 1.5): Point[] {
  if (points.length <= 2) return points.slice()
  let maxDistance = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], points[0], points[points.length - 1])
    if (distance > maxDistance) { maxDistance = distance; index = i }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]]
  const left = simplifyStroke(points.slice(0, index + 1), tolerance)
  const right = simplifyStroke(points.slice(index), tolerance)
  return [...left.slice(0, -1), ...right]
}

const round = (value: number) => Math.round(value * 10) / 10

// Smooth SVG path through the points (quadratic curves via midpoints).
export function strokeToPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${round(points[0].x)} ${round(points[0].y)}l0.1 0`
  if (points.length === 2) return `M${round(points[0].x)} ${round(points[0].y)}L${round(points[1].x)} ${round(points[1].y)}`
  let path = `M${round(points[0].x)} ${round(points[0].y)}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
    path += `Q${round(points[i].x)} ${round(points[i].y)} ${round(mid.x)} ${round(mid.y)}`
  }
  const last = points[points.length - 1]
  return `${path}L${round(last.x)} ${round(last.y)}`
}

// Turns a captured stroke into the node to store: position, size, and a
// path relative to the node's corner. Null for an accidental click.
export function buildDrawingNode(points: Point[], strokeWidth: number, tolerance = 1.5) {
  if (points.length === 0) return null
  const simplified = simplifyStroke(points, tolerance)
  const pad = STROKE_PADDING + strokeWidth / 2
  const minX = Math.min(...simplified.map((p) => p.x)) - pad
  const minY = Math.min(...simplified.map((p) => p.y)) - pad
  const maxX = Math.max(...simplified.map((p) => p.x)) + pad
  const maxY = Math.max(...simplified.map((p) => p.y)) + pad
  const relative = simplified.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  return {
    position: { x: round(minX), y: round(minY) },
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
    path: strokeToPath(relative),
    points: simplified.length,
  }
}
