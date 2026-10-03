'use client'

import { confirmDialog } from '@/components/ui/dialog-host'
import { withBasePath, withGenerationOutputBasePath } from '@/lib/base-path'
import { Position, NodeResizer, NodeProps, Handle, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { useParams } from 'next/navigation'
import { CaretDown, TextT, Image as ImageIcon, FilmStrip, CircleNotch, X, Check, ArrowsClockwise, Minus, Plus, Sparkle, Play } from '@phosphor-icons/react'
import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { GeneratorNodeToolbar } from './node-toolbar'
import { GenerationGallery } from '../generation-gallery'
import { ShotSelector, type ShotOption } from './shot-selector'
import { useSceneShots } from './use-scene-shots'
import { Lightbox } from '../lightbox'
import { labelFromPrompt, DEFAULT_VIDEO_LABEL } from '@/lib/auto-name'
import { getVideoModels, getModelById, buildModelInput, type ModelConfig } from '@/lib/fal-models'
import { CREDIT_CONFIRM_THRESHOLD, formatCredits, formatCreditsShort, useGenerationCredits } from '@/lib/generation-credits'
import { resolveNodeMediaUrl, resolveNodeReferenceUrl } from '@/lib/node-media'
import { findUntrustedReferences } from '@/lib/byteplus-trust'
import { resolveGenerationSettings, settingsForModelChange } from '@/lib/generation-settings'
import { FIRST_POLL_DELAY_MS, GIVE_UP_AFTER_MS, isHiddenDocument, nextPollDelay } from '@/lib/generation-poll-schedule'
import { useNodeOwnershipLock } from '@/hooks/use-node-ownership-lock'
import { MAX_VIDEO_PROMPT_CHARS } from '@/lib/prompt-limits'
import { compileMentionsForModel } from '@/lib/mention-prompt'
import { probeMediaDuration, referenceDurationError } from '@/lib/media-duration'
import { useProjectFolders } from '@/hooks/use-project-folders'
import { completeGenerationNode } from '@/lib/generation-node'
import { ConnectedInputs } from '../connected-inputs'
import { captureVideoThumbnail } from '@/lib/video-thumbnail'
import { useCanvasCollaboration } from '../canvas-collaboration'
import { createLocalStateSyncGuard } from '@/lib/local-state-sync'
import { mentionStateKey } from '@/lib/mention-state'
import { getGenerationPersistenceGuard } from '@/lib/canvas-runtime-ui'
import { createGenerationStatusQuery, getGenerationPromptState, parseAspectRatio, resolveIncomingPrompt } from '@/lib/canvas-node-interactions'
import { GenerationFeedbackOverlay, getGenerationFeedbackState, isTerminalGenerationStatus, getTerminalGenerationToast } from './generation-feedback'

const VIDEO_MODELS = getVideoModels()
type GenerationStatus = 'idle' | 'submitting' | 'in_queue' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

function ControlSelect({ value, disabled, section = 'model' }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
  // Which part of the settings panel this control opens.
  section?: 'model' | 'resolution' | 'aspect' | 'duration'
}) {
  return (
    <button
      type="button"
      data-generation-setting={section}
      disabled={disabled}
      className="nodrag nopan flex h-7 items-center gap-1.5 bg-transparent px-0 text-[12px] font-semibold text-slate-100 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      title="Choose model and open generation settings"
    >
      {value}
      <CaretDown size={11} weight="bold" className="text-slate-500" />
    </button>
  )
}

function HandleIcon({ icon: Icon, color, position, top, visible = true }: { 
  icon: React.ElementType
  color: string
  position: 'left' | 'right'
  top: number
  visible?: boolean 
}) {
  if (!visible) return null
  
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#111316',
        border: `1.5px solid ${color}`,
        top: top,
        transform: 'translateY(-50%)',
        [position === 'left' ? 'left' : 'right']: -12,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <Icon size={11} weight="bold" style={{ color }} />
    </div>
  )
}

function StatusBadge({ status, progress }: { status: GenerationStatus; progress?: number }) {
  if (status === 'idle') return null
  
  const statusConfig: Record<GenerationStatus, { label: string; color: string }> = {
    idle: { label: '', color: '' },
    submitting: { label: 'Submitting...', color: 'text-blue-400' },
    in_queue: { label: 'In Queue', color: 'text-yellow-400' },
    in_progress: { label: progress ? `${Math.round(progress * 100)}%` : 'Generating...', color: 'text-accent' },
    completed: { label: 'Done', color: 'text-green-400' },
    failed: { label: 'Failed', color: 'text-red-400' },
    cancelled: { label: 'Cancelled', color: 'text-gray-400' },
  }

  const config = statusConfig[status]

  return (
    <div className={`flex items-center gap-1.5 text-[9px] font-mono ${config.color}`}>
      {(status === 'submitting' || status === 'in_queue' || status === 'in_progress') && (
        <CircleNotch size={10} className="animate-spin" />
      )}
      {status === 'completed' && <Check size={10} weight="bold" />}
      {status === 'failed' && <X size={10} weight="bold" />}
      {config.label}
    </div>
  )
}

