/**
 * God of War (2018) and God of War Ragnarök on the fly's monitor, painted
 * procedurally. They are recognisable by setting, palette and HUD
 * conventions only: Midgard's misty pines, snow, blue-lit rune stones and a
 * serpent coiled in the lake; Fimbulwinter's blizzard over a frozen lake,
 * the aurora and a dwarven gate burning gold far off. The camera sits close
 * over the shoulder of a pale warrior with a red stripe — here a fly, ash-grey,
 * with a bristly beard-tuft — who throws a frost axe that comes back to the
 * hand, or swings burning blades on chains. Green health over a red rage
 * bar, runic slots, a quest line, and a slow knot while it loads. There are
 * no logos and no assets, and nobody's likeness.
 *
 * The world is a panorama round the player, as in the western next door: a
 * camera that only turns moves nothing static against anything else, so the
 * sky, the far land and the ground are each baked once into a strip one turn
 * wide and slid past the screen. Trees, stones, ruins and ice close by, the
 * enemies, the snow in the air and the warrior are drawn each frame at their
 * bearing and range, with the same projection the strips were baked in.
 */
import { formatRank } from '../../game/games.js';
import { HALF_FOV } from '../../game/gamer.js';
import {
  MAIN_W, MAIN_H, SANS, PX_PER_RAD, TAU, clamp, clamp01, hash, smooth, vnoise, wrap, rrect, camYaw, bearingX, enemyOnScreen,
} from './kit.js';

const W = MAIN_W;
const H = MAIN_H;
const PI = Math.PI;
const PX = PX_PER_RAD;
const SERIF = "Georgia, 'Times New Roman', Times, serif";

/** Metres: the camera's height, at the warrior's shoulder. */
const CAM_H = 1.6;
/** The horizon's screen row at level pitch. */
const HZ0 = 300;
/** One turn of the panorama at full resolution. */
const PW = Math.round(TAU * PX);

const lerp = (a, b, k) => a + (b - a) * k;
const smoothstep = (e0, e1, x) => smooth(clamp01((x - e0) / (e1 - e0)));
/** Screen px under the horizon of a point h metres up, r metres away. */
const rowOf = (r, h = 0) => Math.atan((CAM_H - h) / r) * PX;
/** Metres to the ground seen `row` px under the horizon. */
const rangeOf = (row) => CAM_H / Math.tan(Math.max(0.5, row) / PX);
const panoX = (a) => { const u = a / TAU; return (u - Math.floor(u)) * PW; };
const bearing = (x, z) => Math.atan2(x, z);

// ------------------------------------------------------------------ colour

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;

/**
 * A colour that fades into the air with distance (`k`, 0 near, 1 lost in the
 * mist) and whitens on a hit. Every step is made once and kept, so a frame
 * allocates no colour strings.
 */
const P = (base, air) => ({ c: rgb(base), air: rgb(air), cache: [] });
function tone(p, k = 0, flash = 0) {
  const q = Math.round(clamp01(k) * 16);
  const f = Math.round(clamp01(flash) * 4);
  const i = q * 5 + f;
  let s = p.cache[i];
  if (!s) { s = css(mix(mix(p.c, p.air, q / 16), [236, 244, 255], f * 0.17)); p.cache[i] = s; }
  return s;
}

// ---------------------------------------------------------------- canvases

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

/** A panorama canvas at scale s: one turn plus a screen's width, `rows` full-resolution rows. */
function panoCanvas(s, rows, rowHz) {
  const pw = Math.round(PW * s);
  const c = makeCanvas(pw + Math.ceil(W * s) + 2, rows * s);
  Object.assign(c, { panoW: pw, s, rowHz, rows });
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  return [c, ctx];
}

function drawPano(ctx, c, yaw, hz) {
  const s = c.s;
  let sx = ((yaw - HALF_FOV) / TAU) * c.panoW;
  sx -= Math.floor(sx / c.panoW) * c.panoW;
  ctx.drawImage(c, sx, 0, W * s, c.height, 0, hz - c.rowHz, W, c.height / s);
}

/** A horizontal gradient once round the world, its colour at each angle from `fn`. */
function aroundGradient(ctx, fn, stops = 72) {
  const gr = ctx.createLinearGradient(0, 0, PW, 0);
  for (let i = 0; i <= stops; i++) gr.addColorStop(i / stops, fn((i / stops) * TAU));
  return gr;
}

/** Vertical strips each with its own gradient: `fn(a)` → [colour, alpha at y0, alpha at y1]. */
function stripsTinted(ctx, y0, y1, fn, step) {
  for (let x = 0; x < PW; x += step) {
    const [c, a0, a1] = fn(((x + step / 2) / PW) * TAU);
    if (a0 <= 0.003 && a1 <= 0.003) continue;
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, css(c, a0));
    gr.addColorStop(1, css(c, a1));
    ctx.fillStyle = gr;
    ctx.fillRect(x, y0, step + 0.5, y1 - y0);
  }
}

/** Value noise sampled round a circle: periodic in the angle, so the panorama has no seam. */
const ringN = (a, f, seed) => vnoise(Math.cos(a) * f + 40 + seed * 13.1, Math.sin(a) * f + 40 + seed * 7.7);
function fbm(a, f, seed, oct = 4) {
  let s = 0, amp = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { s += amp * ringN(a, f, seed + o * 5); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
/** A sharper ridge line round the circle: folded noise, peaks where it creases. */
function ridgeN(a, f, seed, oct = 5) {
  let s = 0, amp = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { s += amp * (1 - Math.abs(ringN(a, f, seed + o * 3.3) * 2 - 1)); n += amp; amp *= 0.5; f *= 2.1; }
  return s / n;
}

function softBlob(c, al = 0.9, size = 128) {
  const cv = makeCanvas(size, size);
  const x = cv.getContext('2d');
  const h = size / 2;
  const gr = x.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, css(c, al)); gr.addColorStop(0.45, css(c, al * 0.5)); gr.addColorStop(1, css(c, 0));
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return cv;
}
function glowSprite(c, core = 0.12) {
  const cv = makeCanvas(128, 128);
  const x = cv.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, css(mix(c, [255, 255, 255], 0.6), 1));
  gr.addColorStop(core, css(c, 0.75));
  gr.addColorStop(0.4, css(c, 0.22));
  gr.addColorStop(1, css(c, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return cv;
}
/** Additive light: `sprite` centred at x, y, radius r. */
function glow(ctx, sprite, x, y, r, a = 1) {
  if (a <= 0.004 || r <= 0.5) return;
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = op;
}

// ------------------------------------------------------------------ runes

/**
 * The Elder Futhark as strokes on a 0.6 × 1 box — a real alphabet, carved on
 * stones since the second century — drawn line by line so no font is needed.
 */
const RUNES = [
  [[0, 0, 0, 1], [0, 0.32, 0.5, 0.04], [0, 0.58, 0.5, 0.3]],
  [[0, 1, 0, 0, 0.5, 0.32, 0.5, 1]],
  [[0, 0, 0, 1], [0, 0.25, 0.45, 0.5, 0, 0.75]],
  [[0, 0, 0, 1], [0, 0, 0.45, 0.3], [0, 0.3, 0.45, 0.6]],
  [[0, 1, 0, 0, 0.45, 0.24, 0, 0.5, 0.48, 1]],
  [[0.45, 0.2, 0.05, 0.5, 0.45, 0.8]],
  [[0, 0, 0.6, 1], [0.6, 0, 0, 1]],
  [[0, 1, 0, 0, 0.45, 0.22, 0, 0.44]],
  [[0, 0, 0, 1], [0.5, 0, 0.5, 1], [0, 0.35, 0.5, 0.65]],
  [[0.28, 0, 0.28, 1], [0, 0.35, 0.56, 0.62]],
  [[0.3, 0, 0.3, 1]],
  [[0.28, 0.08, 0, 0.34, 0.28, 0.6], [0.32, 0.4, 0.6, 0.66, 0.32, 0.92]],
  [[0.55, 0.24, 0.3, 0, 0.3, 1, 0.05, 0.76]],
  [[0.3, 0, 0.3, 1], [0, 0, 0.3, 0.4, 0.6, 0]],
  [[0.48, 0, 0.06, 0.36, 0.52, 0.62, 0.1, 1]],
  [[0.3, 0, 0.3, 1], [0, 0.34, 0.3, 0, 0.6, 0.34]],
  [[0, 0, 0, 1, 0.42, 0.75, 0, 0.5, 0.42, 0.25, 0, 0]],
  [[0, 1, 0, 0, 0.3, 0.36, 0.6, 0, 0.6, 1]],
  [[0, 1, 0, 0, 0.6, 0.5], [0.6, 1, 0.6, 0, 0, 0.5]],
  [[0, 0, 0, 1], [0, 0, 0.45, 0.3]],
  [[0.3, 0.2, 0.6, 0.5, 0.3, 0.8, 0, 0.5, 0.3, 0.2]],
  [[0, 0, 0, 1, 0.6, 0, 0.6, 1, 0, 0]],
  [[0.05, 1, 0.55, 0.42, 0.3, 0.12, 0.05, 0.42, 0.55, 1]],
];
/** One rune's strokes added to the current path, `h` tall, its top-left at x, y. */
function runePath(ctx, k, x, y, h) {
  const r = RUNES[((k % RUNES.length) + RUNES.length) % RUNES.length];
  for (const line of r) {
    ctx.moveTo(x + line[0] * h, y + line[1] * h);
    for (let i = 2; i < line.length; i += 2) ctx.lineTo(x + line[i] * h, y + line[i + 1] * h);
  }
}
/** A column of runes, as carved on a stone. */
function runeColumn(ctx, seed, x, y, h, n, gap = 0.3) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) runePath(ctx, Math.floor(hash(seed + i * 3.7) * 23), x - h * 0.3, y + i * h * (1 + gap), h);
  ctx.stroke();
}

// ------------------------------------------------------------------ knots

const KNOT_N = 240;
const KNOTS = new Map();
/** A (p, q) torus knot, projected: x, y and its depth, so strands can go over and under. */
function knotPoints(p, q) {
  const key = p * 100 + q;
  let pts = KNOTS.get(key);
  if (pts) return pts;
  pts = new Float32Array(KNOT_N * 3);
  for (let i = 0; i < KNOT_N; i++) {
    const s = (i / KNOT_N) * TAU;
    const r = (Math.cos(q * s) + 2.2) / 3.2;
    pts[i * 3] = r * Math.cos(p * s);
    pts[i * 3 + 1] = r * Math.sin(p * s);
    pts[i * 3 + 2] = -Math.sin(q * s);
  }
  KNOTS.set(key, pts);
  return pts;
}
/**
 * An interlaced knot: the whole band, then the strands that pass over drawn
 * again on top, edges and all, so each crossing reads as over-and-under.
 */
function drawKnot(ctx, x, y, R, rot, { p = 2, q = 3, width = 8, color = '#c9a96a', edge = '#2a1d10', shine = null, alpha = 1 } = {}) {
  const pts = knotPoints(p, q);
  const e = Math.max(1.5, width * 0.3);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineJoin = 'round';
  const band = (from, to) => {
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const j = (i % KNOT_N) * 3;
      if (i === from) ctx.moveTo(pts[j] * R, pts[j + 1] * R); else ctx.lineTo(pts[j] * R, pts[j + 1] * R);
    }
  };
  const paint = () => {
    ctx.strokeStyle = edge; ctx.lineWidth = width + e * 2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    if (shine) { ctx.strokeStyle = shine; ctx.lineWidth = Math.max(1, width * 0.26); ctx.stroke(); }
  };
  ctx.lineCap = 'round';
  band(0, KNOT_N);
  paint();
  ctx.lineCap = 'butt';
  let start = -1;
  for (let i = 0; i <= KNOT_N; i++) {
    const over = pts[(i % KNOT_N) * 3 + 2] > 0;
    if (over && start < 0) start = i;
    if ((!over || i === KNOT_N) && start >= 0) { band(Math.max(0, start - 1), i); paint(); start = -1; }
  }
  ctx.restore();
}

/** Serif capitals with letter-spacing, the way the games set their titles. */
function title(ctx, s, x, y, size, color, { spacing = 0.12, weight = 400, align = 'center', shadow = 'rgba(0,0,0,0.6)', italic = false } = {}) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${SERIF}`;
  const sp = 'letterSpacing' in ctx;
  if (sp) ctx.letterSpacing = `${Math.round(size * spacing)}px`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const dx = sp && align === 'center' ? Math.round(size * spacing) / 2 : 0;
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + dx + Math.max(1, size / 30), y + Math.max(1.5, size / 24)); }
  ctx.fillStyle = color;
  ctx.fillText(s, x + dx, y);
  if (sp) ctx.letterSpacing = '0px';
}
function label(ctx, s, x, y, size, color, align = 'left', weight = 600, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(s, x + 1, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// ============================================================ Midgard, 2018

/**
 * The Wildwoods over the lake. The mission starts looking out over the
 * cliff: the lake far below in mist, the serpent's coils in it, the
 * mountain behind; the woods close in on every other side, and an old gate
 * stands in them to the west.
 */
const MG = {
  SUN_A: 0.52,
  LAKE_A: 0.06,
  VISTA: 0.7,
  RUIN_A: -1.72,
  SERP_A: 0.3,
  MOUNT_A: -0.3,
  STONE_A: 0.47,
  EDGE_R: 27,
  /** Metres the lake lies under the clifftop. */
  DROP: 70,
};
const vistaK = (a) => 1 - smoothstep(MG.VISTA * 0.5, MG.VISTA, Math.abs(wrap(a - MG.LAKE_A)));
const mgSunF = (a) => Math.cos(a - MG.SUN_A);
const MG_FOG = [150, 164, 160];
const MG_FOG_SUN = [222, 214, 190];
/** The mist's colour at a bearing: grey-green, warm where the veiled sun is. */
const mgFog = (a) => mix(MG_FOG, MG_FOG_SUN, Math.pow(Math.max(0, mgSunF(a)), 2.2));
/** How much of a thing r metres off is lost in the mist. */
const mgAir = (r) => 1 - Math.exp(-r / 240);

// ---------------------------------------------------------- the sky, baked

const MG_SKY_HZ = 470;

function mgSky() {
  const [c, ctx] = panoCanvas(0.5, 520, MG_SKY_HZ);
  const HZ = MG_SKY_HZ;
  const base = ctx.createLinearGradient(0, 0, 0, HZ);
  [[0, '#4c5a63'], [0.3, '#687982'], [0.62, '#8e9d9e'], [0.86, '#afbab4'], [1, '#c3c9bd']].forEach(([o, col]) => base.addColorStop(o, col));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PW, 520);
  // lighter and warmer toward the veiled sun
  stripsTinted(ctx, 0, HZ, (a) => [[244, 234, 206], 0, Math.pow(Math.max(0, mgSunF(a)), 2.4) * 0.6], 8);
  const sx = panoX(MG.SUN_A), sy = HZ - 200;
  around(sx, 900, (x) => {
    ctx.save();
    ctx.translate(x, sy);
    ctx.scale(1.8, 1);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 480);
    [[0, 'rgba(255,250,232,0.95)'], [0.06, 'rgba(252,242,214,0.8)'], [0.2, 'rgba(236,226,196,0.4)'], [0.5, 'rgba(210,206,184,0.12)'], [1, 'rgba(200,200,180,0)']].forEach(([o, col]) => gl.addColorStop(o, col));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, 0, 480, 0, TAU); ctx.fill();
    ctx.restore();
  });
  // cloud banks: soft grey masses, lit on top, brighter round the sun
  const puff = (x, y, r, body, lit, al) => {
    const gr = ctx.createRadialGradient(x, y - r * 0.35, r * 0.05, x, y, r);
    gr.addColorStop(0, css(lit, al)); gr.addColorStop(0.5, css(mix(lit, body, 0.6), al * 0.9)); gr.addColorStop(1, css(body, 0));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  const banks = [];
  for (let i = 0; i < 46; i++) banks.push({ a: hash(i * 3.71 + 0.3) * TAU, y: HZ - 90 - hash(i * 5.3) * 330, w: 240 + hash(i * 7.9) * 520, h: 40 + hash(i * 2.7) * 60, seed: i * 17.3 });
  banks.sort((p, q) => q.y - p.y);
  for (const b of banks) {
    const near = Math.pow(Math.max(0, mgSunF(b.a)), 3);
    const body = mix([96, 108, 114], [150, 150, 140], near);
    const lit = mix([176, 184, 182], [255, 246, 222], near);
    const n = 10 + Math.round(b.w / 60);
    around(panoX(b.a), b.w, (x0) => {
      for (let i = 0; i < n; i++) {
        const u = hash(b.seed + i * 1.9);
        const dome = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        ctx.save();
        ctx.translate(x0 + (u - 0.5) * b.w, b.y - dome * b.h * 0.5 + (hash(b.seed + i * 4.3) - 0.5) * b.h * 0.4);
        ctx.scale(1.7, 0.75);
        puff(0, 0, b.h * (0.5 + 0.6 * dome) * (0.7 + 0.5 * hash(b.seed + i * 2.2)), body, lit, 0.55);
        ctx.restore();
      }
    });
  }
  // long thin streaks low down, the mist rising off the lake
  for (let i = 0; i < 26; i++) {
    const a = hash(i * 8.3 + 1.1) * TAU, y = HZ - 16 - hash(i * 6.1) * 110;
    const len = 300 + hash(i * 2.2) * 700, th = 6 + hash(i * 1.9) * 12;
    const col = mix([196, 204, 198], [250, 240, 214], Math.pow(Math.max(0, mgSunF(a)), 2));
    around(panoX(a), len, (x) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(len / 2, th / 2);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, css(col, 0.55)); gr.addColorStop(1, css(col, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }
  closeRing(c);
  return c;
}

// ---------------------------------------------------------- the land, baked

const MG_LAND_S = 0.75;
const MG_LAND_ROWS = 480;
const MG_LAND_HZ = 380;

/** The horizon ring of mountains; the mountain itself stands over the lake. */
function mgFarH(a) {
  const peak = Math.exp(-((wrap(a - MG.MOUNT_A) / 0.13) ** 2));
  const shoulder = Math.exp(-((wrap(a - MG.MOUNT_A - 0.2) / 0.22) ** 2));
  return 34 + 70 * Math.pow(ridgeN(a, 3.2, 1), 1.6) + 150 * peak * (0.85 + 0.15 * ridgeN(a, 40, 4)) + 60 * shoulder;
}
/** Wooded hills across the lake, their feet at the far shore. */
function mgHillH(a) { return 10 + 36 * Math.pow(fbm(a, 6, 3, 4), 1.4); }
/** Rows under the horizon to the lake's far shore, and to the lip of the cliff. */
const mgShoreRow = (a) => lerp(2, Math.atan(MG.DROP / 2600) * PX, vistaK(a));
const mgEdgeRow = (a) => rowOf(MG.EDGE_R / Math.max(0.3, Math.cos(wrap(a - MG.LAKE_A) * 0.9)));
function mgLayer(ctx, lx, hs, baseRow, o) {
  const n = hs.length;
  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, lx.canvas.width, lx.canvas.height);
  lx.setTransform(MG_LAND_S, 0, 0, MG_LAND_S, 0, 0);
  lx.fillStyle = '#000';
  lx.beginPath();
  for (let i = 0; i < n; i++) { const a = (i * 4 / PW) * TAU; lx.lineTo(i * 4, MG_LAND_HZ + baseRow(a) - hs[i]); }
  for (let i = n - 1; i >= 0; i--) { const a = (i * 4 / PW) * TAU; lx.lineTo(i * 4, MG_LAND_HZ + baseRow(a) + 3); }
  lx.closePath();
  lx.fill();
  lx.globalCompositeOperation = 'source-atop';
  lx.fillStyle = aroundGradient(lx, (a) => css(mix(o.col, mix(o.col, [255, 244, 220], 0.35), Math.pow(Math.max(0, mgSunF(a)), 2))));
  lx.fillRect(0, 0, PW, MG_LAND_ROWS);
  const vg = lx.createLinearGradient(0, MG_LAND_HZ - o.top, 0, MG_LAND_HZ + 20);
  vg.addColorStop(0, 'rgba(255,255,255,0.1)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(10,16,16,${o.baseDark})`);
  lx.fillStyle = vg;
  lx.fillRect(0, 0, PW, MG_LAND_ROWS);
  if (o.detail) o.detail(lx, hs, baseRow);
  lx.fillStyle = aroundGradient(lx, (a) => css(mgFog(a), clamp01(o.haze + 0.25 * Math.pow(Math.max(0, mgSunF(a)), 3))));
  lx.fillRect(0, 0, PW, MG_LAND_ROWS);
  const hb = lx.createLinearGradient(0, MG_LAND_HZ - 40, 0, MG_LAND_HZ + 30);
  hb.addColorStop(0, 'rgba(200,208,200,0)'); hb.addColorStop(1, `rgba(200,208,200,${o.baseHaze ?? 0.4})`);
  lx.fillStyle = hb;
  lx.fillRect(0, 0, PW, MG_LAND_ROWS);
  lx.globalCompositeOperation = 'source-over';
  lx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lx.canvas, 0, 0);
  ctx.restore();
}

function mgSnowCaps(lx, hs, baseRow) {
  // one smooth sheet of snow under the ridge line, ragged along its foot
  const line = (i) => 64 + 26 * vnoise(i * 0.045, 3.3);
  const depth = (i) => Math.max(0, hs[i] - line(i)) * (0.5 + 0.45 * vnoise(i * 0.22, 1.7));
  const y = (i) => MG_LAND_HZ + baseRow((i * 4 / PW) * TAU) - hs[i];
  lx.beginPath();
  let open = false;
  for (let i = 0; i <= hs.length; i++) {
    const d = i < hs.length ? depth(i) : 0;
    if (d > 0.5 && !open) { lx.moveTo(i * 4, y(i)); open = i; }
    if (d > 0.5) lx.lineTo(i * 4, y(i) - 0.5);
    if ((d <= 0.5 || i === hs.length) && open !== false) {
      for (let j = i - 1; j >= open; j--) lx.lineTo(j * 4, y(j) + depth(j) + 1.5 * Math.sin(j * 1.7));
      lx.closePath();
      open = false;
    }
  }
  lx.fillStyle = aroundGradient(lx, (a) => css(mix([200, 212, 222], [252, 248, 238], Math.max(0, Math.sin(wrap(MG.SUN_A - a))) * 0.9), 0.94));
  lx.fill();
  // gullies of dark rock down the snow, and the shaded faces
  lx.strokeStyle = 'rgba(70,82,96,0.45)';
  lx.lineWidth = 1.4;
  lx.beginPath();
  for (let i = 0; i < hs.length; i += 5) {
    const d = depth(i);
    if (d < 10 || vnoise(i * 0.5, 8.1) < 0.62) continue;
    const x = i * 4, y0 = y(i) + 3;
    lx.moveTo(x, y0); lx.quadraticCurveTo(x + d * 0.1, y0 + d * 0.4, x + d * 0.35 * (hash(i) - 0.3), y0 + d * 0.7);
  }
  lx.stroke();
}

/** A spruce seen from the side: a spire, tiers of drooping boughs, a bare trunk under them. */
function spruce(ctx, x, yb, ht, wd, seed, trunk = true) {
  const top = yb - ht;
  const crown = yb - ht * (0.2 + 0.1 * hash(seed * 1.3));
  if (trunk) ctx.rect(x - ht * 0.012, crown - 2, ht * 0.024, yb - crown + 2);
  ctx.moveTo(x, top); ctx.lineTo(x + wd * 0.07, top + ht * 0.1); ctx.lineTo(x - wd * 0.07, top + ht * 0.1); ctx.closePath();
  const tiers = 11;
  for (let k = 1; k <= tiers; k++) {
    const u = k / tiers;
    const y = lerp(top + ht * 0.05, crown, u);
    for (const s of [-1, 1]) {
      const reach = wd * Math.pow(u, 0.75) * (0.62 + 0.55 * hash(seed + k * 1.7 + s * 0.31));
      ctx.moveTo(x, y - ht * 0.03);
      ctx.quadraticCurveTo(x + s * reach * 0.55, y - ht * 0.022, x + s * reach, y + ht * 0.026);
      ctx.lineTo(x + s * reach * 0.72, y + ht * 0.03);
      ctx.lineTo(x + s * reach * 0.5, y + ht * 0.042);
      ctx.lineTo(x + s * reach * 0.22, y + ht * 0.036);
      ctx.lineTo(x, y + ht * 0.045);
      ctx.closePath();
    }
  }
}

function mgHillDetail(lx, hs, baseRow) {
  // the hills are forest: a comb of tiny spires along every slope
  lx.fillStyle = 'rgba(20,30,28,0.35)';
  lx.beginPath();
  for (let i = 0; i < 5200; i++) {
    const x = hash(i * 1.77 + 0.2) * PW;
    const a = (x / PW) * TAU;
    const hIdx = Math.min(hs.length - 1, Math.round(x / 4));
    const y = MG_LAND_HZ + baseRow(a) - hs[hIdx] * (0.15 + 0.85 * Math.sqrt(hash(i * 2.9))) + 2;
    const t = 3 + hash(i * 3.1) * 5;
    lx.moveTo(x, y - t); lx.lineTo(x + t * 0.3, y); lx.lineTo(x - t * 0.3, y);
  }
  lx.fill();
}

function mgLand() {
  const [c, ctx] = panoCanvas(MG_LAND_S, MG_LAND_ROWS, MG_LAND_HZ);
  const lx = makeCanvas(PW * MG_LAND_S, MG_LAND_ROWS * MG_LAND_S).getContext('2d');
  const n = Math.floor(PW / 4) + 1;
  const heights = (fn) => { const hs = new Float32Array(n); for (let i = 0; i < n; i++) hs[i] = fn(((i * 4) / PW) * TAU); return hs; };
  const farBase = (a) => lerp(1, Math.atan(MG.DROP / 9000) * PX, vistaK(a));
  mgLayer(ctx, lx, heights(mgFarH), farBase, { col: [104, 120, 134], haze: 0.5, top: 240, baseDark: 0.05, detail: mgSnowCaps, baseHaze: 0.55 });
  mgLayer(ctx, lx, heights(mgHillH), mgShoreRow, { col: [60, 76, 72], haze: 0.34, top: 60, baseDark: 0.2, detail: mgHillDetail, baseHaze: 0.5 });
  mgLake(ctx);
  mgTemple(ctx);
  mgSerpent(ctx);
  mgForest(ctx);
  mgLip(ctx);
  closeRing(c);
  return c;
}

