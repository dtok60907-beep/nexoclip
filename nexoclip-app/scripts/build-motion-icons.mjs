// Builds components/motion/draw/lucideIcons.json from lucide-react (ISC licence, © Lucide Contributors): every icon
// as one SVG path in its 24×24 box, so drawn scenes can stroke it with s.icon(name, ...). Run after upgrading
// lucide-react: node scripts/build-motion-icons.mjs
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = join(process.cwd(), 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
const n = (v) => Math.round(Number(v) * 100) / 100;
const toPath = ([tag, a]) => {
  if (tag === 'path') return a.d;
  if (tag === 'line') return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
  if (tag === 'polyline' || tag === 'polygon') {
    const p = String(a.points).trim().split(/[\s,]+/).map(Number);
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
    return tag === 'polygon' ? `${d}Z` : d;
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = n(a.r ?? a.rx), ry = n(a.r ?? a.ry), cx = n(a.cx), cy = n(a.cy);
    return `M${n(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${n(rx * 2)} 0a${rx} ${ry} 0 1 0 ${n(-rx * 2)} 0`;
  }
  if (tag === 'rect') {
    const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height), r = n(a.rx || 0);
    if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    return `M${x + r} ${y}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${n(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  }
  return '';
};
const icons = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
  const { __iconNode } = await import(pathToFileURL(join(dir, file)).href);
  if (!Array.isArray(__iconNode)) continue;
  const d = __iconNode.map(toPath).filter(Boolean).join('');
  if (d) icons[file.replace(/\.mjs$/, '')] = d;
}
writeFileSync(join(process.cwd(), 'components', 'motion', 'draw', 'lucideIcons.json'), JSON.stringify(icons));
console.log(Object.keys(icons).length, 'icons');
