// Contoh balasan Claude untuk langkah 3 alur referensi Motion (lihat MOTION_FLOW_REFERENCE.md).
// Video "Nyalain Mesinnya Dulu", 10 scene, dikirim dalam 3 batch (1-4, 5-8, 9-10). Disalin persis.
// Tiap blok adalah isi `function (s, ctx) { ... }` untuk satu scene; berguna sebagai fixture untuk engine `s` kita.

// ===== SCENE 1 =====
const cx = 360, cy = 470;
s.ground();
const k = s.pop(0, 0.35);
const e = s.at(0.8, 0.75);          // lembar lama terlepas
const pre = s.at(0.55, 0.25);       // antisipasi miring sebelum lepas
const u = s.clamp((s.t - 0.95) / 0.27, 0, 1); // lembar baru jatuh
const tt = s.t - 1.22;              // waktu setelah mendarat
const wob = tt > 0 ? Math.sin(tt * 24) * 0.09 * Math.exp(-tt * 3.2) : 0;

const drawPage = (num, label, col) => {
  s.rect(-150, 0, 300, 285, { fill: s.c.white, r: 8 });
  s.text(num, 0, 172, { size: 150, color: col, align: "center" });
  s.text(label, 0, 252, { size: 26, color: s.c.gray, align: "center" });
};

s.group({ x: cx, y: cy, scale: k, rotate: s.wave(3, 0.01) * s.at(1.5, 0.3) }, () => {
  s.rect(-175, -205, 350, 400, { fill: "#d9d2c0", r: 12 });
  s.rect(-175, -205, 350, 72, { fill: s.c.red, r: 12 });
  s.text("OKTOBER", 0, -160, { size: 30, color: s.c.white, align: "center" });
  s.rect(-148, -122, 300, 282, { fill: "#ece6d6", r: 8 }); // tumpukan lembar bawah

  if (e < 0.999) {
    s.group({ x: e * 520, y: -125 - e * 520 - pre * 6, rotate: -0.1 * pre + e * 1.6 }, () => {
      drawPage("27", "hari ini", s.c.ink);
    });
  }
  if (s.t >= 0.95) {
    s.group({ x: 0, y: -125 - (1 - u * u) * 720, rotate: wob + s.wave(4, 0.008) * u }, () => {
      drawPage("28", "besok", s.c.red);
    });
  }
  for (let i = 0; i < 5; i++) {
    s.rect(-120 + i * 60, -222, 10, 40, { fill: s.c.gray, r: 5 });
  }
});

// serpihan kertas robek terbang keluar
for (let i = 0; i < 4; i++) {
  const a = s.at(0.8 + i * 0.03, 0.7);
  if (a <= 0 || a >= 0.98) continue;
  s.group({
    x: cx - 120 + i * 80 + a * (110 + i * 50),
    y: cy - 120 - a * (220 + i * 60),
    rotate: a * (3 + i),
    alpha: 1 - a * 0.8
  }, () => {
    s.shape([[-10, 8], [12, 4], [0, -12]], { fill: s.c.white, width: 2 });
  });
}

s.burst(cx, cy + 10, 175, { draw: s.at(1.22, 0.4), count: 10 });
s.glow(cx, cy + 20);

s.sfx("paper", 0.75, 0.8);
s.sfx("swish", 0.85, 0.6);
s.sfx("thud", 1.22, 0.55, 1.4);

// ===== SCENE 2 =====
// angin malam
for (let k = 0; k < 7; k++) {
  const xx = 760 - ((s.t * 760 + k * 131) % 900);
  const yy = 190 + k * 95 + s.rand(k) * 30;
  s.line(xx, yy, xx + 90 + s.rand(k + 9) * 60, yy, { stroke: s.c.sky, alpha: 0.35, width: 2, wobble: 0.4 });
}

for (let i = 0; i < 9; i++) {
  const st = -0.2 + i * 0.2;
  const p = (s.t - st) / 1.15;
  if (p <= 0 || p >= 1) continue;
  const size = 62 + s.rand(i) * 36;
  const y = 230 + ((i * 173) % 430) + s.rand(i + 30) * 20 + s.wave(2.2, 26, i * 1.3);
  const x = s.lerp(820, -150, p);
  const rot = p * (5 + s.rand(i + 5) * 4) * (i % 2 ? 1 : -1);

  s.group({ x, y, rotate: rot, scale: 0.9 + s.rand(i + 12) * 0.2 }, () => {
    const pts = [];
    for (let j = 0; j < 9; j++) {
      const a = (j / 9) * Math.PI * 2;
      const r = size * (0.78 + 0.3 * s.rand(i * 11 + j));
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 1.1]);
    }
    s.shape(pts, { fill: "#efe6cf", width: 2.5, wobble: 1.5 });
    // lipatan kusut
    s.line(-size * 0.5, -size * 0.25, size * 0.3, size * 0.3, { width: 1.5, alpha: 0.5, stroke: s.c.gray });
    s.line(-size * 0.1, -size * 0.65, size * 0.45, -size * 0.1, { width: 1.5, alpha: 0.5, stroke: s.c.gray });
    s.line(-size * 0.35, size * 0.5, size * 0.1, size * 0.1, { width: 1.5, alpha: 0.4, stroke: s.c.gray });
    // coretan "besok"
    s.text("besok", 0, size * 0.12, { size: size * 0.45, color: s.c.red, align: "center" });
    s.line(-size * 0.45, size * 0.22, size * 0.45, size * 0.16, { stroke: s.c.red, width: 3 });
  });
  if (i === 4) s.glow(x, y);
}

