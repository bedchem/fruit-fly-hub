/**
 * Rainbow Six Siege on the fly's monitor: Bomb on an alpine lodge.
 *
 * The rooms are ray-cast in real time from siege.js's map — plaster over
 * wainscoting, log walls, brick outside, windows full of snow, sconces, lamps
 * pooling light on the floor, barricades and reinforced walls that the breach
 * opens. Everything standing in the rooms — furniture, the bombs, the enemy
 * operator — and the fly's own rifle are small 3D models: lit boxes, projected
 * with the same camera as the walls and hidden behind them column by column.
 *
 * The HUD follows the game's conventions (teams at the top, timer, round,
 * health and ammunition below). Nothing of Ubisoft's is used: the lodge, the
 * models and the HUD are drawn here; the wall photos are Poly Haven's (CC0).
 */
import { SIEGE_MAP, SIEGE_SITES, SIEGE_TIME, OPERATORS, siegeCell } from '../../game/siege.js';
import { MAIN_W as W, MAIN_H as H, text, rrect, clamp01, hash, MONO, mmss, wrap, TAU } from './kit.js';

const BLUE = '#62c8f4', ORANGE = '#f39a54', WHITE = '#ecf4f8';
/** The ray-cast image is half the monitor's size, and scaled up. */
const RW = 640, RH = 360, TEX = 128;
const MAP_W = SIEGE_MAP[0].length, MAP_H = SIEGE_MAP.length;

// ================================================================== textures

const photos = {};
let renderer;

function loadPhoto(name) {
  if (photos[name] !== undefined) return;
  photos[name] = null;
  const img = new Image();
  img.onload = () => { photos[name] = img; if (renderer) buildTextures(renderer); };
  img.src = `/textures/siege/${name}.webp`;
}

/** Draws a photo over the tile, tinted by multiplying a colour into it. */
function tinted(x, img, tint, { rotate = false, alpha = 1, rect = [0, 0, TEX, TEX] } = {}) {
  const [rx, ry, rw, rh] = rect;
  x.save();
  x.beginPath(); x.rect(rx, ry, rw, rh); x.clip();
  if (img) {
    x.globalAlpha = alpha;
    if (rotate) { x.translate(rx + rw / 2, ry + rh / 2); x.rotate(Math.PI / 2); x.drawImage(img, -rh / 2, -rw / 2, rh, rw); x.setTransform(1, 0, 0, 1, 0, 0); }
    else x.drawImage(img, rx, ry, rw, rh);
    x.globalAlpha = 1;
  }
  x.globalCompositeOperation = img ? 'multiply' : 'source-over';
  x.fillStyle = tint;
  x.fillRect(rx, ry, rw, rh);
  x.restore();
}

/** Upper plaster, chair rail, wainscot panels and a skirting board. */
function paintPlaster(x) {
  tinted(x, photos.plaster, '#e3d2b2', { rect: [0, 0, TEX, 74] });
  // a faint damask stripe, the lodge's wallpaper
  for (let i = 0; i < TEX; i += 32) { x.fillStyle = 'rgba(120,80,40,0.045)'; x.fillRect(i + 10, 0, 12, 73); }
  tinted(x, photos.wood, '#9c6a42', { rotate: true, rect: [0, 78, TEX, 44] });
  x.strokeStyle = 'rgba(30,18,10,0.55)'; x.lineWidth = 2;
  for (let i = 0; i < 2; i++) x.strokeRect(i * 64 + 7, 84, 50, 32);
  x.fillStyle = 'rgba(255,230,190,0.18)'; for (let i = 0; i < 2; i++) x.fillRect(i * 64 + 8, 85, 48, 1);
  x.fillStyle = '#4b301c'; x.fillRect(0, 73, TEX, 6);
  x.fillStyle = 'rgba(255,220,170,0.35)'; x.fillRect(0, 73, TEX, 1);
  x.fillStyle = '#2a1a10'; x.fillRect(0, 121, TEX, 7);
}

/** Round logs with dark seams between them. */
function paintLog(x) {
  tinted(x, photos.wood, '#c89262');
  for (let y = 0; y < TEX; y += 16) {
    const g = x.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, 'rgba(255,225,180,0.22)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,10,4,0.45)');
    x.fillStyle = g; x.fillRect(0, y, TEX, 16);
    x.fillStyle = 'rgba(18,9,4,0.8)'; x.fillRect(0, y + 15, TEX, 1);
  }
  x.fillStyle = '#24160d'; x.fillRect(0, 122, TEX, 6);
}

function paintBrick(x) {
  tinted(x, photos.brick, '#b39c8d');
  x.fillStyle = '#2b2522'; x.fillRect(0, 122, TEX, 6);
}

/** A window in any wall: frame, mullions, snow and pines outside. */
function paintWindow(x) {
  const [x0, y0, w, h] = [22, 16, 84, 76];
  x.fillStyle = '#3a2618'; x.fillRect(x0 - 6, y0 - 6, w + 12, h + 14);
  const sky = x.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, '#dcebf6'); sky.addColorStop(0.55, '#f3f7fa'); sky.addColorStop(1, '#ffffff');
  x.fillStyle = sky; x.fillRect(x0, y0, w, h);
  x.fillStyle = '#9fb3c2';
  for (let i = 0; i < 6; i++) {
    const px = x0 + 6 + i * 15 + (i % 2) * 4, ph = 22 + (i * 7) % 16;
    x.beginPath(); x.moveTo(px, y0 + h - 12 - ph); x.lineTo(px - 8, y0 + h - 12); x.lineTo(px + 8, y0 + h - 12); x.closePath(); x.fill();
  }
  x.fillStyle = '#ffffff'; x.fillRect(x0, y0 + h - 12, w, 12);
  x.fillStyle = '#3a2618';
  x.fillRect(x0 + w / 2 - 2, y0, 4, h); x.fillRect(x0, y0 + h * 0.45 - 2, w, 4);
  x.fillStyle = '#5a3d27'; x.fillRect(x0 - 8, y0 + h + 4, w + 16, 5);
  x.fillStyle = '#f7fbff'; x.fillRect(x0 - 6, y0 + h + 2, w + 12, 3);
}

/** A brass sconce with its warm pool of light, baked into the wall. */
function paintLamp(x) {
  const glow = x.createRadialGradient(64, 36, 2, 64, 36, 58);
  glow.addColorStop(0, 'rgba(255,214,150,0.95)'); glow.addColorStop(0.35, 'rgba(255,196,120,0.4)'); glow.addColorStop(1, 'rgba(255,190,110,0)');
  x.globalCompositeOperation = 'screen'; x.fillStyle = glow; x.fillRect(0, 0, TEX, 96); x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#6d5327'; x.fillRect(60, 40, 8, 12);
  x.fillStyle = '#fff1cf';
  x.beginPath(); x.moveTo(52, 38); x.lineTo(76, 38); x.lineTo(71, 24); x.lineTo(57, 24); x.closePath(); x.fill();
}

function paintBarricade(x) {
  x.fillStyle = '#0c0c0f'; x.fillRect(0, 0, TEX, TEX);
  x.fillStyle = '#3a2618'; x.fillRect(0, 0, 7, TEX); x.fillRect(TEX - 7, 0, 7, TEX);
  [[8, 22], [30, 48], [55, 72], [80, 97], [104, 120]].forEach(([a, b], i) => {
    tinted(x, photos.wood, i % 2 ? '#c49a6a' : '#d4a978', { rect: [2, a + (i % 2), TEX - 4, b - a] });
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(2, b + (i % 2) - 2, TEX - 4, 2);
    x.fillStyle = '#c9c4b8'; x.fillRect(10, a + 5, 3, 3); x.fillRect(TEX - 13, a + 5, 3, 3);
  });
}

function paintSteel(x) {
  const grad = x.createLinearGradient(0, 0, TEX, 0);
  grad.addColorStop(0, '#3c4b51'); grad.addColorStop(0.45, '#9ea3a0'); grad.addColorStop(1, '#35414b');
  x.fillStyle = grad; x.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 8; i++) { x.fillStyle = '#1f2c37'; x.fillRect(i * 16, 0, 3, TEX); x.fillStyle = '#aab0ac'; x.fillRect(i * 16 + 3, 0, 1, TEX); }
  x.fillStyle = '#805934'; x.fillRect(0, 33, TEX, 8); x.fillRect(0, 91, TEX, 8);
  x.fillStyle = '#ded2a0'; for (let i = 0; i < 7; i++) { x.fillRect(i * 20 + 6, 36, 2, 2); x.fillRect(i * 20 + 6, 94, 2, 2); }
  x.fillStyle = '#e0b94a'; x.fillRect(0, 0, TEX, 5); x.fillRect(0, TEX - 5, TEX, 5);
  x.fillStyle = '#1b1b1b'; for (let i = 0; i < TEX; i += 12) { x.fillRect(i, 0, 6, 5); x.fillRect(i + 6, TEX - 5, 6, 5); }
}

