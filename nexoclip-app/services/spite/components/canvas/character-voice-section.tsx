'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { withBasePath } from '@/lib/base-path'

export interface VoiceAssetItem {
  id: string
  workspaceAssetId?: string
  url: string
  type: 'audio'
  label?: string
  isUploading?: boolean
}

interface ElevenLabsVoice {
  id: string
  name: string
  gender: 'male' | 'female'
  description: string
}

const FALLBACK_VOICES: ElevenLabsVoice[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', description: 'warm, mature narrator' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', description: 'deep, resonant, ads & trailers' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', description: 'authoritative, news style' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', description: 'young, energetic' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male', description: 'casual, friendly' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'male', description: 'laid-back, confident' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', description: 'soft, reassuring' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', description: 'warm, upbeat storyteller' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', description: 'young, bright, playful' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', description: 'quirky, lively' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', description: 'smooth, seductive' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', description: 'gentle, elegant' },
]

function VoicePreviewRow({
  asset,
  onRemove,
}: {
  asset: VoiceAssetItem
  onRemove: (id: string) => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  return (
    <div className="flex items-center gap-2.5 rounded-[12px] border border-zinc-800 bg-[#141416] px-2.5 py-2">
      <audio
        ref={audioRef}
        src={asset.url}
        preload="metadata"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={togglePlay}
        disabled={asset.isUploading}
        aria-label={playing ? 'Pause voice preview' : 'Play voice preview'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4f4f6] text-[#141416] transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
      >
        {asset.isUploading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : playing ? (
          <Pause size={13} fill="currentColor" strokeWidth={2} />
        ) : (
          <Play size={13} fill="currentColor" strokeWidth={2} className="ml-0.5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-zinc-100">
          {asset.label || 'Character voice'}
        </div>
        <div className="text-[10px] text-zinc-500">
          {asset.isUploading ? 'Uploading audio…' : 'Voice reference · auto-linked on @mention'}
        </div>
      </div>
      {!asset.isUploading && (
        <button
          type="button"
          onClick={() => onRemove(asset.id)}
          aria-label="Remove voice"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export function CharacterVoiceSection({
  projectId,
  characterName,
  voiceAssets,
  onUploadFile,
  onAttachAsset,
  onRemoveAsset,
}: {
  projectId: string
  characterName: string
  voiceAssets: VoiceAssetItem[]
  onUploadFile: (file: File) => Promise<unknown>
  onAttachAsset: (asset: VoiceAssetItem) => void
  onRemoveAsset: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(voiceAssets.length === 0)
  const [tab, setTab] = useState<'elevenlabs' | 'upload' | 'record'>('elevenlabs')
  const [voices, setVoices] = useState<ElevenLabsVoice[]>(FALLBACK_VOICES)
  const [sampleCredits, setSampleCredits] = useState<number | null>(null)
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all')
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(FALLBACK_VOICES[0].id)
  const [sampleText, setSampleText] = useState('')
  const [generating, setGenerating] = useState(false)

  // Mic recorder state
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/canvas/character-voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (Array.isArray(data.voices) && data.voices.length > 0) {
          setVoices(data.voices)
        }
        if (typeof data.sampleCredits === 'number') {
          setSampleCredits(data.sampleCredits)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Stop mic cleanly on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const filteredVoices = voices.filter((v) => genderFilter === 'all' || v.gender === genderFilter)

  const handleGenerateElevenLabs = async () => {
    if (generating) return
    if (!projectId) {
      toast.error('No project context — refresh and try again.')
      return
    }
    setGenerating(true)
    try {
      const requestId = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const res = await fetch('/api/canvas/character-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: selectedVoiceId,
          text: sampleText.trim() || undefined,
          characterName: characterName.trim() || undefined,
          requestId,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || `Failed to generate voice (HTTP ${res.status})`)
        return
      }
      const voiceName = String(payload.voiceName || 'ElevenLabs Voice')
      const audioUrl = String(payload.url || '')
      const workspaceAssetId = String(payload.assetId || '')
      if (!audioUrl || !workspaceAssetId) {
        toast.error('Voice generated but returned invalid asset metadata.')
        return
      }

      // Register in Spite's project asset table so asset_folder_items can reference it.
      const regRes = await fetch(withBasePath('/api/assets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: audioUrl,
          type: 'audio',
          filename: `ElevenLabs · ${voiceName}.mp3`,
          projectId,
        }),
      })
      if (!regRes.ok) {
        throw new Error(`Asset registration failed (HTTP ${regRes.status})`)
      }
      const regData = await regRes.json()
      if (!regData?.id) throw new Error('Asset registration returned no id')

      onAttachAsset({
        id: regData.id,
        workspaceAssetId,
        url: audioUrl,
        type: 'audio',
        label: `ElevenLabs · ${voiceName}`,
      })
      setExpanded(false)
      toast.success(`Voice "${voiceName}" attached to character`)
    } catch (err: any) {
      console.error('[character-voice] generate failed:', err)
      toast.error(err?.message || 'Could not generate ElevenLabs voice')
    } finally {
      setGenerating(false)
    }
  }

  const startRecording = async () => {
    if (recording) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Microphone recording is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setRecording(false)
        setRecordSeconds(0)
        const rawType = recorder.mimeType || 'audio/webm'
        const cleanType = rawType.split(';')[0] || 'audio/webm'
        const ext = cleanType.includes('mp4') ? 'm4a' : cleanType.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(chunksRef.current, { type: cleanType })
        if (blob.size < 512) {
          toast.error('Recording too short — try speaking for at least 2 seconds.')
          return
        }
        const safeName = (characterName.trim() || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const file = new File([blob], `${safeName}-voice-${Date.now()}.${ext}`, { type: cleanType })
        void onUploadFile(file)
        setExpanded(false)
      }
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1)
      }, 1000)
    } catch (err: any) {
      toast.error(err?.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'Could not access microphone.')
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  const formatTimer = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
          <Volume2 size={13} strokeWidth={1.9} className="text-violet-300" />
          <span>Character Voice</span>
          <span className="text-[10px] font-normal text-zinc-500">(optional · for video dialogue)</span>
        </label>
        {voiceAssets.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <Plus size={12} />
            <span>{expanded ? 'Hide picker' : 'Add voice'}</span>
          </button>
        )}
      </div>

      {/* Attached voice clips */}
      {voiceAssets.length > 0 && (
        <div className="space-y-1.5">
          {voiceAssets.map((asset) => (
            <VoicePreviewRow key={asset.id} asset={asset} onRemove={onRemoveAsset} />
          ))}
        </div>
      )}

      {/* Voice selector / uploader / recorder */}
      {expanded && (
        <div className="rounded-[14px] border border-zinc-800 bg-[#141416] p-2.5 space-y-2.5">
          {/* Mode Tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[#1c1c1e] p-1">
            <button
              type="button"
              onClick={() => setTab('elevenlabs')}
              className={`flex items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-[11px] font-medium transition-colors ${
                tab === 'elevenlabs' ? 'bg-[#2c2c32] text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles size={12} strokeWidth={1.9} />
              <span>ElevenLabs</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`flex items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-[11px] font-medium transition-colors ${
                tab === 'upload' ? 'bg-[#2c2c32] text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Upload size={12} strokeWidth={1.9} />
              <span>Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('record')}
              className={`flex items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-[11px] font-medium transition-colors ${
                tab === 'record' ? 'bg-[#2c2c32] text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Mic size={12} strokeWidth={1.9} />
              <span>Record</span>
            </button>
          </div>

          {tab === 'elevenlabs' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['all', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenderFilter(g)}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                        genderFilter === g
                          ? 'bg-zinc-200 text-zinc-950'
                          : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {sampleCredits !== null && sampleCredits > 0 && (
                  <span className="text-[10px] text-zinc-500">~{sampleCredits} cr / sample</span>
                )}
              </div>

              <div className="grid max-h-[152px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
                {filteredVoices.map((voice) => {
                  const active = selectedVoiceId === voice.id
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setSelectedVoiceId(voice.id)}
                      className={`rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? 'border-zinc-400 bg-[#26262b] text-white'
                          : 'border-zinc-800/90 bg-[#1c1c1e] text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-semibold">{voice.name}</span>
                        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase text-zinc-400">
                          {voice.gender === 'male' ? 'M' : 'F'}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-zinc-500">{voice.description}</div>
                    </button>
                  )
                })}
              </div>

              <input
                type="text"
                value={sampleText}
                maxLength={400}
                onChange={(e) => setSampleText(e.target.value)}
                placeholder={`Sample line (optional, e.g. "Halo, aku ${characterName.trim() || 'karaktermu'}…")`}
                className="w-full rounded-[9px] border border-zinc-800 bg-[#1c1c1e] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-600"
              />

              <button
                type="button"
                onClick={handleGenerateElevenLabs}
                disabled={generating}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#f4f4f6] text-[12px] font-semibold text-[#141416] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Generating voice sample…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} strokeWidth={2} />
                    <span>Generate &amp; Attach Voice</span>
                  </>
                )}
              </button>
            </div>
          )}

          {tab === 'upload' && (
            <div>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    void onUploadFile(file)
                    setExpanded(false)
                  }
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[11px] border border-dashed border-zinc-700/80 bg-[#1c1c1e] py-5 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
              >
                <Upload size={18} strokeWidth={1.75} />
                <span className="text-[12px] font-medium">Upload voice sample</span>
                <span className="text-[10px] text-zinc-500">MP3, WAV, M4A, OGG (3–15s recommended)</span>
              </button>
            </div>
          )}

          {tab === 'record' && (
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-[11px] border border-zinc-800 bg-[#1c1c1e] py-4">
              {recording ? (
                <>
                  <div className="flex items-center gap-2 text-[12px] font-medium text-red-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    <span className="tabular-nums">Recording {formatTimer(recordSeconds)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex h-8 items-center gap-1.5 rounded-[10px] bg-red-500 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-red-400"
                  >
                    <Square size={11} fill="currentColor" />
                    <span>Stop &amp; Attach</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[11px] text-zinc-400">Speak 3–10 seconds clearly into your mic</span>
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[#f4f4f6] px-4 text-[12px] font-semibold text-[#141416] transition-colors hover:bg-white"
                  >
                    <Mic size={13} strokeWidth={2} />
                    <span>Start Recording</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
