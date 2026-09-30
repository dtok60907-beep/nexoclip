import { withBasePath } from './base-path'

// Browser uploads always go through the authenticated /api/r2-upload proxy.
// Direct presigned PUTs to R2 need a bucket CORS rule, and production has
// none (preflight answers 403), so every upload from the folder modal, the
// compress node and Flow's reference picker failed with "Failed to fetch".
export async function uploadMediaFile(
  file: Blob,
  { filename, prefix = 'uploads', fetchFn = fetch }: { filename: string; prefix?: 'uploads' | 'refs'; fetchFn?: typeof fetch },
): Promise<{ url: string; key: string }> {
  const form = new FormData()
  form.append('file', file, filename)
  form.append('filename', filename)
  form.append('prefix', prefix)
  const response = await fetchFn(withBasePath('/api/r2-upload'), { method: 'POST', body: form })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Upload failed (${response.status})`)
  }
  const body = await response.json() as { url?: string; key?: string }
  if (!body.url || !body.key) throw new Error('Upload response is missing the file URL')
  return { url: withBasePath(body.url), key: body.key }
}
