// Sizing for Canvas text labels. A label's font size is a preset (S/M/L/XL)
// or any size set by dragging its corner; the corner scales font and width
// together, the right edge sets only the wrap width.

export const TEXT_SIZES = { s: 14, m: 20, l: 32, xl: 48 } as const
export type TextSize = keyof typeof TEXT_SIZES
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 240
export const MIN_TEXT_WIDTH = 60

export function readTextSize(value: unknown): TextSize {
  return typeof value === 'string' && value in TEXT_SIZES ? value as TextSize : 'm'
}

export function readFontSize(data: Record<string, unknown>): number {
  const custom = data.fontSize
  if (typeof custom === 'number' && Number.isFinite(custom)) return clamp(custom, MIN_FONT_SIZE, MAX_FONT_SIZE)
  return TEXT_SIZES[readTextSize(data.size)]
}

// Corner drag: the label's rendered width grows by dx (screen px ÷ zoom),
// and font size and any fixed width scale by the same ratio.
export function scaleTextLabel(
  start: { fontSize: number; renderedWidth: number; width?: number },
  dx: number,
  zoom: number,
): { fontSize: number; width?: number } {
  const base = Math.max(1, start.renderedWidth)
  const ratio = Math.max(0.05, (base + dx / (zoom || 1)) / base)
  const fontSize = Math.round(clamp(start.fontSize * ratio, MIN_FONT_SIZE, MAX_FONT_SIZE))
  const applied = fontSize / start.fontSize
  return {
    fontSize,
    ...(start.width !== undefined ? { width: Math.round(Math.max(MIN_TEXT_WIDTH, start.width * applied)) } : {}),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
