import type { ModelConfig } from './fal-models'

export type FolderType = 'character' | 'prop' | 'location' | 'general'
export type MediaKind = 'image' | 'video' | 'audio'

interface MentionInput {
  folderId: string
  name: string
  selectedAssetIds: string[]
  selectedWorkspaceAssetIds?: string[]
}

interface FolderInput {
  id: string
  name: string
  type: FolderType
  assets: { id: string; workspaceAssetId?: string; r2_url: string; type?: MediaKind | string }[]
}

// One logical "subject" worth of reference images. For folder mentions
// this is all the URLs the user picked from one folder; for wired refs
// (video-node's reference-in handle) it's a single URL with no folder
// context. The server consumes groups directly when the target model is
// element-based (Kling v3), and flattens them otherwise.
export interface ReferenceGroup {
  urls: string[]
  // Media kind of each url (same order). Missing means image.
  kinds?: MediaKind[]
  workspaceAssetIds: string[]
  folderName?: string
  folderType?: FolderType
}

// How aggressively to rewrite @FolderTag tokens in the prompt:
//   citation-flat     — model expects "@Image{N}" / "@Element{N}" where
//                       N is the slot in a flat URL array (Seedance,
//                       Kling 1.6, Kling o1).
//   citation-elements — model expects "@Element{N}" where N is the
//                       element index in a grouped structure (Kling v3).
//   multi             — model has a multi-image input but no citation
//                       grammar (Nano Banana). Rewrite to plain English.
//   single            — model accepts a single reference image (FLUX
//                       i2i, Kling 1.0/1.5 image-to-video). Only the
//                       first mention gets a slot; the rest fall back
//                       to their folder name as plain text.
//   none              — model has no reference-image support at all.
//                       Tags become readable folder names so the prompt
//                       still makes sense; no URLs are sent.
//   citation-media    — Seedance omni: images, videos, and audio are each
//                       numbered on their own (@Image N, @Video N, @Audio N)
//                       and sent as separate reference lists.
export type RefStrategy =
  | 'citation-media'
  | 'citation-flat'
  | 'citation-elements'
  | 'multi'
  | 'single'
  | 'none'

export interface CompiledMentions {
  prompt: string
  // Image references only; videos and audio clips go in their own lists.
  refGroups: ReferenceGroup[]
  videoUrls: string[]
  audioUrls: string[]
  strategy: RefStrategy
  // Mentions whose folder no longer exists (only reported once folders have
  // loaded). Generating with them would send images that were deleted.
  missingFolders: string[]
}

// Must match tagFromName in mention-textarea.tsx — collapses any run of
// non-word chars to a dash so "Elias' Horse" matches "@Elias-Horse".
function tagFromName(name: string): string {
  return name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')
}

function exactReference(type: FolderType, reference: string): string {
  if (type === 'character') {
    return `the exact same person/character shown in ${reference}, and preserve facial identity, facial structure, skin tone, hairstyle, and distinguishing features without substitution or redesign`
  }
  if (type === 'prop') {
    return `the exact same object shown in ${reference}, and preserve its shape, geometry, materials, colors, markings, and distinguishing details without substitution or redesign`
  }
  if (type === 'location') {
    return `the exact same location shown in ${reference}, and preserve its spatial layout, architecture, landmarks, materials, and distinguishing details without substitution or redesign`
  }
  return `the exact same subject shown in ${reference}, and preserve its identity and distinguishing details without substitution or redesign`
}

export function pickRefStrategy(model: ModelConfig | null | undefined): RefStrategy {
  if (!model) return 'none'
  // Frame tasks cannot carry references; omni tasks take every kind.
  if (model.videoTaskMode === 'frame') return 'none'
  if (model.videoTaskMode === 'omni') return 'citation-media'
  if (model.referenceCite) {
    return model.referenceParam === 'elements' ? 'citation-elements' : 'citation-flat'
  }
  if (model.referenceParam || model.imageParam === 'image_urls') return 'multi'
  if (model.imageParam === 'image_url') return 'single'
  // Video models without explicit imageParam still accept a single
  // first-frame image via image_url/start_image_url. One folder ref can
  // ride in that slot, so treat as single-ref capable.
  if (model.category === 'video' && model.inputTypes.includes('image') && model.editModel) {
    return 'single'
  }
  return 'none'
}

