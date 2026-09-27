/**
 * Red Dead Redemption 2 on the fly's monitor: a third-person western at
 * golden hour, painted procedurally. It is recognisable by its setting,
 * palette and HUD conventions only: the low sun, mesas and a telegraph line,
 * a saddled horse that waits, outlaws in bandanas, Dead Eye's sepia and red
 * marks, the round minimap with its cores, a medal at the end. There are no
 * logos and no assets. The cowboy is the fly, in a duster and a hat.
 *
 * The world is a panorama round the player. A camera that only turns never
 * moves anything static against anything else, so the sky, the far land and
 * the ground are each painted once into a strip one turn wide and slid past
 * the screen. What lives — the horse, the poles and wires close by, the grass
 * at the fly's feet, outlaws, dust and smoke — is drawn over them each frame
 * at its bearing and range, with the same projection the strips were baked in.
 */
import { formatRank } from '../../game/games.js';
import { HALF_FOV } from '../../game/gamer.js';
import {
  MAIN_W, MAIN_H, SANS, PX_PER_RAD, TAU, clamp, clamp01, hash, smooth, vnoise, wrap, rrect, camYaw, bearingX, enemyOnScreen,
} from './kit.js';

const W = MAIN_W;
const H = MAIN_H;
const PI = Math.PI;
const SERIF = "Georgia, 'Times New Roman', Times, serif";

// ================================================================ the world

/** The sun, low in the west. The trail runs west, into it; the mission starts looking down it. */
const SUN_A = 0.2;
const TRAIL_A = -0.06;
const NORTH_A = SUN_A + PI / 2;
/** How far over the horizon the sun stands, in screen px, and that as an angle. */
const SUN_ROW = 82;
const SUN_ELEV = SUN_ROW / PX_PER_RAD;
/** Metres: the camera's height over the ground. */
const CAM_H = 1.7;
/** The horizon's screen row at level pitch. */
const HZ0 = Math.round(H * 0.46);
/** One turn of the panorama at full resolution. */
const PW = Math.round(TAU * PX_PER_RAD);

const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (e0, e1, x) => smooth(clamp01((x - e0) / (e1 - e0)));
/** Screen px under the horizon of a point h metres up, r metres away. */
const rowOf = (r, h = 0) => Math.atan((CAM_H - h) / r) * PX_PER_RAD;
/** 1 looking into the sun, −1 with it at the back. */
const sunF = (a) => Math.cos(a - SUN_A);
/** How backlit a thing at bearing a is: 0 lit full on, 1 a silhouette. */
const backOf = (a) => smooth(clamp01((sunF(a) + 0.2) / 1.05));
const panoX = (a) => { const u = a / TAU; return (u - Math.floor(u)) * PW; };

// ------------------------------------------------------------------ colour

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
const WHITE = [255, 246, 228];

/**
 * A colour under the low sun: `lit` with the sun behind the camera, `back`
 * looking into it. Every step between, and a hit flash on top, is made once
 * and kept, so a frame allocates no colour strings.
 */
const P = (lit, back) => ({ lit: rgb(lit), back: rgb(back), cache: [] });
function tone(p, k, flash = 0) {
  const q = Math.round(clamp01(k) * 16);
  const f = Math.round(clamp01(flash) * 4);
  const i = q * 5 + f;
  let c = p.cache[i];
  if (!c) { c = css(mix(mix(p.lit, p.back, q / 16), WHITE, f * 0.16)); p.cache[i] = c; }
  return c;
}

/** The haze between the camera and the far land: gold toward the sun, rose and lavender away. */
function hazeAt(a) {
  const f = sunF(a);
  return mix(mix([222, 170, 150], [176, 158, 190], Math.max(0, -f)), [252, 208, 140], Math.pow(Math.max(0, f), 2));
}

// ------------------------------------------------------------ noise, round

/** Value noise sampled round a circle: periodic in the angle, so the panorama has no seam. */
const ringN = (a, f, seed) => vnoise(Math.cos(a) * f + 40 + seed * 13.1, Math.sin(a) * f + 40 + seed * 7.7);
function fbm(a, f, seed, oct = 4) {
  let s = 0, amp = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { s += amp * ringN(a, f, seed + o * 5); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

// ---------------------------------------------------------- places, around

const FWD = [Math.sin(TRAIL_A), Math.cos(TRAIL_A)];
const RIGHT = [Math.cos(TRAIL_A), -Math.sin(TRAIL_A)];
/** A point d metres along the trail (west positive), lat metres to its right. */
const trailPt = (d, lat) => [FWD[0] * d + RIGHT[0] * lat, FWD[1] * d + RIGHT[1] * lat];
const bearing = (x, z) => Math.atan2(x, z);

const HORSE = { a: 0.47, r: 9 };
const WAGON = { a: SUN_A - 1.65, r: 20 };
const FIRE = { a: SUN_A - 1.5, r: 17 };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Draw something round the seam: once where it is, again a turn over if it crosses the ends. */
function around(x, span, fn) {
  fn(x);
  if (x - span < 0) fn(x + PW);
  if (x + span > PW) fn(x - PW);
}

/** Copy a panorama's first columns past its end, so one drawImage never meets the seam. */
function closeRing(c) {
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const ext = c.width - c.panoW;
  ctx.clearRect(c.panoW, 0, ext, c.height);
  ctx.drawImage(c, 0, 0, ext, c.height, c.panoW, 0, ext, c.height);
}

/** A horizontal gradient once round the world, its colour at each angle from `fn`. */
function aroundGradient(ctx, fn, stops = 64) {
  const gr = ctx.createLinearGradient(0, 0, PW, 0);
  for (let i = 0; i <= stops; i++) gr.addColorStop(i / stops, fn((i / stops) * TAU));
  return gr;
}

/** One style over vertical strips, each as strong as `alphaAt` says at its angle. */
function strips(ctx, style, y0, y1, alphaAt, step) {
  ctx.fillStyle = style;
  for (let x = 0; x < PW; x += step) {
    const al = alphaAt(((x + step / 2) / PW) * TAU);
    if (al <= 0.004) continue;
    ctx.globalAlpha = Math.min(1, al);
    ctx.fillRect(x, y0, step, y1 - y0);
  }
  ctx.globalAlpha = 1;
}

/** Vertical strips each with its own gradient: `fn(a)` → [colour, alpha at y0, alpha at y1]. */
function stripsTinted(ctx, y0, y1, fn, step) {
  for (let x = 0; x < PW; x += step) {
    const [c, a0, a1] = fn(((x + step / 2) / PW) * TAU);
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, css(c, a0));
    gr.addColorStop(1, css(c, a1));
    ctx.fillStyle = gr;
    ctx.fillRect(x, y0, step, y1 - y0);
  }
}

// =========================================================== the sky, baked

const SKY_S = 0.5;
const SKY_ROWS = 480;
const SKY_HZ = 450;

function puff(ctx, x, y, r, lx, ly, body, lit, alpha) {
  const gr = ctx.createRadialGradient(x + lx * r * 0.5, y + ly * r * 0.5, r * 0.04, x, y, r);
  gr.addColorStop(0, css(lit, alpha));
  gr.addColorStop(0.42, css(mix(lit, body, 0.55), alpha));
  gr.addColorStop(0.72, css(body, alpha * 0.85));
  gr.addColorStop(1, css(body, 0));
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

function paintCloud(ctx, cl) {
  const alt = clamp01((SKY_HZ - cl.y) / 400);
  const f = sunF(cl.a);
  const near = Math.pow(Math.max(0, f), 2);
  const away = Math.max(0, -f);
  // backlit near the sun: dark violet bodies, gold edges; away: rose bodies lit orange-pink
  const body = mix(mix([204, 146, 146], [168, 148, 180], away), [104, 82, 106], near * (1 - alt * 0.35));
  const lit = mix(mix([255, 198, 142], [250, 180, 160], away), [255, 228, 164], near);
  const top = mix(body, [236, 214, 214], 0.25 * (1 - near));
  const lx = clamp(wrap(SUN_A - cl.a) * 2, -1, 1) * 0.55;
  const n = Math.round(8 + (cl.w / cl.h) * 3);
  around(panoX(cl.a), cl.w, (x0) => {
    // the flat, sunlit underside
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const px = x0 + (u - 0.5) * cl.w * 1.05 + (hash(cl.seed + i * 1.9) - 0.5) * cl.h * 0.4;
      const r = cl.h * (0.34 + 0.18 * hash(cl.seed + i * 4.1)) * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)));
      puff(ctx, px, cl.y + cl.h * 0.12, r, lx, 0.9, body, lit, 0.9);
    }
    // the heaped tops, back to front
    for (let i = 0; i < n; i++) {
      const u = hash(cl.seed + i * 2.3 + 0.7);
      const dome = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
      const px = x0 + (u - 0.5) * cl.w * 0.9;
      const r = cl.h * (0.26 + 0.34 * dome) * (0.7 + 0.5 * hash(cl.seed + i * 3.7));
      const py = cl.y - dome * cl.h * cl.tall + (hash(cl.seed + i * 5.3) - 0.5) * cl.h * 0.25;
      puff(ctx, px, py, r, lx, 0.55, mix(body, top, 0.5 + 0.5 * dome), lit, 0.8);
    }
  });
}

function buildSky() {
  const s = SKY_S;
  const pw = Math.round(PW * s);
  const c = makeCanvas(pw + Math.ceil(W * s) + 2, SKY_ROWS * s);
  Object.assign(c, { panoW: pw, s, rowHz: SKY_HZ });
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const base = ctx.createLinearGradient(0, 0, 0, SKY_HZ);
  [[0, '#284272'], [0.3, '#48628f'], [0.56, '#8a88a6'], [0.76, '#d49e8a'], [0.9, '#efb97c'], [1, '#f7d49c']].forEach(([o, col]) => base.addColorStop(o, col));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PW, SKY_ROWS);
  // away from the sun: the earth's own shadow, blue-grey, under a pink belt
  const anti = ctx.createLinearGradient(0, SKY_HZ * 0.4, 0, SKY_HZ);
  [[0, 'rgba(126,118,168,0)'], [0.5, 'rgba(206,150,168,0.7)'], [0.8, 'rgba(214,160,170,0.85)'], [0.93, 'rgba(128,128,168,0.85)'], [1, 'rgba(160,146,170,0.85)']].forEach(([o, col]) => anti.addColorStop(o, col));
  strips(ctx, anti, 0, SKY_ROWS, (a) => Math.pow(Math.max(0, -sunF(a)), 1.2) * 0.85, 6);
  // toward it: gold, deepening to the horizon
  const toward = ctx.createLinearGradient(0, SKY_HZ * 0.3, 0, SKY_HZ);
  [[0, 'rgba(255,170,90,0)'], [0.55, 'rgba(250,150,86,0.45)'], [0.85, 'rgba(255,180,96,0.8)'], [1, 'rgba(255,226,150,0.95)']].forEach(([o, col]) => toward.addColorStop(o, col));
  strips(ctx, toward, 0, SKY_ROWS, (a) => Math.pow(Math.max(0, sunF(a)), 2.2), 6);
  // the glow round the sun, wide and low
  const sx = panoX(SUN_A), sy = SKY_HZ - SUN_ROW;
  around(sx, 1300, (x) => {
    ctx.save();
    ctx.translate(x, sy);
    ctx.scale(2.6, 1);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 500);
    [[0, 'rgba(255,244,210,0.95)'], [0.05, 'rgba(255,226,160,0.85)'], [0.18, 'rgba(255,186,110,0.5)'], [0.45, 'rgba(246,146,90,0.2)'], [1, 'rgba(240,130,90,0)']].forEach(([o, col]) => gl.addColorStop(o, col));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, 0, 500, 0, TAU); ctx.fill();
    ctx.restore();
  });
  // the sun
  around(sx, 60, (x) => {
    const d = ctx.createRadialGradient(x, sy, 0, x, sy, 30);
    [[0, 'rgba(255,255,246,1)'], [0.55, 'rgba(255,248,214,1)'], [0.7, 'rgba(255,226,160,0.8)'], [1, 'rgba(255,200,120,0)']].forEach(([o, col]) => d.addColorStop(o, col));
    ctx.fillStyle = d;
    ctx.beginPath(); ctx.arc(x, sy, 30, 0, TAU); ctx.fill();
  });
  // clouds: far and low first, overhead last
  const clouds = [];
  for (let i = 0; i < 30; i++) {
    const y = SKY_HZ - (120 + hash(i * 5.31 + 0.2) * 250);
    const up = (SKY_HZ - y) / 250;
    clouds.push({ a: hash(i * 3.17 + 0.5) * TAU, y, w: (170 + hash(i * 7.1) * 360) * (0.8 + up * 0.5), h: (34 + hash(i * 2.9) * 44) * (0.8 + up * 0.5), tall: 0.35 + hash(i * 8.3) * 0.35, seed: i * 13.7 });
  }
  // a bank over the sun, lit from underneath
  for (let i = 0; i < 5; i++) {
    clouds.push({ a: SUN_A + (i - 2) * 0.24 + (hash(i * 9.9) - 0.5) * 0.12, y: SKY_HZ - 250 - hash(i * 4.4) * 110, w: 300 + hash(i + 3) * 260, h: 50 + hash(i * 3.3) * 34, tall: 0.3, seed: 500 + i * 7.7 });
  }
  clouds.sort((p, q) => q.y - p.y);
  for (const cl of clouds) paintCloud(ctx, cl);
  // long streaks of stratus low down, the brightest thing but the sun
  for (let i = 0; i < 30; i++) {
    const a = hash(i * 8.3 + 1.1) * TAU;
    const y = SKY_HZ - 18 - hash(i * 6.1) * 120;
    const len = 260 + hash(i * 2.2) * 760, th = 4 + hash(i * 1.9) * 9;
    const f = sunF(a);
    const col = mix(mix([246, 170, 140], [196, 150, 176], Math.max(0, -f)), [255, 214, 150], Math.pow(Math.max(0, f), 2));
    around(panoX(a), len, (x) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(len / 2, th / 2);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, css(col, 0.7)); gr.addColorStop(0.6, css(col, 0.45)); gr.addColorStop(1, css(col, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }
  // high cirrus, faint
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const a = hash(i * 4.9 + 2.2) * TAU, y = 40 + hash(i * 3.3) * 150;
    const len = 120 + hash(i * 6.6) * 260;
    const f = sunF(a);
    ctx.strokeStyle = css(mix([250, 214, 220], [255, 226, 180], Math.max(0, f)), 0.16);
    ctx.lineWidth = 2 + hash(i) * 4;
    around(panoX(a), len, (x) => {
      ctx.beginPath(); ctx.moveTo(x - len / 2, y + 6); ctx.quadraticCurveTo(x, y - 8, x + len / 2, y + 2); ctx.stroke();
    });
  }
  closeRing(c);
  return c;
}

// ========================================================== the land, baked

const LAND_ROWS = 380;
const LAND_HZ = 250;

const sunGap = (a, w) => smoothstep(0.02, w, Math.abs(wrap(a - SUN_A)));

/** The far range: snow in the north, low where the sun goes down. */
function farH(a) {
  const north = Math.max(0, Math.cos(a - NORTH_A));
  const base = 10 + 34 * fbm(a, 5, 1, 5);
  const peaks = 100 * Math.pow(clamp01((fbm(a, 2.2, 2, 4) - 0.4) * 2.4), 1.5) * (0.3 + 0.7 * north);
  return (base + peaks) * (0.5 + 0.5 * sunGap(a, 0.4));
}

/** Mesas: flat caps on steep cliffs, talus under them, mostly south and west. */
function mesaH(a) {
  const south = Math.max(0, Math.cos(a - (SUN_A - 1.0)));
  const m = fbm(a, 2.6, 5, 3) + south * 0.13 - 0.05;
  const cap = smoothstep(0.54, 0.562, m);
  const talus = smoothstep(0.44, 0.562, m);
  const top = 46 + 36 * ringN(a, 1.1, 8) + 3 * fbm(a, 60, 3, 2);
  return Math.max(cap * top, talus * top * 0.4) * (0.25 + 0.75 * sunGap(a, 0.3));
}

/** Rolling hills a kilometre or two out, wooded to the north. */
function hillH(a) {
  const north = Math.max(0, Math.cos(a - NORTH_A));
  return 3 + (8 + 20 * north) * Math.pow(fbm(a, 7, 12, 4), 1.3) * 1.4;
}

function pine(ctx, x, y, h, w) {
  ctx.moveTo(x, y - h);
  const steps = 5;
  for (let k = 1; k <= steps; k++) {
    const yy = y - h + (h * 0.88 * k) / steps;
    const ww = (w * k) / steps;
    ctx.lineTo(x + ww, yy);
    ctx.lineTo(x + ww * 0.45, yy - h * 0.04);
  }
  ctx.lineTo(x + w * 0.12, y);
  ctx.lineTo(x - w * 0.12, y);
  for (let k = steps; k >= 1; k--) {
    const yy = y - h + (h * 0.88 * k) / steps;
    const ww = (w * k) / steps;
    ctx.lineTo(x - ww * 0.45, yy - h * 0.04);
    ctx.lineTo(x - ww, yy);
  }
  ctx.closePath();
}

