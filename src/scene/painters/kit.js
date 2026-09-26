/**
 * The shared kit every painter of the gamer's monitors draws with: the
 * canvas size, the view (where the camera looks, where a bearing lands on
 * screen, where the enemy is), noise, text and the Fly Lab fly. Split out of
 * gamePainters.js so each game's painter can live in its own file.
 */
import { HALF_FOV, TAG } from '../../game/gamer.js';

export const MAIN_W = 1280;
export const MAIN_H = 720;
export const SIDE_W = 540;
export const SIDE_H = 960;

export const SANS = "'Inter Variable', Inter, system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
export const PX_PER_RAD = MAIN_W / 2 / HALF_FOV;
export const TAU = Math.PI * 2;

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x) => clamp(x, 0, 1);
export const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const hash2 = (x, y) => hash(x * 12.9898 + y * 78.233);
export const smooth = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Wrap an angle difference into −π..π. */
export const wrap = (a) => a - TAU * Math.round(a / TAU);

export const font = (ctx, weight, size, family = SANS) => { ctx.font = `${weight} ${size}px ${family}`; };
export function text(ctx, s, x, y, { color = '#fff', size = 20, weight = 600, align = 'left', base = 'alphabetic', family = SANS, shadow = null } = {}) {
  font(ctx, weight, size, family);
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + Math.max(1, size / 14), y + Math.max(1, size / 14)); }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Where the view points, with the tremor on top: the world shifts, the crosshair does not. */
export const camYaw = (g) => g.view.yaw - (g.wobble ?? 0);
/** Screen x of a world bearing. */
export const bearingX = (g, a) => MAIN_W / 2 + wrap(a - camYaw(g)) * PX_PER_RAD;

export function enemyOnScreen(g) {
  const e = g.enemy;
  if (!e) return null;
  return {
    e,
    x: MAIN_W / 2 + e.err / HALF_FOV * (MAIN_W / 2),
    y: MAIN_H / 2 - (e.elev - g.view.pitch) * PX_PER_RAD,
    s: e.size * MAIN_W,
  };
}

/** The Fly Lab fly, small: the logo's shapes. */
export function drawFly(ctx, x, y, s, { wings = true } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 48, s / 48);
  ctx.translate(-24, -24);
  if (wings) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeStyle = '#c98a4c';
    ctx.lineWidth = 1.4;
    for (const [cx, rot] of [[17, -35], [31, 35]]) {
      ctx.save(); ctx.translate(cx, 22); ctx.rotate(rot * Math.PI / 180);
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 15, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#d9731f';
  ctx.beginPath(); ctx.ellipse(24, 30, 7, 12, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#a9541a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(18, 29); ctx.lineTo(30, 29); ctx.moveTo(18, 34); ctx.lineTo(30, 34); ctx.stroke();
  ctx.fillStyle = '#e3872f';
  ctx.beginPath(); ctx.arc(24, 15, 6.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b8321f';
  ctx.beginPath(); ctx.arc(20.5, 13.5, 3, 0, TAU); ctx.arc(27.5, 13.5, 3, 0, TAU); ctx.fill();
  ctx.restore();
}

/** The kill feed, top right: CS2 outlines its own kills in red. */
export function drawFeed(ctx, g, { x, y, cs = false, left = false }) {
  const rows = g.feed.filter((f) => g.clock - f.at < 7).slice(-5);
  rows.forEach((f, k) => {
    font(ctx, 600, 17, SANS);
    const s = `${f.killer}  ${cs ? '▬▸' : '⚔'}${f.hs ? ' ◎' : ''}  ${f.victim}`;
    const w = ctx.measureText(s).width + 26;
    const bx = left ? x : x - w;
    const by = y + k * 34;
    rrect(ctx, bx, by, w, 28, 4);
    ctx.fillStyle = 'rgba(10,10,12,0.72)'; ctx.fill();
    if (cs && (f.killer === TAG || f.victim === TAG)) { ctx.strokeStyle = '#d6322a'; ctx.lineWidth = 2; ctx.stroke(); }
    font(ctx, 600, 17, SANS);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = f.us ? '#7cc4ff' : '#f2b24c';
    ctx.fillText(f.killer, bx + 13, by + 15);
    const kw = ctx.measureText(`${f.killer}  `).width;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(`${cs ? '▬▸' : '⚔'}${f.hs ? ' ◎' : ''}`, bx + 13 + kw, by + 15);
    const mw = ctx.measureText(`${cs ? '▬▸' : '⚔'}${f.hs ? ' ◎' : ''}  `).width;
    ctx.fillStyle = f.us ? '#f2b24c' : '#7cc4ff';
    ctx.fillText(f.victim, bx + 13 + kw + mw, by + 15);
  });
}

/** Pixel art from rows of characters: each character one colour. */
export function pixels(ctx, rows, palette, x, y, px) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const col = palette[rows[r][c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  }
}

export function drawCursor(ctx, x, y) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 34); ctx.lineTo(x + 9, y + 26); ctx.lineTo(x + 16, y + 40); ctx.lineTo(x + 21, y + 37); ctx.lineTo(x + 14, y + 24); ctx.lineTo(x + 25, y + 24); ctx.closePath(); ctx.fill(); ctx.stroke();
}
