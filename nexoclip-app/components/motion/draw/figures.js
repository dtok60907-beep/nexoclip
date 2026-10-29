// People and animals for drawn scenes, built from the kit's shapes so they share the crayon look. Scene code calls
// s.person / s.animal / s.bird / s.fish with a pose or an action; every limb angle is a function of time, so they
// walk, wave and run without state. Coordinates: (x, y) is the point between the feet (or under the body),
// `size` the standing height in pixels.

const TAU = Math.PI * 2;

// A darker shade of a #rrggbb colour (back legs, the far arm), or the colour itself.
function shade(color, k = 0.78) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// A limb segment with an ink outline: a wide ink stroke under the coloured one.
function bone(s, x1, y1, x2, y2, width, color) {
  s.line(x1, y1, x2, y2, { stroke: s.c.ink, width: width + 5, wobble: 0.4, single: true });
  s.line(x1, y1, x2, y2, { stroke: color, width, wobble: 0.3, single: true });
}

export const SKIN = { light: '#f6d7b8', tan: '#e0b48a', brown: '#b07a52', dark: '#7a4b2e', deep: '#4f2f1c' };
export const HAIR = { black: '#1f1a17', brown: '#5b3a24', blond: '#e2bf6b', red: '#b5502b', gray: '#a7a7a7', white: '#f1efe9' };

// Joint angles in radians, 0 = straight down; positive swings forward (toward `facing`).
// [hipL, kneeL, hipR, kneeR, shoulderL, elbowL, shoulderR, elbowR, lean]
const POSES = {
  stand: [0.05, 0, -0.05, 0, 0.12, 0.15, -0.12, 0.15, 0],
  sit: [1.45, -1.5, 1.4, -1.5, 0.3, 0.6, 0.25, 0.7, -0.05],
  crouch: [1.1, -2.1, 0.9, -1.9, 0.6, 0.8, 0.5, 0.9, 0.35],
  point: [0.08, 0, -0.08, 0, 0.1, 0.2, 1.55, 0.05, 0],
  wave: [0.05, 0, -0.05, 0, 2.1, 0.5, -0.12, 0.15, 0],
  cheer: [0.12, 0, -0.12, 0, 2.35, 0.2, -2.35, -0.2, -0.05],
  think: [0.05, 0, -0.05, 0, 0.1, 0.15, 0.6, 2.4, 0.02],
  carry: [0.05, 0, -0.05, 0, 0.9, 1.0, 0.9, 1.0, -0.05],
  push: [0.4, -0.2, -0.35, 0, 1.4, 0.3, 1.3, 0.3, 0.35],
  fall: [0.9, -0.6, -0.4, -0.3, 2.2, 0.4, -2.0, 0.3, 0.9],
};

function cycle(action, t, speed) {
  const p = t * speed * TAU;
  if (action === 'walk') {
    const a = Math.sin(p) * 0.55;
    return { pose: [a, Math.max(0, -Math.sin(p)) * -0.9, -a, Math.max(0, Math.sin(p)) * -0.9, -a * 0.8, 0.25, a * 0.8, 0.25, 0.04], bob: Math.abs(Math.cos(p)) * 0.025 };
  }
  if (action === 'run') {
    const a = Math.sin(p) * 0.95;
    return { pose: [a, -0.6 - Math.max(0, -Math.sin(p)) * 1.2, -a, -0.6 - Math.max(0, Math.sin(p)) * 1.2, -a, 1.5, a, 1.5, 0.22], bob: Math.abs(Math.cos(p)) * 0.06 };
  }
  if (action === 'jump') {
    const h = Math.max(0, Math.sin(p / 2));
    return { pose: [0.4 * (1 - h), -0.9 * (1 - h), 0.3 * (1 - h), -0.8 * (1 - h), 2.6 * h, 0.2, 2.6 * h, 0.2, 0], bob: h * 0.35 };
  }
  if (action === 'wave') {
    const w = POSES.wave.slice();
    w[5] = 0.5 + Math.sin(p * 2) * 0.5;
    return { pose: w, bob: 0 };
  }
  if (action === 'clap') {
    const c = POSES.carry.slice();
    c[5] = 1.2 + Math.sin(p * 2) * 0.4;
    c[7] = 1.2 + Math.sin(p * 2) * 0.4;
    return { pose: c, bob: 0 };
  }
  return null;
}

