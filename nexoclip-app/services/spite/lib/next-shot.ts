import { withBasePath } from '@/lib/base-path'
import { workspaceAssetIdFromUrl } from '@/lib/byteplus-trust'

// "Next shot" continues a finished video in a new Omni shot: the video's last
// frame becomes one more @mentioned reference next to the previous shot's
// references, so the next shot can keep every character, prop and location
// (a Frame-mode shot pins the frame exactly but can't carry references).

export type NextShotMention = {
  folderId: string
  name: string
  selectedAssetIds: string[]
  selectedWorkspaceAssetIds?: string[]
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const tagFromName = (name: string) => name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')

export function lastFrameFolderName(sourceLabel: string, now = new Date()): string {
  const label = sourceLabel.trim().slice(0, 24).trim() || 'shot'
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `End of ${label} ${time}`
}

// The new shot's prompt: an instruction to open on the last frame, then the
// previous prompt (with its mentions) for the user to rewrite.
export function buildNextShotPrompt(
  previousText: string,
  previousMentions: NextShotMention[],
  frame: NextShotMention,
): { text: string; mentions: NextShotMention[] } {
  const opening = `Start this shot exactly on @${tagFromName(frame.name)} (the last frame of the previous shot) and continue from there.`
  const rest = previousText.trim()
  return {
    text: rest ? `${opening}\n\n${rest}` : opening,
    mentions: [frame, ...previousMentions.filter((mention) => mention.folderId !== frame.folderId)],
  }
}

// Registers the last frame as a project asset and puts it in a new General
// folder, returning the mention that references it.
export async function createLastFrameMention({
  projectId,
  lastFrameUrl,
  sourceLabel,
  fetchFn = (input, init) => fetch(input, init),
  now = new Date(),
}: {
  projectId: string
  lastFrameUrl: string
  sourceLabel: string
  fetchFn?: FetchLike
  now?: Date
}): Promise<NextShotMention> {
  const name = lastFrameFolderName(sourceLabel, now)
  const query = new URLSearchParams({ projectId, url: lastFrameUrl })
  const lookup = await fetchFn(withBasePath(`/api/assets/by-url?${query}`))
  let assetId: string | undefined = lookup.ok ? (await lookup.json().catch(() => null))?.id : undefined
  if (!assetId) {
    const registration = await fetchFn(withBasePath('/api/assets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: lastFrameUrl, type: 'image', filename: name, projectId }),
    })
    if (!registration.ok) throw new Error(`Couldn't save the last frame (${registration.status})`)
    assetId = (await registration.json().catch(() => null))?.id
  }
  if (!assetId) throw new Error("Couldn't save the last frame")

  const workspaceAssetId = workspaceAssetIdFromUrl(lastFrameUrl)
  const folder = await fetchFn(withBasePath('/api/folders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: 'Last frame of a finished shot',
      type: 'general',
      assetIds: [assetId],
      workspaceAssetIds: workspaceAssetId ? { [assetId]: workspaceAssetId } : {},
      projectId,
    }),
  })
  const payload = await folder.json().catch(() => null)
  if (!folder.ok || !payload?.id) throw new Error(payload?.error || `Couldn't create the last-frame folder (${folder.status})`)

  return {
    folderId: String(payload.id),
    name,
    selectedAssetIds: [assetId],
    ...(workspaceAssetId ? { selectedWorkspaceAssetIds: [workspaceAssetId] } : {}),
  }
}