/** The lake, far below the cliff: grey water holding the sky, with mist on it. */
function mgLake(ctx) {
  const y0 = MG_LAND_HZ;
  for (let x = 0; x < PW; x += 4) {
    const a = ((x + 2) / PW) * TAU;
    const k = vistaK(a);
    if (k <= 0.01) continue;
    const top = y0 + mgShoreRow(a), bot = y0 + mgEdgeRow(a) + 6;
    const gr = ctx.createLinearGradient(0, top, 0, bot);
    const sun = Math.pow(Math.max(0, mgSunF(a)), 3);
    gr.addColorStop(0, css(mix([176, 188, 186], [246, 238, 214], sun), k));
    gr.addColorStop(0.35, css(mix([122, 138, 140], [200, 196, 176], sun), k));
    gr.addColorStop(1, css([74, 90, 94], k));
    ctx.fillStyle = gr;
    ctx.fillRect(x, top, 4.5, bot - top);
  }
  // ripples, and the sun's path on the water
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const a = MG.LAKE_A + (hash(i * 1.37) - 0.5) * MG.VISTA * 2;
    const k = vistaK(a);
    if (k < 0.2) continue;
    const top = y0 + mgShoreRow(a), bot = y0 + mgEdgeRow(a);
    const u = Math.pow(hash(i * 2.91), 1.6);
    const y = lerp(top + 2, bot, u);
    const len = (6 + 30 * u) * (0.6 + hash(i * 4.4));
    const sun = Math.pow(Math.max(0, mgSunF(a)), 6);
    ctx.strokeStyle = hash(i * 5.5) > 0.5 || sun > 0.4 ? `rgba(236,236,220,${(0.12 + sun * 0.4) * k})` : `rgba(40,56,60,${0.18 * k})`;
    ctx.lineWidth = 1 + u * 1.5;
    ctx.beginPath(); ctx.moveTo(panoX(a) - len / 2, y); ctx.lineTo(panoX(a) + len / 2, y); ctx.stroke();
  }
  // mist lying on the water
  for (let i = 0; i < 40; i++) {
    const a = MG.LAKE_A + (hash(i * 7.1) - 0.5) * MG.VISTA * 2.2;
    const k = vistaK(a);
    if (k < 0.1) continue;
    const y = y0 + mgShoreRow(a) + hash(i * 3.3) * 22;
    const w = 180 + hash(i * 2.2) * 420, h = 8 + hash(i * 1.1) * 14;
    ctx.save();
    ctx.translate(panoX(a), y);
    ctx.scale(w / 2, h / 2);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(226,230,222,${0.5 * k})`); gr.addColorStop(1, 'rgba(226,230,222,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/**
 * The serpent in the lake: two coils of a body a hundred metres thick
 * breaking the water, and the head raised on the right, turned side on,
 * horned, grey with distance.
 */
function mgSerpent(ctx) {
  const r = 1500;
  const m = PX / r;
  const water = MG_LAND_HZ + Math.atan(MG.DROP / r) * PX;
  const body = [58, 70, 80];
  const dark = [34, 44, 54];
  const lit = [150, 160, 162];
  const air = 0.46;
  const col = (c) => css(mix(c, MG_FOG, air));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /** A length of body along a cubic from p0 to p3, thick `th`, tapering where it dives. */
  const length = (p0, p1, p2, p3, th, spines = true) => {
    const pt = (u) => {
      const v = 1 - u;
      return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
    };
    const N = 40;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(pt(i / N));
    const nrm = (i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    };
    const thick = (i) => th * m * (0.75 + 0.25 * Math.sin((i / N) * PI));
    // the body: an outline both sides, filled
    ctx.fillStyle = col(body);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const [nx, ny] = nrm(i); ctx.lineTo(pts[i][0] + nx * thick(i) / 2, pts[i][1] + ny * thick(i) / 2); }
    for (let i = N; i >= 0; i--) { const [nx, ny] = nrm(i); ctx.lineTo(pts[i][0] - nx * thick(i) / 2, pts[i][1] - ny * thick(i) / 2); }
    ctx.fill();
    // the underside in shadow, a lit band along the back
    ctx.fillStyle = col(dark);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const [nx, ny] = nrm(i); const s = ny > 0 ? 1 : -1; ctx.lineTo(pts[i][0] + nx * s * thick(i) * 0.5, pts[i][1] + ny * s * thick(i) * 0.5); }
    for (let i = N; i >= 0; i--) { const [nx, ny] = nrm(i); const s = ny > 0 ? 1 : -1; ctx.lineTo(pts[i][0] + nx * s * thick(i) * 0.05, pts[i][1] + ny * s * thick(i) * 0.05); }
    ctx.fill();
    ctx.strokeStyle = css(mix(lit, MG_FOG, air), 0.45);
    ctx.lineWidth = Math.max(1.5, th * m * 0.08);
    ctx.beginPath();
    for (let i = 2; i <= N - 2; i++) { const [nx, ny] = nrm(i); const s = ny > 0 ? -1 : 1; ctx.lineTo(pts[i][0] + nx * s * thick(i) * 0.36, pts[i][1] + ny * s * thick(i) * 0.36); }
    ctx.stroke();
    // plates across the body
    ctx.strokeStyle = 'rgba(20,28,34,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 2; i < N - 1; i += 2) {
      const [nx, ny] = nrm(i);
      ctx.moveTo(pts[i][0] + nx * thick(i) * 0.45, pts[i][1] + ny * thick(i) * 0.45);
      ctx.quadraticCurveTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * 0.8, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * 0.8, pts[i][0] - nx * thick(i) * 0.45, pts[i][1] - ny * thick(i) * 0.45);
    }
    ctx.stroke();
    if (!spines) return;
    ctx.fillStyle = col(dark);
    ctx.beginPath();
    for (let i = 6; i < N - 5; i += 4) {
      const [nx, ny] = nrm(i);
      const s = ny > 0 ? -1 : 1;
      const bx = pts[i][0] + nx * s * thick(i) * 0.46, by = pts[i][1] + ny * s * thick(i) * 0.46;
      const len = thick(i) * (0.22 + 0.12 * hash(i * 3.1));
      const tx = pts[i + 1][0] - pts[i][0], ty = pts[i + 1][1] - pts[i][1], tl = Math.hypot(tx, ty) || 1;
      ctx.moveTo(bx - tx / tl * len * 0.25, by - ty / tl * len * 0.25);
      ctx.lineTo(bx + nx * s * len - tx / tl * len * 0.35, by + ny * s * len - ty / tl * len * 0.35);
      ctx.lineTo(bx + tx / tl * len * 0.3, by + ty / tl * len * 0.3);
    }
    ctx.fill();
  };
  const x = panoX(MG.SERP_A);
  around(x, 900, (x0) => {
    const W0 = (dx) => x0 + dx * m;
    const Y0 = (dy) => water - dy * m;
    // a coil far off to the left, low, and a great loop nearer the head
    length([W0(-1000), Y0(-14)], [W0(-980), Y0(70)], [W0(-820), Y0(84)], [W0(-760), Y0(-14)], 56, false);
    length([W0(-700), Y0(-16)], [W0(-660), Y0(120)], [W0(-420), Y0(140)], [W0(-360), Y0(-16)], 76, false);
    length([W0(-300), Y0(-18)], [W0(-250), Y0(170)], [W0(-60), Y0(180)], [W0(-10), Y0(-18)], 96);
    // the neck up out of the water, and the head turned toward the cliff
    length([W0(40), Y0(-14)], [W0(120), Y0(160)], [W0(-40), Y0(250)], [W0(-30), Y0(340)], 120, true);
  });
  const hx = panoX(MG.SERP_A);
  around(hx, 500, (x) => {
    const head = [x - 30 * m, water - 350 * m];
    ctx.save();
    ctx.translate(head[0], head[1]);
    ctx.scale(m * 0.95, m * 0.95);
    // the head: a long wedge of skull over a jaw hung a little open
    ctx.fillStyle = col(dark);
    ctx.beginPath();
    ctx.moveTo(60, -30);
    ctx.bezierCurveTo(10, -92, -150, -84, -250, -34);
    ctx.lineTo(-272, -10);
    ctx.lineTo(-246, 2);
    ctx.bezierCurveTo(-180, -6, -100, 4, -30, 30);
    ctx.lineTo(-160, 40);
    ctx.lineTo(-214, 66);
    ctx.bezierCurveTo(-130, 88, -20, 84, 70, 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col(body);
    ctx.beginPath();
    ctx.moveTo(40, -30); ctx.bezierCurveTo(-10, -76, -140, -72, -236, -30); ctx.lineTo(-246, -12);
    ctx.bezierCurveTo(-170, -16, -90, -6, 20, 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css(mix(lit, MG_FOG, air), 0.45);
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(30, -44); ctx.bezierCurveTo(-20, -80, -140, -76, -236, -34); ctx.stroke();
    // horns sweeping back off the skull, a frill of spines down the neck
    ctx.fillStyle = col(dark);
    ctx.beginPath();
    ctx.moveTo(-6, -58); ctx.quadraticCurveTo(80, -150, 200, -150); ctx.quadraticCurveTo(96, -112, 36, -34); ctx.closePath();
    ctx.moveTo(-70, -70); ctx.quadraticCurveTo(-20, -178, 96, -214); ctx.quadraticCurveTo(10, -140, -30, -60); ctx.closePath();
    ctx.moveTo(-150, -62); ctx.lineTo(-130, -110); ctx.lineTo(-112, -66); ctx.closePath();
    for (let i = 0; i < 7; i++) {
      const px = 40 + i * 14, py = -10 + i * 30;
      ctx.moveTo(px, py); ctx.lineTo(px + 70 - i * 4, py - 24); ctx.lineTo(px + 6, py + 24);
    }
    ctx.fill();
    // teeth, pale, and the eye: a dull amber glint under a heavy brow
    ctx.fillStyle = css(mix([206, 200, 180], MG_FOG, air * 0.8), 0.95);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const px = -236 + i * 22; ctx.moveTo(px, -2); ctx.lineTo(px + 6, 22 - (i % 2) * 6); ctx.lineTo(px + 12, 0); }
    for (let i = 0; i < 8; i++) { const px = -190 + i * 24; ctx.moveTo(px, 44); ctx.lineTo(px + 6, 26); ctx.lineTo(px + 12, 42); }
    ctx.fill();
    glow(ctx, FX.gold, -84, -40, 34, 0.5);
    ctx.fillStyle = 'rgba(255,206,120,0.95)';
    ctx.beginPath(); ctx.ellipse(-84, -40, 12, 6, -0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = col(dark);
    ctx.beginPath(); ctx.moveTo(-120, -52); ctx.quadraticCurveTo(-80, -64, -50, -50); ctx.lineTo(-60, -46); ctx.quadraticCurveTo(-86, -54, -118, -46); ctx.fill();
    ctx.restore();
  });
  // where it breaks the water: a white wake round each
  ctx.strokeStyle = 'rgba(224,232,228,0.55)';
  ctx.lineWidth = 2.5;
  around(hx, 1000, (x0) => {
    for (const [dx, w] of [[-1000, 36], [-760, 36], [-700, 48], [-360, 48], [-300, 60], [-10, 60], [40, 80]]) {
      ctx.beginPath(); ctx.ellipse(x0 + dx * m, water + 3, w * m, 4, 0, 0, TAU); ctx.stroke();
    }
  });
  ctx.restore();
  // mist over it all, thicker at the water
  const mist = ctx.createLinearGradient(0, water - 420 * m, 0, water + 10);
  mist.addColorStop(0, 'rgba(190,200,196,0)'); mist.addColorStop(0.7, 'rgba(196,206,200,0.2)'); mist.addColorStop(1, 'rgba(210,216,208,0.55)');
  ctx.fillStyle = mist;
  const x0 = panoX(MG.SERP_A) - 1000 * m, x1 = panoX(MG.SERP_A) + 300 * m;
  ctx.fillRect(x0, water - 420 * m, x1 - x0, 420 * m + 12);
}

/** A stone tower on an island, and a long bridge of arches out to it. */
function mgTemple(ctx) {
  const r = 1900;
  const m = PX / r;
  const water = MG_LAND_HZ + Math.atan(MG.DROP / r) * PX;
  const col = css(mix([70, 80, 86], MG_FOG, 0.55));
  const x = panoX(MG.LAKE_A - 0.28);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, water, 90 * m, 10 * m, 0, PI, TAU); ctx.fill();
  ctx.fillRect(x - 22 * m, water - 190 * m, 44 * m, 190 * m);
  ctx.fillRect(x - 32 * m, water - 214 * m, 64 * m, 26 * m);
  ctx.beginPath(); ctx.moveTo(x - 30 * m, water - 214 * m); ctx.lineTo(x, water - 300 * m); ctx.lineTo(x + 30 * m, water - 214 * m); ctx.fill();
  ctx.fillRect(x - 560 * m, water - 54 * m, 540 * m, 12 * m);
  for (let i = 0; i < 9; i++) ctx.fillRect(x - 540 * m + i * 60 * m, water - 44 * m, 10 * m, 44 * m);
  ctx.fillStyle = 'rgba(230,226,200,0.35)';
  ctx.fillRect(x - 5 * m, water - 170 * m, 10 * m, 24 * m);
}

/** The woods: thousands of spruces in fading tiers of mist, none out over the lake. */
function mgForest(ctx) {
  const trees = [];
  for (let i = 0; i < 2600; i++) {
    const a = hash(i * 2.13 + 0.4) * TAU;
    const k = vistaK(a);
    if (hash(i * 7.7 + 0.1) < k * 1.15) continue;
    const r = Math.exp(lerp(Math.log(42), Math.log(900), Math.pow(hash(i * 3.9 + 0.2), 0.8)));
    trees.push({ a, r, ht: 18 + hash(i * 5.1) * 16, seed: i });
  }
  trees.sort((p, q) => q.r - p.r);
  const tiers = [520, 300, 170, 100, 60];
  let tier = 0;
  const mistBand = (R) => {
    const y = MG_LAND_HZ + rowOf(R);
    const up = Math.min(360, 26 * PX / R);
    stripsTinted(ctx, y - up, y + 4, (a) => [mgFog(a), 0, 0.5 * (1 - vistaK(a))], 8);
  };
  for (const t of trees) {
    while (tier < tiers.length && t.r < tiers[tier]) { mistBand(tiers[tier]); tier++; }
    const m = PX / t.r;
    const yb = MG_LAND_HZ + rowOf(t.r);
    const ht = t.ht * m, wd = t.ht * 0.2 * m;
    const air = mgAir(t.r);
    const back = Math.pow(Math.max(0, mgSunF(t.a)), 2);
    const base = mix(mix([30, 42, 38], [20, 26, 26], back), mgFog(t.a), air);
    ctx.fillStyle = css(base);
    around(panoX(t.a), wd, (x) => { ctx.beginPath(); spruce(ctx, x, yb, ht, wd, t.seed); ctx.fill(); });
    // the sun's side of the nearer ones catches a little light
    if (t.r < 160) {
      const side = Math.sin(wrap(MG.SUN_A - t.a)) > 0 ? 1 : -1;
      ctx.fillStyle = css(mix([160, 170, 140], mgFog(t.a), air), 0.18 * (1 - air));
      around(panoX(t.a), wd, (x) => {
        ctx.beginPath();
        ctx.moveTo(x, yb - ht);
        ctx.lineTo(x + side * wd * 0.9, yb - ht * 0.25);
        ctx.lineTo(x + side * wd * 0.2, yb - ht * 0.3);
        ctx.fill();
      });
    }
  }
  while (tier < tiers.length) { mistBand(tiers[tier]); tier++; }
}

/** The lip of the cliff across the vista: rock, dead grass and snow, the drop behind it. */
function mgLip(ctx) {
  const y0 = MG_LAND_HZ;
  const pts = [];
  for (let x = 0; x <= PW; x += 6) {
    const a = (x / PW) * TAU;
    const k = vistaK(a);
    pts.push([x, y0 + mgEdgeRow(a) - (2 + 7 * fbm(a, 90, 6, 3)) * k, k]);
  }
  // a band of dark rock at the edge, fading into the clifftop's own ground
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x, y, k] = pts[i];
    if (k < 0.02) continue;
    const gr = ctx.createLinearGradient(0, y, 0, y + 14);
    gr.addColorStop(0, css([54, 52, 44], k)); gr.addColorStop(0.5, css([60, 58, 48], 0.8 * k)); gr.addColorStop(1, 'rgba(60,58,48,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, y, 6.5, 14);
  }
  ctx.strokeStyle = 'rgba(170,166,146,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x, y, k] of pts) { if (k > 0.05) ctx.lineTo(x, y + 1); else ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const a = MG.LAKE_A + (hash(i * 1.93) - 0.5) * MG.VISTA * 2;
    const k = vistaK(a);
    if (k < 0.1) continue;
    const x = panoX(a), y = y0 + mgEdgeRow(a) - 2 + hash(i * 3.1) * 16;
    if (hash(i * 5.7) > 0.84) {
      ctx.fillStyle = 'rgba(226,232,236,0.85)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 5 + hash(i) * 12, 2 + hash(i * 2) * 3, 0, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = hash(i * 6.1) > 0.5 ? 'rgba(150,130,90,0.8)' : 'rgba(80,84,56,0.8)';
      ctx.lineWidth = 1.4;
      const h = 4 + hash(i * 4.2) * 9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (hash(i * 8.8) - 0.5) * 5, y - h); ctx.stroke();
    }
  }
}
// ------------------------------------------------------ close at hand, static

/** Trees, stones and the gate round the clearing: bearing, range, size. */
const MG_NEAR = (() => {
  const trees = [];
  const fixed = [[-0.5, 7.2, 1.05], [0.66, 12, 0.85], [1.02, 8.6, 0.95], [-0.98, 9.5, 0.8], [-1.32, 15, 0.75], [1.4, 11, 0.9], [2.1, 9, 0.85], [-2.3, 10, 0.95], [2.8, 13, 0.8], [-2.9, 8, 0.9]];
  for (const [a, r, w] of fixed) trees.push({ a, r, w, seed: trees.length * 7.3 + 1 });
  for (let i = 0; i < 90; i++) {
    const a = hash(i * 4.17 + 0.9) * TAU;
    const r = 10 + 34 * Math.pow(hash(i * 2.61 + 0.3), 1.25);
    if (vistaK(a) > 0.02) continue;
    if (Math.abs(wrap(a - MG.RUIN_A)) < 0.26 && r < 30) continue;
    if (Math.abs(wrap(a)) < 0.4) continue;
    if (trees.some((t) => Math.abs(wrap(t.a - a)) * Math.min(t.r, r) < 2.4 && Math.abs(t.r - r) < 5)) continue;
    trees.push({ a, r, w: 0.5 + 0.45 * hash(i * 5.3), seed: i * 3.1 + 40 });
  }
  const rocks = [];
  for (let i = 0; i < 22; i++) {
    const a = hash(i * 6.1 + 3) * TAU, r = 5.5 + hash(i * 2.3) * 26;
    if (vistaK(a) > 0.3 && r > MG.EDGE_R - 4) continue;
    rocks.push({ a, r, s: 0.5 + hash(i * 4.4) * 1.4, seed: i });
  }
  const stones = [
    { a: MG.STONE_A, r: 13, h: 2.5, seed: 1, raven: true },
    { a: MG.RUIN_A - 0.28, r: 16, h: 2.2, seed: 2 },
    { a: MG.RUIN_A + 0.31, r: 17, h: 2.7, seed: 3 },
    { a: 2.45, r: 18, h: 2.3, seed: 4 },
  ];
  const gate = { a: MG.RUIN_A, r: 21 };
  const ferns = [];
  for (let i = 0; i < 260; i++) {
    const r = lerp(3.3, 15, Math.pow(hash(i * 3.71 + 0.5), 1.3));
    const a = hash(i * 1.37 + 0.2) * TAU;
    if (vistaK(a) > 0.5 && r > MG.EDGE_R - 2) continue;
    if (Math.abs(wrap(a - MG.RUIN_A)) < 0.05) continue;
    ferns.push({ a, r, row: rowOf(r), m: PX / r, n: 5 + Math.floor(hash(i * 5.3) * 5), seed: i, snow: hash(i * 8.1) > 0.8 });
  }
  ferns.sort((p, q) => q.r - p.r);
  // everything that stands, far first, to draw round the enemy in order
  const all = [
    ...trees.map((t) => ({ ...t, kind: 'tree' })),
    ...rocks.map((t) => ({ ...t, kind: 'rock' })),
    ...stones.map((t) => ({ ...t, kind: 'stone' })),
    { ...gate, kind: 'gate' },
  ].sort((p, q) => q.r - p.r);
  return { trees, rocks, stones, gate, ferns, all };
})();

// -------------------------------------------------------- the ground, baked

const MG_GR_S = 0.5;
const MG_GR_ROWS = 440;
const MG_GR_HZ = 4;

function mgGround() {
  const [c, ctx] = panoCanvas(MG_GR_S, MG_GR_ROWS, MG_GR_HZ);
  const Y = (r) => MG_GR_HZ + rowOf(r);
  const base = ctx.createLinearGradient(0, MG_GR_HZ, 0, MG_GR_ROWS);
  [[0, '#7f8a82'], [0.025, '#5e665a'], [0.08, '#484b3c'], [0.25, '#3b3b30'], [0.6, '#302f27'], [1, '#26251f']].forEach(([o, col]) => base.addColorStop(o, col));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PW, MG_GR_ROWS);
  const flat = (a, r, size, style) => {
    const rx = (size / r) * PX;
    const ry = Math.max(0.6, ((size * 0.55 * CAM_H) / (r * r)) * PX);
    ctx.fillStyle = style;
    around(panoX(a), rx, (x) => { ctx.beginPath(); ctx.ellipse(x, Y(r), rx, ry, 0, 0, TAU); ctx.fill(); });
  };
  // moss, needles, mud and stone, laid flat
  for (let i = 0; i < 2200; i++) {
    const r = Math.exp(lerp(Math.log(3.4), Math.log(400), hash(i * 1.37 + 0.2)));
    const a = hash(i * 2.71 + 0.9) * TAU;
    const size = (0.3 + 1.6 * hash(i * 3.3)) * (0.6 + r / 60);
    const kind = hash(i * 5.9);
    flat(a, r, size, kind < 0.3 ? 'rgba(66,84,46,0.3)' : kind < 0.55 ? 'rgba(96,66,40,0.28)' : kind < 0.75 ? 'rgba(24,24,18,0.3)' : kind < 0.9 ? 'rgba(104,106,96,0.22)' : 'rgba(80,96,52,0.3)');
  }
  // snow lying in drifts where the canopy is thin
  // ragged patches of old snow, grey in the shade
  const patch = (a, r, size, seed, style) => {
    const rx = (size / r) * PX;
    const ry = Math.max(0.6, ((size * 0.55 * CAM_H) / (r * r)) * PX);
    ctx.fillStyle = style;
    around(panoX(a), rx, (x) => {
      ctx.beginPath();
      for (let k = 0; k < 11; k++) {
        const an = (k / 11) * TAU, q = 0.55 + 0.6 * hash(seed + k * 1.3);
        ctx.lineTo(x + Math.cos(an) * rx * q, Y(r) + Math.sin(an) * ry * q);
      }
      ctx.closePath();
      ctx.fill();
    });
  };
  for (let i = 0; i < 900; i++) {
    const r = Math.exp(lerp(Math.log(3.6), Math.log(300), hash(i * 4.13 + 0.7)));
    const a = hash(i * 1.93 + 0.6) * TAU;
    if (fbm(a, 5, 9, 3) < 0.52) continue;
    const size = (0.15 + 0.6 * hash(i * 6.7)) * (0.7 + r / 90);
    patch(a, r, size, i * 7.1, 'rgba(174,186,196,0.72)');
    patch(a, r * 0.995, size * 0.6, i * 3.9, 'rgba(206,214,222,0.6)');
  }
  // the old path to the gate, and back into the woods: flat stones in the moss
  const path = (dir, len) => {
    for (let d = 2.5; d < len; d += 0.9) {
      const wob = Math.sin(d * 0.09) * 1.6;
      const px = Math.sin(dir) * d + Math.cos(dir) * wob, pz = Math.cos(dir) * d - Math.sin(dir) * wob;
      for (let j = 0; j < 2; j++) {
        const ox = (hash(d * 3.1 + j) - 0.5) * 1.4, oz = (hash(d * 7.3 + j) - 0.5) * 0.6;
        const qx = px + Math.cos(dir) * ox + Math.sin(dir) * oz, qz = pz - Math.sin(dir) * ox + Math.cos(dir) * oz;
        const r = Math.hypot(qx, qz), a = bearing(qx, qz);
        const size = 0.35 + hash(d * 5.3 + j) * 0.3;
        flat(a, r * 1.004, size * 1.1, 'rgba(24,24,20,0.5)');
        flat(a, r, size, hash(d + j) > 0.5 ? 'rgba(128,128,116,0.9)' : 'rgba(104,106,96,0.9)');
      }
    }
  };
  path(MG.RUIN_A + 0.02, 21);
  path(PI + 0.4, 60);
  // the trees' shadows, soft under a veiled sun, and light between them
  const sdx = Math.sin(MG.SUN_A + PI), sdz = Math.cos(MG.SUN_A + PI);
  ctx.fillStyle = 'rgba(16,20,18,0.2)';
  for (const t of MG_NEAR.trees) {
    const bx = Math.sin(t.a) * t.r, bz = Math.cos(t.a) * t.r;
    const nx = -sdz, nz = sdx;
    const poly = [[0, -0.6], [0, 0.6], [14, 1.6], [14, -1.6]].map(([u, w]) => {
      const qx = bx + sdx * u + nx * w * t.w, qz = bz + sdz * u + nz * w * t.w;
      return [t.a + wrap(bearing(qx, qz) - t.a), Math.hypot(qx, qz)];
    });
    if (poly.some(([, r]) => r < 2.5)) continue;
    const x0 = (poly[0][0] / TAU) * PW;
    const off = x0 < 0 ? PW : x0 > PW ? -PW : 0;
    around(x0 + off, 500, (xx) => {
      const d = xx - x0;
      ctx.beginPath();
      for (const [pa, pr] of poly) ctx.lineTo((pa / TAU) * PW + d, Y(pr));
      ctx.closePath();
      ctx.fill();
    });
  }
  for (let i = 0; i < 260; i++) {
    const a = MG.SUN_A + PI + (hash(i * 3.3) - 0.5) * 2.6;
    const r = Math.exp(lerp(Math.log(4), Math.log(60), hash(i * 5.1)));
    flat(a, r, 0.4 + hash(i * 2.2) * 1.2, 'rgba(236,222,170,0.12)');
  }
  // needles and twigs, and tufts of grass, finer with distance
  ctx.lineCap = 'round';
  const cols = ['rgba(52,58,36,0.8)', 'rgba(84,92,52,0.75)', 'rgba(132,120,76,0.6)', 'rgba(150,158,106,0.5)'];
  const bands = [[2, 20, 0.9, 110], [20, 70, 1.3, 150], [70, 180, 1.6, 320]];
  bands.forEach(([r0, r1, lw, per], b) => {
    const count = Math.round(((r1 - r0) * PW) / per / cols.length);
    cols.forEach((col, ci) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const seed = b * 100003 + ci * 10007 + i;
        const row = r0 + (r1 - r0) * hash(seed * 1.31 + 0.7);
        const r = rangeOf(row);
        const x = hash(seed * 0.73 + 0.1) * PW;
        const a = (x / PW) * TAU;
        if (vistaK(a) > 0.5 && r > MG.EDGE_R) continue;
        const len = clamp((0.16 / r) * PX * (0.5 + 0.9 * hash(seed * 2.9)), 1, 9);
        const lean = (hash(seed * 3.7) - 0.5) * 0.9;
        const y = MG_GR_HZ + row;
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean * len, y - len);
      }
      ctx.stroke();
    });
  });
  // the mist at the foot of the woods, and warmth toward the sun
  stripsTinted(ctx, 0, MG_GR_HZ + 60, (a) => [mgFog(a), 0.85 * (1 - vistaK(a) * 0.6), 0], 8);
  stripsTinted(ctx, 0, MG_GR_ROWS, (a) => [[236, 218, 170], 0, Math.pow(Math.max(0, mgSunF(a)), 2) * 0.12], 8);
  stripsTinted(ctx, 0, MG_GR_ROWS, (a) => [[20, 26, 30], 0, Math.pow(Math.max(0, -mgSunF(a)), 1.5) * 0.22], 8);
  closeRing(c);
  return c;
}

// ============================================================ the sprites

function buildBark(dark, mid, light, moss, frost) {
  const c = makeCanvas(96, 512);
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 96, 0);
  gr.addColorStop(0, css(dark)); gr.addColorStop(0.28, css(mid)); gr.addColorStop(0.55, css(mix(mid, light, 0.4)));
  gr.addColorStop(0.82, css(mix(dark, mid, 0.4))); gr.addColorStop(1, css(mix(dark, [0, 0, 0], 0.3)));
  x.fillStyle = gr;
  x.fillRect(0, 0, 96, 512);
  x.lineCap = 'round';
  // plates of bark: long vertical ridges and dark fissures
  for (let i = 0; i < 220; i++) {
    const px = hash(i * 1.3) * 96, py = hash(i * 2.7) * 560 - 40, len = 30 + hash(i * 3.9) * 160;
    const edge = Math.abs(px / 96 - 0.5) * 2;
    x.strokeStyle = i % 3 === 0 ? `rgba(${light.join(',')},${(0.25 * (1 - edge)).toFixed(3)})` : 'rgba(10,10,8,0.35)';
    x.lineWidth = 1 + hash(i * 4.1) * 3.5;
    x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + (hash(i) - 0.5) * 6, py + len * 0.3, px + (hash(i + 3) - 0.5) * 6, py + len * 0.7, px + (hash(i + 5) - 0.5) * 4, py + len); x.stroke();
  }
  // moss creeping up from the roots, lichen in spots
  if (moss) {
    for (let i = 0; i < 1400; i++) {
      const py = 512 - Math.pow(hash(i * 5.3), 2.4) * 340, px = hash(i * 6.1) * 96;
      const side = Math.abs(px / 96 - 0.4);
      x.fillStyle = css(mix(moss, [30, 36, 22], hash(i * 2.9) * 0.6), (0.1 + 0.35 * hash(i * 7.7)) * (py / 512) * (1 - side));
      x.beginPath(); x.ellipse(px, py, 0.8 + hash(i) * 2.6, 0.8 + hash(i * 2) * 3.4, 0, 0, TAU); x.fill();
    }
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = frost ? 'rgba(230,240,250,0.5)' : 'rgba(170,176,150,0.3)';
    x.beginPath(); x.ellipse(hash(i * 8.1) * 96, hash(i * 9.3) * 512, 1 + hash(i) * 3, 1 + hash(i * 3) * 3, 0, 0, TAU); x.fill();
  }
  if (frost) {
    // snow packed on the windward side
    for (let i = 0; i < 160; i++) {
      x.fillStyle = `rgba(236,244,252,${(0.3 + 0.5 * hash(i * 2.2)).toFixed(3)})`;
      x.beginPath(); x.ellipse(4 + hash(i * 3.1) * 16, hash(i * 1.7) * 512, 2 + hash(i) * 6, 3 + hash(i * 4) * 10, 0, 0, TAU); x.fill();
    }
  }
  return c;
}

let FX = null;

function buildFx() {
  const fx = {};
  fx.frost = glowSprite([120, 200, 255]);
  fx.fire = glowSprite([255, 118, 28]);
  fx.ember = glowSprite([255, 180, 70], 0.08);
  fx.eye = glowSprite([255, 140, 30], 0.06);
  fx.spirit = glowSprite([90, 170, 255]);
  fx.red = glowSprite([255, 30, 20]);
  fx.gold = glowSprite([255, 196, 96]);
  fx.white = glowSprite([240, 248, 255], 0.08);
  fx.green = glowSprite([110, 255, 170]);
  fx.violet = glowSprite([170, 120, 255]);
  fx.mist = softBlob([220, 226, 220], 0.9);
  fx.snow = softBlob([240, 246, 255], 1, 32);
  fx.dust = softBlob([150, 150, 136], 0.85);
  fx.smoke = softBlob([40, 36, 34], 0.8);
  fx.bark = buildBark([16, 16, 14], [44, 42, 36], [118, 114, 100], [70, 92, 46], false);
  fx.barkFrost = buildBark([24, 28, 34], [70, 74, 80], [170, 180, 190], null, true);
  // the frame every shot gets: dark and soft at the edges
  fx.vignette = makeCanvas(W, H);
  let x = fx.vignette.getContext('2d');
  let gr = x.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H * 0.5, W * 0.74);
  gr.addColorStop(0, 'rgba(6,10,12,0)'); gr.addColorStop(0.62, 'rgba(6,10,12,0.2)'); gr.addColorStop(1, 'rgba(2,4,6,0.66)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  fx.death = makeCanvas(W, H);
  x = fx.death.getContext('2d');
  gr = x.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, W * 0.7);
  gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0.95)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // rage: the edges run red
  fx.rage = makeCanvas(W, H);
  x = fx.rage.getContext('2d');
  gr = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.66);
  gr.addColorStop(0, 'rgba(200,20,10,0)'); gr.addColorStop(0.6, 'rgba(200,24,10,0.2)'); gr.addColorStop(1, 'rgba(160,10,4,0.75)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // shafts of light slanting down through the canopy
  fx.rays = makeCanvas(512, 1024);
  x = fx.rays.getContext('2d');
  for (let i = 0; i < 11; i++) {
    const cx = 80 + hash(i * 3.3) * 380, w = 10 + hash(i * 5.1) * 40;
    const g2 = x.createLinearGradient(0, 0, 0, 1024);
    const al = 0.05 + hash(i) * 0.06;
    g2.addColorStop(0, 'rgba(255,246,214,0)'); g2.addColorStop(0.18, `rgba(255,244,210,${al.toFixed(3)})`); g2.addColorStop(0.7, `rgba(255,240,200,${(al * 0.5).toFixed(3)})`); g2.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g2;
    // several passes, each narrower, so the beam's edges are soft
    for (let k = 0; k < 6; k++) {
      const ww = w * (1 - k * 0.15);
      const o = (w - ww) / 2;
      x.beginPath(); x.moveTo(cx + o, 0); x.lineTo(cx + o + ww, 0); x.lineTo(cx + o + ww * 2.4 - 260, 1024); x.lineTo(cx + o - 260 - ww * 0.2, 1024); x.fill();
    }
  }
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
  // a gust of snow, tiling side to side
  fx.gust = makeCanvas(512, 256);
  x = fx.gust.getContext('2d');
  const gi = x.createImageData(512, 256);
  for (let py = 0; py < 256; py++) {
    const vy = Math.sin((py / 256) * PI);
    for (let px = 0; px < 512; px++) {
      const f = (u) => vnoise(u * 0.012, py * 0.02) * 0.6 + vnoise(u * 0.03, py * 0.05 + 7) * 0.4;
      const n = lerp(f(px), f(px + 512), px / 512);
      const a = smoothstep(0.42, 0.78, n) * vy * 210;
      const i = (py * 512 + px) * 4;
      gi.data[i] = 226; gi.data[i + 1] = 236; gi.data[i + 2] = 248; gi.data[i + 3] = a;
    }
  }
  x.putImageData(gi, 0, 0);
  fx.axe = bakeAxe();
  fx.blade = bakeBlade();
  fx.bodies = {};
  return fx;
}
// ================================================= Midgard, drawn each frame

// per-tree colours, made once
for (const t of MG_NEAR.trees) {
  const back = Math.pow(Math.max(0, mgSunF(t.a)), 2);
  const air = mgAir(t.r);
  t.fog = css(mgFog(t.a), clamp01(air * 0.9 + 0.04));
  t.shade = `rgba(8,12,12,${(0.12 + back * 0.4).toFixed(3)})`;
  t.leaf = css(mix(mix([30, 44, 38], [18, 24, 24], back), mgFog(t.a), air * 0.9 + 0.05));
  t.leafLit = css(mix([96, 110, 84], mgFog(t.a), air), 0.5);
  t.side = Math.sin(wrap(MG.SUN_A - t.a)) > 0 ? 1 : -1;
  t.hb = 4.6 + 2.6 * hash(t.seed * 1.7);
  t.snow = hash(t.seed * 3.3) > 0.45;
}

const BARK_H = 14;

/** A trunk close by, from its roots to off the top of the screen, and its lowest tiers if they show. */
function mgTree(ctx, t, yaw, hz) {
  const m = PX / t.r;
  const w = t.w * m;
  const rel = wrap(t.a - yaw);
  if (Math.abs(rel) * PX > W / 2 + w * 4 + 40) return;
  const x = W / 2 + rel * PX;
  const y0 = hz + rowOf(t.r);
  const top = -10;
  const hTop = Math.min(BARK_H, CAM_H + (hz - top) / m);
  const s0 = 512 * (1 - hTop / BARK_H);
  // roots flaring into the ground
  ctx.fillStyle = '#1c1c18';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y0 - 0.9 * m);
  ctx.quadraticCurveTo(x - w * 0.55, y0 - 0.1 * m, x - w * 1.05, y0 + 0.06 * m);
  ctx.lineTo(x + w * 1.1, y0 + 0.06 * m);
  ctx.quadraticCurveTo(x + w * 0.55, y0 - 0.1 * m, x + w * 0.5, y0 - 0.9 * m);
  ctx.fill();
  ctx.drawImage(FX.bark, 0, s0, 96, 512 - s0, x - w / 2, top, w, y0 - 0.2 * m - top);
  // the sun's side, a thin warm edge
  ctx.fillStyle = 'rgba(226,212,170,0.16)';
  ctx.fillRect(x + (t.side > 0 ? w * 0.22 : -w * 0.4), top, w * 0.18, y0 - top);
  // the backlight, and mist between it and the camera
  ctx.beginPath();
  ctx.rect(x - w / 2, top, w, y0 - top);
  ctx.moveTo(x - w * 1.05, y0 + 0.06 * m); ctx.quadraticCurveTo(x - w * 0.55, y0 - 0.1 * m, x - w * 0.5, y0 - 0.9 * m); ctx.lineTo(x + w * 0.5, y0 - 0.9 * m); ctx.quadraticCurveTo(x + w * 0.55, y0 - 0.1 * m, x + w * 1.1, y0 + 0.06 * m);
  ctx.fillStyle = t.shade;
  ctx.fill();
  ctx.fillStyle = t.fog;
  ctx.fill();
  // snow drifted against it
  if (t.snow) {
    ctx.fillStyle = 'rgba(214,224,232,0.9)';
    ctx.beginPath(); ctx.ellipse(x - t.side * w * 0.5, y0, w * 0.9, Math.max(1.5, 0.12 * m), 0, PI, TAU); ctx.fill();
  }
  // the lowest tiers of branches, drooping, if they are on screen
  const yb = hz - (t.hb - CAM_H) * m;
  if (yb > -80) {
    ctx.fillStyle = t.leaf;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const h = t.hb + k * 1.25;
      const y = hz - (h - CAM_H) * m;
      if (y < -1.5 * m) break;
      const hw = (3.1 - k * 0.08) * m * (0.75 + 0.45 * hash(t.seed + k * 2.9));
      for (const s of [-1, 1]) {
        const reach = hw * (0.8 + 0.3 * hash(t.seed * 3 + k + s));
        ctx.moveTo(x, y - 0.35 * m);
        ctx.quadraticCurveTo(x + s * reach * 0.55, y - 0.35 * m, x + s * reach, y + 0.75 * m);
        for (let j = 1; j <= 5; j++) {
          const u = 1 - j / 5;
          ctx.lineTo(x + s * reach * (u + 0.08), y + (0.35 + 0.45 * u) * m + (j % 2 ? 0.28 : 0) * m);
        }
        ctx.lineTo(x, y + 0.2 * m);
      }
    }
    ctx.fill();
    ctx.fillStyle = t.leafLit;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const h = t.hb + k * 1.25;
      const y = hz - (h - CAM_H) * m;
      if (y < -1.5 * m) break;
      const reach = (2.6 - k * 0.08) * m * (0.75 + 0.45 * hash(t.seed + k * 2.9));
      ctx.moveTo(x, y - 0.3 * m);
      ctx.quadraticCurveTo(x + t.side * reach * 0.55, y - 0.3 * m, x + t.side * reach, y + 0.6 * m);
      ctx.lineTo(x + t.side * reach * 0.5, y + 0.05 * m);
    }
    ctx.fill();
  }
}

function mgRock(ctx, o, x, y, m) {
  const s = o.s * m;
  ctx.fillStyle = 'rgba(10,12,10,0.35)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y, s * 0.8, s * 0.12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#434541';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.62, y);
  ctx.quadraticCurveTo(x - s * 0.7, y - s * (0.5 + hash(o.seed) * 0.2), x - s * 0.12, y - s * 0.68);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.72, x + s * 0.64, y - s * 0.12);
  ctx.lineTo(x + s * 0.6, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.moveTo(x - s * 0.62, y); ctx.quadraticCurveTo(x, y - s * 0.3, x + s * 0.6, y); ctx.fill();
  // moss on the shoulders, snow on the crown
  ctx.fillStyle = '#56663a';
  ctx.beginPath(); ctx.ellipse(x - s * 0.25, y - s * 0.52, s * 0.34, s * 0.12, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(206,216,224,0.85)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y - s * 0.62);
  ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.74, x + s * 0.22, y - s * 0.7);
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.62, x + s * 0.46, y - s * 0.5);
  ctx.quadraticCurveTo(x + s * 0.1, y - s * 0.6, x - s * 0.3, y - s * 0.62);
  ctx.fill();
  // cracks and a lit edge
  ctx.strokeStyle = 'rgba(20,22,20,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath(); ctx.moveTo(x + s * 0.1, y - s * 0.6); ctx.lineTo(x + s * 0.18, y - s * 0.34); ctx.lineTo(x + s * 0.3, y - s * 0.2); ctx.stroke();
}

/** A rune stone: a tall grey slab, lichened, its carving lit a faint blue. */
function mgStone(ctx, o, x, y, m, t) {
  const h = o.h * m, w = 0.95 * m;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((hash(o.seed * 3.1) - 0.5) * 0.08);
  ctx.fillStyle = 'rgba(10,12,10,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.9, w * 0.14, 0, 0, TAU); ctx.fill();
  const gr = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  gr.addColorStop(0, '#3c403e'); gr.addColorStop(0.45, '#6a6e68'); gr.addColorStop(1, '#2e3230');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.lineTo(-w * 0.46, -h * 0.82);
  ctx.quadraticCurveTo(-w * 0.4, -h * 1.02, w * 0.05, -h);
  ctx.quadraticCurveTo(w * 0.48, -h * 0.96, w * 0.5, -h * 0.78);
  ctx.lineTo(w * 0.52, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(120,140,80,0.35)';
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse((hash(o.seed + i) - 0.5) * w * 0.8, -h * hash(o.seed * 2 + i) * 0.9, w * 0.12, w * 0.07, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(226,234,238,0.9)';
  ctx.beginPath(); ctx.moveTo(-w * 0.42, -h * 0.94); ctx.quadraticCurveTo(0, -h * 1.06, w * 0.46, -h * 0.9); ctx.quadraticCurveTo(0, -h * 0.97, -w * 0.42, -h * 0.94); ctx.fill();
  // the carving: a band of runes down the face
  const pulse = 0.65 + 0.35 * Math.sin(t * 1.3 + o.seed * 2);
  const rh = w * 0.22;
  glow(ctx, FX.frost, 0, -h * 0.5, h * 0.55, 0.35 * pulse);
  ctx.strokeStyle = 'rgba(20,24,24,0.8)';
  ctx.lineWidth = Math.max(1, rh * 0.22);
  ctx.lineCap = 'round';
  runeColumn(ctx, o.seed * 11, 0, -h * 0.84, rh, 5, 0.32);
  ctx.strokeStyle = `rgba(140,214,255,${(0.75 * pulse).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.8, rh * 0.12);
  runeColumn(ctx, o.seed * 11, 0, -h * 0.84, rh, 5, 0.32);
  ctx.restore();
}

/** One of the god's ravens, spectral green, perched and looking about. */
function drawRaven(ctx, x, y, s, t) {
  const bob = Math.sin(t * 2.1) > 0.7 ? 0.08 : 0;
  const turn = Math.sin(t * 0.7) > 0 ? 1 : -1;
  glow(ctx, FX.green, x, y - s * 0.5, s * 2.2, 0.55 + 0.15 * Math.sin(t * 3));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * turn, s);
  ctx.fillStyle = 'rgba(20,50,34,0.9)';
  ctx.beginPath();
  ctx.moveTo(-0.55, -0.1); ctx.lineTo(-0.2, -0.35); ctx.quadraticCurveTo(0.1, -0.62, 0.26, -0.6 + bob);
  ctx.quadraticCurveTo(0.4, -0.78 + bob, 0.5, -0.66 + bob); ctx.lineTo(0.72, -0.62 + bob); ctx.lineTo(0.5, -0.56 + bob);
  ctx.quadraticCurveTo(0.42, -0.4, 0.3, -0.28); ctx.quadraticCurveTo(0.1, -0.05, -0.2, -0.12); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,255,190,0.9)';
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,255,220,1)';
  ctx.beginPath(); ctx.arc(0.44, -0.66 + bob, 0.035, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(20,50,34,0.9)';
  ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(0.05, -0.12); ctx.lineTo(0.02, 0); ctx.moveTo(0.14, -0.14); ctx.lineTo(0.14, 0); ctx.stroke();
  ctx.restore();
}

/** The old gate: two pillars and a lintel, knotwork cut in them, runes lit along the top. */
function mgGate(ctx, o, x, y, m, t) {
  const pw = 1.15 * m, ph = 4.7 * m, gap = 3.3 * m;
  const stone = (x0, y0, w, h) => {
    const gr = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    gr.addColorStop(0, '#3a3e3c'); gr.addColorStop(0.4, '#646862'); gr.addColorStop(1, '#2c302e');
    ctx.fillStyle = gr;
    ctx.fillRect(x0, y0, w, h);
  };
  ctx.fillStyle = 'rgba(10,12,10,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, gap * 1.2, 0.2 * m, 0, 0, TAU); ctx.fill();
  // broken wall stubs either side
  ctx.fillStyle = '#44484a';
  ctx.beginPath();
  ctx.moveTo(x - gap / 2 - pw - 3.2 * m, y); ctx.lineTo(x - gap / 2 - pw - 3.2 * m, y - 0.9 * m); ctx.lineTo(x - gap / 2 - pw - 1.6 * m, y - 1.6 * m); ctx.lineTo(x - gap / 2 - pw - 0.8 * m, y - 1.3 * m); ctx.lineTo(x - gap / 2 - pw, y - 2.2 * m); ctx.lineTo(x - gap / 2 - pw, y);
  ctx.moveTo(x + gap / 2 + pw, y); ctx.lineTo(x + gap / 2 + pw, y - 1.8 * m); ctx.lineTo(x + gap / 2 + pw + 1.3 * m, y - 1.1 * m); ctx.lineTo(x + gap / 2 + pw + 2.6 * m, y - 0.6 * m); ctx.lineTo(x + gap / 2 + pw + 2.6 * m, y);
  ctx.fill();
  stone(x - gap / 2 - pw, y - ph, pw, ph);
  stone(x + gap / 2, y - ph, pw, ph);
  stone(x - gap / 2 - pw * 1.35, y - ph - 1.0 * m, gap + pw * 2.7, 1.0 * m);
  // the dark way through
  const dg = ctx.createLinearGradient(0, y - ph, 0, y);
  dg.addColorStop(0, 'rgba(10,14,14,0.55)'); dg.addColorStop(1, 'rgba(10,14,14,0.2)');
  ctx.fillStyle = dg;
  ctx.fillRect(x - gap / 2, y - ph, gap, ph);
  // knotwork bands cut down the pillars
  ctx.strokeStyle = 'rgba(20,24,22,0.55)';
  ctx.lineWidth = Math.max(1, 0.06 * m);
  for (const px of [x - gap / 2 - pw / 2, x + gap / 2 + pw / 2]) {
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const yy = y - ph + (k + 0.5) * (ph / 7);
      ctx.moveTo(px - pw * 0.32, yy - ph / 16); ctx.bezierCurveTo(px + pw * 0.4, yy - ph / 20, px - pw * 0.4, yy + ph / 20, px + pw * 0.32, yy + ph / 16);
      ctx.moveTo(px + pw * 0.32, yy - ph / 16); ctx.bezierCurveTo(px - pw * 0.4, yy - ph / 20, px + pw * 0.4, yy + ph / 20, px - pw * 0.32, yy + ph / 16);
    }
    ctx.stroke();
  }
  // moss and snow on the lintel
  ctx.fillStyle = '#56663a';
  ctx.fillRect(x - gap / 2 - pw * 1.35, y - ph - 0.12 * m, gap + pw * 2.7, 0.16 * m);
  ctx.fillStyle = 'rgba(226,234,238,0.92)';
  ctx.beginPath(); ctx.ellipse(x - 0.4 * m, y - ph - 1.0 * m, gap * 0.5, 0.18 * m, 0, PI, TAU); ctx.fill();
  // runes along the lintel, lit
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.9);
  glow(ctx, FX.frost, x, y - ph - 0.5 * m, gap * 0.8, 0.18 * pulse);
  const rh = 0.46 * m;
  ctx.lineCap = 'round';
  for (const [col, lw] of [['rgba(16,20,20,0.75)', 0.09], [`rgba(130,206,255,${(0.55 * pulse).toFixed(3)})`, 0.04]]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, lw * m);
    ctx.beginPath();
    for (let i = 0; i < 9; i++) runePath(ctx, Math.floor(hash(i * 5.7 + 2) * 23), x - gap / 2 - pw + i * ((gap + pw * 2) / 9) + 0.1 * m, y - ph - 0.78 * m, rh);
    ctx.stroke();
  }
}