const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

// `s` is the sketch; draws one person. Options:
//   pose: stand|sit|crouch|point|wave|cheer|think|carry|push|fall, or action: walk|run|jump|wave|clap (animated),
//   facing 1 (right) / -1 (left), skin (name or hex), hair (name or hex), hairStyle short|long|bun|bald|curly|cap,
//   shirt, pants, shoes, dress (true: a dress instead of trousers), face 'simple'|'none', mood happy|sad|surprised|neutral,
//   joints: an array overriding the 9 angles, holding: a function drawn at the front hand.
export function drawPerson(s, x, y, size = 260, o = {}) {
  const facing = o.facing === -1 ? -1 : 1;
  const animated = o.action ? cycle(o.action, s.t + (o.phase || 0), o.speed || 1.4) : null;
  let pose = animated ? animated.pose : (POSES[o.pose] || POSES.stand);
  if (o.from && POSES[o.from] && o.blend !== undefined) pose = mix(POSES[o.from], pose, Math.max(0, Math.min(1, o.blend)));
  if (Array.isArray(o.joints)) pose = pose.map((v, i) => (Number.isFinite(o.joints[i]) ? o.joints[i] : v));
  const [hipL, kneeL, hipR, kneeR, shL, elL, shR, elR, lean] = pose;
  const u = size / 260;
  const skin = SKIN[o.skin] || o.skin || SKIN.tan;
  const hair = HAIR[o.hair] || o.hair || HAIR.black;
  const shirt = o.shirt || s.c.blue;
  const pants = o.pants || s.c.navy;
  const shoes = o.shoes || '#3b3b4d';
  const bob = (animated?.bob || 0) * size;
  const seg = 50; // thigh / shin / upper arm / forearm length at size 260

  s.group({ x, y: y - bob, scale: u }, () => {
    s.group({ scale: 1 }, () => {
      // everything in a frame where +x is forward
      const f = facing;
      const limb = (ox, oy, a1, a2, len, width, color, end) => {
        const kx = ox + Math.sin(a1) * len * f, ky = oy + Math.cos(a1) * len;
        const ex = kx + Math.sin(a1 + a2) * len * f, ey = ky + Math.cos(a1 + a2) * len;
        bone(s, ox, oy, kx, ky, width, color);
        bone(s, kx, ky, ex, ey, width * 0.92, color);
        end?.(ex, ey, a1 + a2);
        return [ex, ey];
      };
      const hipY = -2 * seg - 8;
      const torso = 92;
      const neckX = Math.sin(lean) * torso * f, neckY = hipY - Math.cos(lean) * torso;
      const foot = (ex, ey) => s.ellipse(ex + 9 * f, ey + 2, 15, 8, { fill: shoes, width: 2.5, hatch: false });
      const hand = (ex, ey) => s.circle(ex, ey, 9, { fill: skin, width: 2.5, hatch: false });
      // back limbs first
      limb(-6 * f, hipY, hipR, kneeR, seg + 4, 22, shade(o.dress ? skin : pants, 0.85), foot);
      limb(neckX - 10 * f, neckY + 14, shR, elR, seg - 4, 17, shade(shirt, 0.85), hand);
      // torso (or dress)
      if (o.dress) {
        s.shape([[neckX - 24, neckY + 8], [neckX + 24, neckY + 8], [42, hipY + 34], [-42, hipY + 34]], { fill: shirt });
      } else {
        s.shape([[neckX - 24, neckY + 6], [neckX + 24, neckY + 6], [26, hipY + 6], [-26, hipY + 6]], { fill: shirt });
        s.rect(-26, hipY - 4, 52, 16, { fill: pants, r: 6, hatch: false });
      }
      limb(6 * f, hipY, hipL, kneeL, seg + 4, 22, o.dress ? skin : pants, foot);
      const front = limb(neckX + 10 * f, neckY + 14, shL, elL, seg - 4, 17, shirt, hand);
      if (typeof o.holding === 'function') s.group({ x: front[0], y: front[1] }, o.holding);
      // neck and head
      const hx = neckX + Math.sin(lean) * 26 * f, hy = neckY - 30;
      s.line(neckX, neckY + 6, hx, hy + 20, { stroke: skin, width: 14, wobble: 0.3 });
      const style = o.hairStyle || 'short';
      if (style === 'long') s.shape([[hx - 30, hy - 10], [hx + 30, hy - 10], [hx + 34 - 10 * f, hy + 52], [hx - 34 - 10 * f, hy + 52]], { fill: hair, hatch: false });
      s.circle(hx, hy, 30, { fill: skin });
      if (style !== 'bald') {
        if (style === 'cap') {
          s.shape([[hx - 31, hy - 6], [hx - 26, hy - 26], [hx, hy - 33], [hx + 26, hy - 26], [hx + 31, hy - 6]], { fill: o.capColor || s.c.red });
          s.rect(hx + 10 * f - (f < 0 ? 34 : 0), hy - 10, 34, 8, { fill: o.capColor || s.c.red, r: 4, hatch: false });
        } else if (style === 'curly') {
          for (let i = 0; i < 7; i += 1) s.circle(hx - 26 + i * 8.7, hy - 22 - Math.sin(i / 6 * Math.PI) * 10, 11, { fill: hair, width: 2, hatch: false });
        } else {
          s.shape([[hx - 31, hy - 2], [hx - 28, hy - 22], [hx - 8, hy - 34], [hx + 18, hy - 31], [hx + 31, hy - 12], [hx + 31, hy - 2], [hx + 4 * f, hy - 16]], { fill: hair, hatch: false });
          if (style === 'bun') s.circle(hx - 18 * f, hy - 34, 13, { fill: hair, hatch: false });
        }
      }
      if (o.face !== 'none') {
        const ex = hx + 10 * f, ey = hy - 2;
        s.circle(ex - 7, ey, 3, { fill: '#2b2622', stroke: 'none', hatch: false });
        s.circle(ex + 9, ey, 3, { fill: '#2b2622', stroke: 'none', hatch: false });
        const mood = o.mood || 'happy';
        if (mood === 'surprised') s.circle(ex + 2, ey + 14, 4.5, { stroke: '#2b2622', width: 2.5, hatch: false });
        else if (mood === 'sad') s.arc(ex + 2, ey + 20, 7, Math.PI * 1.15, Math.PI * 1.85, { stroke: '#2b2622', width: 2.5, wobble: 0.2 });
        else if (mood === 'happy') s.arc(ex + 2, ey + 8, 7, Math.PI * 0.15, Math.PI * 0.85, { stroke: '#2b2622', width: 2.5, wobble: 0.2 });
        else s.line(ex - 4, ey + 13, ex + 8, ey + 13, { stroke: '#2b2622', width: 2.5, wobble: 0.2 });
      }
    });
  });
}