function VideoNodeImpl({ id, data, selected }: NodeProps) {
  const params = useParams()
  // Route segment is [id], so the param is `id` (not `projectId`).
  const projectId = params.id as string
  const nodeLock = useNodeOwnershipLock(projectId, id)
  // Upscaler mode (only meaningful when modelId is 'topaz-video-upscale').
  // 'standard' hits the plug-n-play endpoint; 'creative' hits the
  // prompt-aware variant. Persists in node data so it survives reload.
  const [upscaleMode, setUpscaleMode] = useState<'standard' | 'creative'>(
    (data.upscaleMode as 'standard' | 'creative') || 'standard',
  )
  // Depth-map colouring. Grayscale is the raw depth data and the only variant
  // safe to feed into a depth-conditioned model; the colormaps are for when you
  // want the depth pass itself as a visual element.
  const [colormap, setColormap] = useState<string>((data.colormap as string) || 'grayscale')
  const [modelId, setModelId] = useState((data.modelId as string) || 'seedance-1.5')
  const [duration, setDuration] = useState((data.duration as string) || '')
  const [aspectRatio, setAspectRatio] = useState((data.aspectRatio as string) || '16:9')
  const [resolution, setResolution] = useState((data.resolution as string) || '')
  const [enableAudio, setEnableAudio] = useState((data.enableAudio as boolean | undefined) ?? true)
  const [draftMode, setDraftMode] = useState((data.draftMode as boolean) || false)
  const [extendMode, setExtendMode] = useState((data.extendMode as boolean) || false)
  const [editMode, setEditMode] = useState((data.editMode as boolean) || false)
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'mov'>(data.outputFormat === 'mov' ? 'mov' : 'mp4')
  const [watermark, setWatermark] = useState((data.watermark as boolean) || false)
  const [returnLastFrame, setReturnLastFrame] = useState((data.returnLastFrame as boolean) || false)
  const [enableLoop, setEnableLoop] = useState((data.enableLoop as boolean) || false)
  // Kling 2.6 voice IDs — up to 2, comma-separated in the input box.
  // User pastes IDs they generated from fal's create-voice endpoint;
  // SPITE forwards them as voice_ids on submit. They reference voices
  // in the prompt with <<<voice_1>>> / <<<voice_2>>>.
  const [voiceIds, setVoiceIds] = useState((data.voiceIds as string) || '')
  // Video models are expensive enough (Seedance ≈ $4.50 per 5-sec clip,
  // Kling Pro variants higher) that we deliberately DON'T persist the
  // counter across reloads. Every session starts at 1, and bumping it
  // up has to be a conscious action — "I want 3 Seedance shots" should
  // require typing it in, not get inherited from a forgotten setting.
  // Image counters persist (cheaper, often-used in batches of 6).
  const [numVideos, setNumVideos] = useState(1)
  
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [progress, setProgress] = useState<number | undefined>()
  const [error, setError] = useState<string | null>(null)
  // Errors from an action in this session also go to a toast: the node's
  // error strip can sit under its control bar. Syncing a stored error from
  // node data calls setError directly, so a reload doesn't replay toasts.
  // Poll failures use the generation's terminal toast id, so the toast the
  // durable status effect raises for the same job replaces it.
  const reportError = (message: string, toastId = `${id}-error`, tone: 'error' | 'warning' = 'error') => {
    setError(message)
    if (tone === 'warning') toast.warning(message, { id: toastId, duration: 10000 })
    else toast.error(message, { id: toastId })
  }
  const [outputUrl, setOutputUrl] = useState<string | null>(resolveNodeMediaUrl({ outputUrl: data.outputUrl }) || null)
  const [generationId, setGenerationId] = useState<string | null>(null)
  // Timestamp of the most recent submission. Powers the relative-age
  // display in the right-side jobs panel.
  const [submittedAt, setSubmittedAt] = useState<number | undefined>(
    (data.submittedAt as number) || undefined,
  )
  // The exact fal queue path to poll, as told to us by the submit response.
  const [providerModel, setProviderModel] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')

  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const announcedOutputRef = useRef(outputUrl)
  const lastAnnouncedGenerationRef = useRef<string | null>(null)
  const regenerationRef = useRef(false)
  // React state updates after this event; lock synchronous repeat clicks meanwhile.
  const submitInFlightRef = useRef(false)
  // Set true to immediately stop polling (cancel / unmount).
  const stopRef = useRef(false)
  const { getEdges, getNodes } = useReactFlow()
  const { addEdges, addNodes, createNextShot, patchNodeData, persistenceStatus, replaceShot, updateNodeData } = useCanvasCollaboration()
  const updateNodeInternals = useUpdateNodeInternals()
  const syncGuardRef = useRef(createLocalStateSyncGuard())
  // Collaboration methods are recreated when the shared canvas snapshot changes.
  // Keep persistence wrappers stable so those renders cannot reset generation polling.
  const patchNodeDataRef = useRef(patchNodeData)
  const updateNodeDataRef = useRef(updateNodeData)
  patchNodeDataRef.current = patchNodeData
  updateNodeDataRef.current = updateNodeData
  const patchPersistedNodeData = useCallback((patch: Record<string, unknown>) => {
    if (!syncGuardRef.current.allowsPersistence()) return
    patchNodeDataRef.current(id, patch)
  }, [id])
  // Automatic writes (job state, results, derived fields) stay out of undo:
  // Ctrl+Z must not revert a finished output or a job that is still running.
  const updatePersistedNodeData = useCallback((updater: (currentData: Record<string, unknown>) => Record<string, unknown>) => {
    if (!syncGuardRef.current.allowsPersistence()) return
    updateNodeDataRef.current(id, updater, { undoable: false })
  }, [id])
  const patchSystemNodeData = useCallback((patch: Record<string, unknown>) => {
    if (!syncGuardRef.current.allowsPersistence()) return
    patchNodeDataRef.current(id, patch, { undoable: false })
  }, [id])
  
  // Prompt text is read from the connected Text node at render and again
  // immediately before submission; this node never owns a prompt.
  const resolvedPrompt = resolveIncomingPrompt(id, getNodes(), getEdges())
  const promptState = getGenerationPromptState(id, getNodes(), getEdges())
  const generationPersistenceGuard = getGenerationPersistenceGuard(persistenceStatus)
  const { folders } = useProjectFolders(projectId)

  // Check connection states fresh on each render
  let hasConnectedFirstFrame = false
  // Media edges drawn before the Omni/Frame split; omni nodes ignore them.
  let hasMediaEdges = false
  try {
    const edges = getEdges()
    const allIncomingEdges = edges.filter(edge => edge.target === id)
    hasConnectedFirstFrame = allIncomingEdges.some(e =>
      e.targetHandle === 'image-in' ||
      (e.sourceHandle === 'image-out' && e.targetHandle !== 'end-frame-in' && e.targetHandle !== 'reference-in' && e.targetHandle !== 'video-in')
    )
    hasMediaEdges = allIncomingEdges.some(e => e.targetHandle !== 'prompt-in')
  } catch { /* ignore */ }

  // Get current model config
  const currentModel = useMemo(() => getModelById(modelId), [modelId])

  // When the model changes, the conditional handles (image-in, reference-in,
  // video-in, end-frame-in) appear or disappear. React Flow caches handle
  // positions on first measurement — without a manual nudge those caches
  // stay stale until something else re-measures (e.g., a page reload).
  // That's why edges to handles that ONLY exist for the new model were
  // sometimes added to state but not drawn: React Flow had no position
  // for the new handle yet. Tell it to re-measure whenever the handle set
  // shape changes.
  useEffect(() => {
    updateNodeInternals(id)
  }, [
    id,
    updateNodeInternals,
    currentModel?.id,
    currentModel?.inputTypes,
    currentModel?.referenceParam,
    currentModel?.category,
  ])

  useEffect(() => {
    const finishSync = syncGuardRef.current.beginPropSync()
    // Resolve unset fields exactly like the settings panel does, so the node
    // shows and submits the same values the panel displays.
    const effective = resolveGenerationSettings('video', data as Record<string, unknown>)
    setUpscaleMode((data.upscaleMode as 'standard' | 'creative') || 'standard')
    setColormap((data.colormap as string) || 'grayscale')
    setModelId(effective.modelId)
    setDuration(effective.duration)
    setAspectRatio(effective.aspectRatio)
    setResolution(effective.resolution)
    setEnableAudio(effective.enableAudio)
    setDraftMode(effective.draftMode)
    setExtendMode(effective.extendMode)
    setEditMode(effective.editMode)
    setOutputFormat(effective.outputFormat)
    setWatermark(effective.watermark)
    setReturnLastFrame(effective.returnLastFrame)
    setEnableLoop((data.enableLoop as boolean) || false)
    setVoiceIds((data.voiceIds as string) || '')
    setNumVideos((data.numVideos as number) || 1)
    const durableStatus = data.generationStatus === 'failed'
      ? 'failed'
      : data.generationStatus === 'completed'
        ? 'completed'
        : undefined
    setStatus(durableStatus || (data.status as GenerationStatus) || ((data.outputUrl as string | undefined) ? 'completed' : 'idle'))
    setError((data.generationError as string) || (data.error as string) || null)
    setSubmittedAt((data.submittedAt as number) || undefined)
    setOutputUrl(resolveNodeMediaUrl({ outputUrl: data.outputUrl }) || null)
    queueMicrotask(finishSync)
  }, [data.aspectRatio, data.colormap, data.duration, data.enableAudio, data.draftMode, data.extendMode, data.editMode, data.outputFormat, data.watermark, data.returnLastFrame, data.enableLoop, data.error, data.generationError, data.generationStatus, data.modelId, data.numVideos, data.outputUrl, data.resolution, data.status, data.submittedAt, data.upscaleMode, data.voiceIds])

  useEffect(() => {
    if (outputUrl && outputUrl !== announcedOutputRef.current) {
      window.dispatchEvent(new CustomEvent('asset-status-changed'))
    }
    announcedOutputRef.current = outputUrl
  }, [outputUrl])

  const durableGenerationId = (data.lastGenerationId as string | undefined) || (data.generationId as string | undefined) || null

  // Seed initial announced generation on mount: if the node loads with a
  // terminal durable generation already present, mark it announced so we
  // don't replay its toast. If the node loads with an active generation
  // (in-progress/queued) that's a regeneration, do NOT seed it so when the
  // same id later becomes terminal it'll notify exactly once.
  useEffect(() => {
    if (durableGenerationId && isTerminalGenerationStatus(data.generationStatus)) {
      lastAnnouncedGenerationRef.current = durableGenerationId
    }
    // run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Emit a terminal toast once per generation id when we observe a terminal
  // state. lastAnnouncedGenerationRef prevents duplicates across re-renders
  // and polling reconciliation.
  useEffect(() => {
    if (!durableGenerationId) return

    const notice = getTerminalGenerationToast({
      mediaKind: 'video',
      generationId: durableGenerationId,
      generationStatus: data.generationStatus,
      error: (data.generationError as string) || (data.error as string) || null,
      isRegeneration: regenerationRef.current,
      lastAnnouncedGenerationId: lastAnnouncedGenerationRef.current,
    })
    if (!notice) return

    lastAnnouncedGenerationRef.current = notice.generationId
    const toastId = `${id}-${notice.generationId}-terminal`
    if (notice.tone === 'success') toast.success(notice.message, { id: toastId })
    else toast.error(notice.message, { id: toastId })
  }, [data.error, data.generationError, data.generationStatus, durableGenerationId, id])

  // Repair durable asset URLs written by pre-fix bundles before rendering.
  // Covers whichever base path (/spite, and later /canvas) was active when
  // the stale URL was persisted.
  useEffect(() => {
    const prefix = typeof data.outputUrl === 'string' && data.outputUrl.startsWith('/spite/api/assets/')
      ? '/spite'
      : typeof data.outputUrl === 'string' && data.outputUrl.startsWith('/canvas/api/assets/')
        ? '/canvas'
        : null
    if (typeof data.outputUrl !== 'string' || !prefix) return
    const repaired = data.outputUrl.slice(prefix.length)
    setOutputUrl(repaired)
    updatePersistedNodeData((currentData) => ({
      ...completeGenerationNode(currentData, repaired),
      generationId: undefined,
    }))
  }, [data.outputUrl, updatePersistedNodeData])

  // Kling v3 references ride the image-to-video endpoint, which requires a
  // first frame. Block generation (with a clear message) when refs are
  // connected but no first frame, so the user gets a helpful error not a
  // confusing fal validation failure.
  // Frame models pin a wired first frame; omni models take every reference
  // (images, videos, audio) through @mentions and have no media handles.
  const isFrameModel = currentModel?.videoTaskMode === 'frame'
  const blockedNoFirstFrame = isFrameModel && !hasConnectedFirstFrame
  const mentionedMedia = useMemo(
    () => isFrameModel ? null : compileMentionsForModel(resolvedPrompt.prompt || '', resolvedPrompt.mentions || [], folders, currentModel),
    [currentModel, folders, isFrameModel, resolvedPrompt.mentions, resolvedPrompt.prompt],
  )
  // Extend and edit both work on a source video @mentioned in the prompt.
  const blockedNoExtendVideo = (extendMode || editMode) && !mentionedMedia?.videoUrls.length

  // Reset settings when the USER picks a new model. Skip the initial mount
  // so saved settings on a reloaded or duplicated node aren't immediately
  // clobbered by model defaults.
  const prevModelIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentModel) return
    if (prevModelIdRef.current === null) {
      prevModelIdRef.current = currentModel.id
      return
    }
    if (prevModelIdRef.current !== currentModel.id) {
      if (!syncGuardRef.current.allowsPersistence()) {
        prevModelIdRef.current = currentModel.id
        return
      }
      setAspectRatio(currentModel.defaultAspectRatio)
      setDuration(currentModel.defaultDuration || '')
      setResolution(currentModel.defaultResolution || '')
      setEnableAudio(false)
      setEnableLoop(false)
      prevModelIdRef.current = currentModel.id
    }
  }, [currentModel])

  const selectedShotId = data.shotId as string | undefined
  // useNodes() would re-render this component on every sibling node change
  // (prompt keystrokes, generation status updates, etc.). useSceneShots
  // subscribes only to a string signature of shot-relevant fields.
  const shots = useSceneShots(id)

  const handleShotSelect = (shotId: string) => {
    // Empty string from the selector means "unassign from this shot".
    syncGuardRef.current.beginUserEdit()
    patchPersistedNodeData({ shotId: shotId || undefined })
  }

  // Take a shot over exclusively: assign it here and unassign whatever other
  // node in the SAME scene currently holds it (shotId or legacy selectedShotId).
  const handleShotReplace = (shotId: string) => {
    replaceShot(id, shotId)
  }

  const handleNewShot = () => {
    // Always create the NEXT number after the highest existing shot in the
    // scene — so shots monotonically increase (shot 99 → New Shot creates
    // shot 100). Gaps between numbers are intentional and shown as empty
    // placeholders in the timeline.
    syncGuardRef.current.beginUserEdit()
    createNextShot(id)
  }

  // Auto-name: once a generation completes, replace the default
  // "Video Generator #N" label with the first few words of the prompt.
  // User-renamed labels are left alone.
  useEffect(() => {
    if (!outputUrl) return
    const current = (data.label as string) || ''
    if (current && !DEFAULT_VIDEO_LABEL.test(current)) return
    const derived = labelFromPrompt(resolvedPrompt.prompt)
    if (!derived || derived === current) return
    patchSystemNodeData({ label: derived })
  }, [data.label, outputUrl, patchSystemNodeData, resolvedPrompt.prompt])

  const handleRename = () => {
    setLabelDraft((data.label as string) || '')
    setIsRenaming(true)
  }
  const commitRename = () => {
    const next = labelDraft.trim()
    setIsRenaming(false)
    if (!next) return
    syncGuardRef.current.beginUserEdit()
    patchPersistedNodeData({ label: next })
  }

  // Capture a freeze-frame from the rendered video so the scene-shot bar
  // can show a thumbnail (an <img> can't render an mp4). Re-captures when
  // outputUrl changes (new generation); skips when the stored thumbnail
  // already matches the current outputUrl (after reload).
  useEffect(() => {
    if (!outputUrl) return
    if (data.videoThumbnailFor === outputUrl && data.videoThumbnail) return
    let cancelled = false
    captureVideoThumbnail(outputUrl).then(thumb => {
      if (cancelled || !thumb) return
      patchSystemNodeData({ videoThumbnail: thumb, videoThumbnailFor: outputUrl })
    })
    return () => { cancelled = true }
  }, [data.videoThumbnail, data.videoThumbnailFor, outputUrl, patchSystemNodeData])

  // Resume polling only for an active durable job. A failed/completed job can
  // retain a legacy generationId, but must never be rendered as in queue.
  useEffect(() => {
    const pending = data.generationId as string | undefined
    const active = ['queued', 'processing', 'running'].includes(String(data.generationStatus))
    if (pending && active && !generationId) {
      regenerationRef.current = Boolean(outputUrl)
      setProviderModel((data.pendingProviderModel as string) || null)
      setGenerationId(pending)
      setStatus('in_queue')
      // Restore the start-of-generation timestamp (or assume now if the
      // page was refreshed and we don't have it stored). Used by the
      // 10-minute soft timeout below.
      const startedAt = (data.pendingStartedAt as number | undefined) ?? Date.now()
      startTimeRef.current = startedAt
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear the persisted in-flight job marker when the generation resolves.
  const clearPending = useCallback(() => {
    patchSystemNodeData({
      pendingProvider: undefined,
      pendingProviderModel: undefined,
      pendingFalEndpoint: undefined,
      pendingStartedAt: undefined,
    })
  }, [patchSystemNodeData])

  // 10-minute soft timeout. Stops polling and marks the node failed, but
  // does NOT clear generationId — the user can click "Re-check
  // result" to poll again in case fal completed after the timeout
  // window. Resets when the user clicks re-check or triggers a new
  // generation.
  const TIMEOUT_MS = GIVE_UP_AFTER_MS
  const startTimeRef = useRef<number | null>(null)
  // Bumped to force the polling effect to restart on user-initiated re-check.
  const [resumeToken, setResumeToken] = useState(0)

  // Poll for status
  const pollStatus = useCallback(async (reqId: string) => {
    if (stopRef.current) return true
    // Soft timeout check — bail BEFORE the next round-trip so we don't
    // continue hammering fal indefinitely. The generationId stays in node
    // data so the user can manually re-check.
    if (startTimeRef.current && Date.now() - startTimeRef.current > TIMEOUT_MS) {
      setStatus('failed')
      reportError('Still not finished after 45 minutes. The server may still complete it — use \'Re-check\' before generating again, so you don\'t pay twice.', `${id}-${reqId}-terminal`, 'warning')
      return true
    }
    try {
      const statusQuery = createGenerationStatusQuery({
        nodeId: id, generationId: reqId, projectId,
      })
      const response = await fetch(withBasePath(`/api/generate/status?${statusQuery}`))
      const result = await response.json()

      // Cancelled while this request was in flight — drop the result.
      if (stopRef.current) return true

      if (result.error) {
        setStatus('failed')
        reportError(result.error, `${id}-${reqId}-terminal`)
        clearPending()
        return true
      }

      if (result.generationStatus === 'completed') {
        setProgress(undefined)
        // API returns { output: { videos: [...], url: '...' } }
        const videoUrl = result.outputUrl
        if (videoUrl) {
          const completedUrl = withGenerationOutputBasePath(videoUrl)
          setOutputUrl(completedUrl)
          setStatus('completed')
          setGenerationId(null)
          updatePersistedNodeData((currentData) => ({
            ...completeGenerationNode(currentData, completedUrl),
            lastFrameUrl: typeof result.lastFrameUrl === 'string' ? result.lastFrameUrl : null,
            ...(currentData.draftMode ? { lastGenerationId: reqId } : {}),
            generationId: undefined,
          }))
          clearPending()
        } else {
          setStatus('failed')
          reportError('Provider completed without a video URL', `${id}-${reqId}-terminal`)
          clearPending()
        }
        return true
      }

      if (result.generationStatus === 'failed') {
        setStatus('failed')
        reportError(result.error || 'Generation failed', `${id}-${reqId}-terminal`)
        clearPending()
        return true
      }

      if (result.generationStatus === 'processing') {
        setStatus('in_progress')
        if (result.progress !== undefined) {
          setProgress(result.progress)
        }
      } else if (result.generationStatus === 'queued') {
        setStatus('in_queue')
      }

      return false
    } catch (err) {
      console.error('Poll error:', err)
      return false
    }
  }, [clearPending, getEdges, getNodes, id, projectId])

  // Start polling when we have a generationId. resumeToken is included as
  // a dep so a user-initiated re-check (handleRecheck below) restarts the
  // polling loop even though generationId itself didn't change.
  useEffect(() => {
    if (!generationId || !currentModel) return
    stopRef.current = false

    const startedAt = startTimeRef.current ?? Date.now()
    const poll = async () => {
      if (stopRef.current) return
      // Hidden tabs don't poll; the visible tab (or the server) reconciles
      // the result into the shared canvas, and this resumes on focus.
      if (isHiddenDocument()) return
      const shouldStop = await pollStatus(generationId)
      if (!shouldStop && !stopRef.current) {
        pollingRef.current = setTimeout(poll, nextPollDelay(Date.now() - startedAt))
      }
    }
    const resumeWhenVisible = () => {
      if (isHiddenDocument() || stopRef.current) return
      if (pollingRef.current) clearTimeout(pollingRef.current)
      void poll()
    }
    document.addEventListener('visibilitychange', resumeWhenVisible)

    pollingRef.current = setTimeout(poll, FIRST_POLL_DELAY_MS)

    return () => {
      stopRef.current = true
      document.removeEventListener('visibilitychange', resumeWhenVisible)
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
    }
  }, [generationId, currentModel, pollStatus, resumeToken])

  // User-triggered re-check of a request that timed out (or that the
  // user wants to poll again for any reason). Fires a SINGLE direct
  // status call against fal so the user sees fal's actual answer
  // immediately — without waiting for the 4-second polling cadence.
  // Toast-reports the outcome so it's obvious whether fal genuinely
  // still has the job in queue, finished it, or errored. If the job
  // is still pending, resumeToken is bumped to restart the background
  // polling loop for another 10-minute window.
  const handleRecheck = async () => {
    if (!generationId || !currentModel) return
    const toastId = `recheck-${id}`

    startTimeRef.current = Date.now()
    setError(null)
    setStatus('in_queue')

    toast.loading('Checking the provider for this job…', { id: toastId })

    try {
      const statusQuery = createGenerationStatusQuery({
        nodeId: id, generationId, projectId,
      })
      const response = await fetch(withBasePath(`/api/generate/status?${statusQuery}`))
      const result = await response.json()

      if (result.error) {
        setStatus('failed')
        setError(result.error)
        clearPending()
        toast.error(`Provider: ${result.error}`, { id: toastId })
        return
      }

      if (result.generationStatus === 'completed') {
        const videoUrl = result.outputUrl
        if (!videoUrl) {
          setStatus('failed')
          setError('Provider completed without a video URL')
          clearPending()
          toast.error('Provider completed without a video URL', { id: toastId })
          return
        }
        const completedUrl = withGenerationOutputBasePath(videoUrl)
        setOutputUrl(completedUrl)
        setStatus('completed')
        setGenerationId(null)
        setProgress(undefined)
        updatePersistedNodeData((currentData) => completeGenerationNode(currentData, completedUrl))
        clearPending()
        toast.success('Result is ready — saved to your library.', { id: toastId })
        return
      }

      if (result.generationStatus === 'failed') {
        setStatus('failed')
        setError(result.error || 'Generation failed')
        clearPending()
        toast.error(`Provider: ${result.error || 'Generation failed'}`, { id: toastId })
        return
      }

      // Still IN_QUEUE or IN_PROGRESS — keep polling.
      if (result.generationStatus === 'processing') {
        setStatus('in_progress')
        if (result.progress !== undefined) setProgress(result.progress)
        const pct = typeof result.progress === 'number' ? ` (${Math.round(result.progress * 100)}%)` : ''
        toast.info(`Still generating${pct}. Checking again automatically.`, { id: toastId })
      } else {
        setStatus('in_queue')
        const posLabel = typeof result.position === 'number' ? ` (queue position ${result.position})` : ''
        toast.info(`Still queued${posLabel}. Checking again automatically.`, { id: toastId })
      }
      setResumeToken(t => t + 1)
    } catch (err) {
      console.error('[recheck] error:', err)
      toast.error("Couldn't check the status — check your connection and try again.", { id: toastId })
    }
  }

  const handleGenerate = async () => {
    if (!generationPersistenceGuard.allowed) {
      const message = generationPersistenceGuard.message || 'Prompt is not ready to generate yet.'
      setError(message)
      toast.error(message)
      return
    }
    if (!(await nodeLock.claim())) {
      toast.error(nodeLock.failureMessage())
      return
    }
    const { connected, prompt: compiledPrompt, mentions: promptMentions } = resolveIncomingPrompt(id, getNodes(), getEdges())
    // Early stops: shown in the node and as a toast, since the node's error
    // strip can be covered by its control bar.
    const blockEarly = (message: string) => reportError(message, `${id}-blocked`)
    if (!connected) {
      blockEarly('Connect a Text node first')
      return
    }
    if (!compiledPrompt) {
      blockEarly('Enter text in the connected Text node')
      return
    }
    let connectedImageUrl: string | null = null
    let connectedEndImageUrl: string | null = null
    let connectedReferenceUrls: string[] = []

    // Every media input resolves through the shared helper so no field a node
    // might store its URL under is missed. A cord that resolves to nothing is
    // counted as "dead": it looks attached but would contribute no input, and
    // generating anyway burns a paid call that ignores it.
    let deadMediaEdges = 0
    const urlOfSource = (edge: any) => {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const url = resolveNodeReferenceUrl(sourceNode?.data as Record<string, unknown>)
      if (!url) deadMediaEdges++
      return url
    }

    let nodes: any[] = []
    try {
      const edges = getEdges()
      nodes = getNodes()

      // End frame (its own handle) — matched first so it isn't mistaken for the first frame.
      const incomingEndFrameEdges = edges.filter(
        edge => edge.target === id && edge.targetHandle === 'end-frame-in'
      )

      // Reference images (own handle, multiple allowed).
      const incomingReferenceEdges = edges.filter(
        edge => edge.target === id && edge.targetHandle === 'reference-in'
      )

      // First frame (image-in). The image-out source fallback is for old
      // connections, but must NOT swallow end-frame / reference / video edges.
      const incomingImageEdges = edges.filter(
        edge => edge.target === id && (
          edge.targetHandle === 'image-in' ||
          (edge.sourceHandle === 'image-out' && edge.targetHandle !== 'end-frame-in' && edge.targetHandle !== 'reference-in' && edge.targetHandle !== 'video-in')
        )
      )

      // Get image URL from connected first-frame source node
      if (isFrameModel && incomingImageEdges.length > 0) {
        const url = urlOfSource(incomingImageEdges[0])
        if (url) connectedImageUrl = url
      }

      // Get end-frame URL
      if (isFrameModel && incomingEndFrameEdges.length > 0) {
        const url = urlOfSource(incomingEndFrameEdges[0])
        if (url) connectedEndImageUrl = url
      }

      // Wired references only exist on models with a reference handle.
      connectedReferenceUrls = currentModel?.referenceParam
        ? incomingReferenceEdges.map(e => urlOfSource(e)).filter((u): u is string => !!u)
        : []
    } catch (error) {
      console.error('Error reading connected media:', error)
    }

    // Failsafe: a media cord is attached but its source has nothing yet, so that
    // input would be silently dropped. Refuse rather than burn a paid render.
    if (deadMediaEdges > 0) {
      blockEarly(
        deadMediaEdges === 1
          ? 'A connected node has no image/video yet — generate or upload it first (that input would be ignored).'
          : `${deadMediaEdges} connected nodes have no image/video yet — generate or upload them first (those inputs would be ignored).`,
      )
      return
    }

    if (!currentModel) {
      blockEarly('Please select a model')
      return
    }

    const isReplacement = Boolean(outputUrl)
    regenerationRef.current = isReplacement
    setSubmittedAt(Date.now())
    setStatus('submitting')
    setError(null)
    setProgress(undefined)

    const referenceGroups = connectedReferenceUrls.map((url) => ({ urls: [url] }))
    const compiled = compileMentionsForModel(
      compiledPrompt,
      promptMentions,
      folders,
      currentModel,
      // The server lists a wired first frame as reference image 1 (then wired
      // references, then mentions), so mention numbering starts after both.
      referenceGroups.length + (connectedImageUrl ? 1 : 0),
    )
    referenceGroups.push(...compiled.refGroups)
    // Omni source videos and audio clips come from @mentions, numbered
    // @Video N / @Audio N in mention order.
    const connectedVideoUrls = compiled.videoUrls.slice(0, currentModel.maxReferenceVideos || 0)
    const connectedAudioUrls = compiled.audioUrls.slice(0, currentModel.maxReferenceAudios || 0)

    // A request stopped before submit must say why. The in-node error strip
    // can sit under the node's control bar, so every stop also raises a toast.
    const stopBeforeSubmit = (message: string | null) => {
      if (message) {
        reportError(message, `${id}-blocked`)
      } else {
        toast.info('Generation cancelled — nothing was charged.', { id: `${id}-blocked` })
      }
      setStatus('idle')
      setSubmittedAt(undefined)
    }

    // Same limit the server enforces; @mentions expand into long reference
    // sentences, so the editor text can look much shorter than this.
    if (compiled.prompt.length > MAX_VIDEO_PROMPT_CHARS) {
      stopBeforeSubmit(`Prompt is too long: ${compiled.prompt.length.toLocaleString()}/${MAX_VIDEO_PROMPT_CHARS.toLocaleString()} characters after @mentions are expanded. Shorten it or mention fewer folders.`)
      return
    }
    if (isFrameModel && !connectedImageUrl) {
      stopBeforeSubmit('Frame mode needs a first frame — wire an image into the blue First frame handle.')
      return
    }
    if ((extendMode || editMode) && connectedVideoUrls.length === 0) {
      stopBeforeSubmit(`${editMode ? 'Edit' : 'Extend'} needs a source video — @mention a folder that contains the video.`)
      return
    }
    // Seedance rejects clips outside its length limits only after the job is
    // queued; read their lengths now and stop before paying.
    if (connectedVideoUrls.length || connectedAudioUrls.length) {
      const playable = (url: string) => resolveNodeMediaUrl({ outputUrl: url }) || url
      const [videoSeconds, audioSeconds] = await Promise.all([
        Promise.all(connectedVideoUrls.map(url => probeMediaDuration(playable(url), 'video'))),
        Promise.all(connectedAudioUrls.map(url => probeMediaDuration(playable(url), 'audio'))),
      ])
      const durationError = referenceDurationError({ model: currentModel, editMode, videoSeconds, audioSeconds })
      if (durationError) {
        stopBeforeSubmit(durationError)
        return
      }
    }

    // Models whose references go to a SEPARATE endpoint (Seedance 2.0's
    // reference-to-video) cannot also take a first/end frame — fal's
    // image-to-video and reference-to-video endpoints are mutually exclusive,
    // neither accepts the other's inputs. The server would silently route to
    // the reference endpoint and DROP the wired frame, which reads as "my first
    // frame got treated as a reference." Catch it here and make the user choose
    // instead of burning a generation on the wrong inputs.
    if (currentModel.referenceModel && (connectedImageUrl || connectedEndImageUrl) && referenceGroups.length > 0) {
      stopBeforeSubmit(
        `${currentModel.name} can't use a first/end frame and reference images at the same time — they're separate modes. ` +
        `Remove the @mention / wired references to keep your exact first frame, or remove the first frame to use the references.`,
      )
      return
    }

    if (compiled.missingFolders.length > 0) {
      // A mentioned folder was deleted: its images are gone, so the provider
      // would get dead references. Say which ones instead of failing later.
      stopBeforeSubmit(`Folder ${compiled.missingFolders.map((name) => `@${name}`).join(', ')} no longer exists. Remove it from the prompt or pick another folder.`)
      return
    }

    // Seedance rejects real-person photos that aren't trusted, but only after
    // the job is queued. Name the untrusted references and let the user decide.
    const untrusted = await findUntrustedReferences([
      ...(connectedImageUrl ? [{ url: connectedImageUrl, label: 'the connected first-frame image' }] : []),
      ...(connectedEndImageUrl ? [{ url: connectedEndImageUrl, label: 'the connected end-frame image' }] : []),
      ...referenceGroups.flatMap((group, index) => group.urls.map((url) => ({
        url,
        label: 'folderName' in group && group.folderName ? `@${group.folderName}` : `connected reference ${index + 1}`,
      }))),
    ], projectId)
    // Trust only exists for images, so reference videos and audio can never be
    // trusted. Say so once per browser session instead of on every generate.
    const MEDIA_TRUST_ACK = 'seedance-media-trust-ack'
    let mediaAcknowledged = false
    try { mediaAcknowledged = window.sessionStorage.getItem(MEDIA_TRUST_ACK) === '1' } catch { /* storage blocked */ }
    const untrustableMedia = mediaAcknowledged ? [] : [
      ...(connectedVideoUrls.length ? [`${connectedVideoUrls.length} reference video${connectedVideoUrls.length === 1 ? '' : 's'}`] : []),
      ...(connectedAudioUrls.length ? [`${connectedAudioUrls.length} audio clip${connectedAudioUrls.length === 1 ? '' : 's'}`] : []),
    ]
    if ((untrusted.length > 0 || untrustableMedia.length > 0) && !await confirmDialog({
      title: untrusted.length > 0 ? 'Untrusted references' : 'Video and audio cannot be trusted',
      confirmLabel: 'Generate anyway',
      description: (untrusted.length > 0
        ? `Not trusted for Seedance: ${untrusted.join(', ')}.\n\n` +
          'If any of these shows a real person, BytePlus will reject the video. Trust them first (shield icon) and wait until they turn green.\n\n'
        : '') +
      (untrustableMedia.length > 0
        ? `This request sends ${untrustableMedia.join(' and ')}. Only images can be trusted, so if a video shows a real person's face, BytePlus will reject the job.\n\n`
        : '') +
      'Generate anyway?',
    })) {
      stopBeforeSubmit(null)
      return
    }
    if (untrustableMedia.length > 0) {
      try { window.sessionStorage.setItem(MEDIA_TRUST_ACK, '1') } catch { /* storage blocked */ }
    }

    try {
      const submitPrompt = compiled.prompt

      // Send RAW settings; the server builds the model-specific payload.
      const body = JSON.stringify({
        kind: 'video',
        model: modelId,
        projectId,
        nodeId: id,
        prompt: submitPrompt,
        promptStateKey: mentionStateKey(compiledPrompt, promptMentions),
        referenceImageUrl: connectedImageUrl,
        endImageUrl: connectedEndImageUrl,
        referenceGroups: referenceGroups.length ? referenceGroups : undefined,
        settings: {
          aspectRatio: extendMode || editMode ? 'adaptive' : aspectRatio,
          duration: editMode ? 'auto' : duration,
          resolution: draftMode ? '480p' : resolution,
          draft: currentModel?.supportsDraft ? draftMode : undefined,
          // The audio toggle was never sent, so it had no effect on output.
          generateAudio: currentModel?.supportsAudio ? enableAudio : undefined,
          omniReferenceTaskType: currentModel?.supportsEdit && editMode ? 'edit' : currentModel?.supportsExtend && extendMode ? 'extend' : undefined,
          videoUrl: connectedVideoUrls[0],
          videoUrls: connectedVideoUrls.length > 1 ? connectedVideoUrls : undefined,
          audioUrls: connectedAudioUrls.length ? connectedAudioUrls : undefined,
          outputFormat: currentModel?.supportsMov && outputFormat === 'mov' ? 'mov' : undefined,
          watermark: currentModel?.supportsWatermark && watermark ? true : undefined,
          returnLastFrame: currentModel?.supportsLastFrame && returnLastFrame ? true : undefined,
        },
      })

      // Each video is a separate fal job. Submit them ONE AT A TIME (never
      // overlapping) — parallel POSTs, even staggered, can overlap in flight and
      // get an "anomalous burst" 403 from the host edge (our API never returns
      // 403 — it uses 429). Serialised enqueue + one retry on a transient 403 /
      // network blip. The jobs still run in parallel on fal afterwards.
      const count = Math.max(1, Math.min(12, numVideos))
      // Extra jobs of a batch are marked so the server accepts them while this
      // node already tracks the first job (it answered 409 for every extra
      // before) and doesn't overwrite this node's tracked job with them.
      const submitOnce = async (batchIndex = 0) => {
        try {
          const res = await fetch(withBasePath('/api/generate/submit'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: batchIndex > 0 ? JSON.stringify({ ...JSON.parse(body), batchExtra: true, batchIndex }) : body,
          })
          const json = await res.json().catch(() => ({}))
          return { ...json, _httpStatus: res.status }
        } catch {
          return { _httpStatus: 0 }
        }
      }
      const results: Array<Awaited<ReturnType<typeof submitOnce>>> = []
      for (let i = 0; i < count; i++) {
        if (i > 0) await new Promise<void>(r => setTimeout(r, 300))
        let r = await submitOnce(i)
        if (!r.generationId && (r._httpStatus === 403 || r._httpStatus === 0)) {
          await new Promise<void>(res => setTimeout(res, 700))
          r = await submitOnce(i) // one retry for a transient edge rejection
        }
        results.push(r)
      }
      const ok = results.filter(r => r.generationId)
      const failedCount = count - ok.length
      if (ok.length === 0) {
        const firstFail = results[0]
        const status = firstFail?._httpStatus
        // ALWAYS prefer the real message. /api/generate/submit forwards fal's
        // status AND its error text verbatim, so a 401/403 here is usually fal
        // (bad key / exhausted balance / model access), not our host.
        const falMsg = typeof firstFail?.error === 'string' ? firstFail.error.slice(0, 300) : ''
        // A 401 has TWO very different sources: our own middleware rejecting an
        // expired session (body is exactly "Unauthorized"), or fal rejecting the
        // key. Tell them apart — blaming the key for a lapsed session sends you
        // debugging the wrong system.
        const sessionExpired = status === 401 && /^unauthorized$/i.test(falMsg.trim())
        const hint =
          sessionExpired ? 'your session expired — reload the page and log in again (your API key is fine)'
          : status === 401 ? 'the provider rejected its key (invalid or rotated FAL_KEY)'
          : status === 403 ? 'the provider refused the request — usually an exhausted balance or billing hold. Check provider billing.'
          : status === 503 ? 'generation disabled (GENERATION_DISABLED env var)'
          : `HTTP ${status || 'error'}`
        const reason = sessionExpired ? hint : falMsg ? `${hint} — ${falMsg}` : hint
        const message = `Failed to submit job — ${reason}`
        setStatus('failed')
        setError(message)
        toast.error(message, { id: `${id}-submission-error` })
        return
      }
      if (failedCount > 0) {
        toast.warning(
          `Only ${ok.length} of ${count} submissions accepted — ${failedCount} rejected (likely rate-limit). You were billed for ${ok.length}.`,
          { duration: 8000 },
        )
      }

      // This node tracks the first job.
      const startedAt = Date.now()
      setGenerationId(ok[0].generationId)
      setStatus(ok[0].generationStatus === 'processing' ? 'in_progress' : 'in_queue')
      startTimeRef.current = startedAt

      // Persist the in-flight job onto the node so polling can resume
      // after a page refresh. Cleared when the generation resolves.
      patchSystemNodeData({
        generationId: ok[0].generationId,
        generationStatus: ok[0].generationStatus,
        status: ok[0].generationStatus === 'processing' ? 'in_progress' : 'in_queue',
        error: null,
        generationError: null,
        submittedAt: startedAt,
        pendingStartedAt: startedAt,
      })

      // Extra jobs become duplicate video nodes (in a grid) that each poll
      // their own request and fill in when done.
      if (ok.length > 1) {
        const extra = ok.slice(1)
        const self = getNodes().find(nd => nd.id === id)
        const baseX = self?.position?.x ?? 0
        const baseY = self?.position?.y ?? 0
        const colGap = 400
        const rowGap = 540
        const cols = 3
        const stamp = Date.now()
        const { shotId, outputUrl: _drop, ...restData } = ((self?.data || {}) as Record<string, unknown>)
        const newNodes = extra.map((res, idx) => {
          const slot = idx + 1
          const col = slot % cols
          const row = Math.floor(slot / cols)
          return {
            id: `${id}-v${stamp}-${idx}`,
            type: 'videoGen',
            position: { x: baseX + col * colGap, y: baseY + row * rowGap },
            data: {
              ...restData,
              generationId: res.generationId,
              generationStatus: res.generationStatus,
              pendingStartedAt: stamp,
            },
          }
        })
        addNodes(newNodes as any)
        // Mirror this node's incoming connections onto each duplicate.
        const incoming = getEdges().filter(e => e.target === id)
        if (incoming.length) {
          const newEdges = newNodes.flatMap((nn, ni) =>
            incoming.map((e, ei) => ({ ...e, id: `${nn.id}-e${ei}-${stamp}-${ni}`, target: nn.id, data: { ...(e.data as Record<string, unknown> | undefined) } }))
          )
          addEdges(newEdges as any)
        }
      }
    } catch (err: any) {
      const message = err.message || 'Failed to submit job'
      setStatus('failed')
      setError(message)
      toast.error(message, { id: `${id}-submission-error` })
    }
  }

  // Cost-aware generate wrapper. Estimates the fal charge for the
  // current model × batch count × duration, surfaces it in the
  // button tooltip, and gates handleGenerate behind a modal confirm
  // dialog when the estimate crosses the safety threshold, so you cannot
  // click through without seeing the amount.
  const costEstimate = useGenerationCredits({
    kind: 'video', modelId: currentModel?.id, count: numVideos, resolution: draftMode ? '480p' : resolution,
    duration, aspectRatio, draft: draftMode, extend: extendMode, edit: editMode,
  })
  const generateTooltip = useMemo(() => {
    if (!generationPersistenceGuard.allowed) return generationPersistenceGuard.message
    if (!resolvedPrompt.connected) return 'Connect a Text node first'
    if (!resolvedPrompt.prompt) return 'Enter text in the connected Text node'
    if (!currentModel) return 'Generate video'
    if (blockedNoFirstFrame) {
      return `${currentModel?.name} needs a first frame — wire an image into the blue First frame handle.`
    }
    if (blockedNoExtendVideo) {
      return `${editMode ? 'Edit' : 'Extend'} needs a source video — @mention a folder that contains the video.`
    }
    const label = `Generate ${numVideos} video${numVideos === 1 ? '' : 's'}`
    if (!costEstimate.isKnown) return `${label}\n(price not estimated for this model)`
    return `${label}\nCost: up to ~${formatCredits(costEstimate.total)} (${formatCredits(costEstimate.perUnit)} each).\nYou are charged the tokens the provider actually used, never more than this.`
  }, [blockedNoExtendVideo, blockedNoFirstFrame, costEstimate, currentModel, generationPersistenceGuard, modelId, numVideos, resolvedPrompt.connected, resolvedPrompt.prompt, upscaleMode])
  const requestGenerate = async () => {
    if (blockedNoExtendVideo || submitInFlightRef.current || (generationId && ['submitting', 'in_queue', 'in_progress'].includes(status))) return
    if (costEstimate.isKnown && costEstimate.total >= CREDIT_CONFIRM_THRESHOLD) {
      const msg =
        `You're about to submit ${numVideos} ${currentModel?.name || 'video'} generation${numVideos === 1 ? '' : 's'} ` +
        `to the provider.\n\n` +
        `Cost: up to ~${formatCredits(costEstimate.total)} (${formatCredits(costEstimate.perUnit)} each).\n\n` +
        `Press OK to confirm and spend this, or Cancel to back out.`
      // Held while the dialog is open so a second click can't queue another.
      submitInFlightRef.current = true
      const confirmed = await confirmDialog({ title: 'Confirm generation cost', description: msg.replace('Press OK to confirm and spend this, or Cancel to back out.', '').trim(), confirmLabel: 'Generate', destructive: true })
      submitInFlightRef.current = false
      if (!confirmed) return
    }
    submitInFlightRef.current = true
    void handleGenerate().finally(() => {
      submitInFlightRef.current = false
    })
  }

  const feedbackState = getGenerationFeedbackState({ status: status === 'cancelled' ? 'idle' : status, hasOutput: Boolean(outputUrl) })
  const isGenerating = status === 'submitting' || status === 'in_queue' || status === 'in_progress'
  const isTaggedToShot = !!selectedShotId
  const feedbackFrameStyle = feedbackState.isRegenerating || feedbackState.isFailedRegeneration ? feedbackState.frameStyle : {}

  // Build options from current model's config
  // Continue from this video's saved last frame: a reference node holding the
  // frame, wired into a new Frame-mode video node of the same model family.
  const lastFrameUrl = typeof data.lastFrameUrl === 'string' && data.lastFrameUrl ? data.lastFrameUrl : null
  const frameModelId = currentModel?.videoTaskMode === 'frame'
    ? currentModel.id
    : getModelById(`${currentModel?.id}-frame`)?.id
  const createNextShotFromLastFrame = () => {
    if (!lastFrameUrl || !frameModelId) return
    const self = getNodes().find(nd => nd.id === id)
    const x = self?.position?.x ?? 0
    const y = self?.position?.y ?? 0
    const stamp = Date.now()
    const refId = `ref-lastframe-${stamp}`
    const nextId = `${id}-next-${stamp}`
    const sceneId = (data.sceneId as string | undefined)
    const frameSettings = resolveGenerationSettings('video', { modelId: frameModelId })
    addNodes([
      {
        id: refId, type: 'reference', position: { x: x + 420, y: y + 40 },
        data: { thumbnail: lastFrameUrl, mediaType: 'image', label: 'Last frame', ...(sceneId ? { sceneId } : {}) },
      },
      {
        id: nextId, type: 'videoGen', position: { x: x + 760, y },
        data: {
          label: 'Next shot', modelId: frameModelId, aspectRatio: frameSettings.aspectRatio, resolution, duration,
          enableAudio, returnLastFrame: true, ...(sceneId ? { sceneId } : {}),
        },
      },
    ] as any)
    addEdges([{ id: `${refId}-${nextId}`, source: refId, sourceHandle: 'image-out', target: nextId, targetHandle: 'image-in' }] as any)
    toast.success('Next shot created — connect a Text node and generate.')
  }

  const finalizeDraft = async () => {
    const draftGenerationId = (data.lastGenerationId as string | undefined) || durableGenerationId
    if (!draftGenerationId || !draftMode || status !== 'completed') return
    setStatus('submitting')
    setError(null)
    try {
      const response = await fetch(withBasePath('/api/generate/finalize-draft'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, nodeId: id, generationId: draftGenerationId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.generation?.id) throw new Error(payload.error || 'Draft finalization failed')
      setGenerationId(payload.generation.id)
      setStatus(payload.generation.status === 'queued' ? 'in_queue' : 'in_progress')
      setSubmittedAt(Date.now())
      patchSystemNodeData({ generationId: payload.generation.id, generationStatus: payload.generation.status, status: payload.generation.status === 'queued' ? 'in_queue' : 'in_progress', draftMode: false, resolution: '1080p', generationError: null, error: null, submittedAt: Date.now() })
    } catch (error) {
      setStatus('failed')
      reportError(error instanceof Error ? error.message : 'Draft finalization failed')
    }
  }

  const modelOptions = VIDEO_MODELS.map(m => ({ value: m.id, label: m.name }))
  const durationOptions = [
    ...(currentModel?.supportsAutoDuration ? [{ value: 'auto', label: 'auto' }] : []),
    ...(currentModel?.durations?.map(d => ({ value: d, label: d })) || []),
  ]
  const resolutionOptions = currentModel?.resolutions?.map(r => ({ value: r, label: r })) || []

  return (
    <div
      className="relative group"
      style={{ width: typeof data.width === 'number' ? data.width : 650 }}
      onClickCapture={(event) => {
        const control = (event.target as HTMLElement).closest<HTMLElement>('[data-generation-setting]')
        if (control) {
          window.dispatchEvent(new CustomEvent('open-generation-settings', { detail: id }))
          window.dispatchEvent(new CustomEvent('open-generation-settings-section', { detail: control.dataset.generationSetting }))
        }
      }}
      onPointerDownCapture={(event) => {
        if (nodeLock.owned) return
        const interactive = (event.target as HTMLElement).closest('button, input, textarea, select, video, a, [data-generation-setting], .nodrag')
        void nodeLock.claim()
        if (interactive) return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {/* Run history: latest results under the node, and the Gallery. */}
      <GenerationGallery nodeId={id} data={data as Record<string, unknown>} selected={selected} />
      <GeneratorNodeToolbar
        nodeId={id}
        selected={selected}
        nodeLabel={(data.label as string) || 'Video Generator'}
        assetUrl={outputUrl || undefined}
        assetType="video"
        locked={Boolean(data.locked)}
        onRename={handleRename}
        onViewFullscreen={outputUrl ? () => setLightboxOpen(true) : undefined}
      />

      <Lightbox
        open={lightboxOpen}
        url={outputUrl}
        type="video"
        onClose={() => setLightboxOpen(false)}
      />

      {/* Shot selector badge */}
      <div className="absolute -top-8 left-0 flex items-center gap-2 z-10">
        <ShotSelector
          selectedShotId={selectedShotId}
          shots={shots}
          onSelect={handleShotSelect}
          onNewShot={handleNewShot}
          onReplace={handleShotReplace}
        />
        {isRenaming ? (
          <input
            autoFocus
            value={labelDraft}
            onChange={e => setLabelDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setIsRenaming(false)
            }}
            className="text-[10px] font-mono text-foreground bg-transparent border-b border-accent/60 outline-none min-w-[140px]"
          />
        ) : (
          <span
            onDoubleClick={handleRename}
            className="text-[10px] font-mono text-muted-foreground/60 whitespace-nowrap cursor-text hover:text-foreground transition-colors"
            title="Double-click to rename"
          >
            {(data.label as string) || 'Video Generator #1'}
          </span>
        )}
      </div>

      {/* Handles - dynamic based on model inputTypes */}
      
      {/* Text input - always shown.
          NOTE on zIndex: handles are positioned absolutely as siblings of
          the card, but the card comes AFTER them in DOM order so by default
          stacks on top. That made drops at y=250 (reference-in) land on the
          prompt textarea instead of the handle and silently fail. zIndex:5
          puts every Handle above the card so React Flow's drop detection
          actually finds them. */}
      <Handle type="target" id="prompt-in" position={Position.Left} style={{ top: 80, left: -12, opacity: 0, width: 24, height: 24, zIndex: 5 }} />
      <HandleIcon icon={TextT} color="rgba(107,143,168,0.8)" position="left" top={80} visible />

      {/* First frame (blue) - only if model supports image input */}
      {isFrameModel && (
        <>
          <Handle type="target" id="image-in" title="First frame (required) — the video opens on this exact image" position={Position.Left} style={{ top: 150, left: -12, opacity: 0, width: 24, height: 24, zIndex: 5 }} />
          <HandleIcon icon={ImageIcon} color="rgba(96,165,250,0.8)" position="left" top={150} visible />
          <ConnectedInputs nodeId={id} handleId="image-in" side="left" top={150} label="First frame" />
        </>
      )}

      {/* End frame (amber) - optional last frame for frame models */}
      {isFrameModel && (
        <>
          <Handle type="target" id="end-frame-in" title="End frame" position={Position.Left} style={{ top: 200, left: -12, opacity: 0, width: 24, height: 24, zIndex: 5 }} />
          <HandleIcon icon={ImageIcon} color="rgba(251,191,36,0.9)" position="left" top={200} visible />
          <ConnectedInputs nodeId={id} handleId="end-frame-in" side="left" top={200} label="End frame" />
        </>
      )}

      {/* Reference images (pink) - models that support subject/style refs.
          Accepts multiple image connections. */}
      {currentModel?.referenceParam && (
        <>
          <Handle type="target" id="reference-in" title="Reference image(s)" position={Position.Left} style={{ top: 250, left: -12, opacity: 0, width: 24, height: 24, zIndex: 5 }} />
          <HandleIcon icon={ImageIcon} color="rgba(236,72,153,0.9)" position="left" top={250} visible />
          <ConnectedInputs nodeId={id} handleId="reference-in" side="left" top={250} label="References" />
        </>
      )}

      {/* Video output - always shown */}
      <Handle type="source" id="video-out" position={Position.Right} style={{ top: 150, right: -12, opacity: 0, width: 24, height: 24, zIndex: 5 }} />
      <HandleIcon icon={FilmStrip} color="rgba(74,222,128,0.8)" position="right" top={150} visible />

      {/* Card content */}
      <div
        className="relative flex flex-col overflow-hidden rounded-md bg-[#17191e] p-4 transition-all duration-200"
        style={{
          border: selected ? 'none' : feedbackFrameStyle.border || 'none',
          boxShadow: feedbackFrameStyle.boxShadow || 'none',
        }}
      >
        <NodeResizer
          isVisible={selected}
          keepAspectRatio
          minWidth={320}
          minHeight={220}
          lineStyle={{ borderColor: '#1597ff', borderWidth: 1 }}
          handleStyle={{ backgroundColor: '#ffffff', border: '1.5px solid #1597ff', borderRadius: 2, width: 9, height: 9 }}
          onResizeEnd={(_, params) => patchNodeData(id, { width: params.width, height: params.height })}
        />
        <div className="hidden" aria-hidden="true">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/15 text-sky-300">
              <FilmStrip size={14} weight="bold" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-tight text-slate-100">Video Generation</p>
              <p className="mt-0.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">{currentModel?.name || 'Select model'}</p>
            </div>
          </div>
          <StatusBadge status={status} progress={progress} />
        </div>

        {/* Preview area */}
        <div
          className="relative flex items-center justify-center overflow-hidden bg-black"
          style={{ aspectRatio: String(parseAspectRatio(aspectRatio, currentModel?.defaultAspectRatio || '16:9')) }}
        >
          {outputUrl ? (
            <>
              <video
                ref={videoRef}
                src={outputUrl}
                poster={typeof data.videoThumbnail === 'string' ? data.videoThumbnail : undefined}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                controls
                loop={enableLoop}
                muted={!enableAudio}
                preload="auto"
                controlsList="nofullscreen"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onDoubleClick={(e) => {
                  // The browser's built-in video controls trigger native
                  // fullscreen on dblclick; suppress it so only our lightbox opens.
                  e.preventDefault()
                  e.stopPropagation()
                  setLightboxOpen(true)
                }}
                className="nodrag nopan w-full h-full object-cover cursor-zoom-in"
              />
              {!isPlaying && (
                <button
                  type="button"
                  className="nodrag nopan absolute left-1/2 top-1/2 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-xl backdrop-blur-sm transition-transform hover:scale-105 hover:bg-black/75"
                  aria-label="Play video"
                  onClick={(event) => {
                    event.stopPropagation()
                    void videoRef.current?.play()
                  }}
                >
                  <Play size={24} weight="fill" className="ml-0.5" />
                </button>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              {isGenerating ? (
                <>
                  <CircleNotch size={24} className="animate-spin text-accent/60" />
                  <StatusBadge status={status} progress={progress} />
                </>
              ) : (
                <span className="text-[11px] font-mono text-muted-foreground/30">No output yet</span>
              )}
            </div>
          )}
          
          <GenerationFeedbackOverlay state={feedbackState} error={error} onRetry={requestGenerate} />

          {error && !feedbackState.isFailedRegeneration && (
            <div className="absolute bottom-2 left-2 right-2 bg-red-500/20 border border-red-500/30 rounded px-2 py-1">
              <span className="text-[9px] font-mono text-red-400">{error}</span>
            </div>
          )}

          {!outputUrl && !isGenerating && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#17191e] text-[#343943]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/10">
                <FilmStrip size={27} weight="thin" />
              </div>
            </div>
          )}

          {!error && blockedNoExtendVideo && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/20 border border-amber-500/30 rounded px-2 py-1">
              <span className="text-[9px] font-mono text-amber-300">
                {editMode ? 'Edit' : 'Extend'} membutuhkan video sumber. @mention folder yang berisi video tersebut.
              </span>
            </div>
          )}

          {!error && !isFrameModel && hasMediaEdges && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/20 border border-amber-500/30 rounded px-2 py-1">
              <span className="text-[9px] font-mono text-amber-300">
                Edge gambar/video/audio diabaikan di mode Omni. Pakai @mention folder, atau ganti ke model · Frame untuk first/last frame.
              </span>
            </div>
          )}

          {!error && blockedNoFirstFrame && (
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/20 border border-amber-500/30 rounded px-2 py-1">
              <span className="text-[9px] font-mono text-amber-300">
                Mode Frame butuh first frame. Hubungkan gambar ke handle biru (First frame).
              </span>
            </div>
          )}
          <div className="absolute bottom-[118px] left-3 z-20 flex items-center gap-1.5">
            {resolution && <button data-generation-setting="resolution" className="nodrag nopan rounded-md border border-white/10 bg-[#20232a]/95 px-2.5 py-1 text-[10px] font-semibold text-slate-200 shadow-md backdrop-blur-md" title="Edit resolution">{resolution}</button>}
            <button data-generation-setting="aspect" className="nodrag nopan rounded-md border border-white/10 bg-[#20232a]/95 px-2.5 py-1 text-[10px] font-semibold text-slate-200 backdrop-blur-md" title="Edit aspect ratio">{aspectRatio}</button>
            {duration && <button data-generation-setting="duration" className="nodrag nopan rounded-md border border-white/10 bg-[#20232a]/95 px-2.5 py-1 text-[10px] font-semibold text-slate-200 backdrop-blur-md" title="Edit duration">{duration}</button>}
          </div>
        </div>
      </div>

      <div className="nodrag nopan absolute bottom-4 left-4 right-4 z-30 rounded-xl border border-[#2d313c] bg-[#20222a]/95 px-4 py-3 shadow-xl backdrop-blur-md">
        <div className="min-h-7 text-[14px] font-semibold leading-relaxed text-[#8b94a5]">
          {resolvedPrompt.connected ? null : 'Describe...'}
        </div>

        {/* Kling 2.6 voice ID slots. Only shown for kling-2.6 since it's
            the only model on our list that supports this. Max 2 voices
            per fal docs; user references them in the prompt with
            <<<voice_1>>> and <<<voice_2>>>. Comma-separated input;
            server splits and sends as voice_ids array. */}
        {modelId === 'kling-2.6' && (
          <div className="px-3 pb-2">
            <input
              type="text"
              value={voiceIds}
              onChange={e => {
                syncGuardRef.current.beginUserEdit()
                setVoiceIds(e.target.value)
              }}
              placeholder="Voice IDs — paste from fal create-voice (max 2, comma-separated)"
              disabled={isGenerating}
              className="nodrag w-full bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-1.5 text-[11px] font-mono text-foreground/90 placeholder:text-muted-foreground/40 outline-none focus:border-accent/40 disabled:opacity-50"
            />
            <p className="text-[9px] font-mono text-muted-foreground/40 mt-1 leading-snug">
              Reference in prompt as {`<<<voice_1>>>`} / {`<<<voice_2>>>`}. Get IDs from fal&apos;s create-voice endpoint.
            </p>
          </div>
        )}

        {/* Controls - Dynamic based on model */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap [&>*:not(.node-model-control)]:hidden">
            {/* Video count counter */}
            <div className="flex items-center gap-0.5 px-1.5 h-6 rounded-md bg-white/5 text-[10px] font-mono text-muted-foreground">
              <button
                onClick={() => {
                  syncGuardRef.current.beginUserEdit()
                  setNumVideos(n => {
                    const next = Math.max(1, n - 1)
                    patchPersistedNodeData({ numVideos: next })
                    return next
                  })
                }}
                disabled={isGenerating || numVideos <= 1}
                className="w-4 h-4 flex items-center justify-center hover:text-foreground disabled:opacity-30"
              >
                <Minus size={8} weight="bold" />
              </button>
              <span className="w-6 text-center">x{numVideos}</span>
              <button
                onClick={() => {
                  syncGuardRef.current.beginUserEdit()
                  setNumVideos(n => {
                    const next = Math.min(12, n + 1)
                    patchPersistedNodeData({ numVideos: next })
                    return next
                  })
                }}
                disabled={isGenerating || numVideos >= 12}
                className="w-4 h-4 flex items-center justify-center hover:text-foreground disabled:opacity-30"
              >
                <Plus size={8} weight="bold" />
              </button>
            </div>

            {/* Model selector */}
            <div className="node-model-control flex items-center gap-2 text-slate-300">
            <FilmStrip size={15} weight="bold" />
            <ControlSelect
              value={currentModel?.name || modelId}
              options={modelOptions}
              onChange={(value) => {
                syncGuardRef.current.beginUserEdit()
                // Same fields the settings panel writes; local state then
                // follows from the persisted data instead of diverging from it.
                patchPersistedNodeData(settingsForModelChange('video', value, data as Record<string, unknown>))
              }}
              disabled={isGenerating}
            />
            </div>

            {/* Topaz mode toggle — only when the upscaler is selected. */}
            {modelId === 'topaz-video-upscale' && (
              <ControlSelect
                value={upscaleMode === 'creative' ? 'Creative' : 'Standard'}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'creative', label: 'Creative' },
                ]}
                onChange={(v) => {
                  syncGuardRef.current.beginUserEdit()
                  setUpscaleMode(v as 'standard' | 'creative')
                  patchPersistedNodeData({ upscaleMode: v })
                }}
                disabled={isGenerating}
              />
            )}

            {/* Depth colouring — only for the depth pass. Grayscale IS the raw
                depth data (and the only one a depth-conditioned model can read
                correctly); the colormaps are display-only. */}
            {modelId === 'depth-anything-video' && (
              <ControlSelect
                value={colormap === 'grayscale' ? 'Grayscale (recommended)' : colormap}
                options={[
                  { value: 'grayscale', label: 'Grayscale (recommended)' },
                  { value: 'turbo', label: 'Turbo' },
                  { value: 'inferno', label: 'Inferno' },
                  { value: 'magma', label: 'Magma' },
                  { value: 'viridis', label: 'Viridis' },
                ]}
                onChange={(value) => {
                  syncGuardRef.current.beginUserEdit()
                  setColormap(value)
                  patchPersistedNodeData({ colormap: value })
                }}
                disabled={isGenerating}
              />
            )}

            {currentModel?.category === 'video' && (
              <ControlSelect
                value={aspectRatio}
                section="aspect"
                options={(currentModel.aspectRatios || []).map((ratio) => ({ value: ratio, label: ratio }))}
                onChange={(value) => {
                  syncGuardRef.current.beginUserEdit()
                  setAspectRatio(value)
                  patchPersistedNodeData({ aspectRatio: value })
                }}
                disabled={isGenerating || draftMode || extendMode || editMode}
              />
            )}

            {/* Duration - only if model supports it */}
            {durationOptions.length > 0 && (
              <ControlSelect 
                value={duration || currentModel?.defaultDuration || ''} 
                section="duration"
                options={durationOptions}
                onChange={(value) => {
                  syncGuardRef.current.beginUserEdit()
                  setDuration(value)
                  patchPersistedNodeData({ duration: value })
                }}
                disabled={isGenerating || editMode}
              />
            )}
            
            {currentModel?.supportsDraft && (
              <button
                onClick={() => {
                  syncGuardRef.current.beginUserEdit()
                  const next = !draftMode
                  setDraftMode(next)
                  if (next) {
                    setExtendMode(false)
                    setEditMode(false)
                    setAspectRatio('adaptive')
                  }
                  patchPersistedNodeData({ draftMode: next, extendMode: next ? false : extendMode, editMode: next ? false : editMode, ...(next ? { aspectRatio: 'adaptive' } : {}) })
                }}
                disabled={isGenerating}
                className={`px-2 h-6 rounded-md text-[10px] font-mono ${draftMode ? 'bg-amber-500/25 text-amber-300' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                title="Seedance 2.5 Draft: 480p preview, final render uses 1080p"
              >Draft
              </button>
            )}
            {currentModel?.supportsExtend && (
              <button
                onClick={() => {
                  syncGuardRef.current.beginUserEdit()
                  const next = !extendMode
                  setExtendMode(next)
                  if (next) {
                    setDraftMode(false)
                    setEditMode(false)
                    setAspectRatio('adaptive')
                  }
                  patchPersistedNodeData({ extendMode: next, draftMode: next ? false : draftMode, editMode: next ? false : editMode, ...(next ? { aspectRatio: 'adaptive' } : {}) })
                }}
                disabled={isGenerating}
                className={`px-2 h-6 rounded-md text-[10px] font-mono ${extendMode ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                title="Extend a connected source video with Seedance 2.5"
              >Extend
              </button>
            )}
            {currentModel?.supportsEdit && (
              <button
                onClick={() => {
                  syncGuardRef.current.beginUserEdit()
                  const next = !editMode
                  setEditMode(next)
                  if (next) {
                    setDraftMode(false)
                    setExtendMode(false)
                    setAspectRatio('adaptive')
                    setDuration('auto')
                  }
                  patchPersistedNodeData({ editMode: next, draftMode: next ? false : draftMode, extendMode: next ? false : extendMode, ...(next ? { aspectRatio: 'adaptive', duration: 'auto' } : {}) })
                }}
                disabled={isGenerating}
                className={`px-2 h-6 rounded-md text-[10px] font-mono ${editMode ? 'bg-sky-500/25 text-sky-300' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                title="Edit a connected 4–30s source video with Seedance 2.5 (add / remove / replace …). Keeps its ratio and length."
              >Edit
              </button>
            )}

            {/* Resolution - only if model supports it */}
            {resolutionOptions.length > 0 && (
              <ControlSelect 
                value={resolution || currentModel?.defaultResolution || ''} 
                section="resolution"
                options={resolutionOptions}
                onChange={(value) => {
                  syncGuardRef.current.beginUserEdit()
                  setResolution(value)
                  patchPersistedNodeData({ resolution: value })
                }}
                disabled={isGenerating}
              />
            )}
            
            {/* Loop toggle - only if model supports loop */}
            {currentModel?.supportsLoop && (
              <button
                onClick={() => {
                  syncGuardRef.current.beginUserEdit()
                  setEnableLoop(l => {
                    const next = !l
                    patchPersistedNodeData({ enableLoop: next })
                    return next
                  })
                }}
                disabled={isGenerating}
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors disabled:opacity-50 ${
                  enableLoop ? 'bg-accent/20 text-accent' : 'bg-white/5 hover:bg-white/10 text-muted-foreground'
                }`}
                title="Generate looping video"
              >
                <ArrowsClockwise size={11} weight={enableLoop ? 'fill' : 'thin'} />
              </button>
            )}
          </div>
          
          {/* Submitted durable jobs cannot be safely cancelled locally; keep
              their node state aligned with the provider until completion. */}
          {isGenerating ? null : status === 'completed' && draftMode && durableGenerationId ? (
            // Same size as the Generate button it replaces — the old 9px pill
            // was easy to miss, so finished drafts looked like they had no
            // way to render the final video.
            <button
              onClick={finalizeDraft}
              className="flex h-8 min-w-12 items-center justify-center rounded-full bg-amber-400 px-3 text-slate-950 shadow-lg transition-colors hover:bg-amber-300"
              title="Render this Draft at 1080p"
            >
              <Sparkle size={12} weight="fill" />
              <span className="ml-1 text-[11px] font-bold">Render 1080p</span>
            </button>
          ) : status === 'completed' && lastFrameUrl && frameModelId && !draftMode ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={createNextShotFromLastFrame}
                className="flex h-8 items-center justify-center rounded-full bg-sky-400 px-3 text-slate-950 shadow-lg transition-colors hover:bg-sky-300"
                title="Start a new Frame-mode shot from this video's last frame"
              >
                <Plus size={12} weight="bold" />
                <span className="ml-1 text-[11px] font-bold">Next shot</span>
              </button>
              <button
                onClick={requestGenerate}
                disabled={isGenerating || blockedNoFirstFrame || blockedNoExtendVideo || promptState.disabled || !generationPersistenceGuard.allowed}
                className="flex h-8 min-w-12 items-center justify-center rounded-full bg-white px-3 text-slate-950 shadow-lg transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={generateTooltip}
              >
                <Sparkle size={12} weight="fill" />
                <span className="ml-1 text-[11px] font-bold">{costEstimate.isKnown ? formatCreditsShort(costEstimate.total) : 'Generate'}</span>
              </button>
            </div>
          ) : status === 'failed' && generationId ? (
            <button
              onClick={handleRecheck}
              className="px-2 h-6 rounded-full bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white flex items-center justify-center transition-colors text-[9px] font-mono"
              title="Check the durable generation result again."
            >
              Re-check
            </button>
          ) : (
            <button
              onClick={requestGenerate}
              disabled={isGenerating || blockedNoFirstFrame || blockedNoExtendVideo || promptState.disabled || !generationPersistenceGuard.allowed}
              className="flex h-8 min-w-12 items-center justify-center rounded-full bg-white px-3 text-slate-950 shadow-lg transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={generateTooltip}
            >
              <Sparkle size={12} weight="fill" />
              <span className="ml-1 text-[11px] font-bold">{costEstimate.isKnown ? formatCreditsShort(costEstimate.total) : 'Generate'}</span>
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

export const VideoNode = memo(VideoNodeImpl)
VideoNode.displayName = 'VideoNode'