const PAINT = {
  floor: (x) => { tinted(x, photos.wood, '#a8784e'); x.fillStyle = 'rgba(255,220,170,0.08)'; x.fillRect(0, 0, TEX, TEX); },
  ceiling: (x) => tinted(x, photos.wood, '#7e5f45'),
  plaster: paintPlaster,
  log: paintLog,
  brick: paintBrick,
  barricade: paintBarricade,
  steel: paintSteel,
  'plaster-window': (x) => { paintPlaster(x); paintWindow(x); },
  'log-window': (x) => { paintLog(x); paintWindow(x); },
  'brick-window': (x) => { paintBrick(x); paintWindow(x); },
  'plaster-lamp': (x) => { paintPlaster(x); paintLamp(x); },
  'log-lamp': (x) => { paintLog(x); paintLamp(x); },
};

function buildTextures(r) {
  const c = document.createElement('canvas'); c.width = c.height = TEX;
  const x = c.getContext('2d', { willReadFrequently: true });
  for (const [name, paint] of Object.entries(PAINT)) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, TEX, TEX);
    paint(x);
    r.textures[name] = x.getImageData(0, 0, TEX, TEX).data;
  }
}

function makeRenderer() {
  const canvas = document.createElement('canvas'); canvas.width = RW; canvas.height = RH;
  const ctx = canvas.getContext('2d', { alpha: false });
  const r = {
    canvas, ctx, textures: {}, frame: ctx.createImageData(RW, RH), depth: new Float32Array(RW),
    lo: new Int16Array(RW), hi: new Int16Array(RW), hits: new Array(RW),
  };
  ['plaster', 'wood', 'brick'].forEach(loadPhoto);
  buildTextures(r);
  return r;
}

// ================================================================== the lodge, ray-cast

function cast(x, y, dx, dy, breached) {
  let mx = Math.floor(x), my = Math.floor(y), side = 0, type = 1;
  const ddx = Math.abs(1 / (dx || 1e-8)), ddy = Math.abs(1 / (dy || 1e-8));
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let tx = (dx < 0 ? x - mx : mx + 1 - x) * ddx, ty = (dy < 0 ? y - my : my + 1 - y) * ddy;
  for (let i = 0; i < 64; i++) {
    if (tx < ty) { tx += ddx; mx += sx; side = 0; } else { ty += ddy; my += sy; side = 1; }
    type = siegeCell(mx, my, breached);
    if (type) break;
  }
  const distance = Math.max(0.04, side ? ty - ddy : tx - ddx);
  const hit = side ? x + distance * dx : y + distance * dy;
  return { distance, u: hit - Math.floor(hit), side, type, mx, my };
}

const BASE = { 1: 'plaster', 2: 'log', 3: 'brick', 4: 'barricade', 5: 'steel' };
/** Which picture a wall face gets: outside walls have windows, inside walls sconces. */
function wallTexture(hit) {
  const base = BASE[hit.type] ?? 'plaster';
  if (hit.type > 3) return base;
  const outside = hit.mx === 0 || hit.my === 0 || hit.mx === MAP_W - 1 || hit.my === MAP_H - 1;
  const h = hash(hit.mx * 31.7 + hit.my * 17.3 + hit.side * 5.1);
  if (outside && h < 0.5) return `${base}-window`;
  if (!outside && hit.type !== 3 && h < 0.28) return `${base}-lamp`;
  return base;
}

function world(ctx, g, s) {
  renderer ??= makeRenderer();
  const r = renderer, data = r.frame.data, T = r.textures;
  const drone = s.drone && !g.dead;
  const px = drone ? 7 + Math.sin(s.timer * 0.5) * 0.8 : s.x;
  const py = drone ? 3.5 + Math.sin(s.timer * 0.4) : s.y;
  const angle = drone ? 0.13 + Math.sin(s.timer * 0.45) * 0.25 : g.view.yaw;
  const fov = Math.tan(0.66 - (s.ads ?? 0) * 0.1);
  const dx = Math.cos(angle), dy = Math.sin(angle), planeX = -dy * fov, planeY = dx * fov;
  const eye = drone ? 0.14 : 0.54;
  const bob = Math.sin(g.clock * 8) * (s.movement ?? 0) * 2;
  const horizon = Math.round(RH / 2 + (g.view.pitch ?? 0) * 140 + bob);
  const projection = RW / 2 / fov;
  const floorT = T.floor, ceilT = T.ceiling;
  // walls first: where they stand, the floor and ceiling need not be worked out
  const { lo, hi, hits } = r;
  for (let x = 0; x < RW; x++) {
    const camera = 2 * x / RW - 1;
    const hit = cast(px, py, dx + planeX * camera, dy + planeY * camera, s.breached);
    hits[x] = hit;
    r.depth[x] = hit.distance;
    const wallH = projection / hit.distance, top = horizon - wallH * (1 - eye);
    lo[x] = Math.max(0, Math.floor(top)); hi[x] = Math.min(RH, Math.ceil(top + wallH));
  }
  // floor and ceiling, with the lamps' light pooled under them
  for (let y = 0; y < RH; y++) {
    const floor = y > horizon;
    const distance = (floor ? eye : 1 - eye) * projection / Math.max(1, Math.abs(y - horizon));
    const stepX = distance * 2 * planeX / RW, stepY = distance * 2 * planeY / RW;
    let fx = px + distance * (dx - planeX), fy = py + distance * (dy - planeY);
    const light = Math.max(0.14, (floor ? 0.72 : 0.5) - distance * 0.03);
    const tex = floor ? floorT : ceilT;
    for (let x = 0; x < RW; x++, fx += stepX, fy += stepY) {
      if (y >= lo[x] && y < hi[x]) continue;
      const u = (fx * 48) & 127, v = (fy * 48) & 127, ti = (v * TEX + u) * 4;
      const at = (y * RW + x) * 4;
      const lx = fx - Math.floor(fx / 3) * 3 - 1.5, ly = fy - Math.floor(fy / 3) * 3 - 1.5;
      const d2 = lx * lx + ly * ly;
      const pool = d2 < 1.6 ? (1 - d2 / 1.6) * (1 - d2 / 1.6) : 0;
      // ceiling lamps hang over every third cell; their light pools on the floor below
      let k = light, wr = 1, wg = 0.93, wb = 0.86;
      if (floor) {
        k += pool * 0.55;
        // a rug down the long hall
        if (fy > 8.25 && fy < 10.75 && fx > 4.6 && fx < 12.4) {
          const edge = fy < 8.4 || fy > 10.6 || fx < 4.75 || fx > 12.25;
          if (edge) { wr = 0.95; wg = 0.78; wb = 0.4; } else { wr = 0.62; wg = 0.24; wb = 0.2; }
        }
      } else {
        // beams, and the lamps themselves
        if (Math.abs(lx) > 1.36 || Math.abs(fy % 4) < 0.1) k *= 0.45;
        if (pool > 0.93) { data[at] = 255; data[at + 1] = 240; data[at + 2] = 205; data[at + 3] = 255; continue; }
        k += pool * 0.4;
      }
      data[at] = Math.min(255, tex[ti] * k * wr * 1.02);
      data[at + 1] = Math.min(255, tex[ti + 1] * k * wg);
      data[at + 2] = Math.min(255, tex[ti + 2] * k * wb);
      data[at + 3] = 255;
    }
  }
  // the walls
  for (let x = 0; x < RW; x++) {
    const hit = hits[x];
    const wallH = projection / hit.distance, top = horizon - wallH * (1 - eye);
    const tex = T[wallTexture(hit)] ?? T.plaster;
    const tx = Math.floor(hit.u * TEX) & 127;
    const light = Math.max(0.2, 1.04 - hit.distance * 0.06) * (hit.side ? 0.8 : 1);
    for (let y = lo[x]; y < hi[x]; y++) {
      const ty = Math.min(127, Math.max(0, Math.floor((y - top) / wallH * TEX)));
      const ti = (ty * TEX + tx) * 4, at = (y * RW + x) * 4;
      data[at] = Math.min(255, tex[ti] * light);
      data[at + 1] = Math.min(255, tex[ti + 1] * light + Math.max(0, 4 - hit.distance));
      data[at + 2] = Math.min(255, tex[ti + 2] * light + Math.max(0, 10 - hit.distance * 2));
      data[at + 3] = 255;
    }
  }
  r.ctx.putImageData(r.frame, 0, 0);
  const camera = { px, py, angle, eye, projection: projection * 2, horizon: horizon * 2, depth: r.depth, lean: s.lean ?? 0 };
  withLean(ctx, camera, () => {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(r.canvas, 0, 0, W, H);
  });
  return camera;
}

