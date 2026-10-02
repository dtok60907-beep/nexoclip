import type { ModelConfig } from './fal-models'

// Seedance limits on reference media length, checked before submit so a bad
// clip fails here instead of after the job is queued (and billed).
//   - every video / audio clip: 2–30s (edit source videos: 4–30s)
//   - total video and total audio: 30s on Seedance 2.5, 15s on 2.0
export function referenceDurationError({
  model, editMode, videoSeconds, audioSeconds,
}: {
  model: ModelConfig | undefined
  editMode: boolean
  // NaN for a clip whose length could not be read; it is skipped.
  videoSeconds: number[]
  audioSeconds: number[]
}): string | null {
  const total = /seedance-2\.5/.test(model?.id || '') ? 30 : 15
  const known = (values: number[]) => values.filter(Number.isFinite)
  const sum = (values: number[]) => known(values).reduce((acc, value) => acc + value, 0)
  const fmt = (value: number) => `${Math.round(value * 10) / 10}s`

  const minVideo = editMode ? 4 : 2
  for (const [index, seconds] of videoSeconds.entries()) {
    if (!Number.isFinite(seconds)) continue
    if (seconds < minVideo || seconds > 30) {
      return `@Video${index + 1} is ${fmt(seconds)} — ${editMode ? 'the video to edit' : 'reference videos'} must be ${minVideo}–30s.`
    }
  }
  for (const [index, seconds] of audioSeconds.entries()) {
    if (!Number.isFinite(seconds)) continue
    if (seconds < 2 || seconds > 30) return `@Audio${index + 1} is ${fmt(seconds)} — reference audio must be 2–30s.`
  }
  if (sum(videoSeconds) > total + 0.05) return `Reference videos add up to ${fmt(sum(videoSeconds))} — ${model?.name ?? 'this model'} takes at most ${total}s in total.`
  if (sum(audioSeconds) > total + 0.05) return `Reference audio adds up to ${fmt(sum(audioSeconds))} — ${model?.name ?? 'this model'} takes at most ${total}s in total.`
  return null
}

// Reads a clip's length from its metadata. Resolves NaN when the browser
// cannot load it in time, so an unreadable clip never blocks generation.
export function probeMediaDuration(url: string, kind: 'video' | 'audio', timeoutMs = 8000): Promise<number> {
  if (typeof document === 'undefined') return Promise.resolve(Number.NaN)
  return new Promise((resolve) => {
    const element = document.createElement(kind)
    let settled = false
    const finish = (value: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      element.removeAttribute('src')
      element.load()
      resolve(value)
    }
    const timer = setTimeout(() => finish(Number.NaN), timeoutMs)
    element.preload = 'metadata'
    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? element.duration : Number.NaN)
    element.onerror = () => finish(Number.NaN)
    element.src = url
  })
}