function landLayer(ctx, lx, hs, o) {
  const n = hs.length;
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, PW, LAND_ROWS);
  lx.fillStyle = '#000';
  if (o.fill !== false) {
    lx.beginPath();
    lx.moveTo(0, LAND_HZ + 3);
    for (let i = 0; i < n; i++) lx.lineTo(i * 2, LAND_HZ - hs[i]);
    lx.lineTo(PW, LAND_HZ + 3);
    lx.closePath();
    lx.fill();
  }
  if (o.extra) { lx.beginPath(); o.extra(lx, hs); lx.fill(); }
  lx.globalCompositeOperation = 'source-atop';
  lx.fillStyle = aroundGradient(lx, (a) => css(mix(o.lit, o.back, backOf(a))));
  lx.fillRect(0, 0, PW, LAND_ROWS);
  const vg = lx.createLinearGradient(0, LAND_HZ - o.top, 0, LAND_HZ);
  vg.addColorStop(0, 'rgba(255,222,180,0.12)');
  vg.addColorStop(0.45, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(24,12,22,${o.baseDark})`);
  lx.fillStyle = vg;
  lx.fillRect(0, 0, PW, LAND_ROWS);
  if (o.detail) o.detail(lx, hs);
  // the sun's edge along the top
  if (o.rim) {
    lx.lineWidth = o.rimW ?? 2.5;
    lx.strokeStyle = aroundGradient(lx, (a) => `rgba(255,212,150,${(Math.pow(Math.max(0, sunF(a)), 3) * o.rim + Math.pow(Math.max(0, -sunF(a)), 2) * o.rim * 0.35).toFixed(3)})`);
    lx.beginPath();
    for (let i = 0; i < n; i++) lx.lineTo(i * 2, LAND_HZ - hs[i]);
    lx.stroke();
  }
  // haze, heavier into the sun
  lx.fillStyle = aroundGradient(lx, (a) => css(hazeAt(a), clamp01(o.haze + o.glare * Math.pow(Math.max(0, sunF(a)), 4))));
  lx.fillRect(0, 0, PW, LAND_ROWS);
  const hb = lx.createLinearGradient(0, LAND_HZ - 30, 0, LAND_HZ + 2);
  hb.addColorStop(0, 'rgba(240,200,160,0)');
  hb.addColorStop(1, `rgba(240,200,160,${o.baseHaze ?? 0.25})`);
  lx.fillStyle = hb;
  lx.fillRect(0, 0, PW, LAND_ROWS);
  lx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lx.canvas, 0, 0);
}

function snowCaps(lx, hs) {
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    const line = 64 + 10 * vnoise(i * 0.09, 3.3);
    if (h < line) continue;
    const a = (i * 2 / PW) * TAU;
    const k = backOf(a);
    lx.fillStyle = css(mix([252, 222, 214], [150, 146, 176], k), 0.9);
    lx.fillRect(i * 2, LAND_HZ - h, 2, (h - line) * 0.8 + 2);
  }
}

function mesaDetail(lx, hs) {
  // strata: level bands at fixed heights, the way sandstone lies
  lx.lineWidth = 1.4;
  for (let k = 1; k < 16; k++) {
    const y = LAND_HZ - k * 6.5;
    lx.strokeStyle = k % 3 === 0 ? 'rgba(255,214,170,0.10)' : 'rgba(80,34,26,0.16)';
    lx.beginPath();
    for (let x = 0; x <= PW; x += 24) lx.lineTo(x, y + Math.sin(x * 0.013 + k) * 1.2);
    lx.stroke();
  }
  // the cap rock lighter, the cliffs streaked, faces toward the sun lit
  for (let i = 1; i < hs.length - 1; i++) {
    const h = hs[i];
    if (h < 3) continue;
    const a = (i * 2 / PW) * TAU;
    const x = i * 2;
    const f = sunF(a);
    lx.fillStyle = `rgba(255,200,150,${(0.16 + 0.1 * Math.max(0, -f)).toFixed(3)})`;
    lx.fillRect(x, LAND_HZ - h, 2, Math.min(7, h));
    const streak = vnoise(i * 0.35, 7.1);
    if (streak > 0.6) { lx.fillStyle = `rgba(60,24,20,${((streak - 0.6) * 0.6).toFixed(3)})`; lx.fillRect(x, LAND_HZ - h + 5, 2, h * 0.6); }
    const slope = (hs[i + 1] - hs[i - 1]) / 4;
    const side = clamp(-slope * 1.2, -1, 1) * Math.sin(wrap(SUN_A - a)) * (1 - Math.abs(f) * 0.4);
    if (Math.abs(side) > 0.05) {
      lx.fillStyle = side > 0 ? `rgba(255,178,110,${(side * 0.4).toFixed(3)})` : `rgba(40,16,30,${(-side * 0.45).toFixed(3)})`;
      lx.fillRect(x - 6, LAND_HZ - h, 12, h + 3);
    }
  }
}

function hillDetail(lx, hs) {
  // a scatter of scrub and shade on the slopes
  for (let i = 0; i < 2600; i++) {
    const x = hash(i * 1.77) * PW;
    const hIdx = Math.min(hs.length - 1, Math.round(x / 2));
    const h = hs[hIdx];
    const y = LAND_HZ - h * hash(i * 2.9);
    lx.fillStyle = i % 3 ? 'rgba(30,26,18,0.35)' : 'rgba(255,214,150,0.18)';
    lx.fillRect(x, y, 2 + hash(i * 3.3) * 3, 1.5);
  }
}

function pines(lx, hs) {
  // woods along the northern hills: each tree its own spire
  for (let i = 0; i < 1400; i++) {
    const a = hash(i * 2.13 + 0.4) * TAU;
    const north = Math.cos(a - NORTH_A);
    if (north < 0.15 && hash(i * 7.7) > 0.12) continue;
    const x = panoX(a);
    const h0 = hs[Math.min(hs.length - 1, Math.round(x / 2))];
    const y = LAND_HZ - h0 * (0.2 + 0.8 * hash(i * 3.9)) + 2;
    const th = 8 + hash(i * 5.1) * 14 * (0.6 + north * 0.6);
    around(x, 12, (xx) => pine(lx, xx, y, th, th * 0.28));
  }
}

function buildLand() {
  const c = makeCanvas(PW + W + 2, LAND_ROWS);
  Object.assign(c, { panoW: PW, s: 1, rowHz: LAND_HZ });
  const ctx = c.getContext('2d');
  const lx = makeCanvas(PW, LAND_ROWS).getContext('2d');
  const n = Math.floor(PW / 2) + 1;
  const heights = (fn) => { const hs = new Float32Array(n); for (let i = 0; i < n; i++) hs[i] = fn(((i * 2) / PW) * TAU); return hs; };
  const flat = heights(hillH);
  landLayer(ctx, lx, heights(farH), { lit: [200, 138, 140], back: [104, 80, 104], haze: 0.5, glare: 0.4, rim: 0.3, top: 110, baseDark: 0.1, detail: snowCaps, baseHaze: 0.35 });
  landLayer(ctx, lx, heights(mesaH), { lit: [212, 112, 66], back: [80, 46, 50], haze: 0.26, glare: 0.42, rim: 0.95, top: 90, baseDark: 0.38, detail: mesaDetail });
  landLayer(ctx, lx, flat, { lit: [140, 120, 66], back: [46, 38, 34], haze: 0.18, glare: 0.34, rim: 0.7, top: 40, baseDark: 0.3, detail: hillDetail });
  landLayer(ctx, lx, flat, { fill: false, extra: pines, lit: [62, 76, 48], back: [22, 24, 22], haze: 0.14, glare: 0.3, rim: 0, top: 40, baseDark: 0.2 });
  // the plains at the foot of it all, hazy gold, fading into the ground strip below
  stripsTinted(ctx, LAND_HZ - 3, LAND_HZ + 16, (a) => [mix(hazeAt(a), [206, 160, 104], 0.35), 0.9, 0], 4);
  setPieces(ctx);
  closeRing(c);
  return c;
}

// ---------------------------------------------------------- set pieces, far

/** Anything standing at a bearing and range in the land strip: `fn(ctx, x, y, m, k)`, m px a metre. */
function piece(ctx, a, r, span, fn) {
  const m = PX_PER_RAD / r;
  const y = LAND_HZ + rowOf(r);
  around(panoX(a), span * m, (x) => fn(ctx, x, y, m, backOf(a), a));
}

function setPieces(ctx) {
  // boulders scattered close and far
  for (let i = 0; i < 26; i++) {
    const a = hash(i * 6.1 + 3) * TAU, r = 24 + hash(i * 2.3) * 90, sz = 0.8 + hash(i * 4.4) * 2.4;
    if (Math.abs(wrap(a - TRAIL_A)) < 0.12 || Math.abs(wrap(a - TRAIL_A - PI)) < 0.12) continue;
    piece(ctx, a, r, sz, (c, x, y, m, k) => boulder(c, x, y, sz * m, k, i));
  }
  // saguaros, south
  for (let i = 0; i < 6; i++) {
    const a = SUN_A - 1.25 - hash(i * 3.3) * 1.3, r = 55 + hash(i * 5.5) * 90, h = 4.5 + hash(i * 7.7) * 3.5;
    piece(ctx, a, r, 2, (c, x, y, m, k) => cactus(c, x, y, m, h, k, i));
  }
  // a lone oak or two, north-east
  for (let i = 0; i < 5; i++) {
    const a = SUN_A + 1.05 + hash(i * 2.7) * 1.1, r = 45 + hash(i * 1.9) * 70;
    piece(ctx, a, r, 7, (c, x, y, m, k) => oak(c, x, y, m, 6 + hash(i) * 3, k, i));
  }
  // the dead tree
  piece(ctx, SUN_A - 0.95, 38, 7, (c, x, y, m, k) => deadTree(c, x, y, m, k));
  // the windmill
  piece(ctx, SUN_A + 2.25, 62, 4, (c, x, y, m, k) => windmill(c, x, y, m, k));
  // the town, back east along the trail
  const town = [
    [-0.26, 215, 'church'], [-0.18, 190, 'house'], [-0.11, 176, 'store'], [-0.045, 170, 'saloon'], [0.03, 172, 'hotel'],
    [0.1, 180, 'store'], [0.16, 196, 'tower'], [0.22, 205, 'house'], [0.29, 222, 'barn'],
  ];
  for (const [da, r, kind] of town) piece(ctx, TRAIL_A + PI + da, r, 16, (c, x, y, m, k) => building(c, x, y, m, kind, k, r));
  // the covered wagon by the campfire
  piece(ctx, WAGON.a, WAGON.r, 5, (c, x, y, m, k) => wagon(c, x, y, m, k));
}

function boulder(ctx, x, y, s, k, seed) {
  const lit = mix([196, 150, 112], [70, 52, 48], k);
  ctx.fillStyle = css(mix(lit, [40, 26, 26], 0.35));
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * (0.45 + hash(seed) * 0.2), x - s * 0.1, y - s * 0.62);
  ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.66, x + s * 0.58, y - s * 0.1);
  ctx.lineTo(x + s * 0.55, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(lit, 0.9);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.45, y - s * 0.3);
  ctx.quadraticCurveTo(x - s * 0.35, y - s * 0.6, x - s * 0.05, y - s * 0.6);
  ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.6, x + s * 0.4, y - s * 0.28);
  ctx.quadraticCurveTo(x, y - s * 0.4, x - s * 0.45, y - s * 0.3);
  ctx.fill();
}

function cactus(ctx, x, y, m, h, k, seed) {
  const col = css(mix([96, 116, 66], [30, 36, 28], k));
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.55 * m;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h * m); ctx.stroke();
  ctx.lineWidth = 0.38 * m;
  const arm = (side, at, up) => {
    ctx.beginPath();
    ctx.moveTo(x, y - at * m);
    ctx.quadraticCurveTo(x + side * 1.1 * m, y - at * m, x + side * 1.1 * m, y - (at + up) * m);
    ctx.stroke();
  };
  arm(1, h * 0.45, h * 0.3);
  if (hash(seed * 3.1) > 0.3) arm(-1, h * 0.58, h * 0.25);
  ctx.strokeStyle = css(mix([200, 180, 110], [120, 90, 60], k), 0.35);
  ctx.lineWidth = 0.1 * m;
  ctx.beginPath(); ctx.moveTo(x - 0.1 * m, y); ctx.lineTo(x - 0.1 * m, y - h * m); ctx.stroke();
}

function oak(ctx, x, y, m, h, k, seed) {
  ctx.fillStyle = css(mix([70, 50, 36], [24, 18, 16], k));
  ctx.fillRect(x - 0.2 * m, y - h * 0.45 * m, 0.4 * m, h * 0.45 * m);
  const dark = mix([70, 84, 44], [22, 26, 20], k);
  const lit = mix([150, 146, 70], [70, 60, 40], k);
  for (let i = 0; i < 9; i++) {
    const px = x + (hash(seed * 7 + i) - 0.5) * h * 0.8 * m;
    const py = y - h * m * (0.55 + hash(seed * 3 + i * 1.3) * 0.35);
    const r = h * m * (0.18 + hash(seed + i * 2.1) * 0.12);
    ctx.fillStyle = css(dark);
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    ctx.fillStyle = css(lit, 0.55);
    ctx.beginPath(); ctx.arc(px - r * 0.25, py - r * 0.3, r * 0.6, 0, TAU); ctx.fill();
  }
}

function deadTree(ctx, x, y, m, k) {
  const col = css(mix([98, 76, 60], [26, 20, 20], k));
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  const branch = (bx, by, ang, len, w, depth) => {
    const ex = bx + Math.sin(ang) * len, ey = by - Math.cos(ang) * len;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.sin(ang + 0.3) * len * 0.5, by - Math.cos(ang + 0.3) * len * 0.5, ex, ey); ctx.stroke();
    if (depth <= 0) return;
    branch(ex, ey, ang - 0.45 - hash(depth * 3.1 + len) * 0.3, len * 0.66, w * 0.62, depth - 1);
    branch(ex, ey, ang + 0.4 + hash(depth * 5.7 + len) * 0.35, len * 0.6, w * 0.6, depth - 1);
  };
  branch(x, y, -0.05, 3.2 * m, 0.45 * m, 4);
}

function windmill(ctx, x, y, m, k) {
  const wood = css(mix([150, 118, 92], [34, 28, 28], k));
  const top = y - 11 * m;
  ctx.strokeStyle = wood;
  ctx.lineWidth = 0.14 * m;
  ctx.beginPath();
  ctx.moveTo(x - 1.5 * m, y); ctx.lineTo(x - 0.35 * m, top);
  ctx.moveTo(x + 1.5 * m, y); ctx.lineTo(x + 0.35 * m, top);
  for (let i = 0; i < 5; i++) {
    const u0 = i / 5, u1 = (i + 1) / 5;
    const w0 = lerp(1.5, 0.35, u0) * m, w1 = lerp(1.5, 0.35, u1) * m;
    const y0 = y - u0 * 11 * m, y1 = y - u1 * 11 * m;
    ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y1);
    ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y1);
  }
  ctx.stroke();
  // the wheel, and its tail vane
  const wx = x - 0.2 * m, wy = top - 0.4 * m, R = 2.4 * m;
  ctx.fillStyle = css(mix([170, 150, 130], [40, 34, 34], k));
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * TAU, a1 = a0 + 0.2;
    ctx.moveTo(wx + Math.cos(a0) * R * 0.25, wy + Math.sin(a0) * R * 0.25);
    ctx.lineTo(wx + Math.cos(a0) * R, wy + Math.sin(a0) * R);
    ctx.lineTo(wx + Math.cos(a1) * R, wy + Math.sin(a1) * R);
    ctx.lineTo(wx + Math.cos(a1) * R * 0.25, wy + Math.sin(a1) * R * 0.25);
  }
  ctx.fill();
  ctx.strokeStyle = wood;
  ctx.lineWidth = 0.12 * m;
  ctx.beginPath(); ctx.arc(wx, wy, R, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 3.2 * m, wy - 0.1 * m); ctx.stroke();
  ctx.fillStyle = wood;
  ctx.beginPath(); ctx.moveTo(wx + 2.2 * m, wy - 0.9 * m); ctx.lineTo(wx + 3.4 * m, wy - 0.7 * m); ctx.lineTo(wx + 3.4 * m, wy + 0.5 * m); ctx.lineTo(wx + 2.2 * m, wy + 0.3 * m); ctx.fill();
  // a trough at its foot
  ctx.fillStyle = css(mix([110, 80, 56], [30, 24, 22], k));
  ctx.fillRect(x + 1.8 * m, y - 0.7 * m, 2.6 * m, 0.7 * m);
}

function building(ctx, x, y, m, kind, k, r) {
  const wall = mix(kind === 'barn' ? [168, 74, 52] : kind === 'church' ? [226, 214, 190] : [182, 128, 86], [44, 32, 30], k);
  const dark = mix(wall, [24, 16, 16], 0.5);
  const roof = mix([112, 76, 58], [30, 22, 22], k);
  const w = (kind === 'saloon' || kind === 'hotel' ? 12 : kind === 'barn' ? 11 : kind === 'tower' ? 3.6 : 8) * m;
  const h = (kind === 'hotel' ? 9 : kind === 'saloon' ? 7.5 : kind === 'church' ? 7 : kind === 'barn' ? 7 : kind === 'tower' ? 8 : 5.5) * m;
  if (kind === 'tower') {
    // the water tower: a tank on legs
    ctx.strokeStyle = css(dark);
    ctx.lineWidth = Math.max(1, 0.22 * m);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.45, y); ctx.lineTo(x - w * 0.35, y - h * 0.55);
    ctx.moveTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.35, y - h * 0.55);
    ctx.moveTo(x - w * 0.42, y - h * 0.25); ctx.lineTo(x + w * 0.42, y - h * 0.25);
    ctx.stroke();
    ctx.fillStyle = css(wall);
    ctx.fillRect(x - w * 0.5, y - h, w, h * 0.45);
    ctx.fillStyle = css(roof);
    ctx.beginPath(); ctx.moveTo(x - w * 0.56, y - h); ctx.lineTo(x, y - h * 1.18); ctx.lineTo(x + w * 0.56, y - h); ctx.fill();
    return;
  }
  // the side wall in shade, then the false front
  ctx.fillStyle = css(dark);
  ctx.fillRect(x + w * 0.42, y - h * 0.8, w * 0.22, h * 0.8);
  ctx.fillStyle = css(wall);
  if (kind === 'church' || kind === 'barn' || kind === 'house') {
    ctx.fillRect(x - w / 2, y - h * 0.62, w, h * 0.62);
    ctx.fillStyle = css(roof);
    ctx.beginPath(); ctx.moveTo(x - w * 0.56, y - h * 0.6); ctx.lineTo(x, y - h * (kind === 'house' ? 0.95 : 1)); ctx.lineTo(x + w * 0.56, y - h * 0.6); ctx.fill();
    if (kind === 'church') {
      ctx.fillStyle = css(wall);
      ctx.fillRect(x - w * 0.12, y - h * 1.55, w * 0.24, h * 0.7);
      ctx.fillStyle = css(roof);
      ctx.beginPath(); ctx.moveTo(x - w * 0.16, y - h * 1.55); ctx.lineTo(x, y - h * 1.9); ctx.lineTo(x + w * 0.16, y - h * 1.55); ctx.fill();
    }
  } else {
    // a false front, stepped at the top
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - w / 2, y - h * 0.9);
    ctx.lineTo(x - w * 0.3, y - h * 0.9);
    ctx.lineTo(x - w * 0.3, y - h);
    ctx.lineTo(x + w * 0.3, y - h);
    ctx.lineTo(x + w * 0.3, y - h * 0.9);
    ctx.lineTo(x + w / 2, y - h * 0.9);
    ctx.lineTo(x + w / 2, y);
    ctx.fill();
    // the porch roof and its shade
    ctx.fillStyle = css(roof);
    ctx.fillRect(x - w * 0.55, y - h * 0.42, w * 1.1, Math.max(1, h * 0.06));
    ctx.fillStyle = 'rgba(20,12,10,0.35)';
    ctx.fillRect(x - w / 2, y - h * 0.36, w, h * 0.36);
    // a sign board
    ctx.fillStyle = css(mix(wall, [255, 236, 200], 0.3));
    ctx.fillRect(x - w * 0.3, y - h * 0.84, w * 0.6, Math.max(1, h * 0.1));
  }
  // windows
  ctx.fillStyle = css(mix([40, 26, 22], [255, 190, 110], k * 0.6), 0.85);
  const rows = kind === 'hotel' ? 2 : 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x - w * 0.36 + i * w * 0.28, y - h * (0.62 + j * 0.2), Math.max(1, w * 0.12), Math.max(1, h * 0.1));
    }
  }
  // a lamp in a window, once the light goes
  if (hash(r) > 0.5) {
    ctx.fillStyle = 'rgba(255,196,110,0.8)';
    ctx.fillRect(x - w * 0.08, y - h * 0.3, Math.max(1, w * 0.12), Math.max(1, h * 0.12));
  }
}

function wagon(ctx, x, y, m, k) {
  const wood = css(mix([132, 90, 58], [34, 24, 20], k));
  const canvasCol = mix([240, 226, 196], [96, 84, 86], k);
  const L = 4.2 * m;
  // the bed
  ctx.fillStyle = wood;
  ctx.fillRect(x - L / 2, y - 1.45 * m, L, 0.7 * m);
  ctx.fillRect(x + L / 2 - 0.1 * m, y - 1.2 * m, 1.6 * m, 0.1 * m);
  // the bonnet on its hoops
  ctx.fillStyle = css(canvasCol);
  ctx.beginPath();
  ctx.moveTo(x - L * 0.46, y - 1.45 * m);
  ctx.bezierCurveTo(x - L * 0.56, y - 3.4 * m, x - L * 0.2, y - 3.3 * m, x, y - 3.25 * m);
  ctx.bezierCurveTo(x + L * 0.2, y - 3.3 * m, x + L * 0.56, y - 3.4 * m, x + L * 0.46, y - 1.45 * m);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(mix(canvasCol, [60, 40, 30], 0.35));
  ctx.lineWidth = Math.max(1, 0.06 * m);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * L * 0.17, y - 1.45 * m); ctx.lineTo(x + i * L * 0.18, y - 3.2 * m + Math.abs(i) * 0.08 * m); ctx.stroke();
  }
  ctx.fillStyle = css(mix(canvasCol, [30, 20, 20], 0.45));
  ctx.fillRect(x - L / 2, y - 1.55 * m, L, 0.14 * m);
  // wheels
  for (const [wx, R] of [[x - L * 0.32, 0.62 * m], [x + L * 0.34, 0.5 * m]]) {
    ctx.strokeStyle = wood;
    ctx.lineWidth = Math.max(1, 0.1 * m);
    ctx.beginPath(); ctx.arc(wx, y - R, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.05 * m);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI; ctx.moveTo(wx - Math.cos(a) * R, y - R - Math.sin(a) * R); ctx.lineTo(wx + Math.cos(a) * R, y - R + Math.sin(a) * R); }
    ctx.stroke();
  }
}

// ======================================================== the ground, baked

const GR_S = 0.5;
const GR_ROWS = 480;
const GR_HZ = 4;

function buildGround() {
  const s = GR_S;
  const pw = Math.round(PW * s);
  const c = makeCanvas(pw + Math.ceil(W * s) + 2, GR_ROWS * s);
  Object.assign(c, { panoW: pw, s, rowHz: GR_HZ });
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const Y = (r) => GR_HZ + rowOf(r);
  const base = ctx.createLinearGradient(0, GR_HZ, 0, GR_ROWS);
  [[0, '#d8ae7e'], [0.025, '#c49664'], [0.1, '#a88050'], [0.3, '#8f6c40'], [0.6, '#7b5d38'], [1, '#62492e']].forEach(([o, col]) => base.addColorStop(o, col));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PW, GR_ROWS);

  // patches of dirt, straw and green, laid flat on the ground
  for (let i = 0; i < 1300; i++) {
    const r = Math.exp(lerp(Math.log(3.5), Math.log(700), hash(i * 1.37 + 0.2)));
    const a = hash(i * 2.71 + 0.9) * TAU;
    const size = (2 + 12 * hash(i * 3.3)) * (0.6 + r / 150);
    const rx = (size / r) * PX_PER_RAD;
    const ry = Math.max(0.7, ((size * 0.5 * CAM_H) / (r * r)) * PX_PER_RAD);
    const kind = hash(i * 5.9);
    ctx.fillStyle = kind < 0.32 ? 'rgba(106,100,52,0.3)' : kind < 0.58 ? 'rgba(176,126,80,0.3)' : kind < 0.86 ? 'rgba(230,194,128,0.24)' : 'rgba(72,56,40,0.24)';
    around(panoX(a), rx, (x) => { ctx.beginPath(); ctx.ellipse(x, Y(r), rx, ry, 0, 0, TAU); ctx.fill(); });
  }

  // the trail: the wagon road west into the sun and east back to town
  const edge = (d, side) => side * (2.1 + 0.5 * vnoise(Math.abs(d) * 0.12, side > 0 ? 1.3 : 7.9));
  const strip = (dir, lat0, lat1, style, jag = true) => {
    const ref = dir > 0 ? TRAIL_A : TRAIL_A + PI;
    const pts = [];
    const N = 150;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i <= N; i++) {
        const u = pass === 0 ? i / N : 1 - i / N;
        const d = dir * Math.exp(lerp(Math.log(0.8), Math.log(3000), u));
        let lat = pass === 0 ? lat0 : lat1;
        if (jag) lat = typeof lat === 'function' ? lat(d) : lat;
        const [wx, wz] = trailPt(d, lat);
        const a = ref + wrap(bearing(wx, wz) - ref);
        pts.push((a / TAU) * PW, Y(Math.hypot(wx, wz)));
      }
    }
    ctx.fillStyle = style;
    for (const off of [0, PW, -PW]) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i] + off, pts[i + 1]);
      ctx.closePath();
      ctx.fill();
    }
  };
  for (const dir of [1, -1]) {
    strip(dir, (d) => edge(d, -1) - 0.35, (d) => edge(d, 1) + 0.35, 'rgba(150,118,76,0.55)');
    strip(dir, (d) => edge(d, -1), (d) => edge(d, 1), '#b48e62');
    strip(dir, -1.05, -0.62, 'rgba(112,82,54,0.55)', false);
    strip(dir, 0.62, 1.05, 'rgba(112,82,54,0.55)', false);
    strip(dir, -0.25, 0.25, 'rgba(146,132,74,0.4)', false);
    strip(dir, -0.85, -0.78, 'rgba(226,196,150,0.35)', false);
    strip(dir, 0.78, 0.85, 'rgba(226,196,150,0.35)', false);
  }

  // grass: blades of straw everywhere, longer the nearer, in five shades
  const bands = [[1, 14, 0.9, 70], [14, 50, 1.3, 80], [50, 130, 1.9, 110], [130, 260, 2.5, 150], [260, GR_ROWS - GR_HZ, 3.2, 170]];
  const cols = ['rgba(86,72,40,0.85)', 'rgba(122,100,56,0.8)', 'rgba(168,136,78,0.75)', 'rgba(210,176,108,0.7)', 'rgba(240,210,146,0.65)'];
  ctx.lineCap = 'round';
  bands.forEach(([r0, r1, lw, per], b) => {
    const count = Math.round(((r1 - r0) * PW) / per / cols.length);
    cols.forEach((col, ci) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const seed = b * 100003 + ci * 10007 + i;
        const row = r0 + (r1 - r0) * hash(seed * 1.31 + 0.7);
        const r = CAM_H / Math.tan(row / PX_PER_RAD);
        const x = hash(seed * 0.73 + 0.1) * PW;
        // not on the road
        const wx = Math.sin((x / PW) * TAU) * r, wz = Math.cos((x / PW) * TAU) * r;
        const lat = Math.abs(wx * RIGHT[0] + wz * RIGHT[1]);
        if (lat < 1.9 && hash(seed * 9.1) > 0.1) continue;
        const len = clamp((0.34 / r) * PX_PER_RAD * (0.5 + 0.9 * hash(seed * 2.9)), 1, 28);
        const lean = (hash(seed * 3.7) - 0.35) * 0.55;
        const y = GR_HZ + row;
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean * len, y - len);
      }
      ctx.stroke();
    });
  });

  // sagebrush and rocks, each with the long shadow of a low sun
  const sdx = Math.sin(SUN_A + PI), sdz = Math.cos(SUN_A + PI);
  const shade = [];
  const bush = [];
  for (let i = 0; i < 900; i++) {
    const r = Math.exp(lerp(Math.log(7), Math.log(260), hash(i * 4.13 + 0.3)));
    const a = hash(i * 1.93 + 0.6) * TAU;
    const wx = Math.sin(a) * r, wz = Math.cos(a) * r;
    if (Math.abs(wx * RIGHT[0] + wz * RIGHT[1]) < 3) continue;
    const size = 0.4 + hash(i * 6.7) * 0.8;
    const rock = hash(i * 8.1) > 0.8;
    const len = (size * (rock ? 0.5 : 0.8)) / Math.tan(SUN_ELEV);
    const nx = -sdz, nz = sdx;
    const corner = (u, w) => {
      const px = wx + sdx * len * u + nx * w, pz = wz + sdz * len * u + nz * w;
      return [a + wrap(bearing(px, pz) - a), Math.hypot(px, pz)];
    };
    shade.push([corner(0, -size * 0.45), corner(0, size * 0.45), corner(1, size * 0.18), corner(1.05, 0), corner(1, -size * 0.18)]);
    bush.push([a, r, size, rock, i]);
  }
  ctx.fillStyle = 'rgba(58,32,48,0.3)';
  for (const poly of shade) {
    const x0 = (poly[0][0] / TAU) * PW;
    const off = x0 < 0 ? PW : x0 > PW ? -PW : 0;
    around(x0 + off, 400, (xx) => {
      const d = xx - x0;
      ctx.beginPath();
      for (const [pa, pr] of poly) ctx.lineTo((pa / TAU) * PW + d, Y(pr));
      ctx.closePath();
      ctx.fill();
    });
  }
  for (const [a, r, size, rock, i] of bush) {
    const x = panoX(a), y = Y(r), w = (size / r) * PX_PER_RAD;
    around(x, w, (xx) => {
      if (rock) {
        ctx.fillStyle = 'rgba(120,98,80,0.95)';
        ctx.beginPath(); ctx.ellipse(xx, y - w * 0.15, w * 0.5, w * 0.28, 0, PI, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(214,180,140,0.7)';
        ctx.beginPath(); ctx.ellipse(xx - w * 0.08, y - w * 0.3, w * 0.3, w * 0.1, 0, 0, TAU); ctx.fill();
      } else {
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = j < 2 ? 'rgba(86,90,54,0.95)' : 'rgba(150,146,96,0.8)';
          const ox = (hash(i * 3 + j) - 0.5) * w * 0.6, oy = -w * (0.2 + 0.18 * j * 0.5);
          ctx.beginPath(); ctx.ellipse(xx + ox, y + oy, w * (0.36 - j * 0.05), w * (0.24 - j * 0.03), 0, 0, TAU); ctx.fill();
        }
      }
    });
  }

  // the light: backlit ground darker, a glare where the sun sits on the plain,
  // everything warm with the sun behind
  const dark = ctx.createLinearGradient(0, GR_HZ + 8, 0, GR_ROWS);
  dark.addColorStop(0, 'rgba(44,24,34,0)'); dark.addColorStop(0.25, 'rgba(44,24,34,0.32)'); dark.addColorStop(1, 'rgba(30,16,24,0.5)');
  strips(ctx, dark, 0, GR_ROWS, (a) => smooth(clamp01(sunF(a) * 1.1)), 6);
  const warm = ctx.createLinearGradient(0, GR_HZ, 0, GR_ROWS);
  warm.addColorStop(0, 'rgba(240,150,80,0)'); warm.addColorStop(0.3, 'rgba(240,140,70,0.2)'); warm.addColorStop(1, 'rgba(210,110,50,0.16)');
  strips(ctx, warm, 0, GR_ROWS, (a) => Math.max(0, -sunF(a)), 6);
  const glare = ctx.createLinearGradient(0, GR_HZ - 2, 0, GR_HZ + 90);
  glare.addColorStop(0, 'rgba(255,230,170,0.95)'); glare.addColorStop(0.25, 'rgba(255,204,136,0.5)'); glare.addColorStop(1, 'rgba(255,190,120,0)');
  strips(ctx, glare, 0, GR_HZ + 90, (a) => Math.pow(Math.max(0, sunF(a)), 5), 6);
  stripsTinted(ctx, 0, GR_HZ + 34, (a) => [mix(hazeAt(a), [210, 164, 110], 0.3), 0.85, 0], 6);
  closeRing(c);
  return c;
}

// =========================================================== close at hand

/** Precomputed near things: bearing, and the rows (px under the horizon) they stand on and reach. */
const NEAR = (() => {
  const poles = [];
  const wires = [];
  const ds = [9, 41, 73, 105, 137, 169, 201, 233, 265, -23, -55, -87, -119, -151, -183];
  const LAT = -4.6;
  const at = (d, lat, h) => { const [x, z] = trailPt(d, lat); const r = Math.hypot(x, z); return { a: bearing(x, z), r, row: rowOf(r, h) }; };
  for (const d of ds) {
    const b = at(d, LAT, 0);
    poles.push({ a: b.a, r: b.r, row0: b.row, row1: rowOf(b.r, 7.2), arm0: at(d, LAT - 0.8, 6.7), arm1: at(d, LAT + 0.8, 6.7) });
  }
  // wires between neighbours along the line, sagging
  const order = [...ds].sort((p, q) => p - q);
  for (let i = 0; i + 1 < order.length; i++) {
    for (const off of [-0.65, 0, 0.65]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        const p = at(lerp(order[i], order[i + 1], u), LAT + off, (off === 0 ? 7.0 : 6.72) - 0.7 * 4 * u * (1 - u));
        pts.push(p.a, p.row);
      }
      wires.push(pts);
    }
  }
  // a post-and-rail fence behind the horse
  const fence = [];
  for (let d = -40; d <= 70; d += 3) {
    const lat = 11 + Math.sin(d * 0.05) * 0.6;
    const b = at(d, lat, 0);
    fence.push({ a: b.a, r: b.r, row0: b.row, row1: rowOf(b.r, 1.35), rail0: rowOf(b.r, 0.55), rail1: rowOf(b.r, 1.1), broken: hash(d * 1.3) > 0.88 });
  }
  // grass tufts close to the camera
  const tufts = [];
  for (let i = 0; i < 520; i++) {
    const r = lerp(3.3, 11, Math.pow(hash(i * 3.71 + 0.5), 1.4));
    const a = hash(i * 1.37 + 0.2) * TAU;
    const wx = Math.sin(a) * r, wz = Math.cos(a) * r;
    if (Math.abs(wx * RIGHT[0] + wz * RIGHT[1]) < 2.2) continue;
    tufts.push({ a, r, row: rowOf(r), m: PX_PER_RAD / r, n: 4 + Math.floor(hash(i * 5.3) * 5), seed: i });
  }
  tufts.sort((p, q) => q.r - p.r);
  const rocks = [];
  for (let i = 0; i < 40; i++) {
    const r = lerp(3.8, 12, hash(i * 7.9 + 0.1));
    const a = hash(i * 4.3 + 0.7) * TAU;
    rocks.push({ a, r, row: rowOf(r), m: PX_PER_RAD / r, size: 0.12 + hash(i * 2.2) * 0.3, seed: i });
  }
  rocks.sort((p, q) => q.r - p.r);
  return { poles, wires, fence, tufts, rocks };
})();

// ====================================================== screen-space sprites

let FX = null;

function buildFx() {
  const fx = {};
  // the vignette every frame gets, warm and soft
  fx.vignette = makeCanvas(W, H);
  let x = fx.vignette.getContext('2d');
  let gr = x.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, W * 0.72);
  gr.addColorStop(0, 'rgba(30,14,8,0)'); gr.addColorStop(0.7, 'rgba(30,14,8,0.18)'); gr.addColorStop(1, 'rgba(20,8,4,0.55)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // Dead Eye's: heavy, sepia, closing in
  fx.eye = makeCanvas(W, H);
  x = fx.eye.getContext('2d');
  gr = x.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, W * 0.66);
  gr.addColorStop(0, 'rgba(60,30,6,0)'); gr.addColorStop(0.55, 'rgba(60,30,6,0.35)'); gr.addColorStop(1, 'rgba(26,10,2,0.92)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // death's: black
  fx.death = makeCanvas(W, H);
  x = fx.death.getContext('2d');
  gr = x.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.9)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // film grain
  fx.grain = makeCanvas(256, 256);
  x = fx.grain.getContext('2d');
  const img = x.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = (hash(i * 0.618 + 0.13) * 255) | 0;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  fx.grainPattern = null;
  // the sun's bloom and its rays
  fx.bloom = makeCanvas(512, 512);
  x = fx.bloom.getContext('2d');
  gr = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  gr.addColorStop(0, 'rgba(255,236,190,0.9)'); gr.addColorStop(0.08, 'rgba(255,210,140,0.55)'); gr.addColorStop(0.3, 'rgba(255,170,90,0.16)'); gr.addColorStop(1, 'rgba(255,150,80,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  fx.rays = makeCanvas(1024, 1024);
  x = fx.rays.getContext('2d');
  x.translate(512, 512);
  for (let i = 0; i < 26; i++) {
    const a = hash(i * 3.3) * TAU, w = 0.02 + hash(i * 5.1) * 0.05, len = 300 + hash(i * 7.3) * 212;
    const rg = x.createRadialGradient(0, 0, 20, 0, 0, len);
    rg.addColorStop(0, 'rgba(255,222,160,0.5)'); rg.addColorStop(1, 'rgba(255,200,130,0)');
    x.fillStyle = rg;
    x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, len, a - w, a + w); x.closePath(); x.fill();
  }
  // soft blobs for dust and smoke
  fx.dust = blob([214, 176, 126]);
  fx.smoke = blob([196, 180, 190]);
  // ink brush bands for titles
  fx.ink = brush(1100, 150, 3.1, '#0a0806');
  fx.inkRed = brush(1100, 150, 7.7, '#6a120c');
  // the minimap's ground
  fx.map = buildMap();
  // a tumbleweed
  fx.weed = makeCanvas(128, 128);
  x = fx.weed.getContext('2d');
  x.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a0 = hash(i * 1.1) * TAU, a1 = a0 + (hash(i * 2.3) - 0.5) * 2.4;
    const r0 = 18 + hash(i * 3.7) * 42, r1 = 18 + hash(i * 4.9) * 42;
    x.strokeStyle = i % 3 ? 'rgba(130,100,64,0.8)' : 'rgba(214,180,124,0.8)';
    x.lineWidth = 1 + hash(i * 6.1) * 2;
    x.beginPath(); x.moveTo(64 + Math.cos(a0) * r0, 64 + Math.sin(a0) * r0);
    x.quadraticCurveTo(64 + Math.cos((a0 + a1) / 2) * 60, 64 + Math.sin((a0 + a1) / 2) * 60, 64 + Math.cos(a1) * r1, 64 + Math.sin(a1) * r1);
    x.stroke();
  }
  return fx;
}

function blob(c) {
  const cv = makeCanvas(128, 128);
  const x = cv.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, css(c, 0.9)); gr.addColorStop(0.5, css(c, 0.45)); gr.addColorStop(1, css(c, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return cv;
}

/** A dry-brush ink stroke, ragged at both ends, to set titles on. */
function brush(w, h, seed, color) {
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  x.lineCap = 'round';
  x.strokeStyle = color;
  for (let i = 0; i < 340; i++) {
    const y = h * (0.2 + 0.6 * hash(seed + i * 1.7));
    const mid = 1 - Math.abs((y / h - 0.5) * 2);
    const x0 = w * (0.01 + 0.1 * hash(seed + i * 2.3) + (1 - mid) * 0.08);
    const x1 = w * (0.99 - 0.1 * hash(seed + i * 3.1) - (1 - mid) * 0.08);
    x.globalAlpha = 0.18 + 0.5 * hash(seed + i * 5.3);
    x.lineWidth = 2 + hash(seed + i * 4.7) * 8;
    x.beginPath();
    x.moveTo(x0, y);
    x.bezierCurveTo(w * 0.35, y + (hash(seed + i) - 0.5) * 7, w * 0.65, y + (hash(seed + i + 9) - 0.5) * 7, x1, y + (hash(seed + i * 3) - 0.5) * 5);
    x.stroke();
  }
  // a few dry streaks through it
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) {
    const y = h * (0.15 + 0.7 * hash(seed + i * 9.1));
    x.globalAlpha = 0.25 + 0.4 * hash(seed + i * 2.9);
    x.lineWidth = 0.6 + hash(seed + i * 1.3) * 1.6;
    const x0 = w * hash(seed + i * 6.1) * 0.7;
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + w * (0.1 + 0.3 * hash(seed + i * 7.3)), y + (hash(i) - 0.5) * 3); x.stroke();
  }
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  return c;
}

const MAP_M = 1.25;
const MAP_SIZE = 480;

/** The minimap's ground, top-down: bearing 0 up, a metre and a quarter a pixel. */
function buildMap() {
  const c = makeCanvas(MAP_SIZE, MAP_SIZE);
  const x = c.getContext('2d');
  const C = MAP_SIZE / 2;
  const at = (wx, wz) => [C + wx / MAP_M, C - wz / MAP_M];
  x.fillStyle = '#35302a';
  x.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = hash(i * 2.1) > 0.5 ? 'rgba(80,72,56,0.35)' : 'rgba(24,20,16,0.3)';
    x.beginPath(); x.arc(hash(i * 3.3) * MAP_SIZE, hash(i * 4.7) * MAP_SIZE, 6 + hash(i) * 26, 0, TAU); x.fill();
  }
  // woods to the north
  const nx = Math.sin(NORTH_A), nz = Math.cos(NORTH_A);
  x.fillStyle = 'rgba(58,74,50,0.55)';
  for (let i = 0; i < 400; i++) {
    const r = 90 + hash(i * 1.9) * 220, a = NORTH_A + (hash(i * 2.9) - 0.5) * 1.6;
    const [px, py] = at(Math.sin(a) * r, Math.cos(a) * r);
    x.beginPath(); x.arc(px, py, 3 + hash(i * 5.1) * 4, 0, TAU); x.fill();
  }
  // a creek, north-east
  x.strokeStyle = '#5b7486';
  x.lineWidth = 5;
  x.lineCap = 'round';
  x.beginPath();
  for (let k = -12; k <= 12; k++) {
    const d = k * 25;
    const [px, py] = at(nx * 120 + Math.sin(SUN_A + PI) * d + Math.sin(k * 0.7) * 12, nz * 120 + Math.cos(SUN_A + PI) * d + Math.cos(k * 0.9) * 10);
    x.lineTo(px, py);
  }
  x.stroke();
  // mesas to the south-west, as contour rings
  x.strokeStyle = 'rgba(150,100,70,0.45)';
  x.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = SUN_A - 0.7 - hash(i * 3.1) * 1.4, r = 150 + hash(i * 4.3) * 120;
    const [px, py] = at(Math.sin(a) * r, Math.cos(a) * r);
    for (let j = 0; j < 3; j++) { x.beginPath(); x.ellipse(px, py, 34 - j * 9, 22 - j * 6, a, 0, TAU); x.stroke(); }
  }
  // the trail, and the town at its eastern end
  const [x0, y0] = at(...trailPt(-400, 0));
  const [x1, y1] = at(...trailPt(400, 0));
  x.strokeStyle = 'rgba(20,16,12,0.6)'; x.lineWidth = 7;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  x.strokeStyle = '#d6c8a6'; x.lineWidth = 3.5;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  const [tx, ty] = at(...trailPt(-195, 0));
  x.fillStyle = 'rgba(214,200,170,0.75)';
  for (let i = 0; i < 12; i++) {
    x.save(); x.translate(tx, ty); x.rotate(-TRAIL_A);
    x.fillRect(-26 + (i % 6) * 9, (i < 6 ? -14 : 6), 7, 8);
    x.restore();
  }
  // the mission's route, in gold: west along the trail, then off to the camp
  const [gx, gy] = at(...trailPt(95, 0));
  const [cx2, cy2] = at(...trailPt(150, -60));
  x.strokeStyle = '#e8b83a'; x.lineWidth = 3.5;
  x.beginPath(); x.moveTo(C, C); x.lineTo(gx, gy); x.quadraticCurveTo(gx + (cx2 - gx) * 0.2, gy - 30, cx2, cy2); x.stroke();
  x.fillStyle = 'rgba(232,184,58,0.25)';
  x.beginPath(); x.arc(cx2, cy2, 26, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(232,184,58,0.8)'; x.lineWidth = 1.5; x.stroke();
  return c;
}

// ============================================================ the painting

let PAINTING = null;

/** The loading screen: a rider on a ridge at sunset, laid in with brush strokes. */
function buildPainting() {
  const ref = makeCanvas(W, H);
  const r = ref.getContext('2d');
  const HOR = 468;
  const sky = r.createLinearGradient(0, 0, 0, HOR);
  [[0, '#1f3662'], [0.28, '#43598a'], [0.52, '#9a7f96'], [0.72, '#e39a6a'], [0.88, '#ffc47e'], [1, '#ffe0a4']].forEach(([o, c]) => sky.addColorStop(o, c));
  r.fillStyle = sky; r.fillRect(0, 0, W, HOR + 4);
  const sunX = 760, sunY = 430;
  let gr = r.createRadialGradient(sunX, sunY, 0, sunX, sunY, 520);
  gr.addColorStop(0, 'rgba(255,248,220,1)'); gr.addColorStop(0.05, 'rgba(255,236,176,0.95)'); gr.addColorStop(0.2, 'rgba(255,190,110,0.5)'); gr.addColorStop(1, 'rgba(255,150,90,0)');
  r.fillStyle = gr; r.fillRect(0, 0, W, H);
  // clouds: long banks lit from below
  for (let i = 0; i < 16; i++) {
    const cy = 70 + hash(i * 3.1) * 290, cx = hash(i * 5.7) * W, cw = 180 + hash(i * 2.3) * 380, ch = 16 + hash(i * 7.9) * 30;
    const near = Math.max(0, 1 - Math.abs(cx - sunX) / 700);
    r.fillStyle = css(mix([150, 110, 140], [110, 80, 100], near), 0.85);
    r.beginPath(); r.ellipse(cx, cy, cw / 2, ch, 0, 0, TAU); r.fill();
    r.fillStyle = css(mix([255, 176, 130], [255, 214, 150], near), 0.9);
    r.beginPath(); r.ellipse(cx + (sunX - cx) * 0.02, cy + ch * 0.55, cw * 0.46, ch * 0.4, 0, 0, TAU); r.fill();
  }
  // far mesas
  r.fillStyle = '#8a6a86';
  r.beginPath(); r.moveTo(0, HOR);
  for (let x = 0; x <= W; x += 4) {
    const m = vnoise(x * 0.006, 1.5);
    const cap = smoothstep(0.52, 0.56, m) * (52 + 16 * vnoise(x * 0.02, 4)) + 14 * vnoise(x * 0.03, 2);
    r.lineTo(x, HOR - cap * (Math.abs(x - sunX) < 90 ? 0.4 : 1));
  }
  r.lineTo(W, HOR); r.fill();
  r.fillStyle = 'rgba(255,196,140,0.35)'; r.fillRect(0, HOR - 70, W, 70);
  // the valley: gold grass and a river that holds the sky
  gr = r.createLinearGradient(0, HOR, 0, H);
  gr.addColorStop(0, '#e2b070'); gr.addColorStop(0.2, '#b98648'); gr.addColorStop(0.6, '#7a5a34'); gr.addColorStop(1, '#4a3622');
  r.fillStyle = gr; r.fillRect(0, HOR, W, H - HOR);
  r.strokeStyle = '#ffd494'; r.lineCap = 'round';
  r.lineWidth = 3;
  r.beginPath(); r.moveTo(sunX - 40, HOR + 4); r.bezierCurveTo(sunX - 200, HOR + 30, sunX + 120, HOR + 60, sunX - 140, HOR + 120); r.stroke();
  r.lineWidth = 12; r.strokeStyle = 'rgba(255,214,150,0.8)';
  r.beginPath(); r.moveTo(sunX - 140, HOR + 120); r.bezierCurveTo(sunX - 420, HOR + 170, sunX - 100, HOR + 230, -40, HOR + 260); r.stroke();
  // the ridge in the foreground, and pines on it
  r.fillStyle = '#2e2218';
  r.beginPath(); r.moveTo(340, H);
  r.bezierCurveTo(560, 640, 780, 600, 930, 590); r.bezierCurveTo(1040, 582, 1150, 560, W, 548); r.lineTo(W, H); r.fill();
  r.fillStyle = 'rgba(255,190,120,0.6)';
  r.beginPath(); r.moveTo(560, 648); r.bezierCurveTo(700, 610, 860, 594, 930, 590); r.bezierCurveTo(1040, 582, 1150, 560, W, 548); r.lineTo(W, 552); r.bezierCurveTo(1150, 566, 1040, 588, 930, 596); r.bezierCurveTo(820, 604, 700, 620, 560, 652); r.fill();
  r.fillStyle = '#1a1612';
  r.beginPath();
  for (let i = 0; i < 7; i++) pine(r, 1150 + i * 22 + hash(i) * 10, 560 - i * 1.5, 90 + hash(i * 3) * 70, 26 + hash(i * 5) * 10);
  r.fill();
  // grass heads on the ridge catching the light
  r.strokeStyle = 'rgba(255,200,130,0.7)'; r.lineWidth = 2;
  r.beginPath();
  for (let i = 0; i < 140; i++) {
    const x = 540 + hash(i * 2.1) * 740, y = 600 - (x - 540) * 0.08 + hash(i * 3.3) * 60;
    r.moveTo(x, y); r.lineTo(x + (hash(i) - 0.5) * 6, y - 10 - hash(i * 4.4) * 16);
  }
  r.stroke();

  // strokes
  const out = makeCanvas(W, H);
  const p = out.getContext('2d');
  p.drawImage(ref, 0, 0);
  const data = r.getImageData(0, 0, W, H).data;
  const at = (x, y) => (Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))) * 4;
  p.lineCap = 'round';
  const passes = [[2600, 54, 13], [4200, 30, 8], [5200, 14, 4.5]];
  passes.forEach(([n, len0, w0], pass) => {
    for (let i = 0; i < n; i++) {
      const x = hash(i * 1.31 + pass * 17.1 + 0.3) * W, y = hash(i * 2.71 + pass * 5.3 + 0.1) * H;
      const land = y > HOR;
      const ang = (vnoise(x * 0.004 + pass, y * 0.006) - 0.5) * (land ? 1.1 : 0.45) + (land && x > 500 ? -0.12 : 0);
      let len = len0 * (0.55 + 0.9 * hash(i * 3.1 + pass));
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const i0 = at(x - (ca * len) / 2, y - (sa * len) / 2), i1 = at(x + (ca * len) / 2, y + (sa * len) / 2), ic = at(x, y);
      const diff = Math.abs(data[i0] - data[i1]) + Math.abs(data[i0 + 1] - data[i1 + 1]) + Math.abs(data[i0 + 2] - data[i1 + 2]);
      if (diff > 70) len *= 0.3;
      const j = (hash(i * 4.4 + pass) - 0.5) * 22;
      p.strokeStyle = `rgba(${clamp(data[ic] + j, 0, 255) | 0},${clamp(data[ic + 1] + j, 0, 255) | 0},${clamp(data[ic + 2] + j * 0.8, 0, 255) | 0},0.72)`;
      p.lineWidth = w0 * (0.6 + 0.8 * hash(i * 5.5 + pass));
      p.beginPath();
      p.moveTo(x - (ca * len) / 2, y - (sa * len) / 2);
      p.lineTo(x + (ca * len) / 2, y + (sa * len) / 2);
      p.stroke();
    }
  });
  // the rider, painted last, against the sun
  p.save();
  p.translate(1000, 590);
  p.scale(-1, 1);
  drawHorseSide(p, 0, 0, 104, 1, 0, { rider: true, graze: 0, still: true });
  p.restore();
  // canvas grain
  p.globalCompositeOperation = 'overlay';
  p.globalAlpha = 0.16;
  p.fillStyle = p.createPattern(FX.grain, 'repeat');
  p.fillRect(0, 0, W, H);
  p.globalAlpha = 0.06;
  p.strokeStyle = '#000';
  p.lineWidth = 1;
  p.beginPath();
  for (let k = -H; k < W; k += 5) { p.moveTo(k, 0); p.lineTo(k + H, H); }
  p.stroke();
  p.globalCompositeOperation = 'source-over';
  p.globalAlpha = 1;
  p.drawImage(FX.vignette, 0, 0);
  return out;
}

// ============================================================ build, lazily

let WORLD = null;
const PARTS = ['fx', 'sky', 'land', 'ground'];
const BUILD = { fx: () => (FX = buildFx()), sky: buildSky, land: buildLand, ground: buildGround };

/** Bake one missing piece; the loading screen calls this a frame at a time. */
function warm() {
  if (!WORLD) WORLD = {};
  for (const k of PARTS) {
    if (!WORLD[k]) { WORLD[k] = BUILD[k](); return false; }
  }
  return true;
}
function ensureWorld() {
  while (!warm());
}

function drawPano(ctx, c, yaw, hz) {
  const s = c.s;
  let sx = ((yaw - HALF_FOV) / TAU) * c.panoW;
  sx -= Math.floor(sx / c.panoW) * c.panoW;
  ctx.drawImage(c, sx, 0, W * s, c.height, 0, hz - c.rowHz, W, c.height / s);
}

// ================================================================== state

/** What the painter keeps between frames: smoothing, the revolver, who just fell. */
const S = {
  clock: null,
  aim: 0,
  eye: 0,
  eyeMeter: 1,
  stamina: 1,
  cyl: 6,
  reserve: 42,
  shotAt: -9,
  reloadAt: -9,
  enemyRef: null,
  style: null,
  seed: 0,
  snap: { bearing: 0, row: 0, size: 0.1, name: '', loom: false, style: null, seed: 0, x: 0, y: 0, hh: 0 },
  corpse: null,
  killer: null,
  honor: null,
  mark: { on: false, x: 0, foot: 0, hh: 0, loom: false, n: 0 },
  killAt: -9,
  eyeT: 0,
};

const GANGS = {
  "O'Driscoll": { plural: "O'Driscolls", hat: 'slouch' },
  'Lemoyne Raider': { plural: 'Lemoyne Raiders', hat: 'kepi' },
  Pinkerton: { plural: 'Pinkertons', hat: 'bowler' },
  Murfree: { plural: 'Murfree Brood', hat: 'sack' },
  Bounty: { plural: 'bounty', hat: 'wide' },
};
const gangOf = (name) => GANGS[name] ?? GANGS["O'Driscoll"];

function step(g) {
  const dt = S.clock === null ? 0 : clamp(g.clock - S.clock, 0, 0.1);
  S.clock = g.clock;
  const e = g.enemy;
  const alive = !g.dead;
  S.aim += ((e && alive ? 1 : 0) - S.aim) * Math.min(1, dt * (e ? 8 : 2.5));
  const eyeOn = e && alive && g.firing && S.eyeMeter > 0.04 ? 1 : 0;
  S.eye += (eyeOn - S.eye) * Math.min(1, dt * (eyeOn ? 7 : 3.5));
  S.eyeT = eyeOn ? S.eyeT + dt : 0;
  S.eyeMeter = clamp01(S.eyeMeter + dt * (eyeOn ? -0.2 : 0.07));
  const turning = Math.abs(g.view?.yawVel ?? 0);
  S.stamina = clamp01(S.stamina + dt * (turning > 1.2 ? -0.12 : 0.05));
  // the revolver: six in the cylinder, a reload after the sixth
  if (g.shotAt > S.shotAt + 1e-6) {
    if (S.shotAt > -9 && S.cyl > 0) S.cyl -= 1;
    S.shotAt = g.shotAt;
    if (S.cyl === 0) S.reloadAt = g.clock;
  }
  if (S.cyl === 0 && g.clock - S.reloadAt > 1.1) { S.cyl = 6; S.reserve = S.reserve > 6 ? S.reserve - 6 : 42; }
  // who is out there, and who just went down
  if (e) {
    if (S.enemyRef !== e) {
      S.enemyRef = e;
      S.seed = hash(g.clock * 3.7 + e.bearing * 11.3);
      S.style = styleOf(e.name, S.seed);
    }
    S.snap.bearing = e.bearing;
    S.snap.size = e.size;
    S.snap.name = e.name;
    S.snap.loom = e.loom;
    S.snap.style = S.style;
    S.snap.seed = S.seed;
  } else if (S.enemyRef) {
    const r = g.lastResult;
    const recent = r && typeof g.now === 'function' && g.now() - r.at < 600;
    if (recent && r.kind === 'kill') {
      S.corpse = { ...S.snap, at: g.clock, dir: S.seed > 0.5 ? 1 : -1, hs: !!r.hs };
      S.killAt = g.clock;
      S.honor = { at: g.clock, good: S.snap.name !== 'Pinkerton' };
      S.eyeMeter = clamp01(S.eyeMeter + 0.15);
    } else if (g.dead) S.killer = { ...S.snap, at: g.clock };
    S.enemyRef = null;
  }
  if (!g.dead) S.killer = null;
  if (S.corpse && g.clock - S.corpse.at > 6) S.corpse = null;
  if (S.corpse && g.clock < S.corpse.at) S.corpse = null;
}

// ============================================================ people & beasts

const C = {
  coat: P('#5c4533', '#1e150e'),
  coatD: P('#3c2d20', '#120c07'),
  cape: P('#4f3b2b', '#1a120b'),
  hat: P('#735636', '#231910'),
  hatD: P('#4a3620', '#140e08'),
  band: P('#2a1d12', '#0c0805'),
  head: P('#8c5628', '#2a170b'),
  eye: P('#c33b27', '#57170f'),
  eyeL: P('#ff9a6a', '#b8472e'),
  claw: P('#2e231b', '#0e0a07'),
  metal: P('#4c4c55', '#18181c'),
  metalL: P('#c4c4d0', '#6a6a72'),
  grip: P('#dccaa4', '#5a5040'),
  leather: P('#6d4526', '#221408'),
  brass: P('#dcb45c', '#6a5424'),
  rope: P('#c4aa7a', '#4a3e2a'),
  skin: P('#b88a68', '#3c2a22'),
  boot: P('#3a281c', '#120c08'),
  horse: P('#94512a', '#2e1a10'),
  horseD: P('#6a3a1e', '#1c100a'),
  mane: P('#2a1e18', '#0e0a08'),
  sock: P('#e2d6bc', '#5a5248'),
  blanket: P('#8a2a22', '#2e0e0c'),
  blanket2: P('#d8b060', '#4a3a22'),
  saddle: P('#7a4a26', '#241408'),
  bed: P('#6a7a8a', '#1e2228'),
  wood: P('#8a5a34', '#24160c'),
  pole: P('#6a5040', '#1c1410'),
  glass: P('#8fd0b0', '#406858'),
  bw: P('#e8e2d4', '#6a6660'),
};

const OUTFITS = {
  slouch: { hat: P('#4a3a2a', '#171210'), coat: P('#35433f', '#11151a'), vest: P('#6a4a2a', '#1e140c'), shirt: P('#c8b89a', '#3a3430'), pants: P('#454552', '#141418'), scarf: P('#8e2a22', '#2a0c0a') },
  kepi: { hat: P('#7c7c72', '#26261f'), coat: P('#72705f', '#22211d'), vest: P('#5a4a3a', '#1a1612'), shirt: P('#d6ccb2', '#3e3a34'), pants: P('#4e4538', '#171410'), scarf: P('#3c3a34', '#121210') },
  bowler: { hat: P('#26262a', '#0c0c0e'), coat: P('#2c2c33', '#0e0e12'), vest: P('#4a3e36', '#141110'), shirt: P('#e6e0d4', '#44423e'), pants: P('#303038', '#101014'), scarf: P('#5a1a1a', '#1a0808') },
  sack: { hat: P('#a08a62', '#302a1e'), coat: P('#4e4132', '#16120e'), vest: P('#6a5238', '#1e1810'), shirt: P('#8a7a5e', '#2a241c'), pants: P('#42382a', '#14100c'), scarf: P('#6a5a40', '#1e1a12') },
  wide: { hat: P('#8e6c4a', '#2a1e14'), coat: P('#8a4e2c', '#2a160c'), vest: P('#c8a060', '#3c2e1c'), shirt: P('#d2c2a0', '#3e3a30'), pants: P('#4e3e2e', '#16120e'), scarf: P('#2a4a6e', '#0c1420') },
};

function styleOf(name, seed) {
  const g = gangOf(name);
  return { hat: g.hat, o: OUTFITS[g.hat], coatLong: seed > 0.35, cover: seed < 0.3 ? 'barrels' : seed < 0.45 ? 'crate' : null, beard: seed > 0.6 };
}

// ----------------------------------------------------------------- the horse

/**
 * A horse side on, facing +x: origin on the ground under its middle, `m` px
 * to a unit (withers height). `graze` lowers the head; `rider` seats the fly.
 */
function drawHorseSide(ctx, x, y, m, k, t, { rider = false, graze = 0, still = false } = {}) {
  const c = (p) => tone(p, k);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(m, m);
  const swish = still ? 0 : Math.sin(t * 1.3) * 0.06 + Math.sin(t * 3.1) * 0.02;
  const nod = still ? 0 : Math.sin(t * 0.9) * 0.02;
  // far legs, darker
  const leg = (x0, y0, kx, ky, fx, hoofX, far, hind) => {
    ctx.strokeStyle = c(far ? C.horseD : C.horse);
    ctx.lineCap = 'round';
    ctx.lineWidth = hind ? 0.16 : 0.12;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = c(far ? C.mane : C.horseD);
    ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, -0.09); ctx.lineTo(hoofX, -0.03); ctx.stroke();
    ctx.fillStyle = c(C.mane);
    ctx.beginPath(); ctx.moveTo(hoofX - 0.05, 0); ctx.lineTo(hoofX + 0.06, 0); ctx.lineTo(hoofX + 0.04, -0.06); ctx.lineTo(hoofX - 0.04, -0.06); ctx.fill();
  };
  leg(0.46, -0.66, 0.47, -0.34, 0.47, 0.5, true, false);
  leg(-0.42, -0.72, -0.36, -0.4, -0.44, -0.42, true, true);
  // tail
  ctx.fillStyle = c(C.mane);
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.95);
  ctx.bezierCurveTo(-0.78, -0.9, -0.8 + swish, -0.55, -0.72 + swish * 1.5, -0.22);
  ctx.lineTo(-0.64 + swish * 1.5, -0.2);
  ctx.bezierCurveTo(-0.7 + swish, -0.5, -0.66, -0.78, -0.56, -0.88);
  ctx.fill();
  // the body and neck in one outline
  const hy = lerp(-1.5, -0.44, graze) + nod;
  const hx = lerp(0.98, 1.08, graze);
  ctx.fillStyle = c(C.horse);
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.94);
  ctx.bezierCurveTo(-0.5, -1.04, -0.2, -0.98, 0.05, -0.97);
  ctx.bezierCurveTo(0.2, -0.97, 0.32, -1.04, 0.42, -1.04);
  // crest of the neck up to the poll
  ctx.bezierCurveTo(0.6, -1.08, hx - 0.2, lerp(-1.4, -0.72, graze), hx - 0.06, hy + 0.02);
  // the head: forehead down to the muzzle
  const mx = hx + lerp(0.34, 0.12, graze), my = hy + lerp(0.36, 0.4, graze);
  ctx.lineTo(hx + 0.02, hy - 0.04);
  ctx.bezierCurveTo(hx + 0.14, hy + 0.04, mx + 0.02, my - 0.12, mx + 0.03, my - 0.03);
  ctx.quadraticCurveTo(mx, my + 0.03, mx - 0.08, my + 0.01);
  ctx.bezierCurveTo(hx + 0.05, lerp(hy + 0.3, hy + 0.3, graze), hx - 0.05, hy + 0.2, hx - 0.14, hy + 0.2);
  // throat and chest
  ctx.bezierCurveTo(hx - 0.3, lerp(-1.05, -0.5, graze), 0.66, -0.9, 0.64, -0.72);
  ctx.bezierCurveTo(0.62, -0.62, 0.52, -0.58, 0.4, -0.58);
  ctx.bezierCurveTo(0.1, -0.52, -0.2, -0.54, -0.36, -0.6);
  // the hind quarter
  ctx.bezierCurveTo(-0.5, -0.56, -0.6, -0.62, -0.64, -0.72);
  ctx.bezierCurveTo(-0.68, -0.8, -0.66, -0.9, -0.6, -0.94);
  ctx.fill();
  // shading: belly and a sheen along the back
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0.02, -0.62, 0.42, 0.07, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,220,170,0.1)';
  ctx.beginPath(); ctx.ellipse(-0.25, -0.9, 0.28, 0.06, 0, 0, TAU); ctx.fill();
  // mane
  ctx.fillStyle = c(C.mane);
  ctx.beginPath();
  ctx.moveTo(0.36, -1.03);
  ctx.bezierCurveTo(0.58, -1.08, hx - 0.22, lerp(-1.42, -0.74, graze), hx - 0.08, hy);
  ctx.lineTo(hx - 0.14, hy + 0.1);
  ctx.bezierCurveTo(hx - 0.3, lerp(-1.25, -0.68, graze), 0.56, -0.98, 0.34, -0.97);
  ctx.fill();
  // ear, eye, nostril
  ctx.beginPath(); ctx.moveTo(hx - 0.04, hy - 0.02); ctx.lineTo(hx - 0.02, hy - 0.14); ctx.lineTo(hx + 0.04, hy - 0.02); ctx.fill();
  ctx.fillStyle = '#0a0706';
  ctx.beginPath(); ctx.arc(hx + 0.06, hy + 0.1, 0.022, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx - 0.02, my - 0.02, 0.015, 0, TAU); ctx.fill();
  // a white blaze down the face
  ctx.strokeStyle = c(C.sock);
  ctx.lineWidth = 0.03;
  ctx.beginPath(); ctx.moveTo(hx + 0.04, hy + 0.02); ctx.lineTo(mx - 0.02, my - 0.08); ctx.stroke();
  // near legs
  leg(0.52, -0.64, 0.56, -0.34, 0.55, 0.58, false, false);
  leg(-0.5, -0.7, -0.44, -0.4, -0.52, -0.5, false, true);
  // a white sock
  ctx.strokeStyle = c(C.sock);
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.moveTo(0.555, -0.2); ctx.lineTo(0.55, -0.09); ctx.stroke();
  // tack: blanket, saddle, bedroll, bags, a rifle in its scabbard
  ctx.fillStyle = c(C.blanket);
  ctx.beginPath(); ctx.moveTo(-0.14, -1.0); ctx.lineTo(0.36, -1.03); ctx.lineTo(0.34, -0.74); ctx.lineTo(-0.12, -0.74); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c(C.blanket2);
  ctx.fillRect(-0.12, -0.8, 0.46, 0.03);
  ctx.fillStyle = c(C.saddle);
  ctx.beginPath();
  ctx.moveTo(-0.08, -1.02); ctx.quadraticCurveTo(-0.08, -1.14, -0.02, -1.14);
  ctx.quadraticCurveTo(0.12, -1.02, 0.26, -1.06); ctx.lineTo(0.3, -1.18); ctx.lineTo(0.35, -1.18); ctx.lineTo(0.34, -1.02);
  ctx.lineTo(0.3, -0.86); ctx.lineTo(-0.06, -0.86); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = c(C.leather);
  ctx.lineWidth = 0.025;
  ctx.beginPath(); ctx.moveTo(0.14, -0.9); ctx.lineTo(0.14, -0.62); ctx.stroke();
  ctx.fillStyle = c(C.brass);
  ctx.fillRect(0.1, -0.64, 0.08, 0.03);
  ctx.fillStyle = c(C.bed);
  rrect(ctx, -0.22, -1.14, 0.14, 0.12, 0.05); ctx.fill();
  ctx.fillStyle = c(C.leather);
  rrect(ctx, -0.26, -0.98, 0.14, 0.16, 0.03); ctx.fill();
  ctx.strokeStyle = c(C.leather);
  ctx.lineWidth = 0.045;
  ctx.beginPath(); ctx.moveTo(0.38, -0.92); ctx.lineTo(-0.02, -0.7); ctx.stroke();
  ctx.fillStyle = c(C.wood);
  ctx.beginPath(); ctx.arc(0.4, -0.93, 0.03, 0, TAU); ctx.fill();
  if (rider) drawRiderOnHorse(ctx, k, t);
  // rim of the low sun along the top line
  if (k > 0.3) {
    ctx.strokeStyle = `rgba(255,206,140,${(k - 0.3) * 0.9})`;
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.95); ctx.bezierCurveTo(-0.5, -1.04, -0.2, -0.98, 0.05, -0.97);
    ctx.moveTo(0.36, -1.04); ctx.bezierCurveTo(0.6, -1.08, hx - 0.2, lerp(-1.4, -0.72, graze), hx - 0.06, hy + 0.02);
    ctx.stroke();
  }
  ctx.restore();
}

/** The fly in the saddle, side on: hat, duster over the horse's flank, the wings catching the light. */
function drawRiderOnHorse(ctx, k, t) {
  const c = (p) => tone(p, k);
  // duster over the saddle and the flank
  ctx.fillStyle = c(C.coat);
  ctx.beginPath();
  ctx.moveTo(0.02, -1.62); ctx.lineTo(0.2, -1.62);
  ctx.quadraticCurveTo(0.28, -1.3, 0.24, -1.06);
  ctx.lineTo(0.3, -0.74); ctx.lineTo(-0.16, -0.72);
  ctx.quadraticCurveTo(-0.08, -1.0, -0.02, -1.1);
  ctx.quadraticCurveTo(-0.04, -1.4, 0.02, -1.62);
  ctx.fill();
  // leg and boot in the stirrup
  ctx.strokeStyle = c(C.boot);
  ctx.lineWidth = 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0.14, -0.95); ctx.lineTo(0.18, -0.68); ctx.lineTo(0.24, -0.66); ctx.stroke();
  // the wings, folded back over the coat
  ctx.fillStyle = `rgba(255,230,190,${0.3 + k * 0.3})`;
  ctx.strokeStyle = 'rgba(60,40,30,0.5)';
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.ellipse(-0.04, -1.3, 0.3, 0.07, -0.35, 0, TAU); ctx.fill(); ctx.stroke();
  // arm with the reins
  ctx.strokeStyle = c(C.coatD);
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.moveTo(0.16, -1.52); ctx.lineTo(0.3, -1.3); ctx.lineTo(0.42, -1.24); ctx.stroke();
  // head: the red eye, the hat
  ctx.fillStyle = c(C.head);
  ctx.beginPath(); ctx.ellipse(0.12, -1.72, 0.09, 0.08, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = c(C.eye);
  ctx.beginPath(); ctx.ellipse(0.17, -1.72, 0.05, 0.065, 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = c(C.hat);
  ctx.beginPath(); ctx.ellipse(0.1, -1.8, 0.24, 0.035, -0.04, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.0, -1.8); ctx.quadraticCurveTo(-0.01, -1.94, 0.06, -1.94); ctx.quadraticCurveTo(0.1, -1.9, 0.14, -1.94);
  ctx.quadraticCurveTo(0.21, -1.94, 0.2, -1.8); ctx.closePath(); ctx.fill();
  // antenna under the brim
  ctx.strokeStyle = c(C.claw);
  ctx.lineWidth = 0.012;
  ctx.beginPath(); ctx.moveTo(0.19, -1.76); ctx.quadraticCurveTo(0.26, -1.78, 0.28, -1.72); ctx.stroke();
  if (k > 0.3) {
    ctx.strokeStyle = `rgba(255,210,150,${(k - 0.3) * 1.1})`;
    ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(-0.14, -1.8); ctx.lineTo(0.34, -1.81); ctx.moveTo(0.02, -1.62); ctx.quadraticCurveTo(-0.04, -1.4, -0.02, -1.1); ctx.stroke();
  }
}

// ---------------------------------------------------------------- outlaws

/** An outlaw facing the camera: origin at the feet, one unit his height. */
function drawOutlaw(ctx, x, y, hh, st, k, fl, pose) {
  const o = st.o;
  const c = (p) => tone(p, k, fl);
  ctx.save();
  ctx.translate(x, y);
  if (pose.rot) ctx.rotate(pose.rot);
  ctx.scale(hh, hh);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // legs and boots
  ctx.fillStyle = c(o.pants);
  ctx.beginPath(); ctx.moveTo(-0.105, -0.48); ctx.lineTo(-0.008, -0.48); ctx.lineTo(-0.03, -0.07); ctx.lineTo(-0.098, -0.07); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.105, -0.48); ctx.lineTo(0.008, -0.48); ctx.lineTo(0.03, -0.07); ctx.lineTo(0.098, -0.07); ctx.fill();
  ctx.fillStyle = c(C.boot);
  rrect(ctx, -0.108, -0.1, 0.082, 0.1, 0.018); ctx.fill();
  rrect(ctx, 0.026, -0.1, 0.082, 0.1, 0.018); ctx.fill();
  // shirt and vest
  ctx.fillStyle = c(o.shirt);
  ctx.fillRect(-0.06, -0.8, 0.12, 0.36);
  ctx.fillStyle = c(o.vest);
  ctx.beginPath(); ctx.moveTo(-0.075, -0.79); ctx.lineTo(-0.012, -0.64); ctx.lineTo(-0.02, -0.46); ctx.lineTo(-0.09, -0.46); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.075, -0.79); ctx.lineTo(0.012, -0.64); ctx.lineTo(0.02, -0.46); ctx.lineTo(0.09, -0.46); ctx.fill();
  // coat, open down the front
  const hem = st.coatLong ? -0.26 : -0.43;
  ctx.fillStyle = c(o.coat);
  ctx.beginPath(); ctx.moveTo(-0.14, -0.8); ctx.quadraticCurveTo(-0.17, -0.6, -0.19, hem); ctx.lineTo(-0.06, hem + 0.02); ctx.lineTo(-0.055, -0.62); ctx.lineTo(-0.045, -0.81); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.14, -0.8); ctx.quadraticCurveTo(0.17, -0.6, 0.19, hem); ctx.lineTo(0.06, hem + 0.02); ctx.lineTo(0.055, -0.62); ctx.lineTo(0.045, -0.81); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-0.19, hem - 0.01, 0.13, 0.015);
  ctx.fillRect(0.06, hem - 0.01, 0.13, 0.015);
  // belt, buckle, holster
  ctx.fillStyle = c(C.leather);
  ctx.fillRect(-0.1, -0.48, 0.2, 0.03);
  ctx.fillStyle = c(C.brass);
  ctx.fillRect(-0.016, -0.482, 0.032, 0.034);
  ctx.fillStyle = c(C.leather);
  ctx.beginPath(); ctx.moveTo(0.075, -0.47); ctx.lineTo(0.115, -0.47); ctx.lineTo(0.12, -0.37); ctx.lineTo(0.085, -0.36); ctx.fill();
  // head and bandana
  ctx.fillStyle = c(C.skin);
  ctx.beginPath(); ctx.ellipse(0, -0.872, 0.05, 0.06, 0, 0, TAU); ctx.fill();
  ctx.fillRect(-0.02, -0.83, 0.04, 0.04);
  if (st.hat === 'bowler' || st.hat === 'kepi') {
    // a moustache instead of a mask
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath(); ctx.ellipse(0, -0.852, 0.03, 0.009, 0, 0, TAU); ctx.fill();
    if (st.beard) { ctx.beginPath(); ctx.ellipse(0, -0.832, 0.036, 0.024, 0, 0, TAU); ctx.fill(); }
  } else if (st.hat !== 'sack') {
    ctx.fillStyle = c(o.scarf);
    ctx.beginPath(); ctx.moveTo(-0.053, -0.868); ctx.quadraticCurveTo(0, -0.874, 0.053, -0.868); ctx.lineTo(0.046, -0.82); ctx.lineTo(0, -0.765); ctx.lineTo(-0.046, -0.82); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-0.04, -0.845, 0.08, 0.006);
  }
  // eyes in the hat's shade
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-0.05, -0.905, 0.1, 0.028);
  ctx.fillStyle = '#140c08';
  ctx.beginPath(); ctx.arc(-0.02, -0.887, 0.007, 0, TAU); ctx.arc(0.02, -0.887, 0.007, 0, TAU); ctx.fill();
  if (pose.hat !== false) outlawHat(ctx, st, c);
  // arms and the rifle, aimed at the fly
  const drop = pose.drop ?? 0;
  ctx.strokeStyle = c(o.coat);
  ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(-0.125, -0.775); ctx.lineTo(-0.17, -0.66 + drop * 0.1); ctx.lineTo(-0.085, -0.635 + drop * 0.12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.125, -0.775); ctx.lineTo(0.16, -0.68 + drop * 0.1); ctx.lineTo(0.085, -0.665 + drop * 0.12); ctx.stroke();
  ctx.save();
  ctx.translate(0, drop * 0.12);
  ctx.rotate(drop * 0.5);
  ctx.fillStyle = c(C.wood);
  ctx.beginPath(); ctx.moveTo(-0.15, -0.725); ctx.lineTo(-0.14, -0.655); ctx.lineTo(-0.04, -0.652); ctx.lineTo(-0.04, -0.676); ctx.fill();
  ctx.fillStyle = c(C.metal);
  ctx.fillRect(-0.045, -0.684, 0.07, 0.03);
  ctx.fillStyle = c(C.wood);
  ctx.fillRect(0.025, -0.678, 0.08, 0.018);
  ctx.fillStyle = c(C.metal);
  ctx.fillRect(0.02, -0.69, 0.2, 0.011);
  ctx.beginPath(); ctx.arc(0.222, -0.684, 0.009, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = c(C.claw);
  ctx.beginPath(); ctx.arc(-0.085, -0.64 + drop * 0.12, 0.022, 0, TAU); ctx.arc(0.085, -0.668 + drop * 0.12, 0.022, 0, TAU); ctx.fill();
  // rim light when he stands against the sun
  if (k > 0.35) {
    ctx.strokeStyle = `rgba(255,208,144,${((k - 0.35) * 1.1).toFixed(3)})`;
    ctx.lineWidth = 0.008;
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.8); ctx.quadraticCurveTo(-0.17, -0.6, -0.19, hem);
    ctx.moveTo(0.14, -0.8); ctx.quadraticCurveTo(0.17, -0.6, 0.19, hem);
    ctx.moveTo(-0.105, -0.48); ctx.lineTo(-0.098, -0.07);
    ctx.moveTo(0.105, -0.48); ctx.lineTo(0.098, -0.07);
    ctx.stroke();
  }
  ctx.restore();
}

function outlawHat(ctx, st, c) {
  const o = st.o;
  ctx.fillStyle = c(o.hat);
  if (st.hat === 'slouch' || st.hat === 'wide') {
    const w = st.hat === 'wide' ? 0.15 : 0.12;
    ctx.beginPath();
    ctx.moveTo(-w, -0.9); ctx.quadraticCurveTo(-w * 0.6, -0.935, 0, -0.935); ctx.quadraticCurveTo(w * 0.6, -0.935, w, -0.9);
    ctx.quadraticCurveTo(w * 0.5, -0.915, 0, -0.915); ctx.quadraticCurveTo(-w * 0.5, -0.915, -w, -0.9);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.056, -0.925); ctx.quadraticCurveTo(-0.062, -0.99, -0.03, -1.0); ctx.quadraticCurveTo(0, -0.985, 0.03, -1.0); ctx.quadraticCurveTo(0.062, -0.99, 0.056, -0.925);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-0.056, -0.94, 0.112, 0.014);
  } else if (st.hat === 'bowler') {
    ctx.beginPath(); ctx.ellipse(0, -0.925, 0.078, 0.014, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -0.94, 0.05, 0.05, 0, PI, TAU); ctx.fill();
  } else if (st.hat === 'kepi') {
    ctx.beginPath(); ctx.moveTo(-0.052, -0.915); ctx.lineTo(-0.044, -0.985); ctx.lineTo(0.05, -0.97); ctx.lineTo(0.052, -0.915); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(0, -0.912, 0.058, 0.012, 0, 0, PI); ctx.fill();
  } else if (st.hat === 'sack') {
    // a burlap hood with eye holes
    ctx.beginPath(); ctx.moveTo(-0.062, -0.8); ctx.quadraticCurveTo(-0.075, -0.93, -0.03, -0.97); ctx.quadraticCurveTo(0.01, -0.99, 0.04, -0.96); ctx.quadraticCurveTo(0.075, -0.92, 0.062, -0.8); ctx.fill();
    ctx.fillStyle = '#0c0806';
    ctx.beginPath(); ctx.ellipse(-0.022, -0.885, 0.012, 0.009, 0, 0, TAU); ctx.ellipse(0.022, -0.885, 0.012, 0.009, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.6)';
    ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(-0.05, -0.82); ctx.lineTo(0.05, -0.82); ctx.stroke();
  }
}

/** Cover in front of him: barrels or a crate, up to the knees or the waist. */
function drawCover(ctx, x, y, hh, kind, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hh, hh);
  const wood = tone(C.wood, k);
  if (kind === 'barrels') {
    for (const [bx, bh] of [[-0.12, 0.44], [0.1, 0.4]]) {
      ctx.fillStyle = wood;
      rrect(ctx, bx - 0.1, -bh, 0.2, bh, 0.04); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bx + 0.04, -bh, 0.06, bh);
      ctx.fillStyle = tone(C.metal, k);
      ctx.fillRect(bx - 0.1, -bh * 0.82, 0.2, 0.018);
      ctx.fillRect(bx - 0.1, -bh * 0.22, 0.2, 0.018);
      ctx.fillStyle = 'rgba(255,220,170,0.12)';
      ctx.fillRect(bx - 0.08, -bh, 0.04, bh);
    }
  } else {
    ctx.fillStyle = wood;
    ctx.fillRect(-0.2, -0.36, 0.4, 0.36);
    ctx.strokeStyle = 'rgba(30,18,10,0.6)';
    ctx.lineWidth = 0.014;
    ctx.strokeRect(-0.19, -0.35, 0.38, 0.34);
    ctx.beginPath(); ctx.moveTo(-0.19, -0.35); ctx.lineTo(0.19, -0.01); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- riders

/** A rider charging head-on: origin on the ground, one unit roughly a horse. */
function drawCharger(ctx, x, y, s, st, k, fl, phase, flashOn) {
  const c = (p) => tone(p, k, fl);
  const o = st.o;
  ctx.save();
  ctx.translate(x, y + Math.sin(phase * 2) * s * 0.02);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  // hind legs, behind
  ctx.strokeStyle = c(C.horseD);
  ctx.lineWidth = 0.06;
  const lift = Math.sin(phase);
  ctx.beginPath(); ctx.moveTo(-0.12, -0.6); ctx.lineTo(-0.14, -0.2 - Math.max(0, -lift) * 0.12); ctx.moveTo(0.12, -0.6); ctx.lineTo(0.14, -0.2 - Math.max(0, lift) * 0.12); ctx.stroke();
  // front legs: one reaching, one folded
  ctx.strokeStyle = c(C.horse);
  ctx.lineWidth = 0.075;
  const legF = (side, l) => {
    const up = Math.max(0, l);
    ctx.beginPath();
    ctx.moveTo(side * 0.1, -0.56);
    ctx.lineTo(side * 0.11, -0.3 - up * 0.12);
    ctx.lineTo(side * 0.1 + up * side * 0.02, -0.04 - up * 0.3);
    ctx.stroke();
    ctx.fillStyle = c(C.mane);
    ctx.fillRect(side * 0.1 - 0.04, -0.05 - up * 0.3, 0.08, 0.05);
  };
  legF(-1, lift); legF(1, -lift);
  // body and chest
  ctx.fillStyle = c(C.horseD);
  ctx.beginPath(); ctx.ellipse(0, -0.72, 0.26, 0.15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = c(C.horse);
  ctx.beginPath(); ctx.ellipse(0, -0.64, 0.19, 0.17, 0, 0, TAU); ctx.fill();
  // the rider, behind the head
  ctx.fillStyle = c(o.coat);
  ctx.beginPath(); ctx.moveTo(-0.17, -0.84); ctx.quadraticCurveTo(-0.2, -1.12, -0.13, -1.26); ctx.lineTo(0.13, -1.26); ctx.quadraticCurveTo(0.2, -1.12, 0.17, -0.84); ctx.fill();
  ctx.fillStyle = c(o.shirt);
  ctx.fillRect(-0.04, -1.25, 0.08, 0.2);
  ctx.fillStyle = c(C.skin);
  ctx.beginPath(); ctx.ellipse(0, -1.34, 0.065, 0.075, 0, 0, TAU); ctx.fill();
  if (st.hat !== 'sack' && st.hat !== 'bowler') {
    ctx.fillStyle = c(o.scarf);
    ctx.beginPath(); ctx.moveTo(-0.066, -1.34); ctx.lineTo(0.066, -1.34); ctx.lineTo(0, -1.22); ctx.closePath(); ctx.fill();
  }
  ctx.save();
  // the hat is drawn for a standing outlaw's head (y −0.872); scaled 1.25 it
  // has to land on this rider's head, at −1.34
  ctx.translate(0, -1.34 + 0.872 * 1.25);
  ctx.scale(1.25, 1.25);
  outlawHat(ctx, st, c);
  ctx.restore();
  ctx.fillStyle = '#140c08';
  ctx.beginPath(); ctx.arc(-0.025, -1.36, 0.009, 0, TAU); ctx.arc(0.025, -1.36, 0.009, 0, TAU); ctx.fill();
  // gun arm raised at the camera, reins in the other
  ctx.strokeStyle = c(o.coat);
  ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(0.13, -1.22); ctx.lineTo(0.24, -1.14); ctx.lineTo(0.22, -1.08); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.13, -1.22); ctx.lineTo(-0.18, -1.06); ctx.lineTo(-0.08, -0.98); ctx.stroke();
  ctx.fillStyle = c(C.metal);
  ctx.beginPath(); ctx.arc(0.22, -1.08, 0.035, 0, TAU); ctx.fill();
  ctx.fillStyle = '#050404';
  ctx.beginPath(); ctx.arc(0.22, -1.08, 0.014, 0, TAU); ctx.fill();
  if (flashOn) {
    ctx.fillStyle = 'rgba(255,230,160,0.95)';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = i % 2 ? 0.03 : 0.1; ctx.lineTo(0.22 + Math.cos(a) * r, -1.08 + Math.sin(a) * r); }
    ctx.fill();
  }
  // the horse's neck and head, coming straight at the camera
  ctx.fillStyle = c(C.horse);
  ctx.beginPath(); ctx.moveTo(-0.1, -0.7); ctx.quadraticCurveTo(-0.13, -0.92, -0.08, -1.02); ctx.lineTo(0.08, -1.02); ctx.quadraticCurveTo(0.13, -0.92, 0.1, -0.7); ctx.fill();
  ctx.fillStyle = c(C.mane);
  ctx.beginPath(); ctx.moveTo(-0.09, -1.0); ctx.quadraticCurveTo(-0.22, -0.96 + Math.sin(phase * 2) * 0.02, -0.16, -0.78); ctx.lineTo(-0.1, -0.84); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.09, -1.0); ctx.quadraticCurveTo(0.22, -0.96 - Math.sin(phase * 2) * 0.02, 0.16, -0.78); ctx.lineTo(0.1, -0.84); ctx.fill();
  ctx.fillStyle = c(C.horse);
  ctx.beginPath();
  ctx.moveTo(-0.075, -1.06); ctx.quadraticCurveTo(0, -1.1, 0.075, -1.06);
  ctx.quadraticCurveTo(0.08, -0.9, 0.055, -0.78); ctx.quadraticCurveTo(0, -0.74, -0.055, -0.78);
  ctx.quadraticCurveTo(-0.08, -0.9, -0.075, -1.06);
  ctx.fill();
  ctx.fillStyle = c(C.mane);
  ctx.beginPath(); ctx.moveTo(-0.06, -1.05); ctx.lineTo(-0.075, -1.14); ctx.lineTo(-0.035, -1.07); ctx.moveTo(0.06, -1.05); ctx.lineTo(0.075, -1.14); ctx.lineTo(0.035, -1.07); ctx.fill();
  ctx.fillStyle = c(C.sock);
  ctx.beginPath(); ctx.moveTo(-0.018, -1.05); ctx.lineTo(0.018, -1.05); ctx.lineTo(0.012, -0.8); ctx.lineTo(-0.012, -0.8); ctx.fill();
  ctx.fillStyle = '#0a0706';
  ctx.beginPath(); ctx.ellipse(-0.07, -0.99, 0.014, 0.02, 0, 0, TAU); ctx.ellipse(0.07, -0.99, 0.014, 0.02, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.026, -0.79, 0.013, 0.018, 0, 0, TAU); ctx.ellipse(0.026, -0.79, 0.013, 0.018, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = c(C.leather);
  ctx.lineWidth = 0.012;
  ctx.beginPath(); ctx.moveTo(-0.07, -0.86); ctx.lineTo(0.07, -0.86); ctx.moveTo(-0.075, -0.95); ctx.lineTo(-0.06, -0.86); ctx.moveTo(0.075, -0.95); ctx.lineTo(0.06, -0.86); ctx.stroke();
  if (k > 0.35) {
    ctx.strokeStyle = `rgba(255,208,144,${((k - 0.35) * 1.1).toFixed(3)})`;
    ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.arc(0, -0.64, 0.19, PI * 1.05, PI * 1.95); ctx.moveTo(-0.17, -0.84); ctx.quadraticCurveTo(-0.2, -1.12, -0.13, -1.26); ctx.moveTo(0.17, -0.84); ctx.quadraticCurveTo(0.2, -1.12, 0.13, -1.26); ctx.stroke();
  }
  ctx.restore();
}

// ================================================================ the fly

const CX = 404;
const CY = 566;

/** The fly from behind: hat, duster, wings through the back vent, the revolver arm to the crosshair. */
function drawCowboy(ctx, g, t, k, rimL, rimR) {
  const c = (p) => tone(p, k);
  const aim = smooth(clamp01(S.aim));
  const since = g.clock - g.shotAt;
  const kick = since >= 0 && since < 0.2 ? Math.pow(1 - since / 0.2, 2) : 0;
  const breathe = Math.sin(t * 1.8) * 1.4;
  const dead = g.dead ? smooth(clamp01(g.dead.t / 0.9)) : 0;
  ctx.save();
  ctx.translate(CX, CY + breathe * 0.4 + dead * 330);
  ctx.rotate(Math.sin(t * 0.6) * 0.008 * (1 - aim) - aim * 0.015 + dead * 0.55);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // --- arms at the sides, behind the coat
  const SH = [86, -178];
  const EL = [lerp(112, 138, aim), lerp(-104, -150, aim)];
  const HA = [lerp(108, 168, aim) - kick * 5, lerp(-28, -170, aim) - kick * 16];
  ctx.strokeStyle = c(C.coatD);
  ctx.lineWidth = 34;
  ctx.beginPath(); ctx.moveTo(-86, -176); ctx.quadraticCurveTo(-116, -110, -108, -34); ctx.stroke();
  ctx.fillStyle = c(C.claw);
  ctx.beginPath(); ctx.ellipse(-108, -16, 12, 16, 0.1, 0, TAU); ctx.fill();
  // the middle leg, holding a coil of rope at the hip
  ctx.strokeStyle = c(C.claw);
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(-96, 20); ctx.quadraticCurveTo(-120, 34, -128, 58); ctx.stroke();
  ctx.strokeStyle = c(C.rope);
  ctx.lineWidth = 4.5;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-138 + i * 3, 92 + i * 2, 24 - i * 2, 32 - i * 2, 0.25, 0, TAU); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(-138, 92, 27, 35, 0.25, 0, TAU); ctx.stroke();
  if (aim < 0.5) gunArm(ctx, c, SH, EL, HA, aim, kick, false);
  // --- the duster
  ctx.fillStyle = c(C.coat);
  ctx.beginPath();
  ctx.moveTo(-30, -214);
  ctx.quadraticCurveTo(-70, -206, -94, -184);
  ctx.quadraticCurveTo(-118, -150, -113, -96);
  ctx.quadraticCurveTo(-108, -40, -114, 20);
  ctx.quadraticCurveTo(-128, 110, -152, 200);
  ctx.lineTo(152, 200);
  ctx.quadraticCurveTo(128, 110, 114, 20);
  ctx.quadraticCurveTo(108, -40, 113, -96);
  ctx.quadraticCurveTo(118, -150, 94, -184);
  ctx.quadraticCurveTo(70, -206, 30, -214);
  ctx.closePath();
  ctx.fill();
  // round shading across it, the sun's side warmer
  ctx.fillStyle = coatShade();
  ctx.fill();
  if (rimR > 0.05 || rimL > 0.05) {
    ctx.fillStyle = sheen(rimR - rimL);
    ctx.fill();
  }
  // folds, the back seam, the vent, the half belt
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -120); ctx.lineTo(0, 200);
  ctx.moveTo(-58, -40); ctx.quadraticCurveTo(-70, 60, -86, 200);
  ctx.moveTo(52, -30); ctx.quadraticCurveTo(66, 70, 80, 200);
  ctx.moveTo(-30, 30); ctx.quadraticCurveTo(-34, 110, -40, 200);
  ctx.moveTo(26, 40); ctx.quadraticCurveTo(30, 120, 34, 200);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,180,0.08)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-50, -30); ctx.quadraticCurveTo(-62, 70, -76, 200); ctx.moveTo(60, -20); ctx.quadraticCurveTo(74, 80, 90, 200); ctx.stroke();
  ctx.fillStyle = c(C.coatD);
  ctx.fillRect(-64, -26, 128, 16);
  ctx.fillStyle = c(C.brass);
  ctx.beginPath(); ctx.arc(-52, -18, 3.5, 0, TAU); ctx.arc(52, -18, 3.5, 0, TAU); ctx.fill();
  // --- the wings, folded over the back
  wings(ctx, k, t);
  // --- the shoulder cape, its shadow first
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-120, -108); ctx.quadraticCurveTo(-90, -96, -60, -104); ctx.quadraticCurveTo(-30, -92, 0, -100);
  ctx.quadraticCurveTo(30, -92, 60, -104); ctx.quadraticCurveTo(90, -96, 120, -108);
  ctx.stroke();
  ctx.fillStyle = c(C.cape);
  ctx.beginPath();
  ctx.moveTo(-30, -218);
  ctx.quadraticCurveTo(-78, -210, -104, -188);
  ctx.quadraticCurveTo(-128, -152, -122, -112);
  ctx.quadraticCurveTo(-90, -100, -60, -108); ctx.quadraticCurveTo(-30, -96, 0, -104);
  ctx.quadraticCurveTo(30, -96, 60, -108); ctx.quadraticCurveTo(90, -100, 122, -112);
  ctx.quadraticCurveTo(128, -152, 104, -188);
  ctx.quadraticCurveTo(78, -210, 30, -218);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = coatShade();
  ctx.fill();
  if (rimR > 0.05 || rimL > 0.05) { ctx.fillStyle = sheen(rimR - rimL); ctx.fill(); }
  // collar
  ctx.fillStyle = c(C.coatD);
  ctx.beginPath(); ctx.moveTo(-36, -212); ctx.quadraticCurveTo(0, -206, 36, -212); ctx.lineTo(30, -232); ctx.quadraticCurveTo(0, -226, -30, -232); ctx.closePath(); ctx.fill();
  // --- the head: compound eyes bulging past the back of it
  const hatOff = g.dead ? hatFlight(g.dead.t) : null;
  ctx.fillStyle = c(C.eye);
  ctx.beginPath(); ctx.ellipse(-40, -242, 19, 27, 0.12, 0, TAU); ctx.ellipse(40, -242, 19, 27, -0.12, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(40,0,0,0.35)';
  for (let i = 0; i < 18; i++) {
    const side = i < 9 ? -1 : 1, j = i % 9;
    ctx.beginPath(); ctx.arc(side * (46 + (j % 3) * 4), -258 + Math.floor(j / 3) * 13 + (j % 3) * 3, 2.2, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = c(C.eyeL);
  ctx.globalAlpha = 0.35 + 0.5 * Math.max(rimL, rimR, 0.3);
  ctx.beginPath(); ctx.ellipse(-50, -254, 5, 9, 0.3, 0, TAU); ctx.ellipse(50, -254, 5, 9, -0.3, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = c(C.head);
  ctx.beginPath(); ctx.ellipse(0, -240, 36, 31, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(0, -232, 30, 18, 0, 0, PI); ctx.fill();
  ctx.strokeStyle = c(C.claw);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) { const bx = -24 + i * 8; ctx.moveTo(bx, -250 + Math.abs(i - 3) * 2); ctx.lineTo(bx + (i - 3) * 2, -262 + Math.abs(i - 3) * 2); }
  ctx.stroke();
  // antennae, the only thing poking out from under the hat
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-10, -266); ctx.quadraticCurveTo(-26, -300, -34, -304); ctx.moveTo(10, -266); ctx.quadraticCurveTo(26, -300, 34, -304); ctx.stroke();
  // --- the hat
  ctx.save();
  if (hatOff) { ctx.translate(hatOff[0], hatOff[1]); ctx.rotate(hatOff[2]); }
  hat(ctx, c, rimL, rimR);
  ctx.restore();
  // --- the gun arm, raised over the shoulder when it aims
  if (aim >= 0.5) gunArm(ctx, c, SH, EL, HA, aim, kick, true);
  holster(ctx, c, aim);
  // --- the sun's edge
  if (rimL > 0.04 || rimR > 0.04) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 3;
    for (const [side, amt] of [[-1, rimL], [1, rimR]]) {
      if (amt < 0.04) continue;
      ctx.strokeStyle = `rgba(255,196,120,${(amt * 0.85).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(side * 30, -218); ctx.quadraticCurveTo(side * 78, -210, side * 104, -188); ctx.quadraticCurveTo(side * 128, -152, side * 122, -112);
      ctx.moveTo(side * 113, -96); ctx.quadraticCurveTo(side * 108, -40, side * 114, 20); ctx.quadraticCurveTo(side * 128, 110, side * 152, 200);
      ctx.moveTo(side * 57, -242); ctx.quadraticCurveTo(side * 60, -226, side * 52, -218);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

let COAT_SHADE = null;
function coatShade() {
  if (!COAT_SHADE) {
    const x = FX.vignette.getContext('2d');
    COAT_SHADE = x.createLinearGradient(-150, 0, 150, 0);
    COAT_SHADE.addColorStop(0, 'rgba(0,0,0,0.45)');
    COAT_SHADE.addColorStop(0.3, 'rgba(0,0,0,0.05)');
    COAT_SHADE.addColorStop(0.55, 'rgba(255,230,200,0.05)');
    COAT_SHADE.addColorStop(0.75, 'rgba(0,0,0,0.08)');
    COAT_SHADE.addColorStop(1, 'rgba(0,0,0,0.45)');
  }
  return COAT_SHADE;
}
const SHEEN = [];
/** Warm light on one side of the coat: `side` > 0 the right. */
function sheen(side) {
  const q = Math.round(clamp(side, -1, 1) * 8) + 8;
  if (!SHEEN[q]) {
    const x = FX.vignette.getContext('2d');
    const gr = x.createLinearGradient(-150, 0, 150, 0);
    const s = (q - 8) / 8;
    gr.addColorStop(0, `rgba(255,170,90,${Math.max(0, -s) * 0.3})`);
    gr.addColorStop(0.35, 'rgba(255,170,90,0)');
    gr.addColorStop(0.65, 'rgba(255,170,90,0)');
    gr.addColorStop(1, `rgba(255,170,90,${Math.max(0, s) * 0.3})`);
    SHEEN[q] = gr;
  }
  return SHEEN[q];
}

/** Where the hat goes when the fly is shot: up, over and down. */
function hatFlight(dt) {
  const u = Math.min(dt, 1.2);
  return [u * 170, -u * 260 + u * u * 420, u * 2.6];
}

function hat(ctx, c, rimL, rimR) {
  // brim: seen from behind and a little above, its sides curling up
  ctx.fillStyle = c(C.hat);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * TAU;
    const cx = Math.cos(a), sy = Math.sin(a);
    ctx.lineTo(cx * 106, -262 + sy * 25 - Math.pow(Math.abs(cx), 4) * 12);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c(C.band);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, -258, 62, 15, 0, 0, TAU); ctx.fill();
  // crown with a cattleman's crease
  ctx.fillStyle = c(C.hat);
  ctx.beginPath();
  ctx.moveTo(-50, -266);
  ctx.bezierCurveTo(-56, -300, -48, -324, -26, -326);
  ctx.quadraticCurveTo(0, -314, 26, -326);
  ctx.bezierCurveTo(48, -324, 56, -300, 50, -266);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = sheen((rimR - rimL) * 1.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.moveTo(-50, -266); ctx.bezierCurveTo(-56, -300, -48, -324, -26, -326); ctx.lineTo(-24, -300); ctx.lineTo(-38, -266); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-18, -318); ctx.quadraticCurveTo(0, -306, 18, -318); ctx.moveTo(-34, -304); ctx.lineTo(-24, -290); ctx.moveTo(34, -304); ctx.lineTo(24, -290); ctx.stroke();
  // the band
  ctx.fillStyle = c(C.band);
  ctx.beginPath(); ctx.moveTo(-51, -266); ctx.quadraticCurveTo(0, -260, 51, -266); ctx.lineTo(51, -278); ctx.quadraticCurveTo(0, -272, -51, -278); ctx.closePath(); ctx.fill();
  if (rimL > 0.04 || rimR > 0.04) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2.5;
    for (const [side, amt] of [[-1, rimL], [1, rimR]]) {
      if (amt < 0.04) continue;
      ctx.strokeStyle = `rgba(255,200,130,${(amt * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(side * 50, -268); ctx.bezierCurveTo(side * 56, -300, side * 48, -324, side * 26, -326);
      ctx.moveTo(side * 60, -274); ctx.quadraticCurveTo(side * 96, -270, side * 106, -276);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function wings(ctx, k, t) {
  const glow = 0.18 + k * 0.28;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 14, -170);
    ctx.rotate(side * -0.2 + Math.sin(t * 2.3 + side) * 0.004);
    ctx.fillStyle = `rgba(236,232,222,${glow.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(side * 6, 118, 30, 124, 0, 0, TAU); ctx.fill();
    // iridescence along the trailing edge
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,200,120,${(0.08 + k * 0.18).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(side * 16, 150, 12, 80, side * -0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,160,255,0.06)';
    ctx.beginPath(); ctx.ellipse(side * -8, 110, 10, 90, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(44,30,22,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(side * 6, 118, 30, 124, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let v = -2; v <= 2; v++) { ctx.moveTo(side * 2, 4); ctx.quadraticCurveTo(side * (6 + v * 9), 110, side * (6 + v * 12), 232); }
    ctx.moveTo(side * -14, 100); ctx.lineTo(side * 22, 96);
    ctx.moveTo(side * -10, 160); ctx.lineTo(side * 24, 150);
    ctx.stroke();
    ctx.restore();
  }
}

function gunArm(ctx, c, SH, EL, HA, aim, kick, raised) {
  ctx.strokeStyle = c(raised ? C.coat : C.coatD);
  ctx.lineWidth = 34;
  ctx.beginPath(); ctx.moveTo(SH[0], SH[1]); ctx.quadraticCurveTo(EL[0], EL[1], HA[0], HA[1]); ctx.stroke();
  if (raised) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(SH[0] + 4, SH[1] + 14); ctx.quadraticCurveTo(EL[0] + 4, EL[1] + 14, HA[0], HA[1] + 10); ctx.stroke();
  }
  ctx.strokeStyle = c(C.coatD);
  ctx.lineWidth = 30;
  ctx.beginPath(); ctx.moveTo(HA[0] - 10 * (raised ? 1 : 0), HA[1] + (raised ? 2 : -10)); ctx.lineTo(HA[0], HA[1]); ctx.stroke();
  if (raised) {
    const ang = Math.atan2(360 - (CY + HA[1]), 640 - (CX + HA[0])) - kick * 0.45;
    revolver(ctx, c, HA[0] + 8, HA[1] - 4, ang, kick);
  }
  ctx.fillStyle = c(C.claw);
  ctx.beginPath(); ctx.ellipse(HA[0] + 6, HA[1] + (raised ? 2 : 10), 13, 12, 0, 0, TAU); ctx.fill();
}

function revolver(ctx, c, x, y, ang, kick) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(0.95, 1);
  ctx.fillStyle = c(C.grip);
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-16, 12, -14, 24); ctx.lineTo(-4, 24); ctx.quadraticCurveTo(-4, 12, 4, 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c(C.metal);
  rrect(ctx, -6, -9, 26, 13, 3); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-14, -16); ctx.lineTo(-9, -17); ctx.lineTo(-1, -9); ctx.fill();
  rrect(ctx, 2, -12, 16, 17, 5); ctx.fill();
  ctx.fillRect(18, -8, 36, 7);
  ctx.fillRect(18, -2, 24, 3);
  ctx.fillRect(50, -11, 3, 3);
  ctx.fillStyle = c(C.metalL);
  ctx.fillRect(18, -8, 36, 1.6);
  ctx.fillRect(4, -11, 12, 1.6);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(15, -7); ctx.moveTo(5, -2); ctx.lineTo(15, -2); ctx.stroke();
  ctx.restore();
  // the flash, and smoke after it
  const mx = x + Math.cos(ang) * 56 * 0.95 - Math.sin(ang) * -5;
  const my = y + Math.sin(ang) * 56 * 0.95 + Math.cos(ang) * -5;
  if (kick > 0.7) {
    const f = (kick - 0.7) / 0.3;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(FX.bloom, -60 * f, -60 * f, 120 * f, 120 * f);
    ctx.fillStyle = 'rgba(255,236,170,0.95)';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, r = (i % 2 ? 7 : i === 0 ? 46 : 20) * f; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.7); }
    ctx.fill();
    ctx.restore();
  } else if (kick > 0) {
    ctx.globalAlpha = kick * 0.5;
    const r = 20 + (1 - kick) * 40;
    ctx.drawImage(FX.smoke, mx - r + (1 - kick) * 20, my - r - (1 - kick) * 30, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
}

function holster(ctx, c, aim) {
  ctx.fillStyle = c(C.leather);
  ctx.fillRect(84, -16, 42, 12);
  ctx.fillStyle = c(C.brass);
  for (let i = 0; i < 5; i++) ctx.fillRect(88 + i * 7.5, -15, 4, 9);
  ctx.fillStyle = c(C.leather);
  ctx.beginPath(); ctx.moveTo(104, -6); ctx.lineTo(128, -8); ctx.lineTo(134, 72); ctx.quadraticCurveTo(124, 80, 114, 72); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (aim < 0.5) {
    ctx.fillStyle = c(C.grip);
    ctx.beginPath(); ctx.moveTo(108, -6); ctx.quadraticCurveTo(100, -22, 106, -34); ctx.lineTo(116, -32); ctx.quadraticCurveTo(114, -20, 122, -8); ctx.fill();
  }
}

// ================================================================ drawing

const PT = { x: 0, y: 0 };

/** A long shadow cast away from the sun by something standing `row` px under the horizon at bearing a. */
function longShadow(ctx, g, a, row, hz, height, width, alpha) {
  if (row < 2) return;
  const yaw = camYaw(g);
  const r = CAM_H / Math.tan(row / PX_PER_RAD);
  const px = Math.sin(a) * r, pz = Math.cos(a) * r;
  const len = Math.min(height / Math.tan(SUN_ELEV), 26);
  const dx = Math.sin(SUN_A + PI), dz = Math.cos(SUN_A + PI);
  const nx = -dz, nz = dx;
  ctx.beginPath();
  const pts = [[0, -0.5], [0.35, -0.45], [0.78, -0.5], [0.9, -0.62], [1, 0], [0.9, 0.62], [0.78, 0.5], [0.35, 0.45], [0, 0.5]];
  for (const [u, w] of pts) {
    const qx = px + dx * len * u + nx * width * w, qz = pz + dz * len * u + nz * width * w;
    const rel = wrap(bearing(qx, qz) - yaw);
    if (Math.abs(rel) > 2.2) return;
    ctx.lineTo(W / 2 + rel * PX_PER_RAD, hz + rowOf(Math.hypot(qx, qz)));
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(52,26,40,${alpha})`;
  ctx.fill();
}

function drawPoles(ctx, g, hz, k) {
  const yaw = camYaw(g);
  const lim = HALF_FOV + 0.35;
  // wires
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = k > 0.5 ? 'rgba(40,24,20,0.85)' : 'rgba(46,34,30,0.75)';
  ctx.beginPath();
  for (const w of NEAR.wires) {
    let vis = false, bad = false;
    for (let i = 0; i < w.length; i += 2) {
      const rel = Math.abs(wrap(w[i] - yaw));
      if (rel > 2.3) { bad = true; break; }
      if (rel < lim) vis = true;
    }
    if (bad || !vis) continue;
    for (let i = 0; i < w.length; i += 2) {
      const x = W / 2 + wrap(w[i] - yaw) * PX_PER_RAD, y = hz + w[i + 1];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  // poles, far first
  for (let i = NEAR.poles.length - 1; i >= 0; i--) drawPole(ctx, NEAR.poles[i], yaw, hz, k, lim);
}

function drawPole(ctx, p, yaw, hz, k, lim) {
  const rel = wrap(p.a - yaw);
  if (Math.abs(rel) > lim) return;
  const x = W / 2 + rel * PX_PER_RAD;
  const m = PX_PER_RAD / p.r;
  const y0 = hz + p.row0, y1 = hz + p.row1;
  const w0 = Math.max(1.2, 0.26 * m), w1 = Math.max(1, 0.18 * m);
  ctx.fillStyle = tone(C.pole, k);
  ctx.beginPath(); ctx.moveTo(x - w0 / 2, y0); ctx.lineTo(x - w1 / 2, y1); ctx.lineTo(x + w1 / 2, y1); ctx.lineTo(x + w0 / 2, y0); ctx.fill();
  const side = Math.sin(wrap(SUN_A - p.a)) > 0 ? 1 : -1;
  ctx.fillStyle = k > 0.5 ? 'rgba(255,200,130,0.45)' : 'rgba(255,210,160,0.22)';
  ctx.fillRect(x + (side > 0 ? w1 * 0.1 : -w1 * 0.5), y1, w1 * 0.4, y0 - y1);
  const ax0 = W / 2 + wrap(p.arm0.a - yaw) * PX_PER_RAD, ax1 = W / 2 + wrap(p.arm1.a - yaw) * PX_PER_RAD;
  ctx.strokeStyle = tone(C.pole, k);
  ctx.lineWidth = Math.max(1, 0.13 * m);
  ctx.beginPath(); ctx.moveTo(ax0, hz + p.arm0.row); ctx.lineTo(ax1, hz + p.arm1.row); ctx.stroke();
  if (m > 6) {
    ctx.fillStyle = tone(C.glass, k);
    for (let i = 0; i < 3; i++) {
      const u = 0.1 + i * 0.4;
      ctx.beginPath(); ctx.arc(lerp(ax0, ax1, u), lerp(hz + p.arm0.row, hz + p.arm1.row, u) - 0.1 * m, Math.max(1, 0.06 * m), 0, TAU); ctx.fill();
    }
  }
}

function drawFence(ctx, g, hz, k) {
  const yaw = camYaw(g);
  const lim = HALF_FOV + 0.3;
  const f = NEAR.fence;
  ctx.strokeStyle = tone(C.wood, k);
  ctx.lineCap = 'butt';
  for (let i = f.length - 1; i > 0; i--) {
    const p = f[i], q = f[i - 1];
    const rp = wrap(p.a - yaw), rq = wrap(q.a - yaw);
    if ((Math.abs(rp) > lim && Math.abs(rq) > lim) || Math.abs(rp - rq) > 1) continue;
    const xp = W / 2 + rp * PX_PER_RAD, xq = W / 2 + rq * PX_PER_RAD;
    if (!p.broken) {
      ctx.lineWidth = Math.max(1, (0.1 * PX_PER_RAD) / p.r);
      ctx.beginPath(); ctx.moveTo(xp, hz + p.rail0); ctx.lineTo(xq, hz + q.rail0); ctx.moveTo(xp, hz + p.rail1); ctx.lineTo(xq, hz + q.rail1); ctx.stroke();
    } else {
      ctx.lineWidth = Math.max(1, (0.1 * PX_PER_RAD) / p.r);
      ctx.beginPath(); ctx.moveTo(xp, hz + p.rail1); ctx.lineTo(lerp(xp, xq, 0.6), hz + lerp(p.rail1, q.row0, 0.8)); ctx.stroke();
    }
    ctx.fillStyle = tone(C.wood, k);
    const w = Math.max(1.5, (0.16 * PX_PER_RAD) / p.r);
    ctx.fillRect(xp - w / 2, hz + p.row1, w, p.row0 - p.row1);
  }
}

function drawTumbleweeds(ctx, g, t, hz) {
  const yaw = camYaw(g);
  for (let i = 0; i < 2; i++) {
    const period = 14 + i * 5;
    const u = ((t + i * 7.3) % period) / period;
    const [sx, sz] = trailPt(10 + i * 14, -26 + i * 8);
    const [ex, ez] = trailPt(4 + i * 9, 30);
    const wx = lerp(sx, ex, u), wz = lerp(sz, ez, u);
    const r = Math.hypot(wx, wz);
    const rel = wrap(bearing(wx, wz) - yaw);
    if (Math.abs(rel) > HALF_FOV + 0.2) continue;
    const bounce = Math.abs(Math.sin(u * PI * 9)) * 0.5;
    const R = 0.42;
    const m = PX_PER_RAD / r;
    const x = W / 2 + rel * PX_PER_RAD, y = hz + rowOf(r, R + bounce);
    ctx.fillStyle = 'rgba(40,24,30,0.3)';
    ctx.beginPath(); ctx.ellipse(x, hz + rowOf(r), R * m * (1.2 - bounce), R * m * 0.2, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u * 40);
    ctx.drawImage(FX.weed, -R * m, -R * m, R * m * 2, R * m * 2);
    ctx.restore();
  }
}

function drawHorse(ctx, g, t, hz) {
  const rel = wrap(HORSE.a - camYaw(g));
  if (Math.abs(rel) > HALF_FOV + 0.3) return;
  const x = W / 2 + rel * PX_PER_RAD;
  const y = hz + rowOf(HORSE.r);
  const m = (1.55 * PX_PER_RAD) / HORSE.r;
  longShadow(ctx, g, HORSE.a, rowOf(HORSE.r), hz, 1.6, 0.9, 0.3);
  const graze = 0.5 + 0.5 * Math.sin(t * 0.21);
  drawHorseSide(ctx, x, y, m, backOf(HORSE.a), t, { graze: smoothstep(0.3, 0.7, graze) });
}

function drawSmoke(ctx, g, t, hz) {
  const rel = wrap(FIRE.a - camYaw(g));
  if (Math.abs(rel) > HALF_FOV + 0.4) return;
  const x = W / 2 + rel * PX_PER_RAD;
  const m = PX_PER_RAD / FIRE.r;
  const y = hz + rowOf(FIRE.r);
  for (let i = 0; i < 14; i++) {
    const u = (t * 0.09 + i / 14) % 1;
    const sz = (0.5 + u * 3.2) * m;
    ctx.globalAlpha = (1 - u) * 0.28 * Math.min(1, u * 6);
    ctx.drawImage(FX.smoke, x + u * u * 7 * m - sz / 2 + Math.sin(u * 7 + i) * 0.3 * m, y - u * 16 * m - sz / 2 - 0.6 * m, sz, sz);
  }
  ctx.globalAlpha = 1;
  // the fire
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(FX.bloom, x - 1.6 * m, y - 1.9 * m, 3.2 * m, 3.2 * m);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffb040';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const fx = x + (i - 1) * 0.16 * m, fh = (0.45 + 0.2 * Math.sin(t * 13 + i * 2)) * m;
    ctx.moveTo(fx - 0.12 * m, y - 0.05 * m); ctx.quadraticCurveTo(fx, y - fh * 0.3, fx + Math.sin(t * 9 + i) * 0.05 * m, y - fh); ctx.quadraticCurveTo(fx + 0.02 * m, y - fh * 0.3, fx + 0.12 * m, y - 0.05 * m);
  }
  ctx.fill();
  ctx.fillStyle = '#3a2a1e';
  ctx.fillRect(x - 0.35 * m, y - 0.08 * m, 0.7 * m, 0.08 * m);
}

function drawBirds(ctx, g, t, hz) {
  const cx = bearingX(g, SUN_A - 0.42);
  if (cx < -200 || cx > W + 200) return;
  ctx.strokeStyle = 'rgba(38,24,28,0.8)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const ph = t * 0.22 + i * 2.1;
    const x = cx + Math.cos(ph) * (60 + i * 18), y = hz - 250 - i * 16 + Math.sin(ph) * 16;
    const s = 11 - i * 1.5, flap = Math.sin(t * 2 + i) * 0.25;
    ctx.moveTo(x - s * 1.4, y - s * (0.2 + flap)); ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.55, x, y); ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.55, x + s * 1.4, y - s * (0.2 + flap));
  }
  ctx.stroke();
}

function drawTufts(ctx, g, t, hz, k) {
  const yaw = camYaw(g);
  const lim = HALF_FOV + 0.08;
  const wind = Math.sin(t * 1.3) * 0.06 + Math.sin(t * 3.1) * 0.02;
  // rocks first
  for (const r of NEAR.rocks) {
    const rel = wrap(r.a - yaw);
    if (Math.abs(rel) > lim) continue;
    const x = W / 2 + rel * PX_PER_RAD, y = hz + r.row, s = r.size * r.m;
    if (y - s > H) continue;
    ctx.fillStyle = 'rgba(40,24,30,0.3)';
    ctx.beginPath(); ctx.ellipse(x + s * 0.6, y, s * 1.4, s * 0.25, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = tone(C.pole, k * 0.8);
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.3, s, s * 0.5, 0, PI, TAU); ctx.lineTo(x + s, y); ctx.lineTo(x - s, y); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,160,0.3)';
    ctx.beginPath(); ctx.ellipse(x - s * 0.2, y - s * 0.62, s * 0.55, s * 0.15, 0, 0, TAU); ctx.fill();
  }
  for (let pass = 0; pass < 3; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(92,72,40,0.95)' : pass === 1 ? 'rgba(176,142,82,0.95)' : (k > 0.5 ? 'rgba(255,214,140,0.9)' : 'rgba(250,214,150,0.75)');
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const tu of NEAR.tufts) {
      const rel = wrap(tu.a - yaw);
      if (Math.abs(rel) > lim) continue;
      const x = W / 2 + rel * PX_PER_RAD, y = hz + tu.row;
      if (y > H + 40) continue;
      const len = 0.42 * tu.m;
      for (let j = 0; j < tu.n; j++) {
        if ((j % 3 === 0) !== (pass === 0) && pass < 2) continue;
        const h = len * (0.55 + 0.6 * hash(tu.seed * 7 + j));
        const lean = (hash(tu.seed * 3 + j) - 0.5) * 0.9 + wind * (1 + hash(j + tu.seed));
        const bx = x + (j - tu.n / 2) * 0.03 * tu.m;
        const tx = bx + lean * h, ty = y - h;
        if (pass === 2) { ctx.moveTo(lerp(bx, tx, 0.7), lerp(y, ty, 0.7)); ctx.lineTo(tx, ty); } else { ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + lean * h * 0.2, y - h * 0.6, tx, ty); }
      }
    }
    ctx.lineWidth = pass === 2 ? 1.6 : 2.2;
    ctx.stroke();
  }
}

function drawMotes(ctx, g, t, back) {
  const glow = 0.25 + 0.75 * back;
  const yaw = camYaw(g);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,220,160,${(0.3 * glow).toFixed(3)})`;
  ctx.beginPath();
  for (let i = 0; i < 46; i++) {
    const span = W + 200;
    let x = (hash(i * 1.7) * span - yaw * PX_PER_RAD * 1.1 + t * (8 + hash(i * 2.9) * 14)) % span;
    if (x < 0) x += span;
    x -= 100;
    const y = 120 + hash(i * 3.3) * 520 + Math.sin(t * 0.6 + i) * 12;
    const r = 1 + hash(i * 5.1) * 2.2;
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function drawSunFx(ctx, g, t, hz, pass) {
  const x = bearingX(g, SUN_A), y = hz - SUN_ROW;
  const vis = clamp01(1 - (Math.abs(x - W / 2) - W / 2) / 500);
  if (vis <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (pass === 0) {
    ctx.globalAlpha = 0.22 * vis;
    ctx.translate(x, y);
    ctx.rotate(t * 0.01);
    ctx.drawImage(FX.rays, -700, -700, 1400, 1400);
  } else {
    ctx.globalAlpha = 0.5 * vis;
    ctx.drawImage(FX.bloom, x - 300, y - 300, 600, 600);
    // faint ghosts along the line through the centre
    ctx.globalAlpha = 0.07 * vis;
    for (let i = 1; i <= 4; i++) {
      const u = 0.4 + i * 0.35;
      const gx = lerp(x, W / 2, u), gy = lerp(y, H / 2, u), gr = 14 + i * 12;
      ctx.drawImage(FX.bloom, gx - gr, gy - gr, gr * 2, gr * 2);
    }
  }
  ctx.restore();
}

function drawFoes(ctx, g, t, hz, near) {
  const en = enemyOnScreen(g);
  const e = en?.e;
  const bigLoom = !!(e && e.loom && e.grow > 0.4);
  S.mark.on = false;
  if (!near) {
    if (S.corpse) drawCorpse(ctx, g, t, hz, S.corpse);
    if (S.killer && g.dead && !S.killer.loom) drawStanding(ctx, g, t, hz, S.killer);
  }
  if (!en || bigLoom !== near) return;
  const k = backOf(e.bearing);
  if (e.loom) {
    const s = en.s * 0.95;
    const ground = en.y + 1.22 * s;
    const phase = g.clock * 9;
    const firing = hash(Math.floor(g.clock * 5) + 0.3) > 0.55 && (g.clock * 5) % 1 < 0.35;
    // dust thrown up behind them
    for (let i = 0; i < 16; i++) {
      const u = (g.clock * 0.9 + i / 16) % 1;
      const dx = (hash(i * 3.3) - 0.5) * s * 2.4, sz = s * (0.3 + u * 0.8);
      ctx.globalAlpha = (1 - u) * 0.35;
      ctx.drawImage(FX.dust, en.x + dx - sz / 2, ground - sz * 0.6 - u * s * 0.4, sz, sz);
    }
    ctx.globalAlpha = 1;
    // two more riders at its flanks
    for (const side of [-1, 1]) {
      const fs = s * 0.8;
      drawCharger(ctx, en.x + side * s * 0.95, ground - s * 0.18, fs, S.style, k, 0, phase + side * 1.7, false);
    }
    drawCharger(ctx, en.x, ground, s, S.style, k, e.hitFlash, phase, firing);
    S.mark.on = true; S.mark.loom = true; S.mark.x = en.x; S.mark.foot = ground; S.mark.hh = s;
    return;
  }
  const hh = en.s * 1.3;
  const foot = en.y + 0.64 * hh;
  longShadow(ctx, g, e.bearing, foot - hz, hz, 1.8, 0.55, 0.3);
  const fire = hash(Math.floor(g.clock * 2.6) + S.seed * 10) > 0.55 && (g.clock * 2.6) % 1 < 0.14;
  drawOutlaw(ctx, en.x, foot, hh, S.style, k, e.hitFlash, { rot: -e.hitFlash * 0.07 * (S.seed > 0.5 ? 1 : -1) });
  if (fire && !g.dead) muzzle(ctx, en.x + 0.222 * hh, foot - 0.684 * hh, hh * 0.3);
  if (S.style.cover) drawCover(ctx, en.x, foot + 2, hh, S.style.cover, k);
  if (e.hitFlash > 0.25) {
    ctx.fillStyle = `rgba(150,20,14,${(e.hitFlash * 0.8).toFixed(3)})`;
    for (let i = 0; i < 7; i++) {
      const a = hash(i * 3.1 + g.clock * 7) * TAU, d = hash(i * 1.7 + g.clock * 5) * hh * 0.08 * (1.4 - e.hitFlash);
      ctx.beginPath(); ctx.arc(en.x + Math.cos(a) * d, foot - 0.68 * hh + Math.sin(a) * d * 0.6, hh * 0.008 + 1, 0, TAU); ctx.fill();
    }
  }
  S.mark.on = true; S.mark.loom = false; S.mark.x = en.x; S.mark.foot = foot; S.mark.hh = hh;
}

function muzzle(ctx, x, y, s) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(FX.bloom, x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = 'rgba(255,236,170,0.95)';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = (i % 2 ? 0.12 : 0.4) * s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.fill();
  ctx.restore();
}

function footOf(snapRow, hz) { return hz + snapRow; }

function drawStanding(ctx, g, t, hz, who) {
  const hh = who.size * W * 1.3;
  const x = bearingX(g, who.bearing);
  if (x < -hh || x > W + hh) return;
  const foot = footOf(who.row, hz);
  drawOutlaw(ctx, x, foot, hh, who.style, backOf(who.bearing), 0, { drop: 0.5 });
}

function drawCorpse(ctx, g, t, hz, cp) {
  const dt = g.clock - cp.at;
  const x = bearingX(g, cp.bearing);
  const hh = cp.size * W * (cp.loom ? 0.95 : 1.3);
  if (x < -hh * 1.5 || x > W + hh * 1.5) return;
  const foot = footOf(cp.row, hz);
  const fall = smooth(clamp01((dt - 0.08) / 0.55));
  const fade = clamp01((6 - dt) / 1);
  ctx.globalAlpha = fade;
  if (cp.loom) {
    // the riders go down in their own dust
    ctx.globalAlpha = fade * clamp01(1 - dt * 0.8);
    ctx.drawImage(FX.dust, x - hh, foot - hh * 1.2, hh * 2, hh * 1.4);
    ctx.globalAlpha = 1;
    return;
  }
  const k = backOf(cp.bearing);
  longShadow(ctx, g, cp.bearing, foot - hz, hz, 1.8 * (1 - fall * 0.85), 0.55, 0.3 * (1 - fall * 0.5));
  drawOutlaw(ctx, x, foot, hh, cp.style, k, clamp01(1 - dt * 4), { rot: cp.dir * fall * (PI / 2) * 0.96, hat: false, drop: fall });
  // the hat, knocked off and rolling
  const hu = clamp01(dt / 0.8);
  if (cp.style.hat !== 'sack') {
    const hx = x + cp.dir * (0.1 + hu * 0.5) * hh, hy = foot - hh * (0.95 - hu * 0.95) - Math.sin(hu * PI) * hh * 0.3;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(cp.dir * hu * 3);
    ctx.scale(hh, hh);
    ctx.translate(0, 0.95);
    outlawHat(ctx, cp.style, (p) => tone(p, k));
    ctx.restore();
  }
  // dust where he lands
  if (dt > 0.5 && dt < 1.6) {
    const u = (dt - 0.5) / 1.1;
    ctx.globalAlpha = fade * (1 - u) * 0.6;
    const sz = hh * (0.4 + u * 0.6);
    ctx.drawImage(FX.dust, x + cp.dir * hh * 0.5 - sz / 2, foot - sz * 0.55, sz, sz * 0.7);
  }
  ctx.globalAlpha = 1;
}

// ==================================================================== play

function play(ctx, g, t) {
  ensureWorld();
  step(g);
  const yaw = camYaw(g);
  const pitch = g.view?.pitch ?? 0;
  const hz = HZ0 + pitch * PX_PER_RAD;
  const k = backOf(yaw);
  const rel = wrap(SUN_A - yaw);
  const into = Math.max(0, sunF(yaw));
  const rimR = clamp01(into * 0.7 + Math.max(0, Math.sin(rel)) * 0.6 * (1 - into));
  const rimL = clamp01(into * 0.7 + Math.max(0, -Math.sin(rel)) * 0.6 * (1 - into));
  if (g.enemy) S.snap.row = enemyRow(g, hz);
  ctx.save();
  if (g.dead) {
    const d = smooth(clamp01(g.dead.t / 1.4));
    ctx.translate(W / 2, H / 2 + d * 30);
    ctx.rotate(-0.17 * d);
    ctx.scale(1 + 0.26 * d, 1 + 0.26 * d);
    ctx.translate(-W / 2, -H / 2);
  }
  drawPano(ctx, WORLD.sky, yaw, hz);
  drawPano(ctx, WORLD.ground, yaw, hz);
  drawPano(ctx, WORLD.land, yaw, hz);
  drawBirds(ctx, g, t, hz);
  drawSmoke(ctx, g, t, hz);
  drawSunFx(ctx, g, t, hz, 0);
  // the fly's own long shadow, stretching ahead when the sun is behind it
  longShadow(ctx, g, yaw - 0.24, rowOf(3), hz, 1.85, 0.62, 0.32);
  drawFence(ctx, g, hz, k);
  drawPoles(ctx, g, hz, k);
  drawTumbleweeds(ctx, g, t, hz);
  drawFoes(ctx, g, t, hz, false);
  drawHorse(ctx, g, t, hz);
  drawFoes(ctx, g, t, hz, true);
  drawTufts(ctx, g, t, hz, k);
  drawMotes(ctx, g, t, into);
  drawCowboy(ctx, g, t, k, rimL, rimR);
  drawSunFx(ctx, g, t, hz, 1);
  ctx.drawImage(FX.vignette, 0, 0);
  ctx.restore();
  if (S.eye > 0.01 && !g.dead) drawDeadEye(ctx, g, t);
  const m = g.match;
  if (g.phase === 'playing' || g.phase === 'rage-quit') {
    if (g.dead) drawDeath(ctx, g, t);
    else drawHud(ctx, g, t, m);
  }
}

function enemyRow(g, hz) {
  const en = enemyOnScreen(g);
  if (!en) return 0;
  return en.e.loom ? en.y + 1.22 * en.s * 0.95 - hz : en.y + 0.64 * en.s * 1.3 - hz;
}

// ================================================================ Dead Eye

function drawDeadEye(ctx, g, t) {
  const k = S.eye;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `rgba(128,128,128,${(0.8 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(255,196,110,${(0.8 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(110,70,16,${(0.25 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // the heartbeat
  const beat = Math.pow(Math.max(0, Math.sin(g.clock * 7.5)), 12);
  ctx.globalAlpha = k * (0.85 + 0.15 * beat);
  ctx.drawImage(FX.eye, 0, 0);
  ctx.globalAlpha = 1;
  ctx.restore();
  // marks painted on the target, one more as the target weakens
  const e = g.enemy;
  if (!S.mark.on || !e) return;
  const n = Math.min(5, 1 + Math.floor((1 - e.hp) * 4.6));
  const pts = S.mark.loom ? LOOM_MARKS : MARKS;
  for (let i = 0; i < n; i++) {
    const [mx, my] = pts[i];
    const x = S.mark.x + mx * S.mark.hh, y = S.mark.foot + my * S.mark.hh;
    const born = clamp01((1 - e.hp) * 4.6 - (i - 1));
    const s = Math.max(9, S.mark.hh * 0.035) * (1 + (1 - smooth(born)) * 0.8);
    drawX(ctx, x, y, s, k);
  }
}

const MARKS = [[0, -0.875], [-0.03, -0.71], [0.05, -0.66], [-0.02, -0.56], [0.1, -0.74]];
const LOOM_MARKS = [[0, -1.36], [0.02, -1.16], [0.22, -1.1], [-0.04, -0.94], [0.06, -0.72]];

function drawX(ctx, x, y, s, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = k;
  for (const [ang, lw] of [[0.78, 1], [-0.78, 0.9]]) {
    ctx.save();
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(20,0,0,0.6)';
    ctx.beginPath(); ctx.ellipse(1.2, 1.2, s, s * 0.2 * lw, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d4190f';
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.32 * lw, s, -s * 0.05); ctx.quadraticCurveTo(0, s * 0.2 * lw, -s, 0); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ================================================================== death

function drawDeath(ctx, g, t) {
  const d = g.dead;
  const k = clamp01(d.t / 0.45);
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `rgba(128,128,128,${k.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(150,150,150,${(0.55 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay';
  if (!FX.grainPattern) FX.grainPattern = ctx.createPattern(FX.grain, 'repeat');
  ctx.globalAlpha = 0.22 * k;
  const ox = Math.floor(hash(Math.floor(t * 24)) * 256), oy = Math.floor(hash(Math.floor(t * 24) + 0.5) * 256);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = FX.grainPattern;
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = k;
  ctx.drawImage(FX.death, 0, 0);
  const tk = smooth(clamp01((d.t - 0.4) / 0.7));
  ctx.globalAlpha = tk * 0.9;
  ctx.drawImage(FX.ink, W / 2 - 520, 256, 1040, 150);
  ctx.globalAlpha = tk;
  title(ctx, 'You Died', W / 2, 352, 84, '#efe9dc', 0.14);
  const cause = d.cause === 'explode' ? 'Blown to pieces' : `Shot by ${article(d.by)}`;
  ctx.font = `italic 400 22px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,214,200,0.9)';
  ctx.fillText(cause, W / 2, 440);
  ctx.restore();
}

const article = (name) => (name === 'Bounty' ? 'a bounty' : /^[AEIOU]/.test(name) || name.startsWith("O'") ? `an ${name}` : `a ${name}`);

function title(ctx, s, x, y, size, color, spacing = 0.1, { caps = true, weight = 400, shadow = true, align = 'center' } = {}) {
  ctx.font = `${caps ? 'small-caps ' : ''}${weight} ${size}px ${SERIF}`;
  const sp = 'letterSpacing' in ctx;
  if (sp) ctx.letterSpacing = `${Math.round(size * spacing)}px`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const dx = sp && align === 'center' ? Math.round(size * spacing) / 2 : 0;
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x + dx + 2, y + 3); }
  ctx.fillStyle = color;
  ctx.fillText(s, x + dx, y);
  if (sp) ctx.letterSpacing = '0px';
}

// ==================================================================== HUD

const MM = { x: 122, y: 604, r: 84 };

function drawHud(ctx, g, t, m) {
  const yaw = camYaw(g);
  drawMinimap(ctx, g, t, yaw);
  drawCores(ctx, g, t, m);
  drawAmmo(ctx, g, t);
  drawReticle(ctx, g, t);
  drawPrompts(ctx, g, t);
  drawObjective(ctx, g, t, m);
  drawHonor(ctx, g, t);
  drawTitleCard(ctx, g, t, m);
}

function drawMinimap(ctx, g, t, yaw) {
  const { x, y, r } = MM;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.translate(x, y);
  ctx.save();
  ctx.rotate(-yaw);
  ctx.globalAlpha = 0.88;
  ctx.drawImage(FX.map, -MAP_SIZE / 2, -MAP_SIZE / 2);
  ctx.restore();
  ctx.globalAlpha = 1;
  // what the fly can see, a pale cone
  ctx.fillStyle = 'rgba(255,248,230,0.07)';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -PI / 2 - HALF_FOV, -PI / 2 + HALF_FOV); ctx.closePath(); ctx.fill();
  // the horse
  const hr = HORSE.r / MAP_M * 2.2, ha = wrap(HORSE.a - yaw);
  horseGlyph(ctx, Math.sin(ha) * hr, -Math.cos(ha) * hr);
  // enemies
  const e = g.enemy;
  if (e) {
    const dist = e.loom ? lerp(70, 4, e.grow) : 16;
    const rel = wrap(e.bearing - yaw);
    const n = e.loom ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const rr = (dist + i * 3) / MAP_M * 2.2, aa = rel + (i - (n - 1) / 2) * 0.35;
      const ex = Math.sin(aa) * rr, ey = -Math.cos(aa) * rr;
      ctx.fillStyle = 'rgba(200,30,20,0.35)';
      ctx.beginPath(); ctx.arc(ex, ey, 6 + ((g.clock * 2) % 1) * 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d42a1c';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
  // the fly
  ctx.fillStyle = '#f4efe2';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  // darker toward the rim
  ctx.restore();
  ctx.save();
  const edge = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = edge;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(10,8,6,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,232,214,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, TAU); ctx.stroke();
  // north
  const na = wrap(NORTH_A - yaw);
  const nx = x + Math.sin(na) * (r + 1), ny = y - Math.cos(na) * (r + 1);
  ctx.fillStyle = 'rgba(12,10,8,0.85)';
  ctx.beginPath(); ctx.arc(nx, ny, 10, 0, TAU); ctx.fill();
  ctx.font = `700 12px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4efe2';
  ctx.fillText('N', nx, ny + 1);
  ctx.restore();
}

function horseGlyph(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#f4efe2';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3, 5); ctx.lineTo(-4, -1); ctx.lineTo(-1, -5); ctx.lineTo(0, -8); ctx.lineTo(1.5, -5); ctx.lineTo(5, -2); ctx.lineTo(4, 0); ctx.lineTo(1, -1); ctx.lineTo(2, 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawCores(ctx, g, t, m) {
  const hp = clamp01((m?.hp ?? 100) / 100);
  const cores = [
    [-1.76, hp, 0.9, 'heart', hp < 0.3],
    [-1.18, S.stamina, 0.8, 'bolt', false],
    [-0.6, S.eyeMeter, 0.9, 'eye', false],
  ];
  for (const [a, bar, fill, icon, low] of cores) {
    const x = MM.x + Math.cos(a) * (MM.r + 26), y = MM.y + Math.sin(a) * (MM.r + 26);
    core(ctx, x, y, bar, fill, icon, low, icon === 'eye' && S.eye > 0.3, g.clock);
  }
}

function core(ctx, x, y, bar, fill, icon, low, hot, clock) {
  const R = 17;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = low ? `rgba(220,50,36,${(0.6 + 0.4 * Math.sin(clock * 10)).toFixed(3)})` : hot ? '#f2c64e' : '#f1ece0';
  ctx.beginPath(); ctx.arc(x, y, R, -PI / 2, -PI / 2 + TAU * clamp01(bar)); ctx.stroke();
  ctx.fillStyle = 'rgba(14,11,9,0.78)';
  ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 12.5, 0, TAU); ctx.clip();
  ctx.fillStyle = hot ? 'rgba(242,198,78,0.45)' : 'rgba(170,160,144,0.4)';
  ctx.fillRect(x - 13, y + 13 - 26 * fill, 26, 26 * fill);
  ctx.restore();
  ctx.fillStyle = hot ? '#ffe39a' : '#f1ece0';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  if (icon === 'heart') {
    ctx.moveTo(x, y + 6);
    ctx.bezierCurveTo(x - 9, y - 1, x - 6, y - 8, x, y - 3);
    ctx.bezierCurveTo(x + 6, y - 8, x + 9, y - 1, x, y + 6);
    ctx.fill();
  } else if (icon === 'bolt') {
    ctx.moveTo(x + 2, y - 8); ctx.lineTo(x - 5, y + 1); ctx.lineTo(x, y + 1); ctx.lineTo(x - 2, y + 8); ctx.lineTo(x + 5, y - 1); ctx.lineTo(x, y - 1); ctx.closePath();
    ctx.fill();
  } else {
    ctx.moveTo(x - 9, y); ctx.quadraticCurveTo(x, y - 8, x + 9, y); ctx.quadraticCurveTo(x, y + 8, x - 9, y);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
  }
}

function drawAmmo(ctx, g, t) {
  const since = g.clock - S.shotAt;
  const a = 0.5 + 0.5 * Math.max(S.aim, since < 3 ? 1 - since / 3 : 0);
  ctx.save();
  ctx.globalAlpha = a;
  const cx = W - 72, cy = 60;
  // the cylinder, seen end on: loaded chambers brass
  ctx.fillStyle = 'rgba(12,10,8,0.7)';
  ctx.beginPath(); ctx.arc(cx, cy, 25, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(240,232,214,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const reloading = S.cyl === 0;
  const spin = reloading ? (g.clock - S.reloadAt) * 8 : (6 - S.cyl) * (TAU / 6);
  for (let i = 0; i < 6; i++) {
    const an = spin + (i / 6) * TAU - PI / 2;
    const px = cx + Math.cos(an) * 14, py = cy + Math.sin(an) * 14;
    const loaded = i < S.cyl;
    ctx.fillStyle = loaded ? '#d8b25a' : 'rgba(0,0,0,0.8)';
    ctx.beginPath(); ctx.arc(px, py, 5.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = loaded ? '#7a5a22' : 'rgba(240,232,214,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (loaded) { ctx.fillStyle = '#9a7a3a'; ctx.beginPath(); ctx.arc(px, py, 1.6, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = '#1a1612';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
  // the reserve, and the gun's name
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 30px ${SERIF}`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(String(S.reserve), cx - 38, cy + 12);
  ctx.fillStyle = '#f1ece0';
  ctx.fillText(String(S.reserve), cx - 40, cy + 10);
  ctx.font = `small-caps 400 15px ${SERIF}`;
  ctx.fillStyle = 'rgba(241,236,224,0.8)';
  ctx.fillText(reloading ? 'reloading…' : 'Cattleman Revolver', cx - 40, cy - 16);
  ctx.restore();
}

function drawReticle(ctx, g, t) {
  const e = g.enemy;
  const on = e && Math.abs(e.err) < e.size * HALF_FOV * 0.5 && e.grow > 0.25;
  const x = W / 2, y = H / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = on ? '#d8321e' : '#f4efe2';
  ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
  // a hit, a kill
  const hit = e ? e.hitFlash : 0;
  const kill = clamp01(1 - (g.clock - S.killAt) / 0.5);
  if (hit > 0.3 || kill > 0) {
    ctx.strokeStyle = kill > 0 ? `rgba(214,40,28,${kill.toFixed(3)})` : `rgba(244,239,226,${hit.toFixed(3)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(x + sx * 7, y + sy * 7); ctx.lineTo(x + sx * 14, y + sy * 14); }
    ctx.stroke();
  }
}

function drawPrompts(ctx, g, t) {
  const e = g.enemy;
  const rows = S.eye > 0.3 ? [['LMB', 'Paint targets'], ['E', 'Leave Dead Eye']]
    : e ? (e.loom ? [['SHIFT', 'Dive'], ['LMB', 'Shoot']] : [['E', 'Dead Eye'], ['LMB', 'Shoot'], ['RMB', 'Aim']])
      : [['H', 'Whistle for horse'], ['SHIFT', 'Sprint'], ['TAB', 'Weapon wheel']];
  let y = H - 34;
  ctx.textBaseline = 'middle';
  for (let i = rows.length - 1; i >= 0; i--) {
    const [key, label] = rows[i];
    ctx.font = `400 17px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, W - 30 + 1, y + 1);
    ctx.fillStyle = '#f1ece0';
    ctx.fillText(label, W - 30, y);
    const lw = ctx.measureText(label).width;
    ctx.font = `700 12px ${SANS}`;
    const kw = Math.max(24, ctx.measureText(key).width + 12);
    const kx = W - 30 - lw - 12 - kw;
    rrect(ctx, kx, y - 12, kw, 24, 4);
    ctx.fillStyle = 'rgba(244,239,226,0.92)';
    ctx.fill();
    ctx.fillStyle = '#16120e';
    ctx.textAlign = 'center';
    ctx.fillText(key, kx + kw / 2, y + 1);
    y -= 34;
  }
}

function drawObjective(ctx, g, t, m) {
  if ((m?.t ?? 99) < 4.8) return;
  const e = g.enemy;
  const gang = gangOf(e?.name ?? S.snap.name ?? "O'Driscoll").plural;
  const parts = e ? (e.loom ? ['Survive the ', 'ambush', '.'] : ['Kill the ', gang, '.'])
    : S.corpse && g.clock - S.corpse.at < 5 ? ['Loot the ', 'body', ' or move on.'] : ['Search the ridge for the ', gang, '.'];
  ctx.font = `400 23px ${SERIF}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const widths = parts.map((p) => ctx.measureText(p).width);
  let x = W / 2 - (widths[0] + widths[1] + widths[2]) / 2;
  const y = H - 38;
  parts.forEach((p, i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(p, x + 1.5, y + 2);
    ctx.fillStyle = i === 1 ? '#e8b83a' : '#f1ece0';
    ctx.fillText(p, x, y);
    x += widths[i];
  });
}

function drawHonor(ctx, g, t) {
  const h = S.honor;
  if (!h) return;
  const dt = g.clock - h.at;
  if (dt < 0 || dt > 3) return;
  const k = smooth(clamp01(dt / 0.3)) * clamp01((3 - dt) / 0.4);
  const x = 34 - (1 - k) * 60, y = 40;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(12,10,8,0.8)';
  ctx.beginPath(); ctx.arc(x + 18, y + 18, 18, 0, TAU); ctx.fill();
  ctx.strokeStyle = h.good ? '#e8c46a' : '#d0402c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = h.good ? '#e8c46a' : '#d0402c';
  ctx.beginPath();
  if (h.good) { ctx.moveTo(x + 18, y + 8); ctx.lineTo(x + 26, y + 22); ctx.lineTo(x + 10, y + 22); } else { ctx.moveTo(x + 18, y + 28); ctx.lineTo(x + 26, y + 14); ctx.lineTo(x + 10, y + 14); }
  ctx.fill();
  ctx.font = `small-caps 400 20px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1ece0';
  ctx.fillText(h.good ? 'Honor' : 'Honor', x + 46, y + 11);
  // the honour bar, the needle nudged
  const rank = g.career?.rdr2?.rank ?? 0;
  const bx = x + 46, by = y + 28, bw = 140;
  const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  grd.addColorStop(0, '#8a2a1e'); grd.addColorStop(0.5, '#5a5048'); grd.addColorStop(1, '#d8c070');
  ctx.fillStyle = grd;
  ctx.fillRect(bx, by, bw, 4);
  const nx = bx + bw * clamp01((rank + (h.good ? 1 : -1) * smooth(clamp01(dt / 0.8)) * 2 + 100) / 200);
  ctx.fillStyle = '#f4efe2';
  ctx.beginPath(); ctx.moveTo(nx, by - 3); ctx.lineTo(nx + 4, by + 8); ctx.lineTo(nx - 4, by + 8); ctx.fill();
  ctx.font = `700 13px ${SANS}`;
  ctx.fillStyle = h.good ? '#e8c46a' : '#e06a50';
  ctx.fillText(h.good ? '+' : '−', x + 46 + ctx.measureText('Honor').width * 1.5 + 6, y + 11);
  ctx.restore();
}

const MISSIONS = ['Buzzards & Bandanas', 'A Fly in the Ointment', 'Six Legs, One Gun', 'No Country for Old Flies', 'Honor Among Insects', 'The Fly Who Shot Liberty'];
const missionName = (g) => MISSIONS[((g.career?.rdr2?.played ?? 1) + MISSIONS.length - 1) % MISSIONS.length];

function drawTitleCard(ctx, g, t, m) {
  const mt = m?.t ?? 99;
  if (mt > 5.2) return;
  const k = smooth(clamp01((mt - 0.3) / 0.7)) * clamp01((5.2 - mt) / 0.8);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k * 0.75;
  ctx.drawImage(FX.ink, W / 2 - 360, 520, 720, 96);
  ctx.globalAlpha = k;
  title(ctx, missionName(g), W / 2, 580, 42, '#f1ece0', 0.06);
  ctx.restore();
}

// ================================================================= result

function result(ctx, g, t) {
  const r = g.result;
  if (!r) return;
  ensureWorld();
  const k = smooth(clamp01(g.t / 0.7));
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `rgba(128,128,128,${(0.65 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(180,150,110,${(0.6 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(10,7,5,${(0.42 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = k;
  ctx.drawImage(FX.death, 0, 0);
  ctx.restore();
  const won = r.won;
  const tk = smooth(clamp01((g.t - 0.25) / 0.6));
  ctx.save();
  ctx.globalAlpha = tk * 0.92;
  ctx.drawImage(won ? FX.ink : FX.inkRed, W / 2 - 560 + (1 - tk) * 40, 100, 1120, 170);
  ctx.globalAlpha = tk;
  title(ctx, won ? 'Mission Complete' : 'Mission Failed', W / 2, 205, 70, won ? '#f3ead6' : '#f0ddd4', 0.1);
  ctx.font = `italic 400 22px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? '#e0bc6a' : '#e6a090';
  const reason = won ? missionName(g) : r.deaths > r.kills ? 'You were outgunned.' : 'The outlaws got away.';
  ctx.fillText(reason, W / 2, 250);
  ctx.restore();
  const honor = formatRank('rdr2', g.career?.rdr2?.rank ?? 0);
  const delta = r.delta ?? 0;
  const goals = [
    ['Kill five outlaws', r.kills >= 5],
    ['Die no more than once', r.deaths <= 1],
    ["Don't lose your hat", r.deaths === 0],
  ];
  const met = goals.filter((x) => x[1]).length;
  const medal = met === 3 ? 'gold' : met === 2 ? 'silver' : 'bronze';
  if (won) {
    const mk = clamp01((g.t - 0.9) / 0.35);
    drawMedal(ctx, 372, 408, 62 * (mk < 1 ? 0.6 + 0.55 * Math.sin(mk * PI * 0.8) + mk * 0.2 : 1), medal, g.t, mk);
    if (mk > 0) {
      ctx.save();
      ctx.globalAlpha = mk;
      title(ctx, `${medal[0].toUpperCase()}${medal.slice(1)} Medal`, 372, 506, 24, MEDALS[medal][1], 0.08);
      ctx.restore();
    }
    const rows = [['Outlaws killed', String(r.kills)], ['Deaths', String(r.deaths)], ['Honor', `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`]];
    statRows(ctx, g, rows, 500, 340, 1.1);
    goals.forEach(([label, ok], i) => {
      const gk = clamp01((g.t - 1.8 - i * 0.2) / 0.3);
      if (gk <= 0) return;
      ctx.save();
      ctx.globalAlpha = gk;
      const y = 492 + i * 30;
      ctx.font = `400 19px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ok ? '#e8c46a' : 'rgba(241,236,224,0.45)';
      ctx.fillText(ok ? '✓' : '✗', 500, y);
      ctx.fillStyle = ok ? '#f1ece0' : 'rgba(241,236,224,0.55)';
      ctx.fillText(label, 530, y);
      ctx.restore();
    });
  } else {
    const rows = [['Outlaws killed', String(r.kills)], ['Deaths', String(r.deaths)], ['Honor', `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`]];
    statRows(ctx, g, rows, W / 2 - 200, 330, 0.9);
    const pk = clamp01((g.t - 1.6) / 0.4);
    ctx.save();
    ctx.globalAlpha = pk;
    drawKeys(ctx, [['ENTER', 'Retry checkpoint'], ['ESC', 'Skip']], W / 2, 520);
    ctx.restore();
  }
  // the honour line, standing now
  const hk = clamp01((g.t - 1.4) / 0.4);
  ctx.save();
  ctx.globalAlpha = hk;
  ctx.font = `small-caps 400 20px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(241,236,224,0.85)';
  ctx.fillText(honor, W / 2, H - 60);
  ctx.restore();
}

const MEDALS = { gold: ['#f6d77a', '#e4b84a', '#8a6a20'], silver: ['#f0f2f4', '#b8bcc4', '#5a5e66'], bronze: ['#e8a870', '#b4703c', '#5e3418'] };

function drawMedal(ctx, x, y, r, kind, t, k) {
  if (k <= 0) return;
  const [hi, mid, lo] = MEDALS[kind];
  ctx.save();
  ctx.globalAlpha = k;
  // ribbon
  ctx.fillStyle = '#7a1a14';
  ctx.beginPath(); ctx.moveTo(x - r * 0.55, y - r * 1.9); ctx.lineTo(x - r * 0.1, y - r * 1.9); ctx.lineTo(x + r * 0.2, y - r * 0.6); ctx.lineTo(x - r * 0.25, y - r * 0.6); ctx.fill();
  ctx.fillStyle = '#a82a20';
  ctx.beginPath(); ctx.moveTo(x + r * 0.55, y - r * 1.9); ctx.lineTo(x + r * 0.1, y - r * 1.9); ctx.lineTo(x - r * 0.2, y - r * 0.6); ctx.lineTo(x + r * 0.25, y - r * 0.6); ctx.fill();
  // disc
  const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, hi); gr.addColorStop(0.6, mid); gr.addColorStop(1, lo);
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = lo;
  ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, TAU); ctx.stroke();
  // a star, and a revolver cylinder's six holes round it
  ctx.fillStyle = lo;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.2 : r * 0.48; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.16 : r * 0.4; ctx.lineTo(x + Math.cos(a) * rr - r * 0.02, y + Math.sin(a) * rr - r * 0.03); }
  ctx.fill();
  // a glint sweeping across
  const sweep = ((t * 0.5) % 1.6) - 0.3;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createLinearGradient(x - r + sweep * 2 * r, y - r, x - r + sweep * 2 * r + r * 0.5, y + r);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,240,0.45)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  ctx.restore();
}

function statRows(ctx, g, rows, x, y, delay) {
  rows.forEach(([label, value], i) => {
    const k = clamp01((g.t - delay - i * 0.18) / 0.3);
    if (k <= 0) return;
    const yy = y + i * 40;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `400 24px ${SERIF}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f1ece0';
    ctx.fillText(label, x + (1 - k) * 20, yy);
    ctx.textAlign = 'right';
    ctx.fillStyle = label === 'Honor' ? (value.startsWith('+') ? '#e8c46a' : '#e06a50') : '#f1ece0';
    ctx.fillText(value, x + 400, yy);
    ctx.strokeStyle = 'rgba(241,236,224,0.25)';
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1.5;
    ctx.font = `400 24px ${SERIF}`;
    const lw = ctx.measureText(label).width, vw = ctx.measureText(value).width;
    ctx.beginPath(); ctx.moveTo(x + lw + 12, yy - 6); ctx.lineTo(x + 400 - vw - 12, yy - 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });
}

function drawKeys(ctx, keys, cx, y) {
  ctx.font = `400 19px ${SERIF}`;
  const parts = keys.map(([key, label]) => {
    ctx.font = `700 12px ${SANS}`;
    const kw = Math.max(26, ctx.measureText(key).width + 14);
    ctx.font = `400 19px ${SERIF}`;
    return { key, label, kw, lw: ctx.measureText(label).width };
  });
  const total = parts.reduce((s, p) => s + p.kw + 10 + p.lw + 34, -34);
  let x = cx - total / 2;
  ctx.textBaseline = 'middle';
  for (const p of parts) {
    rrect(ctx, x, y - 13, p.kw, 26, 4);
    ctx.fillStyle = 'rgba(244,239,226,0.92)';
    ctx.fill();
    ctx.font = `700 12px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#16120e';
    ctx.fillText(p.key, x + p.kw / 2, y + 1);
    x += p.kw + 10;
    ctx.font = `400 19px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f1ece0';
    ctx.fillText(p.label, x, y);
    x += p.lw + 34;
  }
}

// ================================================================== queue

const TIPS = [
  'A fly can carry twice its own weight in beans. Your horse carries the rest.',
  'Flies see almost all the way round. Outlaws behind you are still behind you.',
  'Brushing your horse improves your bond. Landing on its eye does not.',
  'Dead Eye slows time. A fly lives in slow motion already; it still helps.',
  'Honor rises when you help strangers, and falls when you land on their supper.',
  'A fly beats its wings two hundred times a second. Spurs are optional.',
  'Your hat keeps the sun off. Nothing keeps a swatter off.',
  'Outlaws hate being buzzed. Buzz them anyway.',
];

function queue(ctx, g, t) {
  if (!FX) FX = buildFx();
  if (!PAINTING) PAINTING = buildPainting();
  const p = clamp01(g.phaseProgress ?? 0);
  const played = g.career?.rdr2?.played ?? 0;
  // the painting, pushed in slowly
  const z = 1.04 + 0.06 * p;
  const dw = W * z, dh = H * z;
  ctx.drawImage(PAINTING, (W - dw) / 2 - 30 * p, (H - dh) / 2 - 10 * p, dw, dh);
  // a dark foot for the words
  const foot = ctx.createLinearGradient(0, H - 230, 0, H);
  foot.addColorStop(0, 'rgba(8,6,4,0)'); foot.addColorStop(1, 'rgba(8,6,4,0.8)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, H - 230, W, 230);
  const ink = clamp01((g.t ?? 0) / 0.8);
  ctx.save();
  ctx.globalAlpha = ink;
  title(ctx, `Chapter ${['I', 'II', 'III', 'IV', 'V', 'VI'][Math.min(5, Math.floor(played / 2) + 1)]}`, 64, H - 150, 22, '#e0bc6a', 0.22, { align: 'left', shadow: true });
  title(ctx, missionName({ career: { rdr2: { played: played + 1 } } }), 62, H - 100, 50, '#f3ead6', 0.04, { align: 'left' });
  ctx.font = `italic 400 19px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(241,236,224,0.85)';
  ctx.fillText(`Tip: ${TIPS[(played + (g.seed ?? 0)) % TIPS.length]}`, 64, H - 56);
  ctx.restore();
  // the loading cylinder: a round goes in, it turns
  const loaded = Math.min(6, Math.floor(p * 6.2));
  const turn = smooth(clamp01((p * 6.2 - loaded) * 3));
  const cx = W - 86, cy = H - 86, R = 30;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((loaded - 1 + turn) / 6) * TAU);
  ctx.fillStyle = 'rgba(20,16,12,0.85)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4, R, a - 0.45, a + 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,232,214,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - PI / 2;
    const px = Math.cos(a) * 17, py = Math.sin(a) * 17;
    const full = i < loaded;
    ctx.fillStyle = full ? '#d8b25a' : '#060504';
    ctx.beginPath(); ctx.arc(px, py, 6.5, 0, TAU); ctx.fill();
    if (full) { ctx.fillStyle = '#8a6a2a'; ctx.beginPath(); ctx.arc(px, py, 2, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(241,236,224,0.25)';
  ctx.fillRect(64, H - 34, W - 64 - 150, 2);
  ctx.fillStyle = '#e0bc6a';
  ctx.fillRect(64, H - 34, (W - 64 - 150) * p, 2);
  // the rest of the world bakes while this is up
  if ((g.t ?? 1) > 0.15) warm();
}

// =================================================================== icon

function icon(ctx, x, y, s) {
  ctx.save();
  rrect(ctx, x, y, s, s, s * 0.2);
  const bg = ctx.createLinearGradient(x, y, x, y + s);
  bg.addColorStop(0, '#8a2a1a'); bg.addColorStop(0.62, '#5a1a12'); bg.addColorStop(1, '#2a0a08');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();
  // a low sun
  const sun = ctx.createRadialGradient(x + s * 0.5, y + s * 0.66, 0, x + s * 0.5, y + s * 0.66, s * 0.34);
  sun.addColorStop(0, '#ffd88a'); sun.addColorStop(0.55, '#f0a048'); sun.addColorStop(1, 'rgba(240,140,60,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = '#1e0806';
  ctx.fillRect(x, y + s * 0.74, s, s * 0.26);
  // a hat
  const hx = x + s * 0.5, hy = y + s * 0.6;
  ctx.fillStyle = '#140604';
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.4, hy - s * 0.02);
  ctx.quadraticCurveTo(hx - s * 0.42, hy - s * 0.1, hx - s * 0.34, hy - s * 0.08);
  ctx.quadraticCurveTo(hx - s * 0.2, hy - s * 0.02, hx - s * 0.17, hy - s * 0.05);
  ctx.bezierCurveTo(hx - s * 0.2, hy - s * 0.26, hx - s * 0.16, hy - s * 0.32, hx - s * 0.08, hy - s * 0.32);
  ctx.quadraticCurveTo(hx, hy - s * 0.27, hx + s * 0.08, hy - s * 0.32);
  ctx.bezierCurveTo(hx + s * 0.16, hy - s * 0.32, hx + s * 0.2, hy - s * 0.26, hx + s * 0.17, hy - s * 0.05);
  ctx.quadraticCurveTo(hx + s * 0.2, hy - s * 0.02, hx + s * 0.34, hy - s * 0.08);
  ctx.quadraticCurveTo(hx + s * 0.42, hy - s * 0.1, hx + s * 0.4, hy - s * 0.02);
  ctx.quadraticCurveTo(hx, hy + s * 0.1, hx - s * 0.4, hy - s * 0.02);
  ctx.fill();
  ctx.fillStyle = '#7a2014';
  ctx.fillRect(hx - s * 0.17, hy - s * 0.1, s * 0.34, s * 0.035);
  ctx.restore();
}

export const RDR2 = { play, queue, result, icon };
