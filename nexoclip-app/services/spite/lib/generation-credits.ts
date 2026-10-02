'use client'

import { useEffect, useState } from 'react'
import { getModelById } from './fal-models'

// What a generation will actually be charged, in NexoClip credits, from the
// same pricing the server reserves with (GET /api/generations/price on the
// main app). The old estimate used fal's USD list prices, which had nothing
// to do with the credits taken.

export type GenerationKind = 'image' | 'video'

export type CreditPriceInput = {
  kind: GenerationKind
  modelId: string | undefined
  count?: number
  resolution?: string
  duration?: string | number
  aspectRatio?: string
  draft?: boolean
  extend?: boolean
  edit?: boolean
  referenceImages?: number
  referenceVideos?: number
  promptLength?: number
}

export type CreditEstimate = { isKnown: boolean; perUnit: number; total: number }

// Confirm before submitting batches above this (~$10 of provider cost).
export const CREDIT_CONFIRM_THRESHOLD = 1300

// The model id the server receives (and prices), mirroring the submit route.
export function nexoclipModelId(modelId: string | undefined, kind: GenerationKind): string | undefined {
  if (!modelId) return undefined
  const model = getModelById(modelId)
  return model && model.category === kind ? `${model.provider}/${model.providerModel}` : modelId
}

export function creditPriceQuery(input: CreditPriceInput): string | null {
  const model = nexoclipModelId(input.modelId, input.kind)
  if (!model) return null
  const query = new URLSearchParams({ kind: input.kind, model })
  if (input.resolution) query.set('resolution', input.resolution)
  if (input.aspectRatio) query.set('aspectRatio', input.aspectRatio)
  // 'auto' is priced as -1, which reserves for the model's longest output.
  const duration = input.duration === 'auto' || input.edit ? -1 : Number.parseInt(String(input.duration ?? ''), 10)
  if (Number.isInteger(duration)) query.set('duration', String(duration))
  if (input.draft) query.set('draft', '1')
  if (input.edit) query.set('omniReferenceTaskType', 'edit')
  else if (input.extend) query.set('omniReferenceTaskType', 'extend')
  if (input.referenceImages) query.set('referenceImages', String(input.referenceImages))
  if (input.referenceVideos) query.set('referenceVideos', String(input.referenceVideos))
  // Bucketed so typing in the prompt does not refetch on every keystroke.
  if (input.promptLength) query.set('promptLength', String(Math.ceil(input.promptLength / 1000) * 1000))
  return query.toString()
}

const cache = new Map<string, Promise<number | null>>()

export function fetchCreditPrice(query: string, fetchFn: typeof fetch = fetch): Promise<number | null> {
  let pending = cache.get(query)
  if (!pending) {
    // Root path on purpose: this is the main app's API, not the Canvas one.
    pending = fetchFn(`/api/generations/price?${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`price ${response.status}`)
        const body = await response.json() as { credits?: number | null }
        return typeof body.credits === 'number' ? body.credits : null
      })
      .catch(() => {
        cache.delete(query)
        return null
      })
    cache.set(query, pending)
  }
  return pending
}

export function useGenerationCredits(input: CreditPriceInput): CreditEstimate {
  const query = creditPriceQuery(input)
  const count = Math.max(1, input.count ?? 1)
  const [perUnit, setPerUnit] = useState<number | null>(null)
  useEffect(() => {
    if (!query) { setPerUnit(null); return }
    let cancelled = false
    void fetchCreditPrice(query).then((credits) => { if (!cancelled) setPerUnit(credits) })
    return () => { cancelled = true }
  }, [query])
  return perUnit === null
    ? { isKnown: false, perUnit: 0, total: 0 }
    : { isKnown: true, perUnit, total: Math.round(perUnit * count * 10) / 10 }
}

export function formatCredits(credits: number): string {
  const rounded = Math.round(credits * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toLocaleString('en-US') : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} credits`
}

// Compact form for buttons; rounds up so it never understates the charge.
export function formatCreditsShort(credits: number): string {
  return `${Math.ceil(credits - 1e-9).toLocaleString('en-US')} cr`
}
