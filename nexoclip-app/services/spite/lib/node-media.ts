// Single source of truth for "what image/video does this node actually hold?"
//
// Node types store their media under different keys depending on how they got
// it: generated nodes use `outputUrl`, uploads/reference nodes use `thumbnail`
// or `assetUrl`, video nodes additionally carry `videoThumbnail` (a poster
// frame). Input-collection code that only checked a subset silently dropped
// connected references — the edge looked attached, but nothing was sent to the
// model, so you paid for a generation that ignored your reference. Every
// consumer must resolve through here so that can't drift again.

import { withBasePath, withGenerationOutputBasePath } from './base-path'
import { resolveWorkspaceAssetId, workspaceAssetIdFromUrl } from './byteplus-trust'

type NodeData = Record<string, unknown> | undefined | null

function str(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined
  if (v.startsWith('/api/assets/')) return withGenerationOutputBasePath(v)
  // Repair generated URLs persisted before the Canvas/app route split, or
  // under whichever base path (/spite, /canvas) was active when they were saved.
  if (v.startsWith('/spite/api/assets/')) return v.slice('/spite'.length)
  if (v.startsWith('/canvas/api/assets/')) return v.slice('/canvas'.length)
  return v.startsWith('/api/') ? withBasePath(v) : v
}

/**
 * The media URL a node can hand downstream, or undefined if it has none yet
 * (e.g. a generator that hasn't run, or an upload still in flight).
 */
export function resolveNodeMediaUrl(data: NodeData): string | undefined {
  if (!data) return undefined
  const d = data as Record<string, unknown>
  // Prefer a real output; fall back to upload/reference fields. `videoThumbnail`
  // is last: it's a poster frame, only useful when nothing else exists.
  return (
    str(d.outputUrl) ??
    str(d.assetUrl) ??
    str(d.thumbnail) ??
    str(d.imageUrl) ??
    str(d.videoThumbnail)
  )
}

/**
 * The URL to submit when this node is wired into a generator. Unlike the
 * display URL, it points at the node's workspace asset whenever it has one —
 * the same asset Trust for Seedance is recorded against. Sending the legacy
 * upload URL instead made the worker miss the trust record, so a trusted
 * photo of a real person still went to BytePlus raw and was rejected.
 */
export function resolveNodeReferenceUrl(data: NodeData): string | undefined {
  const url = resolveNodeMediaUrl(data)
  if (!data || workspaceAssetIdFromUrl(url)) return url
  const assetId = resolveWorkspaceAssetId(url, (data as Record<string, unknown>).workspaceAssetId)
  return assetId ? `/api/assets/${assetId}/download` : url
}

/** True when the node currently has nothing to hand downstream. */
export function nodeHasNoMedia(data: NodeData): boolean {
  return resolveNodeMediaUrl(data) === undefined
}

// Display-only: small tiles (asset panel, reference nodes, input chips) load
// the server's 512px WebP of a workspace asset instead of the full original.
// Never store this URL in node data or send it to a provider.
export function displayThumbnailUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  if (!/^(?:\/canvas)?\/api\/assets\/[^/?#]+\/download$/.test(url)) return url
  return `${url}?variant=thumb`
}
