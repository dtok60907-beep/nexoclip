// Longest prompt the NexoClip generation API accepts, counted after @mentions
// are expanded (src/services/generationService.js). Checked before submit so
// an oversized prompt is reported in Canvas instead of failing at the server.
export const MAX_VIDEO_PROMPT_CHARS = 20000
export const MAX_IMAGE_PROMPT_CHARS = 10000