/** The view tilts when it leans: the world and what stands in it tilt together. */
function withLean(ctx, camera, draw) {
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(camera.lean * -0.028); ctx.scale(1.025, 1.025); ctx.translate(-W / 2, -H / 2);
  draw();
  ctx.restore();
}

// ================================================================== a little 3D: lit boxes

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2]];
const LIGHT = unit([-0.35, 0.8, -0.5]);

const RGB = new Map();
function rgb(hex) {
  let c = RGB.get(hex);
  if (!c) { const n = parseInt(hex.slice(1, 7), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(hex, c); }
  return c;
}

/** An axis-aligned box. `glow` lifts it above the lighting (screens, LEDs, visors). */
function box(x0, y0, z0, x1, y1, z1, color, glow = 0) {
  return { v: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color, glow };
}
/** A box from a to b, `w` by `d` across: limbs, barrels, magazines. */
function limb(a, b, w, d, color, glow = 0) {
  const u = unit(sub(b, a));
  let v = cross(u, [0, 1, 0]);
  if (Math.hypot(...v) < 1e-3) v = cross(u, [1, 0, 0]);
  v = unit(v);
  const t = cross(v, u);
  const c = (p, sv, st) => add(p, add(mul(v, sv * w / 2), mul(t, st * d / 2)));
  return { v: [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)], color, glow };
}

function clipNear(pts, near) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ain = a[2] >= near, bin = b[2] >= near;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (near - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]); }
  }
  return out;
}

/**
 * Projects parts through `toCam` (model space → camera space: x right, y up,
 * z forward), culls, lights and sorts their faces. Returns the polygons and
 * their screen extent, so the caller can clip them before drawing.
 */
function project(parts, toCam, { cx = W / 2, cy = H / 2, f, near = 0.03, dim = 1 }) {
  const polys = [];
  let x0 = Infinity, x1 = -Infinity, zMin = Infinity;
  for (const part of parts) {
    const cam = part.v.map(toCam);
    const mid = mul(cam.reduce(add, [0, 0, 0]), 1 / 8);
    const [r, g, b] = rgb(part.color);
    for (const face of FACES) {
      let pts = face.map((i) => cam[i]);
      let n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
      const fc = mul(add(pts[0], pts[2]), 0.5);
      if (dot(n, sub(fc, mid)) < 0) n = mul(n, -1);
      if (dot(n, fc) >= 0) continue;
      pts = clipNear(pts, near);
      if (pts.length < 3) continue;
      const nl = unit(n);
      const k = (0.36 + 0.64 * Math.max(0, dot(nl, LIGHT))) * dim + part.glow;
      const screen = pts.map((p) => [cx + p[0] / p[2] * f, cy - p[1] / p[2] * f]);
      for (const p of screen) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; }
      for (const p of pts) if (p[2] < zMin) zMin = p[2];
      polys.push({ screen, z: pts.reduce((a, p) => a + p[2], 0) / pts.length, fill: `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})` });
    }
  }
  polys.sort((a, b) => b.z - a.z);
  return { polys, x0, x1, zMin };
}

function paint(ctx, polys) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.8;
  for (const p of polys) {
    ctx.beginPath();
    ctx.moveTo(p.screen[0][0], p.screen[0][1]);
    for (let i = 1; i < p.screen.length; i++) ctx.lineTo(p.screen[i][0], p.screen[i][1]);
    ctx.closePath();
    ctx.fillStyle = p.fill; ctx.fill();
    // the same colour round the edge closes the hairline seams between faces
    ctx.strokeStyle = p.fill; ctx.stroke();
  }
}

/** A model standing in the lodge, hidden behind any wall nearer than it. */
function placeInWorld(ctx, camera, parts, wx, wz, rot) {
  const c = Math.cos(camera.angle), s = Math.sin(camera.angle), rc = Math.cos(rot), rs = Math.sin(rot);
  const toCam = (p) => {
    const X = wx + p[2] * rc - p[0] * rs - camera.px, Z = wz + p[2] * rs + p[0] * rc - camera.py;
    return [-X * s + Z * c, p[1] - camera.eye, X * c + Z * s];
  };
  const out = project(parts, toCam, { cy: camera.horizon, f: camera.projection, near: 0.05 });
  if (!out.polys.length || out.x1 < 0 || out.x0 > W) return out;
  ctx.save();
  ctx.beginPath();
  let start = -1;
  const c0 = Math.max(0, Math.floor(out.x0 / 2)), c1 = Math.min(RW - 1, Math.ceil(out.x1 / 2));
  for (let col = c0; col <= c1 + 1; col++) {
    const open = col <= c1 && camera.depth[col] > out.zMin - 0.02;
    if (open && start < 0) start = col;
    if (!open && start >= 0) { ctx.rect(start * 2, 0, (col - start) * 2, H); start = -1; }
  }
  ctx.clip();
  paint(ctx, out.polys);
  ctx.restore();
  return out;
}

// ================================================================== furniture and bombs

function seeded(i) { return hash(i * 7.31 + 2.1); }

