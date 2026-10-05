import { useEffect, useState } from "react";

// Credit price of one generation from /api/generations/price, which runs the
// same pricing as the server's reservation, so the number on a Generate
// button matches what is charged. Returns null while loading or when the
// model has no known price.
//
// `parameters` may include resolution, aspectRatio, duration, generateAudio,
// draft, referenceImages (count) and referenceVideos (count).
export function useGenerationPrice({ kind, model, parameters = {}, promptLength = 0 }) {
  const [credits, setCredits] = useState(null);
  const query = new URLSearchParams();
  if (model) query.set("kind", kind === "video" ? "video" : "image");
  if (model) query.set("model", model);
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null || value === "" || value === 0) continue;
    // The price route reads generateAudio=0 for silent video and draft=1.
    if (key === "generateAudio") { if (value === false) query.set("generateAudio", "0"); continue; }
    if (key === "draft") { if (value) query.set("draft", "1"); continue; }
    query.set(key, String(value));
  }
  // Bucket the prompt length so typing does not refetch on every key.
  if (promptLength) query.set("promptLength", String(Math.ceil(promptLength / 500) * 500));
  const key = model ? query.toString() : "";

  useEffect(() => {
    if (!key) { setCredits(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/generations/price?${key}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => { if (!cancelled) setCredits(Number.isFinite(data?.credits) ? data.credits : null); })
        .catch(() => { if (!cancelled) setCredits(null); });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);

  return credits;
}

// Formats a credit amount for a button label: whole numbers stay whole,
// fractions keep one decimal.
export function formatCredits(credits) {
  const value = Math.round(Number(credits) * 10) / 10;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
