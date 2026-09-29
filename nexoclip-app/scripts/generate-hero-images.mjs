// One-off: generate a single decorative product still for the Canvas
// dashboard hero (components/dashboard-hero.tsx in the Spite service),
// replacing an icon-only placeholder with a real generated image — same
// idea as the Higgsfield mockup's node cards, but generated fresh via
// BytePlus instead of pointing at someone else's stock photo URL.
//
// Object shots only, deliberately — an earlier run of this script asked
// for a human portrait ("young person in stylish sportswear... sitting
// outdoors") and Seedream returned an image that read as a minor in an
// inappropriate pose despite the generic prompt. That's a real content-
// safety failure mode of the underlying model, not a wording problem, so
// this script no longer generates people at all.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBytePlusImageAdapter } from '../src/providers/direct/imageAdapters.js';

const apiKey = process.env.BYTEPLUS_API_KEY;
const baseUrl = process.env.BYTEPLUS_BASE_URL;
// Model name, not a custom deployment endpoint id — see providerRegistry.js
// ('bytedance-seed/seedream-4.5' -> byteplus model 'seedream-4-5-251128').
const model = 'seedream-4-5-251128';

if (!apiKey || !baseUrl) {
  throw new Error('Missing BYTEPLUS_API_KEY / BYTEPLUS_BASE_URL');
}

const adapter = createBytePlusImageAdapter({ apiKey, baseUrl });

const NO_TEXT = 'no text, no letters, no numbers, no logos, no printed graphics, no watermarks anywhere in the frame';

const targets = [
  {
    file: 'hero-reference.jpg',
    prompt: `Studio product photograph of a completely plain, unbranded, matte dark grey running sneaker floating in empty space, blank surfaces with ${NO_TEXT}, sharp rim lighting, dark charcoal backdrop with subtle cool blue accent light, ultra sharp focus`,
    aspectRatio: '1:1',
  },
  {
    file: 'hero-tall.jpg',
    prompt: `Studio still life of a plain unbranded dark technical jacket and matching cap hanging on a minimalist wall hook, folded scarf draped beside it, moody dark charcoal wall, soft cool blue rim light from the side, shallow depth of field, ${NO_TEXT}`,
    aspectRatio: '2:3',
  },
  {
    file: 'hero-wide-1.jpg',
    prompt: `Abstract long-exposure photograph of glowing cool blue light trails streaking horizontally through a dark studio, motion blur, dust particles catching the light, deep charcoal background, cinematic, ${NO_TEXT}`,
    aspectRatio: '16:9',
  },
  {
    file: 'hero-wide-2.jpg',
    prompt: `Moody photograph of a dark futuristic render farm / server rack room, rows of glowing cool blue LED accent lights along the edges of the equipment, soft haze, shallow depth of field, cinematic sci-fi atmosphere, ${NO_TEXT}`,
    aspectRatio: '16:9',
  },
  {
    file: 'hero-model.jpg',
    prompt: `Macro studio photograph of a glowing holographic sphere made of interconnected glass neural nodes and thin light strands, suspended in a dark void, cool blue and white light refracting through the glass, fine particle haze, ultra sharp focus, premium high-tech product render, ${NO_TEXT}`,
    aspectRatio: '1:1',
  },
];

const outDir = path.resolve(import.meta.dirname, '../services/spite/public/dashboard-hero');
await mkdir(outDir, { recursive: true });

for (const target of targets) {
  const destPath = path.join(outDir, target.file);
  if (existsSync(destPath) && !process.env.FORCE_REGEN) {
    console.log(`Skipping ${target.file} (already exists; set FORCE_REGEN=1 to redo it)`);
    continue;
  }
  console.log(`Generating ${target.file}...`);
  const result = await adapter.generate({
    model,
    prompt: target.prompt,
    aspectRatio: target.aspectRatio,
    resolution: '1K',
  });
  const output = result.outputs[0];
  let buffer;
  if (output.url.startsWith('data:')) {
    buffer = Buffer.from(output.url.split(',')[1], 'base64');
  } else {
    const response = await fetch(output.url);
    if (!response.ok) throw new Error(`Failed to download ${target.file}: ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
  }
  await writeFile(destPath, buffer);
  console.log(`Saved ${target.file} (${buffer.length} bytes)`);
}

console.log('Done.');