const MODELS = {
  rack: () => [
    box(-0.11, 0, -0.15, 0.11, 0.72, 0.15, '#1a2129'),
    box(-0.1, 0.03, 0.15, 0.1, 0.69, 0.16, '#28333d'),
    ...Array.from({ length: 9 }, (_, i) => box(-0.085, 0.07 + i * 0.07, 0.16, 0.085, 0.1 + i * 0.07, 0.165, '#11171d')),
    ...Array.from({ length: 9 }, (_, i) => box(0.05, 0.08 + i * 0.07, 0.165, 0.07, 0.09 + i * 0.07, 0.17, i % 3 ? '#48c7d4' : '#9be27f', 0.9)),
  ],
  shelf: (seed) => {
    const parts = [box(-0.2, 0, -0.06, 0.2, 0.74, 0.06, '#5b3d26'), box(-0.185, 0.02, -0.05, 0.185, 0.72, 0.061, '#2a1b11')];
    for (let row = 0; row < 4; row++) {
      const y = 0.03 + row * 0.18;
      parts.push(box(-0.19, y - 0.012, -0.05, 0.19, y, 0.062, '#6b4a30'));
      let x = -0.18;
      for (let i = 0; x < 0.16 && i < 14; i++) {
        const w = 0.018 + seeded(seed * 50 + row * 13 + i) * 0.02, h = 0.1 + seeded(seed * 70 + row * 7 + i) * 0.05;
        const col = ['#7c2d2a', '#2f4f6b', '#6a5a2a', '#3e5a3a', '#8a6a3a', '#4a2f55', '#b8a88a'][Math.floor(seeded(seed * 90 + row * 11 + i) * 7)];
        parts.push(box(x, y, -0.035, x + w, y + h, 0.045, col));
        x += w + 0.004;
      }
    }
    return parts;
  },
  desk: () => [
    box(-0.24, 0.26, -0.12, 0.24, 0.285, 0.12, '#6b4a30'),
    ...[[-0.22, -0.1], [0.2, -0.1], [-0.22, 0.08], [0.2, 0.08]].map(([x, z]) => box(x, 0, z, x + 0.025, 0.26, z + 0.025, '#3e2b1c')),
    box(-0.02, 0.285, -0.02, 0.02, 0.33, 0.02, '#14181c'),
    box(-0.12, 0.33, -0.01, 0.12, 0.47, 0.01, '#14181c'),
    box(-0.11, 0.34, 0.01, 0.11, 0.46, 0.014, '#2d6b8a', 0.8),
    box(-0.1, 0.285, 0.05, 0.1, 0.292, 0.1, '#1c2126'),
  ],
  table: () => [
    box(-0.2, 0.24, -0.15, 0.2, 0.265, 0.15, '#5e3f28'),
    box(-0.03, 0, -0.03, 0.03, 0.24, 0.03, '#3a2718'),
    box(-0.12, 0, -0.1, 0.12, 0.02, 0.1, '#3a2718'),
    ...[[-0.3, 0], [0.3, 0]].flatMap(([x]) => [
      box(x - 0.07, 0.15, -0.07, x + 0.07, 0.17, 0.07, '#7a2f24'),
      box(x - 0.06, 0, -0.06, x - 0.045, 0.15, -0.045, '#3a2718'), box(x + 0.045, 0, 0.045, x + 0.06, 0.15, 0.06, '#3a2718'),
      box(x + (x < 0 ? -0.07 : 0.055), 0.17, -0.07, x + (x < 0 ? -0.055 : 0.07), 0.36, 0.07, '#5e3f28'),
    ]),
  ],
  sofa: () => [
    box(-0.32, 0.03, -0.14, 0.32, 0.16, 0.14, '#7a3b2c'),
    box(-0.32, 0.16, -0.14, 0.32, 0.34, -0.06, '#6e3426'),
    box(-0.36, 0.03, -0.14, -0.3, 0.24, 0.14, '#632e22'),
    box(0.3, 0.03, -0.14, 0.36, 0.24, 0.14, '#632e22'),
    box(-0.28, 0.16, -0.06, -0.01, 0.2, 0.13, '#8a4533'), box(0.01, 0.16, -0.06, 0.28, 0.2, 0.13, '#8a4533'),
    box(-0.34, 0, -0.12, 0.34, 0.03, 0.12, '#2a1810'),
  ],
  armchair: () => [
    box(-0.15, 0.03, -0.14, 0.15, 0.16, 0.14, '#3f5a4a'),
    box(-0.15, 0.16, -0.14, 0.15, 0.36, -0.07, '#35503f'),
    box(-0.19, 0.03, -0.14, -0.13, 0.24, 0.14, '#2f4637'), box(0.13, 0.03, -0.14, 0.19, 0.24, 0.14, '#2f4637'),
  ],
  plant: () => [
    box(-0.06, 0, -0.06, 0.06, 0.12, 0.06, '#8a5a3a'),
    ...Array.from({ length: 7 }, (_, i) => {
      const a = i / 7 * TAU;
      return limb([0, 0.1, 0], [Math.cos(a) * 0.11, 0.26 + (i % 3) * 0.05, Math.sin(a) * 0.11], 0.05, 0.012, i % 2 ? '#3f7a3a' : '#4f8f45');
    }),
  ],
  crate: () => [
    box(-0.13, 0, -0.13, 0.13, 0.24, 0.13, '#7d6441'),
    box(-0.135, 0, -0.135, -0.11, 0.24, 0.135, '#5a4529'), box(0.11, 0, -0.135, 0.135, 0.24, 0.135, '#5a4529'),
    box(-0.1, 0.24, -0.1, 0.12, 0.42, 0.12, '#86704b'),
  ],
  fireplace: () => [
    box(-0.3, 0, -0.08, 0.3, 0.62, 0.08, '#6f6760'),
    box(-0.18, 0.04, 0.0, 0.18, 0.3, 0.081, '#120c09'),
    box(-0.14, 0.05, 0.03, 0.14, 0.1, 0.082, '#ff8a2a', 0.9),
    box(-0.36, 0.62, -0.1, 0.36, 0.66, 0.12, '#4b301c'),
  ],
  pool: () => [
    box(-0.36, 0.22, -0.2, 0.36, 0.26, 0.2, '#2f6b3a'),
    box(-0.38, 0.19, -0.22, 0.38, 0.27, -0.2, '#4b2d1a'), box(-0.38, 0.19, 0.2, 0.38, 0.27, 0.22, '#4b2d1a'),
    box(-0.38, 0.19, -0.22, -0.36, 0.27, 0.22, '#4b2d1a'), box(0.36, 0.19, -0.22, 0.38, 0.27, 0.22, '#4b2d1a'),
    ...[[-0.32, -0.16], [0.3, -0.16], [-0.32, 0.14], [0.3, 0.14]].map(([x, z]) => box(x, 0, z, x + 0.04, 0.19, z + 0.04, '#3a2214')),
  ],
  /** The bomb: the thing everybody is here for. */
  bomb: (t = 0, planted = false) => [
    box(-0.07, 0, -0.07, 0.07, 0.16, 0.07, '#3b4147'),
    box(-0.075, 0.03, -0.075, 0.075, 0.05, 0.075, '#d8b030'),
    box(-0.075, 0.1, -0.075, 0.075, 0.12, 0.075, '#d8b030'),
    box(-0.05, 0.16, -0.05, 0.05, 0.2, 0.05, '#23282d'),
    box(-0.012, 0.2, -0.012, 0.012, 0.215, 0.012, Math.sin(t * (planted ? 16 : 5)) > 0 ? '#ff4136' : '#5a1a16', Math.sin(t * (planted ? 16 : 5)) > 0 ? 1.2 : 0),
  ],
};

/** Where things stand: [model, x, y, facing]. Facing is the way its front looks. */
const FURNITURE = [
  ['shelf', 2.1, 1.1, Math.PI / 2, 1], ['shelf', 3.2, 1.1, Math.PI / 2, 2], ['shelf', 7.0, 1.1, Math.PI / 2, 3], ['shelf', 8.1, 1.1, Math.PI / 2, 4],
  ['table', 3.2, 3.4, 0], ['plant', 1.4, 4.5, 0],
  ['rack', 11.0, 1.2, Math.PI / 2], ['rack', 11.8, 1.2, Math.PI / 2], ['rack', 15.2, 1.2, Math.PI / 2], ['rack', 16.0, 1.2, Math.PI / 2],
  ['desk', 16.6, 4.6, Math.PI], ['plant', 10.4, 6.5, 0],
  ['sofa', 2.2, 6.3, Math.PI / 2], ['fireplace', 1.1, 8.9, 0], ['armchair', 2.0, 7.9, 0.3], ['desk', 7.1, 8.2, Math.PI / 2],
  ['plant', 8.6, 6.3, 0], ['plant', 16.5, 8.4, 0], ['table', 15.1, 9.3, 0.2],
  ['crate', 1.7, 12.6, 0.2], ['crate', 2.3, 14.3, -0.3], ['crate', 7.6, 14.3, 0.1],
  ['pool', 13.4, 13.2, 0], ['armchair', 16.3, 12.5, Math.PI],
];
/** Two bombs on the site, like the game: A and B. */
const BOMBS = [{ x: 14.1, y: 3.2, site: 0 }, { x: 5.6, y: 2.3, site: 1 }];
const MODEL_CACHE = new Map();
function furniture(kind, seed = 0) {
  const key = `${kind}:${seed}`;
  let parts = MODEL_CACHE.get(key);
  if (!parts) { parts = MODELS[kind](seed); MODEL_CACHE.set(key, parts); }
  return parts;
}

function drawRoom(ctx, g, s, camera) {
  const things = FURNITURE.map(([kind, x, y, rot, seed]) => ({ parts: furniture(kind, seed), x, y, rot }));
  for (const b of BOMBS) things.push({ parts: MODELS.bomb(g.clock + b.site, s.phase === 'planted' && s.site === SIEGE_SITES[b.site]), x: b.x, y: b.y, rot: 0.4 });
  const cos = Math.cos(camera.angle), sin = Math.sin(camera.angle);
  const visible = things
    .map((t) => ({ ...t, d: (t.x - camera.px) * cos + (t.y - camera.py) * sin }))
    .filter((t) => t.d > 0.12 && t.d < 14)
    .sort((a, b) => b.d - a.d);
  withLean(ctx, camera, () => { for (const t of visible) placeInWorld(ctx, camera, t.parts, t.x, t.y, t.rot); });
}

// ================================================================== operators

/** A whole operator, about 0.62 of a wall tall, facing +z, rifle up. */
const SUITS = ['#3a3f35', '#393c40', '#4a4238', '#383a45', '#3d4139', '#2b3339'];
function operatorModel({ color = '#52616b', team = ORANGE, step = 0, aim = 1, lean = 0, suit = '#2b3339' } = {}) {
  const dark = '#1a1f24', gear = '#5a5646';
  const leg = (side) => {
    const sw = Math.sin(step) * 0.05 * side;
    return [
      limb([side * 0.04, 0.31, 0], [side * 0.045, 0.16, sw], 0.075, 0.08, suit),
      limb([side * 0.045, 0.16, sw], [side * 0.045, 0.03, sw * 0.4 - 0.01], 0.065, 0.07, suit),
      box(side * 0.045 - 0.036, 0.13, sw + 0.03, side * 0.045 + 0.036, 0.2, sw + 0.05, dark),
      box(side * 0.045 - 0.035, 0, sw * 0.4 - 0.04, side * 0.045 + 0.035, 0.035, sw * 0.4 + 0.07, '#111417'),
    ];
  };
  const hand = [0.02, 0.43 - (1 - aim) * 0.08, 0.2 + aim * 0.02];
  const parts = [
    ...leg(1), ...leg(-1),
    box(-0.085, 0.29, -0.055, 0.085, 0.51, 0.055, suit),
    box(-0.08, 0.32, 0.05, 0.08, 0.5, 0.075, gear),
    box(-0.07, 0.34, 0.075, -0.02, 0.4, 0.09, dark), box(0.02, 0.34, 0.075, 0.07, 0.4, 0.09, dark),
    box(-0.09, 0.28, -0.06, 0.09, 0.31, 0.06, dark),
    box(-0.1, 0.46, -0.05, -0.06, 0.52, 0.05, color), box(0.06, 0.46, -0.05, 0.1, 0.52, 0.05, color),
    box(-0.032, 0.51, -0.03, 0.032, 0.54, 0.03, dark),
    box(-0.038, 0.535, -0.04, 0.038, 0.61, 0.04, '#23282c'),
    box(-0.044, 0.575, -0.046, 0.044, 0.625, 0.046, color),
    box(-0.034, 0.56, 0.038, 0.034, 0.585, 0.05, '#7fd4e6', 0.55),
    limb([0.095, 0.48, 0], [0.085, 0.4, 0.09], 0.05, 0.05, suit),
    limb([0.085, 0.4, 0.09], hand, 0.045, 0.045, suit),
    box(0.075, 0.43, -0.02, 0.1, 0.46, 0.03, team, 0.35),
    limb([-0.095, 0.48, 0], [-0.08, 0.41, 0.11], 0.05, 0.05, suit),
    limb([-0.08, 0.41, 0.11], [-0.01, 0.44 - (1 - aim) * 0.08, 0.3], 0.045, 0.045, suit),
    limb([0.0, 0.44 - (1 - aim) * 0.08, 0.06], [0.0, 0.45 - (1 - aim) * 0.12, 0.4], 0.032, 0.05, '#15191c'),
    limb([0.0, 0.43 - (1 - aim) * 0.08, 0.16], [0.0, 0.36 - (1 - aim) * 0.08, 0.19], 0.022, 0.05, '#2a2e33'),
    box(-0.012, 0.47 - (1 - aim) * 0.08, 0.1, 0.012, 0.49 - (1 - aim) * 0.08, 0.16, '#101316'),
  ];
  if (!lean) return parts;
  // lean from the hips: rotate everything above them about the forward axis
  const c = Math.cos(lean), s = Math.sin(lean);
  return parts.map((p) => ({ ...p, v: p.v.map(([x, y, z]) => (y > 0.28 ? [x * c - (y - 0.28) * s, 0.28 + x * s + (y - 0.28) * c, z] : [x, y, z])) }));
}

