export type ModelCategory = 'image' | 'video'
export type InputType = 'text' | 'image' | 'video'
export type DirectProvider = 'google' | 'openai' | 'byteplus'

export interface ModelConfig {
  id: string
  name: string
  provider: DirectProvider
  providerModel: string
  falModel: string // Kept as a UI compatibility alias; contains no fal endpoint.
  category: ModelCategory
  inputTypes: InputType[]
  // Seedance task family: 'omni' takes every reference through @mentions and
  // has no media handles; 'frame' pins a wired first (and optional last) frame.
  videoTaskMode?: 'omni' | 'frame'
  supportsDraft?: boolean
  supportsExtend?: boolean
  supportsEdit?: boolean
  // Duration -1: the model picks the length (edit: the source video's length).
  supportsAutoDuration?: boolean
  supportsReferenceAudio?: boolean
  supportsMov?: boolean
  supportsWatermark?: boolean
  // Most source videos / audio clips one request accepts.
  maxReferenceVideos?: number
  maxReferenceAudios?: number
  aspectRatios: string[]
  durations?: string[]
  resolutions?: string[]
  supportsAudio?: boolean
  supportsLoop?: boolean
  imageParam?: 'image_url' | 'image_urls' | 'start_image_url'
  referenceParam?: 'image_urls' | 'elements' | 'input_image_urls' | 'subject_reference_image_url'
  referenceModel?: string
  referenceCite?: '@Image' | '@Element'
  editModel?: string
  defaultAspectRatio: string
  defaultDuration?: string
  defaultResolution?: string
  description: string
}

const image = (
  id: string, name: string, provider: DirectProvider, providerModel: string,
  aspectRatios: string[], resolutions?: string[], defaultAspectRatio = '1:1', defaultResolution?: string,
): ModelConfig => ({
  id, name, provider, providerModel, falModel: providerModel, category: 'image',
  inputTypes: ['text', 'image'], imageParam: 'image_urls', aspectRatios, resolutions, defaultAspectRatio,
  defaultResolution, description: `${name} via ${provider === 'byteplus' ? 'BytePlus' : provider === 'openai' ? 'OpenAI' : 'Google'}`,
})

const video = (
  id: string, name: string, providerModel: string, resolutions: string[], durations: string[],
): ModelConfig => ({
  id, name, provider: 'byteplus', providerModel, falModel: providerModel,
  category: 'video', inputTypes: ['text', 'image'], imageParam: 'image_urls',
  aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  resolutions, durations, supportsAudio: true, defaultAspectRatio: '16:9',
  // 720p when offered: nodes now send this default explicitly (it used to be
  // left to the provider), and 1080p costs roughly twice the tokens.
  defaultDuration: '5s', defaultResolution: resolutions.includes('720p') ? '720p' : resolutions[0],
  description: `${name} direct via BytePlus`,
})

const NANO_RATIOS = ['auto', '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9']
const STANDARD_RATIOS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4']
const SEEDREAM_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '21:9']

export const IMAGE_MODELS: ModelConfig[] = [
  image('nano-banana', 'Nano Banana', 'google', 'gemini-2.5-flash-image', NANO_RATIOS),
  image('nano-banana-pro', 'Nano Banana Pro', 'google', 'gemini-3-pro-image', NANO_RATIOS, ['1K', '2K', '4K']),
  image('nano-banana-2', 'Nano Banana 2', 'google', 'gemini-3.1-flash-image', NANO_RATIOS, ['1K', '2K', '4K'], 'auto', '1K'),
  image('nano-banana-2-lite', 'Nano Banana 2 Lite', 'google', 'gemini-3.1-flash-lite-image', NANO_RATIOS),
  image('gpt-image-1.5', 'GPT Image 1.5', 'openai', 'gpt-image-1.5', ['1:1', '2:3', '3:2'], ['low', 'medium', 'high'], '1:1', 'medium'),
  image('gpt-image-2', 'GPT Image 2', 'openai', 'gpt-image-2', STANDARD_RATIOS, ['1K', '2K', '4K'], 'auto', '2K'),
  image('seedream-3', 'Seedream 3', 'byteplus', 'seedream-3.0-t2i', SEEDREAM_RATIOS),
  image('seedream-4', 'Seedream 4', 'byteplus', 'seedream-4-0-250828', SEEDREAM_RATIOS, ['1K', '2K', '4K'], '1:1', '4K'),
  image('seedream-4.5', 'Seedream 4.5', 'byteplus', 'seedream-4-5-251128', SEEDREAM_RATIOS, ['2K', '4K'], '1:1', '2K'),
  image('seedream-4.5-unfiltered', 'Seedream 4.5 Unfiltered', 'byteplus', 'ep-20260907150312-xx7gf', SEEDREAM_RATIOS, ['2K', '4K'], '1:1', '2K'),
  image('seedream-5', 'Seedream 5.0', 'byteplus', 'seedream-5-0-260128', SEEDREAM_RATIOS, ['1K', '2K'], '1:1', '1K'),
  image('seedream-5-pro', 'Seedream 5.0 Pro', 'byteplus', 'dola-seedream-5-0-pro-260628', SEEDREAM_RATIOS, ['1K', '2K'], '1:1', '1K'),
  image('seedream-5-pro-unfiltered', 'Seedream 5.0 Pro Unfiltered', 'byteplus', 'seedream-5.0-pro-unfiltered', SEEDREAM_RATIOS, ['1K', '2K'], '1:1', '1K'),
  image('seedream-5-lite-unfiltered', 'Seedream 5.0 Lite Unfiltered', 'byteplus', 'ep-20260907150433-zg8fr', SEEDREAM_RATIOS, ['1K', '2K', '4K'], '1:1', '2K'),
]