// Four-legged animals from one rig. kind: dog|cat|horse|cow|deer|mammoth|elephant|bear|sheep|fox (proportions).
const BEASTS = {
  dog: { body: [120, 52], leg: 52, neck: 26, head: 26, snout: 22, ear: 'flop', tail: 'up', color: '#c58b52' },
  cat: { body: [110, 44], leg: 42, neck: 14, head: 24, snout: 8, ear: 'point', tail: 'long', color: '#8f8f9a' },
  fox: { body: [118, 44], leg: 44, neck: 18, head: 24, snout: 22, ear: 'point', tail: 'bushy', color: '#e0782b' },
  horse: { body: [180, 70], leg: 96, neck: 64, head: 26, snout: 40, ear: 'point', tail: 'long', color: '#8a5a33' },
  deer: { body: [150, 56], leg: 92, neck: 52, head: 24, snout: 22, ear: 'point', tail: 'short', color: '#b4834f', antler: true },
  cow: { body: [190, 86], leg: 64, neck: 30, head: 34, snout: 22, ear: 'flop', tail: 'long', color: '#f2efe8', spots: '#2b2622', horns: true },
  sheep: { body: [140, 78], leg: 48, neck: 16, head: 24, snout: 14, ear: 'flop', tail: 'short', color: '#f4f1ea', wool: true },
  bear: { body: [190, 96], leg: 58, neck: 20, head: 40, snout: 18, ear: 'round', tail: 'short', color: '#6b4428' },
  elephant: { body: [220, 120], leg: 80, neck: 6, head: 52, snout: 0, ear: 'big', tail: 'short', color: '#9aa0a8', trunk: true },
  mammoth: { body: [230, 130], leg: 84, neck: 6, head: 56, snout: 0, ear: 'small', tail: 'short', color: '#7a4f2e', trunk: true, tusks: true, fur: true },
};

