// Animations the Motion AI can put in a drawn story: Google's animated Noto emoji (Lottie, CC BY 4.0). Each found
// one gets a short key the scene code uses (s.lottie) and a credit line for the video description. Pictures come
// only from the user (chat attachments, their web pages); everything else is drawn.
import { findNoto, searchNoto, NOTO_CREDIT } from '../../components/motion/lottieLibrary.js';

// Finds animated emoji for a request: { key: { type, ... } } to merge into the story's assets.
export async function findAssets({ query, count = 2 }) {
  const found = {};
  const names = [findNoto(query), ...searchNoto(query, 6)].filter(Boolean);
  for (const name of [...new Set(names)].slice(0, Math.max(1, count))) {
    found[`noto:${name}`] = { type: 'lottie', source: 'noto', name, description: name.replace(/-/g, ' '), credit: NOTO_CREDIT };
  }
  return found;
}

// The credit lines a finished video owes (for its description).
export function assetCredits(assets) {
  return [...new Set(Object.values(assets || {}).map((asset) => asset.credit).filter(Boolean))];
}
