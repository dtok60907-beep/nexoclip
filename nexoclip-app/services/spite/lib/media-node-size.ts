// Uploaded image/video nodes were created at a fixed 320×260, so a tall photo
// was cropped by the node frame. Once the media's real size is known, the
// node is resized to its aspect ratio (media area + the label footer).

type Bounds = { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number }

export const MEDIA_NODE_WIDTH = 320
// The label row under the media (py-2 + 10px text) plus the card border.
export const MEDIA_NODE_FOOTER = 36

export function fitMediaNodeSize(
  naturalWidth: number,
  naturalHeight: number,
  bounds: Bounds,
  width = MEDIA_NODE_WIDTH,
  footer = MEDIA_NODE_FOOTER,
): { width: number; height: number } | null {
  if (!(naturalWidth > 0 && naturalHeight > 0)) return null
  const ratio = naturalHeight / naturalWidth
  let nodeWidth = Math.min(Math.max(width, bounds.minWidth), bounds.maxWidth)
  let mediaHeight = nodeWidth * ratio
  // Too tall for the frame: keep the ratio by narrowing the node instead.
  if (mediaHeight + footer > bounds.maxHeight) {
    mediaHeight = bounds.maxHeight - footer
    nodeWidth = Math.max(bounds.minWidth, mediaHeight / ratio)
    mediaHeight = Math.min(mediaHeight, nodeWidth * ratio)
  }
  return {
    width: Math.round(nodeWidth),
    height: Math.round(Math.max(bounds.minHeight, mediaHeight + footer)),
  }
}

// A node follows its media's shape until someone resizes it by hand (the
// frame clears `autoSizedFor`); replacing an auto-sized node's media refits it.
export function shouldAutoSizeMediaNode(data: Record<string, unknown>, mediaKey: string): boolean {
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return true
  return typeof data.autoSizedFor === 'string' && data.autoSizedFor !== mediaKey
}