function drawEnemy(ctx, g, camera) {
  const e = g.enemy;
  if (!e || g.dead) return;
  const rel = wrap(e.bearing - camera.angle);
  if (Math.abs(rel) > 1.1) return;
  const col = Math.max(0, Math.min(RW - 1, Math.round(RW / 2 + Math.tan(rel) * camera.projection / 2)));
  const dist = Math.max(0.9, Math.min(3.6, camera.depth[col] * 0.78));
  const dir = camera.angle + rel;
  const x = camera.px + Math.cos(dir) * dist, y = camera.py + Math.sin(dir) * dist;
  const lean = Math.sin(e.t * 0.9 + e.bearing * 3) * 0.22;
  const suit = SUITS[Math.floor(hash(e.name?.length ?? 3) * SUITS.length)];
  const parts = operatorModel({ color: e.operator?.color ?? '#6d7a6f', team: ORANGE, step: g.clock * 7 * clamp01(Math.abs(e.vb ?? 0) * 3), aim: 1, lean, suit });
  let out;
  withLean(ctx, camera, () => { out = placeInWorld(ctx, camera, parts, x, y, dir + Math.PI); });
  if (!out?.polys.length) return;
  // their muzzle, when they fire
  if (e.t % 0.38 < 0.055) {
    const cx = (out.x0 + out.x1) / 2, cy = camera.horizon - (0.45 - camera.eye) / dist * camera.projection;
    const r = 26 / dist;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
    glow.addColorStop(0, 'rgba(255,240,200,0.95)'); glow.addColorStop(0.3, 'rgba(255,190,90,0.6)'); glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
  }
  if (e.hitFlash > 0.4) {
    ctx.strokeStyle = '#f5f3ea'; ctx.lineWidth = 2.5;
    for (const [a, b] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) { ctx.beginPath(); ctx.moveTo(W / 2 + a * 9, H / 2 + b * 9); ctx.lineTo(W / 2 + a * 18, H / 2 + b * 18); ctx.stroke(); }
  }
}

// ================================================================== its rifle

const VIEW_F = 820;
const SIGHT_Y = 0.0815;

function rifle(s, magDrop) {
  const tan = '#8f7d5d', metal = '#2d3237', black = '#1b1e22';
  const sleeve = s.operator?.color ?? '#5b6b78';
  return [
    box(-0.021, 0.005, -0.1, 0.021, 0.042, 0.17, metal),
    box(-0.019, -0.035, -0.08, 0.019, 0.005, 0.1, '#25292e'),
    limb([0, -0.03 - magDrop, 0.058], [0, -0.17 - magDrop, 0.1], 0.028, 0.062, tan),
    limb([0, -0.03, -0.055], [0, -0.115, -0.088], 0.028, 0.036, black),
    box(-0.02, -0.05, -0.36, 0.02, 0.03, -0.18, '#262a2f'),
    limb([0, 0.022, -0.1], [0, 0.022, -0.2], 0.03, 0.03, black),
    box(-0.026, -0.022, 0.17, 0.026, 0.04, 0.44, tan),
    ...Array.from({ length: 5 }, (_, i) => box(-0.027, -0.004, 0.2 + i * 0.045, 0.027, 0.018, 0.22 + i * 0.045, '#6f6048')),
    box(-0.012, 0.042, -0.08, 0.012, 0.05, 0.43, black),
    limb([0, 0.012, 0.44], [0, 0.012, 0.6], 0.017, 0.017, black),
    limb([0, 0.012, 0.58], [0, 0.012, 0.665], 0.028, 0.028, '#23272b'),
    // the holographic sight: a base and a window frame
    box(-0.02, 0.05, 0.0, 0.02, 0.058, 0.08, black),
    box(-0.031, 0.05, 0.005, -0.022, 0.108, 0.07, '#22262a'),
    box(0.022, 0.05, 0.005, 0.031, 0.108, 0.07, '#22262a'),
    box(-0.031, 0.105, 0.005, 0.031, 0.114, 0.07, '#2a2f34'),
    // details: charging handle, ejection port, a vertical grip, front sight
    box(-0.03, 0.03, -0.095, 0.03, 0.04, -0.075, black),
    box(0.021, 0.01, 0.02, 0.023, 0.03, 0.09, '#0e1012'),
    limb([0, -0.022, 0.32], [0, -0.1, 0.33], 0.024, 0.03, black),
    box(-0.006, 0.04, 0.4, 0.006, 0.075, 0.415, black),
    // hands and sleeves: the right on the pistol grip, the left round the vertical grip
    limb([0.0, -0.035, -0.058], [0.0, -0.105, -0.085], 0.052, 0.05, '#2c3032'),
    limb([0.01, -0.09, -0.1], [0.1, -0.2, -0.34], 0.06, 0.06, sleeve),
    limb([0, -0.03, 0.305], [0, -0.095, 0.325], 0.048, 0.05, '#2c3032'),
    limb([-0.01, -0.08, 0.31], [-0.19, -0.24, -0.02], 0.06, 0.06, sleeve),
  ];
}

