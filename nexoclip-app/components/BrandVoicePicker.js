'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Volume2, Plus, X } from 'lucide-react';

export default function BrandVoicePicker({ workspaceId, brandName = '', defaultSample = '', onSelectVoice, onClose }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState('all'); // all | female | male
  const [selectedId, setSelectedId] = useState('');
  const [sampleText, setSampleText] = useState(
    defaultSample || `Halo! Kenalin ${brandName || 'brand kami'}, solusi terbaik buat kebutuhan harian kamu.`,
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [creditsEstimate, setCreditsEstimate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/canvas/character-voices', {
      credentials: 'include',
      headers: workspaceId ? { 'x-workspace-id': workspaceId } : undefined,
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.voices) ? data.voices : [];
        setVoices(list);
        if (list[0]) setSelectedId(list[0].id);
        if (data?.estimatedCredits !== undefined) setCreditsEstimate(data.estimatedCredits);
      })
      .catch(() => {
        if (!cancelled) setError('Gagal memuat daftar suara ElevenLabs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const filtered = voices.filter((v) => gender === 'all' || String(v.gender || '').toLowerCase() === gender);
  const activeVoice = voices.find((v) => v.id === selectedId) || filtered[0] || null;

  const handleAddPresetOnly = () => {
    if (!activeVoice) return;
    onSelectVoice?.({
      id: `voice-${Date.now()}`,
      name: `${activeVoice.name} (${activeVoice.gender || 'Voice'})`,
      description: activeVoice.description || activeVoice.style || 'ElevenLabs v4 brand voice preset',
      tag: 'ElevenLabs',
      voiceId: activeVoice.id,
      audioUrl: '',
      assetId: '',
    });
    onClose?.();
  };

  const handleGenerateAndAdd = async () => {
    if (!activeVoice || !sampleText.trim() || generating) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/canvas/character-voices', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify({
          voiceId: activeVoice.id,
          sampleText: sampleText.trim(),
          characterName: `${brandName || 'Brand'} - ${activeVoice.name}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Gagal generate sample suara ElevenLabs.');
      const audioUrl = data?.asset?.downloadUrl || data?.audioUrl || (data?.asset?.id ? `/api/assets/${data.asset.id}/download?workspaceId=${workspaceId}` : '');
      onSelectVoice?.({
        id: `voice-${Date.now()}`,
        name: `${activeVoice.name} (${activeVoice.gender || 'Voice'})`,
        description: `${activeVoice.description || 'ElevenLabs v4'} · Sample: "${sampleText.trim().slice(0, 120)}"`,
        tag: 'ElevenLabs',
        voiceId: activeVoice.id,
        audioUrl,
        assetId: data?.asset?.id || '',
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Gagal generate suara. Kamu tetap bisa simpan sebagai preset dulu.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/40 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#5b45f2] text-white">
            <Volume2 size={13} />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#171821]">ElevenLabs Brand Voice</div>
            <div className="text-[11px] text-[#6d7082]">Pilih suara resmi brand atau generate sample audio langsung.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:bg-white hover:text-zinc-700"
          aria-label="Tutup voice picker"
        >
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-zinc-500">
          <Loader2 size={14} className="animate-spin text-[#5b45f2]" />
          Memuat 12 suara ElevenLabs…
        </div>
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-1.5">
            {['all', 'female', 'male'].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                  gender === g ? 'bg-[#5b45f2] text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {g === 'all' ? 'All' : g}
              </button>
            ))}
          </div>

          <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
            {filtered.map((v) => {
              const selected = activeVoice?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={`rounded-lg border p-2 text-left transition ${
                    selected
                      ? 'border-[#5b45f2] bg-white ring-2 ring-[#5b45f2]/15'
                      : 'border-zinc-200/80 bg-white/80 hover:border-violet-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-semibold text-zinc-900">{v.name}</span>
                    <span className="text-[10px] capitalize text-zinc-400">{v.gender}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[10px] text-zinc-500">{v.description || v.accent || 'Natural'}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-medium text-zinc-600">
              Kalimat sample (opsional — untuk generate preview audio ElevenLabs)
            </label>
            <textarea
              rows={2}
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-[#5b45f2]"
            />
          </div>

          {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleAddPresetOnly}
              disabled={!activeVoice || generating}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              <Plus size={13} />
              Simpan Preset (Gratis)
            </button>
            <button
              type="button"
              onClick={handleGenerateAndAdd}
              disabled={!activeVoice || !sampleText.trim() || generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b45f2] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4731d8] disabled:opacity-60"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {generating
                ? 'Generating…'
                : `Generate Audio Sample${creditsEstimate ? ` (~${creditsEstimate} cr)` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
