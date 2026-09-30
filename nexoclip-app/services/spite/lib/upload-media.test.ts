import assert from 'node:assert/strict'
import test from 'node:test'

import { uploadMediaFile } from './upload-media'
import { getLocalUploadPreview, setLocalUploadPreview, subscribeLocalUploadPreviews } from './local-upload-previews'

test('uploads go through the authenticated proxy with the requested prefix', async () => {
  let request: { url: string; form: FormData } | null = null
  const fetchFn = (async (url: string, init: RequestInit) => {
    request = { url, form: init.body as FormData }
    return new Response(JSON.stringify({ url: '/api/r2-image/refs/1-a.png', key: 'refs/1-a.png' }))
  }) as unknown as typeof fetch
  const result = await uploadMediaFile(new Blob(['x'], { type: 'image/png' }), { filename: 'a.png', prefix: 'refs', fetchFn })
  assert.match(request!.url, /\/api\/r2-upload$/)
  assert.equal(request!.form.get('prefix'), 'refs')
  assert.equal(result.key, 'refs/1-a.png')
})

test('upload failures surface the server message', async () => {
  const fetchFn = (async () => new Response(JSON.stringify({ error: 'File is too large (max 200 MB)' }), { status: 413 })) as unknown as typeof fetch
  await assert.rejects(uploadMediaFile(new Blob(['x']), { filename: 'a.mp4', fetchFn }), /too large/)
})

test('local upload previews notify subscribers and are per node', () => {
  const originalRevoke = URL.revokeObjectURL
  const revoked: string[] = []
  URL.revokeObjectURL = (url: string) => { revoked.push(url) }
  let notified = 0
  const unsubscribe = subscribeLocalUploadPreviews(() => { notified += 1 })
  try {
    setLocalUploadPreview('n1', 'blob:one')
    assert.equal(getLocalUploadPreview('n1'), 'blob:one')
    assert.equal(getLocalUploadPreview('n2'), undefined)
    setLocalUploadPreview('n1', null)
    assert.equal(getLocalUploadPreview('n1'), undefined)
    assert.deepEqual(revoked, ['blob:one'])
    assert.equal(notified, 2)
  } finally {
    unsubscribe()
    URL.revokeObjectURL = originalRevoke
  }
})