// Folder rows carry their media type, but videos added before the folder
// modal knew about media types were recorded as images; trust the file
// extension over an 'image' label.
function mediaKind(type: unknown, url?: string): MediaKind {
  if (type === 'video' || type === 'audio') return type
  if (url && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return 'video'
  if (url && /\.(mp3|wav|m4a|ogg|aac|flac)(\?|$)/i.test(url)) return 'audio'
  return 'image'
}

const CITE: Record<MediaKind, string> = { image: '@Image', video: '@Video', audio: '@Audio' }

function collectGroups(
  prompt: string,
  mentions: MentionInput[],
  folders: FolderInput[],
): {
  groupsByFolderId: Map<string, ReferenceGroup>
  orderedFolderIds: string[]
} {
  const groupsByFolderId = new Map<string, ReferenceGroup>()
  const orderedFolderIds: string[] = []
  const seen = new Set<string>()

  const consider = (folder: FolderInput, selectedIds?: string[], selectedWorkspaceIds?: string[]) => {
    if (seen.has(folder.id)) return
    const canonicalIds = [...new Set((selectedWorkspaceIds ?? []).filter(Boolean))]
    if (canonicalIds.length > 0) {
      seen.add(folder.id)
      groupsByFolderId.set(folder.id, {
        urls: canonicalIds.map((assetId) => `/api/assets/${encodeURIComponent(assetId)}/download`),
        kinds: canonicalIds.map((assetId) => {
          const asset = folder.assets.find((candidate) => candidate.workspaceAssetId === assetId)
          return mediaKind(asset?.type, asset?.r2_url)
        }),
        workspaceAssetIds: canonicalIds,
        folderName: folder.name,
        folderType: folder.type,
      })
      orderedFolderIds.push(folder.id)
      return
    }

    const useAll = !selectedIds || selectedIds.length === 0
    const idSet = new Set(selectedIds || [])
    const workspaceIdSet = new Set(selectedWorkspaceIds || [])
    const requested = folder.assets
      .filter((asset) => useAll || idSet.has(asset.id) || (asset.workspaceAssetId && workspaceIdSet.has(asset.workspaceAssetId)))
    // Workspace assets are preferred because the worker can resolve their
    // authoritative Trust state. Assets that are not imported/trusted remain
    // valid raw image references rather than blocking the whole mention.
    const usable = requested
      .map((asset) => ({
        url: asset.workspaceAssetId ? `/api/assets/${encodeURIComponent(asset.workspaceAssetId)}/download` : asset.r2_url,
        kind: mediaKind(asset.type, asset.r2_url),
      }))
      .filter((asset) => Boolean(asset.url))
    if (usable.length === 0) return
    seen.add(folder.id)
    groupsByFolderId.set(folder.id, {
      urls: usable.map((asset) => asset.url),
      kinds: usable.map((asset) => asset.kind),
      workspaceAssetIds: requested.flatMap((asset) => asset.workspaceAssetId ? [asset.workspaceAssetId] : []),
      folderName: folder.name,
      folderType: folder.type,
    })
    orderedFolderIds.push(folder.id)
  }

  for (const m of mentions) {
    const folder = folders.find((f) => f.id === m.folderId) ?? {
      id: m.folderId,
      name: m.name,
      type: 'general' as const,
      assets: [],
    }
    consider(folder, m.selectedAssetIds, m.selectedWorkspaceAssetIds)
  }
  // Only fall back to name matching for tags that have no mention metadata.
  // Otherwise two folders sharing a name (e.g. "alur4" as both a location and
  // a character) both got sent, pushing the request past the reference limit.
  const mentionedTags = new Set(mentions.map((m) => tagFromName(m.name).toLowerCase()))
  const scanRe = /@([\w-]+)/g
  let scanMatch: RegExpExecArray | null
  while ((scanMatch = scanRe.exec(prompt))) {
    const tag = scanMatch[1].toLowerCase()
    if (mentionedTags.has(tag)) continue
    const folder = folders.find((f) => tagFromName(f.name).toLowerCase() === tag)
    if (folder) consider(folder)
  }

  return { groupsByFolderId, orderedFolderIds }
}

// `prefixRefCount`: refs that precede folder mentions in the final
// payload — wired pink-handle refs on video-node, or a primary image at
// slot 0 for image_urls-style image models. Used by citation-flat to
// compute correct slot numbers; for citation-elements it counts wired
// element-groups that ride before folder elements.
export function compileMentionsForModel(
  prompt: string,
  mentions: MentionInput[],
  folders: FolderInput[],
  model: ModelConfig | null | undefined,
  prefixRefCount = 0,
): CompiledMentions {
  const strategy = pickRefStrategy(model)
  const collected = collectGroups(prompt, mentions, folders)
  // Keep only the media kinds this model accepts; a folder left empty is
  // treated like an unmentioned one (its tag stays plain text).
  const accepts: Record<MediaKind, boolean> = {
    image: true,
    video: strategy === 'citation-media' && Boolean(model?.maxReferenceVideos),
    audio: strategy === 'citation-media' && Boolean(model?.supportsReferenceAudio),
  }
  const groupsByFolderId = new Map<string, ReferenceGroup>()
  for (const [folderId, group] of collected.groupsByFolderId) {
    const keep = group.urls.map((_, i) => accepts[group.kinds?.[i] ?? 'image'])
    const urls = group.urls.filter((_, i) => keep[i])
    if (urls.length === 0) continue
    groupsByFolderId.set(folderId, { ...group, urls, kinds: (group.kinds ?? group.urls.map(() => 'image' as const)).filter((_, i) => keep[i]) })
  }
  const orderedFolderIds = collected.orderedFolderIds.filter((folderId) => groupsByFolderId.has(folderId))

  // citation-media numbers each kind separately, in mention order. Images
  // start after `prefixRefCount` (wired images that ride first).
  const mediaCites = new Map<string, string[]>()
  if (strategy === 'citation-media') {
    const counters: Record<MediaKind, number> = { image: prefixRefCount, video: 0, audio: 0 }
    for (const fid of orderedFolderIds) {
      const group = groupsByFolderId.get(fid)!
      mediaCites.set(fid, group.urls.map((_, i) => {
        const kind = group.kinds?.[i] ?? 'image'
        counters[kind] += 1
        return `${CITE[kind]}${counters[kind]}`
      }))
    }
  }

  // Pre-compute slot starts for citation-flat / multi (slot index = position
  // in the final flat URL array).
  const slotStarts = new Map<string, number>()
  if (strategy === 'citation-flat' || strategy === 'multi') {
    let cursor = prefixRefCount
    for (const fid of orderedFolderIds) {
      slotStarts.set(fid, cursor)
      cursor += groupsByFolderId.get(fid)!.urls.length
    }
  }
  const firstFolderId = orderedFolderIds[0]

  // The long "exact same ..., preserve ..." instruction is only spelled out
  // the first time a folder is mentioned; later mentions reuse the bare
  // citation. Repeating it on every mention blew long multi-shot prompts past
  // the provider's 10,000-character limit.
  const expanded = new Set<string>()
  const withIdentity = (folderId: string, type: FolderType, reference: string): string => {
    if (expanded.has(folderId)) return reference
    expanded.add(folderId)
    return exactReference(type, reference)
  }

  const citationFor = (folderId: string): string => {
    const group = groupsByFolderId.get(folderId)!
    const name = group.folderName || ''
    const type = group.folderType || 'general'

    if (strategy === 'citation-media') {
      return withIdentity(folderId, type, mediaCites.get(folderId)!.join(' '))
    }
    if (strategy === 'citation-flat') {
      const start = slotStarts.get(folderId)!
      const cite = model!.referenceCite
      const references = Array.from(
        { length: group.urls.length },
        (_, i) => `${cite}${start + i + 1}`,
      ).join(' ')
      return withIdentity(folderId, type, references)
    }
    if (strategy === 'citation-elements') {
      const i = orderedFolderIds.indexOf(folderId)
      const cite = model!.referenceCite
      return withIdentity(folderId, type, `${cite}${prefixRefCount + i + 1}`)
    }
    if (strategy === 'multi') {
      const start = slotStarts.get(folderId)!
      const references = group.urls.length > 1
        ? `reference images ${start + 1}-${start + group.urls.length}`
        : `reference image ${start + 1}`
      return withIdentity(folderId, type, references)
    }
    if (strategy === 'single') {
      if (folderId !== firstFolderId) return name
      return withIdentity(folderId, type, 'reference image 1')
    }
    return name
  }

  const rewritten = prompt.replace(/@([\w-]+)/g, (match, tag) => {
    const tagLower = (tag as string).toLowerCase()
    const mention = mentions.find(
      (candidate) => tagFromName(candidate.name).toLowerCase() === tagLower,
    )
    const folder = folders.find(
      (candidate) => candidate.id === mention?.folderId || tagFromName(candidate.name).toLowerCase() === tagLower,
    ) ?? (mention ? {
      id: mention.folderId,
      name: mention.name,
      type: 'general' as const,
      assets: [],
    } : undefined)
    if (!folder) return match
    if (!groupsByFolderId.has(folder.id)) return match
    return citationFor(folder.id)
  })

  let refGroups: ReferenceGroup[] = []
  const videoUrls: string[] = []
  const audioUrls: string[] = []
  if (strategy === 'none') {
    refGroups = []
  } else if (strategy === 'citation-media') {
    for (const fid of orderedFolderIds) {
      const group = groupsByFolderId.get(fid)!
      const kinds = group.kinds ?? group.urls.map(() => 'image' as const)
      group.urls.forEach((url, i) => {
        if (kinds[i] === 'video') videoUrls.push(url)
        else if (kinds[i] === 'audio') audioUrls.push(url)
      })
      const images = group.urls.filter((_, i) => kinds[i] === 'image')
      if (images.length) refGroups.push({ ...group, urls: images, kinds: images.map(() => 'image' as const) })
    }
  } else if (strategy === 'single') {
    if (firstFolderId) {
      const first = groupsByFolderId.get(firstFolderId)!
      refGroups = [{ ...first, urls: first.urls.slice(0, 1) }]
    }
  } else {
    refGroups = orderedFolderIds.map((fid) => groupsByFolderId.get(fid)!)
  }

  const missingFolders = folders.length === 0
    ? []
    : [...new Set(mentions.filter((m) => !folders.some((f) => f.id === m.folderId)).map((m) => m.name))]

  return { prompt: rewritten, refGroups, videoUrls, audioUrls, strategy, missingFolders }
}
