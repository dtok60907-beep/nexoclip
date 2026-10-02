// Shared palette for sticky notes and text labels. Notes use `paper` as the
// background with `ink` text; text labels use `text` on the dark canvas.
export type BoardColorId = 'yellow' | 'orange' | 'pink' | 'purple' | 'blue' | 'green'

export const BOARD_COLORS: Record<BoardColorId, { label: string; paper: string; ink: string; text: string }> = {
  yellow: { label: 'Yellow', paper: '#fde68a', ink: '#3f2d05', text: '#fde047' },
  orange: { label: 'Orange', paper: '#fdba74', ink: '#431407', text: '#fb923c' },
  pink: { label: 'Pink', paper: '#f9a8d4', ink: '#500724', text: '#f472b6' },
  purple: { label: 'Purple', paper: '#c4b5fd', ink: '#2e1065', text: '#a78bfa' },
  blue: { label: 'Blue', paper: '#93c5fd', ink: '#172554', text: '#60a5fa' },
  green: { label: 'Green', paper: '#86efac', ink: '#052e16', text: '#4ade80' },
}

export const BOARD_COLOR_IDS = Object.keys(BOARD_COLORS) as BoardColorId[]

export function readBoardColor(value: unknown, fallback: BoardColorId = 'yellow'): BoardColorId {
  return typeof value === 'string' && value in BOARD_COLORS ? value as BoardColorId : fallback
}
