'use client';

import { useEffect, useState } from 'react';

// Public price data for the pricing dialog: every public model's credit price
// (/api/public/model-prices) and the plans (/api/public/plans). Fetched once per page.
let modelPrices = null;
let plans = null;

function once(cache, url) {
  if (!cache.promise) cache.promise = fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url} ${r.status}`)))).catch((error) => { cache.promise = null; throw error; });
  return cache.promise;
}
const modelPricesCache = {};
const plansCache = {};

export function useModelPrices() {
  const [data, setData] = useState(modelPrices);
  useEffect(() => {
    if (modelPrices) return undefined;
    let cancelled = false;
    once(modelPricesCache, '/api/public/model-prices').then((d) => { modelPrices = d; if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return data;
}

export function usePublicPlans() {
  const [data, setData] = useState(plans);
  useEffect(() => {
    if (plans) return undefined;
    let cancelled = false;
    once(plansCache, '/api/public/plans').then((d) => { plans = d; if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return data;
}

export const formatCredits = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(v) || 0);
export const resolutionLabel = (r) => (r === '4k' ? '4K' : r);

// Each model at its usual setting: 720p when offered, 5 seconds when offered (else the
// shortest), with audio; images at 1K when offered.
export function usualRows(data) {
  if (!data) return { video: [], image: [] };
  const video = data.video.map((m) => {
    const resolution = m.resolutions.includes('720p') ? '720p' : (m.resolutions[0] ?? '');
    const duration = m.durations.includes(5) ? 5 : m.durations[0];
    const config = [resolution && resolutionLabel(resolution), `${duration}s`, m.audio && 'audio'].filter(Boolean).join(' · ');
    return { id: m.id, name: m.name, config, credits: m.prices[`${resolution}|${duration}|1`] };
  });
  const image = data.image.map((m) => {
    const resolution = m.resolutions.includes('1K') ? '1K' : (m.resolutions[0] ?? '');
    return { id: m.id, name: m.name, config: resolution ? `${resolution} · per image` : 'per image', credits: m.prices[resolution] };
  });
  return { video, image };
}

export const ENTERPRISE_WHATSAPP_URL = `https://wa.me/6285183162659?text=${encodeURIComponent('Halo, saya tertarik dengan paket Enterprise Nexo Clip.')}`;
// The support chat (sidebar and floating button).
export const SUPPORT_WHATSAPP_URL = `https://wa.me/6285183162659?text=${encodeURIComponent('Halo Nexo Clip, saya butuh bantuan.')}`;

export const ENTERPRISE_POINTS = [
  'Credit quota sized to your team',
  'Per-credit price set by contract',
  'Invoice and bank transfer',
  'Revenue share for agencies',
  'Video production by our team',
  'Direct help on WhatsApp',
];
