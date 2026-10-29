// Synthesises the Motion studio's sound effects (public/motion-sfx/*.mp3): short, original sounds made from sine
// waves and noise, so there is no outside licence to track. Run: node scripts/make-motion-sfx.mjs (needs ffmpeg).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 44100;
const OUT = join(process.cwd(), 'public', 'motion-sfx');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

let seed = 7;
const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed / 1073741824) - 1; };

function render(seconds, sample) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = sample(i / RATE, i);
  return out;
}

// One-pole low-pass whose cutoff can move over time.
function lowpass(signal, cutoffAt) {
  const out = new Float32Array(signal.length);
  let y = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const a = 1 - Math.exp(-2 * Math.PI * cutoffAt(i / RATE) / RATE);
    y += a * (signal[i] - y);
    out[i] = y;
  }
  return out;
}

const sounds = {
  // Air rushing past: noise through a sweeping filter, rising then falling.
  whoosh: () => {
    const raw = render(0.45, () => noise());
    const swept = lowpass(raw, (t) => 400 + 5000 * Math.sin(Math.PI * Math.min(1, t / 0.45)));
    return swept.map((v, i) => v * 1.6 * Math.sin(Math.PI * Math.min(1, i / RATE / 0.45)) ** 2);
  },
  // A bubble pop: a quick sine dropping in pitch.
  pop: () => {
    let phase = 0;
    return render(0.12, (t) => {
      phase += 2 * Math.PI * (900 - 2600 * t) / RATE;
      return Math.sin(phase) * Math.exp(-t * 38) * 0.9;
    });
  },
  // A bright ping with a soft fifth above.
  ping: () => render(0.7, (t) => (Math.sin(2 * Math.PI * 1318 * t) + 0.35 * Math.sin(2 * Math.PI * 1976 * t)) * Math.exp(-t * 7) * 0.55 * Math.min(1, t * 400)),
  // A low thump with a click on top.
  impact: () => {
    let phase = 0;
    return render(0.6, (t) => {
      phase += 2 * Math.PI * (95 - 55 * Math.min(1, t * 4)) / RATE;
      return Math.sin(phase) * Math.exp(-t * 7) + noise() * Math.exp(-t * 90) * 0.5;
    });
  },
  // A clock tick.
  tick: () => render(0.05, (t) => (noise() * 0.5 + Math.sin(2 * Math.PI * 2400 * t)) * Math.exp(-t * 160) * 0.7),
  // Three quick high pings going up.
  sparkle: () => render(0.6, (t) => [2093, 2637, 3136].reduce((sum, f, k) => {
    const local = t - k * 0.08;
    return local < 0 ? sum : sum + Math.sin(2 * Math.PI * f * local) * Math.exp(-local * 14) * 0.3;
  }, 0)),
};

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(sounds)) {
  const signal = make();
  const peak = signal.reduce((max, v) => Math.max(max, Math.abs(v)), 0) || 1;
  const pcm = Buffer.alloc(44 + signal.length * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + signal.length * 2, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(RATE, 24); pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(signal.length * 2, 40);
  signal.forEach((v, i) => pcm.writeInt16LE(Math.round((v / peak) * 0.89 * 32767), 44 + i * 2));
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, pcm);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '96k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
  console.log(name, `${(signal.length / RATE).toFixed(2)} s`);
}
