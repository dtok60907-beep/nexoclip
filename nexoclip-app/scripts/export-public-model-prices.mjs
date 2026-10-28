// Writes the credit price of every publicly sold model to a file, for the price
// calculator on nexoclip.com/harga (Frontend lib/model-prices.json). The list and the
// prices come from src/services/publicModelPrices.js. Re-run after changing rates,
// markup or models:
//
//   node scripts/export-public-model-prices.mjs ../../Frontend/lib/model-prices.json
import { writeFile } from 'node:fs/promises';
import { buildPublicModelPrices } from '../src/services/publicModelPrices.js';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/export-public-model-prices.mjs <output.json>');

const data = await buildPublicModelPrices();
await writeFile(out, `${JSON.stringify(data, null, 1)}\n`);
console.log(`wrote ${data.video.length} video and ${data.image.length} image models to ${out}`);