function rot3(p, yaw, pitch, roll) {
  let [x, y, z] = p;
  let c = Math.cos(roll), s = Math.sin(roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(pitch); s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(yaw); s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}

const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function weapon(ctx, g, s) {
  const since = g.clock - g.shotAt;
  const kick = since < 0.09 ? 1 - since / 0.09 : 0;
  const a = smoothstep((s.ads ?? 0) / 0.86);
  const reload = s.reload > 0 ? Math.sin((1.35 - s.reload) / 1.35 * Math.PI) : 0;
  const magDrop = s.reload > 0 ? Math.max(0, Math.sin(clamp01((1.35 - s.reload) / 1.1) * Math.PI)) * 0.14 : 0;
  const move = s.movement ?? 0;
  // planting or disabling: the rifle goes down, the hands are busy
  const busy = s.phase === 'planting' ? clamp01(s.plantT / 0.3) : s.defuseT > 0 ? 1 : 0;
  const bobX = Math.sin(g.clock * 7) * move * 0.007 * (1 - a * 0.8);
  const bobY = Math.abs(Math.sin(g.clock * 7)) * move * 0.006 * (1 - a * 0.8);
  // hip: low and to the right, pointing in; aimed: the sight's window on the view's centre
  const pos = [lerp(0.105, 0, a) + bobX, lerp(-0.125, -SIGHT_Y, a) - bobY - reload * 0.05 + kick * 0.004, lerp(0.3, 0.26, a) - kick * 0.02];
  pos[1] -= busy * 0.09;
  const yaw = lerp(-0.13, 0, a), pitch = lerp(0.035, 0, a) + kick * 0.04 - reload * 0.3 - busy * 0.45, roll = lerp(-0.1, 0, a) + reload * 0.55 + (s.lean ?? 0) * 0.2 + busy * 0.3;
  const toCam = (p) => add(rot3(p, yaw, pitch, roll), pos);
  const { polys } = project(rifle(s, magDrop), toCam, { f: VIEW_F, near: 0.02 });
  paint(ctx, polys);

  // the sight's glass, and the red dot where the rifle points, at infinity
  const glass = [[-0.022, 0.058, 0.03], [0.022, 0.058, 0.03], [0.022, 0.105, 0.03], [-0.022, 0.105, 0.03]].map((p) => toCam(p));
  if (glass.every((p) => p[2] > 0.02)) {
    const sc = glass.map((p) => [W / 2 + p[0] / p[2] * VIEW_F, H / 2 - p[1] / p[2] * VIEW_F]);
    const fwd = rot3([0, 0, 1], yaw, pitch, roll);
    const vx = W / 2 + fwd[0] / fwd[2] * VIEW_F, vy = H / 2 - fwd[1] / fwd[2] * VIEW_F;
    ctx.save();
    ctx.beginPath(); sc.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = 'rgba(120,190,215,0.09)'; ctx.fill();
    ctx.clip();
    const tint = ctx.createLinearGradient(sc[0][0], sc[0][1], sc[2][0], sc[2][1]);
    tint.addColorStop(0, 'rgba(255,255,255,0.08)'); tint.addColorStop(0.5, 'rgba(255,255,255,0)'); tint.addColorStop(1, 'rgba(160,220,255,0.06)');
    ctx.fillStyle = tint; ctx.fill();
    ctx.shadowColor = '#ff3b3b'; ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(vx, vy, 16, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ff6a6a'; ctx.beginPath(); ctx.arc(vx, vy, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  if (since < 0.06) {
    const tip = toCam([0, 0.012, 0.67]);
    if (tip[2] > 0.02) {
      const x = W / 2 + tip[0] / tip[2] * VIEW_F, y = H / 2 - tip[1] / tip[2] * VIEW_F;
      const r = 70 + hash(Math.floor(g.shotAt * 100)) * 40;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, 'rgba(255,245,215,0.95)'); glow.addColorStop(0.25, 'rgba(255,196,96,0.7)'); glow.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const ang = i / 10 * TAU + g.shotAt * 7, rr = i % 2 ? r * 0.18 : r * 0.55; ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fill();
    }
  }
  if (a < 0.35) {
    ctx.strokeStyle = '#f3faf0cc'; ctx.lineWidth = 1.6;
    const gap = 5 + kick * 6 + move * 4;
    ctx.beginPath();
    ctx.moveTo(W / 2 - gap - 8, H / 2); ctx.lineTo(W / 2 - gap, H / 2); ctx.moveTo(W / 2 + gap, H / 2); ctx.lineTo(W / 2 + gap + 8, H / 2);
    ctx.moveTo(W / 2, H / 2 - gap - 8); ctx.lineTo(W / 2, H / 2 - gap); ctx.moveTo(W / 2, H / 2 + gap); ctx.lineTo(W / 2, H / 2 + gap + 8);
    ctx.stroke();
    ctx.fillStyle = '#f3faf0'; ctx.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
  }
}

// ================================================================== the rest of the screen

function markers(ctx, camera, s) {
  for (const site of SIEGE_SITES) {
    const c = Math.cos(camera.angle), sn = Math.sin(camera.angle);
    const dx = site.x - camera.px, dz = site.y - camera.py;
    const fwd = dx * c + dz * sn, side = -dx * sn + dz * c;
    if (fwd < 0.2) continue;
    const x = W / 2 + side / fwd * camera.projection;
    if (x < 40 || x > W - 40) continue;
    const y = Math.max(140, Math.min(470, camera.horizon - (0.5 - camera.eye) / fwd * camera.projection - 40));
    const active = site === s.site;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = active ? '#f6d06333' : '#ffffff14'; ctx.fillRect(-14, -14, 28, 28);
    ctx.strokeStyle = active ? '#f6d063' : '#ffffff88'; ctx.lineWidth = 2; ctx.strokeRect(-14, -14, 28, 28);
    ctx.restore();
    text(ctx, site.letter, x, y + 6, { size: 16, weight: 700, align: 'center', color: active ? '#f6d063' : '#ffffffcc' });
    text(ctx, `${Math.round(Math.hypot(dx, dz) * 3)} M`, x, y + 36, { size: 11, align: 'center', color: active ? '#f6d063' : '#ffffffaa', family: MONO });
  }
}

function effects(ctx, g, s) {
  if (s.smoke > 0.01) {
    const life = g.clock - s.breachAt;
    for (let i = 0; i < 16; i++) {
      const x = W * (0.2 + hash(i + 30) * 0.6) + Math.sin(life + i) * 45, y = H * (0.3 + hash(i + 90) * 0.35) - life * 12;
      const radius = 60 + life * 24 + hash(i) * 60;
      const smoke = ctx.createRadialGradient(x, y, 0, x, y, radius);
      smoke.addColorStop(0, `rgba(170,160,138,${s.smoke * 0.07})`); smoke.addColorStop(1, 'rgba(180,173,160,0)');
      ctx.fillStyle = smoke; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  if (s.sparks > 0) {
    const k = 1 - s.sparks;
    if (s.sparks > 0.85) { ctx.fillStyle = `rgba(255,230,180,${(s.sparks - 0.85) * 3})`; ctx.fillRect(0, 0, W, H); }
    ctx.lineWidth = 2;
    for (let i = 0; i < 34; i++) {
      const a = hash(i * 1.72) * TAU, d = k * (80 + hash(i) * 260), fall = k * k * 120 * hash(i + 4);
      ctx.strokeStyle = `rgba(255,${180 + hash(i + 9) * 60 | 0},112,${s.sparks})`;
      ctx.beginPath(); ctx.moveTo(W * 0.52 + Math.cos(a) * d, H * 0.48 + Math.sin(a) * d + fall); ctx.lineTo(W * 0.52 + Math.cos(a) * (d + 14), H * 0.48 + Math.sin(a) * (d + 14) + fall); ctx.stroke();
    }
    // debris
    for (let i = 0; i < 14; i++) {
      const a = hash(i * 3.1) * TAU, d = k * (60 + hash(i + 2) * 200);
      ctx.fillStyle = `rgba(90,62,40,${s.sparks})`;
      ctx.fillRect(W * 0.52 + Math.cos(a) * d, H * 0.5 + Math.sin(a) * d * 0.6 + k * k * 160, 6 + hash(i) * 6, 4 + hash(i + 1) * 5);
    }
  }
  if (g.match.hp < 40 && !g.dead) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, 'rgba(128,22,22,0)'); v.addColorStop(1, `rgba(150,20,20,${(1 - g.match.hp / 40) * 0.45})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 140, W / 2, H / 2, W * 0.68);
  vignette.addColorStop(0, 'rgba(8,20,35,0)'); vignette.addColorStop(1, 'rgba(3,9,16,0.62)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
}

function minimap(ctx, s, camera) {
  const x = 40, y = 470, size = 6;
  ctx.fillStyle = '#07101bcc'; rrect(ctx, x - 10, y - 24, MAP_W * size + 20, MAP_H * size + 44, 6); ctx.fill();
  text(ctx, '2F · LODGE', x, y - 9, { size: 10, weight: 700, color: '#abc4d0', family: MONO });
  SIEGE_MAP.forEach((row, j) => [...row].forEach((_, i) => {
    const cell = siegeCell(i, j, s.breached); ctx.fillStyle = cell === 5 ? '#c5904a' : cell === 4 ? '#bbac63' : cell ? '#6f8189' : '#1f313c';
    ctx.fillRect(x + i * size, y + j * size, size - 0.5, size - 0.5);
  }));
  for (const site of SIEGE_SITES) { ctx.fillStyle = site === s.site ? '#f0cc5e' : '#f0cc5e88'; ctx.fillRect(x + site.x * size - 3, y + site.y * size - 3, 6, 6); }
  // where it is, and which way it looks
  const cx = x + camera.px * size, cy = y + camera.py * size;
  ctx.fillStyle = `${BLUE}40`;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 20, camera.angle - 0.55, camera.angle + 0.55); ctx.closePath(); ctx.fill();
  ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, TAU); ctx.fill();
}

/** The operator's portrait at the top: a helmet, in their colour. */
function badge(ctx, x, y, p, color) {
  ctx.globalAlpha = p.alive ? 1 : 0.28;
  ctx.fillStyle = '#0b1622cc'; rrect(ctx, x, y, 30, 32, 3); ctx.fill();
  ctx.fillStyle = color; ctx.fillRect(x, y + 29, 30, 3);
  ctx.fillStyle = p.operator.color;
  ctx.beginPath(); ctx.arc(x + 15, y + 15, 9, Math.PI, 0); ctx.lineTo(x + 24, y + 20); ctx.lineTo(x + 6, y + 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9fe3f0'; ctx.fillRect(x + 8, y + 15, 14, 3);
  text(ctx, p.operator.name.slice(0, 1), x + 15, y + 28, { size: 8, weight: 800, align: 'center', color: WHITE });
  if (!p.alive) { ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + 26, y + 28); ctx.stroke(); }
  ctx.globalAlpha = 1;
}

function hud(ctx, g, s, camera) {
  const m = g.match;
  const grad = ctx.createLinearGradient(0, 0, 0, 130); grad.addColorStop(0, '#061321e6'); grad.addColorStop(1, '#06132100'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 130);
  const prep = s.phase === 'preparation', planted = s.phase === 'planted';
  const timer = prep ? Math.ceil(45 * (1 - s.timer / SIEGE_TIME.preparation)) : planted ? Math.ceil(45 * (1 - s.plantedT / SIEGE_TIME.planted)) : Math.ceil(180 * (1 - m.roundT / SIEGE_TIME.action));
  // centre block: score, timer, score
  ctx.fillStyle = '#0b1622d9'; rrect(ctx, W / 2 - 104, 24, 208, 50, 4); ctx.fill();
  ctx.fillStyle = BLUE; ctx.fillRect(W / 2 - 104, 24, 46, 50);
  ctx.fillStyle = ORANGE; ctx.fillRect(W / 2 + 58, 24, 46, 50);
  text(ctx, String(m.rounds.us), W / 2 - 81, 62, { size: 30, weight: 800, align: 'center', color: '#0b1622' });
  text(ctx, String(m.rounds.them), W / 2 + 81, 62, { size: 30, weight: 800, align: 'center', color: '#0b1622' });
  const low = !prep && timer <= 30;
  text(ctx, mmss(Math.max(0, timer)), W / 2, 60, { size: 26, weight: 700, family: MONO, align: 'center', color: planted ? '#f9bf68' : low ? '#ff8a7a' : WHITE });
  s.team.forEach((p, i) => badge(ctx, W / 2 - 118 - (5 - i) * 34, 32, p, BLUE));
  s.foes.forEach((p, i) => badge(ctx, W / 2 + 122 + i * 34, 32, p, ORANGE));
  text(ctx, `${m.round >= 7 ? 'OVERTIME' : `ROUND ${m.round}`}  ·  ${s.attack ? 'ATTACK' : 'DEFENSE'}`, W / 2, 94, { size: 12, weight: 700, align: 'center', color: '#c2d4df', family: MONO });
  text(ctx, 'BOMB · ALPINE LODGE', W - 34, 44, { size: 12, weight: 700, align: 'right', color: '#d4e2ea' });
  text(ctx, 'FLY LAB SIMULATION', W - 34, 62, { size: 10, align: 'right', color: '#819dab', family: MONO });
  if (prep) {
    text(ctx, 'PREPARATION PHASE', W / 2, 176, { size: 28, weight: 800, align: 'center', shadow: '#000a' });
    text(ctx, s.attack ? 'LOCATE THE BOMBS' : 'FORTIFY THE OBJECTIVE', W / 2, 204, { size: 13, weight: 600, align: 'center', color: '#b1d6e4', family: MONO });
  } else if (m.roundT < 2.2 && s.phase === 'action') {
    const k = clamp01(1 - (m.roundT - 1.6) / 0.6);
    ctx.globalAlpha = k;
    text(ctx, 'ACTION PHASE', W / 2, 176, { size: 32, weight: 800, align: 'center', shadow: '#000a' });
    text(ctx, s.attack ? 'BREACH. CLEAR. PLANT.' : 'PROTECT THE BOMBS', W / 2, 206, { size: 13, weight: 600, align: 'center', color: '#b1d6e4', family: MONO });
    ctx.globalAlpha = 1;
  }
  if (s.phase === 'planting' || s.defuseT > 0) {
    const progress = s.phase === 'planting' ? s.plantT / SIEGE_TIME.plant : s.defuseT / SIEGE_TIME.defuse;
    ctx.fillStyle = '#071421d9'; rrect(ctx, W / 2 - 182, H / 2 + 86, 364, 72, 5); ctx.fill();
    text(ctx, s.phase === 'planting' ? 'PLANTING DEFUSER' : 'DISABLING DEFUSER', W / 2, H / 2 + 115, { size: 16, weight: 700, align: 'center' });
    ctx.fillStyle = '#354a54'; ctx.fillRect(W / 2 - 150, H / 2 + 131, 300, 5); ctx.fillStyle = '#edd177'; ctx.fillRect(W / 2 - 150, H / 2 + 131, 300 * clamp01(progress), 5);
  } else if (planted) {
    const blink = Math.sin(g.clock * 10) > 0;
    text(ctx, 'DEFUSER PLANTED', W / 2, 150, { size: 18, weight: 800, align: 'center', color: blink ? '#f3c96c' : '#c79a3c' });
  }
  if (g.clock - s.gadgetAt < 1.8) {
    ctx.fillStyle = '#0b1622cc'; rrect(ctx, W / 2 - 150, 222, 300, 30, 4); ctx.fill();
    text(ctx, `${s.operator.gadget} DEPLOYED`, W / 2, 243, { size: 14, weight: 700, align: 'center', color: '#ffe4a3', family: MONO });
  }
  g.feed.filter((f) => g.clock - f.at < 5).slice(-4).forEach((f, i) => {
    const y = 186 + i * 31; ctx.fillStyle = '#091320d0'; rrect(ctx, W - 340, y - 21, 310, 26, 3); ctx.fill();
    text(ctx, f.killer, W - 328, y - 3, { size: 12, weight: 700, color: f.us ? BLUE : ORANGE });
    text(ctx, f.hs ? '◉' : '▸', W - 188, y - 2, { size: 14, align: 'center', color: WHITE });
    text(ctx, f.victim, W - 42, y - 3, { size: 12, weight: 700, align: 'right', color: f.us ? ORANGE : BLUE });
  });
  const bottom = ctx.createLinearGradient(0, H - 130, 0, H); bottom.addColorStop(0, '#06132100'); bottom.addColorStop(1, '#061321f0'); ctx.fillStyle = bottom; ctx.fillRect(0, H - 130, W, 130);
  // health: a ring that empties
  const hp = clamp01(m.hp / 100);
  ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff24'; ctx.beginPath(); ctx.arc(77, H - 59, 30, 0, TAU); ctx.stroke();
  ctx.strokeStyle = hp < 0.4 ? '#ff6a5a' : '#edf7f3';
  ctx.beginPath(); ctx.arc(77, H - 59, 30, -Math.PI / 2, -Math.PI / 2 + TAU * hp); ctx.stroke();
  text(ctx, String(Math.ceil(m.hp)), 77, H - 49, { size: 26, weight: 700, align: 'center', color: WHITE, family: MONO });
  text(ctx, s.operator.name, 126, H - 68, { size: 19, weight: 800, color: WHITE });
  text(ctx, s.operator.gadget, 126, H - 45, { size: 10, weight: 600, color: '#9bb4c4', family: MONO });
  for (let i = 0; i < 2; i++) { ctx.fillStyle = i < s.gadget ? s.operator.color : '#ffffff22'; rrect(ctx, 126 + i * 18, H - 36, 14, 8, 2); ctx.fill(); }
  text(ctx, s.reload > 0 ? 'RELOADING' : String(s.ammo).padStart(2, '0'), W - 190, H - 49, { size: s.reload > 0 ? 19 : 40, weight: 700, color: s.ammo <= 8 && s.reload <= 0 ? '#ff9a8a' : WHITE, family: MONO, align: 'right' });
  text(ctx, `/ ${s.reserve}`, W - 178, H - 50, { size: 20, color: '#8aa2b3', family: MONO });
  text(ctx, s.operator.weapon, W - 37, H - 24, { size: 12, weight: 700, color: '#c4d7e1', align: 'right', family: MONO });
  text(ctx, s.site.name, W / 2, H - 30, { size: 11, weight: 700, color: '#bfd1dc', align: 'center', family: MONO });
  text(ctx, s.spotted ? 'BOMB SITE IDENTIFIED' : 'SEARCHING FOR THE BOMBS', W / 2, H - 52, { size: 11, weight: 700, color: s.spotted ? '#ead58b' : '#a0b4c4', align: 'center', family: MONO });
  minimap(ctx, s, camera);
}

function droneOverlay(ctx, g, s) {
  ctx.fillStyle = '#58a6bd12'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#09172530'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  // a fisheye rim, and the drone's own frame at the bottom corners
  const rim = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.62);
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = rim; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d0edf566'; ctx.lineWidth = 2;
  for (const [x, y, sx, sy] of [[40, 120, 1, 1], [W - 40, 120, -1, 1], [40, H - 120, 1, -1], [W - 40, H - 120, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * 34); ctx.lineTo(x, y); ctx.lineTo(x + sx * 34, y); ctx.stroke();
  }
  text(ctx, g.dead ? 'OBSERVATION TOOLS' : 'DRONE 01', 60, 150, { size: 13, weight: 700, color: BLUE, family: MONO });
  text(ctx, '● REC', W - 60, 150, { size: 12, weight: 700, color: '#df7c73', align: 'right', family: MONO });
  ctx.strokeStyle = '#f4d875aa'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 22, 0, TAU); ctx.moveTo(W / 2 - 34, H / 2); ctx.lineTo(W / 2 - 12, H / 2); ctx.moveTo(W / 2 + 12, H / 2); ctx.lineTo(W / 2 + 34, H / 2); ctx.stroke();
  if (s.spotted) text(ctx, '+50  BOMB LOCATED', W / 2, H / 2 + 66, { size: 16, weight: 700, color: '#f1d681', align: 'center' });
  if (g.dead) {
    text(ctx, 'ELIMINATED', W / 2, 176, { size: 28, weight: 800, color: '#f39a82', align: 'center' });
    text(ctx, 'Help your team with camera intel', W / 2, 204, { size: 14, color: '#bbcfda', align: 'center' });
  }
}

function roundBanner(ctx, m) {
  const k = clamp01(m.roundOver.t / 0.3);
  ctx.fillStyle = `rgba(7,19,32,${0.6 * k})`; ctx.fillRect(0, 0, W, H);
  const won = m.roundOver.winner === 'us';
  ctx.globalAlpha = k;
  ctx.fillStyle = won ? `${BLUE}30` : `${ORANGE}30`; ctx.fillRect(0, H / 2 - 90, W, 150);
  ctx.fillStyle = won ? BLUE : ORANGE; ctx.fillRect(0, H / 2 - 90, W, 3); ctx.fillRect(0, H / 2 + 57, W, 3);
  text(ctx, won ? 'ROUND WON' : 'ROUND LOST', W / 2, H / 2 - 12, { size: 66, weight: 800, align: 'center', color: won ? BLUE : ORANGE });
  text(ctx, m.roundOver.reason, W / 2, H / 2 + 30, { size: 20, weight: 600, align: 'center' });
  text(ctx, `${m.rounds.us}  :  ${m.rounds.them}`, W / 2, H / 2 + 118, { size: 38, weight: 700, family: MONO, align: 'center' });
  ctx.globalAlpha = 1;
}

function play(ctx, g) {
  const s = g.match?.siege;
  if (!s) { queue(ctx, g); return; }
  const camera = world(ctx, g, s);
  drawRoom(ctx, g, s, camera);
  if (!s.drone) drawEnemy(ctx, g, camera);
  markers(ctx, camera, s);
  effects(ctx, g, s);
  if (s.drone) droneOverlay(ctx, g, s);
  else weapon(ctx, g, s);
  hud(ctx, g, s, camera);
  if (s.phase === 'round-end') roundBanner(ctx, g.match);
}

// ================================================================== between matches

/** The squad, standing, in 3D: a camera in front of five operators. */
const LINEUP = { f: 760, spread: 0.3, depth: 1.75 };
const lineupSpot = (i) => ({ ox: (i - 2) * LINEUP.spread, oz: LINEUP.depth + (i % 2) * 0.14 });
function lineup(ctx, ops, t, x0, y0) {
  // back row first
  [...ops.keys()].sort((a, b) => lineupSpot(b).oz - lineupSpot(a).oz).forEach((i) => {
    const op = ops[i];
    const turn = (i - 2) * 0.16 + Math.sin(t * 0.8 + i) * 0.04;
    const parts = operatorModel({ color: op.color, team: BLUE, aim: 0.25, suit: SUITS[i % SUITS.length] });
    const c = Math.cos(turn), sn = Math.sin(turn);
    const { ox, oz } = lineupSpot(i);
    const toCam = ([x, y, z]) => [ox - (x * c + z * sn), y - 0.36, oz - (-x * sn + z * c)];
    const { polys } = project(parts, toCam, { cx: x0, cy: y0, f: LINEUP.f });
    paint(ctx, polys);
  });
}

function queue(ctx, g) {
  const fake = { x: 4.5, y: 9.5, ads: 0, movement: 0, lean: 0, drone: false, breached: true, timer: 0 };
  const camera = world(ctx, { ...g, view: { yaw: -0.25, pitch: 0 } }, fake);
  drawRoom(ctx, g, fake, camera);
  const shade = ctx.createLinearGradient(0, 0, W, 0); shade.addColorStop(0, '#05101ef5'); shade.addColorStop(0.55, '#05101ecc'); shade.addColorStop(1, '#05101e88'); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  text(ctx, 'TACTICAL · 5v5 · BOMB', 66, 87, { size: 14, weight: 700, color: BLUE, family: MONO });
  text(ctx, 'RAINBOW SIX', 60, 166, { size: 54, weight: 850 }); text(ctx, 'SIEGE', 57, 264, { size: 103, weight: 850 });
  ctx.fillStyle = BLUE; ctx.fillRect(64, 296, 68, 4);
  text(ctx, 'ALPINE LODGE', 65, 346, { size: 24, weight: 600 });
  text(ctx, 'SELECTING OPERATORS', 65, 393, { size: 15, weight: 600, color: '#b6ccd7', family: MONO });
  text(ctx, 'Drone the site. Shape the map. Hold the angle.', 65, 432, { size: 17, weight: 400, color: '#91aab9' });
  const glow = ctx.createRadialGradient(900, 420, 20, 900, 420, 380);
  glow.addColorStop(0, '#62c8f433'); glow.addColorStop(1, '#62c8f400');
  ctx.fillStyle = glow; ctx.fillRect(500, 150, 780, 520);
  ctx.fillStyle = '#62c8f41a';
  ctx.save(); ctx.translate(900, 330 + 0.36 / LINEUP.depth * LINEUP.f + 6); ctx.scale(1, 0.16); ctx.beginPath(); ctx.arc(0, 0, 340, 0, TAU); ctx.fill(); ctx.restore();
  lineup(ctx, OPERATORS.attack, g.clock, 900, 330);
  OPERATORS.attack.forEach((op, i) => {
    const { ox, oz } = lineupSpot(i);
    const x = 900 + ox / oz * LINEUP.f, y = 330 + 0.36 / oz * LINEUP.f;
    ctx.fillStyle = op.color; ctx.fillRect(x - 26, y + 18, 52, 3);
    text(ctx, op.name, x, y + 40, { size: 12, weight: 800, align: 'center' });
  });
  ctx.fillStyle = '#304652'; ctx.fillRect(65, H - 70, W - 130, 3); ctx.fillStyle = BLUE; ctx.fillRect(65, H - 70, (W - 130) * g.phaseProgress, 3);
  text(ctx, 'SEARCHING FOR MATCH', 66, H - 40, { size: 12, weight: 700, color: '#c8dce8', family: MONO });
  text(ctx, 'FLY LAB SIMULATION', W - 65, H - 40, { size: 11, color: '#7492a5', align: 'right', family: MONO });
}

function result(ctx, g) {
  const won = g.result?.won;
  ctx.fillStyle = '#04101cd6'; ctx.fillRect(0, 0, W, H);
  text(ctx, 'MATCH COMPLETE', W / 2, 190, { size: 16, weight: 700, color: '#b2c9d7', align: 'center', family: MONO });
  text(ctx, won ? 'VICTORY' : 'DEFEAT', W / 2, 305, { size: 100, weight: 850, color: won ? BLUE : ORANGE, align: 'center' });
  text(ctx, `${g.match.rounds.us}  :  ${g.match.rounds.them}`, W / 2, 397, { size: 55, weight: 700, family: MONO, align: 'center' });
  text(ctx, `${g.match.kills} ELIMINATIONS   /   ${g.match.deaths} DEATHS`, W / 2, 460, { size: 17, weight: 600, color: '#c2d3de', family: MONO, align: 'center' });
  const rounds = g.match.siege.rounds;
  rounds.forEach((r, i) => { ctx.fillStyle = r.winner === 'us' ? BLUE : ORANGE; ctx.fillRect(W / 2 - rounds.length * 19 + i * 38, 506, 28, 6); });
}

function icon(ctx, x, y, size) {
  ctx.fillStyle = '#162f45'; rrect(ctx, x, y, size, size, size * 0.15); ctx.fill();
  ctx.strokeStyle = BLUE; ctx.lineWidth = size * 0.05; ctx.strokeRect(x + size * 0.2, y + size * 0.17, size * 0.6, size * 0.65);
  text(ctx, '6', x + size / 2, y + size * 0.73, { size: size * 0.62, weight: 800, align: 'center', color: WHITE });
}

export const SIEGE = { play, queue, result, icon };