export function drawAnimal(s, kind, x, y, size = 1, o = {}) {
  const b = BEASTS[kind] || BEASTS.dog;
  const f = o.facing === -1 ? -1 : 1;
  const color = o.color || b.color;
  const dark = o.dark || shade(color, 0.72);
  const moving = o.action === 'walk' || o.action === 'run';
  const speed = (o.action === 'run' ? 2.4 : 1.3) * (o.speed || 1);
  const p = (s.t + (o.phase || 0)) * speed * TAU;
  const swing = moving ? (o.action === 'run' ? 0.7 : 0.4) : 0;
  const [bw, bh] = b.body;
  const lift = o.action === 'run' ? Math.abs(Math.sin(p)) * 8 : 0;
  s.group({ x, y: y - lift, scale: size }, () => {
    const topY = -b.leg - bh;
    const leg = (lx, phase, back) => {
      const a = Math.sin(p + phase) * swing;
      const kx = lx + Math.sin(a) * b.leg * 0.5 * f, ky = -b.leg * 0.5;
      const ex = kx + Math.sin(a * (back ? 0.4 : 1.2)) * b.leg * 0.5 * f, ey = 0;
      bone(s, lx, -b.leg, kx, ky, Math.max(10, bw * 0.11), back ? dark : color);
      bone(s, kx, ky, ex, ey, Math.max(9, bw * 0.1), back ? dark : color);
      s.ellipse(ex + 4 * f, ey, Math.max(7, bw * 0.06), 5, { fill: '#3b3b4d', hatch: false, width: 2 });
    };
    leg(-bw * 0.32 * f, Math.PI, true);
    leg(bw * 0.3 * f, 0, true);
    // tail
    const tx = -bw * 0.5 * f, ty = topY + bh * 0.25, wag = Math.sin(p * 1.5) * 0.3 + (moving ? 0 : s.wave(1.2, 0.15));
    if (b.tail === 'up') s.curve([[tx, ty], [tx - 22 * f, ty - 26 + wag * 20], [tx - 30 * f, ty - 44 + wag * 30]], { stroke: color, width: 9 });
    else if (b.tail === 'bushy') s.ellipse(tx - 34 * f, ty + 6 + wag * 10, 38, 14, { fill: color });
    else if (b.tail === 'long') s.curve([[tx, ty], [tx - 30 * f, ty + 20 + wag * 14], [tx - 40 * f, ty + 50]], { stroke: color, width: 6 });
    else s.circle(tx - 6 * f, ty, 8, { fill: color, hatch: false });
    // body
    s.ellipse(0, topY + bh / 2, bw / 2, bh / 2, { fill: color });
    if (b.spots) { s.ellipse(-bw * 0.15, topY + bh * 0.4, 22, 14, { fill: b.spots, stroke: 'none' }); s.ellipse(bw * 0.18, topY + bh * 0.55, 16, 11, { fill: b.spots, stroke: 'none' }); }
    if (b.wool || b.fur) for (let i = 0; i < 9; i += 1) s.circle(-bw * 0.4 + i * bw * 0.1, topY + 6 + (i % 2) * 8, bh * 0.16, { fill: color, width: 2, hatch: false });
    leg(-bw * 0.26 * f, 0, false);
    leg(bw * 0.36 * f, Math.PI, false);
    // neck and head
    const nx = bw * 0.42 * f, ny = topY + bh * 0.25;
    const hx = nx + b.neck * 0.7 * f, hy = ny - b.neck - (moving ? Math.sin(p) * 3 : s.wave(0.5, 2));
    if (b.neck > 10) s.line(nx, ny + 10, hx, hy + b.head * 0.4, { stroke: color, width: b.head * 0.9, wobble: 0.3 });
    if (b.ear === 'big') s.ellipse(hx - 14 * f, hy + 10, b.head * 0.75, b.head * 0.95, { fill: color });
    s.circle(hx, hy, b.head, { fill: color });
    if (b.snout) s.ellipse(hx + (b.head * 0.6 + b.snout * 0.4) * f, hy + b.head * 0.3, b.snout, b.head * 0.42, { fill: color });
    if (b.ear === 'point') s.shape([[hx - 6 * f, hy - b.head * 0.7], [hx - 2 * f, hy - b.head * 1.5], [hx + 10 * f, hy - b.head * 0.75]], { fill: color });
    if (b.ear === 'flop') s.ellipse(hx - 8 * f, hy + 4, 9, b.head * 0.6, { fill: dark, stroke: s.c.ink });
    if (b.ear === 'round' || b.ear === 'small') s.circle(hx - 8 * f, hy - b.head * 0.8, b.head * 0.3, { fill: color });
    if (b.horns) s.curve([[hx - 4 * f, hy - b.head * 0.8], [hx + 4 * f, hy - b.head * 1.25], [hx + 14 * f, hy - b.head * 1.2]], { stroke: '#e9dcc0', width: 6 });
    if (b.antler) for (const k of [-1, 1]) s.polyline([[hx + k * 4, hy - b.head * 0.8], [hx + k * 10, hy - b.head * 1.8], [hx + k * 22, hy - b.head * 2.2], [hx + k * 10, hy - b.head * 1.8], [hx + k * 2, hy - b.head * 2.3]], { stroke: '#8b5a2b', width: 4 });
    if (b.trunk) s.curve([[hx + b.head * 0.7 * f, hy + 4], [hx + b.head * 1.05 * f, hy + b.head * 0.9], [hx + b.head * 0.95 * f + Math.sin(p) * 6, hy + b.head * 1.7]], { stroke: color, width: b.head * 0.32 });
    if (b.tusks) s.curve([[hx + b.head * 0.5 * f, hy + b.head * 0.55], [hx + b.head * 1.3 * f, hy + b.head * 1.05], [hx + b.head * 1.6 * f, hy + b.head * 0.5]], { stroke: '#f2e8cf', width: 7 });
    if (o.face !== 'none') s.circle(hx + b.head * 0.35 * f, hy - b.head * 0.15, 3.2, { fill: '#2b2622', stroke: 'none', hatch: false });
    if (b.snout) s.circle(hx + (b.head * 0.6 + b.snout * 1.2) * f, hy + b.head * 0.2, 3.5, { fill: '#2b2622', stroke: 'none', hatch: false });
  });
}