function mgObject(ctx, o, yaw, hz, t) {
  if (o.kind === 'tree') { mgTree(ctx, o, yaw, hz); return; }
  const rel = wrap(o.a - yaw);
  const m = PX / o.r;
  const span = o.kind === 'gate' ? 6 * m : 2 * m;
  if (Math.abs(rel) * PX > W / 2 + span) return;
  const x = W / 2 + rel * PX, y = hz + rowOf(o.r);
  if (o.kind === 'rock') mgRock(ctx, o, x, y, m);
  else if (o.kind === 'stone') {
    mgStone(ctx, o, x, y, m, t);
    if (o.raven) drawRaven(ctx, x + 0.05 * m, y - o.h * m * 0.98, 0.62 * m, t);
  } else if (o.kind === 'gate') mgGate(ctx, o, x, y, m, t);
  // mist in front of it, as for the trees
  const air = mgAir(o.r);
  if (air > 0.04 && o.kind !== 'gate') {
    ctx.fillStyle = css(mgFog(o.a), air * 0.7);
    ctx.fillRect(x - span, y - 3 * m, span * 2, 3.1 * m);
  }
}

/** Ferns round the fly's feet, stirring: each frond a curved stem with its leaflets. */
function mgFerns(ctx, g, t, hz) {
  const yaw = camYaw(g);
  const lim = HALF_FOV + 0.1;
  const wind = Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.02;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(26,36,22,0.95)' : 'rgba(78,98,54,0.9)';
    ctx.beginPath();
    for (const f of MG_NEAR.ferns) {
      const rel = wrap(f.a - yaw);
      if (Math.abs(rel) > lim) continue;
      const x = W / 2 + rel * PX, y = hz + f.row;
      if (y > H + 30) continue;
      const len = 0.6 * f.m;
      for (let j = 0; j < f.n; j++) {
        if (pass === 1 && j % 2 === 0) continue;
        const ang = (j / (f.n - 1) - 0.5) * 2.2 + (hash(f.seed + j) - 0.5) * 0.3 + wind;
        const l = len * (0.6 + 0.5 * hash(f.seed * 3 + j));
        const tx = x + Math.sin(ang) * l, ty = y - Math.cos(ang) * l * 0.62 + l * 0.12;
        const cx = x + Math.sin(ang) * l * 0.45, cy = y - l * 0.62;
        ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, tx, ty);
        // leaflets down both sides, shorter toward the tip
        const leaf = l * 0.16;
        for (let k = 1; k < 7; k++) {
          const u = k / 7, v = 1 - u;
          const px = v * v * x + 2 * v * u * cx + u * u * tx, py = v * v * y + 2 * v * u * cy + u * u * ty;
          const qx = 2 * v * (cx - x) + 2 * u * (tx - cx), qy = 2 * v * (cy - y) + 2 * u * (ty - cy);
          const ql = Math.hypot(qx, qy) || 1;
          const ll = leaf * (1 - u * 0.75);
          ctx.moveTo(px, py); ctx.lineTo(px - qy / ql * ll + qx / ql * ll * 0.5, py + qx / ql * ll + qy / ql * ll * 0.5);
          ctx.moveTo(px, py); ctx.lineTo(px + qy / ql * ll + qx / ql * ll * 0.5, py - qx / ql * ll + qy / ql * ll * 0.5);
        }
      }
    }
    ctx.lineWidth = pass === 0 ? 2.4 : 1.6;
    ctx.stroke();
  }
}

