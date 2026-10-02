import { getModelById, type ModelConfig } from './fal-models'

export type GenerationKind = 'image' | 'video'

export interface EffectiveGenerationSettings {
  modelId: string
  model: ModelConfig | undefined
  aspectRatio: string
  resolution: string
  duration: string
  enableAudio: boolean
  draftMode: boolean
  extendMode: boolean
  editMode: boolean
  outputFormat: 'mp4' | 'mov'
  watermark: boolean
  returnLastFrame: boolean
  count: number
}

const DEFAULT_MODEL: Record<GenerationKind, string> = {
  image: 'nano-banana-pro',
  video: 'seedance-2.0',
}

export const AUTO_DURATION = 'auto'

export function clampVideoDurationSeconds(value: unknown, min = 5): number {
  return Math.min(30, Math.max(min, Number.parseInt(String(value || '5'), 10) || 5))
}

// Shortest duration the model lists (Seedance 2.5 goes down to 4s).
export function minVideoDurationSeconds(model: ModelConfig | undefined): number {
  const seconds = (model?.durations || []).map((value) => Number.parseInt(value, 10)).filter(Number.isFinite)
  return seconds.length ? Math.min(5, ...seconds) : 5
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// The single source of truth for what a generator node will actually use.
// The settings panel and the node used to fall back to different defaults
// for unset fields (the panel showed the model default while the node sent
// an empty value and let the provider pick), so what you saw was not what
// was generated.
export function resolveGenerationSettings(kind: GenerationKind, data: Record<string, unknown> | undefined | null): EffectiveGenerationSettings {
  const d = data || {}
  const requestedModelId = text(d.modelId) || DEFAULT_MODEL[kind]
  const model = getModelById(requestedModelId) || getModelById(DEFAULT_MODEL[kind])
  const modelId = model?.id || requestedModelId
  const aspectRatio = text(d.aspectRatio) || model?.defaultAspectRatio || (kind === 'video' ? '16:9' : '1:1')
  const resolution = text(d.resolution) || model?.defaultResolution || ''
  const editMode = kind === 'video' && Boolean(model?.supportsEdit) && Boolean(d.editMode)
  // Edit always keeps the source video's length, so it is always auto.
  const autoDuration = kind === 'video' && Boolean(model?.supportsAutoDuration) && (editMode || text(d.duration) === AUTO_DURATION)
  const duration = kind !== 'video' ? ''
    : autoDuration ? AUTO_DURATION
    : `${clampVideoDurationSeconds(text(d.duration) || model?.defaultDuration, minVideoDurationSeconds(model))}s`
  const supportsAudio = kind === 'video' && Boolean(model?.supportsAudio)
  return {
    modelId,
    model,
    aspectRatio,
    resolution,
    duration,
    enableAudio: supportsAudio ? ((d.enableAudio as boolean | undefined) ?? true) : false,
    draftMode: Boolean(model?.supportsDraft) && Boolean(d.draftMode),
    extendMode: Boolean(model?.supportsExtend) && Boolean(d.extendMode) && !editMode,
    editMode,
    outputFormat: model?.supportsMov && d.outputFormat === 'mov' ? 'mov' : 'mp4',
    watermark: Boolean(model?.supportsWatermark) && Boolean(d.watermark),
    returnLastFrame: Boolean(model?.supportsLastFrame) && Boolean(d.returnLastFrame),
    count: Math.max(1, Math.min(4, Number(d[kind === 'video' ? 'numVideos' : 'numImages']) || 1)),
  }
}

// Fields to write when the model changes, carrying over the toggles the new
// model supports and resetting the rest to its defaults.
export function settingsForModelChange(kind: GenerationKind, nextModelId: string, data: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const current = resolveGenerationSettings(kind, data)
  const next = resolveGenerationSettings(kind, { modelId: nextModelId })
  const model = next.model
  return {
    modelId: next.modelId,
    aspectRatio: next.aspectRatio,
    resolution: next.resolution,
    ...(kind === 'video' ? {
      duration: next.duration,
      enableAudio: model?.supportsAudio ? current.enableAudio : false,
      draftMode: model?.supportsDraft ? current.draftMode : false,
      extendMode: model?.supportsExtend ? current.extendMode : false,
      editMode: model?.supportsEdit ? current.editMode : false,
      outputFormat: model?.supportsMov ? current.outputFormat : 'mp4',
      watermark: model?.supportsWatermark ? current.watermark : false,
      returnLastFrame: model?.supportsLastFrame ? current.returnLastFrame : false,
    } : {}),
  }
}