s.sfx("whoosh", 0.3, 0.6, 0.9);
s.sfx("paper", 1.0, 0.5, 1.2);
s.sfx("swish", 1.9, 0.6, 1.1);

// ===== SCENE 3 =====
const cx = 360, cy = 470;
s.ground();
const k = s.pop(0, 0.35);
const shake = s.t > 1.3 && s.t < 1.6 ? s.wave(40, 3) : 0;

s.group({ x: cx, y: cy - 10, scale: k, rotate: -0.04 + s.wave(1.5, 0.012) }, () => {
  // kertas
  s.rect(-215, -160, 430, 310, { fill: s.c.white, r: 6 });
  s.shape([[160, 150], [215, 150], [215, 95]], { fill: "#e8e2d2", width: 2 });

  if (s.t < 1.6) {
    s.group({ x: shake, y: 0, scale: 1 + s.wave(3, 0.025) }, () => {
      s.text("MALAS", 0, 45, { size: 130, color: s.c.ink, align: "center" });
    });
    // retakan
    s.polyline([[-140, -60], [-90, -10], [-120, 30], [-40, 62]], { width: 3, draw: s.at(1.25, 0.3) });
    s.polyline([[60, -72], [20, -10], [80, 22], [40, 72]], { width: 3, draw: s.at(1.32, 0.28) });
  }
  // coretan silang merah tebal
  s.line(-190, -90, 190, 90, { stroke: s.c.red, width: 18, draw: s.at(0.9, 0.22) });
  s.line(190, -90, -190, 90, { stroke: s.c.red, width: 18, draw: s.at(1.08, 0.22) });
});

// serpihan huruf jatuh
const tf = s.t - 1.6;
if (tf > 0) {
  for (let i = 0; i < 16; i++) {
    const rx = (s.rand(i * 3 + 1) - 0.5) * 300;
    const ry = (s.rand(i * 3 + 2) - 0.5) * 90;
    const sz = 10 + s.rand(i * 3 + 3) * 20;
    const vx = (s.rand(i + 50) - 0.5) * 160;
    const u = Math.max(0, tf - s.rand(i + 20) * 0.12);
    const land = 748 - s.rand(i + 70) * 14;
    const raw = cy + ry + 1600 * u * u;
    const lt = Math.sqrt((land - cy - ry) / 1600);
    let y = Math.min(raw, land);
    if (raw > land) y -= Math.abs(Math.sin((u - lt) * 14)) * 14 * Math.exp(-(u - lt) * 7);
    const x = cx + rx + vx * Math.min(u, 0.5);
    const rot = Math.min(u, 0.5) * (s.rand(i + 90) - 0.5) * 10;
    s.group({ x, y, rotate: rot }, () => {
      s.shape([[-sz, sz * 0.6], [sz, sz * 0.3], [0, -sz]], {
        fill: i % 4 === 0 ? s.c.red : s.c.ink,
        width: 2
      });
    });
  }
}

s.burst(cx, cy, 175, { draw: s.at(1.6, 0.4), count: 12 });
s.glow(cx, cy);

s.sfx("riser", 0.7, 0.6);
s.sfx("chalk", 0.92, 0.8);
s.sfx("chalk", 1.1, 0.8, 1.2);
s.sfx("impact", 1.6, 0.8);

// ===== SCENE 4 =====
const gx = 360, gy = 590, S = 1.25;
s.ground();
const enter = s.at(0, 0.35);
const k = s.pop(0, 0.45);
const shiver = s.at(0.7, 0.4) * s.wave(16, 1.6);
const flick = (s.t > 2.1 && s.t < 2.45)
  ? Math.max(0, Math.sin((s.t - 2.1) * 40)) * (1 - (s.t - 2.1) / 0.35)
  : 0;

s.group({ x: gx + shiver, y: gy - (1 - enter) * 420, scale: S * k, rotate: s.wave(9, 0.004) }, () => {
  const wheel = (x) => {
    s.circle(x, 90, 46, { fill: "#23232c", width: 4 });
    s.circle(x, 90, 22, { fill: s.c.gray });
    s.circle(x, 90, 6, { fill: s.c.ink });
  };
  // knalpot & roda belakang
  s.rect(-190, 66, 95, 14, { fill: s.c.gray, r: 6 });
  wheel(-105);
  // bodi belakang
  s.curve([[-175, 10], [-140, -25], [-45, -25], [-5, 40], [-25, 84], [-150, 84], [-178, 50]], { closed: true, fill: s.c.orange });
  s.rect(-165, -48, 140, 28, { fill: s.c.brown, r: 12 });       // jok
  s.rect(-184, -4, 14, 22, { fill: s.c.red, r: 4 });            // lampu belakang
  s.rect(-30, 58, 130, 24, { fill: "#e0791d", r: 8 });          // pijakan
  // fork & roda depan
  s.line(120, -10, 150, 90, { width: 8, stroke: s.c.gray });
  wheel(150);
  // tameng depan
  s.shape([[66, 74], [78, -10], [108, -86], [138, -86], [134, -6], [130, 74]], { fill: s.c.orange });
  s.curve([[104, 62], [112, 40], [150, 30], [188, 42], [198, 66]], { closed: true, fill: s.c.orange }); // spakbor
  // stang
  s.line(124, -84, 118, -132, { width: 9, stroke: s.c.gray });
  s.line(96, -138, 150, -146, { width: 10 });
  s.line(146, -145, 170, -152, { width: 11, stroke: s.c.brown });
  s.line(108, -140, 92, -172, { width: 4 });
  s.ellipse(88, -180, 14, 9, { fill: s.c.gray });
  // lampu depan bulat, mati
  s.circle(142, -72, 19, { fill: flick > 0.3 ? "#ffe27a" : "#6f6f7c", width: 3.5 });
  s.circle(144, -72, 10, { fill: flick > 0.3 ? "#fff3b0" : "#8d8d9a", stroke: "none" });
  if (flick > 0.05) s.rays(142, -72, 26, 26 + flick * 22, 8, { stroke: s.c.yellow, alpha: flick * 0.8 });
});

