// Previews of files this tab is uploading, keyed by node id. They stay in
// this tab only: blob: URLs used to be written into the shared canvas, where
// collaborators, other tabs and every later reload got a URL that cannot be
// opened (and kept it for good when the upload failed).
const previews = new Map<string, string>()
const listeners = new Set<() => void>()

export function setLocalUploadPreview(nodeId: string, url: string | null): void {
  const previous = previews.get(nodeId)
  if (previous && previous !== url) URL.revokeObjectURL(previous)
  if (url) previews.set(nodeId, url)
  else previews.delete(nodeId)
  for (const listener of listeners) listener()
}

export function getLocalUploadPreview(nodeId: string): string | undefined {
  return previews.get(nodeId)
}

export function subscribeLocalUploadPreviews(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