// A bird flying (flap) or perched.
export function drawBird(s, x, y, size = 1, o = {}) {
  const f = o.facing === -1 ? -1 : 1;
  const color = o.color || s.c.blue;
  const flap = o.perched ? 0 : Math.sin((s.t + (o.phase || 0)) * (o.speed || 3) * TAU);
  s.group({ x, y, scale: size }, () => {
    s.shape([[-6 * f, -4], [-26 * f, -4 - flap * 30], [-8 * f, 6]], { fill: color });
    s.ellipse(0, 0, 26, 15, { fill: color });
    s.circle(20 * f, -10, 11, { fill: color });
    s.shape([[29 * f, -12], [40 * f, -8], [29 * f, -5]], { fill: s.c.orange, hatch: false, width: 2 });
    s.shape([[-22 * f, 0], [-38 * f, -8], [-36 * f, 8]], { fill: color });
    s.shape([[4 * f, -4], [-12 * f, -6 - flap * 34], [10 * f, 4]], { fill: color });
    if (o.face !== 'none') s.circle(23 * f, -13, 2.5, { fill: '#2b2622', stroke: 'none', hatch: false });
    if (o.perched) { s.line(-4, 14, -4, 24, { width: 2 }); s.line(6, 14, 6, 24, { width: 2 }); }
  });
}

// A fish swimming (tail sway).
export function drawFish(s, x, y, size = 1, o = {}) {
  const f = o.facing === -1 ? -1 : 1;
  const color = o.color || s.c.orange;
  const sway = Math.sin((s.t + (o.phase || 0)) * (o.speed || 2) * TAU) * 0.35;
  s.group({ x, y, scale: size }, () => {
    s.group({ x: -30 * f, rotate: sway * f }, () => s.shape([[0, 0], [-30 * f, -18], [-24 * f, 0], [-30 * f, 18]], { fill: color }));
    s.ellipse(0, 0, 40, 22, { fill: color });
    s.shape([[-6 * f, -18], [10 * f, -32], [18 * f, -16]], { fill: color });
    if (o.face !== 'none') s.circle(22 * f, -5, 3, { fill: '#2b2622', stroke: 'none', hatch: false });
  });
}