// uap dingin biru muda mengepul dari bodi
const boost = 1 + 0.5 * s.at(2.4, 0.3);
const ea = s.at(0.35, 0.5);
const src = [[-125, -50], [-60, -48], [0, -20], [120, -90], [40, 60]];
for (let i = 0; i < src.length; i++) {
  const sx = gx + src[i][0] * S, sy = gy + src[i][1] * S;
  for (let j = 0; j < 4; j++) {
    const q = (s.t * 0.45 + i * 0.21 + j * 0.25) % 1;
    const x = sx + Math.sin(q * 7 + i * 2 + j) * 20 * q + q * 14 * (i % 2 ? 1 : -1);
    const y = sy - q * 210;
    const r = (12 + q * 28) * boost;
    s.circle(x, y, r, { fill: s.c.sky, stroke: s.c.sky, alpha: (1 - q) * 0.5 * ea, width: 2 });
  }
}

// kilau es kecil melayang
for (let i = 0; i < 4; i++) {
  s.sparkle(200 + i * 100, 330 + (i % 2) * 40 + s.wave(1, 10, i), 16, {
    stroke: s.c.sky,
    alpha: 0.5 + 0.4 * s.wave(1.5, 1, i)
  });
}

s.glow(gx - 85 * S, gy + 30 * S);

s.sfx("thud", 0.3, 0.8, 0.6);
s.sfx("click", 2.1, 0.5);
s.sfx("sparkle", 2.4, 0.5, 1.4);