/** Dust and flakes turning in the light, and the shafts of it through the canopy. */
function mgAir2(ctx, g, t, hz, pass) {
  const yaw = camYaw(g);
  if (pass === 0) {
    const x = bearingX(g, MG.SUN_A);
    const vis = clamp01(1 - (Math.abs(x - W / 2) - W * 0.4) / 600);
    if (vis > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 * vis * (0.85 + 0.15 * Math.sin(t * 0.4));
      ctx.drawImage(FX.rays, x - 180, hz - 420, 700, 1100);
      ctx.globalAlpha = 0.12 * vis;
      ctx.drawImage(FX.rays, x - 700, hz - 380, 520, 900);
      ctx.restore();
    }
    // mist drifting across the clearing's edge
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const span = W + 900;
      let mx = (hash(i * 3.7) * span - yaw * PX * 0.9 + t * (6 + i * 2)) % span;
      if (mx < 0) mx += span;
      mx -= 450;
      const my = hz + 10 + hash(i * 5.3) * 60;
      ctx.globalAlpha = 0.16 + 0.08 * hash(i);
      ctx.drawImage(FX.mist, mx - 320, my - 50, 640, 110);
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(236,236,220,0.5)';
  ctx.beginPath();
  for (let i = 0; i < 70; i++) {
    const span = W + 200;
    let x = (hash(i * 1.7) * span - yaw * PX * 1.2 + t * (4 + hash(i * 2.9) * 10) + Math.sin(t * 0.5 + i) * 14) % span;
    if (x < 0) x += span;
    x -= 100;
    const y = (hash(i * 3.3) * 760 + t * (10 + hash(i * 4.1) * 16)) % 760 - 20;
    const r = 0.8 + hash(i * 5.1) * 1.8;
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}
// ================================================= Fimbulwinter, Ragnarök

/**
 * The third winter: a frozen lake under a night that will not end. The
 * mission starts looking across the ice at a dwarven gate cut in a far
 * cliff, gold light and steam pouring out of it; the aurora burns over the
 * left of the sky; longships stand frozen in the ice; ice cliffs and a
 * frozen fall to the west; the snowed-under shore behind; a wolf sled
 * waiting. And the snow never stops.
 */
const FW = {
  FORGE_A: 0.28,
  AURORA_A: -0.5,
  CLIFF_A: -1.75,
  SHORE_A: PI,
  SLED_A: 0.95,
};
const fwForgeF = (a) => Math.cos(a - FW.FORGE_A);
const FW_FOG = [150, 172, 198];
const FW_FOG_GOLD = [236, 196, 140];
/** The blizzard's colour at a bearing: blue-white, gold toward the gate. */
const fwFog = (a) => mix(FW_FOG, FW_FOG_GOLD, Math.pow(Math.max(0, fwForgeF(a)), 12) * 0.55);
const auroraK = (a) => Math.max(0, 1 - Math.abs(wrap(a - FW.AURORA_A)) / 1.5);

// ---------------------------------------------------------- the sky, baked

const FW_SKY_HZ = 470;

function fwSky() {
  const [c, ctx] = panoCanvas(0.5, 520, FW_SKY_HZ);
  const HZ = FW_SKY_HZ;
  const base = ctx.createLinearGradient(0, 0, 0, HZ);
  [[0, '#08101f'], [0.35, '#122440'], [0.65, '#2a4466'], [0.86, '#5c7896'], [1, '#90a8c0']].forEach(([o, col]) => base.addColorStop(o, col));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PW, 520);
  // stars, thin where the aurora is, lost elsewhere in the snow
  for (let i = 0; i < 900; i++) {
    const a = hash(i * 1.71) * TAU, y = hash(i * 2.93) * HZ * 0.62;
    const k = 0.25 + auroraK(a) * 0.75;
    if (hash(i * 5.1) > k) continue;
    ctx.fillStyle = `rgba(230,240,255,${(0.25 + 0.6 * hash(i * 3.3)) * k})`;
    const s = 0.8 + hash(i * 7.7) * 1.6;
    ctx.fillRect(panoX(a), y, s, s);
  }
  // the gate's glow on the underside of the snow clouds
  const gx = panoX(FW.FORGE_A);
  around(gx, 1200, (x) => {
    ctx.save();
    ctx.translate(x, HZ - 40);
    ctx.scale(2.4, 1);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 420);
    [[0, 'rgba(255,214,150,0.75)'], [0.12, 'rgba(255,190,120,0.45)'], [0.4, 'rgba(200,150,120,0.15)'], [1, 'rgba(160,140,140,0)']].forEach(([o, col]) => gl.addColorStop(o, col));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, 0, 420, 0, TAU); ctx.fill();
    ctx.restore();
  });
  // heavy snow clouds, dark and low where the aurora is not
  const banks = [];
  for (let i = 0; i < 40; i++) banks.push({ a: hash(i * 3.71 + 0.3) * TAU, y: HZ - 60 - hash(i * 5.3) * 340, w: 320 + hash(i * 7.9) * 620, h: 50 + hash(i * 2.7) * 70, seed: i * 17.3 });
  banks.sort((p, q) => q.y - p.y);
  for (const b of banks) {
    const clear = auroraK(b.a);
    if (hash(b.seed) < clear * 0.9) continue;
    const warm = Math.pow(Math.max(0, fwForgeF(b.a)), 6);
    const body = mix([30, 42, 62], [70, 60, 66], warm * 0.6);
    const lit = mix([96, 116, 144], [236, 180, 130], warm);
    const n = 10 + Math.round(b.w / 60);
    around(panoX(b.a), b.w, (x0) => {
      for (let i = 0; i < n; i++) {
        const u = hash(b.seed + i * 1.9);
        const dome = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        ctx.save();
        ctx.translate(x0 + (u - 0.5) * b.w, b.y - dome * b.h * 0.4 + (hash(b.seed + i * 4.3) - 0.5) * b.h * 0.4);
        ctx.scale(1.9, 0.7);
        const r = b.h * (0.5 + 0.6 * dome) * (0.7 + 0.5 * hash(b.seed + i * 2.2));
        const gr = ctx.createRadialGradient(0, r * 0.3, r * 0.05, 0, 0, r);
        gr.addColorStop(0, css(lit, 0.5)); gr.addColorStop(0.5, css(mix(lit, body, 0.7), 0.6)); gr.addColorStop(1, css(body, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.restore();
      }
    });
  }
  // the blizzard's white-out along the horizon
  const wo = ctx.createLinearGradient(0, HZ - 160, 0, HZ);
  wo.addColorStop(0, 'rgba(160,184,210,0)'); wo.addColorStop(1, 'rgba(176,196,218,0.8)');
  ctx.fillStyle = wo;
  ctx.fillRect(0, HZ - 160, PW, 160);
  closeRing(c);
  return c;
}

/** The aurora, on its own strip so it can breathe: curtains of green hemmed in violet. */
function fwAurora() {
  const [c, ctx] = panoCanvas(0.5, 520, FW_SKY_HZ);
  const HZ = FW_SKY_HZ;
  ctx.globalCompositeOperation = 'lighter';
  for (let band = 0; band < 3; band++) {
    const base = HZ - 200 - band * 60;
    const amp = 60 + band * 20;
    for (let x = 0; x < PW; x += 3) {
      const a = (x / PW) * TAU;
      const k = auroraK(a) * (band === 0 ? 1 : 0.6);
      if (k < 0.02) continue;
      const y = base - Math.sin(a * 5 + band * 1.7) * amp * 0.6 - fbm(a, 8, band + 20, 3) * amp;
      const bright = Math.pow(ringN(a, 60, band + 3), 2) * 0.8 + 0.2;
      const len = 90 + 140 * ringN(a, 18, band + 7);
      const gr = ctx.createLinearGradient(0, y - len, 0, y + 10);
      gr.addColorStop(0, 'rgba(160,90,255,0)');
      gr.addColorStop(0.35, `rgba(150,110,255,${(0.12 * k * bright).toFixed(3)})`);
      gr.addColorStop(0.75, `rgba(80,240,170,${(0.3 * k * bright).toFixed(3)})`);
      gr.addColorStop(0.95, `rgba(170,255,210,${(0.42 * k * bright).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(120,255,200,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x, y - len, 3.2, len + 10);
    }
  }
  closeRing(c);
  return c;
}

// ---------------------------------------------------------- the land, baked

const FW_LAND_S = 0.75;
const FW_LAND_ROWS = 440;
const FW_LAND_HZ = 340;

function fwFarH(a) {
  const gate = Math.exp(-((wrap(a - FW.FORGE_A) / 0.16) ** 2));
  return 30 + 110 * Math.pow(ridgeN(a, 3.6, 11), 1.8) + 90 * gate;
}
function fwMidH(a) {
  const cliff = Math.exp(-((wrap(a - FW.CLIFF_A) / 0.5) ** 2));
  const shore = Math.exp(-((wrap(a - FW.SHORE_A) / 1.0) ** 2));
  return 4 + 20 * fbm(a, 9, 14, 3) + 120 * cliff * (0.7 + 0.3 * ridgeN(a, 30, 5)) + 40 * shore * fbm(a, 14, 6, 3);
}

function fwLayer(ctx, lx, hs, o) {
  const n = hs.length;
  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, lx.canvas.width, lx.canvas.height);
  lx.setTransform(FW_LAND_S, 0, 0, FW_LAND_S, 0, 0);
  lx.fillStyle = '#000';
  lx.beginPath();
  for (let i = 0; i < n; i++) lx.lineTo(i * 4, FW_LAND_HZ - hs[i]);
  lx.lineTo(PW, FW_LAND_HZ + 3); lx.lineTo(0, FW_LAND_HZ + 3);
  lx.closePath();
  lx.fill();
  lx.globalCompositeOperation = 'source-atop';
  lx.fillStyle = aroundGradient(lx, (a) => css(mix(o.col, mix(o.col, [255, 214, 160], 0.5), Math.pow(Math.max(0, fwForgeF(a)), 6))));
  lx.fillRect(0, 0, PW, FW_LAND_ROWS);
  if (o.detail) o.detail(lx, hs);
  lx.fillStyle = aroundGradient(lx, (a) => css(fwFog(a), o.haze));
  lx.fillRect(0, 0, PW, FW_LAND_ROWS);
  const hb = lx.createLinearGradient(0, FW_LAND_HZ - 50, 0, FW_LAND_HZ + 4);
  hb.addColorStop(0, 'rgba(180,200,222,0)'); hb.addColorStop(1, `rgba(186,204,224,${o.baseHaze})`);
  lx.fillStyle = hb;
  lx.fillRect(0, 0, PW, FW_LAND_ROWS);
  lx.globalCompositeOperation = 'source-over';
  lx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lx.canvas, 0, 0);
  ctx.restore();
}

/** Ice and snow on the peaks: pale faces lit gold toward the gate, blue in the lee, and crevasses. */
function fwPeakDetail(lx, hs) {
  lx.strokeStyle = 'rgba(40,60,90,0.35)';
  lx.lineWidth = 1.4;
  lx.beginPath();
  for (let i = 2; i < hs.length - 2; i += 2) {
    const slope = hs[i + 1] - hs[i - 1];
    const x = i * 4, y = FW_LAND_HZ - hs[i];
    if (slope > 1.5) { lx.moveTo(x, y + 2); lx.lineTo(x + hs[i] * 0.15, y + hs[i] * 0.55); }
  }
  lx.stroke();
  lx.fillStyle = 'rgba(236,244,252,0.55)';
  lx.beginPath();
  for (let i = 0; i < hs.length; i++) {
    const x = i * 4, y = FW_LAND_HZ - hs[i];
    lx.rect(x, y, 4.5, 3 + 6 * vnoise(i * 0.2, 2.2));
  }
  lx.fill();
}

/** The ice cliffs: blue walls split by fractures, a waterfall frozen white down the middle. */
function fwCliffDetail(lx, hs) {
  lx.strokeStyle = 'rgba(20,50,90,0.45)';
  lx.lineWidth = 2;
  lx.beginPath();
  for (let i = 0; i < hs.length; i += 3) {
    if (hs[i] < 30) continue;
    const x = i * 4, y = FW_LAND_HZ - hs[i];
    lx.moveTo(x, y + 4); lx.lineTo(x + (hash(i) - 0.5) * 10, FW_LAND_HZ);
  }
  lx.stroke();
  lx.fillStyle = 'rgba(200,236,255,0.35)';
  lx.beginPath();
  for (let i = 0; i < hs.length; i += 3) {
    if (hs[i] < 30 || vnoise(i * 0.3, 4.1) < 0.55) continue;
    lx.rect(i * 4, FW_LAND_HZ - hs[i] + 6, 5, hs[i] - 6);
  }
  lx.fill();
  const fx = panoX(FW.CLIFF_A + 0.08);
  const fall = lx.createLinearGradient(fx - 40, 0, fx + 40, 0);
  fall.addColorStop(0, 'rgba(210,240,255,0)'); fall.addColorStop(0.5, 'rgba(236,250,255,0.9)'); fall.addColorStop(1, 'rgba(210,240,255,0)');
  lx.fillStyle = fall;
  lx.fillRect(fx - 40, FW_LAND_HZ - 150, 80, 150);
  lx.fillStyle = 'rgba(240,250,255,0.9)';
  for (let i = 0; i < 18; i++) lx.fillRect(fx - 26 + i * 3, FW_LAND_HZ - 150 + hash(i) * 20, 1.5, 120 + hash(i * 3) * 30);
  // snow along the top
  lx.fillStyle = 'rgba(240,246,252,0.95)';
  lx.beginPath();
  for (let i = 0; i < hs.length; i++) lx.rect(i * 4, FW_LAND_HZ - hs[i] - 1, 4.5, 4 + 4 * vnoise(i * 0.4, 7.7));
  lx.fill();
}

function fwLand() {
  const [c, ctx] = panoCanvas(FW_LAND_S, FW_LAND_ROWS, FW_LAND_HZ);
  const lx = makeCanvas(PW * FW_LAND_S, FW_LAND_ROWS * FW_LAND_S).getContext('2d');
  const n = Math.floor(PW / 4) + 1;
  const heights = (fn) => { const hs = new Float32Array(n); for (let i = 0; i < n; i++) hs[i] = fn(((i * 4) / PW) * TAU); return hs; };
  fwLayer(ctx, lx, heights(fwFarH), { col: [120, 140, 170], haze: 0.52, baseHaze: 0.7, detail: fwPeakDetail });
  fwGate(ctx);
  fwLayer(ctx, lx, heights(fwMidH), { col: [74, 110, 150], haze: 0.28, baseHaze: 0.55, detail: fwCliffDetail });
  fwShore(ctx);
  for (const [a, r, s, tilt] of [[0.74, 170, 1, 0.14], [-0.46, 260, 0.9, -0.1], [2.25, 200, 1, 0.22], [-2.5, 150, 0.8, -0.2]]) fwShip(ctx, a, r, s, tilt);
  fwRidges(ctx);
  closeRing(c);
  return c;
}

/**
 * The dwarven gate, a kilometre and more across the ice: a portal cut square
 * into the cliff, stepped and angular, gold light and steam pouring from it,
 * windows lit up the rock face.
 */
function fwGate(ctx) {
  const r = 1300, m = PX / r;
  const x0 = panoX(FW.FORGE_A);
  const base = FW_LAND_HZ + 1;
  around(x0, 700, (x) => {
    // the mountain it is cut into: a sheer dark face, snow along its crest
    ctx.fillStyle = 'rgba(52,62,80,0.97)';
    ctx.beginPath();
    ctx.moveTo(x - 560 * m, base);
    const crest = [[-560, 120], [-470, 190], [-400, 230], [-330, 300], [-260, 330], [-200, 360], [-120, 380], [-40, 420], [40, 410], [110, 390], [190, 350], [260, 330], [330, 280], [420, 230], [500, 170], [560, 120]];
    for (const [dx, h] of crest) ctx.lineTo(x + dx * m, base - h * m);
    ctx.lineTo(x + 560 * m, base);
    ctx.closePath();
    ctx.fill();
    // strata and fallen snow on the face
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(30,36,50,0.5)';
    ctx.lineWidth = Math.max(1, 3 * m);
    ctx.beginPath();
    for (let k = 0; k < 9; k++) { const yy = base - (40 + k * 42) * m; ctx.moveTo(x - 560 * m, yy + Math.sin(k) * 10 * m); ctx.lineTo(x + 560 * m, yy - Math.cos(k) * 10 * m); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,232,246,0.35)';
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.ellipse(x + (hash(i * 3.3) - 0.5) * 1000 * m, base - hash(i * 5.1) * 380 * m, (20 + hash(i) * 50) * m, 5 * m, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(230,238,248,0.8)';
    ctx.beginPath();
    for (let i = 0; i < crest.length - 1; i++) {
      const [ax, ah] = crest[i], [bx, bh] = crest[i + 1];
      ctx.moveTo(x + ax * m, base - ah * m); ctx.lineTo(x + bx * m, base - bh * m); ctx.lineTo(x + bx * m, base - bh * m + 14 * m); ctx.lineTo(x + ax * m, base - ah * m + 18 * m);
    }
    ctx.fill();
    // cut stone: the face squared off round the gate in great steps
    ctx.fillStyle = 'rgba(70,78,96,0.97)';
    for (let k = 0; k < 4; k++) {
      const w = 110 * m + (3 - k) * 36 * m, h = 210 * m + (3 - k) * 28 * m;
      ctx.fillRect(x - w, base - h, w * 2, h);
    }
    // chevrons over the door, dwarf-work, lit from below
    ctx.strokeStyle = 'rgba(236,190,110,0.8)';
    ctx.lineWidth = Math.max(1, 4 * m);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const yy = base - 230 * m - k * 22 * m;
      ctx.moveTo(x - 90 * m, yy + 30 * m); ctx.lineTo(x, yy - 10 * m); ctx.lineTo(x + 90 * m, yy + 30 * m);
    }
    ctx.stroke();
    // the doorway: gold inside, brightest at the floor
    const dw = 62 * m, dh = 190 * m;
    const dg = ctx.createLinearGradient(0, base - dh, 0, base);
    dg.addColorStop(0, 'rgba(255,160,70,0.95)'); dg.addColorStop(0.6, 'rgba(255,214,140,1)'); dg.addColorStop(1, 'rgba(255,244,210,1)');
    ctx.fillStyle = dg;
    ctx.fillRect(x - dw, base - dh, dw * 2, dh);
    // the great doors swung half open, banded
    ctx.fillStyle = 'rgba(60,48,36,0.97)';
    ctx.beginPath(); ctx.moveTo(x - dw, base - dh); ctx.lineTo(x - dw * 0.35, base - dh + 10 * m); ctx.lineTo(x - dw * 0.35, base); ctx.lineTo(x - dw, base); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + dw, base - dh); ctx.lineTo(x + dw * 0.35, base - dh + 10 * m); ctx.lineTo(x + dw * 0.35, base); ctx.lineTo(x + dw, base); ctx.fill();
    ctx.strokeStyle = 'rgba(230,180,90,0.75)';
    ctx.lineWidth = Math.max(1, 3 * m);
    ctx.beginPath();
    for (let k = 1; k < 6; k++) {
      const yy = base - dh + (k / 6) * dh;
      ctx.moveTo(x - dw, yy); ctx.lineTo(x - dw * 0.35, yy + 4 * m);
      ctx.moveTo(x + dw * 0.35, yy + 4 * m); ctx.lineTo(x + dw, yy);
    }
    ctx.stroke();
    // two statues of guardians flanking it, axes grounded
    ctx.fillStyle = 'rgba(40,46,60,0.97)';
    for (const s of [-1, 1]) {
      const sx = x + s * 180 * m;
      ctx.fillRect(sx - 18 * m, base - 150 * m, 36 * m, 150 * m);
      ctx.beginPath(); ctx.arc(sx, base - 165 * m, 20 * m, 0, TAU); ctx.fill();
      ctx.fillRect(sx + s * 26 * m, base - 190 * m, 6 * m, 190 * m);
    }
    // lit windows up the rock, and the glow it throws on the snow in the air
    ctx.fillStyle = 'rgba(255,206,120,0.95)';
    for (let i = 0; i < 30; i++) {
      const wx = x + (hash(i * 3.1) - 0.5) * 760 * m, wy = base - (60 + hash(i * 5.7) * 250) * m;
      if (Math.abs(wx - x) < 190 * m && wy > base - 300 * m) continue;
      ctx.fillRect(wx, wy, 7 * m + 1, 11 * m + 1);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(x, base - 80 * m, 5, x, base - 80 * m, 460 * m);
    gl.addColorStop(0, 'rgba(255,196,110,0.6)'); gl.addColorStop(0.3, 'rgba(255,150,70,0.22)'); gl.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x - 460 * m, base - 540 * m, 920 * m, 540 * m);
    ctx.restore();
    // steam from the forges, bent over by the wind
    for (let i = 0; i < 16; i++) {
      const u = i / 16;
      const sx = x - 60 * m + (hash(i) - 0.3) * 80 * m + u * 220 * m, sy = base - 420 * m - u * 220 * m;
      const sr = (50 + u * 130) * m;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, `rgba(226,204,190,${(0.3 * (1 - u)).toFixed(3)})`); sg.addColorStop(1, 'rgba(226,204,190,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    }
  });
}

/** The shore behind: pines bowed under snow, rocks, the ice pushed up against them. */
function fwShore(ctx) {
  const trees = [];
  for (let i = 0; i < 900; i++) {
    const a = FW.SHORE_A + (hash(i * 2.3) - 0.5) * 2.6;
    const k = Math.exp(-((wrap(a - FW.SHORE_A) / 0.9) ** 2));
    if (hash(i * 5.9) > k) continue;
    trees.push({ a, r: 90 + Math.pow(hash(i * 3.7), 0.7) * 380, ht: 14 + hash(i * 1.1) * 12, seed: i });
  }
  trees.sort((p, q) => q.r - p.r);
  for (const t of trees) {
    const m = PX / t.r;
    const yb = FW_LAND_HZ + rowOf(t.r) - 2;
    const air = fwAir(t.r);
    const ht = t.ht * m, wd = t.ht * 0.2 * m;
    around(panoX(t.a), wd, (x) => {
      ctx.fillStyle = css(mix([24, 40, 44], fwFog(t.a), air));
      ctx.beginPath(); spruce(ctx, x, yb, ht, wd, t.seed); ctx.fill();
      // snow heaped on every tier
      ctx.fillStyle = css(mix([226, 236, 246], fwFog(t.a), air * 0.6), 0.9);
      ctx.beginPath();
      const top = yb - ht, crown = yb - ht * 0.25;
      for (let k = 1; k <= 7; k++) {
        const y = lerp(top + ht * 0.06, crown, k / 7);
        const w = wd * Math.pow(k / 7, 0.75) * 0.8;
        ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y - ht * 0.05, x + w, y); ctx.quadraticCurveTo(x, y - ht * 0.015, x - w, y);
      }
      ctx.fill();
    });
  }
}

/** A longship frozen in the ice, listing, its dragon prow and bare mast under snow. */
function fwShip(ctx, a, r, s, tilt) {
  const m = (PX / r) * s;
  const y = FW_LAND_HZ + rowOf(r);
  const air = fwAir(r) * 0.9;
  const wood = css(mix([46, 36, 30], fwFog(a), air));
  const snow = css(mix([236, 242, 250], fwFog(a), air * 0.5));
  around(panoX(a), 20 * m, (x) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-12 * m, -1 * m);
    ctx.quadraticCurveTo(-13 * m, -3.5 * m, -15 * m, -6 * m);
    ctx.quadraticCurveTo(-13 * m, -5 * m, -11 * m, -3 * m);
    ctx.lineTo(11 * m, -3 * m);
    ctx.quadraticCurveTo(13 * m, -5 * m, 14 * m, -7.5 * m);
    ctx.quadraticCurveTo(15.5 * m, -8.5 * m, 16 * m, -7 * m);
    ctx.quadraticCurveTo(14 * m, -4 * m, 12 * m, -1 * m);
    ctx.quadraticCurveTo(0, 0.5 * m, -12 * m, -1 * m);
    ctx.fill();
    // shields along the gunwale, the mast, a torn sail
    ctx.fillStyle = css(mix([120, 40, 30], fwFog(a), air));
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-9 * m + i * 3 * m, -2.6 * m, 0.9 * m, 0, TAU); ctx.fill(); }
    ctx.fillStyle = wood;
    ctx.fillRect(-0.3 * m, -16 * m, 0.6 * m, 13 * m);
    ctx.fillRect(-5 * m, -14 * m, 10 * m, 0.5 * m);
    ctx.fillStyle = css(mix([180, 170, 150], fwFog(a), air), 0.8);
    ctx.beginPath(); ctx.moveTo(-4.5 * m, -13.5 * m); ctx.lineTo(4.5 * m, -13.5 * m); ctx.lineTo(3 * m, -8 * m); ctx.lineTo(1 * m, -9.5 * m); ctx.lineTo(-1.5 * m, -7 * m); ctx.lineTo(-4 * m, -9 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = snow;
    ctx.fillRect(-11 * m, -3.4 * m, 22 * m, 0.7 * m);
    ctx.fillRect(-5 * m, -14.6 * m, 10 * m, 0.6 * m);
    ctx.beginPath(); ctx.ellipse(0, -0.2 * m, 14 * m, 1.2 * m, 0, 0, TAU); ctx.fill();
    ctx.restore();
  });
}

/** Pressure ridges where the ice has buckled: low broken walls of blue-white blocks. */
function fwRidges(ctx) {
  for (let i = 0; i < 70; i++) {
    const a = hash(i * 4.4 + 1) * TAU, r = 60 + hash(i * 2.2) * 500;
    if (Math.abs(wrap(a - FW.FORGE_A)) < 0.12) continue;
    const m = PX / r, y = FW_LAND_HZ + rowOf(r);
    const len = (8 + hash(i * 3.3) * 30) * m, ht = (0.8 + hash(i * 5.5) * 1.8) * m;
    const air = fwAir(r);
    around(panoX(a), len, (x) => {
      ctx.fillStyle = css(mix([150, 190, 226], fwFog(a), air));
      ctx.beginPath();
      ctx.moveTo(x - len / 2, y);
      for (let k = 0; k <= 8; k++) ctx.lineTo(x - len / 2 + (k / 8) * len, y - ht * (0.4 + 0.6 * hash(i * 7 + k)));
      ctx.lineTo(x + len / 2, y);
      ctx.fill();
      ctx.fillStyle = css(mix([236, 244, 252], fwFog(a), air * 0.7), 0.9);
      ctx.fillRect(x - len / 2, y - ht * 0.9, len, Math.max(1, ht * 0.2));
    });
  }
}

// -------------------------------------------------------- the ground, baked

const FW_GR_S = 0.5;
const FW_GR_ROWS = 440;
const FW_GR_HZ = 4;

function fwGround() {
  const [c, ctx] = panoCanvas(FW_GR_S, FW_GR_ROWS, FW_GR_HZ);
  const Y = (r) => FW_GR_HZ + rowOf(r);
  const base = ctx.createLinearGradient(0, FW_GR_HZ, 0, FW_GR_ROWS);
  [[0, '#a8bcd2'], [0.03, '#7c96b2'], [0.1, '#56708e'], [0.3, '#3e566e'], [0.65, '#30445a'], [1, '#26364a']].forEach(([o, col]) => base.addColorStop(o, col));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PW, FW_GR_ROWS);
  // the gate's gold and the aurora's green laid on the ice as long reflections
  stripsTinted(ctx, FW_GR_HZ, FW_GR_HZ + 260, (a) => [[255, 200, 120], Math.pow(Math.max(0, fwForgeF(a)), 60) * 0.85, 0], 4);
  stripsTinted(ctx, FW_GR_HZ, FW_GR_HZ + 160, (a) => [[110, 240, 190], auroraK(a) * 0.22, 0], 6);
  // bubbles and frost in the ice
  for (let i = 0; i < 2600; i++) {
    const r = Math.exp(lerp(Math.log(3.2), Math.log(300), hash(i * 1.37 + 0.2)));
    const a = hash(i * 2.71 + 0.9) * TAU;
    const size = (0.03 + 0.08 * hash(i * 3.3)) * (0.6 + r / 40);
    const rx = (size / r) * PX, ry = Math.max(0.5, ((size * 0.55 * CAM_H) / (r * r)) * PX);
    ctx.fillStyle = hash(i * 5.9) > 0.5 ? 'rgba(220,236,250,0.45)' : 'rgba(16,30,48,0.35)';
    around(panoX(a), rx, (x) => { ctx.beginPath(); ctx.ellipse(x, Y(r), rx, ry, 0, 0, TAU); ctx.fill(); });
  }
  // cracks through the ice, long and branching, in perspective
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let wx = (hash(i * 3.1) - 0.5) * 160, wz = (hash(i * 4.7) - 0.5) * 160;
    let dir = hash(i * 5.3) * TAU;
    const pts = [];
    for (let k = 0; k < 14; k++) {
      const r = Math.hypot(wx, wz);
      if (r > 2.8) pts.push([bearing(wx, wz), r]);
      dir += (hash(i * 11 + k) - 0.5) * 1.1;
      const step = 1 + hash(i * 7 + k * 3) * 3;
      wx += Math.sin(dir) * step; wz += Math.cos(dir) * step;
    }
    if (pts.length < 2) continue;
    for (const [col, lw] of [['rgba(16,28,44,0.5)', 3], ['rgba(230,244,255,0.55)', 1.2]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      const x0 = (pts[0][0] / TAU) * PW;
      around(((x0 % PW) + PW) % PW, 600, (xx) => {
        const d = xx - x0;
        ctx.beginPath();
        let prev = null;
        for (const [pa, pr] of pts) {
          let px = (pa / TAU) * PW + d;
          if (prev !== null && Math.abs(px - prev) > PW / 2) px += px > prev ? -PW : PW;
          ctx.lineTo(px, Y(pr));
          prev = px;
        }
        ctx.stroke();
      });
    }
  }
  // snow driven across it in long streaks along the wind
  for (let i = 0; i < 1600; i++) {
    const r = Math.exp(lerp(Math.log(3.2), Math.log(400), hash(i * 4.13 + 0.7)));
    const a = hash(i * 1.93 + 0.6) * TAU;
    const size = (0.4 + 2.2 * hash(i * 6.7)) * (0.6 + r / 60);
    const rx = (size / r) * PX, ry = Math.max(0.5, ((size * 0.06 * CAM_H) / (r * r)) * PX);
    ctx.fillStyle = `rgba(226,236,248,${(0.18 + 0.35 * hash(i * 8.1)).toFixed(3)})`;
    around(panoX(a), rx, (x) => { ctx.beginPath(); ctx.ellipse(x, Y(r), rx, ry, 0, 0, TAU); ctx.fill(); });
  }
  // drifts: soft white mounds, blue in their lee
  for (let i = 0; i < 200; i++) {
    const r = Math.exp(lerp(Math.log(4), Math.log(200), hash(i * 7.13 + 0.1)));
    const a = hash(i * 2.93 + 0.3) * TAU;
    const size = (0.5 + 1.6 * hash(i * 3.7)) * (0.7 + r / 70);
    const rx = (size / r) * PX, ry = Math.max(1, ((size * 0.3 * CAM_H) / (r * r)) * PX);
    around(panoX(a), rx, (x) => {
      ctx.fillStyle = 'rgba(70,100,140,0.3)';
      ctx.beginPath(); ctx.ellipse(x + rx * 0.2, Y(r) + ry * 0.15, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(232,240,250,0.85)';
      ctx.beginPath(); ctx.ellipse(x, Y(r), rx * 0.9, ry * 0.8, 0, 0, TAU); ctx.fill();
    });
  }
  // white-out at the horizon
  stripsTinted(ctx, 0, FW_GR_HZ + 70, (a) => [fwFog(a), 0.9, 0], 8);
  closeRing(c);
  return c;
}

// ------------------------------------------------------ close at hand, static

const FW_NEAR = (() => {
  const all = [];
  for (let i = 0; i < 40; i++) {
    const a = hash(i * 5.17 + 0.4) * TAU, r = 7 + Math.pow(hash(i * 2.21), 1.2) * 34;
    if (Math.abs(wrap(a)) < 0.35 && r < 14) continue;
    if (Math.abs(wrap(a - FW.SLED_A)) < 0.25 && r < 20) continue;
    all.push({ kind: hash(i * 9.3) > 0.45 ? 'shard' : 'rock', a, r, s: 0.6 + hash(i * 4.4) * 1.6, seed: i });
  }
  all.push({ kind: 'stone', a: -0.62, r: 15, h: 2.4, seed: 7 });
  all.push({ kind: 'sled', a: FW.SLED_A, r: 13, seed: 1 });
  all.sort((p, q) => q.r - p.r);
  return { all };
})();

// ============================================ Fimbulwinter, drawn each frame

/** A cluster of ice shards thrust up through the lake: glassy blue, lit along their edges. */
function fwShard(ctx, o, x, y, m) {
  const s = o.s * m;
  ctx.fillStyle = 'rgba(20,34,52,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.9, s * 0.12, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const dx = (hash(o.seed * 3 + i) - 0.5) * s * 1.1, h = s * (0.8 + 1.4 * hash(o.seed * 5 + i)) * (i === 2 ? 1.4 : 1);
    const lean = (hash(o.seed * 7 + i) - 0.5) * 0.5, w = s * (0.16 + 0.12 * hash(o.seed + i));
    const tx = x + dx + lean * h, ty = y - h;
    const gr = ctx.createLinearGradient(x + dx - w, 0, x + dx + w, 0);
    gr.addColorStop(0, 'rgba(90,140,190,0.85)'); gr.addColorStop(0.5, 'rgba(190,226,250,0.8)'); gr.addColorStop(1, 'rgba(60,110,160,0.85)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x + dx - w, y); ctx.lineTo(tx, ty); ctx.lineTo(x + dx + w, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(240,250,255,0.8)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath(); ctx.moveTo(x + dx - w * 0.2, y); ctx.lineTo(tx, ty); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(236,244,252,0.9)';
  ctx.beginPath(); ctx.ellipse(x, y - s * 0.04, s * 0.8, s * 0.1, 0, PI, TAU); ctx.fill();
}

function fwRock(ctx, o, x, y, m) {
  const s = o.s * m;
  ctx.fillStyle = 'rgba(20,34,52,0.35)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y, s * 0.8, s * 0.12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2c3440';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y);
  ctx.quadraticCurveTo(x - s * 0.66, y - s * 0.5, x - s * 0.1, y - s * 0.6);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.62, x + s * 0.6, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(234,242,250,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.62, y - s * 0.22);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.62, x - s * 0.08, y - s * 0.66);
  ctx.quadraticCurveTo(x + s * 0.52, y - s * 0.66, x + s * 0.6, y - s * 0.2);
  ctx.quadraticCurveTo(x + s * 0.1, y - s * 0.36, x - s * 0.62, y - s * 0.22);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,160,210,0.35)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.2, y - s * 0.3, s * 0.3, s * 0.06, 0, 0, TAU); ctx.fill();
}

/** A wolf in harness, side on: grey or white, breath smoking in the cold. */
function drawWolf(ctx, x, y, m, dir, pale, t, seed) {
  const fur = pale ? '#c8ccd2' : '#6a6e76', furD = pale ? '#8a9098' : '#3e424a', furL = pale ? '#eef2f6' : '#9aa0a8';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(m * dir, m);
  ctx.lineCap = 'round';
  const pant = Math.sin(t * 6 + seed) * 0.01;
  // legs
  ctx.strokeStyle = furD;
  ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(-0.38, -0.46); ctx.lineTo(-0.42, 0); ctx.moveTo(0.3, -0.46); ctx.lineTo(0.34, 0); ctx.stroke();
  ctx.strokeStyle = fur;
  ctx.beginPath(); ctx.moveTo(-0.3, -0.46); ctx.lineTo(-0.3, 0); ctx.moveTo(0.38, -0.46); ctx.lineTo(0.42, 0); ctx.stroke();
  // the tail, low and bushy
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.moveTo(-0.5, -0.66); ctx.quadraticCurveTo(-0.8, -0.6, -0.78, -0.32); ctx.quadraticCurveTo(-0.66, -0.42, -0.5, -0.52); ctx.fill();
  // body
  ctx.beginPath(); ctx.ellipse(-0.04, -0.6, 0.52, 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = furL;
  ctx.beginPath(); ctx.ellipse(0.02, -0.52, 0.4, 0.09, 0, 0, TAU); ctx.fill();
  // the ruff and head
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.ellipse(0.42, -0.68, 0.18, 0.2, 0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.5, -0.86); ctx.quadraticCurveTo(0.7, -0.9, 0.84, -0.78 + pant); ctx.lineTo(0.84, -0.72 + pant); ctx.quadraticCurveTo(0.7, -0.68, 0.52, -0.66); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.5, -0.86); ctx.lineTo(0.54, -1.02); ctx.lineTo(0.6, -0.87); ctx.fill();
  ctx.fillStyle = '#101216';
  ctx.beginPath(); ctx.arc(0.84, -0.77 + pant, 0.025, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0.64, -0.81, 0.018, 0, TAU); ctx.fill();
  // the harness
  ctx.strokeStyle = '#6a2a1e';
  ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(0.32, -0.8); ctx.lineTo(0.3, -0.46); ctx.moveTo(-0.3, -0.76); ctx.lineTo(-0.28, -0.44); ctx.stroke();
  ctx.restore();
  // breath
  const u = (t * 0.6 + seed) % 1;
  ctx.globalAlpha = (1 - u) * 0.4;
  const r = m * (0.1 + u * 0.25);
  ctx.drawImage(FX.mist, x + dir * m * (0.9 + u * 0.4) - r, y - m * 0.78 - r * 0.6, r * 2, r * 1.2);
  ctx.globalAlpha = 1;
}

/** The sled, waiting: runners, furs and bundles, two wolves in the traces. */
function fwSled(ctx, x, y, m, t) {
  ctx.fillStyle = 'rgba(20,34,52,0.35)';
  ctx.beginPath(); ctx.ellipse(x + 1.2 * m, y, 3.4 * m, 0.25 * m, 0, 0, TAU); ctx.fill();
  // runners, curling up at the front
  ctx.strokeStyle = '#3a2a1e';
  ctx.lineWidth = Math.max(1.5, 0.08 * m);
  ctx.beginPath(); ctx.moveTo(x - 1.2 * m, y - 0.05 * m); ctx.lineTo(x + 0.9 * m, y - 0.05 * m); ctx.quadraticCurveTo(x + 1.3 * m, y - 0.05 * m, x + 1.3 * m, y - 0.5 * m); ctx.stroke();
  ctx.fillStyle = '#4a3424';
  ctx.fillRect(x - 1.2 * m, y - 0.55 * m, 2.1 * m, 0.14 * m);
  for (const px of [-1, -0.2, 0.6]) ctx.fillRect(x + px * m, y - 0.5 * m, 0.08 * m, 0.45 * m);
  // furs and bundles, snow on them
  ctx.fillStyle = '#6a5440';
  ctx.beginPath(); ctx.ellipse(x - 0.4 * m, y - 0.72 * m, 0.7 * m, 0.24 * m, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a8e96';
  ctx.beginPath(); ctx.ellipse(x + 0.3 * m, y - 0.7 * m, 0.4 * m, 0.2 * m, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(236,244,252,0.9)';
  ctx.beginPath(); ctx.ellipse(x - 0.2 * m, y - 0.9 * m, 0.8 * m, 0.1 * m, 0, 0, TAU); ctx.fill();
  // the traces, and the wolves
  ctx.strokeStyle = '#2a1e16';
  ctx.lineWidth = Math.max(1, 0.03 * m);
  ctx.beginPath(); ctx.moveTo(x + 1.2 * m, y - 0.4 * m); ctx.lineTo(x + 2.2 * m, y - 0.6 * m); ctx.moveTo(x + 1.2 * m, y - 0.4 * m); ctx.lineTo(x + 2.5 * m, y - 0.52 * m); ctx.stroke();
  drawWolf(ctx, x + 3.4 * m, y + 0.1 * m, 0.95 * m, 1, false, t, 0.3);
  drawWolf(ctx, x + 2.9 * m, y, 0.9 * m, 1, true, t, 0.7);
}

function fwObject(ctx, o, yaw, hz, t) {
  const rel = wrap(o.a - yaw);
  const m = PX / o.r;
  const span = o.kind === 'sled' ? 5 * m : 2.5 * m;
  if (Math.abs(rel) * PX > W / 2 + span + 40) return;
  const x = W / 2 + rel * PX, y = hz + rowOf(o.r);
  if (o.kind === 'shard') fwShard(ctx, o, x, y, m);
  else if (o.kind === 'rock') fwRock(ctx, o, x, y, m);
  else if (o.kind === 'sled') fwSled(ctx, x - 1.4 * m, y, m, t);
  else if (o.kind === 'stone') {
    mgStone(ctx, o, x, y, m, t);
    ctx.fillStyle = 'rgba(236,244,252,0.92)';
    ctx.beginPath(); ctx.ellipse(x, y - o.h * m * 0.96, 0.52 * m, 0.14 * m, 0, 0, TAU); ctx.fill();
  }
  const air = fwAir(o.r);
  if (air > 0.04) {
    ctx.fillStyle = css(fwFog(o.a), air * 0.75);
    ctx.fillRect(x - span, y - 3.2 * m, span * 2, 3.3 * m);
  }
}

/**
 * The blizzard: gusts of white blowing through, and snow in three depths,
 * the near flakes big and smeared by the wind, all sliding against the view.
 */
function drawBlizzard(ctx, g, t, pass) {
  const yaw = camYaw(g);
  if (pass === 0) {
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const sp = 140 + i * 90;
      let x = ((t * sp - yaw * PX * (0.6 + i * 0.3)) % (W * 1.5));
      if (x < 0) x += W * 1.5;
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 0.7 + i);
      ctx.drawImage(FX.gust, x - W * 1.5, 150 + i * 90, W * 1.5, 360);
      ctx.drawImage(FX.gust, x, 150 + i * 90, W * 1.5, 360);
    }
    ctx.restore();
    return;
  }
  const spanX = W + 200, spanY = H + 100;
  const pos = (s, vx, vy, par, i) => {
    let x = (hash(s * 1.7) * spanX + t * vx * (0.8 + 0.4 * hash(s * 2.3)) - yaw * PX * par) % spanX;
    if (x < 0) x += spanX;
    const y = (hash(s * 3.1) * spanY + t * vy * (0.8 + 0.4 * hash(s * 4.9)) + Math.sin(t * 2.3 + i) * 10) % spanY;
    return [x - 100 + Math.sin(t * 1.7 + i * 0.7) * 12, y - 50];
  };
  ctx.save();
  // far: fine dots
  ctx.fillStyle = 'rgba(236,244,255,0.6)';
  ctx.beginPath();
  for (let i = 0; i < 260; i++) {
    const [x, y] = pos(i, 200, 90, 0.3, i);
    const r = 0.8 + hash(i * 5.3) * 0.9;
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  // middle: flakes, a little smeared by the wind
  ctx.strokeStyle = 'rgba(240,246,255,0.8)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let i = 0; i < 120; i++) {
    const [x, y] = pos(1000 + i, 380, 150, 0.8, i);
    ctx.moveTo(x - 6, y - 2.4); ctx.lineTo(x, y);
  }
  ctx.stroke();
  // near: big soft flakes rushing past
  for (let i = 0; i < 26; i++) {
    const [x, y] = pos(2000 + i, 700, 240, 1.4, i);
    const r = 5 + hash(i * 7.1) * 9;
    ctx.globalAlpha = 0.35 + 0.35 * hash(i * 3.9);
    ctx.drawImage(FX.snow, x - r * 1.8, y - r, r * 3.6, r * 2);
  }
  ctx.restore();
}

// ============================================================ the warrior

/**
 * The fly from behind and a little to its right, as the camera rides its
 * shoulder: ash-grey, a red stripe from the crown over the left shoulder and
 * down the arm, a bristling tuft of a beard either side of the jaw, the red
 * compound eyes bulging past the back of its head, the wings folded down
 * its back under a harness. Its body is baked once per game; the right arm,
 * and whatever is in its hand, are drawn every frame.
 */
const WS = 1.1;
const CX = 286;
const CY = 410;
const BOX = 252;
const BOY = 168;
const BW = 530;
const BH = 560;

const LOOKS = {
  gow: {
    skin: [150, 148, 140], skinD: [58, 58, 56], skinL: [206, 202, 190],
    ink: [140, 26, 20], beard: [40, 34, 28], beardTip: [112, 102, 90],
    leather: [80, 56, 36], leatherD: [40, 28, 20], iron: [104, 106, 108], ironD: [40, 40, 42],
    eye: [118, 26, 22], eyeD: [40, 8, 8], wing: [52, 56, 60], fur: [96, 82, 64], furL: [150, 132, 110],
    mantle: false,
  },
  gowr: {
    skin: [146, 152, 160], skinD: [50, 58, 72], skinL: [206, 216, 228],
    ink: [146, 28, 24], beard: [70, 64, 60], beardTip: [176, 172, 168],
    leather: [70, 50, 36], leatherD: [36, 26, 20], iron: [120, 126, 134], ironD: [44, 48, 54],
    eye: [118, 26, 22], eyeD: [40, 8, 8], wing: [64, 74, 90], fur: [104, 100, 96], furL: [196, 200, 206],
    mantle: true,
  },
};

/** Paths shared by the bake and the frame: the torso, the left arm, the head. */
const TORSO = (() => {
  const p = new Path2D();
  p.moveTo(-44, -20);
  p.quadraticCurveTo(-98, -14, -142, 6);
  p.bezierCurveTo(-180, 16, -208, 44, -212, 90);
  p.bezierCurveTo(-216, 130, -198, 162, -186, 192);
  p.bezierCurveTo(-168, 252, -150, 320, -142, 420);
  p.lineTo(146, 420);
  p.bezierCurveTo(154, 320, 172, 252, 190, 192);
  p.bezierCurveTo(202, 162, 220, 130, 216, 90);
  p.bezierCurveTo(212, 44, 184, 16, 146, 6);
  p.quadraticCurveTo(100, -14, 46, -20);
  p.quadraticCurveTo(0, -28, -44, -20);
  p.closePath();
  return p;
})();
const LEFT_ARM = (() => {
  const p = new Path2D();
  p.moveTo(-170, 40);
  p.bezierCurveTo(-226, 36, -262, 80, -264, 150);
  p.bezierCurveTo(-268, 200, -256, 250, -250, 300);
  p.bezierCurveTo(-246, 340, -240, 380, -236, 420);
  p.lineTo(-176, 420);
  p.bezierCurveTo(-180, 360, -178, 300, -182, 250);
  p.bezierCurveTo(-186, 210, -180, 170, -176, 150);
  p.closePath();
  return p;
})();
const HEAD = (() => {
  const p = new Path2D();
  p.moveTo(2, -112);
  p.bezierCurveTo(34, -112, 50, -82, 48, -48);
  p.bezierCurveTo(46, -14, 30, 2, 2, 4);
  p.bezierCurveTo(-26, 2, -44, -14, -46, -48);
  p.bezierCurveTo(-48, -82, -30, -112, 2, -112);
  p.closePath();
  return p;
})();

function bakeWarrior(game) {
  const L = LOOKS[game];
  const c = makeCanvas(BW * WS, BH * WS);
  const x = c.getContext('2d');
  x.scale(WS, WS);
  x.translate(BOX, BOY);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const skinShade = (x0, x1) => {
    const gr = x.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, css(mix(L.skinD, [0, 0, 0], 0.2))); gr.addColorStop(0.22, css(L.skinD)); gr.addColorStop(0.5, css(mix(L.skinD, L.skin, 0.75)));
    gr.addColorStop(0.72, css(L.skin)); gr.addColorStop(0.88, css(mix(L.skin, L.skinL, 0.35))); gr.addColorStop(1, css(mix(L.skinD, L.skin, 0.5)));
    return gr;
  };
  // --- the left arm, hanging, the stripe running down it
  x.fillStyle = skinShade(-300, -120);
  x.fill(LEFT_ARM);
  x.save();
  x.clip(LEFT_ARM);
  let ag = x.createLinearGradient(0, 40, 0, 420);
  ag.addColorStop(0, 'rgba(255,255,255,0.06)'); ag.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = ag;
  x.fillRect(-280, 30, 120, 400);
  x.strokeStyle = css(L.ink);
  x.lineWidth = 30;
  x.beginPath(); x.moveTo(-206, 40); x.bezierCurveTo(-246, 90, -250, 200, -236, 420); x.stroke();
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.beginPath(); x.ellipse(-178, 200, 12, 160, 0, 0, TAU); x.fill();
  x.fillStyle = css(L.skinL, 0.18);
  x.beginPath(); x.ellipse(-226, 150, 20, 60, 0.05, 0, TAU); x.fill();
  x.fillStyle = css(L.leatherD);
  x.fillRect(-280, 360, 120, 60);
  x.fillStyle = css(L.iron);
  x.fillRect(-280, 360, 120, 6);
  x.restore();
  // --- the back
  x.fillStyle = skinShade(-196, 196);
  x.fill(TORSO);
  x.save();
  x.clip(TORSO);
  // light from above: the traps and shoulders lit, the lower back dimmer
  let gr = x.createLinearGradient(0, -20, 0, 400);
  gr.addColorStop(0, 'rgba(255,255,255,0.1)'); gr.addColorStop(0.35, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = gr;
  x.fillRect(-200, -30, 400, 440);
  // muscle: the spine's groove, the shoulder blades, the lats
  x.strokeStyle = 'rgba(0,0,0,0.26)';
  x.lineWidth = 12;
  x.beginPath(); x.moveTo(2, 0); x.bezierCurveTo(-2, 120, 4, 260, 0, 400); x.stroke();
  x.strokeStyle = css(L.skinL, 0.28);
  x.lineWidth = 6;
  x.beginPath(); x.moveTo(-12, 20); x.bezierCurveTo(-16, 120, -10, 260, -14, 400); x.moveTo(16, 20); x.bezierCurveTo(18, 120, 16, 260, 16, 400); x.stroke();
  for (const s of [-1, 1]) {
    x.fillStyle = 'rgba(0,0,0,0.17)';
    x.beginPath();
    x.moveTo(s * 34, 70); x.bezierCurveTo(s * 100, 56, s * 128, 110, s * 116, 176); x.bezierCurveTo(s * 100, 210, s * 60, 200, s * 40, 170);
    x.bezierCurveTo(s * 60, 150, s * 50, 100, s * 34, 70);
    x.fill();
    x.fillStyle = css(L.skinL, 0.2);
    x.beginPath(); x.ellipse(s * 82, 110, 30, 44, s * 0.4, 0, TAU); x.fill();
    // the trapezius ridge from neck to shoulder
    x.strokeStyle = css(L.skinL, 0.35);
    x.lineWidth = 10;
    x.beginPath(); x.moveTo(s * 40, -8); x.quadraticCurveTo(s * 90, 0, s * 140, 26); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.2)';
    x.lineWidth = 14;
    x.beginPath(); x.moveTo(s * 150, 150); x.bezierCurveTo(s * 138, 230, s * 132, 300, s * 128, 400); x.stroke();
    // the deltoid's cap
    x.fillStyle = s > 0 ? css(L.skinL, 0.3) : 'rgba(0,0,0,0.12)';
    x.beginPath(); x.ellipse(s * 184, 70, 28, 38, s * -0.5, 0, TAU); x.fill();
  }
  // the stripe: from the neck across the left shoulder, and a scar or two
  x.fillStyle = css(L.ink);
  x.beginPath();
  x.moveTo(-44, -24); x.bezierCurveTo(-64, 8, -118, 10, -160, 26);
  x.bezierCurveTo(-190, 38, -212, 60, -216, 96);
  x.lineTo(-190, 102);
  x.bezierCurveTo(-184, 74, -162, 58, -132, 48);
  x.bezierCurveTo(-96, 38, -44, 30, -16, -14);
  x.closePath();
  x.fill();
  x.strokeStyle = css(mix(L.ink, [0, 0, 0], 0.3), 0.6);
  x.lineWidth = 2;
  x.stroke();
  x.strokeStyle = css(L.skinL, 0.45);
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(60, 120); x.lineTo(98, 150); x.moveTo(-30, 250); x.lineTo(10, 236); x.moveTo(110, 60); x.lineTo(128, 96); x.stroke();
  // bristles: a fly's setae, dark and short, thicker over the shoulders
  x.strokeStyle = 'rgba(24,22,20,0.5)';
  x.lineWidth = 1.3;
  x.beginPath();
  for (let i = 0; i < 200; i++) {
    const px = (hash(i * 1.73) - 0.5) * 400, py = -10 + Math.pow(hash(i * 2.91), 2.2) * 220;
    const len = 4 + hash(i * 3.3) * 5;
    const ang = -PI / 2 + (px / 200) * 0.9 + (hash(i * 4.4) - 0.5) * 0.5;
    x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
  }
  x.stroke();
  x.restore();
  // --- the wings, folded down the back, smoky and veined
  for (const s of [-1, 1]) {
    x.save();
    x.translate(s * 26, 70);
    x.rotate(s * -0.13);
    const wg = x.createLinearGradient(0, 0, 0, 330);
    wg.addColorStop(0, 'rgba(200,210,214,0.32)'); wg.addColorStop(0.5, 'rgba(220,228,232,0.2)'); wg.addColorStop(1, 'rgba(210,220,226,0.1)');
    x.fillStyle = wg;
    x.beginPath();
    x.moveTo(0, 0); x.bezierCurveTo(s * 58, 30, s * 62, 220, s * 26, 340); x.bezierCurveTo(s * 0, 356, s * -24, 300, s * -22, 200); x.bezierCurveTo(s * -20, 100, s * -12, 30, 0, 0);
    x.fill();
    x.strokeStyle = 'rgba(24,24,28,0.55)';
    x.lineWidth = 2;
    x.stroke();
    x.strokeStyle = 'rgba(20,20,24,0.4)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(s * 4, 10); x.bezierCurveTo(s * 40, 80, s * 50, 200, s * 34, 316);
    x.moveTo(s * 2, 14); x.bezierCurveTo(s * 18, 100, s * 20, 220, s * 10, 330);
    x.moveTo(s * 0, 20); x.bezierCurveTo(s * -8, 110, s * -12, 210, s * -18, 280);
    x.moveTo(s * -14, 150); x.lineTo(s * 36, 170);
    x.moveTo(s * -12, 230); x.lineTo(s * 30, 250);
    x.stroke();
    // a sheen of colour along the edge
    x.strokeStyle = game === 'gow' ? 'rgba(170,210,190,0.22)' : 'rgba(170,200,255,0.3)';
    x.lineWidth = 3;
    x.beginPath(); x.moveTo(s * 50, 60); x.bezierCurveTo(s * 68, 140, s * 62, 240, s * 30, 326); x.stroke();
    x.restore();
  }
  // --- the harness: a strap from the right shoulder to the left hip, a disc at the middle
  x.save();
  x.clip(TORSO);
  x.strokeStyle = css(L.leatherD);
  x.lineWidth = 40;
  x.beginPath(); x.moveTo(96, -10); x.bezierCurveTo(60, 90, -60, 230, -160, 360); x.stroke();
  x.strokeStyle = css(L.leather);
  x.lineWidth = 32;
  x.stroke();
  x.strokeStyle = css(mix(L.leather, [255, 230, 200], 0.25), 0.6);
  x.lineWidth = 1.5;
  x.setLineDash([5, 6]);
  x.beginPath(); x.moveTo(108, -6); x.bezierCurveTo(74, 94, -46, 236, -146, 368); x.moveTo(84, -12); x.bezierCurveTo(46, 86, -74, 224, -174, 352); x.stroke();
  x.setLineDash([]);
  // the belt
  x.fillStyle = css(L.leatherD);
  x.fillRect(-200, 330, 400, 60);
  x.fillStyle = css(L.leather);
  x.fillRect(-200, 336, 400, 38);
  x.fillStyle = css(L.iron);
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.arc(i * 50, 355, 5, 0, TAU); x.fill(); }
  x.restore();
  const disc = (dx, dy, r) => {
    x.fillStyle = css(L.ironD);
    x.beginPath(); x.arc(dx, dy, r, 0, TAU); x.fill();
    const dg = x.createRadialGradient(dx - r * 0.3, dy - r * 0.4, 1, dx, dy, r);
    dg.addColorStop(0, css(mix(L.iron, [255, 255, 255], 0.35))); dg.addColorStop(1, css(L.iron));
    x.fillStyle = dg;
    x.beginPath(); x.arc(dx, dy, r * 0.84, 0, TAU); x.fill();
    x.strokeStyle = css(L.ironD);
    x.lineWidth = 2.5;
    x.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU - PI / 2;
      x.moveTo(dx, dy); x.quadraticCurveTo(dx + Math.cos(a + 0.9) * r * 0.9, dy + Math.sin(a + 0.9) * r * 0.9, dx + Math.cos(a) * r * 0.66, dy + Math.sin(a) * r * 0.66);
    }
    x.stroke();
  };
  disc(-4, 164, 26);
  // --- the shoulders: a leather pauldron on the left, or a wolf-fur mantle over both
  if (!L.mantle) {
    for (let k = 2; k >= 0; k--) {
      x.fillStyle = css(mix(L.leather, L.leatherD, k * 0.25));
      x.beginPath();
      x.moveTo(-104 - k * 14, 2 + k * 26);
      x.quadraticCurveTo(-186 - k * 8, -8 + k * 30, -228 - k * 4, 58 + k * 32);
      x.lineTo(-214 + k * 2, 92 + k * 30);
      x.quadraticCurveTo(-180, 44 + k * 32, -112 - k * 10, 44 + k * 26);
      x.closePath();
      x.fill();
      x.strokeStyle = css(L.iron);
      x.lineWidth = 4;
      x.beginPath(); x.moveTo(-228 - k * 4, 58 + k * 32); x.lineTo(-214 + k * 2, 92 + k * 30); x.quadraticCurveTo(-180, 44 + k * 32, -112 - k * 10, 44 + k * 26); x.stroke();
      x.fillStyle = css(mix(L.iron, [255, 255, 255], 0.3));
      for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(-130 - j * 22 - k * 6, 42 + k * 28 + j * 9, 2.6, 0, TAU); x.fill(); }
    }
    // a knot tooled into the top plate
    x.strokeStyle = 'rgba(30,20,12,0.6)';
    x.lineWidth = 2;
    x.beginPath(); x.ellipse(-172, 24, 18, 10, -0.4, 0, TAU); x.moveTo(-190, 18); x.bezierCurveTo(-176, 40, -168, 4, -152, 28); x.stroke();
    // fur tufts where it meets the neck
    x.strokeStyle = css(L.fur);
    x.lineWidth = 5;
    x.beginPath();
    for (let i = 0; i < 26; i++) {
      const px = -118 + (hash(i * 3.1) - 0.5) * 50, py = -6 + hash(i * 1.7) * 20;
      x.moveTo(px, py); x.lineTo(px + (hash(i * 5.3) - 0.7) * 20, py - 8 - hash(i) * 10);
    }
    x.stroke();
    x.strokeStyle = css(L.furL, 0.7);
    x.lineWidth = 2;
    x.stroke();
    // the strap that holds it, across the upper back
    x.strokeStyle = css(L.leatherD);
    x.lineWidth = 16;
    x.beginPath(); x.moveTo(-150, 70); x.quadraticCurveTo(-80, 96, -10, 150); x.stroke();
  } else {
    // a heavy mantle of pale wolf fur over both shoulders, crusted with snow
    const furPath = new Path2D();
    furPath.moveTo(-60, -26);
    furPath.bezierCurveTo(-140, -30, -226, 0, -244, 80);
    furPath.bezierCurveTo(-250, 120, -236, 150, -214, 160);
    furPath.bezierCurveTo(-170, 150, -120, 150, -80, 130);
    furPath.bezierCurveTo(-40, 116, -10, 124, 0, 150);
    furPath.bezierCurveTo(10, 124, 40, 116, 80, 130);
    furPath.bezierCurveTo(120, 150, 170, 150, 214, 160);
    furPath.bezierCurveTo(236, 150, 250, 120, 244, 80);
    furPath.bezierCurveTo(226, 0, 140, -30, 60, -26);
    furPath.closePath();
    const fg = x.createLinearGradient(0, -30, 0, 160);
    fg.addColorStop(0, css(L.furL)); fg.addColorStop(0.5, css(L.fur)); fg.addColorStop(1, css(mix(L.fur, [30, 30, 34], 0.5)));
    x.fillStyle = fg;
    x.fill(furPath);
    x.save();
    x.clip(furPath);
    x.lineWidth = 3;
    for (let i = 0; i < 900; i++) {
      const px = (hash(i * 1.37) - 0.5) * 500, py = -30 + hash(i * 2.13) * 190;
      const len = 10 + hash(i * 3.7) * 16;
      const ang = PI / 2 + (px / 250) * 0.6 + (hash(i * 5.9) - 0.5) * 0.7;
      x.strokeStyle = hash(i * 7.3) > 0.5 ? 'rgba(40,40,44,0.35)' : css(L.furL, 0.5);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke();
    }
    // snow along the top
    x.fillStyle = 'rgba(240,246,252,0.9)';
    for (let i = 0; i < 40; i++) {
      const px = (hash(i * 9.1) - 0.5) * 440, py = -20 + Math.abs(px) * 0.25 + hash(i * 4.4) * 20;
      x.beginPath(); x.ellipse(px, py, 8 + hash(i) * 16, 4 + hash(i * 2) * 5, 0, 0, TAU); x.fill();
    }
    x.restore();
    // ragged tips along the lower edge
    x.fillStyle = css(mix(L.fur, [30, 30, 34], 0.4));
    x.beginPath();
    for (let i = 0; i < 40; i++) {
      const u = i / 40, px = lerp(-236, 236, u);
      const py = 150 - Math.sin(u * PI) * 30 + (Math.abs(px) < 90 ? (90 - Math.abs(px)) * 0.2 : 0);
      x.moveTo(px - 7, py - 8); x.lineTo(px + (hash(i) - 0.5) * 6, py + 12 + hash(i * 3) * 12); x.lineTo(px + 7, py - 8);
    }
    x.fill();
    // a clasp of iron on a chain across the chest shows at the shoulder
    x.strokeStyle = css(L.ironD);
    x.lineWidth = 5;
    x.setLineDash([7, 4]);
    x.beginPath(); x.moveTo(-200, 40); x.quadraticCurveTo(-120, 70, -60, 60); x.stroke();
    x.setLineDash([]);
  }
  // --- the neck and the beard, bristling out either side of the jaw
  x.fillStyle = css(L.skin);
  x.beginPath(); x.moveTo(-38, -40); x.lineTo(40, -40); x.lineTo(46, -8); x.quadraticCurveTo(0, -2, -44, -8); x.closePath(); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(-38, -30, 76, 12);
  for (const [s, n, reach] of [[-1, 30, 30], [1, 40, 40]]) {
    for (let i = 0; i < n; i++) {
      const bx = s * (36 + hash(i * 2.3 + s) * 14), by = -40 + hash(i * 3.1 + s) * 40;
      const len = reach * (0.5 + 0.6 * hash(i * 4.7 + s));
      const ang = PI / 2 + s * (0.5 + 0.7 * hash(i * 5.9 + s));
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      x.strokeStyle = css(L.beard);
      x.lineWidth = 3.5 + hash(i * 6.1) * 2.5;
      x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + s * 6, by + len * 0.5, ex, ey); x.stroke();
      x.strokeStyle = css(L.beardTip, 0.7);
      x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(lerp(bx, ex, 0.6), lerp(by, ey, 0.6)); x.lineTo(ex, ey); x.stroke();
    }
  }
  // --- the eyes, bulging past the back of the head
  for (const [ex, ey, rx, ry, rot] of [[-50, -74, 40, 62, 0.42], [56, -72, 42, 64, -0.42]]) {
    const eg = x.createRadialGradient(ex + Math.sign(ex) * 14, ey - 24, 2, ex, ey, ry);
    eg.addColorStop(0, css(mix(L.eye, [255, 170, 140], 0.25))); eg.addColorStop(0.45, css(L.eye)); eg.addColorStop(1, css(L.eyeD));
    x.fillStyle = eg;
    x.beginPath(); x.ellipse(ex, ey, rx, ry, rot, 0, TAU); x.fill();
    // facets
    x.save();
    x.beginPath(); x.ellipse(ex, ey, rx, ry, rot, 0, TAU); x.clip();
    x.fillStyle = 'rgba(30,0,0,0.3)';
    for (let r = -ry; r < ry; r += 5) {
      for (let q = -rx; q < rx; q += 5) { x.beginPath(); x.arc(ex + q + ((r / 5) % 2 ? 2.5 : 0), ey + r, 1.2, 0, TAU); x.fill(); }
    }
    x.restore();
    x.strokeStyle = 'rgba(255,220,210,0.22)';
    x.lineWidth = 4;
    x.beginPath(); x.ellipse(ex, ey, rx * 0.72, ry * 0.8, rot, Math.sign(ex) > 0 ? -1.2 : -2.4, Math.sign(ex) > 0 ? -0.5 : -1.9); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.4)';
    x.lineWidth = 3;
    x.beginPath(); x.ellipse(ex, ey, rx, ry, rot, 0, TAU); x.stroke();
  }
  // --- the back of the head: pale, bristled, the stripe over the crown
  const hg = x.createRadialGradient(22, -86, 6, 2, -54, 60);
  hg.addColorStop(0, css(L.skinL)); hg.addColorStop(0.6, css(L.skin)); hg.addColorStop(1, css(L.skinD));
  x.fillStyle = hg;
  x.fill(HEAD);
  x.save();
  x.clip(HEAD);
  x.fillStyle = css(L.ink);
  x.beginPath();
  x.moveTo(-4, -116); x.bezierCurveTo(-28, -92, -36, -50, -32, 4); x.lineTo(-6, 4); x.bezierCurveTo(-12, -50, -6, -92, 16, -114); x.closePath();
  x.fill();
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.beginPath(); x.ellipse(2, -8, 50, 18, 0, 0, TAU); x.fill();
  x.restore();
  x.strokeStyle = 'rgba(28,24,22,0.8)';
  x.lineWidth = 2.4;
  x.beginPath();
  for (let i = 0; i < 30; i++) {
    const a = -PI / 2 + (hash(i * 1.9) - 0.5) * 2.4;
    const px = 2 + Math.cos(a) * 48 * hash(i * 2.7 + 1), py = -54 + Math.sin(a) * 52 * (0.6 + 0.4 * hash(i * 3.3));
    x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8 - 3);
  }
  // the big bristles on the crown, and the three simple eyes
  x.moveTo(-20, -104); x.quadraticCurveTo(-30, -124, -42, -130);
  x.moveTo(24, -104); x.quadraticCurveTo(34, -124, 46, -130);
  x.stroke();
  x.fillStyle = 'rgba(40,10,10,0.8)';
  for (const [ox, oy] of [[-8, -106], [8, -106], [0, -97]]) { x.beginPath(); x.arc(ox, oy, 3, 0, TAU); x.fill(); }
  // antennae just showing over the brow
  x.strokeStyle = css(L.beard);
  x.lineWidth = 4;
  x.beginPath(); x.moveTo(-12, -108); x.quadraticCurveTo(-18, -124, -8, -134); x.moveTo(16, -108); x.quadraticCurveTo(24, -126, 16, -136); x.stroke();
  x.lineWidth = 1.2;
  x.beginPath();
  for (const [ax, ay, s] of [[-8, -134, -1], [16, -136, 1]]) {
    x.moveTo(ax, ay); x.quadraticCurveTo(ax + s * 10, ay - 12, ax + s * 18, ay - 10);
    for (let k = 1; k < 5; k++) { const px = ax + s * k * 4, py = ay - k * 2.6; x.moveTo(px, py); x.lineTo(px + s * 2, py - 4); }
  }
  x.stroke();
  return c;
}

// ---------------------------------------------------------------- weapons

/** The frost axe, handle down from the grip at 0,0, head up with the blade to +x; one unit a pixel. */
function bakeAxe() {
  const c = makeCanvas(200, 260);
  const x = c.getContext('2d');
  x.translate(70, 236);
  x.lineCap = 'round';
  // the haft, leather-bound
  x.fillStyle = '#3a2618';
  x.fillRect(-7, -210, 14, 226);
  x.fillStyle = '#5a3c26';
  x.fillRect(-7, -210, 5, 226);
  x.strokeStyle = '#1e140c';
  x.lineWidth = 2;
  for (let y = -20; y > -120; y -= 9) { x.beginPath(); x.moveTo(-7, y); x.lineTo(7, y - 6); x.stroke(); }
  x.fillStyle = '#6a6c70';
  x.fillRect(-9, 10, 18, 10);
  x.beginPath(); x.arc(0, 22, 8, 0, TAU); x.fill();
  x.fillRect(-9, -128, 18, 8);
  // the head: a bearded blade, frost-bright, runes down it
  const blade = new Path2D();
  blade.moveTo(-6, -214);
  blade.lineTo(28, -224);
  blade.bezierCurveTo(60, -232, 92, -236, 112, -230);
  blade.bezierCurveTo(124, -200, 126, -150, 110, -110);
  blade.bezierCurveTo(92, -118, 70, -128, 56, -150);
  blade.bezierCurveTo(40, -164, 24, -170, 8, -170);
  blade.lineTo(-6, -170);
  blade.closePath();
  const bg = x.createLinearGradient(0, -236, 120, -120);
  bg.addColorStop(0, '#8b949e'); bg.addColorStop(0.5, '#c9d2da'); bg.addColorStop(0.85, '#e8f2fa'); bg.addColorStop(1, '#ffffff');
  x.fillStyle = bg;
  x.fill(blade);
  x.strokeStyle = '#2c3036';
  x.lineWidth = 3;
  x.stroke(blade);
  // the edge, bright
  x.strokeStyle = 'rgba(240,250,255,0.95)';
  x.lineWidth = 4;
  x.beginPath(); x.moveTo(112, -230); x.bezierCurveTo(124, -200, 126, -150, 110, -110); x.stroke();
  // the poll behind the haft
  x.fillStyle = '#4a4e54';
  x.beginPath(); x.moveTo(-6, -212); x.lineTo(-26, -206); x.lineTo(-26, -178); x.lineTo(-6, -172); x.fill();
  // etched runes, cold blue
  x.strokeStyle = '#2a7ab8';
  x.lineWidth = 2.5;
  x.beginPath();
  for (let i = 0; i < 3; i++) runePath(x, [13, 4, 22][i], 24 + i * 24, -214 + i * 14, 20);
  x.stroke();
  x.strokeStyle = 'rgba(170,230,255,0.9)';
  x.lineWidth = 1.2;
  x.stroke();
  return c;
}

/** A blade of chaos: a curved short blade, hilt at 0,0, pointing +x. */
function bakeBlade() {
  const c = makeCanvas(220, 90);
  const x = c.getContext('2d');
  x.translate(30, 45);
  const blade = new Path2D();
  blade.moveTo(10, -8);
  blade.bezierCurveTo(60, -22, 120, -26, 176, -8);
  blade.lineTo(186, 4);
  blade.bezierCurveTo(150, 0, 120, 8, 100, 18);
  blade.lineTo(92, 10);
  blade.bezierCurveTo(70, 14, 40, 14, 10, 8);
  blade.closePath();
  const bg = x.createLinearGradient(0, -24, 0, 18);
  bg.addColorStop(0, '#ffd08a'); bg.addColorStop(0.35, '#d86a2a'); bg.addColorStop(1, '#5a1a0c');
  x.fillStyle = bg;
  x.fill(blade);
  x.strokeStyle = '#2a0e06';
  x.lineWidth = 2.5;
  x.stroke(blade);
  x.strokeStyle = 'rgba(255,236,190,0.95)';
  x.lineWidth = 2;
  x.beginPath(); x.moveTo(20, -10); x.bezierCurveTo(70, -22, 120, -24, 172, -8); x.stroke();
  // guard and grip
  x.fillStyle = '#3a2a22';
  x.fillRect(-4, -14, 14, 28);
  x.fillStyle = '#8a6a3a';
  x.fillRect(-26, -6, 24, 12);
  x.beginPath(); x.arc(-26, 0, 7, 0, TAU); x.fill();
  return c;
}

// ------------------------------------------------------- the warrior, moving

/** Local (body) coordinates to the screen, and back. */
const toScreen = (p, bob) => [CX + p[0] * WS, CY + bob + p[1] * WS];
const toLocal = (x, y, bob) => [(x - CX) / WS, (y - CY - bob) / WS];

const SH = [180, 76];
const ARM = {
  down: { E: [226, 230], H: [232, 380] },
  ready: { E: [262, 150], H: [206, -14] },
  cocked: { E: [276, 120], H: [176, -46] },
  blades: { E: [262, 200], H: [300, 118] },
};
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** A limb's outline from A to B: widths at each end and at its belly, `at` of the way along. */
function limbPath(A, B, w0, wm, w1, at) {
  const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const p = new Path2D();
  const N = 10;
  const wAt = (u) => (u < at ? lerp(w0, wm, smooth(u / at)) : lerp(wm, w1, smooth((u - at) / (1 - at)))) / 2;
  for (let i = 0; i <= N; i++) { const u = i / N, w = wAt(u); p.lineTo(A[0] + dx * u + nx * w, A[1] + dy * u + ny * w); }
  const a = Math.atan2(dy, dx);
  p.arc(B[0], B[1], w1 / 2, a + PI / 2, a - PI / 2, true);
  for (let i = N; i >= 0; i--) { const u = i / N, w = wAt(u); p.lineTo(A[0] + dx * u - nx * w, A[1] + dy * u - ny * w); }
  p.arc(A[0], A[1], w0 / 2, a - PI / 2, a + PI / 2, true);
  p.closePath();
  return { p, nx, ny, dx: dx / l, dy: dy / l, l };
}

/** Fill a limb and model it: lit toward the upper right, shadowed under. */
function shadeLimb(ctx, L, A, B, lp, w) {
  ctx.fillStyle = css(L.skin);
  ctx.fill(lp.p);
  ctx.save();
  ctx.clip(lp.p);
  const lit = lp.nx * 0.6 - lp.ny * 0.8 > 0 ? 1 : -1;
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(L.skinD, 0.75);
  ctx.lineWidth = w * 0.55;
  ctx.beginPath(); ctx.moveTo(A[0] - lp.nx * lit * w * 0.42, A[1] - lp.ny * lit * w * 0.42); ctx.lineTo(B[0] - lp.nx * lit * w * 0.42, B[1] - lp.ny * lit * w * 0.42); ctx.stroke();
  ctx.strokeStyle = css(L.skinL, 0.5);
  ctx.lineWidth = w * 0.22;
  ctx.beginPath(); ctx.moveTo(A[0] + lp.nx * lit * w * 0.26, A[1] + lp.ny * lit * w * 0.26); ctx.lineTo(lerp(A[0], B[0], 0.85) + lp.nx * lit * w * 0.24, lerp(A[1], B[1], 0.85) + lp.ny * lit * w * 0.24); ctx.stroke();
  ctx.restore();
}

/** An arm from the shoulder: upper arm, forearm under a bracer, and a fist or an open hand. */
function drawArm(ctx, L, E, Hd, { open = false, dir = null } = {}) {
  const up = limbPath(SH, E, 80, 78, 56, 0.4);
  shadeLimb(ctx, L, SH, E, up, 76);
  ctx.strokeStyle = css(L.skinL, 0.4);
  ctx.lineWidth = 3;
  const m1 = lerp2(SH, E, 0.5);
  ctx.beginPath(); ctx.moveTo(m1[0] - 10, m1[1] - 12); ctx.lineTo(m1[0] + 12, m1[1] + 6); ctx.stroke();
  const fore = limbPath(E, Hd, 60, 62, 42, 0.28);
  shadeLimb(ctx, L, E, Hd, fore, 58);
  // the bracer: leather over the forearm, iron bands
  const b0 = lerp2(E, Hd, 0.34), b1 = lerp2(E, Hd, 0.9);
  const br = limbPath(b0, b1, 66, 64, 52, 0.3);
  ctx.fillStyle = css(L.leatherD);
  ctx.fill(br.p);
  ctx.save();
  ctx.clip(br.p);
  ctx.strokeStyle = css(L.leather);
  ctx.lineWidth = 30;
  ctx.beginPath(); ctx.moveTo(b0[0] + br.nx * 8, b0[1] + br.ny * 8); ctx.lineTo(b1[0] + br.nx * 8, b1[1] + br.ny * 8); ctx.stroke();
  ctx.strokeStyle = css(L.iron);
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (const u of [0.08, 0.5, 0.9]) {
    const p = lerp2(b0, b1, u);
    ctx.moveTo(p[0] + br.nx * 40, p[1] + br.ny * 40); ctx.lineTo(p[0] - br.nx * 40, p[1] - br.ny * 40);
  }
  ctx.stroke();
  ctx.strokeStyle = css(mix(L.iron, [255, 255, 255], 0.4), 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  const ux = fore.dx, uy = fore.dy;
  if (open) {
    const [fx0, fy0] = dir ?? [ux, uy];
    ctx.lineCap = 'round';
    ctx.strokeStyle = css(L.skinD);
    ctx.lineWidth = 15;
    ctx.beginPath();
    for (const sp of [-0.75, -0.28, 0.18, 0.62]) {
      const c = Math.cos(sp), sn = Math.sin(sp);
      const fx = fx0 * c - fy0 * sn, fy = fx0 * sn + fy0 * c;
      ctx.moveTo(Hd[0] + fx0 * 12, Hd[1] + fy0 * 12); ctx.lineTo(Hd[0] + fx0 * 12 + fx * 36, Hd[1] + fy0 * 12 + fy * 36);
    }
    ctx.stroke();
    ctx.strokeStyle = css(L.skin);
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = css(L.skin);
    ctx.beginPath(); ctx.arc(Hd[0] + fx0 * 6, Hd[1] + fy0 * 6, 24, 0, TAU); ctx.fill();
  } else {
    // a fist, wrapped in leather, two hooked claws showing
    ctx.save();
    ctx.translate(Hd[0] + ux * 8, Hd[1] + uy * 8);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = css(L.skinD);
    rrect(ctx, -22, -26, 50, 52, 16); ctx.fill();
    ctx.fillStyle = css(L.skin);
    rrect(ctx, -18, -22, 42, 42, 13); ctx.fill();
    ctx.fillStyle = css(L.leather);
    ctx.fillRect(-18, -22, 12, 44);
    ctx.fillRect(2, -22, 7, 44);
    ctx.fillStyle = css(L.skinL, 0.5);
    for (const k of [-13, 0, 13]) { ctx.beginPath(); ctx.ellipse(22, k, 5, 5.5, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(20,16,14,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(26, -20); ctx.quadraticCurveTo(38, -24, 36, -12); ctx.moveTo(26, 18); ctx.quadraticCurveTo(38, 24, 36, 12); ctx.stroke();
    ctx.restore();
  }
}

/** The axe at a point, turned `ang` (0 = head up), scale `s` of its baked size. */
function drawAxeAt(ctx, x, y, ang, s, glowA = 0.5) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.drawImage(FX.axe, -70, -236);
  ctx.restore();
  if (glowA > 0) {
    const hx = x + Math.sin(ang) * 180 * s + Math.cos(ang) * 50 * s, hy = y - Math.cos(ang) * 180 * s + Math.sin(ang) * 50 * s;
    glow(ctx, FX.frost, hx, hy, 110 * s, glowA);
  }
}

/** A blade at a point, pointing along `ang`, with fire running along it. */
function drawBladeAt(ctx, x, y, ang, s, t, heat = 1) {
  const tipX = x + Math.cos(ang) * 150 * s, tipY = y + Math.sin(ang) * 150 * s;
  glow(ctx, FX.fire, lerp(x, tipX, 0.55), lerp(y, tipY, 0.55), 120 * s * (0.9 + 0.1 * Math.sin(t * 17)), 0.55 * heat);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.drawImage(FX.blade, -30, -45);
  // flames licking up off the blade
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const px = 30 + i * 26, fl = 22 + 16 * Math.sin(t * 13 + i * 2.1) + 10 * hash(Math.floor(t * 20) + i);
    ctx.fillStyle = i % 2 ? 'rgba(255,150,40,0.55)' : 'rgba(255,210,110,0.5)';
    ctx.beginPath();
    ctx.moveTo(px - 10, -8); ctx.quadraticCurveTo(px - 4, -fl * 0.6, px + Math.sin(t * 9 + i) * 6, -fl * heat); ctx.quadraticCurveTo(px + 6, -fl * 0.5, px + 12, -6);
    ctx.fill();
  }
  ctx.restore();
}

/** The chain from a hand to its blade, glowing where it is hot, sagging a little. */
function drawChain(ctx, x0, y0, x1, y1, sag, heat) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(30,18,14,0.95)';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,120,40,${(0.35 * heat).toFixed(3)})`;
  ctx.lineWidth = 14;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,190,110,${(0.85 * heat).toFixed(3)})`;
  ctx.lineWidth = 3.5;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** A round shield raised on the left: iron-rimmed planks and a boss, or a war-shield bound in gold. */
function drawShield(ctx, game, x, y, R, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(10, 14, R * 0.86, R, 0, 0, TAU); ctx.fill();
  const face = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R);
  if (game === 'gow') { face.addColorStop(0, '#6a5038'); face.addColorStop(1, '#2e2016'); }
  else { face.addColorStop(0, '#5a6a80'); face.addColorStop(1, '#1e2634'); }
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.86, R, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) { ctx.moveTo(i * R * 0.2, -R); ctx.lineTo(i * R * 0.2, R); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = game === 'gow' ? '#6c6e70' : '#c8a452';
  ctx.lineWidth = R * 0.1;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.82, R * 0.95, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.76, R * 0.89, 0, PI * 1.1, PI * 1.6); ctx.stroke();
  drawKnot(ctx, 0, 0, R * 0.5, 0.3, { p: 3, q: 2, width: R * 0.05, color: game === 'gow' ? '#a88a58' : '#e0bc6a', edge: 'rgba(20,14,8,0.8)', alpha: 0.9 * k });
  const boss = ctx.createRadialGradient(-R * 0.06, -R * 0.08, 2, 0, 0, R * 0.2);
  boss.addColorStop(0, '#e8e4dc'); boss.addColorStop(1, game === 'gow' ? '#54504a' : '#8a6a2a');
  ctx.fillStyle = boss;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.18, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * Where the weapon is this frame, from the clock alone: the axe thrown at
 * the enemy, sticking, called back and caught; or a blade flung out on its
 * chain through the enemy and snapped back.
 */
const AXE_T = { cock: 0.05, leave: 0.075, hit: 0.16, call: 0.28, back: 0.42, done: 0.5 };
const BLADE_T = { cock: 0.07, swing: 0.24, back: 0.36, done: 0.42 };

function attackState(g, S) {
  const since = g.clock - g.shotAt;
  const period = S.game === 'gow' ? AXE_T.done : BLADE_T.done;
  const active = S.aim > 0.4 && since >= 0 && since < period && !g.dead;
  return { since, active };
}
const norm2 = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** The arm stretched toward a target at local point T: elbow bent a little down. */
function reachPose(T) {
  const d = Math.hypot(T[0] - SH[0], T[1] - SH[1]);
  const [dx, dy] = norm2(T[0] - SH[0], T[1] - SH[1]);
  const len = clamp(d * 0.85, 120, 214);
  return { E: [SH[0] + dx * len * 0.52 - dy * 34, SH[1] + dy * len * 0.52 + dx * 34], H: [SH[0] + dx * len, SH[1] + dy * len], dir: [dx, dy] };
}
const mixPose = (a, b, k) => ({ E: lerp2(a.E, b.E, k), H: lerp2(a.H, b.H, k) });

/**
 * The warrior and its weapon this frame. Returns where the weapon is in the
 * world, so the caller can draw what it does out there (the axe in flight,
 * a blade's arc) over the enemy.
 */
function drawWarrior(ctx, g, t, game, foe, light) {
  const L = LOOKS[game];
  if (!FX.bodies[game]) FX.bodies[game] = bakeWarrior(game);
  const dead = g.dead ? smooth(clamp01(g.dead.t / 1.1)) : 0;
  const bob = Math.sin(t * 1.7) * 2.4 * (1 - dead) + dead * 460;
  const aim = smooth(clamp01(S.aim));
  const { since, active } = attackState(g, S);
  const target = foe ? [foe.x, foe.chestY] : S.lastTarget;
  const Tl = toLocal(target[0], target[1], bob);
  const reach = reachPose(Tl);
  const rest = mixPose(ARM.down, game === 'gow' ? ARM.ready : ARM.blades, aim);
  let pose = rest;
  let open = false;
  let axeHand = game === 'gow' && aim > 0.5;
  let axeAng = -0.5;
  const out = { axe: null, blade: null, puff: 0, bob };
  if (game === 'gow' && active) {
    if (since < AXE_T.cock) { const u = smooth(since / AXE_T.cock); pose = mixPose(ARM.ready, ARM.cocked, u); axeAng = lerp(-0.5, -1.35, u); }
    else if (since < AXE_T.leave) { const u = smooth((since - AXE_T.cock) / (AXE_T.leave - AXE_T.cock)); pose = mixPose(ARM.cocked, reach, u); axeAng = lerp(-1.35, 0.4, u); }
    else if (since < AXE_T.hit) { pose = reach; axeHand = false; out.axe = { phase: 'out', u: (since - AXE_T.leave) / (AXE_T.hit - AXE_T.leave) }; }
    else if (since < AXE_T.call) { const u = (since - AXE_T.hit) / (AXE_T.call - AXE_T.hit); pose = mixPose(reach, ARM.ready, 0.45 * Math.sin(u * PI)); axeHand = false; open = u > 0.55; out.axe = { phase: 'stuck', u }; }
    else if (since < AXE_T.back) { pose = reach; axeHand = false; open = true; out.axe = { phase: 'back', u: (since - AXE_T.call) / (AXE_T.back - AXE_T.call) }; }
    else { const u = smooth((since - AXE_T.back) / (AXE_T.done - AXE_T.back)); pose = mixPose(reach, ARM.ready, u); axeAng = lerp(0.3, -0.5, u); out.puff = 1 - u; }
  }
  let bladeHand = game === 'gowr';
  let bladeAng = 1.15;
  if (game === 'gowr' && active) {
    const side = Math.round(g.shotAt / BLADE_T.done) % 2 ? 1 : -1;
    const flung = side > 0;
    if (since < BLADE_T.cock) {
      const u = smooth(since / BLADE_T.cock);
      if (flung) { pose = mixPose(ARM.blades, ARM.cocked, u); bladeAng = lerp(1.15, -2.2, u); }
    } else if (since < BLADE_T.swing) {
      const u = (since - BLADE_T.cock) / (BLADE_T.swing - BLADE_T.cock);
      if (flung) { pose = mixPose(ARM.cocked, reach, smooth(Math.min(1, u * 2.5))); bladeHand = false; }
      out.blade = { phase: 'swing', u, side };
    } else if (since < BLADE_T.back) {
      const u = (since - BLADE_T.swing) / (BLADE_T.back - BLADE_T.swing);
      if (flung) { pose = mixPose(reach, ARM.blades, smooth(u)); bladeHand = false; }
      out.blade = { phase: 'back', u, side };
    } else {
      const u = (since - BLADE_T.back) / (BLADE_T.done - BLADE_T.back);
      out.blade = { phase: 'fade', u, side };
    }
  }
  ctx.save();
  ctx.translate(CX, CY + bob);
  ctx.rotate(dead * 0.32 + Math.sin(t * 0.5) * 0.006);
  ctx.scale(WS, WS);
  // Spartan rage: the body smoulders red
  const rage = clamp01((g.tilt - 0.6) / 0.25);
  if (rage > 0 && !g.dead) {
    const p = 0.7 + 0.3 * Math.sin(t * 9);
    glow(ctx, FX.red, 0, 120, 360, 0.35 * rage * p);
    glow(ctx, FX.fire, 0, -60, 200, 0.25 * rage * p);
  }
  const armDown = pose.H[1] > 160;
  if (armDown) drawArm(ctx, L, pose.E, pose.H, { open });
  ctx.drawImage(FX.bodies[game], -BOX, -BOY, BW, BH);
  // light: backlit it darkens, and the light's side gets a rim
  ctx.save();
  ctx.clip(TORSO);
  if (light.back > 0.02) { ctx.fillStyle = `rgba(6,10,14,${(light.back * 0.3).toFixed(3)})`; ctx.fillRect(-260, -40, 520, 450); }
  if (Math.abs(light.side) > 0.05) { ctx.fillStyle = rimGradient(light.side, light.warm); ctx.fillRect(-260, -40, 520, 450); }
  ctx.restore();
  if (Math.abs(light.side) > 0.05) {
    ctx.save();
    ctx.clip(HEAD);
    ctx.fillStyle = rimGradient(light.side * 0.8, light.warm);
    ctx.fillRect(-60, -130, 130, 130);
    ctx.restore();
  }
  // the axe rides on the back until there is something to throw it at
  if (game === 'gow' && !axeHand && !out.axe && aim <= 0.5) drawAxeAt(ctx, 60, 280, -0.95, 0.72, 0.18);
  if (!armDown) {
    const [dx, dy] = norm2(pose.H[0] - pose.E[0], pose.H[1] - pose.E[1]);
    if (axeHand) drawAxeAt(ctx, pose.H[0] - Math.sin(axeAng) * 26, pose.H[1] + Math.cos(axeAng) * 26, axeAng, 0.56, 0.35 + out.puff * 0.8);
    drawArm(ctx, L, pose.E, pose.H, { open, dir: open ? reach.dir : null });
    if (bladeHand) drawBladeAt(ctx, pose.H[0] + dx * 10, pose.H[1] + dy * 10, bladeAng, 0.72, t, 0.9);
  }
  // the shield comes up when something big is nearly on top of it
  const big = foe && foe.loom ? smoothstep(0.5, 0.8, foe.e.grow) : 0;
  if (big > 0 && !g.dead) drawShield(ctx, game, -150 + (1 - big) * -120, 60 + (1 - big) * 120, 150, big);
  ctx.restore();
  const hand = toScreen(pose.H, bob);
  out.hand = hand;
  out.target = target;
  return out;
}

const RIMS = {};
/** Warm (or cold) light on one side of the body: `side` > 0 the right. */
function rimGradient(side, warm) {
  const q = Math.round(clamp(side, -1, 1) * 8);
  const key = `${q}:${warm}`;
  if (!RIMS[key]) {
    const x = FX.vignette.getContext('2d');
    const gr = x.createLinearGradient(-200, 0, 200, 0);
    const s = q / 8;
    const c = warm === 'gold' ? '255,196,110' : warm === 'ice' ? '170,210,255' : '246,232,196';
    gr.addColorStop(0, `rgba(${c},${(Math.max(0, -s) * 0.4).toFixed(3)})`);
    gr.addColorStop(0.3, `rgba(${c},0)`);
    gr.addColorStop(0.7, `rgba(${c},0)`);
    gr.addColorStop(1, `rgba(${c},${(Math.max(0, s) * 0.4).toFixed(3)})`);
    RIMS[key] = gr;
  }
  return RIMS[key];
}

/** The axe out in the world: spinning to the enemy with frost streaming off it, stuck fast, called home. */
function drawAxeFlight(ctx, w, foe, t) {
  const a = w.axe;
  if (!a) {
    if (w.puff > 0) {
      glow(ctx, FX.frost, w.hand[0], w.hand[1] - 40, 120 * (1.3 - w.puff * 0.3), 0.7 * w.puff);
      glow(ctx, FX.white, w.hand[0], w.hand[1] - 40, 40, 0.6 * w.puff);
    }
    return;
  }
  const T = w.target;
  const H0 = w.hand;
  const sT = foe ? clamp(foe.hh / 200 * 0.3, 0.22, 0.95) : 0.3;
  const sH = 0.64;
  const pathOut = (u) => {
    const cx = (H0[0] + T[0]) / 2 - 20, cy = Math.min(H0[1], T[1]) - 110;
    const v = 1 - u;
    return [v * v * H0[0] + 2 * v * u * cx + u * u * T[0], v * v * H0[1] + 2 * v * u * cy + u * u * T[1]];
  };
  const pathBack = (u) => {
    const cx = (H0[0] + T[0]) / 2 + 90, cy = Math.max(H0[1], T[1]) - 10;
    const v = 1 - u;
    return [v * v * T[0] + 2 * v * u * cx + u * u * H0[0], v * v * T[1] + 2 * v * u * cy + u * u * H0[1]];
  };
  if (a.phase === 'stuck') {
    // frozen in the enemy, frost crawling out from the wound
    const k = 1 - a.u;
    glow(ctx, FX.frost, T[0], T[1], 150 * sT / 0.3, 0.55 + 0.3 * k);
    if (a.u < 0.35) {
      const f = a.u / 0.35;
      glow(ctx, FX.white, T[0], T[1], 90 * (0.5 + f) * sT / 0.3, 0.9 * (1 - f));
      ctx.strokeStyle = `rgba(220,245,255,${(0.9 * (1 - f)).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const an = (i / 10) * TAU + 0.3, r0 = 20 * sT / 0.3, r1 = (40 + f * 70) * sT / 0.3;
        ctx.moveTo(T[0] + Math.cos(an) * r0, T[1] + Math.sin(an) * r0); ctx.lineTo(T[0] + Math.cos(an) * r1, T[1] + Math.sin(an) * r1);
      }
      ctx.stroke();
    }
    iceShards(ctx, T[0], T[1], 70 * sT / 0.3, 0.8);
    drawAxeAt(ctx, T[0] - 30 * sT, T[1] + 60 * sT, 0.75, sT, 0.4);
    return;
  }
  const P = a.phase === 'out' ? pathOut : pathBack;
  const u = smooth(a.u) * 0.2 + a.u * 0.8;
  const sc = (v) => (a.phase === 'out' ? lerp(sH, sT, v) : lerp(sT, sH, v));
  // the frost trail behind it
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 12; k >= 1; k--) {
    const v = u - k * 0.035;
    if (v < 0) continue;
    const [px, py] = P(v);
    const al = (1 - k / 13) * 0.5;
    ctx.globalAlpha = al;
    const r = 60 * sc(v);
    ctx.drawImage(FX.frost, px - r, py - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(200,240,255,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k <= 12; k++) { const v = Math.max(0, u - k * 0.035); const [px, py] = P(v); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke();
  ctx.restore();
  // sparkles of frost falling off
  ctx.fillStyle = 'rgba(230,248,255,0.9)';
  for (let i = 0; i < 12; i++) {
    const v = u - hash(i * 3.1) * 0.4;
    if (v < 0) continue;
    const [px, py] = P(v);
    ctx.fillRect(px + (hash(i * 5.7) - 0.5) * 40 * sc(v), py + (hash(i * 7.3) - 0.5) * 40 * sc(v) + (u - v) * 60, 2.5, 2.5);
  }
  const [x, y] = P(u);
  const spin = (a.phase === 'out' ? 1 : -1) * u * TAU * 2.6;
  // the axe spins about its head, so draw it round there
  const s = sc(u);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.translate(-40 * s, 150 * s);
  drawAxeAt(ctx, 0, 0, 0, s, 0.7);
  ctx.restore();
}

/** Pale blue shards of ice bristling out round a point. */
function iceShards(ctx, x, y, R, k) {
  ctx.save();
  ctx.globalAlpha = k;
  for (let i = 0; i < 9; i++) {
    const an = hash(i * 3.7) * TAU, d = R * (0.3 + 0.5 * hash(i * 1.9)), len = R * (0.35 + 0.5 * hash(i * 5.3));
    const bx = x + Math.cos(an) * d, by = y + Math.sin(an) * d;
    const ex = bx + Math.cos(an) * len, ey = by + Math.sin(an) * len;
    const w = len * 0.22;
    ctx.fillStyle = 'rgba(190,230,255,0.75)';
    ctx.beginPath(); ctx.moveTo(bx - Math.sin(an) * w, by + Math.cos(an) * w); ctx.lineTo(ex, ey); ctx.lineTo(bx + Math.sin(an) * w, by - Math.cos(an) * w); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
  }
  ctx.restore();
}

/** A blade flung on its chain in a burning arc through the enemy, and back. */
function drawBladeArc(ctx, w, foe, t) {
  const b = w.blade;
  if (!b) return;
  const T = w.target;
  const rx = clamp((foe ? foe.hh : 200) * 1.3, 240, 560), ry = rx * 0.34;
  const C = [T[0], T[1] + ry];
  const th = (u) => (b.side > 0 ? -PI / 2 + 1.3 - 2.6 * u : -PI / 2 - 1.3 + 2.6 * u);
  const at = (u) => [C[0] + Math.cos(th(u)) * rx, C[1] + Math.sin(th(u)) * ry];
  const hand = b.side > 0 ? w.hand : [120, H + 60];
  let head, fade = 1, u = 1;
  if (b.phase === 'swing') {
    u = b.u;
    const p = at(u);
    const k = smooth(Math.min(1, u / 0.22));
    head = [lerp(hand[0], p[0], k), lerp(hand[1], p[1], k)];
  } else if (b.phase === 'back') {
    head = [lerp(at(1)[0], hand[0], smooth(b.u)), lerp(at(1)[1], hand[1], smooth(b.u))];
    fade = 1 - b.u * 0.7;
  } else { fade = 0.3 * (1 - b.u); }
  // the burning arc: widest and brightest at the blade, thinning to embers behind it
  const tail = Math.max(0, u - 0.55);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const N = 14;
  for (let i = 0; i < N; i++) {
    const u0 = lerp(tail, u, i / N), u1 = lerp(tail, u, (i + 1) / N);
    if (u1 < 0.18 && b.phase === 'swing') continue;
    const k = ((i + 1) / N) * fade;
    const p0 = at(u0), p1 = at(u1);
    for (const [col, wd, al] of [['255,80,20', 58, 0.2], ['255,130,40', 30, 0.45], ['255,200,110', 13, 0.7], ['255,246,220', 5, 0.95]]) {
      ctx.strokeStyle = `rgba(${col},${(al * k).toFixed(3)})`;
      ctx.lineWidth = wd * (0.4 + 0.6 * k);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
  }
  // embers shed along it
  ctx.fillStyle = `rgba(255,190,90,${(0.8 * fade).toFixed(3)})`;
  for (let i = 0; i < 18; i++) {
    const v = lerp(tail, u, hash(i * 2.3));
    const p = at(v);
    const drift = (u - v) * 90;
    ctx.fillRect(p[0] + (hash(i * 4.1) - 0.5) * 30, p[1] - drift + (hash(i * 6.7) - 0.5) * 20, 3, 3);
  }
  // where it cuts through: a burst of sparks
  if (b.phase === 'swing' && Math.abs(u - 0.5) < 0.18) {
    const k = 1 - Math.abs(u - 0.5) / 0.18;
    glow(ctx, FX.fire, T[0], T[1], 140 * k + 40, 0.7 * k);
    ctx.strokeStyle = `rgba(255,220,150,${(0.9 * k).toFixed(3)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const an = hash(i * 7.7 + Math.floor(t * 8)) * TAU, r0 = 10, r1 = 40 + hash(i * 3.3) * 70 * k;
      ctx.moveTo(T[0] + Math.cos(an) * r0, T[1] + Math.sin(an) * r0); ctx.lineTo(T[0] + Math.cos(an) * r1, T[1] + Math.sin(an) * r1);
    }
    ctx.stroke();
  }
  ctx.restore();
  if (!head) return;
  drawChain(ctx, hand[0], hand[1], head[0], head[1], 30, fade);
  const ang = Math.atan2(head[1] - C[1], head[0] - C[0]);
  drawBladeAt(ctx, head[0], head[1], ang, 0.62, t, 1.3);
}

// ================================================================ enemies

/**
 * Everything the enemies are made of, in two airs: Midgard's grey-green mist
 * and Fimbulwinter's blue-white snow.
 */
/** How much of a thing r metres off is lost in the blizzard. */
const fwAir = (r) => 1 - Math.exp(-r / 110);
const MG_AIR = '#96a4a0';
const FW_AIR = '#a8bccf';
const kit = (air) => ({
  rag: P('#2c2824', air), ragL: P('#4a423a', air), hide: P('#4e4438', air), rot: P('#5e5244', air), bone: P('#a89c84', air),
  rust: P('#6e4a32', air), iron: P('#5c5e62', air), ironL: P('#9a9ea4', air), wood: P('#4a3424', air), leather: P('#4a3222', air),
  troll: P('#5c6a64', air), trollD: P('#343e3a', air), trollL: P('#86948a', air), moss: P('#56643a', air), stone: P('#6a6c66', air), stoneD: P('#3e403c', air),
  steel: P('#7488a4', air), steelD: P('#34405a', air), steelL: P('#c4d4ea', air), gold: P('#c8a452', air), cape: P('#2e4a7a', air),
  fur: P('#4a3a2c', air), furL: P('#7a6650', air), bear: P('#2a221c', air), bearL: P('#5a4a3e', air), dark: P('#2e2a34', air), skull: P('#d8d0bc', air), frost: P('#a8c8dc', air), frostD: P('#5a7890', air),
});
const MG_KIT = kit(MG_AIR);
const FW_KIT = kit(FW_AIR);

/** Per enemy name, how it is dressed and what burns in its eyes. */
function styleOf(name, seed, game) {
  const s = { eyes: [255, 140, 40], helm: seed > 0.5 ? 'horned' : 'nasal', weapon: seed > 0.35 ? 'axe' : 'sword', shield: seed < 0.3, hood: false, beast: false, frost: false };
  if (name === 'Hel-Walker') Object.assign(s, { eyes: [150, 220, 255], helm: 'horned', frost: true });
  if (name === 'Revenant') Object.assign(s, { eyes: [200, 120, 255], hood: true, weapon: 'claws', shield: false });
  if (name === 'Wulver') Object.assign(s, { eyes: [255, 190, 80], beast: true, weapon: 'claws', shield: false });
  if (game === 'gowr') {
    Object.assign(s, { eyes: [140, 210, 255], helm: seed > 0.5 ? 'winged' : 'crest', weapon: seed > 0.45 ? 'spear' : 'sword', shield: seed < 0.7 });
    if (name === 'Berserker') Object.assign(s, { eyes: [255, 50, 30], helm: 'bear', weapon: 'greataxe', shield: false });
    if (name === 'Stalker') Object.assign(s, { eyes: [120, 255, 200], helm: 'hood', weapon: 'sword', shield: false });
    if (name === 'Grendel') Object.assign(s, { eyes: [150, 230, 255], ogre: true });
    if (name === 'Dreki') Object.assign(s, { eyes: [190, 150, 255], dreki: true });
  }
  if (name === 'Troll') s.ogre = true;
  return s;
}

/** A limb as a tapering stroke, in the figure's own units. */
function bone2(ctx, x0, y0, x1, y1, w0, w1, style) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
  ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  ctx.arc(x1, y1, w1 / 2, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
  ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
  ctx.arc(x0, y0, w0 / 2, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
  ctx.fill();
}

/**
 * A draugr facing the camera: hunched and gaunt in rotten leather and rusted
 * mail, a torn cloak, a rusted weapon, fire where its eyes and heart were.
 * Origin at its feet, one unit its height.
 */
function drawDraugr(ctx, x, y, hh, st, K, k, fl, t, pose = {}) {
  const c = (p) => tone(p, k, fl);
  const sway = Math.sin(t * 2.2 + (pose.seed ?? 0) * 9) * 0.012;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hh, hh);
  if (pose.rot) ctx.rotate(pose.rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!pose.noShadow) {
    ctx.fillStyle = 'rgba(8,10,10,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 0.24, 0.035, 0, 0, TAU); ctx.fill();
  }
  if (st.beast) { drawWulver(ctx, st, K, c, t, sway); ctx.restore(); return; }
  // the cloak behind, hanging in rags past the knees
  ctx.fillStyle = c(K.rag);
  ctx.beginPath();
  ctx.moveTo(-0.17, -0.77);
  ctx.quadraticCurveTo(-0.26, -0.5, -0.24, -0.2);
  for (let i = 0; i <= 8; i++) ctx.lineTo(-0.24 + i * 0.06, -0.2 - (i % 2) * 0.07 - hash(i * 3.1) * 0.05);
  ctx.quadraticCurveTo(0.26, -0.5, 0.17, -0.77);
  ctx.closePath();
  ctx.fill();
  // legs, bent, bound in rags
  const hide = c(st.frost ? K.frostD : K.hide);
  bone2(ctx, -0.07, -0.48, -0.13, -0.25, 0.075, 0.06, c(K.rag));
  bone2(ctx, -0.13, -0.25, -0.11, -0.02, 0.06, 0.045, hide);
  bone2(ctx, 0.07, -0.48, 0.13, -0.26, 0.075, 0.06, c(K.rag));
  bone2(ctx, 0.13, -0.26, 0.12, -0.02, 0.06, 0.045, hide);
  ctx.fillStyle = c(K.leather);
  ctx.beginPath(); ctx.ellipse(-0.12, -0.01, 0.05, 0.022, 0, 0, TAU); ctx.ellipse(0.13, -0.01, 0.05, 0.022, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = c(K.ragL);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const yy = -0.2 + i * 0.045; ctx.moveTo(s * 0.09, yy); ctx.lineTo(s * 0.15, yy - 0.012); }
  ctx.stroke();
  // knee guards
  ctx.fillStyle = c(K.rust);
  ctx.beginPath(); ctx.ellipse(-0.13, -0.26, 0.04, 0.035, 0, 0, TAU); ctx.ellipse(0.13, -0.26, 0.04, 0.035, 0, 0, TAU); ctx.fill();
  // the torn skirt of mail and leather
  ctx.fillStyle = c(K.rag);
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.53);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-0.14 + i * 0.047, -0.36 - (i % 2) * 0.05);
  ctx.lineTo(0.13, -0.53);
  ctx.closePath();
  ctx.fill();
  // the body, hunched forward: mail, a rotten jerkin, the ribs showing through a rent in it
  ctx.save();
  ctx.translate(sway, 0);
  ctx.fillStyle = c(K.hide);
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.52); ctx.lineTo(-0.19, -0.72); ctx.quadraticCurveTo(0, -0.82, 0.19, -0.72); ctx.lineTo(0.12, -0.52); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c(K.iron);
  ctx.globalAlpha = 0.5;
  for (let r = 0; r < 6; r++) for (let q = 0; q < 7; q++) { ctx.beginPath(); ctx.arc(-0.13 + q * 0.043 + (r % 2) * 0.02, -0.7 + r * 0.03, 0.009, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = c(K.rust);
  ctx.beginPath(); ctx.moveTo(-0.1, -0.74); ctx.lineTo(-0.03, -0.62); ctx.lineTo(-0.1, -0.56); ctx.closePath(); ctx.fill();
  // the rent: dark ribs over a coal
  ctx.fillStyle = '#140c08';
  ctx.beginPath(); ctx.ellipse(0.04, -0.64, 0.05, 0.06, 0.2, 0, TAU); ctx.fill();
  const [er, eg, eb] = st.eyes;
  ctx.fillStyle = `rgba(${er},${eg},${eb},0.9)`;
  ctx.beginPath(); ctx.ellipse(0.045, -0.635, 0.026, 0.034, 0.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = c(K.bone);
  ctx.lineWidth = 0.009;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const yy = -0.685 + i * 0.026; ctx.moveTo(0.0, yy); ctx.quadraticCurveTo(0.045, yy - 0.012, 0.085, yy + 0.004); }
  ctx.stroke();
  // belt
  ctx.fillStyle = c(K.leather);
  ctx.fillRect(-0.13, -0.545, 0.26, 0.03);
  ctx.fillStyle = c(K.rust);
  ctx.fillRect(-0.018, -0.548, 0.036, 0.036);
  // shoulders: rusted plates
  ctx.fillStyle = c(K.rust);
  ctx.beginPath(); ctx.ellipse(-0.18, -0.735, 0.065, 0.045, -0.4, 0, TAU); ctx.ellipse(0.18, -0.735, 0.065, 0.045, 0.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = c(K.iron);
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.ellipse(-0.18, -0.735, 0.065, 0.045, -0.4, PI, TAU); ctx.ellipse(0.18, -0.735, 0.065, 0.045, 0.4, PI, TAU); ctx.stroke();
  // arms: the weapon arm raised to strike, the other reaching out, clawed
  const raise = 0.5 + 0.5 * Math.sin(t * 3 + (pose.seed ?? 0) * 5);
  const hx = -0.24 - raise * 0.02, hy = -0.98 - raise * 0.04;
  bone2(ctx, -0.19, -0.74, -0.28, -0.86, 0.05, 0.042, hide);
  bone2(ctx, -0.28, -0.86, hx, hy, 0.042, 0.034, hide);
  bone2(ctx, 0.19, -0.74, 0.25, -0.6, 0.05, 0.042, hide);
  bone2(ctx, 0.25, -0.6, 0.22, -0.46, 0.042, 0.034, hide);
  // bracers
  ctx.strokeStyle = c(K.rust);
  ctx.lineWidth = 0.035;
  ctx.beginPath(); ctx.moveTo(-0.27, -0.88); ctx.lineTo(-0.25, -0.94); ctx.moveTo(0.245, -0.58); ctx.lineTo(0.23, -0.5); ctx.stroke();
  // weapon high: a rusted axe or a notched sword
  if (st.weapon === 'axe') {
    bone2(ctx, hx + 0.03, hy + 0.1, hx - 0.05, hy - 0.2, 0.018, 0.018, c(K.wood));
    ctx.fillStyle = c(K.rust);
    ctx.beginPath(); ctx.moveTo(hx - 0.04, hy - 0.16); ctx.quadraticCurveTo(hx - 0.16, hy - 0.2, hx - 0.17, hy - 0.08); ctx.quadraticCurveTo(hx - 0.1, hy - 0.1, hx - 0.03, hy - 0.08); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c(K.ironL);
    ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.moveTo(hx - 0.155, hy - 0.19); ctx.quadraticCurveTo(hx - 0.175, hy - 0.14, hx - 0.165, hy - 0.08); ctx.stroke();
  } else if (st.weapon === 'sword') {
    ctx.fillStyle = c(K.iron);
    ctx.beginPath(); ctx.moveTo(hx - 0.012, hy); ctx.lineTo(hx - 0.07, hy - 0.34); ctx.lineTo(hx - 0.04, hy - 0.35); ctx.lineTo(hx + 0.016, hy - 0.01); ctx.fill();
    ctx.fillStyle = c(K.rust);
    ctx.fillRect(hx - 0.04, hy - 0.012, 0.07, 0.022);
  }
  ctx.fillStyle = c(K.rag);
  ctx.beginPath(); ctx.arc(hx, hy, 0.024, 0, TAU); ctx.arc(0.22, -0.455, 0.024, 0, TAU); ctx.fill();
  // claws
  ctx.strokeStyle = c(K.bone);
  ctx.lineWidth = 0.007;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { ctx.moveTo(0.21 + i * 0.01, -0.44); ctx.lineTo(0.2 + i * 0.016, -0.405); }
  ctx.stroke();
  // a small round shield on the reaching arm
  if (st.shield) {
    ctx.fillStyle = c(K.wood);
    ctx.beginPath(); ctx.ellipse(0.25, -0.56, 0.085, 0.1, 0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = c(K.rust);
    ctx.lineWidth = 0.014;
    ctx.stroke();
    ctx.fillStyle = c(K.iron);
    ctx.beginPath(); ctx.arc(0.25, -0.56, 0.022, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(0.19, -0.5); ctx.lineTo(0.3, -0.62); ctx.moveTo(0.21, -0.63); ctx.lineTo(0.27, -0.52); ctx.stroke();
  }
  // the head, sunk between the shoulders: shrunken grey skin, a helmet, the eyes
  ctx.fillStyle = c(K.rot);
  ctx.beginPath(); ctx.ellipse(0, -0.85, 0.052, 0.06, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0c0806';
  ctx.beginPath(); ctx.ellipse(-0.021, -0.862, 0.016, 0.011, 0.2, 0, TAU); ctx.ellipse(0.021, -0.862, 0.016, 0.011, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -0.818, 0.024, 0.012, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = c(K.bone);
  for (let i = 0; i < 5; i++) ctx.fillRect(-0.02 + i * 0.009, -0.826, 0.005, 0.01);
  // wisps of a beard, grey
  ctx.strokeStyle = c(K.bone);
  ctx.lineWidth = 0.006;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const bx = -0.03 + i * 0.012; ctx.moveTo(bx, -0.81); ctx.lineTo(bx + (hash(i) - 0.5) * 0.02, -0.76 - hash(i * 3) * 0.03); }
  ctx.stroke();
  if (st.hood) {
    ctx.fillStyle = c(K.rag);
    ctx.beginPath(); ctx.moveTo(-0.07, -0.78); ctx.quadraticCurveTo(-0.09, -0.93, 0, -0.95); ctx.quadraticCurveTo(0.09, -0.93, 0.07, -0.78); ctx.lineTo(0.05, -0.8); ctx.quadraticCurveTo(0, -0.9, -0.05, -0.8); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = c(st.frost ? K.frostD : K.iron);
    ctx.beginPath(); ctx.moveTo(-0.062, -0.865); ctx.quadraticCurveTo(-0.065, -0.94, 0, -0.945); ctx.quadraticCurveTo(0.065, -0.94, 0.062, -0.865); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c(K.rust);
    ctx.fillRect(-0.064, -0.875, 0.128, 0.014);
    ctx.fillRect(-0.007, -0.875, 0.014, 0.05);
    ctx.fillStyle = c(K.ironL);
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(-0.02, -0.918, 0.018, 0.01, -0.4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (st.helm === 'horned') {
      ctx.fillStyle = c(K.bone);
      ctx.beginPath();
      ctx.moveTo(-0.055, -0.9); ctx.quadraticCurveTo(-0.13, -0.93, -0.12, -1.02); ctx.quadraticCurveTo(-0.1, -0.95, -0.045, -0.925); ctx.closePath();
      ctx.moveTo(0.055, -0.9); ctx.quadraticCurveTo(0.13, -0.93, 0.12, -1.02); ctx.quadraticCurveTo(0.1, -0.95, 0.045, -0.925); ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.restore();
  // what burns in it: the eyes, the heart, in screen space so they bloom
  const ex = x + sway * hh, ey = y - 0.862 * hh;
  const gs = st.frost ? FX.frost : st.hood ? FX.violet : FX.eye;
  glow(ctx, gs, ex, ey, hh * 0.09, 0.9);
  glow(ctx, gs, x + (0.045 + sway) * hh, y - 0.64 * hh, hh * 0.12, 0.5 + 0.2 * Math.sin(t * 6));
  ctx.fillStyle = `rgba(${Math.min(255, er + 60)},${Math.min(255, eg + 60)},${Math.min(255, eb + 60)},1)`;
  const er2 = Math.max(1.2, hh * 0.008);
  ctx.beginPath(); ctx.arc(ex - 0.021 * hh, ey, er2, 0, TAU); ctx.arc(ex + 0.021 * hh, ey, er2, 0, TAU); ctx.fill();
}

/** A wulver: a hunched wolf-thing on two legs, all fur and claws. */
function drawWulver(ctx, st, K, c, t, sway) {
  const fur = c(K.fur), furL = c(K.furL);
  bone2(ctx, -0.08, -0.45, -0.16, -0.24, 0.09, 0.06, fur);
  bone2(ctx, -0.16, -0.24, -0.12, -0.02, 0.06, 0.04, fur);
  bone2(ctx, 0.08, -0.45, 0.16, -0.24, 0.09, 0.06, fur);
  bone2(ctx, 0.16, -0.24, 0.13, -0.02, 0.06, 0.04, fur);
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.42); ctx.quadraticCurveTo(-0.26, -0.62, -0.2, -0.8); ctx.quadraticCurveTo(0, -0.9, 0.2, -0.8); ctx.quadraticCurveTo(0.26, -0.62, 0.13, -0.42); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = furL;
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let i = 0; i < 30; i++) { const px = (hash(i * 3.3) - 0.5) * 0.4, py = -0.45 - hash(i * 1.7) * 0.4; ctx.moveTo(px, py); ctx.lineTo(px + (hash(i) - 0.5) * 0.03, py + 0.04); }
  ctx.stroke();
  // long arms hanging, claws out
  bone2(ctx, -0.2, -0.76, -0.3, -0.55, 0.07, 0.05, fur);
  bone2(ctx, -0.3, -0.55, -0.28, -0.36, 0.05, 0.04, fur);
  bone2(ctx, 0.2, -0.76, 0.3, -0.56, 0.07, 0.05, fur);
  bone2(ctx, 0.3, -0.56, 0.3, -0.36, 0.05, 0.04, fur);
  ctx.strokeStyle = c(K.bone);
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.moveTo(s * (0.28 + i * 0.012), -0.35); ctx.lineTo(s * (0.29 + i * 0.02), -0.3); }
  ctx.stroke();
  // the head: a long muzzle, ears back, jaws open
  ctx.save();
  ctx.translate(sway, 0);
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.ellipse(0, -0.84, 0.08, 0.07, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.07, -0.88); ctx.lineTo(-0.1, -0.99); ctx.lineTo(-0.03, -0.9); ctx.moveTo(0.07, -0.88); ctx.lineTo(0.1, -0.99); ctx.lineTo(0.03, -0.9); ctx.fill();
  ctx.fillStyle = c(K.hide);
  ctx.beginPath(); ctx.moveTo(-0.04, -0.83); ctx.lineTo(0.04, -0.83); ctx.lineTo(0.025, -0.76); ctx.lineTo(-0.025, -0.76); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a0806';
  ctx.beginPath(); ctx.ellipse(0, -0.77, 0.028, 0.018, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = c(K.bone);
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-0.022 + i * 0.015, -0.785); ctx.lineTo(-0.018 + i * 0.015, -0.768); ctx.lineTo(-0.014 + i * 0.015, -0.785); ctx.fill(); }
  ctx.restore();
}
/**
 * A troll: a hill of grey-green hide, moss on its shoulders, a braided beard,
 * tusks, and a carved stone pillar lifted over its head in both hands, its
 * runes burning. Origin at its feet, one unit to the top of its head.
 */
function drawTroll(ctx, x, y, hh, st, K, k, fl, t, pose = {}) {
  const c = (p) => tone(p, k, fl);
  const frosty = !!pose.frost;
  const skin = c(frosty ? K.frost : K.troll), skinD = c(frosty ? K.frostD : K.trollD), skinL = c(frosty ? K.steelL : K.trollL);
  const lift = pose.lift ?? 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hh, hh);
  if (pose.rot) ctx.rotate(pose.rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(8,10,10,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 0, 0.42, 0.05, 0, 0, TAU); ctx.fill();
  // legs like tree stumps, feet splayed
  for (const s of [-1, 1]) {
    ctx.fillStyle = skinD;
    ctx.beginPath();
    ctx.moveTo(s * 0.08, -0.4); ctx.quadraticCurveTo(s * 0.3, -0.36, s * 0.28, -0.14); ctx.lineTo(s * 0.26, -0.03); ctx.lineTo(s * 0.12, -0.03); ctx.quadraticCurveTo(s * 0.1, -0.2, s * 0.06, -0.3); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(s * 0.2, -0.02, 0.1, 0.035, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c(K.bone);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(s * (0.13 + i * 0.045), -0.004, 0.014, 0.01, 0, 0, TAU); ctx.fill(); }
  }
  // the loincloth and a belt of bones and stones
  ctx.fillStyle = c(K.leather);
  ctx.beginPath(); ctx.moveTo(-0.24, -0.46); ctx.lineTo(0.24, -0.46); ctx.lineTo(0.14, -0.22); ctx.lineTo(0.04, -0.28); ctx.lineTo(-0.06, -0.2); ctx.lineTo(-0.16, -0.27); ctx.closePath(); ctx.fill();
  // the belly and the chest: one great mass
  const bg = ctx.createRadialGradient(0.08, -0.66, 0.02, 0, -0.58, 0.42);
  bg.addColorStop(0, skinL); bg.addColorStop(0.45, skin); bg.addColorStop(1, skinD);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-0.26, -0.45);
  ctx.bezierCurveTo(-0.42, -0.5, -0.44, -0.74, -0.34, -0.84);
  ctx.quadraticCurveTo(0, -0.92, 0.34, -0.84);
  ctx.bezierCurveTo(0.44, -0.74, 0.42, -0.5, 0.26, -0.45);
  ctx.quadraticCurveTo(0, -0.38, -0.26, -0.45);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.012;
  ctx.beginPath(); ctx.moveTo(-0.2, -0.72); ctx.quadraticCurveTo(0, -0.66, 0.2, -0.72); ctx.moveTo(-0.22, -0.56); ctx.quadraticCurveTo(0, -0.48, 0.22, -0.56); ctx.stroke();
  // warts and woad
  ctx.fillStyle = skinD;
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc((hash(i * 2.2) - 0.5) * 0.6, -0.5 - hash(i * 3.3) * 0.34, 0.008 + hash(i) * 0.012, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = frosty ? 'rgba(40,80,140,0.5)' : 'rgba(40,60,110,0.45)';
  ctx.lineWidth = 0.014;
  ctx.beginPath(); ctx.moveTo(-0.2, -0.62); ctx.lineTo(-0.12, -0.56); ctx.lineTo(-0.2, -0.5); ctx.moveTo(0.2, -0.62); ctx.lineTo(0.12, -0.56); ctx.lineTo(0.2, -0.5); ctx.stroke();
  // arms up, both hands on the pillar
  const py = -1.12 - lift * 0.08;
  bone2(ctx, -0.34, -0.8, -0.5, -0.94, 0.16, 0.12, skinD);
  bone2(ctx, -0.5, -0.94, -0.36, py + 0.02, 0.12, 0.1, skin);
  bone2(ctx, 0.34, -0.8, 0.52, -0.96, 0.16, 0.12, skinD);
  bone2(ctx, 0.52, -0.96, 0.38, py - 0.02, 0.12, 0.1, skin);
  // shoulders, mossy
  for (const s of [-1, 1]) {
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(s * 0.33, -0.83, 0.13, 0.1, s * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = frosty ? 'rgba(236,244,252,0.9)' : c(K.moss);
    ctx.beginPath(); ctx.ellipse(s * 0.32, -0.88, 0.1, 0.045, s * 0.3, 0, TAU); ctx.fill();
  }
  // the head, small and low, under a heavy brow; tusks; a braided beard
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(0, -0.88, 0.11, 0.1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = skinD;
  ctx.beginPath(); ctx.moveTo(-0.11, -0.91); ctx.quadraticCurveTo(0, -0.97, 0.11, -0.91); ctx.lineTo(0.1, -0.88); ctx.quadraticCurveTo(0, -0.92, -0.1, -0.88); ctx.fill();
  ctx.fillStyle = '#100a06';
  ctx.beginPath(); ctx.ellipse(-0.04, -0.885, 0.022, 0.012, 0, 0, TAU); ctx.ellipse(0.04, -0.885, 0.022, 0.012, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = skinD;
  ctx.beginPath(); ctx.moveTo(-0.022, -0.88); ctx.lineTo(0.022, -0.88); ctx.lineTo(0.03, -0.845); ctx.lineTo(-0.03, -0.845); ctx.fill();
  const beard = frosty ? c(K.steelL) : c(K.ragL);
  ctx.fillStyle = beard;
  ctx.beginPath(); ctx.moveTo(-0.09, -0.84); ctx.lineTo(0.09, -0.84); ctx.lineTo(0.05, -0.66); ctx.lineTo(0, -0.62); ctx.lineTo(-0.05, -0.66); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.moveTo(-0.03, -0.82); ctx.lineTo(-0.02, -0.66); ctx.moveTo(0.03, -0.82); ctx.lineTo(0.02, -0.66); ctx.stroke();
  ctx.fillStyle = c(K.bone);
  ctx.beginPath();
  ctx.moveTo(-0.07, -0.83); ctx.quadraticCurveTo(-0.1, -0.88, -0.08, -0.93); ctx.lineTo(-0.055, -0.84);
  ctx.moveTo(0.07, -0.83); ctx.quadraticCurveTo(0.1, -0.88, 0.08, -0.93); ctx.lineTo(0.055, -0.84);
  ctx.fill();
  // horns curling from the brow
  ctx.fillStyle = c(K.stoneD);
  ctx.beginPath();
  ctx.moveTo(-0.08, -0.94); ctx.quadraticCurveTo(-0.22, -0.96, -0.2, -1.06); ctx.quadraticCurveTo(-0.16, -0.99, -0.06, -0.97); ctx.closePath();
  ctx.moveTo(0.08, -0.94); ctx.quadraticCurveTo(0.22, -0.96, 0.2, -1.06); ctx.quadraticCurveTo(0.16, -0.99, 0.06, -0.97); ctx.closePath();
  ctx.fill();
  // the pillar: a carved stone, broken off at one end, runes burning in it
  ctx.save();
  ctx.translate(0, py);
  ctx.rotate(-0.08 + Math.sin(t * 2) * 0.02);
  const pg = ctx.createLinearGradient(0, -0.09, 0, 0.09);
  pg.addColorStop(0, frosty ? c(K.steelL) : c(K.stone)); pg.addColorStop(1, frosty ? c(K.frostD) : c(K.stoneD));
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.moveTo(-0.66, -0.08); ctx.lineTo(0.62, -0.09); ctx.lineTo(0.7, -0.02); ctx.lineTo(0.64, 0.05); ctx.lineTo(0.68, 0.09); ctx.lineTo(-0.66, 0.08); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.008;
  ctx.beginPath();
  for (let i = -5; i <= 5; i++) { ctx.moveTo(i * 0.12, -0.085); ctx.lineTo(i * 0.12 + 0.01, 0.085); }
  ctx.stroke();
  const rune = frosty ? 'rgba(150,220,255,0.95)' : 'rgba(255,150,50,0.95)';
  glow(ctx, frosty ? FX.frost : FX.fire, 0, 0, 0.5, 0.45);
  ctx.strokeStyle = rune;
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) runePath(ctx, [3, 9, 14, 17, 21, 1, 12, 6, 19, 4][i], -0.58 + i * 0.12, -0.04, 0.075);
  ctx.stroke();
  ctx.fillStyle = frosty ? 'rgba(236,244,252,0.9)' : c(K.moss);
  ctx.beginPath(); ctx.ellipse(-0.62, -0.08, 0.06, 0.03, 0, 0, TAU); ctx.ellipse(0.5, -0.09, 0.08, 0.025, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // fists over the stone
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(-0.36, py + 0.02, 0.06, 0, TAU); ctx.arc(0.38, py - 0.02, 0.06, 0, TAU); ctx.fill();
  ctx.restore();
  const ex = x, ey = y - 0.885 * hh;
  const gs = frosty ? FX.frost : FX.eye;
  glow(ctx, gs, ex - 0.04 * hh, ey, hh * 0.06, 0.9);
  glow(ctx, gs, ex + 0.04 * hh, ey, hh * 0.06, 0.9);
  ctx.fillStyle = frosty ? '#e0f4ff' : '#ffd08a';
  ctx.beginPath(); ctx.arc(ex - 0.04 * hh, ey, Math.max(1.2, hh * 0.008), 0, TAU); ctx.arc(ex + 0.04 * hh, ey, Math.max(1.2, hh * 0.008), 0, TAU); ctx.fill();
}
/**
 * One of the Einherjar: a dead warrior of the hall, raised in pale steel,
 * a round shield and a spear, blue ghost-light pouring off it. Origin at
 * its feet, one unit to the top of its helmet.
 */
function drawEinherjar(ctx, x, y, hh, st, K, k, fl, t, pose = {}) {
  const c = (p) => tone(p, k, fl);
  const seed = pose.seed ?? 0;
  const bob = Math.sin(t * 1.8 + seed * 7) * 0.008;
  // the ghost-light behind it
  glow(ctx, FX.spirit, x, y - 0.55 * hh, hh * 0.75, 0.45 + 0.1 * Math.sin(t * 3 + seed));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hh, hh);
  if (pose.rot) ctx.rotate(pose.rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!pose.noShadow) {
    ctx.fillStyle = 'rgba(10,14,24,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.03, 0, 0, TAU); ctx.fill();
  }
  const berserk = st.helm === 'bear';
  const hood = st.helm === 'hood';
  // the cape, spectral, streaming behind
  ctx.fillStyle = berserk ? c(K.fur) : c(K.cape);
  ctx.globalAlpha = berserk ? 1 : 0.85;
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.78);
  ctx.quadraticCurveTo(-0.3, -0.5, -0.26, -0.12);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-0.26 + i * 0.087, -0.12 - Math.sin(t * 4 + i * 1.3 + seed) * 0.02 - (i % 2) * 0.04);
  ctx.quadraticCurveTo(0.3, -0.5, 0.15, -0.78);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(0, bob);
  // legs in greaves
  const steel = c(K.steel), steelD = c(K.steelD), steelL = c(K.steelL);
  bone2(ctx, -0.06, -0.48, -0.09, -0.24, 0.07, 0.055, steelD);
  bone2(ctx, -0.09, -0.24, -0.09, -0.02, 0.055, 0.05, steel);
  bone2(ctx, 0.06, -0.48, 0.09, -0.24, 0.07, 0.055, steelD);
  bone2(ctx, 0.09, -0.24, 0.09, -0.02, 0.055, 0.05, steel);
  ctx.fillStyle = steelL;
  ctx.beginPath(); ctx.ellipse(-0.09, -0.25, 0.035, 0.03, 0, 0, TAU); ctx.ellipse(0.09, -0.25, 0.035, 0.03, 0, 0, TAU); ctx.fill();
  // a skirt of mail and cloth panels
  ctx.fillStyle = berserk ? c(K.fur) : steelD;
  ctx.beginPath(); ctx.moveTo(-0.13, -0.55); ctx.lineTo(-0.16, -0.32); ctx.lineTo(0.16, -0.32); ctx.lineTo(0.13, -0.55); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c(K.cape);
  ctx.fillRect(-0.045, -0.53, 0.09, 0.24);
  // the breastplate, gilt at the edges
  const bp = ctx.createLinearGradient(-0.15, 0, 0.15, 0);
  bp.addColorStop(0, steelD); bp.addColorStop(0.55, steelL); bp.addColorStop(1, steel);
  ctx.fillStyle = berserk ? c(K.dark) : bp;
  ctx.beginPath(); ctx.moveTo(-0.13, -0.54); ctx.lineTo(-0.17, -0.76); ctx.quadraticCurveTo(0, -0.82, 0.17, -0.76); ctx.lineTo(0.13, -0.54); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = berserk ? 'rgba(255,40,20,0.7)' : c(K.gold);
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  if (berserk) { ctx.moveTo(-0.1, -0.74); ctx.lineTo(-0.02, -0.64); ctx.lineTo(-0.08, -0.58); ctx.moveTo(0.1, -0.72); ctx.lineTo(0.03, -0.66); ctx.lineTo(0.09, -0.57); }
  else { ctx.moveTo(-0.16, -0.755); ctx.quadraticCurveTo(0, -0.8, 0.16, -0.755); ctx.moveTo(0, -0.79); ctx.lineTo(0, -0.56); }
  ctx.stroke();
  ctx.fillStyle = c(K.leather);
  ctx.fillRect(-0.135, -0.57, 0.27, 0.03);
  // pauldrons
  ctx.fillStyle = berserk ? c(K.fur) : steel;
  ctx.beginPath(); ctx.ellipse(-0.17, -0.75, 0.07, 0.05, -0.3, 0, TAU); ctx.ellipse(0.17, -0.75, 0.07, 0.05, 0.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = berserk ? c(K.furL) : c(K.gold);
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.ellipse(-0.17, -0.75, 0.07, 0.05, -0.3, PI, TAU); ctx.ellipse(0.17, -0.75, 0.07, 0.05, 0.3, PI, TAU); ctx.stroke();
  // arms: spear arm up, shield arm across the body
  bone2(ctx, -0.18, -0.74, -0.24, -0.6, 0.05, 0.045, steelD);
  bone2(ctx, -0.24, -0.6, -0.2, -0.5, 0.045, 0.04, steel);
  bone2(ctx, 0.18, -0.74, 0.22, -0.62, 0.05, 0.045, steelD);
  bone2(ctx, 0.22, -0.62, 0.12, -0.6, 0.045, 0.04, steel);
  // the weapon
  if (st.weapon === 'spear') {
    bone2(ctx, -0.2, -0.2, -0.17, -1.2, 0.016, 0.014, c(K.wood));
    ctx.fillStyle = steelL;
    ctx.beginPath(); ctx.moveTo(-0.17, -1.34); ctx.lineTo(-0.145, -1.22); ctx.lineTo(-0.17, -1.19); ctx.lineTo(-0.195, -1.22); ctx.closePath(); ctx.fill();
  } else if (st.weapon === 'greataxe') {
    bone2(ctx, -0.26, -0.3, -0.1, -1.2, 0.022, 0.02, c(K.wood));
    ctx.fillStyle = c(K.iron);
    ctx.beginPath(); ctx.moveTo(-0.12, -1.14); ctx.quadraticCurveTo(-0.34, -1.22, -0.36, -1.02); ctx.quadraticCurveTo(-0.24, -1.04, -0.14, -1.0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,30,0.8)';
    ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.moveTo(-0.34, -1.19); ctx.quadraticCurveTo(-0.37, -1.1, -0.35, -1.03); ctx.stroke();
  } else {
    ctx.fillStyle = steelL;
    ctx.beginPath(); ctx.moveTo(-0.21, -0.5); ctx.lineTo(-0.3, -0.84); ctx.lineTo(-0.28, -0.86); ctx.lineTo(-0.19, -0.51); ctx.fill();
    ctx.fillStyle = c(K.gold);
    ctx.fillRect(-0.23, -0.52, 0.06, 0.016);
  }
  ctx.fillStyle = steelD;
  ctx.beginPath(); ctx.arc(-0.2, -0.5, 0.024, 0, TAU); ctx.fill();
  if (st.shield) {
    ctx.fillStyle = c(K.cape);
    ctx.beginPath(); ctx.arc(0.1, -0.61, 0.13, 0, TAU); ctx.fill();
    ctx.strokeStyle = steelL;
    ctx.lineWidth = 0.016;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,236,255,0.75)';
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a0 = (i / 3) * TAU + 0.4; ctx.moveTo(0.1, -0.61); ctx.quadraticCurveTo(0.1 + Math.cos(a0 + 0.8) * 0.1, -0.61 + Math.sin(a0 + 0.8) * 0.1, 0.1 + Math.cos(a0) * 0.11, -0.61 + Math.sin(a0) * 0.11); }
    ctx.stroke();
    ctx.fillStyle = steelL;
    ctx.beginPath(); ctx.arc(0.1, -0.61, 0.028, 0, TAU); ctx.fill();
  }
  // the head
  ctx.fillStyle = steelD;
  ctx.fillRect(-0.03, -0.82, 0.06, 0.04);
  if (berserk) {
    // a bear's pelt for a hood, its snout over the brow, a bone mask under it
    ctx.fillStyle = c(K.fur);
    ctx.beginPath(); ctx.moveTo(-0.1, -0.78); ctx.quadraticCurveTo(-0.12, -0.96, 0, -0.98); ctx.quadraticCurveTo(0.12, -0.96, 0.1, -0.78); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.07, -0.96, 0.025, 0, TAU); ctx.arc(0.07, -0.96, 0.025, 0, TAU); ctx.fill();
    ctx.fillStyle = c(K.furL);
    ctx.beginPath(); ctx.ellipse(0, -0.93, 0.04, 0.03, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c(K.skull);
    ctx.beginPath(); ctx.ellipse(0, -0.86, 0.048, 0.055, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0c0606';
    ctx.beginPath(); ctx.ellipse(-0.019, -0.87, 0.013, 0.012, 0, 0, TAU); ctx.ellipse(0.019, -0.87, 0.013, 0.012, 0, 0, TAU); ctx.fill();
  } else if (hood) {
    ctx.fillStyle = c(K.cape);
    ctx.beginPath(); ctx.moveTo(-0.075, -0.78); ctx.quadraticCurveTo(-0.09, -0.95, 0, -0.97); ctx.quadraticCurveTo(0.09, -0.95, 0.075, -0.78); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#060a12';
    ctx.beginPath(); ctx.ellipse(0, -0.86, 0.045, 0.055, 0, 0, TAU); ctx.fill();
  } else {
    const hg = ctx.createLinearGradient(-0.07, 0, 0.07, 0);
    hg.addColorStop(0, steelD); hg.addColorStop(0.5, steelL); hg.addColorStop(1, steel);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(-0.06, -0.8); ctx.lineTo(-0.064, -0.88); ctx.quadraticCurveTo(-0.06, -0.96, 0, -0.97); ctx.quadraticCurveTo(0.06, -0.96, 0.064, -0.88); ctx.lineTo(0.06, -0.8); ctx.closePath(); ctx.fill();
    // a face-plate with eye rings
    ctx.fillStyle = '#060a12';
    ctx.beginPath(); ctx.ellipse(-0.022, -0.87, 0.016, 0.012, 0, 0, TAU); ctx.ellipse(0.022, -0.87, 0.016, 0.012, 0, 0, TAU); ctx.fill();
    ctx.fillRect(-0.02, -0.845, 0.04, 0.035);
    ctx.fillStyle = c(K.gold);
    ctx.fillRect(-0.004, -0.9, 0.008, 0.05);
    if (st.helm === 'winged') {
      ctx.fillStyle = steelL;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.055, -0.9);
        for (let i = 0; i < 4; i++) ctx.lineTo(s * (0.09 + i * 0.03), -0.92 - i * 0.035 + (i % 2) * 0.02);
        ctx.lineTo(s * 0.07, -0.95); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillStyle = c(K.cape);
      ctx.beginPath(); ctx.moveTo(-0.01, -0.96); ctx.quadraticCurveTo(0.05, -1.08, 0.12, -1.04); ctx.quadraticCurveTo(0.05, -1.0, 0.012, -0.95); ctx.fill();
    }
  }
  ctx.restore();
  // eyes, and wisps of the ghost-light rising off the shoulders and helm
  const [er, eg, eb] = st.eyes;
  const ex = x, ey = y + (bob - 0.87) * hh;
  const gs = berserk ? FX.red : FX.spirit;
  glow(ctx, gs, ex - 0.02 * hh, ey, hh * 0.06, 0.95);
  glow(ctx, gs, ex + 0.02 * hh, ey, hh * 0.06, 0.95);
  ctx.fillStyle = `rgba(${Math.min(255, er + 80)},${Math.min(255, eg + 80)},${Math.min(255, eb + 80)},1)`;
  const r2 = Math.max(1.2, hh * 0.008);
  ctx.beginPath(); ctx.arc(ex - 0.021 * hh, ey, r2, 0, TAU); ctx.arc(ex + 0.021 * hh, ey, r2, 0, TAU); ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const u = (t * 0.7 + i / 7 + seed) % 1;
    const wx = x + ((hash(i * 3.1) - 0.5) * 0.36 + Math.sin(t * 2 + i) * 0.03) * hh, wy = y - (0.7 + u * 0.4) * hh;
    ctx.globalAlpha = (1 - u) * 0.35;
    const r = hh * (0.04 + u * 0.06);
    ctx.drawImage(berserk ? FX.red : FX.spirit, wx - r, wy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/**
 * A berserker's ghost, coming on: a hulk under a bear's pelt, a bone mask,
 * a great axe lifted in both hands, red fire in the cracks of it, and the
 * red ring round it that says this blow cannot be blocked.
 */
function drawBerserker(ctx, x, y, hh, st, K, k, fl, t, pose = {}) {
  const c = (p) => tone(p, k, fl);
  const lift = pose.lift ?? 0.5;
  glow(ctx, FX.red, x, y - 0.6 * hh, hh * 0.9, 0.35 + 0.1 * Math.sin(t * 5));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hh, hh);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(10,6,8,0.45)';
  ctx.beginPath(); ctx.ellipse(0, 0, 0.36, 0.045, 0, 0, TAU); ctx.fill();
  const fur = c(K.bear), furL = c(K.bearL), dark = c(K.dark);
  // the pelt hanging behind, to the ground
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(-0.26, -0.84); ctx.quadraticCurveTo(-0.46, -0.5, -0.4, -0.04);
  for (let i = 0; i <= 8; i++) ctx.lineTo(-0.4 + i * 0.1, -0.04 - (i % 2) * 0.05);
  ctx.quadraticCurveTo(0.46, -0.5, 0.26, -0.84);
  ctx.closePath();
  ctx.fill();
  // legs: fur boots, wide
  bone2(ctx, -0.1, -0.44, -0.2, -0.22, 0.12, 0.1, dark);
  bone2(ctx, -0.2, -0.22, -0.19, -0.02, 0.1, 0.1, fur);
  bone2(ctx, 0.1, -0.44, 0.2, -0.22, 0.12, 0.1, dark);
  bone2(ctx, 0.2, -0.22, 0.2, -0.02, 0.1, 0.1, fur);
  // a kilt of mail and hide
  ctx.fillStyle = c(K.iron);
  ctx.beginPath(); ctx.moveTo(-0.2, -0.5); ctx.lineTo(-0.26, -0.28); ctx.lineTo(0.26, -0.28); ctx.lineTo(0.2, -0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c(K.leather);
  for (let i = 0; i < 5; i++) ctx.fillRect(-0.22 + i * 0.1, -0.48, 0.05, 0.22);
  // the chest, bare and huge, cracked with red light
  const bg = ctx.createRadialGradient(0.05, -0.7, 0.02, 0, -0.64, 0.3);
  bg.addColorStop(0, c(K.hide)); bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.moveTo(-0.2, -0.5); ctx.bezierCurveTo(-0.3, -0.6, -0.3, -0.78, -0.24, -0.84); ctx.quadraticCurveTo(0, -0.9, 0.24, -0.84); ctx.bezierCurveTo(0.3, -0.78, 0.3, -0.6, 0.2, -0.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(255,60,30,${(0.7 + 0.3 * Math.sin(t * 7)).toFixed(3)})`;
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(-0.14, -0.8); ctx.lineTo(-0.08, -0.7); ctx.lineTo(-0.12, -0.62); ctx.lineTo(-0.05, -0.55);
  ctx.moveTo(0.12, -0.78); ctx.lineTo(0.06, -0.68); ctx.lineTo(0.11, -0.6);
  ctx.moveTo(-0.02, -0.74); ctx.lineTo(0.02, -0.66);
  ctx.stroke();
  // chains and a harness across it
  ctx.strokeStyle = c(K.iron);
  ctx.lineWidth = 0.02;
  ctx.setLineDash([0.025, 0.012]);
  ctx.beginPath(); ctx.moveTo(-0.24, -0.82); ctx.lineTo(0.2, -0.52); ctx.stroke();
  ctx.setLineDash([]);
  // arms up, the great axe over its head
  const ay = -1.18 - lift * 0.08;
  bone2(ctx, -0.24, -0.82, -0.36, -0.96, 0.12, 0.1, dark);
  bone2(ctx, -0.36, -0.96, -0.18, ay + 0.06, 0.1, 0.08, c(K.hide));
  bone2(ctx, 0.24, -0.82, 0.36, -0.98, 0.12, 0.1, dark);
  bone2(ctx, 0.36, -0.98, 0.12, ay + 0.02, 0.1, 0.08, c(K.hide));
  ctx.save();
  ctx.translate(0, ay);
  ctx.rotate(-0.25 + Math.sin(t * 3) * 0.04);
  bone2(ctx, -0.5, 0.05, 0.42, -0.02, 0.035, 0.035, c(K.wood));
  ctx.fillStyle = c(K.iron);
  ctx.beginPath(); ctx.moveTo(0.3, -0.04); ctx.quadraticCurveTo(0.4, -0.34, 0.62, -0.32); ctx.quadraticCurveTo(0.58, -0.1, 0.66, 0.16); ctx.quadraticCurveTo(0.46, 0.14, 0.34, 0.03); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,90,50,0.9)';
  ctx.lineWidth = 0.012;
  ctx.beginPath(); ctx.moveTo(0.62, -0.31); ctx.quadraticCurveTo(0.58, -0.08, 0.65, 0.15); ctx.stroke();
  glow(ctx, FX.red, 0.52, -0.08, 0.3, 0.5);
  ctx.restore();
  ctx.fillStyle = c(K.hide);
  ctx.beginPath(); ctx.arc(-0.18, ay + 0.06, 0.05, 0, TAU); ctx.arc(0.12, ay + 0.02, 0.05, 0, TAU); ctx.fill();
  // shoulders under the pelt, the bear's head over its own
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.ellipse(-0.24, -0.84, 0.12, 0.08, -0.3, 0, TAU); ctx.ellipse(0.24, -0.84, 0.12, 0.08, 0.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = furL;
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) { const px = (hash(i * 2.7) - 0.5) * 0.6, py = -0.84 + (hash(i * 1.3) - 0.5) * 0.1; ctx.moveTo(px, py); ctx.lineTo(px + (hash(i) - 0.5) * 0.02, py + 0.05); }
  ctx.stroke();
  // the bear's head worn as a helm: brow, flat ears laid back, the upper jaw and its fangs over the mask
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(-0.14, -0.9); ctx.quadraticCurveTo(-0.16, -1.02, -0.06, -1.05); ctx.lineTo(0.06, -1.05); ctx.quadraticCurveTo(0.16, -1.02, 0.14, -0.9);
  ctx.lineTo(0.08, -0.93); ctx.lineTo(0.05, -0.905); ctx.lineTo(-0.05, -0.905); ctx.lineTo(-0.08, -0.93); ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.12, -1.0); ctx.lineTo(-0.19, -1.05); ctx.lineTo(-0.13, -0.96); ctx.moveTo(0.12, -1.0); ctx.lineTo(0.19, -1.05); ctx.lineTo(0.13, -0.96); ctx.fill();
  ctx.fillStyle = '#0c0808';
  ctx.beginPath(); ctx.ellipse(-0.055, -0.99, 0.018, 0.01, 0.3, 0, TAU); ctx.ellipse(0.055, -0.99, 0.018, 0.01, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = c(K.bone);
  ctx.beginPath();
  for (const s of [-1, 1]) { ctx.moveTo(s * 0.06, -0.915); ctx.lineTo(s * 0.045, -0.86); ctx.lineTo(s * 0.035, -0.915); }
  for (let i = 0; i < 4; i++) { const px = -0.03 + i * 0.02; ctx.moveTo(px, -0.91); ctx.lineTo(px + 0.006, -0.89); ctx.lineTo(px + 0.012, -0.91); }
  ctx.fill();
  ctx.fillStyle = c(K.skull);
  ctx.beginPath(); ctx.ellipse(0, -0.87, 0.06, 0.07, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0c0404';
  ctx.beginPath(); ctx.ellipse(-0.024, -0.88, 0.016, 0.014, 0, 0, TAU); ctx.ellipse(0.024, -0.88, 0.016, 0.014, 0, 0, TAU); ctx.fill();
  ctx.fillRect(-0.025, -0.845, 0.05, 0.012);
  // braids of beard under the mask
  ctx.strokeStyle = furL;
  ctx.lineWidth = 0.014;
  ctx.beginPath(); ctx.moveTo(-0.025, -0.81); ctx.lineTo(-0.03, -0.72); ctx.moveTo(0.025, -0.81); ctx.lineTo(0.03, -0.72); ctx.stroke();
  ctx.restore();
  const ey = y - 0.88 * hh;
  glow(ctx, FX.red, x - 0.024 * hh, ey, hh * 0.07, 1);
  glow(ctx, FX.red, x + 0.024 * hh, ey, hh * 0.07, 1);
  ctx.fillStyle = '#ffd0b0';
  ctx.beginPath(); ctx.arc(x - 0.024 * hh, ey, Math.max(1.5, hh * 0.009), 0, TAU); ctx.arc(x + 0.024 * hh, ey, Math.max(1.5, hh * 0.009), 0, TAU); ctx.fill();
  // smoke of it, red-black, rising
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const u = (t * 0.5 + i / 8) % 1;
    const sx = x + (hash(i * 5.1) - 0.5) * 0.7 * hh, sy = y - (0.3 + u * 0.9) * hh;
    ctx.globalAlpha = (1 - u) * 0.4;
    const r = hh * (0.08 + u * 0.12);
    ctx.drawImage(FX.smoke, sx - r, sy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** The ring round an unblockable attack: red, pulsing, tightening as the blow comes. */
function unblockRing(ctx, x, y, R, t, k) {
  const p = 0.5 + 0.5 * Math.sin(t * 12);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,40,20,${(0.35 * k).toFixed(3)})`;
  ctx.lineWidth = 18;
  ctx.beginPath(); ctx.arc(x, y, R * (1.04 + 0.04 * p), 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(255,70,40,${((0.7 + 0.3 * p) * k).toFixed(3)})`;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(255,210,190,${(0.6 * k).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}
/**
 * A dreki: a wingless drake low on four legs, facing the camera, jaws open
 * on the lightning it spits. Origin at its feet, one unit to its back.
 */
function drawDreki(ctx, x, y, hh, st, K, k, fl, t, pose = {}) {
  const c = (p) => tone(p, k, fl);
  const scale = c(K.dark), belly = c(K.stone), horn = c(K.bone);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(hh, hh);
  if (pose.rot) ctx.rotate(pose.rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(10,14,24,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 0, 0.5, 0.05, 0, 0, TAU); ctx.fill();
  // tail curling off behind to one side
  ctx.strokeStyle = scale;
  ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(0.1, -0.5); ctx.bezierCurveTo(0.5, -0.6, 0.7, -0.3, 0.6, -0.12); ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.beginPath(); ctx.moveTo(0.6, -0.12); ctx.quadraticCurveTo(0.56, -0.02, 0.44, -0.04); ctx.stroke();
  // the body, a hump behind the head, a ridge of spines
  ctx.fillStyle = scale;
  ctx.beginPath(); ctx.ellipse(0, -0.55, 0.34, 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = horn;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) { const px = -0.24 + i * 0.08, py = -0.8 - Math.sin((i / 6) * PI) * 0.08; ctx.moveTo(px - 0.03, py + 0.04); ctx.lineTo(px, py - 0.08); ctx.lineTo(px + 0.03, py + 0.04); }
  ctx.fill();
  // legs splayed, clawed
  for (const s of [-1, 1]) {
    bone2(ctx, s * 0.22, -0.5, s * 0.4, -0.3, 0.12, 0.09, scale);
    bone2(ctx, s * 0.4, -0.3, s * 0.36, -0.03, 0.09, 0.07, scale);
    ctx.strokeStyle = horn;
    ctx.lineWidth = 0.014;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(s * 0.36 + i * 0.03, -0.03); ctx.lineTo(s * 0.36 + i * 0.045, 0.01); }
    ctx.stroke();
  }
  // the head, low and toward the camera, jaws open
  ctx.fillStyle = scale;
  ctx.beginPath(); ctx.ellipse(0, -0.5, 0.16, 0.12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(0, -0.36, 0.12, 0.06, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#12061e';
  ctx.beginPath(); ctx.ellipse(0, -0.42, 0.1, 0.05, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = horn;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-0.08 + i * 0.032, -0.46); ctx.lineTo(-0.07 + i * 0.032, -0.42); ctx.lineTo(-0.062 + i * 0.032, -0.46); ctx.fill(); }
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.58); ctx.quadraticCurveTo(-0.22, -0.66, -0.2, -0.78); ctx.lineTo(-0.07, -0.6);
  ctx.moveTo(0.1, -0.58); ctx.quadraticCurveTo(0.22, -0.66, 0.2, -0.78); ctx.lineTo(0.07, -0.6);
  ctx.fill();
  ctx.restore();
  // lightning in its throat
  const mx = x, my = y - 0.42 * hh;
  glow(ctx, FX.violet, mx, my, hh * 0.3, 0.7 + 0.3 * Math.sin(t * 20));
  ctx.strokeStyle = 'rgba(230,210,255,0.9)';
  ctx.lineWidth = Math.max(1, hh * 0.008);
  ctx.beginPath();
  for (let j = 0; j < 3; j++) {
    let px = mx, py = my;
    ctx.moveTo(px, py);
    for (let i = 0; i < 4; i++) { px += (hash(Math.floor(t * 14) * 3 + i + j * 7) - 0.5) * hh * 0.12; py += hh * 0.03; ctx.lineTo(px, py); }
  }
  ctx.stroke();
  for (const s of [-1, 1]) {
    glow(ctx, FX.violet, x + s * 0.07 * hh, y - 0.53 * hh, hh * 0.05, 0.9);
    ctx.fillStyle = '#f0e4ff';
    ctx.beginPath(); ctx.arc(x + s * 0.07 * hh, y - 0.53 * hh, Math.max(1.2, hh * 0.008), 0, TAU); ctx.fill();
  }
}

/** The enemy, whoever it is, standing (or charging) at `foe`. */
function drawFoeFigure(ctx, g, t, game, who, x, foot, hh, fl, pose) {
  const K = game === 'gow' ? MG_KIT : FW_KIT;
  const st = styleOf(who.name, who.seed ?? 0, game);
  const k = game === 'gow' ? mgAir(rangeOf(foot - (HZ0 + (g.view?.pitch ?? 0) * PX))) * 0.85 : fwAir(rangeOf(foot - (HZ0 + (g.view?.pitch ?? 0) * PX)));
  const p = { seed: who.seed ?? 0, ...pose };
  if (who.loom) {
    if (game === 'gow') drawTroll(ctx, x, foot, hh, st, K, k, fl, t, { lift: 0.5 + 0.5 * Math.sin(g.clock * 5), ...p });
    else drawBerserker(ctx, x, foot, hh, st, K, k, fl, t, { lift: 0.5 + 0.5 * Math.sin(g.clock * 5), ...p });
  } else if (st.ogre) drawTroll(ctx, x, foot, hh * 0.9, st, K, k, fl, t, { frost: game === 'gowr', lift: 0.3, ...p });
  else if (st.dreki) drawDreki(ctx, x, foot, hh * 0.62, st, K, k, fl, t, p);
  else if (game === 'gow') drawDraugr(ctx, x, foot, hh, st, K, k, fl, t, p);
  else drawEinherjar(ctx, x, foot, hh, st, K, k, fl, t, p);
}

/** Enemies at their place in depth: the one alive, the one just killed, the one that killed the fly. */
function drawFoes(ctx, g, t, hz, foe, game) {
  if (foe) {
    const e = foe.e;
    // a big one coming on shakes the ground: dust and snow thrown up at its feet
    if (e.loom) {
      for (let i = 0; i < 10; i++) {
        const u = (g.clock * 1.4 + i / 10) % 1;
        const dx = (hash(i * 3.3) - 0.5) * foe.hh * 0.9, sz = foe.hh * (0.12 + u * 0.3);
        ctx.globalAlpha = (1 - u) * 0.4;
        ctx.drawImage(game === 'gow' ? FX.dust : FX.snow, foe.x + dx - sz / 2, foe.foot - sz * 0.7 - u * foe.hh * 0.12, sz, sz * 0.8);
      }
      ctx.globalAlpha = 1;
    }
    drawFoeFigure(ctx, g, t, game, { name: e.name, loom: e.loom, seed: S.seed ?? 0 }, foe.x, foe.foot, foe.hh, e.hitFlash, {});
    if (e.loom && game === 'gowr') unblockRing(ctx, foe.x, foe.foot - foe.hh * 0.62, foe.hh * 0.72, t, smoothstep(0.1, 0.4, e.grow));
    return;
  }
  const yaw = camYaw(g);
  const place = (who) => {
    const hh = who.size * W * (who.loom ? 1.12 : FOE_H);
    const x = bearingX(g, who.bearing);
    const chest = H / 2 - ((who.elev ?? 0) - (g.view?.pitch ?? 0)) * PX;
    return { x, hh, foot: chest + (who.loom ? 0.6 : 0.58) * hh };
  };
  if (S.corpse) {
    const cp = S.corpse;
    const dt = g.clock - cp.at;
    const { x, hh, foot } = place(cp);
    if (x > -hh && x < W + hh) {
      const fall = smooth(clamp01(dt / 0.7));
      const fade = clamp01(1 - (dt - 0.5) / 0.8);
      const dir = cp.seed > 0.5 ? 1 : -1;
      if (fade > 0) {
        ctx.save();
        ctx.globalAlpha = fade;
        drawFoeFigure(ctx, g, t, game, cp, x, foot + fall * hh * 0.1, hh, clamp01(1 - dt * 3), { rot: dir * fall * (cp.loom ? 0.35 : 1.1), noShadow: true });
        ctx.restore();
      }
      // it goes up in embers and ash, or in ghost-light
      const ember = game === 'gow' ? (cp.name === 'Hel-Walker' ? FX.frost : FX.ember) : cp.loom ? FX.red : FX.spirit;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const u = clamp01(dt / (0.9 + hash(i * 2.1) * 0.9));
        if (u >= 1) continue;
        const px = x + (hash(i * 3.3) - 0.5) * hh * 0.5 + Math.sin(u * 5 + i) * hh * 0.05, py = foot - hh * (0.2 + hash(i * 5.7) * 0.6) - u * hh * 0.7;
        ctx.globalAlpha = (1 - u) * 0.8;
        const r = hh * 0.03 * (1 + u);
        ctx.drawImage(ember, px - r, py - r, r * 2, r * 2);
      }
      ctx.restore();
      if (game === 'gow' && dt < 1.8) {
        ctx.save();
        for (let i = 0; i < 6; i++) {
          const u = clamp01(dt / 1.8);
          ctx.globalAlpha = (1 - u) * 0.35;
          const r = hh * (0.15 + u * 0.25);
          ctx.drawImage(FX.smoke, x + (hash(i) - 0.5) * hh * 0.4 - r, foot - hh * (0.3 + u * 0.4) - r, r * 2, r * 2);
        }
        ctx.restore();
      }
    }
  }
  if (g.dead) {
    const who = S.killer ?? { bearing: yaw + 0.08, size: g.dead.kind === 'troll' || g.dead.kind === 'berserker' ? 0.45 : 0.14, name: g.dead.by, loom: g.dead.kind === 'troll' || g.dead.kind === 'berserker', elev: g.view?.pitch ?? 0, seed: 0.3 };
    const { x, hh, foot } = place(who);
    if (x > -hh && x < W + hh) drawFoeFigure(ctx, g, t, game, who, x, foot, hh, 0, {});
  }
}
// @@ENEMIES

// ==================================================================== HUD

const QUESTS = {
  gow: ['Carry the sugar cube to the highest peak', 'Follow the smell of old fruit through the woods', 'Find the way past the web', 'Scatter the crumbs from the mountain top'],
  gowr: ['Find the lost fly-paper before the jam freezes', 'Follow the sled tracks across the ice', 'Seek the dwarf who forges swatters', 'Ask the wolves where summer went'],
};
const questOf = (g, game) => QUESTS[game][((g.career?.[game]?.played ?? 1) + QUESTS[game].length - 1) % QUESTS[game].length];

/** A bar with a dark bed and a thin metal frame. */
function barFrame(ctx, x, y, w, h, frame) {
  ctx.fillStyle = 'rgba(6,8,8,0.62)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.strokeStyle = frame;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
}

function diamond(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
}

/** The compass along the top: ticks sliding with the view, the quest's marker, the enemy's. */
function drawCompass(ctx, g, game, questA, foeBearing) {
  const yaw = camYaw(g);
  const cx = W / 2, y = 34, half = 250;
  const gold = game === 'gow' ? 'rgba(226,214,180,' : 'rgba(210,228,246,';
  const gr = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  gr.addColorStop(0, `${gold}0)`); gr.addColorStop(0.15, `${gold}0.7)`); gr.addColorStop(0.85, `${gold}0.7)`); gr.addColorStop(1, `${gold}0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(cx - half, y, half * 2, 2);
  ctx.fillStyle = `${gold}0.55)`;
  for (let i = -12; i <= 12; i++) {
    const a = Math.round(yaw / 0.2618) * 0.2618 + i * 0.2618;
    const dx = wrap(a - yaw) * 170;
    if (Math.abs(dx) > half * 0.9) continue;
    const big = Math.round(a / 0.2618) % 3 === 0;
    ctx.globalAlpha = 1 - Math.abs(dx) / half;
    ctx.fillRect(cx + dx - 0.75, y - (big ? 7 : 4), 1.5, big ? 7 : 4);
  }
  ctx.globalAlpha = 1;
  const mark = (a, col, shape) => {
    const dx = clamp(wrap(a - yaw) * 170, -half * 0.92, half * 0.92);
    ctx.fillStyle = col;
    if (shape === 'diamond') { diamond(ctx, cx + dx, y - 9, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(cx + dx, y - 2); ctx.lineTo(cx + dx - 6, y - 12); ctx.lineTo(cx + dx + 6, y - 12); ctx.closePath(); ctx.fill(); }
  };
  mark(questA, game === 'gow' ? '#e8c46a' : '#f0d27a', 'diamond');
  if (foeBearing !== null) mark(foeBearing, '#d8321e', 'tri');
  // the centre notch
  ctx.fillStyle = `${gold}0.95)`;
  ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx - 5, y + 12); ctx.lineTo(cx + 5, y + 12); ctx.closePath(); ctx.fill();
}

/** The quest under the compass, in small capitals; brighter for a moment when it changes. */
function drawQuest(ctx, g, game, text) {
  const fresh = clamp01(1 - ((g.match?.t ?? 99) - 5.5) / 3);
  ctx.save();
  ctx.globalAlpha = 0.72 + 0.28 * fresh;
  title(ctx, text.toUpperCase(), W / 2, 72, 17, game === 'gow' ? '#ece2c6' : '#e2eefa', { spacing: 0.12, shadow: 'rgba(0,0,0,0.75)' });
  ctx.restore();
}

/** Over the enemy's head: its name, its level in a diamond (or a hexagon), its health, its stun. */
function drawFoeBar(ctx, g, t, game, foe) {
  const e = foe.e;
  if (e.loom) return;
  const x = foe.x, y = Math.max(96, foe.foot - foe.hh * 1.04 - 30);
  const w = 132;
  const lvl = 3 + Math.floor((S.seed ?? 0) * 4) + (game === 'gowr' ? 4 : 0);
  const hot = lvl >= 6;
  const col = game === 'gow' ? (hot ? '#b04adc' : '#d8a02a') : '#5aa8f0';
  ctx.save();
  // the name
  title(ctx, e.name.toUpperCase(), x + 8, y - 8, 14, '#f2ece0', { spacing: 0.1, shadow: 'rgba(0,0,0,0.8)' });
  // the bar
  barFrame(ctx, x - w / 2 + 12, y, w, 8, 'rgba(220,210,190,0.35)');
  ctx.fillStyle = '#5a1410';
  ctx.fillRect(x - w / 2 + 12, y, w, 8);
  ctx.fillStyle = game === 'gow' ? '#c8321e' : '#d8402a';
  ctx.fillRect(x - w / 2 + 12, y, w * clamp01(e.hp), 8);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x - w / 2 + 12, y, w * clamp01(e.hp), 2);
  // the stun meter under it
  const stun = clamp01((1 - e.hp) * 1.25);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - w / 2 + 12, y + 12, w, 3);
  ctx.fillStyle = game === 'gow' ? '#e8e2c8' : '#cfe4ff';
  ctx.fillRect(x - w / 2 + 12, y + 12, w * stun, 3);
  // the level
  const lx = x - w / 2 - 4, ly = y + 4;
  if (game === 'gow') diamond(ctx, lx, ly, 13);
  else { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + PI / 6; ctx.lineTo(lx + Math.cos(a) * 13, ly + Math.sin(a) * 13); } ctx.closePath(); }
  ctx.fillStyle = 'rgba(8,8,10,0.85)';
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `700 13px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col;
  ctx.fillText(String(lvl), lx, ly + 1);
  // stunned: the prompt to grab it
  if (stun > 0.98 || e.hp < 0.2) {
    const p = 0.8 + 0.2 * Math.sin(t * 10);
    ctx.fillStyle = 'rgba(8,8,10,0.8)';
    ctx.beginPath(); ctx.arc(x, y - 40, 15 * p, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f2ece0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `700 11px ${SANS}`;
    ctx.fillStyle = '#f2ece0';
    ctx.fillText('R3', x, y - 39);
  }
  ctx.restore();
}

/** The big one's bar across the top, under its name. Ragnarök's berserker has two lives. */
function drawBossBar(ctx, g, t, game, foe) {
  const e = foe.e;
  if (!e.loom) return;
  const k = smoothstep(0.05, 0.25, e.grow);
  const w = 560, x = W / 2 - w / 2, y = 108;
  ctx.save();
  ctx.globalAlpha = k;
  const name = game === 'gow' ? 'TROLL · STONE-BEARER' : 'HALFDAN THE UNBOWED';
  title(ctx, name, W / 2, y - 12, 20, game === 'gow' ? '#f0e6cc' : '#ffe2d8', { spacing: 0.16, shadow: 'rgba(0,0,0,0.85)' });
  const bars = game === 'gow' ? 1 : 2;
  for (let b = 0; b < bars; b++) {
    const yy = y + b * 16;
    const fill = game === 'gow' ? e.hp : b === 0 ? 1 : e.hp;
    barFrame(ctx, x, yy, w, 10, game === 'gow' ? 'rgba(226,214,180,0.5)' : 'rgba(230,120,100,0.6)');
    ctx.fillStyle = '#4a0e0a';
    ctx.fillRect(x, yy, w, 10);
    const gr = ctx.createLinearGradient(x, 0, x + w, 0);
    if (b === 0 && bars === 2) { gr.addColorStop(0, '#8a3ad8'); gr.addColorStop(1, '#c070ff'); }
    else { gr.addColorStop(0, '#9a1a12'); gr.addColorStop(1, '#e0402a'); }
    ctx.fillStyle = gr;
    ctx.fillRect(x, yy, w * clamp01(fill), 10);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x, yy, w * clamp01(fill), 3);
  }
  const lx = x - 22, ly = y + 5 + (bars - 1) * 8;
  diamond(ctx, lx, ly, 16);
  ctx.fillStyle = 'rgba(8,8,10,0.9)'; ctx.fill();
  ctx.strokeStyle = '#d8321e'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.font = `700 15px ${SERIF}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff6a50';
  ctx.fillText(game === 'gow' ? '9' : '12', lx, ly + 1);
  ctx.restore();
}

/** Numbers flying off the enemy where it was hit. */
function drawHits(ctx, g, game, foe) {
  if (!foe) return;
  for (const h of S.hits) {
    const u = (g.clock - h.at) / 0.9;
    const x = foe.x + h.dx + u * 30, y = foe.chestY - foe.hh * 0.25 - u * 70;
    ctx.save();
    ctx.globalAlpha = clamp01((1 - u) * 2);
    const size = h.crit ? 30 : 22;
    ctx.font = `700 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(String(h.v), x, y);
    ctx.fillStyle = h.crit ? '#ffd24a' : game === 'gow' ? '#f4f0e6' : '#ffb070';
    ctx.fillText(String(h.v), x, y);
    ctx.restore();
  }
}

/** Experience or hacksilver coming in, down the right side. */
function drawPops(ctx, g, game) {
  S.pops.forEach((p, i) => {
    const dt = g.clock - p.at;
    const k = smooth(clamp01(dt / 0.25)) * clamp01((3.2 - dt) / 0.5);
    const x = W - 60 + (1 - k) * 40, y = 300 + i * 54;
    ctx.save();
    ctx.globalAlpha = k;
    const grd = ctx.createLinearGradient(x - 280, 0, x, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - 280, y - 22, 280, 44);
    if (game === 'gow') {
      diamond(ctx, x - 14, y - 2, 10);
      ctx.fillStyle = '#4a8adc'; ctx.fill();
      ctx.strokeStyle = '#dce8f8'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.fillStyle = '#b8bcc4';
      ctx.beginPath(); ctx.ellipse(x - 14, y - 2, 11, 8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6a6e76'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#e8ecf2'; ctx.fillRect(x - 20, y - 5, 10, 2);
    }
    title(ctx, game === 'gow' ? p.text : `${p.text} HACKSILVER`, x - 34, y + 5, 21, game === 'gow' ? '#e8f0fa' : '#eef2f6', { align: 'right', spacing: 0.06, shadow: 'rgba(0,0,0,0.8)' });
    title(ctx, `${p.name} slain`, x - 34, y + 22, 12, 'rgba(236,228,210,0.75)', { align: 'right', spacing: 0.08, shadow: null, italic: true });
    ctx.restore();
  });
}

/** The aim, when there is something to aim at: a ring and a dot, red on the target. */
function drawReticle(ctx, g, t, foe) {
  if (S.aim < 0.5 || g.dead) return;
  const on = foe && Math.abs(foe.e.err) < foe.e.size * HALF_FOV * 0.5 && foe.e.grow > 0.25;
  const x = W / 2, y = H / 2;
  ctx.save();
  ctx.globalAlpha = smooth((S.aim - 0.5) * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
  ctx.strokeStyle = on ? '#e8402a' : 'rgba(240,236,226,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = on ? '#ff5a3a' : '#f4f0e6';
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Health over rage, bottom left: green and red, the rage bar burning when it is full. */
function drawVitals(ctx, g, t, game) {
  const hp = clamp01((g.match?.hp ?? 100) / 100);
  const rage = clamp01(g.tilt / 0.6);
  const full = g.tilt > 0.6;
  const pulse = 0.5 + 0.5 * Math.sin(t * 8);
  if (game === 'gow') {
    const x = 60, y = 640, w = 330;
    // a knot to cap the bars
    drawKnot(ctx, 40, y + 10, 16, 0.4, { p: 2, q: 3, width: 3, color: '#cfc2a0', edge: 'rgba(0,0,0,0.8)' });
    barFrame(ctx, x, y, w, 12, 'rgba(226,214,180,0.45)');
    ctx.fillStyle = '#1a2a16';
    ctx.fillRect(x, y, w, 12);
    const hg = ctx.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, '#2e7a2a'); hg.addColorStop(1, '#6cc84a');
    ctx.fillStyle = hg;
    ctx.fillRect(x, y, w * hp, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w * hp, 3);
    if (hp < 0.3) { ctx.fillStyle = `rgba(255,60,40,${(0.4 * pulse).toFixed(3)})`; ctx.fillRect(x, y, w * hp, 12); }
    const ry = y + 22, rw = 270;
    barFrame(ctx, x, ry, rw, 8, full ? `rgba(255,120,80,${(0.6 + 0.4 * pulse).toFixed(3)})` : 'rgba(226,214,180,0.35)');
    ctx.fillStyle = '#2a0a08';
    ctx.fillRect(x, ry, rw, 8);
    const rg = ctx.createLinearGradient(x, 0, x + rw, 0);
    rg.addColorStop(0, '#7a1410'); rg.addColorStop(1, full ? '#ff6a3a' : '#d0341e');
    ctx.fillStyle = rg;
    ctx.fillRect(x, ry, rw * rage, 8);
    if (full) {
      glow(ctx, FX.red, x + rw, ry + 4, 60, 0.5 * pulse);
      // the prompt: both sticks
      for (const [dx, s] of [[0, 'L3'], [34, 'R3']]) {
        ctx.fillStyle = 'rgba(10,6,6,0.85)';
        ctx.beginPath(); ctx.arc(x + rw + 26 + dx, ry + 4, 13, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,120,80,${(0.7 + 0.3 * pulse).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `700 10px ${SANS}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd8c8';
        ctx.fillText(s, x + rw + 26 + dx, ry + 5);
      }
      title(ctx, 'SPARTAN RAGE', x + rw + 104, ry + 10, 15, '#ff8a60', { align: 'left', spacing: 0.14, shadow: 'rgba(0,0,0,0.8)' });
    }
    return;
  }
  // Ragnarök: a shield at the head of the bars, lightning in the rage
  const x = 118, y = 628, w = 320;
  drawShieldIcon(ctx, 70, 644, 34, hp);
  barFrame(ctx, x, y, w, 13, 'rgba(210,228,246,0.45)');
  ctx.fillStyle = '#122016';
  ctx.fillRect(x, y, w, 13);
  const hg = ctx.createLinearGradient(x, 0, x + w, 0);
  hg.addColorStop(0, '#2a8a4a'); hg.addColorStop(1, '#5ee07a');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * hp, y); ctx.lineTo(x + w * hp - 6, y + 13); ctx.lineTo(x, y + 13); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, Math.max(0, w * hp - 4), 3);
  const ry = y + 24, rw = 280;
  barFrame(ctx, x, ry, rw, 10, full ? `rgba(255,200,90,${(0.6 + 0.4 * pulse).toFixed(3)})` : 'rgba(210,228,246,0.35)');
  ctx.fillStyle = '#2a1206';
  ctx.fillRect(x, ry, rw, 10);
  const rg = ctx.createLinearGradient(x, 0, x + rw, 0);
  rg.addColorStop(0, '#b4401a'); rg.addColorStop(1, '#ffb040');
  ctx.fillStyle = rg;
  ctx.fillRect(x, ry, rw * rage, 10);
  // lightning running along the rage
  ctx.strokeStyle = `rgba(255,248,210,${(full ? 0.95 : 0.55).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const n = Math.max(1, Math.floor(rw * rage / 10));
  for (let i = 0; i <= n; i++) {
    const px = x + (i / n) * rw * rage, py = ry + 5 + (hash(i * 3.7 + Math.floor(t * (full ? 18 : 4))) - 0.5) * 7;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // the bolt at its end
  const bx = x + rw + 22, by = ry + 5;
  ctx.fillStyle = full ? '#ffe070' : 'rgba(220,200,150,0.7)';
  ctx.beginPath(); ctx.moveTo(bx + 3, by - 12); ctx.lineTo(bx - 6, by + 2); ctx.lineTo(bx, by + 2); ctx.lineTo(bx - 3, by + 12); ctx.lineTo(bx + 6, by - 2); ctx.lineTo(bx, by - 2); ctx.closePath(); ctx.fill();
  if (full) {
    glow(ctx, FX.gold, bx, by, 50, 0.6 * pulse);
    title(ctx, 'RAGE READY', bx + 18, by + 6, 15, '#ffd070', { align: 'left', spacing: 0.14, shadow: 'rgba(0,0,0,0.8)' });
  }
}

/** A round shield for Ragnarök's vitals: planks, a rim, a boss, cracks as it wears. */
function drawShieldIcon(ctx, x, y, r, hp) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(x, y + 2, r + 3, 0, TAU); ctx.fill();
  const fg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r);
  fg.addColorStop(0, '#5a6e88'); fg.addColorStop(1, '#1e2838');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) { ctx.moveTo(x + i * r * 0.28, y - r); ctx.lineTo(x + i * r * 0.28, y + r); }
  ctx.stroke();
  if (hp < 0.5) {
    ctx.strokeStyle = 'rgba(10,10,14,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.1, y - r); ctx.lineTo(x + r * 0.05, y - r * 0.4); ctx.lineTo(x - r * 0.15, y); if (hp < 0.25) { ctx.lineTo(x + r * 0.2, y + r * 0.5); ctx.lineTo(x + r * 0.1, y + r); } ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#c8a452';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,200,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r - 4, PI * 1.1, PI * 1.6); ctx.stroke();
  const bg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, r * 0.3);
  bg.addColorStop(0, '#f4e2b0'); bg.addColorStop(1, '#8a6a2a');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Runic attacks and the companion, bottom right: diamonds for the axe, rings for the blades. */
function drawRunics(ctx, g, t, game) {
  const cool = (k) => clamp01(((g.clock + k * 3.7) % (9 + k * 4)) / (6 + k * 3));
  if (game === 'gow') {
    const slots = [[1146, 642, 'R1', 13, [120, 200, 255]], [1214, 642, 'R2', 4, [120, 200, 255]]];
    slots.forEach(([x, y, key, rn, c], i) => {
      const k = cool(i);
      diamond(ctx, x, y, 28);
      ctx.fillStyle = 'rgba(8,10,12,0.78)'; ctx.fill();
      ctx.strokeStyle = k >= 1 ? css(c) : 'rgba(200,200,190,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      // the cooldown fills it from the bottom
      ctx.save();
      diamond(ctx, x, y, 26); ctx.clip();
      ctx.fillStyle = css(c, k >= 1 ? 0.28 : 0.14);
      ctx.fillRect(x - 28, y + 26 - 52 * k, 56, 52 * k);
      ctx.restore();
      ctx.strokeStyle = k >= 1 ? '#e8f6ff' : 'rgba(200,210,220,0.5)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); runePath(ctx, rn, x - 5, y - 11, 20); ctx.stroke();
      if (k >= 1) glow(ctx, FX.frost, x, y, 40, 0.35);
      label(ctx, key, x, y + 40, 11, 'rgba(236,230,214,0.85)', 'center', 700);
    });
    // the boy: a square with an arrow, and his quiver's count
    const bx = 1072, by = 648;
    ctx.fillStyle = 'rgba(8,10,12,0.78)';
    ctx.fillRect(bx - 22, by - 22, 44, 44);
    ctx.strokeStyle = 'rgba(226,214,180,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 22, by - 22, 44, 44);
    ctx.strokeStyle = '#f0e6c8';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bx - 12, by + 12); ctx.lineTo(bx + 10, by - 10); ctx.moveTo(bx + 10, by - 10); ctx.lineTo(bx + 1, by - 9); ctx.moveTo(bx + 10, by - 10); ctx.lineTo(bx + 9, by - 1); ctx.moveTo(bx - 12, by + 12); ctx.lineTo(bx - 14, by + 5); ctx.moveTo(bx - 12, by + 12); ctx.lineTo(bx - 5, by + 14); ctx.stroke();
    const left = 5 - (Math.floor(g.clock / ARROW_T) % 6);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < left ? '#f0e6c8' : 'rgba(240,230,200,0.2)'; ctx.fillRect(bx - 20 + i * 8.5, by + 28, 6, 4); }
    label(ctx, '□', bx, by + 44, 12, 'rgba(236,230,214,0.85)', 'center', 700);
    return;
  }
  const slots = [[1150, 644, 'R1', [255, 140, 50]], [1216, 644, 'R2', [255, 140, 50]]];
  slots.forEach(([x, y, key, c], i) => {
    const k = cool(i + 1);
    ctx.fillStyle = 'rgba(8,10,16,0.8)';
    ctx.beginPath(); ctx.arc(x, y, 27, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,164,82,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = k >= 1 ? css(c) : css(c, 0.6);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 22, -PI / 2, -PI / 2 + TAU * k); ctx.stroke();
    // a flame for the blades' runic
    ctx.fillStyle = k >= 1 ? '#ffb040' : 'rgba(255,176,64,0.4)';
    ctx.beginPath();
    ctx.moveTo(x, y - 13); ctx.quadraticCurveTo(x + 11, y - 1, x + 5, y + 10); ctx.quadraticCurveTo(x, y + 13, x - 5, y + 10); ctx.quadraticCurveTo(x - 11, y - 1, x, y - 13);
    ctx.fill();
    if (k >= 1) glow(ctx, FX.fire, x, y, 40, 0.35);
    label(ctx, key, x, y + 40, 11, 'rgba(226,236,246,0.85)', 'center', 700);
  });
  // the companion, and a relic above
  const hx = 1082, hy = 650;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(hx + Math.cos(a) * 24, hy + Math.sin(a) * 24); }
  ctx.closePath();
  ctx.fillStyle = 'rgba(8,10,16,0.8)'; ctx.fill();
  ctx.strokeStyle = 'rgba(160,200,240,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#dcecff';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(hx - 2, hy, 10, -1.2, 1.2); ctx.moveTo(hx - 2 + Math.cos(-1.2) * 10, hy + Math.sin(-1.2) * 10); ctx.lineTo(hx - 2 + Math.cos(1.2) * 10, hy + Math.sin(1.2) * 10); ctx.moveTo(hx - 8, hy); ctx.lineTo(hx + 12, hy); ctx.stroke();
  label(ctx, '□', hx, hy + 40, 12, 'rgba(226,236,246,0.85)', 'center', 700);
  ctx.fillStyle = 'rgba(8,10,16,0.8)';
  ctx.beginPath(); ctx.arc(1183, 588, 15, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,220,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
  glow(ctx, FX.frost, 1183, 588, 22, 0.4);
  ctx.fillStyle = '#cfeaff';
  diamond(ctx, 1183, 588, 6); ctx.fill();
}

/** Now and then the boy looses an arrow at the enemy from behind the fly: light, or lightning. */
const ARROW_T = 3.3;
function drawArrow(ctx, g, t, foe) {
  if (!foe || g.dead) return;
  const k = Math.floor(g.clock / ARROW_T);
  if (hash(k * 7.7 + 0.3) < 0.3) return;
  const u = (g.clock - k * ARROW_T) / 0.32;
  if (u < 0 || u > 1.4) return;
  const shock = hash(k * 3.1) > 0.5;
  const from = [-40, H * 0.82];
  const to = [foe.x + (hash(k) - 0.5) * foe.hh * 0.2, foe.chestY - foe.hh * 0.1];
  const at = (v) => [lerp(from[0], to[0], v), lerp(from[1], to[1], v) - Math.sin(v * PI) * 40];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (u <= 1) {
    const [hx, hy] = at(u);
    const [tx, ty] = at(Math.max(0, u - 0.3));
    const gr = ctx.createLinearGradient(tx, ty, hx, hy);
    gr.addColorStop(0, shock ? 'rgba(150,120,255,0)' : 'rgba(255,240,200,0)');
    gr.addColorStop(1, shock ? 'rgba(190,170,255,0.95)' : 'rgba(255,248,220,0.95)');
    ctx.strokeStyle = gr;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    glow(ctx, shock ? FX.violet : FX.gold, hx, hy, 26, 0.9);
    if (shock) {
      ctx.strokeStyle = 'rgba(210,200,255,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let px = tx, py = ty;
      ctx.moveTo(px, py);
      for (let i = 1; i <= 6; i++) { px = lerp(tx, hx, i / 6) + (hash(i + k * 13 + Math.floor(t * 20)) - 0.5) * 16; py = lerp(ty, hy, i / 6) + (hash(i * 3 + k) - 0.5) * 16; ctx.lineTo(px, py); }
      ctx.stroke();
    }
  } else {
    const f = (u - 1) / 0.4;
    glow(ctx, shock ? FX.violet : FX.gold, to[0], to[1], 40 + f * 60, 0.8 * (1 - f));
  }
  ctx.restore();
}

/** The place's name, as the match opens. */
function drawTitleCard(ctx, g, game) {
  const mt = g.match?.t ?? 99;
  if (mt > 5.4) return;
  const k = smooth(clamp01((mt - 0.4) / 0.8)) * clamp01((5.4 - mt) / 0.9);
  if (k <= 0) return;
  const [big, small] = game === 'gow' ? ['MIDGARD', 'The Pine Hollow'] : ['FIMBULWINTER', 'The Frozen Fjord'];
  ctx.save();
  ctx.globalAlpha = k;
  const y = 210;
  const col = game === 'gow' ? '#f0e8d4' : '#e8f2fc';
  title(ctx, big, W / 2, y, 58, col, { spacing: 0.3, shadow: 'rgba(0,0,0,0.7)' });
  ctx.strokeStyle = game === 'gow' ? 'rgba(226,214,180,0.7)' : 'rgba(200,224,250,0.7)';
  ctx.lineWidth = 1.5;
  const w = 220 + 80 * k;
  ctx.beginPath(); ctx.moveTo(W / 2 - w, y + 22); ctx.lineTo(W / 2 - 18, y + 22); ctx.moveTo(W / 2 + 18, y + 22); ctx.lineTo(W / 2 + w, y + 22); ctx.stroke();
  diamond(ctx, W / 2, y + 22, 6);
  ctx.fillStyle = game === 'gow' ? '#e8c46a' : '#9fd0ff';
  ctx.fill();
  title(ctx, small, W / 2, y + 58, 24, col, { spacing: 0.08, italic: true, shadow: 'rgba(0,0,0,0.7)' });
  ctx.restore();
}

function drawHud(ctx, g, t, game, foe) {
  if (foe) { drawFoeBar(ctx, g, t, game, foe); drawBossBar(ctx, g, t, game, foe); drawHits(ctx, g, game, foe); }
  drawCompass(ctx, g, game, game === 'gow' ? MG.MOUNT_A : FW.FORGE_A, foe ? foe.e.bearing : null);
  if (!(foe && foe.e.loom && foe.e.grow > 0.05)) drawQuest(ctx, g, game, questOf(g, game));
  drawVitals(ctx, g, t, game);
  drawRunics(ctx, g, t, game);
  drawPops(ctx, g, game);
  drawReticle(ctx, g, t, foe);
  drawTitleCard(ctx, g, game);
}

// ============================================================ build, lazily

const WORLDS = {};
const BUILDERS = {
  gow: [['sky', () => mgSky()], ['land', () => mgLand()], ['ground', () => mgGround()]],
  gowr: [['sky', () => fwSky()], ['aurora', () => fwAurora()], ['land', () => fwLand()], ['ground', () => fwGround()]],
};

/** Bake one missing piece of a game's world; the loading screen calls this a frame at a time. */
function warm(game) {
  if (!FX) { FX = buildFx(); return false; }
  const w = WORLDS[game] ?? (WORLDS[game] = {});
  for (const [k, fn] of BUILDERS[game]) {
    if (!w[k]) { w[k] = fn(); return false; }
  }
  return true;
}
function ensureWorld(game) {
  while (!warm(game));
  return WORLDS[game];
}

// ================================================================== state

/** What the painter keeps between frames: the smoothed aim, who just fell, what to pop up. */
const S = {
  game: null,
  clock: null,
  aim: 0,
  lastShot: -9,
  lastTarget: [W / 2 + 40, H / 2],
  enemyRef: null,
  snap: null,
  corpse: null,
  killer: null,
  hits: [],
  pops: [],
};

function step(g, game) {
  if (S.game !== game) {
    Object.assign(S, { game, clock: null, aim: 0, lastShot: g.shotAt, enemyRef: null, snap: null, corpse: null, killer: null, hits: [], pops: [] });
  }
  const first = S.clock === null;
  const dt = first ? 0 : clamp(g.clock - S.clock, 0, 0.1);
  S.clock = g.clock;
  const e = g.enemy;
  const want = e && !g.dead ? 1 : 0;
  S.aim = first ? want : S.aim + (want - S.aim) * Math.min(1, dt * (want ? 8 : 1.6));
  // a hit shows its number
  if (g.shotAt !== S.lastShot) {
    if (e && e.hitFlash > 0.4) {
      S.hits.push({ at: g.shotAt, v: Math.round(18 + hash(g.shotAt * 7.1) * 46 + (e.loom ? 30 : 0)), dx: (hash(g.shotAt * 3.3) - 0.5) * 60, crit: hash(g.shotAt * 5.9) > 0.82 });
      if (S.hits.length > 6) S.hits.shift();
    }
    S.lastShot = g.shotAt;
  }
  S.hits = S.hits.filter((h) => g.clock - h.at < 0.9 && g.clock >= h.at);
  // who is out there, and who just went down
  if (e) {
    if (S.enemyRef !== e) { S.enemyRef = e; S.seed = hash(e.bearing * 11.3 + g.clock * 0.37); }
    S.snap = { bearing: e.bearing, size: e.size, name: e.name, kind: e.kind, loom: e.loom, grow: e.grow, elev: e.elev, seed: S.seed };
  } else if (S.enemyRef) {
    const r = g.lastResult;
    const recent = r && typeof g.now === 'function' && g.now() - r.at < 800;
    if (recent && r.kind === 'kill' && S.snap) {
      S.corpse = { ...S.snap, at: g.clock, yaw: camYaw(g) };
      const gain = game === 'gow' ? `+${Math.round(30 + hash(g.clock) * 40 + (S.snap.loom ? 120 : 0))} XP` : `+${Math.round(60 + hash(g.clock) * 90 + (S.snap.loom ? 250 : 0))}`;
      S.pops.push({ at: g.clock, text: gain, name: S.snap.name });
      if (S.pops.length > 3) S.pops.shift();
    } else if (g.dead && S.snap) S.killer = { ...S.snap };
    S.enemyRef = null;
  }
  if (!g.dead) S.killer = null;
  if (S.corpse && (g.clock - S.corpse.at > 2.5 || g.clock < S.corpse.at)) S.corpse = null;
  S.pops = S.pops.filter((p) => g.clock - p.at < 3.2 && g.clock >= p.at);
}

/** Screen px of a normal enemy's height per unit of its size: the fights are close. */
const FOE_H = 1.95;
/** The enemy on screen: where its chest is (the aim point), its height, its feet, its range. */
function foeGeom(g, hz) {
  const en = enemyOnScreen(g);
  if (!en) return null;
  const e = en.e;
  const hh = e.loom ? en.s * 1.12 : en.s * FOE_H;
  const foot = en.y + (e.loom ? 0.6 : 0.58) * hh;
  return { e, x: en.x, chestY: en.y, foot, hh, loom: e.loom, r: rangeOf(foot - hz), kind: e.kind, name: e.name };
}

// ================================================================== play

function beginShot(ctx, g) {
  ctx.save();
  if (g.dead) {
    const d = smooth(clamp01(g.dead.t / 1.2));
    ctx.translate(W / 2, H / 2 + d * 40);
    ctx.rotate(-0.12 * d);
    ctx.scale(1 + 0.18 * d, 1 + 0.18 * d);
    ctx.translate(-W / 2, -H / 2);
  }
  // a big one's steps shake the camera
  const e = g.enemy;
  if (e && e.loom && !g.dead) {
    const k = smoothstep(0.3, 1, e.grow) * Math.pow(Math.abs(Math.sin(g.clock * 5)), 8);
    ctx.translate((hash(Math.floor(g.clock * 30)) - 0.5) * 10 * k, (hash(Math.floor(g.clock * 30) + 0.5) - 0.5) * 12 * k);
  }
}

function endShot(ctx, g, t, game, foe) {
  // the grade: Midgard teal-grey and heavy, the winter cold blue
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = game === 'gow' ? 'rgb(178,190,184)' : 'rgb(196,208,228)';
  ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(FX.vignette, 0, 0);
  // Spartan rage: the edges run red
  const rage = clamp01((g.tilt - 0.6) / 0.25);
  if (rage > 0 && !g.dead && g.phase === 'playing') {
    ctx.globalAlpha = rage * (0.55 + 0.25 * Math.sin(t * 8));
    ctx.drawImage(FX.rage, 0, 0);
    ctx.globalAlpha = 1;
    rageEmbers(ctx, t, rage, game);
  }
  ctx.restore();
  if (g.phase === 'playing' || g.phase === 'rage-quit') {
    if (g.dead) drawDeath(ctx, g, t, game);
    else drawHud(ctx, g, t, game, foe);
  }
}

/** Embers (or sparks of lightning) swirling up round the edges when the rage is full. */
function rageEmbers(ctx, t, k, game) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = game === 'gow' ? `rgba(255,120,50,${(0.8 * k).toFixed(3)})` : `rgba(255,220,120,${(0.8 * k).toFixed(3)})`;
  ctx.beginPath();
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    const u = (t * (0.3 + hash(i) * 0.3) + hash(i * 3.3)) % 1;
    const x = side > 0 ? W - hash(i * 5.1) * 220 : hash(i * 5.1) * 220;
    const y = H - u * H * 1.1 + Math.sin(t * 3 + i) * 10;
    const r = 1.5 + hash(i * 7.7) * 2.5;
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}

function playMidgard(ctx, g, t) {
  const w = ensureWorld('gow');
  step(g, 'gow');
  const yaw = camYaw(g);
  const hz = HZ0 + (g.view?.pitch ?? 0) * PX;
  const foe = foeGeom(g, hz);
  if (foe) S.lastTarget = [foe.x, foe.chestY];
  beginShot(ctx, g);
  drawPano(ctx, w.sky, yaw, hz);
  drawPano(ctx, w.ground, yaw, hz);
  drawPano(ctx, w.land, yaw, hz);
  mgAir2(ctx, g, t, hz, 0);
  let drawn = false;
  const er = foe ? foe.r : -1;
  for (const o of MG_NEAR.all) {
    if (!drawn && o.r < er) { drawFoes(ctx, g, t, hz, foe, 'gow'); drawn = true; }
    mgObject(ctx, o, yaw, hz, t);
  }
  if (!drawn) drawFoes(ctx, g, t, hz, foe, 'gow');
  mgFerns(ctx, g, t, hz);
  drawArrow(ctx, g, t, foe);
  mgAir2(ctx, g, t, hz, 1);
  const into = Math.max(0, mgSunF(yaw));
  const light = { back: Math.pow(into, 2) * 0.8, side: clamp(Math.sin(wrap(MG.SUN_A - yaw)) * 1.2, -1, 1) * (0.4 + 0.6 * into), warm: 'sun' };
  const wpn = drawWarrior(ctx, g, t, 'gow', foe, light);
  drawAxeFlight(ctx, wpn, foe, t);
  endShot(ctx, g, t, 'gow', foe);
}

function playFimbul(ctx, g, t) {
  const w = ensureWorld('gowr');
  step(g, 'gowr');
  const yaw = camYaw(g);
  const hz = HZ0 + (g.view?.pitch ?? 0) * PX;
  const foe = foeGeom(g, hz);
  if (foe) S.lastTarget = [foe.x, foe.chestY];
  beginShot(ctx, g);
  drawPano(ctx, w.sky, yaw, hz);
  ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 0.5);
  ctx.globalCompositeOperation = 'lighter';
  drawPano(ctx, w.aurora, yaw + Math.sin(t * 0.13) * 0.01, hz);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  drawPano(ctx, w.ground, yaw, hz);
  drawPano(ctx, w.land, yaw, hz);
  drawBlizzard(ctx, g, t, 0);
  let drawn = false;
  const er = foe ? foe.r : -1;
  for (const o of FW_NEAR.all) {
    if (!drawn && o.r < er) { drawFoes(ctx, g, t, hz, foe, 'gowr'); drawn = true; }
    fwObject(ctx, o, yaw, hz, t);
  }
  if (!drawn) drawFoes(ctx, g, t, hz, foe, 'gowr');
  const gate = Math.max(0, fwForgeF(yaw));
  const light = { back: 0.15, side: clamp(Math.sin(wrap(FW.FORGE_A - yaw)) * 1.3, -1, 1) * (0.3 + 0.7 * gate), warm: 'gold' };
  const wpn = drawWarrior(ctx, g, t, 'gowr', foe, light);
  drawBladeArc(ctx, wpn, foe, t);
  drawBlizzard(ctx, g, t, 1);
  endShot(ctx, g, t, 'gowr', foe);
}

// ================================================================== death

function drawDeath(ctx, g, t, game) {
  const d = g.dead;
  const k = clamp01(d.t / 0.6);
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `rgba(128,128,128,${k.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = game === 'gow' ? `rgba(150,140,136,${(0.7 * k).toFixed(3)})` : `rgba(130,140,156,${(0.7 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = k;
  ctx.drawImage(FX.death, 0, 0);
  ctx.restore();
  const tk = smooth(clamp01((d.t - 0.45) / 0.7));
  const out = smooth(clamp01((d.t - 2.35) / 0.45));
  deathTitle(ctx, t, game, tk, `Slain by ${article(d.by)}`, d.t > 1.7 ? clamp01((d.t - 1.7) / 0.4) : 0, 'Returning to the last checkpoint');
  if (out > 0) { ctx.fillStyle = `rgba(0,0,0,${out.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
}

const article = (name) => (/^[AEIOU]/.test(name ?? '') ? `an ${name}` : `a ${name ?? 'draugr'}`);

/** "YOU DIED" in a big serif under a slow Norse knot, a rule either side, a line under it. */
function deathTitle(ctx, t, game, k, sub, k2, hint) {
  if (k <= 0) return;
  const cx = W / 2, y = 380;
  const bone = game === 'gow' ? '#e9e1cc' : '#e4eef8';
  const accent = game === 'gow' ? '#a8261c' : '#6aa8e8';
  ctx.save();
  ctx.globalAlpha = k;
  // a band of dark behind it
  const band = ctx.createLinearGradient(0, y - 170, 0, y + 90);
  band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.35, 'rgba(0,0,0,0.55)'); band.addColorStop(0.75, 'rgba(0,0,0,0.55)'); band.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, y - 170, W, 260);
  glow(ctx, game === 'gow' ? FX.red : FX.spirit, cx, y - 30, 420, 0.25 * k);
  drawKnot(ctx, cx, y - 118, 44, t * 0.25, { p: 3, q: 2, width: 6, color: game === 'gow' ? '#bda77a' : '#a8c8ea', edge: 'rgba(10,8,6,0.9)', shine: 'rgba(255,255,255,0.25)', alpha: k });
  title(ctx, 'YOU DIED', cx, y, 96 + (1 - k) * 12, bone, { spacing: 0.22, shadow: 'rgba(0,0,0,0.85)' });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  const w = 300 * k;
  ctx.beginPath(); ctx.moveTo(cx - 40 - w, y + 30); ctx.lineTo(cx - 20, y + 30); ctx.moveTo(cx + 20, y + 30); ctx.lineTo(cx + 40 + w, y + 30); ctx.stroke();
  diamond(ctx, cx, y + 30, 7);
  ctx.fillStyle = accent;
  ctx.fill();
  title(ctx, sub, cx, y + 66, 24, 'rgba(236,228,212,0.9)', { spacing: 0.04, italic: true, shadow: 'rgba(0,0,0,0.8)' });
  if (k2 > 0) {
    ctx.globalAlpha = k * k2;
    title(ctx, hint, cx, y + 108, 17, 'rgba(226,220,204,0.75)', { spacing: 0.1, shadow: 'rgba(0,0,0,0.8)' });
  }
  ctx.restore();
}
// ================================================================= result

function drawResult(ctx, g, t, game) {
  const r = g.result;
  if (!r) return;
  if (!FX) FX = buildFx();
  const k = smooth(clamp01((g.t ?? 0) / 0.6));
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `rgba(128,128,128,${(0.55 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = game === 'gow' ? `rgba(12,10,8,${(0.5 * k).toFixed(3)})` : `rgba(6,10,20,${(0.5 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = k;
  ctx.drawImage(FX.death, 0, 0);
  ctx.restore();
  const gt = g.t ?? 0;
  const delta = r.delta ?? 0;
  const bone = game === 'gow' ? '#efe6cc' : '#e8f2fc';
  const accent = game === 'gow' ? '#e0b85a' : '#8cc8ff';
  if (!r.won) {
    deathTitle(ctx, t, game, smooth(clamp01((gt - 0.2) / 0.6)), game === 'gow' ? 'The challenge is lost' : 'The encounter is lost', clamp01((gt - 1.2) / 0.4), `${r.kills} slain · ${delta >= 0 ? '+' : '−'}${Math.abs(delta)} ${game === 'gow' ? 'XP kept' : 'hacksilver kept'}`);
    const pk = clamp01((gt - 1.7) / 0.4);
    if (pk > 0) { ctx.save(); ctx.globalAlpha = pk; buttonPrompt(ctx, W / 2, 610, '✕', 'Retry from checkpoint', game); ctx.restore(); }
    return;
  }
  const tk = smooth(clamp01((gt - 0.2) / 0.6));
  const cx = W / 2;
  ctx.save();
  ctx.globalAlpha = tk;
  const band = ctx.createLinearGradient(0, 110, 0, 330);
  band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.3, 'rgba(0,0,0,0.5)'); band.addColorStop(0.7, 'rgba(0,0,0,0.5)'); band.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 110, W, 220);
  glow(ctx, game === 'gow' ? FX.gold : FX.frost, cx, 230, 380, 0.3 * tk);
  drawKnot(ctx, cx, 150, 36, t * 0.3, { p: 2, q: 5, width: 5, color: game === 'gow' ? '#d8b86a' : '#a8d0f4', edge: 'rgba(10,8,6,0.9)', shine: 'rgba(255,255,255,0.3)', alpha: tk });
  title(ctx, game === 'gow' ? 'CHALLENGE COMPLETE' : 'ENCOUNTER CLEARED', cx, 250, 62 + (1 - tk) * 8, bone, { spacing: 0.16, shadow: 'rgba(0,0,0,0.85)' });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  const w = 330 * tk;
  ctx.beginPath(); ctx.moveTo(cx - 30 - w, 282); ctx.lineTo(cx - 16, 282); ctx.moveTo(cx + 16, 282); ctx.lineTo(cx + 30 + w, 282); ctx.stroke();
  diamond(ctx, cx, 282, 6);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
  // the rewards, one line after another
  const rows = game === 'gow'
    ? [['Experience', `+${delta} XP`, true], ['Draugr slain', String(r.kills)], ['Deaths', String(r.deaths)]]
    : [['Hacksilver', `+${delta}`, true], ['Einherjar defeated', String(r.kills)], ['Deaths', String(r.deaths)]];
  rows.forEach(([name, value, main], i) => {
    const rk = smooth(clamp01((gt - 0.8 - i * 0.2) / 0.3));
    if (rk <= 0) return;
    const y = 346 + i * 44;
    ctx.save();
    ctx.globalAlpha = rk;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - 280, y - 26, 560, 38);
    ctx.fillStyle = main ? accent : 'rgba(255,255,255,0.15)';
    ctx.fillRect(cx - 280, y - 26, 3, 38);
    title(ctx, name.toUpperCase(), cx - 260 + (1 - rk) * 20, y + 1, 18, 'rgba(236,230,214,0.9)', { align: 'left', spacing: 0.12, shadow: 'rgba(0,0,0,0.8)' });
    if (main) {
      if (game === 'gow') { diamond(ctx, cx + 150, y - 7, 9); ctx.fillStyle = '#4a8adc'; ctx.fill(); ctx.strokeStyle = '#dce8f8'; ctx.lineWidth = 1.5; ctx.stroke(); }
      else { ctx.fillStyle = '#c4c8d0'; ctx.beginPath(); ctx.ellipse(cx + 150, y - 7, 11, 8, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6a6e76'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    title(ctx, value, cx + 262, y + 3, main ? 26 : 22, main ? accent : bone, { align: 'right', spacing: 0.04, shadow: 'rgba(0,0,0,0.8)' });
    ctx.restore();
  });
  // where it leaves the fly: a level bar filling, or the purse
  const lk = smooth(clamp01((gt - 1.6) / 0.4));
  if (lk > 0) {
    const rank = g.career?.[game]?.rank ?? 0;
    ctx.save();
    ctx.globalAlpha = lk;
    const y = 500;
    if (game === 'gow') {
      const before = Math.max(0, rank - delta);
      const fillK = smooth(clamp01((gt - 1.8) / 1.2));
      const now = lerp(before, rank, fillK);
      const lvl = Math.floor(now / 1000) + 1;
      title(ctx, `LEVEL ${lvl}`, cx - 280, y, 20, bone, { align: 'left', spacing: 0.14, shadow: 'rgba(0,0,0,0.8)' });
      title(ctx, `${Math.round(now % 1000)} / 1000 XP`, cx + 280, y, 16, 'rgba(236,230,214,0.8)', { align: 'right', spacing: 0.06, shadow: 'rgba(0,0,0,0.8)' });
      barFrame(ctx, cx - 280, y + 12, 560, 8, 'rgba(226,214,180,0.4)');
      ctx.fillStyle = '#12203a';
      ctx.fillRect(cx - 280, y + 12, 560, 8);
      const gr = ctx.createLinearGradient(cx - 280, 0, cx + 280, 0);
      gr.addColorStop(0, '#2a5aa8'); gr.addColorStop(1, '#7ab8f4');
      ctx.fillStyle = gr;
      ctx.fillRect(cx - 280, y + 12, 560 * ((now % 1000) / 1000), 8);
    } else {
      title(ctx, formatRank('gowr', rank).toUpperCase(), cx, y + 10, 20, bone, { spacing: 0.12, shadow: 'rgba(0,0,0,0.8)' });
    }
    ctx.restore();
  }
  const pk = clamp01((gt - 2.2) / 0.4);
  if (pk > 0) { ctx.save(); ctx.globalAlpha = pk; buttonPrompt(ctx, cx, 610, '✕', 'Continue', game); ctx.restore(); }
}

/** A pad button in a ring and what it does. */
function buttonPrompt(ctx, x, y, key, text, game) {
  ctx.font = `400 19px ${SERIF}`;
  const tw = ctx.measureText(text).width;
  const x0 = x - (tw + 44) / 2;
  ctx.fillStyle = 'rgba(8,8,10,0.8)';
  ctx.beginPath(); ctx.arc(x0 + 14, y, 15, 0, TAU); ctx.fill();
  ctx.strokeStyle = game === 'gow' ? 'rgba(236,228,210,0.85)' : 'rgba(210,228,248,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `700 14px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = game === 'gow' ? '#9ab8e8' : '#9ad0ff';
  ctx.fillText(key, x0 + 14, y + 1);
  title(ctx, text, x0 + 40, y + 7, 19, 'rgba(236,230,214,0.9)', { align: 'left', spacing: 0.04, shadow: 'rgba(0,0,0,0.8)' });
}

// ================================================================== queue

const LORE = {
  gow: [
    'Draugr are the restless dead. They cannot smell fruit, and it has made them bitter.',
    'The axe comes back when it is called. So does a fly, if you open the jam.',
    'The boy’s arrows are made of light. His aim is made of hope.',
    'Trolls carve their deeds into the stones they carry. Mostly: “stepped on a fly”.',
    'Spartan Rage: when the swatter comes, become the swatter.',
    'The serpent in the lake speaks an old tongue. Most of it is “bzzz”.',
  ],
  gowr: [
    'Fimbulwinter: three winters, no summer, and not one window left open.',
    'The Einherjar feast forever in the hall. Nobody told them about the fruit bowl.',
    'A red ring cannot be blocked. It can, however, be flown away from.',
    'The blades are bound to the arms by chains. The fly is bound to bananas by love.',
    'Hacksilver is dwarven money. Flies would rather be paid in sugar.',
    'A dwarf once forged a fly-swatter. We do not speak his name.',
  ],
};

/** The loading screen's backdrop, baked: carved stone for Midgard, deep ice for the winter. */
function buildBackdrop(game) {
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const gw = game === 'gow';
  const gr = x.createRadialGradient(W * 0.3, H * 0.45, 40, W * 0.45, H * 0.5, W * 0.8);
  if (gw) { gr.addColorStop(0, '#3a3428'); gr.addColorStop(0.5, '#221e18'); gr.addColorStop(1, '#0c0a08'); }
  else { gr.addColorStop(0, '#1a3050'); gr.addColorStop(0.5, '#0e1a30'); gr.addColorStop(1, '#040810'); }
  x.fillStyle = gr;
  x.fillRect(0, 0, W, H);
  // texture: stone grain, or frost feathers
  for (let i = 0; i < 5000; i++) {
    const px = hash(i * 1.31) * W, py = hash(i * 2.77) * H;
    x.fillStyle = gw ? (hash(i * 3.3) > 0.5 ? 'rgba(255,240,210,0.035)' : 'rgba(0,0,0,0.12)') : (hash(i * 3.3) > 0.5 ? 'rgba(200,230,255,0.05)' : 'rgba(0,0,0,0.12)');
    x.fillRect(px, py, 1 + hash(i) * 3, 1 + hash(i * 5) * 3);
  }
  if (gw) {
    // cracks, and a band of knotwork cut along the top and bottom
    x.strokeStyle = 'rgba(0,0,0,0.35)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      let px = hash(i * 7.1) * W, py = hash(i * 3.9) * H;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 8; k++) { px += (hash(i * 11 + k) - 0.5) * 60; py += (hash(i * 13 + k) - 0.3) * 40; x.lineTo(px, py); }
      x.stroke();
    }
  } else {
    x.strokeStyle = 'rgba(210,236,255,0.18)';
    x.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      const cx = hash(i * 4.4) < 0.5 ? hash(i * 2.2) * 200 : W - hash(i * 2.2) * 200, cy = hash(i * 6.6) * H;
      const len = 20 + hash(i * 8.8) * 60;
      x.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + i; x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); for (let j = 1; j < 4; j++) { const bx = cx + Math.cos(a) * len * j / 4, by = cy + Math.sin(a) * len * j / 4; x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + 0.6) * len * 0.2, by + Math.sin(a + 0.6) * len * 0.2); } }
      x.stroke();
    }
    // the aurora's edge across the top
    x.globalCompositeOperation = 'lighter';
    for (let px = 0; px < W; px += 3) {
      const y = 90 + Math.sin(px * 0.006) * 30 + vnoise(px * 0.01, 2) * 30;
      const g2 = x.createLinearGradient(0, y - 110, 0, y);
      g2.addColorStop(0, 'rgba(150,100,255,0)'); g2.addColorStop(0.7, `rgba(80,240,170,${(0.12 * vnoise(px * 0.05, 5)).toFixed(3)})`); g2.addColorStop(1, 'rgba(120,255,200,0)');
      x.fillStyle = g2;
      x.fillRect(px, y - 110, 3, 110);
    }
    x.globalCompositeOperation = 'source-over';
  }
  // a frame line in from the edge
  x.strokeStyle = gw ? 'rgba(200,180,130,0.25)' : 'rgba(170,210,250,0.25)';
  x.lineWidth = 1.5;
  x.strokeRect(28, 28, W - 56, H - 56);
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = vg;
  x.fillRect(0, 0, W, H);
  return c;
}

function drawQueue(ctx, g, t, game) {
  if (!FX) FX = buildFx();
  if (!FX.backdrops) FX.backdrops = {};
  if (!FX.backdrops[game]) FX.backdrops[game] = buildBackdrop(game);
  const p = clamp01(g.phaseProgress ?? 0);
  const gw = game === 'gow';
  ctx.drawImage(FX.backdrops[game], 0, 0);
  const lit = gw ? [120, 230, 190] : [150, 210, 255];
  const stone = gw ? '#b8a878' : '#b8d0ea';
  // the rune ring, turning slowly, each rune kindling as it loads
  const cx = 360, cy = 340, R = 190;
  ctx.save();
  ctx.translate(cx, cy);
  glow(ctx, gw ? FX.green : FX.frost, 0, 0, R * 1.6, 0.1 + 0.15 * p);
  ctx.rotate(t * 0.06);
  ctx.strokeStyle = gw ? 'rgba(184,168,120,0.55)' : 'rgba(184,208,234,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, R - 50, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R + 10, 0, TAU); ctx.stroke();
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const on = clamp01(p * n - i);
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -R + 25);
    if (on > 0) glow(ctx, gw ? FX.green : FX.frost, 0, 0, 26, 0.55 * on);
    ctx.strokeStyle = on > 0 ? css(mix([90, 80, 60], lit, on), 1) : (gw ? 'rgba(160,146,110,0.45)' : 'rgba(150,176,206,0.45)');
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); runePath(ctx, i, -6, -11, 22); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  drawKnot(ctx, cx, cy, R - 70, -t * 0.12, { p: 3, q: 4, width: 7, color: stone, edge: 'rgba(0,0,0,0.85)', shine: 'rgba(255,255,255,0.18)', alpha: 0.9 });
  // in the eye of the knot, the weapon
  if (gw) drawAxeAt(ctx, cx - 16, cy + 60, 0.35, 0.5, 0.5 + 0.3 * p);
  else { drawBladeAt(ctx, cx - 50, cy + 30, -0.9, 0.55, t, 0.8); drawBladeAt(ctx, cx + 50, cy + 30, -PI + 0.9, 0.55, t, 0.8); }
  // the realm, the chapter, the lore
  const played = g.career?.[game]?.played ?? 0;
  const tx = 660;
  const k = clamp01((g.t ?? 1) / 0.6);
  ctx.save();
  ctx.globalAlpha = k;
  title(ctx, gw ? 'MIDGARD' : 'FIMBULWINTER', tx, 250, gw ? 54 : 46, gw ? '#efe4c8' : '#e6f0fb', { align: 'left', spacing: gw ? 0.24 : 0.16, shadow: 'rgba(0,0,0,0.8)' });
  title(ctx, `${gw ? 'Chapter' : 'Act'} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][Math.min(6, played)]} · ${gw ? 'The Pine Hollow' : 'The Frozen Fjord'}`, tx + 2, 292, 22, gw ? '#d8c08a' : '#a8cff4', { align: 'left', spacing: 0.06, italic: true, shadow: 'rgba(0,0,0,0.8)' });
  ctx.strokeStyle = gw ? 'rgba(216,192,138,0.5)' : 'rgba(168,207,244,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx, 322); ctx.lineTo(tx + 500, 322); ctx.stroke();
  title(ctx, 'LORE', tx, 360, 15, gw ? '#d8c08a' : '#a8cff4', { align: 'left', spacing: 0.3, shadow: null });
  const tip = LORE[game][Math.abs(Math.floor(played + (g.seed ?? 0))) % LORE[game].length];
  ctx.font = `italic 400 22px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(236,230,216,0.9)';
  const words = tip.split(' ');
  let line = '', y = 396;
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(test).width > 500 && line) { ctx.fillText(line, tx, y); line = wd; y += 32; } else line = test;
  }
  if (line) ctx.fillText(line, tx, y);
  ctx.restore();
  // snow drifting past the winter's screen
  if (!gw) {
    ctx.fillStyle = 'rgba(236,244,255,0.6)';
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const x = (hash(i * 1.7) * (W + 100) + t * (30 + hash(i * 2.3) * 50)) % (W + 100) - 50;
      const yy = (hash(i * 3.1) * (H + 40) + t * (40 + hash(i * 4.9) * 40)) % (H + 40) - 20;
      const r = 1 + hash(i * 5.3) * 2.2;
      ctx.moveTo(x + r, yy); ctx.arc(x, yy, r, 0, TAU);
    }
    ctx.fill();
  }
  // the bar, a thin rule with a bright head
  const bx = 120, by = 640, bw = W - 240;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by, bw, 3);
  const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  if (gw) { bg.addColorStop(0, '#6a5a3a'); bg.addColorStop(1, '#e0c070'); } else { bg.addColorStop(0, '#2a5a9a'); bg.addColorStop(1, '#bfe4ff'); }
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw * p, 3);
  glow(ctx, gw ? FX.gold : FX.frost, bx + bw * p, by + 1.5, 26, 0.8);
  title(ctx, 'LOADING', bx, by - 14, 13, 'rgba(236,230,214,0.6)', { align: 'left', spacing: 0.3, shadow: null });
  title(ctx, `${Math.round(p * 100)}%`, bx + bw, by - 14, 13, 'rgba(236,230,214,0.6)', { align: 'right', spacing: 0.1, shadow: null });
  // the world bakes while this is up, a piece a frame
  if ((g.t ?? 1) > 0.15) warm(game);
}

// =================================================================== icon

function drawIcon(ctx, x, y, s, game) {
  if (!FX) FX = buildFx();
  ctx.save();
  rrect(ctx, x, y, s, s, s * 0.2);
  const bg = ctx.createLinearGradient(x, y, x + s, y + s);
  if (game === 'gow') { bg.addColorStop(0, '#5a6c7c'); bg.addColorStop(0.6, '#2e3a46'); bg.addColorStop(1, '#161c24'); }
  else { bg.addColorStop(0, '#24407a'); bg.addColorStop(0.6, '#122448'); bg.addColorStop(1, '#070e20'); }
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();
  const cx = x + s / 2, cy = y + s / 2;
  if (game === 'gow') {
    glow(ctx, FX.frost, cx + s * 0.05, cy - s * 0.1, s * 0.45, 0.45);
    ctx.translate(cx - s * 0.08, cy + s * 0.04);
    ctx.rotate(0.55);
    const k = s / 340;
    ctx.scale(k, k);
    ctx.drawImage(FX.axe, -70 - 20, -236 + 116);
  } else {
    glow(ctx, FX.fire, cx, cy - s * 0.05, s * 0.5, 0.55);
    const k = s / 300;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * s * 0.02, cy + s * 0.2);
      ctx.rotate(side > 0 ? -2.3 : -0.84);
      ctx.scale(k, k);
      ctx.drawImage(FX.blade, -30, -45);
      ctx.restore();
    }
    // the chains from both hilts, glowing
    ctx.strokeStyle = 'rgba(255,170,80,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.setLineDash([s * 0.035, s * 0.022]);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy + s * 0.3); ctx.quadraticCurveTo(cx - s * 0.2, cy + s * 0.42, cx - s * 0.36, cy + s * 0.52);
    ctx.moveTo(cx + s * 0.12, cy + s * 0.3); ctx.quadraticCurveTo(cx + s * 0.22, cy + s * 0.42, cx + s * 0.38, cy + s * 0.52);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export const GOW = {
  play: playMidgard,
  queue: (ctx, g, t) => drawQueue(ctx, g, t, 'gow'),
  result: (ctx, g, t) => drawResult(ctx, g, t, 'gow'),
  icon: (ctx, x, y, s) => drawIcon(ctx, x, y, s, 'gow'),
};
export const RAGNAROK = {
  play: playFimbul,
  queue: (ctx, g, t) => drawQueue(ctx, g, t, 'gowr'),
  result: (ctx, g, t) => drawResult(ctx, g, t, 'gowr'),
  icon: (ctx, x, y, s) => drawIcon(ctx, x, y, s, 'gowr'),
};