const SEEDANCE_25_DURATIONS = Array.from({ length: 27 }, (_, i) => `${i + 4}s`)

// Shared by both Seedance 2.5 task families.
const SEEDANCE_25_COMMON: Partial<ModelConfig> = {
  supportsDraft: true,
  supportsAutoDuration: true,
  supportsMov: true,
  supportsWatermark: true,
  aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
}

const SEEDANCE_25_OMNI: Partial<ModelConfig> = {
  ...SEEDANCE_25_COMMON,
  videoTaskMode: 'omni',
  supportsExtend: true,
  supportsEdit: true,
  supportsReferenceAudio: true,
  maxReferenceVideos: 10,
  maxReferenceAudios: 10,
  inputTypes: ['text', 'image', 'video'],
}

// First/last-frame tasks follow the first frame's shape, so only adaptive.
const SEEDANCE_25_FRAME: Partial<ModelConfig> = {
  ...SEEDANCE_25_COMMON,
  videoTaskMode: 'frame',
  inputTypes: ['text', 'image'],
  aspectRatios: ['adaptive'],
  defaultAspectRatio: 'adaptive',
}

const omni = (model: ModelConfig, extra: Partial<ModelConfig> = {}): ModelConfig => ({
  ...model, videoTaskMode: 'omni', name: `${model.name} · Omni`, description: `${model.name} with @mention references (images, videos, audio)`, ...extra,
})
const frame = (model: ModelConfig, extra: Partial<ModelConfig> = {}): ModelConfig => ({
  ...model, id: `${model.id}-frame`, videoTaskMode: 'frame', name: `${model.name} · Frame`, description: `${model.name} from a wired first (and optional last) frame`, ...extra,
})

const SEEDANCE_20 = video('seedance-2.0', 'Seedance 2.0', 'dreamina-seedance-2-0-260128', ['720p', '1080p'], ['5s', '10s', '15s'])
const SEEDANCE_20_UNFILTERED = video('seedance-2.0-unfiltered', 'Seedance 2.0 Unfiltered', 'seedance-2.0-unfiltered', ['720p', '1080p'], ['5s', '10s', '15s'])
const SEEDANCE_25 = video('seedance-2.5', 'Seedance 2.5', 'dreamina-seedance-2-5-260628', ['480p', '720p', '1080p'], SEEDANCE_25_DURATIONS)
const SEEDANCE_25_UNFILTERED = video('seedance-2.5-unfiltered', 'Seedance 2.5 Unfiltered', 'seedance-2.5-unfiltered', ['480p', '720p', '1080p'], SEEDANCE_25_DURATIONS)

// The omni entry keeps each model's original id so existing nodes stay valid.
export const VIDEO_MODELS: ModelConfig[] = [
  omni(SEEDANCE_20),
  frame(SEEDANCE_20),
  omni(SEEDANCE_20_UNFILTERED),
  frame(SEEDANCE_20_UNFILTERED),
  omni(SEEDANCE_25, SEEDANCE_25_OMNI),
  frame(SEEDANCE_25, SEEDANCE_25_FRAME),
  omni(SEEDANCE_25_UNFILTERED, SEEDANCE_25_OMNI),
  frame(SEEDANCE_25_UNFILTERED, SEEDANCE_25_FRAME),
]

export const FAL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS]
const MODELS = FAL_MODELS
const LEGACY_ALIASES: Record<string, string> = {
  'seedance-1.5': 'seedance-2.0',
  'bytedance-seedream-v4.5': 'seedream-4.5',
  'seedream-5.0': 'seedream-5',
}

export function getModelById(id: string): ModelConfig | undefined {
  return MODELS.find((model) => model.id === (LEGACY_ALIASES[id] || id))
}
export const getModelsByCategory = (category: ModelCategory) => MODELS.filter((model) => model.category === category)
export const getImageModels = () => IMAGE_MODELS
export const getVideoModels = () => VIDEO_MODELS

export function buildModelInput(model: ModelConfig, prompt: string, options: Record<string, any> = {}) {
  return {
    prompt,
    aspectRatio: options.aspectRatio || model.defaultAspectRatio,
    resolution: options.resolution || model.defaultResolution,
    duration: Number.parseInt(options.duration || model.defaultDuration || '5', 10),
    generateAudio: !!options.enableAudio,
    referenceImages: [options.imageUrl, ...(options.referenceImageUrls || []), ...((options.referenceGroups || []).flatMap((g: { urls: string[] }) => g.urls))].filter(Boolean),
    endImageUrl: options.endImageUrl,
  }
}