// ===== SCENE 5 =====
const f = Math.floor(s.t * 30);
const ramp = s.clamp((s.t - 0.1) / 2.5, 0, 1);
const sh = s.t < 2.8 ? s.lerp(2.5, 8, ramp * ramp) : s.lerp(8, 1, s.at(2.8, 0.35));
const dx = (s.rand(f) - 0.5) * sh * 2, dy = (s.rand(f + 99) - 0.5) * sh;
const fl = Math.floor(s.t * 9);
const lamp = s.t >= 2.8 || (s.t > 1.0 && fl % 2 === 0 && s.rand(fl + 7) > 0.25);
const lx = 360 + dx + 118 * 1.35, ly = 598 + dy - 86 * 1.35;
const scooter = (lampOn, spin) => {
  const wheel = (x) => {
    s.circle(x, 80, 40, { fill: "#2b2b33", width: 3 });
    s.circle(x, 80, 17, { fill: s.c.gray });
    for (let k = 0; k < 4; k++) {
      const a = spin + k * Math.PI / 2;
      s.line(x, 80, x + Math.cos(a) * 16, 80 + Math.sin(a) * 16, { stroke: s.c.white, width: 2, wobble: 0.3 });
    }
  };
  wheel(-115); wheel(110);
  s.curve([[-155, 30], [-140, -5], [-70, -15], [-25, 30], [-25, 58], [-125, 58], [-150, 50]], { closed: true, fill: s.c.orange });
  s.rect(-30, 46, 120, 22, { fill: "#e07a10", r: 8 });
  s.curve([[60, 58], [72, -50], [100, -78], [116, -50], [104, 58]], { closed: true, fill: s.c.orange });
  s.rect(-148, -32, 110, 26, { fill: s.c.brown, r: 12 });
  s.line(92, -70, 88, -112, { width: 6, stroke: s.c.gray });
  s.line(66, -114, 112, -108, { width: 7 });
  s.circle(118, -86, 16, { fill: lampOn ? s.c.yellow : s.c.gray });
  s.rect(-172, 54, 44, 14, { fill: s.c.gray, r: 6 });
};
s.ground();
// uap dingin dari scene sebelumnya memudar
const cold = 1 - s.at(0, 0.9);
for (let i = 0; i < 4; i++) {
  s.circle(330 + i * 40 + s.wave(1.5, 6, i), 470 - ((s.t * 50 + i * 30) % 80), 24 + i * 4,
    { fill: s.c.sky, alpha: cold * 0.5, stroke: "none", hatch: false });
}
// getaran di sekitar bodi
for (let i = 0; i < 3; i++) {
  const o = (f % 2) * 10;
  const al = s.t < 2.8 ? 0.7 : 0.25;
  s.line(175 - o, 480 + i * 34, 150 - o, 470 + i * 34, { width: 3, alpha: al });
  s.line(585 + o, 520 + i * 34, 610 + o, 510 + i * 34, { width: 3, alpha: al });
}
s.group({ x: 360 + dx, y: 598 + dy, scale: 1.35 * (0.92 + 0.08 * s.pop(0, 0.35)), rotate: s.wave(14, 0.012) * (s.t < 2.8 ? 1 : 0.2) }, () => {
  scooter(lamp, 0);
});
// asap putih dari knalpot
const em = s.at(0.2, 0.3) * (1 - 0.55 * s.at(2.8, 0.4));
for (let i = 0; i < 8; i++) {
  const ph = (s.t * 1.3 + i / 8) % 1;
  const puff = 1 + 0.5 * Math.max(0, s.wave(2.2, 1, i));
  s.circle(135 + dx - ph * 120, 682 + dy - ph * 95 - s.rand(i) * 20, (12 + ph * 34) * puff,
    { fill: s.c.white, alpha: (1 - ph) * 0.85 * em, stroke: "none", hatch: false });
}
// lampu menyala terang
const g = s.at(2.8, 0.4);
if (g > 0) {
  ctx.save();
  ctx.globalAlpha = g * (0.85 + 0.1 * s.wave(6));
  const gr = ctx.createRadialGradient(lx, ly, 4, lx, ly, 190);
  gr.addColorStop(0, "rgba(255,240,140,0.95)");
  gr.addColorStop(1, "rgba(255,240,140,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(lx - 190, ly - 190, 380, 380);
  ctx.restore();
  s.shape([[lx, ly - 8], [680, ly - 110], [680, ly + 120], [lx, ly + 10]], { fill: s.c.yellow, alpha: 0.22 * g, stroke: "none", hatch: false });
}
s.rays(lx, ly, 34, 62, 10, { draw: s.at(2.8, 0.4), stroke: s.c.yellow, width: 3 });
s.burst(lx, ly, 95, { draw: s.at(2.8, 0.4), count: 12, stroke: s.c.yellow });
s.glow(lx, ly);
s.sfx("thud", 0.5, 0.7, 0.5);
s.sfx("thud", 1.2, 0.7, 0.55);
s.sfx("riser", 1.9, 0.8);
s.sfx("ding", 2.8, 1);

// ===== SCENE 6 =====
const b = s.clamp((s.t - 2.9) / 0.3, 0, 1);
const ex = b < 1 ? 78 * b * b : 78 + 520 * (s.t - 3.2);
const dist = 380 * s.t + ex;
const sx = s.lerp(-230, 330, s.at(0, 0.45)) + s.p * 70 + s.at(2.9, 0.3) * 20;
const sy = 616 + s.wave(5, 2.5);
const scooter = (lampOn, spin) => {
  const wheel = (x) => {
    s.circle(x, 80, 40, { fill: "#2b2b33", width: 3 });
    s.circle(x, 80, 17, { fill: s.c.gray });
    for (let k = 0; k < 4; k++) {
      const a = spin + k * Math.PI / 2;
      s.line(x, 80, x + Math.cos(a) * 16, 80 + Math.sin(a) * 16, { stroke: s.c.white, width: 2, wobble: 0.3 });
    }
  };
  wheel(-115); wheel(110);
  s.curve([[-155, 30], [-140, -5], [-70, -15], [-25, 30], [-25, 58], [-125, 58], [-150, 50]], { closed: true, fill: s.c.orange });
  s.rect(-30, 46, 120, 22, { fill: "#e07a10", r: 8 });
  s.curve([[60, 58], [72, -50], [100, -78], [116, -50], [104, 58]], { closed: true, fill: s.c.orange });
  s.rect(-148, -32, 110, 26, { fill: s.c.brown, r: 12 });
  s.line(92, -70, 88, -112, { width: 6, stroke: s.c.gray });
  s.line(66, -114, 112, -108, { width: 7 });
  s.circle(118, -86, 16, { fill: lampOn ? s.c.yellow : s.c.gray });
  s.rect(-172, 54, 44, 14, { fill: s.c.gray, r: 6 });
};
// matahari senja
s.circle(520, 600, 95 + s.wave(0.8, 3), { fill: s.c.orange, alpha: 0.85, stroke: "none" });
// awan kecil melintas
for (let i = 0; i < 3; i++) {
  const cxx = (((i * 300 + 150 - s.t * (30 + i * 12)) % 860) + 860) % 860 - 90;
  s.group({ x: cxx, y: 200 + i * 55 + s.wave(0.5, 4, i) }, () => {
    s.circle(-26, 6, 22, { fill: s.c.white, alpha: 0.85, stroke: "none" });
    s.circle(0, -6, 28, { fill: s.c.white, alpha: 0.85, stroke: "none" });
    s.circle(28, 6, 20, { fill: s.c.white, alpha: 0.85, stroke: "none" });
  });
}
// bukit berlapis (parallax)
const hill = (k, col, yy, al) => {
  const o = (dist * k) % 640;
  for (let j = 0; j < 3; j++) {
    s.group({ x: j * 640 - o, y: yy }, () => {
      s.curve([[-20, 200], [-20, 70], [130, 20], [300, 75], [460, 10], [660, 70], [660, 200]],
        { closed: true, fill: col, alpha: al, stroke: "none" });
    });
  }
};
hill(0.07, s.c.pink, 570, 0.75);
hill(0.2, s.c.purple, 620, 0.9);
// jalan
s.rect(20, 762, 680, 70, { fill: "#4b4160", alpha: 0.9, stroke: "none" });
s.ground();
for (let i = 0; i < 9; i++) {
  const x = (((i * 100 - dist) % 900) + 900) % 900 - 100;
  s.line(x, 800, x + 50, 800, { stroke: s.c.white, width: 4, wobble: 0.3 });
}
s.ellipse(sx, 764, 150, 10, { fill: "#1c1530", alpha: 0.3, stroke: "none", hatch: false });
// garis kecepatan putih
const tail = sx - 170 * 1.2;
const en = s.at(0.3, 0.3);
for (let i = 0; i < 6; i++) {
  const ph = (s.t * 2.2 + s.rand(i)) % 1;
  const len = (60 + s.rand(i + 9) * 90) * (1 + b * 0.8);
  const x1 = tail - 10 - ph * 220, y = 520 + i * 42 + s.rand(i + 3) * 10;
  s.line(x1 - len, y, x1, y, { stroke: s.c.white, width: 3, alpha: (1 - ph) * en, wobble: 0.3 });
}
// debu roda belakang
for (let i = 0; i < 4; i++) {
  const ph = (s.t * 2 + i / 4) % 1;
  s.circle(sx - 140 - ph * 90, 745 - ph * 25, 6 + ph * 14,
    { fill: s.c.white, alpha: (1 - ph) * 0.5 * en, stroke: "none", hatch: false });
}
s.group({ x: sx, y: sy, scale: 1.2, rotate: 0.02 + 0.03 * b + s.wave(4, 0.008) }, () => {
  scooter(true, dist / 48);
  s.shape([[120, -88], [520, -130], [520, -20], [120, -80]], { fill: s.c.yellow, alpha: 0.2, stroke: "none", hatch: false });
});
const lampX = sx + 142, lampY = 513;
ctx.save();
ctx.globalAlpha = 0.8;
const gr = ctx.createRadialGradient(lampX, lampY, 4, lampX, lampY, 110);
gr.addColorStop(0, "rgba(255,240,140,0.9)");
gr.addColorStop(1, "rgba(255,240,140,0)");
ctx.fillStyle = gr;
ctx.fillRect(lampX - 110, lampY - 110, 220, 220);
ctx.restore();
s.sparkle(sx + 40, 420, 30, { alpha: s.at(1.1, 0.2) * (1 - s.at(1.5, 0.3)) });
s.burst(tail, 700, 80, { draw: s.at(2.9, 0.4), count: 8, stroke: s.c.white });
s.glow(lampX, lampY);
s.sfx("swish", 0.1, 0.8);
s.sfx("riser", 2.0, 0.7);
s.sfx("whip", 2.9, 0.9);

// ===== SCENE 7 =====
const z = s.lerp(1.9, 1, s.ease.out(s.clamp(s.t / (s.dur - 0.3), 0, 1)));
const ax = 110, ay = 760;
const scooter = (lampOn, spin) => {
  const wheel = (x) => {
    s.circle(x, 80, 40, { fill: "#2b2b33", width: 3 });
    s.circle(x, 80, 17, { fill: s.c.gray });
    for (let k = 0; k < 4; k++) {
      const a = spin + k * Math.PI / 2;
      s.line(x, 80, x + Math.cos(a) * 16, 80 + Math.sin(a) * 16, { stroke: s.c.white, width: 2, wobble: 0.3 });
    }
  };
  wheel(-115); wheel(110);
  s.curve([[-155, 30], [-140, -5], [-70, -15], [-25, 30], [-25, 58], [-125, 58], [-150, 50]], { closed: true, fill: s.c.orange });
  s.rect(-30, 46, 120, 22, { fill: "#e07a10", r: 8 });
  s.curve([[60, 58], [72, -50], [100, -78], [116, -50], [104, 58]], { closed: true, fill: s.c.orange });
  s.rect(-148, -32, 110, 26, { fill: s.c.brown, r: 12 });
  s.line(92, -70, 88, -112, { width: 6, stroke: s.c.gray });
  s.line(66, -114, 112, -108, { width: 7 });
  s.circle(118, -86, 16, { fill: lampOn ? s.c.yellow : s.c.gray });
  s.rect(-172, 54, 44, 14, { fill: s.c.gray, r: 6 });
};
// langit: matahari & awan (tidak ikut zoom)
s.circle(110, 200, 46, { fill: s.c.yellow, alpha: s.at(0, 0.4) });
s.rays(110, 200, 58, 84, 10, { draw: s.at(0.3, 0.5), stroke: s.c.orange, alpha: 0.7 });
for (let i = 0; i < 2; i++) {
  const cxx = (((i * 380 + 300 - s.t * (24 + i * 10)) % 800) + 800) % 800 - 60;
  s.group({ x: cxx, y: 150 + i * 70 }, () => {
    s.circle(-24, 4, 20, { fill: s.c.sky, alpha: 0.6, stroke: "none" });
    s.circle(2, -8, 26, { fill: s.c.sky, alpha: 0.6, stroke: "none" });
    s.circle(28, 4, 18, { fill: s.c.sky, alpha: 0.6, stroke: "none" });
  });
}
const road = [[110, 765], [320, 750], [540, 715], [580, 655], [400, 615], [230, 570], [300, 520], [500, 490], [570, 440], [470, 400], [450, 350], [540, 310], [600, 262]];
const dr = s.at(0.2, 1.7);
s.group({ x: ax - z * ax, y: ay - z * ay, scale: z }, () => {
  s.curve([[40, 800], [40, 650], [170, 530], [300, 435], [420, 335], [540, 235], [640, 212], [680, 260], [680, 800]],
    { closed: true, fill: s.c.green, alpha: 0.85 });
  s.curve(road, { stroke: "#b59a6a", width: 24, draw: dr, pen: true });
  s.curve(road, { stroke: s.c.white, width: 3, draw: dr, alpha: 0.8 });
  const tree = (x, y, t0) => s.group({ x, y, scale: s.pop(t0, 0.4) }, () => {
    s.rect(-4, -14, 8, 18, { fill: s.c.brown });
    s.circle(0, -30, 18, { fill: "#2f8f4e" });
  });
  tree(170, 650, 0.8); tree(470, 560, 1.0); tree(360, 450, 1.2);
  // bendera finish di puncak
  s.group({ x: 600, y: 262, scale: s.pop(1.5, 0.45) }, () => {
    s.line(0, 0, 0, -72, { width: 4 });
    s.shape([[2, -72], [42 + s.wave(4, 3), -64], [4, -46]], { fill: s.c.red });
  });
  // motor mungil di ujung jalan paling bawah
  s.group({ x: 110, y: 736 + s.wave(6, 0.8), scale: 0.24, rotate: s.wave(5, 0.01) }, () => scooter(true, 0));
  for (let i = 0; i < 3; i++) {
    const ph = (s.t * 1.2 + i / 3) % 1;
    s.circle(100 - ph * 40, 752 - ph * 30, 3 + ph * 8, { fill: s.c.gray, alpha: (1 - ph) * 0.7, stroke: "none", hatch: false });
  }
});
if (s.t > 1.5) s.glow(ax + z * (600 - ax), ay + z * (190 - ay));
s.sparkle(ax + z * (630 - ax), ay + z * (180 - ay), 26, { alpha: s.at(1.8, 0.2) });
s.sfx("chalk", 0.3, 0.7);
s.sfx("pop", 1.55, 0.8, 1.4);

// ===== SCENE 8 =====
const LX = 250, LY = 330, CX = 450, CY = 595;
const turn = s.ease.inOut(s.clamp((s.t - 0.9) / 1.05, 0, 1));
const th = turn * 1.0;
const on = s.at(1.95, 0.25);
const lp = s.pop(0, 0.4);
const kin = s.at(0, 0.35);
const sw = s.ease.inOut(s.clamp((s.t - 3.0) / 0.55, 0, 1));
const pt = (ph, r) => [Math.sin(ph) * r, -Math.cos(ph) * r];
const DK = "#2a2438";
// lubang kunci kontak
s.group({ x: LX, y: LY, scale: lp }, () => {
  s.rect(-68, -68, 136, 136, { fill: "#8f96a3", r: 32 });
  s.circle(0, 0, 44, { fill: "#2e2a3d" });
  s.circle(-56, 0, 6, { fill: s.c.gray });
  s.circle(-Math.cos(1.0) * 56, -Math.sin(1.0) * 56, 9, { fill: on > 0.5 ? s.c.green : s.c.gray });
});
// kunci perak + gantungan merah
s.group({ x: LX - (1 - kin) * 260, y: LY, rotate: th - (1 - kin) * 3 + (on > 0 ? s.wave(28, 0.012) : 0), scale: lp }, () => {
  s.rect(-150, -9, 150, 18, { fill: "#cfd3da", r: 6 });
  s.rect(-120, 9, 14, 12, { fill: "#cfd3da" });
  s.rect(-85, 9, 14, 16, { fill: "#cfd3da" });
  s.rect(-50, 9, 14, 10, { fill: "#cfd3da" });
  s.circle(-190, 0, 40, { fill: "#cfd3da" });
  s.circle(-196, 0, 14, { fill: "#2e2a3d" });
  s.group({ x: -196, y: 0, rotate: -th + s.wave(1.6, 0.12) }, () => {
    s.circle(0, 8, 12, { stroke: s.c.gray, width: 4 });
    s.line(0, 20, 0, 36, { stroke: s.c.gray, width: 3 });
    s.rect(-15, 34, 30, 62, { fill: s.c.red, r: 9 });
    s.circle(0, 48, 5, { fill: s.c.white });
  });
});
s.rays(LX, LY, 85, 120, 10, { draw: s.at(1.95, 0.4), stroke: s.c.yellow });
s.burst(LX, LY, 120, { draw: s.at(1.95, 0.4), count: 10, stroke: s.c.orange });
// jam dinding
const mh = pt(sw * Math.PI / 6, 98);
s.group({ x: CX + (1 - s.at(0.5, 0.5)) * 280, y: CY, scale: s.pop(0.5, 0.5), rotate: s.wave(1, 0.015) }, () => {
  s.circle(0, 0, 135, { fill: s.c.white, stroke: DK, width: 6 });
  if (sw > 0) {
    const w = [[0, 0]];
    for (let k = 0; k <= 12; k++) w.push(pt(sw * Math.PI / 6 * k / 12, 112));
    s.shape(w, { fill: s.c.yellow, stroke: "none" });
  }
  for (let i = 0; i < 12; i++) {
    const a = pt(i * Math.PI / 6, 122), c = pt(i * Math.PI / 6, i % 3 === 0 ? 102 : 110);
    s.line(a[0], a[1], c[0], c[1], { stroke: DK, width: i % 3 === 0 ? 4 : 2, wobble: 0.4 });
  }
  [["12", 0], ["3", 3], ["6", 6], ["9", 9]].forEach(([n, h]) => {
    const p = pt(h * Math.PI / 6, 78);
    s.text(n, p[0], p[1] + 9, { size: 26, color: DK, align: "center" });
  });
  const hh = pt(92.5 * Math.PI / 180, 62);
  s.line(0, 0, hh[0], hh[1], { stroke: DK, width: 8 });
  const sc = pt(s.t * 1.4, 104);
  s.line(0, 0, sc[0], sc[1], { stroke: s.c.gray, width: 2, wobble: 0.2, alpha: 0.7 });
  s.line(0, 0, mh[0], mh[1], { stroke: s.c.red, width: 5 });
  s.circle(0, 0, 9, { fill: DK });
});
s.sparkle(CX + 62, CY - 112, 30, { alpha: s.at(3.4, 0.2) });
s.burst(CX + 55, CY - 95, 80, { draw: s.at(3.65, 0.4), count: 10, stroke: s.c.yellow });
if (s.t < 2.7) s.glow(LX, LY); else s.glow(CX + mh[0], CY + mh[1]);
s.sfx("click", 0.9, 0.7);
s.sfx("thud", 1.95, 0.8, 0.6);
s.sfx("tock", 3.0, 0.8);
s.sfx("correct", 3.7, 0.9);

// ===== SCENE 9 =====
const k = Math.max(0.01, s.pop(0, 0.5));
const open = s.ease.out(s.clamp((s.t - 0.15) / 0.45, 0, 1));
const tb = s.at(0, 0.3);

// meja kayu
s.rect(30, 636, 660, 150, { fill: "#c99a62", r: 8, alpha: tb });
for (let i = 0; i < 5; i++) {
  s.line(50 + s.rand(i) * 40, 664 + i * 26, 670 - s.rand(i + 9) * 60, 664 + i * 26 + (s.rand(i + 4) - 0.5) * 8,
    { stroke: "#8a5a2b", width: 2, alpha: 0.35 * tb, wobble: 2 });
}
s.ellipse(360, 640, 290, 12, { fill: "rgba(60,30,10,0.25)", stroke: "none", alpha: tb });

// pensil di meja
s.group({ x: 190, y: 718, rotate: -0.15 + s.wave(1.5, 0.03), scale: s.pop(0.3, 0.4) }, () => {
  s.rect(-70, -7, 110, 14, { fill: s.c.yellow, r: 3 });
  s.shape([[40, -7], [66, 0], [40, 7]], { fill: "#f2d4a8" });
  s.rect(-82, -7, 14, 14, { fill: s.c.pink, r: 3 });
});

const msg = "Hari ini aku mulai.";
const n = Math.floor(s.clamp((s.t - 1.0) / 1.4, 0, 1) * msg.length);
const cw = 14.5;
const cx = -205 + n * cw;

s.group({ x: 360, y: 600, scale: k }, () => {
  // base laptop
  s.shape([[-290, 0], [290, 0], [305, 36], [-305, 36]], { fill: "#b9bcc2" });
  s.rect(-50, 8, 100, 14, { fill: "#a3a7ae", r: 6, width: 2 });
  // layar
  const H = 330 * open + s.wave(2, 2) * open;
  if (H > 4) {
    s.rect(-240, -H, 480, H, { fill: "#8e949c", r: 14 });
    if (open > 0.9) {
      s.rect(-222, -H + 18, 444, H - 36, { fill: s.c.white, r: 6, width: 2 });
      s.line(-205, -H + 38, -120, -H + 38, { stroke: "#d8d8d8", width: 4, wobble: 0.4 });
      if (n > 0) s.text(msg.slice(0, n), -205, -210, { size: 30, align: "left", color: s.c.ink });
      const typing = s.t >= 1.0 && s.t <= 2.4;
      const blink = Math.floor(s.t * 4) % 2 === 0;
      if (typing || (blink && s.t < 2.8)) {
        s.line(cx, -232, cx, -190, { stroke: s.c.blue, width: 3, wobble: 0.2 });
      }
      // centang besar
      if (s.t > 2.8) {
        const pk = Math.max(0.01, s.pop(2.8, 0.4));
        s.group({ x: 165, y: -180, scale: pk, rotate: s.wave(3, 0.06) * s.at(3.0, 0.3) }, () => {
          s.circle(0, 0, 64, { fill: "#c8f0c8", stroke: s.c.green, width: 4 });
          s.check(0, 4, 90, { stroke: s.c.green, width: 11, draw: s.at(2.8, 0.3) });
        });
      }
    }
  }
});

// efek
s.burst(525, 420, 110, { draw: s.at(2.8, 0.4), count: 10, stroke: s.c.green });
for (let i = 0; i < 3; i++) {
  const a = s.at(2.95 + i * 0.1, 0.2);
  const px = 470 + i * 60 + (i === 1 ? 20 : 0), py = 330 + (i % 2) * 150;
  s.sparkle(px, py, 18 + s.wave(4, 5, i), { alpha: a, stroke: s.c.yellow, fill: s.c.yellow });
}

// glow pemandu
if (s.t < 2.8) s.glow(360 + cx, 390 + k * 0);
else s.glow(525, 420 + s.wave(4, 4));

s.sfx("click", 0.35, 0.6);
for (let i = 0; i < 8; i++) s.sfx("type", 1.0 + i * 0.18, 0.45);
s.sfx("correct", 2.8, 0.9);
s.sfx("sparkle", 3.0, 0.5);

// ===== SCENE 10 =====
s.ground(760, 40, 680);

const inT = s.at(0, 0.35);
const sx = 300 - (1 - inT) * 460;
const sy = 704 + s.wave(16, 1.3);
const on = 0.55 + 0.45 * s.at(1.0, 0.3);
const flick = on * (0.92 + 0.08 * s.wave(9, 1));
const hx = sx + 200, hy = sy - 158;

const wheel = (x) => {
  s.circle(x, 0, 56, { fill: "#3b3b4d", width: 3 });
  s.circle(x, 0, 26, { fill: "#c9ccd3" });
  for (let i = 0; i < 5; i++) {
    const a = s.t * 5 + i * 1.2566;
    s.line(x, 0, x + Math.cos(a) * 22, Math.sin(a) * 22, { width: 3, wobble: 0.3 });
  }
  s.circle(x, 0, 6, { fill: s.c.ink });
};

s.group({ x: sx, y: sy, rotate: s.wave(16, 0.004) }, () => {
  wheel(-150);
  wheel(150);
  s.arc(150, 0, 70, Math.PI * 1.1, Math.PI * 1.9, { stroke: "#e07a1f", width: 12, wobble: 0.5 });
  s.line(165, -110, 150, 0, { width: 7 });
  s.curve([[-222, -8], [-229, -70], [-185, -118], [-90, -122], [-30, -85], [-22, -8]], { closed: true, fill: s.c.orange });
  s.rect(-205, -150, 155, 32, { fill: s.c.brown, r: 14 });
  s.rect(-30, -22, 125, 22, { fill: "#f08a24", r: 6 });
  s.curve([[88, -12], [96, -120], [128, -190], [168, -196], [182, -110], [150, -12]], { closed: true, fill: s.c.orange });
  s.line(150, -190, 140, -232, { width: 8 });
  s.line(112, -236, 176, -244, { width: 9 });
  s.line(124, -238, 112, -282, { width: 3 });
  s.ellipse(112, -288, 13, 9, { fill: "#c9ccd3" });
  s.circle(176, -158, 26, { fill: s.c.yellow, width: 3 });
  s.circle(176, -158, 13, { fill: s.c.white, stroke: "none", alpha: flick });
  s.rect(-232, -80, 12, 26, { fill: s.c.red, r: 4 });
});

// cahaya lampu depan
ctx.save();
const halo = ctx.createRadialGradient(hx, hy, 4, hx, hy, 110);
halo.addColorStop(0, "rgba(255,240,150," + (0.6 * flick) + ")");
halo.addColorStop(1, "rgba(255,240,150,0)");
ctx.fillStyle = halo;
ctx.fillRect(hx - 120, hy - 120, 240, 240);
const g = ctx.createLinearGradient(hx, hy, hx + 230, hy);
g.addColorStop(0, "rgba(255,238,140," + (0.7 * flick) + ")");
g.addColorStop(1, "rgba(255,238,140,0)");
ctx.fillStyle = g;
ctx.beginPath();
ctx.moveTo(hx, hy - 18);
ctx.lineTo(hx + 230, hy - 110);
ctx.lineTo(hx + 230, hy + 90);
ctx.lineTo(hx, hy + 18);
ctx.closePath();
ctx.fill();
ctx.restore();
s.rays(hx, hy, 34, 34 + 30 * on, 10, { stroke: s.c.yellow, alpha: inT });

// tombol FOLLOW melompat
const sinH = Math.abs(Math.sin(Math.PI * s.t / 0.58));
const by = 340 - 75 * sinH - (1 - s.at(0, 0.35)) * 420;
const q = Math.pow(1 - sinH, 10);
const bsx = 1 + 0.1 * q, bsy = 1 - 0.1 * q;
s.group({ x: 360, y: by, rotate: Math.sin(s.t * 5.4) * 0.08 }, () => {
  s.ellipse(0, 0, 84 * bsx, 84 * bsy, { fill: s.c.red, width: 4 });
  s.ellipse(0, 0, 66 * bsx, 66 * bsy, { stroke: s.c.white, width: 2, alpha: 0.5 });
  s.line(-14, -28, 14, -28, { stroke: s.c.white, width: 7 });
  s.line(0, -42, 0, -14, { stroke: s.c.white, width: 7 });
  s.text("FOLLOW", 0, 20, { size: 30, color: s.c.white, align: "center" });
});
s.glow(424, by - 64);

// bintang krayon meletup
s.burst(360, 330, 130, { draw: s.at(1.7, 0.4), count: 12, stroke: s.c.yellow });
s.burst(360, 330, 110, { draw: s.at(2.32, 0.4), count: 10, stroke: s.c.orange });
for (let i = 0; i < 20; i++) {
  const t0 = i < 12 ? 1.7 : 2.32;
  const tt = s.t - t0;
  if (tt <= 0) continue;
  const r1 = s.rand(i * 3 + 1), r2 = s.rand(i * 3 + 2), r3 = s.rand(i * 3 + 3);
  const ang = -Math.PI / 2 + (r1 - 0.5) * 2.2;
  const sp = 300 + r2 * 260;
  const px = 360 + Math.cos(ang) * sp * tt;
  const py = 330 + Math.sin(ang) * sp * tt + 420 * tt * tt;
  const al = 1 - s.clamp((tt - 0.5) / 0.8, 0, 1);
  s.group({ x: px, y: py, rotate: tt * (r3 - 0.5) * 10, alpha: al, scale: (0.9 + r3 * 0.6) * Math.min(1, tt * 8) }, () => {
    const pts = [];
    for (let j = 0; j < 10; j++) {
      const rad = j % 2 ? 9 : 22;
      const a = j * Math.PI / 5 - Math.PI / 2;
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    s.shape(pts, { fill: s.c.yellow, width: 2 });
  });
}

s.sfx("swish", 0.1, 0.6);
s.sfx("ding", 1.1, 0.6);
s.sfx("rise", 0.8, 0.7);
s.sfx("boing", 1.7, 0.9);
s.sfx("sparkle", 1.75, 0.6);
s.sfx("boing", 2.32, 0.6, 1.3);
