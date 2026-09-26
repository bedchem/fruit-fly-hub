/**
 * What is on the fly's two monitors, painted into canvas textures.
 *
 * The main monitor shows the game it is playing — League of Legends,
 * Minecraft, Fortnite or CS2 — or the queue, the result, the desktop it
 * rage-quits to. The vertical one shows a voice-and-text chat with its team
 * and the match scoreboard. Everything is drawn here, procedurally, from the
 * Gamer's state: no logos, no footage, no assets. The games are recognisable
 * by their genre and their conventions — a lane seen from above, blocks at
 * night, a storm, a sandy corridor — and nothing more.
 *
 * Gameplay timing is read off the gamer's own clock (`g.clock`), so a paused
 * or headless fly draws the same frame; `t` is only for ambient motion.
 */
import { GAMES, GAME_ORDER, formatRank, CS2_ROUNDS_TO_WIN } from '../game/games.js';
import { PHASES, TAG, HALF_FOV } from '../game/gamer.js';
import {
  MAIN_W, MAIN_H, SIDE_W, SIDE_H, SANS, MONO, PX_PER_RAD, TAU, clamp, clamp01, hash, hash2, smooth, vnoise,
  wrap, font, text, rrect, mmss, camYaw, bearingX, enemyOnScreen, drawFly, drawFeed, pixels, drawCursor,
} from './painters/kit.js';
import { RDR2 } from './painters/rdr2.js';
import { GOW, RAGNAROK } from './painters/gow.js';

export { MAIN_W, MAIN_H, SIDE_W, SIDE_H, drawFly };

/** Games whose screens live in their own painter files: { play, queue, result, icon }. */
const CUSTOM = { rdr2: RDR2, gow: GOW, gowr: RAGNAROK };

// ============================================================ the main monitor

export function drawGame(ctx, g, t) {
  ctx.save();
  switch (g.phase) {
    case PHASES.QUEUE: drawQueue(ctx, g, t); break;
    case PHASES.PLAYING: drawPlay(ctx, g, t); break;
    case PHASES.RESULT: drawPlay(ctx, g, t); drawResult(ctx, g, t); break;
    case PHASES.RAGE_QUIT: drawRageQuit(ctx, g, t); break;
    case PHASES.SWITCHING: drawSwitching(ctx, g, t); break;
    default: break;
  }
  ctx.restore();
}

function drawPlay(ctx, g, t) {
  const game = g.match?.game ?? g.game;
  if (CUSTOM[game]) CUSTOM[game].play(ctx, g, t);
  else if (game === 'cs2') drawCS(ctx, g, t);
  else if (game === 'minecraft') drawMinecraft(ctx, g, t);
  else if (game === 'fortnite') drawFortnite(ctx, g, t);
  else drawLeague(ctx, g, t);
  if (g.flash > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${clamp01(g.flash * 1.1)})`;
    ctx.fillRect(0, 0, MAIN_W, MAIN_H);
  }
}

// ------------------------------------------------------------------- CS2

/** Around the player, once: sandstone, arches, crates, doors. */
const CS_WORLD = (() => {
  const out = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + (hash(i * 3.1) - 0.5) * 0.12;
    const r = hash(i * 7.7);
    out.push({
      a,
      kind: r < 0.18 ? 'arch' : r < 0.32 ? 'door' : r < 0.55 ? 'crates' : 'wall',
      w: 0.22 + hash(i * 1.3) * 0.28,
      h: 0.2 + hash(i * 5.9) * 0.28,
      tone: hash(i * 9.1),
      near: hash(i * 2.2),
    });
  }
  return out;
})();

function sandstone(tone, dark = 0) {
  const l = 62 + tone * 12 - dark * 22;
  return `hsl(${36 + tone * 6}, ${42 + tone * 10}%, ${l}%)`;
}

function drawCS(ctx, g, t) {
  const m = g.match;
  const horizon = MAIN_H * 0.5 + g.view.pitch * PX_PER_RAD;
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#6fa6d6');
  sky.addColorStop(1, '#d6e6ee');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, MAIN_W, horizon + 2);
  // sand floor with its tiles running to the horizon
  const floor = ctx.createLinearGradient(0, horizon, 0, MAIN_H);
  floor.addColorStop(0, '#cdb183');
  floor.addColorStop(1, '#9f7c4c');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, MAIN_W, MAIN_H - horizon);
  ctx.strokeStyle = 'rgba(90,64,34,0.22)';
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 9; k++) {
    const y = horizon + (MAIN_H - horizon) * Math.pow(k / 9, 1.8);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAIN_W, y); ctx.stroke();
  }
  const shift = (camYaw(g) * PX_PER_RAD) % 120;
  for (let k = -8; k < 20; k++) {
    const xb = k * 120 - shift;
    ctx.beginPath(); ctx.moveTo(MAIN_W / 2 + (xb - MAIN_W / 2) * 0.12, horizon); ctx.lineTo(xb * 1.6 - MAIN_W * 0.3, MAIN_H); ctx.stroke();
  }
  // buildings, far ones first
  const seen = CS_WORLD.map((f) => ({ f, x: bearingX(g, f.a) })).filter(({ x, f }) => x > -f.w * PX_PER_RAD && x < MAIN_W + f.w * PX_PER_RAD)
    .sort((a, b) => a.f.near - b.f.near);
  for (const { f, x } of seen) {
    const w = f.w * PX_PER_RAD * (0.7 + f.near * 0.8);
    const h = f.h * PX_PER_RAD * (0.7 + f.near * 0.9);
    const base = horizon + 30 + f.near * 90;
    const left = x - w / 2;
    if (f.kind === 'crates') {
      for (let k = 0; k < 3; k++) {
        const s = w / 3.2;
        const cx = left + k * s * 1.05, cy = base - s * (k === 1 ? 2 : 1);
        ctx.fillStyle = '#8a6135'; ctx.fillRect(cx, cy, s, s);
        ctx.strokeStyle = '#5b3d1e'; ctx.lineWidth = 3; ctx.strokeRect(cx + 2, cy + 2, s - 4, s - 4);
        ctx.beginPath(); ctx.moveTo(cx + 4, cy + 4); ctx.lineTo(cx + s - 4, cy + s - 4); ctx.moveTo(cx + s - 4, cy + 4); ctx.lineTo(cx + 4, cy + s - 4); ctx.stroke();
      }
      continue;
    }
    ctx.fillStyle = sandstone(f.tone);
    ctx.fillRect(left, base - h, w, h);
    // weathering bands and a shaded side
    ctx.fillStyle = sandstone(f.tone, 0.5);
    ctx.fillRect(left + w * 0.84, base - h, w * 0.16, h);
    ctx.fillStyle = 'rgba(80,55,25,0.12)';
    for (let k = 0; k < 5; k++) ctx.fillRect(left, base - h + k * h / 5, w, 3);
    ctx.fillStyle = sandstone(f.tone, -0.3);
    ctx.fillRect(left - 4, base - h - 8, w + 8, 10);
    if (f.kind === 'arch') {
      ctx.fillStyle = '#3a2c1c';
      ctx.beginPath();
      ctx.moveTo(left + w * 0.3, base);
      ctx.lineTo(left + w * 0.3, base - h * 0.55);
      ctx.arc(left + w * 0.5, base - h * 0.55, w * 0.2, Math.PI, 0);
      ctx.lineTo(left + w * 0.7, base);
      ctx.fill();
    } else if (f.kind === 'door') {
      ctx.fillStyle = '#2f5d7c';
      ctx.fillRect(left + w * 0.28, base - h * 0.7, w * 0.44, h * 0.7);
      ctx.strokeStyle = '#1d3a4f'; ctx.lineWidth = 4;
      ctx.strokeRect(left + w * 0.28, base - h * 0.7, w * 0.44, h * 0.7);
      ctx.beginPath(); ctx.moveTo(left + w * 0.5, base - h * 0.7); ctx.lineTo(left + w * 0.5, base); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(40,28,14,0.55)';
      for (let k = 0; k < 2; k++) ctx.fillRect(left + w * (0.2 + k * 0.4), base - h * 0.75, w * 0.18, h * 0.22);
    }
  }
  // the enemy
  const en = enemyOnScreen(g);
  if (en) drawSoldier(ctx, en, g);
  drawRifle(ctx, g);
  if (!g.dead) drawCrosshairCS(ctx);
  drawCSHud(ctx, g, m);
  if (g.dead) {
    ctx.fillStyle = 'rgba(40,40,40,0.55)'; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
    rrect(ctx, MAIN_W / 2 - 230, MAIN_H - 190, 460, 74, 6); ctx.fillStyle = 'rgba(10,10,12,0.8)'; ctx.fill();
    text(ctx, `Killed by ${g.dead.by}`, MAIN_W / 2, MAIN_H - 147, { size: 28, weight: 700, align: 'center', color: '#e7c07a' });
    text(ctx, 'spectating teammates…', MAIN_W / 2, MAIN_H - 124, { size: 16, weight: 500, align: 'center', color: '#b8b8b8' });
  }
  if (g.banner) {
    const good = g.banner.good;
    ctx.fillStyle = good ? 'rgba(40,80,140,0.85)' : 'rgba(150,100,30,0.85)';
    ctx.fillRect(0, 130, MAIN_W, 90);
    text(ctx, g.banner.text, MAIN_W / 2, 190, { size: 44, weight: 800, align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.4)' });
  }
}

function drawSoldier(ctx, { x, y, s, e }, g) {
  const w = s * 0.5, h = s * 1.45;
  const top = y - h * 0.42;
  ctx.save();
  if (e.hitFlash > 0) ctx.filter = `brightness(${1 + e.hitFlash})`;
  ctx.fillStyle = '#3b3a2c';
  // legs
  ctx.fillRect(x - w * 0.34, top + h * 0.56, w * 0.26, h * 0.44);
  ctx.fillRect(x + w * 0.08, top + h * 0.56, w * 0.26, h * 0.44);
  // torso, vest
  ctx.fillStyle = '#4c4a36';
  rrect(ctx, x - w * 0.46, top + h * 0.17, w * 0.92, h * 0.42, w * 0.12); ctx.fill();
  ctx.fillStyle = '#2d2c22';
  ctx.fillRect(x - w * 0.3, top + h * 0.24, w * 0.6, h * 0.24);
  // head, balaclava
  ctx.fillStyle = '#23231d';
  ctx.beginPath(); ctx.ellipse(x, top + h * 0.09, w * 0.24, h * 0.09, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a3845f';
  ctx.fillRect(x - w * 0.14, top + h * 0.07, w * 0.28, h * 0.025);
  // rifle across the body, at the fly
  ctx.fillStyle = '#1b1a16';
  ctx.fillRect(x - w * 0.62, top + h * 0.33, w * 1.1, h * 0.05);
  ctx.fillStyle = '#6b4424';
  ctx.fillRect(x + w * 0.2, top + h * 0.32, w * 0.34, h * 0.07);
  ctx.restore();
  // hit sparks and health
  if (e.hitFlash > 0.3) {
    ctx.fillStyle = `rgba(200,30,20,${e.hitFlash})`;
    for (let k = 0; k < 6; k++) ctx.fillRect(x + (hash(k + g.clock * 50) - 0.5) * w, top + h * 0.1 + hash(k * 3 + g.clock * 40) * h * 0.4, 5, 5);
  }
}

function drawRifle(ctx, g) {
  const since = g.clock - g.shotAt;
  const kick = since < 0.12 ? (1 - since / 0.12) * 14 : 0;
  const bob = Math.sin(g.clock * 2.2) * 3;
  ctx.save();
  ctx.translate(MAIN_W - 430 + kick * 0.5, MAIN_H - 250 + kick + bob);
  ctx.rotate(-0.08);
  // barrel and gas tube
  ctx.fillStyle = '#16161a';
  ctx.fillRect(-40, 70, 190, 12);
  ctx.fillRect(0, 60, 150, 9);
  // handguard, wood
  ctx.fillStyle = '#7a4a24';
  rrect(ctx, 130, 62, 130, 34, 8); ctx.fill();
  ctx.fillStyle = 'rgba(40,20,5,0.35)';
  for (let k = 0; k < 4; k++) ctx.fillRect(140 + k * 28, 68, 16, 4);
  // receiver
  ctx.fillStyle = '#24252a';
  rrect(ctx, 250, 56, 220, 56, 6); ctx.fill();
  // magazine, curved
  ctx.fillStyle = '#1d1e22';
  ctx.beginPath(); ctx.moveTo(300, 108); ctx.quadraticCurveTo(290, 190, 330, 250); ctx.lineTo(380, 240); ctx.quadraticCurveTo(348, 180, 356, 108); ctx.fill();
  // grip and a hand
  ctx.fillStyle = '#6b4424';
  ctx.beginPath(); ctx.moveTo(430, 108); ctx.lineTo(470, 108); ctx.lineTo(490, 230); ctx.lineTo(440, 230); ctx.fill();
  ctx.fillStyle = '#3c4a34';
  rrect(ctx, 400, 120, 120, 150, 30); ctx.fill();
  rrect(ctx, 150, 88, 90, 90, 26); ctx.fill();
  ctx.restore();
  if (since < 0.05) {
    const mx = MAIN_W - 468 + kick * 0.5, my = MAIN_H - 176 + kick;
    ctx.fillStyle = 'rgba(255,220,120,0.95)';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU, r = k % 2 ? 16 : 46;
      ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r * 0.7);
    }
    ctx.fill();
  }
}

function drawCrosshairCS(ctx) {
  const cx = MAIN_W / 2, cy = MAIN_H / 2;
  ctx.fillStyle = '#000';
  for (const [x, y, w, h] of [[cx - 15, cy - 2, 11, 4], [cx + 4, cy - 2, 11, 4], [cx - 2, cy - 15, 4, 11], [cx - 2, cy + 4, 4, 11]]) ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#4dff6a';
  for (const [x, y, w, h] of [[cx - 15, cy - 2, 11, 4], [cx + 4, cy - 2, 11, 4], [cx - 2, cy - 15, 4, 11], [cx - 2, cy + 4, 4, 11]]) ctx.fillRect(x, y, w, h);
}

function drawCSHud(ctx, g, m) {
  // health and armour
  text(ctx, '✚', 34, MAIN_H - 30, { size: 34, weight: 700, color: '#f0f0f0', shadow: 'rgba(0,0,0,0.5)' });
  text(ctx, String(Math.round(g.dead ? 0 : m.hp)), 76, MAIN_H - 30, { size: 40, weight: 700, color: m.hp < 30 ? '#ff5a4a' : '#f0f0f0', shadow: 'rgba(0,0,0,0.5)' });
  text(ctx, '⛊', 170, MAIN_H - 30, { size: 30, weight: 700, color: '#f0f0f0', shadow: 'rgba(0,0,0,0.5)' });
  text(ctx, '100', 206, MAIN_H - 30, { size: 40, weight: 700, color: '#f0f0f0', shadow: 'rgba(0,0,0,0.5)' });
  // ammunition
  const mag = 30 - (Math.floor(g.clock * 9) % 31) * (g.firing ? 1 : 0);
  text(ctx, `${Math.max(1, mag)}`, MAIN_W - 150, MAIN_H - 30, { size: 42, weight: 700, align: 'right', color: '#f0f0f0', shadow: 'rgba(0,0,0,0.5)' });
  text(ctx, '/ 90', MAIN_W - 40, MAIN_H - 32, { size: 26, weight: 600, align: 'right', color: '#cfcfcf', shadow: 'rgba(0,0,0,0.5)' });
  // money
  text(ctx, `$ ${m.money}`, 34, 250, { size: 26, weight: 700, color: '#8fdc7a', shadow: 'rgba(0,0,0,0.5)' });
  // radar
  ctx.save();
  rrect(ctx, 24, 24, 190, 190, 10); ctx.fillStyle = 'rgba(12,14,12,0.7)'; ctx.fill();
  ctx.translate(119, 119); ctx.rotate(-camYaw(g));
  ctx.strokeStyle = 'rgba(214,190,130,0.65)'; ctx.lineWidth = 10;
  ctx.strokeRect(-60, -70, 120, 140); ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#5ab4ff'; ctx.beginPath(); ctx.arc(119, 119, 7, 0, TAU); ctx.fill();
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(80 + k * 35, 70 + hash(k) * 90, 5, 0, TAU); ctx.fill(); }
  if (g.enemy) { ctx.fillStyle = '#ff5040'; ctx.beginPath(); ctx.arc(119 + Math.sin(g.enemy.err) * 60, 70, 6, 0, TAU); ctx.fill(); }
  // score and timer
  const cx = MAIN_W / 2;
  rrect(ctx, cx - 150, 14, 300, 56, 8); ctx.fillStyle = 'rgba(12,12,14,0.75)'; ctx.fill();
  text(ctx, String(m.rounds.us), cx - 110, 54, { size: 32, weight: 800, align: 'center', color: '#5ab4ff' });
  text(ctx, String(m.rounds.them), cx + 110, 54, { size: 32, weight: 800, align: 'center', color: '#f2b24c' });
  text(ctx, mmss(Math.max(0, 115 - m.roundT * 6)), cx, 52, { size: 26, weight: 700, align: 'center', color: '#f0f0f0', family: MONO });
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = k === 0 && g.dead ? '#3a3a3a' : '#5ab4ff';
    ctx.fillRect(cx - 285 + k * 26, 30, 20, 26);
    ctx.fillStyle = '#f2b24c';
    ctx.fillRect(cx + 165 + k * 26, 30, 20, 26);
  }
  drawFeed(ctx, g, { x: MAIN_W - 24, y: 30, cs: true });
}

// -------------------------------------------------------------- Minecraft

const VW = 320;
const VH = 180;
let voxel = null;

/** Terrain height, in blocks, and what the top block is. */
function mcHeight(ix, iz) {
  const n = vnoise(ix * 0.055, iz * 0.055) * 9 + vnoise(ix * 0.17 + 30, iz * 0.17) * 3;
  let h = Math.floor(n);
  const tree = hash2(ix, iz) > 0.972 && h > 4;
  if (tree) h += 5;
  return h < 4 ? 4 : h;
}
function mcTop(ix, iz, h) {
  if (h <= 4) return 'water';
  if (hash2(ix, iz) > 0.972) return 'leaves';
  if (h <= 5) return 'sand';
  if (h >= 11) return 'stone';
  return 'grass';
}
const MC_COLORS = {
  grass: [[106, 170, 64], [121, 85, 58]],
  sand: [[219, 206, 153], [206, 190, 135]],
  stone: [[128, 128, 128], [110, 110, 110]],
  leaves: [[58, 120, 40], [72, 52, 30]],
  water: [[52, 92, 196], [52, 92, 196]],
};

function mcSky(night) {
  // dusk → night → sunrise
  const dusk = [[130, 170, 230], [240, 170, 120]];
  const dark = [[10, 14, 38], [22, 30, 70]];
  const dawn = [[120, 160, 220], [250, 160, 120]];
  const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  if (night < 0.25) { const k = night / 0.25; return [lerp(dusk[0], dark[0], k), lerp(dusk[1], dark[1], k)]; }
  if (night < 0.85) return dark;
  const k = (night - 0.85) / 0.15;
  return [lerp(dark[0], dawn[0], k), lerp(dark[1], dawn[1], k)];
}

function renderVoxel(g) {
  if (!voxel) {
    const c = document.createElement('canvas');
    c.width = VW; c.height = VH;
    const vctx = c.getContext('2d');
    voxel = { c, ctx: vctx, img: vctx.createImageData(VW, VH), ybuf: new Float32Array(VW), prevH: new Float32Array(VW) };
    voxel.px = new Uint32Array(voxel.img.data.buffer);
  }
  const { px, ybuf, prevH } = voxel;
  const m = g.match;
  const night = m?.night ?? 0.3;
  const [skyTop, skyBottom] = mcSky(night);
  const light = night < 0.25 ? 1 - night * 1.6 : night < 0.85 ? 0.55 : 0.55 + (night - 0.85) * 3;
  const horizon = VH * 0.46 + g.view.pitch * PX_PER_RAD * (VH / MAIN_H);
  // sky
  for (let y = 0; y < VH; y++) {
    const k = clamp01(y / horizon);
    const r = skyTop[0] + (skyBottom[0] - skyTop[0]) * k;
    const gg = skyTop[1] + (skyBottom[1] - skyTop[1]) * k;
    const b = skyTop[2] + (skyBottom[2] - skyTop[2]) * k;
    const col = 0xff000000 | (b << 16) | (gg << 8) | r;
    px.fill(col, y * VW, (y + 1) * VW);
  }
  // stars at night
  if (night > 0.15 && night < 0.92) {
    for (let k = 0; k < 60; k++) {
      const sx = Math.floor((hash(k * 1.7) * 900 - camYaw(g) * 90) % VW + VW) % VW;
      const sy = Math.floor(hash(k * 5.3) * horizon * 0.8);
      px[sy * VW + sx] = 0xffe8e8ff;
    }
  }
  const phi = camYaw(g);
  const sin = Math.sin(phi), cos = Math.cos(phi);
  // walking forward slowly while nothing is attacking
  const walk = (m?.t ?? 0) * 1.2;
  const cx = 40 + Math.sin(-phi) * 0 + walk * 0.3, cz = 40 + walk;
  const camH = mcHeight(Math.floor(cx), Math.floor(cz)) + 2.6;
  const tanH = Math.tan(HALF_FOV);
  ybuf.fill(VH);
  prevH.fill(-1);
  const scale = 120;
  const fog = skyBottom;
  let dz = 0.25;
  for (let z = 1; z < 90; z += dz) {
    dz *= 1.018;
    // the row of ground at distance z, from the left edge of the view to the right
    const fx = -sin * z, fz = -cos * z;
    const rx = cos * z * tanH, rz = -sin * z * tanH;
    const lx = cx + fx - rx, lz = cz + fz - rz;
    const stepx = (2 * rx) / VW, stepz = (2 * rz) / VW;
    const fogK = clamp01((z - 30) / 60);
    for (let i = 0; i < VW; i++) {
      const wx = lx + stepx * i, wz = lz + stepz * i;
      const ix = Math.floor(wx), iz = Math.floor(wz);
      const h = mcHeight(ix, iz);
      const top = mcTop(ix, iz, h);
      const yTop = Math.floor((camH - h) / z * scale + horizon);
      if (yTop >= ybuf[i]) { prevH[i] = h; continue; }
      // the side of a step up, then the top of the block
      const yPrev = prevH[i] >= 0 && prevH[i] < h ? Math.floor((camH - prevH[i]) / z * scale + horizon) : yTop;
      const [tc, sc] = MC_COLORS[top];
      // a pixel texture: 4×4 texels a block
      const tex = 0.86 + 0.14 * hash2(Math.floor(wx * 4), Math.floor(wz * 4));
      const shade = light * tex * (1 - fogK * 0.2);
      for (let y = Math.max(0, yTop); y < ybuf[i] && y < VH; y++) {
        const side = y > yTop + 1 && y < yPrev;
        const c = side ? sc : tc;
        const k = side ? 0.72 : 1;
        let r = c[0] * shade * k, gg = c[1] * shade * k, b = c[2] * shade * k;
        if (side && top === 'grass' && y <= yTop + 2) { r = tc[0] * shade * 0.8; gg = tc[1] * shade * 0.8; b = tc[2] * shade * 0.8; }
        r += (fog[0] - r) * fogK; gg += (fog[1] - gg) * fogK; b += (fog[2] - b) * fogK;
        px[y * VW + i] = 0xff000000 | ((b | 0) << 16) | ((gg | 0) << 8) | (r | 0);
      }
      ybuf[i] = yTop;
      prevH[i] = h;
    }
  }
  voxel.ctx.putImageData(voxel.img, 0, 0);
  return voxel.c;
}

const MOBS = {
  creeper: {
    rows: ['gGggGg', 'gkkGkk', 'Gkkgkk', 'ggkkGg', 'gkkkkg', 'gkggkg', 'GgggGg', 'gGgGgg', 'GggGgg', 'gGggGg', 'ggGggG', 'gGggGg', 'GG..GG', 'gg..gg'],
    palette: { g: '#5dbb46', G: '#3f8f2f', k: '#111' },
  },
  zombie: {
    rows: ['.gggg.', '.gkgk.', '.gggg.', '..gg..', 'tttttt', 'tttttt', 'tttttt', 'tttttt', 'bbbbbb', 'bb..bb', 'bb..bb', 'bb..bb', 'bb..bb', 'gg..gg'],
    palette: { g: '#4f8a3c', k: '#1a1a1a', t: '#2a9ca1', b: '#3b3fa0' },
  },
  skeleton: {
    rows: ['.wwww.', '.wkwk.', '.wwww.', '..ww..', '.wwww.', 'w.ww.w', '.wwww.', 'w.ww.w', '..ww..', '.w..w.', '.w..w.', '.w..w.', '.w..w.', '.w..w.'],
    palette: { w: '#d6d6d6', k: '#333' },
  },
  spider: {
    rows: ['l......l', '.l.kk.l.', 'l.kkkk.l', '.kkrrkk.', 'lkkkkkkl', '.l.kk.l.', 'l......l'],
    palette: { k: '#2a2a2a', r: '#d22', l: '#1a1a1a' },
  },
};

function drawMinecraft(ctx, g, t) {
  const m = g.match;
  const img = renderVoxel(g);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, MAIN_W, MAIN_H);
  ctx.imageSmoothingEnabled = true;
  const night = m?.night ?? 0;
  // the moon, a square
  if (night > 0.15 && night < 0.9) {
    const mx = bearingX(g, 0.9) , my = 90 + night * 60;
    ctx.fillStyle = '#f4f1dc'; ctx.fillRect(mx - 30, my - 30, 60, 60);
    ctx.fillStyle = '#d8d4b8'; ctx.fillRect(mx - 14, my - 10, 12, 12); ctx.fillRect(mx + 8, my + 6, 10, 10);
  }
  // the mob
  const en = enemyOnScreen(g);
  if (en) {
    const kind = en.e.kind === 'creeper' ? 'creeper' : en.e.kind;
    const mob = MOBS[kind] ?? MOBS.zombie;
    const cols = mob.rows[0].length;
    const p = (en.s * (kind === 'spider' ? 0.9 : 0.55)) / cols;
    const h = mob.rows.length * p;
    const fuse = en.e.kind === 'creeper' && en.e.fuse > 0 && Math.floor(g.clock * 10) % 2 === 0;
    ctx.save();
    if (fuse || en.e.hitFlash > 0.4) ctx.filter = fuse ? 'brightness(2.2)' : 'sepia(1) saturate(4) hue-rotate(-30deg)';
    pixels(ctx, mob.rows, mob.palette, en.x - (cols * p) / 2, en.y - h * 0.45, p);
    ctx.restore();
  }
  // mining: a block cracking in front
  if (!g.enemy && !g.dead && g.clock - g.mineAt < 0.3) {
    const s = 160, x = MAIN_W / 2 - s / 2, y = MAIN_H / 2 + 40;
    ctx.fillStyle = 'rgba(120,120,120,0.35)'; ctx.fillRect(x, y, s, s * 0.35);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 40, y); ctx.lineTo(x + 70, y + 30); ctx.lineTo(x + 60, y + 56); ctx.moveTo(x + 70, y + 30); ctx.lineTo(x + 110, y + 20); ctx.stroke();
  }
  // the held sword, swinging on a click
  const swing = clamp01(g.pressDepth) * 0.9;
  ctx.save();
  ctx.translate(MAIN_W - 250, MAIN_H - 60);
  ctx.rotate(-0.55 - swing);
  pixels(ctx, [
    '.......cc', '......cCc', '.....cCc.', '....cCc..', '...cCc...', 'k.cCc....', '.kCc.....', '.bk......', 'b..k.....',
  ], { c: '#4fe0d8', C: '#b8fff8', k: '#2a1c0c', b: '#5a3a1a' }, -20, -180, 20);
  ctx.restore();
  // crosshair
  if (!g.dead) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(MAIN_W / 2 - 14, MAIN_H / 2 - 2, 28, 4);
    ctx.fillRect(MAIN_W / 2 - 2, MAIN_H / 2 - 14, 4, 28);
  }
  drawMinecraftHud(ctx, g, m);
  // chat, bottom left
  const lines = g.chat.filter((c) => c.game === 'minecraft' && c.kind !== 'system' && g.now() - c.at < 9000).slice(-4);
  lines.forEach((c, k) => {
    const s = `<${c.who}> ${c.text}`;
    font(ctx, 700, 22, MONO);
    const w = ctx.measureText(s).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(10, MAIN_H - 200 - (lines.length - k) * 32, w, 30);
    text(ctx, s, 18, MAIN_H - 200 - (lines.length - k) * 32 + 22, { size: 22, weight: 700, family: MONO, color: c.kind === 'me' ? '#ffe070' : '#fff', shadow: '#3f3f3f' });
  });
  if (g.dead) {
    ctx.fillStyle = 'rgba(140,0,0,0.5)'; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
    text(ctx, 'You died!', MAIN_W / 2, 250, { size: 84, weight: 800, align: 'center', family: MONO, color: '#fff', shadow: '#3f3f3f' });
    text(ctx, g.dead.cause === 'explode' ? `${TAG} was blown up by Creeper` : `${TAG} was slain by ${g.dead.by}`, MAIN_W / 2, 320, { size: 26, weight: 700, align: 'center', family: MONO, color: '#fff', shadow: '#3f3f3f' });
    for (const [k, label] of [[0, 'Respawn'], [1, 'Title Screen']]) {
      const y = 380 + k * 70;
      ctx.fillStyle = '#6f6f6f'; ctx.fillRect(MAIN_W / 2 - 200, y, 400, 52);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(MAIN_W / 2 - 200, y, 400, 52);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(MAIN_W / 2 - 197, y + 3, 394, 4);
      text(ctx, label, MAIN_W / 2, y + 35, { size: 24, weight: 700, align: 'center', family: MONO, color: '#fff', shadow: '#3f3f3f' });
    }
  }
}

function drawMinecraftHud(ctx, g, m) {
  const slot = 56, n = 9;
  const x0 = MAIN_W / 2 - (slot * n) / 2, y0 = MAIN_H - slot - 12;
  ctx.fillStyle = 'rgba(40,40,40,0.75)'; ctx.fillRect(x0 - 4, y0 - 4, slot * n + 8, slot + 8);
  const icons = [
    [['.cc', 'cC.', 'k..'], { c: '#4fe0d8', C: '#b8fff8', k: '#5a3a1a' }],
    [['ccc', '.k.', '.k.'], { c: '#4fe0d8', k: '#5a3a1a' }],
    [['ggg', 'ddd', 'ddd'], { g: '#6aaa40', d: '#79553a' }],
    [['.y.', '.k.', '.k.'], { y: '#ffd24a', k: '#5a3a1a' }],
    [['bbb', 'bBb', '...'], { b: '#c08a3a', B: '#e0b060' }],
    [['.d.', 'dDd', '.d.'], { d: '#4fe0d8', D: '#e0ffff' }],
  ];
  for (let k = 0; k < n; k++) {
    const x = x0 + k * slot;
    ctx.fillStyle = 'rgba(139,139,139,0.55)'; ctx.fillRect(x + 2, y0 + 2, slot - 4, slot - 4);
    if (icons[k]) pixels(ctx, icons[k][0], icons[k][1], x + 13, y0 + 13, 10);
    if (k === 5) text(ctx, String(m.carried), x + slot - 6, y0 + slot - 6, { size: 20, weight: 800, align: 'right', family: MONO, color: '#fff', shadow: '#3f3f3f' });
  }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(x0 + 1, y0 + 1, slot - 2, slot - 2);
  // experience
  ctx.fillStyle = '#222'; ctx.fillRect(x0, y0 - 16, slot * n, 8);
  ctx.fillStyle = '#7ee04a'; ctx.fillRect(x0, y0 - 16, slot * n * ((m.kills * 0.13 + m.diamonds * 0.07) % 1), 8);
  // hearts and hunger
  const hp = g.dead ? 0 : m.hp / 10;
  for (let k = 0; k < 10; k++) {
    const x = x0 + k * 25, y = y0 - 46;
    const fill = clamp01(hp - k);
    pixels(ctx, ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#330' }, x, y, 3.4);
    if (fill > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 24 * fill, 24); ctx.clip();
      pixels(ctx, ['.rr.rr.', 'rWrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#e0231c', W: '#fff' }, x, y, 3.4);
      ctx.restore();
    }
    pixels(ctx, ['..bb', '.bbb', 'bbb.', 'w...'], { b: '#b06a2a', w: '#eee' }, x0 + slot * n - 25 - k * 25, y, 5);
  }
}

// --------------------------------------------------------------- Fortnite

const FN_WORLD = (() => {
  const out = [];
  for (let i = 0; i < 22; i++) {
    const r = hash(i * 4.4);
    out.push({ a: (i / 22) * TAU + hash(i) * 0.2, kind: r < 0.5 ? 'tree' : r < 0.75 ? 'house' : 'rock', s: 0.6 + hash(i * 8.8) * 0.8, near: hash(i * 3.3) });
  }
  return out;
})();

function drawFortnite(ctx, g, t) {
  const m = g.match;
  const horizon = MAIN_H * 0.5 + g.view.pitch * PX_PER_RAD;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2e8ef0'); sky.addColorStop(1, '#bfe8ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, MAIN_W, horizon + 2);
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let k = 0; k < 9; k++) {
    const x = bearingX(g, (k / 9) * TAU + t * 0.004), y = 70 + hash(k) * 130;
    if (x < -200 || x > MAIN_W + 200) continue;
    for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.ellipse(x + j * 42 - 60, y + (j % 2) * 10, 60, 30, 0, 0, TAU); ctx.fill(); }
  }
  // far mountains, near hills
  ctx.fillStyle = '#7fa7c9';
  ctx.beginPath(); ctx.moveTo(0, horizon);
  for (let x = 0; x <= MAIN_W; x += 20) ctx.lineTo(x, horizon - 50 - vnoise((x + camYaw(g) * PX_PER_RAD) * 0.004, 1) * 90);
  ctx.lineTo(MAIN_W, horizon); ctx.fill();
  const hills = ctx.createLinearGradient(0, horizon - 60, 0, MAIN_H);
  hills.addColorStop(0, '#5fc35a'); hills.addColorStop(1, '#2f8d3a');
  ctx.fillStyle = hills;
  ctx.beginPath(); ctx.moveTo(0, MAIN_H);
  for (let x = 0; x <= MAIN_W; x += 16) ctx.lineTo(x, horizon + 10 - vnoise((x + camYaw(g) * PX_PER_RAD) * 0.006, 5) * 60);
  ctx.lineTo(MAIN_W, MAIN_H); ctx.fill();
  // trees, houses, rocks
  const seen = FN_WORLD.map((f) => ({ f, x: bearingX(g, f.a) })).filter(({ x }) => x > -300 && x < MAIN_W + 300).sort((a, b) => a.f.near - b.f.near);
  for (const { f, x } of seen) {
    const s = f.s * (60 + f.near * 90);
    const base = horizon + 20 + f.near * 90;
    if (f.kind === 'tree') {
      ctx.fillStyle = '#7a4b2a'; ctx.fillRect(x - s * 0.08, base - s * 0.9, s * 0.16, s * 0.9);
      ctx.fillStyle = '#2f9a45'; ctx.beginPath(); ctx.arc(x, base - s * 1.05, s * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = '#48b85a'; ctx.beginPath(); ctx.arc(x - s * 0.12, base - s * 1.15, s * 0.25, 0, TAU); ctx.fill();
    } else if (f.kind === 'house') {
      ctx.fillStyle = '#e8dcc2'; ctx.fillRect(x - s * 0.7, base - s * 0.8, s * 1.4, s * 0.8);
      ctx.fillStyle = '#c0453a'; ctx.beginPath(); ctx.moveTo(x - s * 0.8, base - s * 0.8); ctx.lineTo(x, base - s * 1.35); ctx.lineTo(x + s * 0.8, base - s * 0.8); ctx.fill();
      ctx.fillStyle = '#4a86c8'; ctx.fillRect(x - s * 0.45, base - s * 0.6, s * 0.3, s * 0.25); ctx.fillRect(x + s * 0.15, base - s * 0.6, s * 0.3, s * 0.25);
    } else {
      ctx.fillStyle = '#8a8f98'; ctx.beginPath(); ctx.ellipse(x, base - s * 0.2, s * 0.5, s * 0.3, 0, Math.PI, TAU); ctx.fill();
    }
  }
  // the storm: a purple wall over part of the view, more of it as it closes
  const edge = bearingX(g, Math.PI * 0.55) + (1 - m.storm) * 900;
  const stormX = clamp(edge, -60, MAIN_W + 60);
  const storm = ctx.createLinearGradient(stormX - 80, 0, stormX + 120, 0);
  storm.addColorStop(0, 'rgba(150,60,230,0)'); storm.addColorStop(0.4, 'rgba(150,60,230,0.55)'); storm.addColorStop(1, 'rgba(90,20,160,0.75)');
  ctx.fillStyle = storm; ctx.fillRect(stormX - 80, 0, MAIN_W - stormX + 80, MAIN_H);
  ctx.strokeStyle = 'rgba(230,200,255,0.35)'; ctx.lineWidth = 2;
  for (let k = 0; k < 18; k++) {
    const x = stormX + 20 + ((k * 73 + t * 90) % Math.max(1, MAIN_W - stormX + 40));
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 30, MAIN_H); ctx.stroke();
  }
  if (m.storm > 0.9) { ctx.fillStyle = 'rgba(120,40,200,0.25)'; ctx.fillRect(0, 0, MAIN_W, MAIN_H); }
  // built walls
  const built = g.clock - g.builtAt;
  if (built < 5) {
    const a = clamp01(built * 4) * clamp01((5 - built) * 1.5);
    ctx.save(); ctx.globalAlpha = a;
    for (const side of [-1, 1]) {
      const x = MAIN_W / 2 + side * 330, w = 300, h = 360, y = MAIN_H * 0.62 - h;
      ctx.fillStyle = '#b07a44';
      ctx.beginPath(); ctx.moveTo(x - w / 2, y + 30); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x - w / 2, y + h + 30); ctx.fill();
      ctx.strokeStyle = '#6f4623'; ctx.lineWidth = 6;
      for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y + 30 + k * h / 5); ctx.lineTo(x + w / 2, y + k * h / 5); ctx.stroke(); }
      ctx.lineWidth = 10; ctx.strokeRect(x - w / 2, y, w, h + 30);
    }
    ctx.restore();
  }
  // the enemy
  const en = enemyOnScreen(g);
  if (en) drawToon(ctx, en, g);
  drawSkin(ctx, g, t);
  if (!g.dead) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(MAIN_W / 2, MAIN_H / 2, 26, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(MAIN_W / 2, MAIN_H / 2, 3, 0, TAU); ctx.fill();
  }
  drawFortniteHud(ctx, g, m);
  drawFeed(ctx, g, { x: 24, y: 260, left: true });
  if (g.dead) {
    ctx.fillStyle = 'rgba(20,10,40,0.5)'; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
    text(ctx, `#${m.placement ?? m.players}`, MAIN_W / 2, 330, { size: 150, weight: 900, align: 'center', color: '#fff', shadow: 'rgba(60,20,120,0.8)' });
    text(ctx, `ELIMINATED BY ${g.dead.by.toUpperCase()}`, MAIN_W / 2, 400, { size: 30, weight: 800, align: 'center', color: '#ffd84a', shadow: 'rgba(0,0,0,0.5)' });
  }
}

/** A cartoon enemy: body, head, a pickaxe. */
function drawToon(ctx, { x, y, s, e }, g) {
  const h = s * 1.5, w = s * 0.55;
  const top = y - h * 0.45 - (e.loom ? (1 - e.grow) * 180 : 0);
  const hue = (e.name.length * 47) % 360;
  ctx.save();
  if (e.hitFlash > 0) ctx.filter = `brightness(${1 + e.hitFlash * 0.8})`;
  ctx.fillStyle = `hsl(${hue}, 55%, 30%)`;
  ctx.fillRect(x - w * 0.34, top + h * 0.62, w * 0.28, h * 0.38);
  ctx.fillRect(x + w * 0.06, top + h * 0.62, w * 0.28, h * 0.38);
  ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
  rrect(ctx, x - w * 0.45, top + h * 0.22, w * 0.9, h * 0.44, w * 0.2); ctx.fill();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(x, top + h * 0.12, w * 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = `hsl(${(hue + 180) % 360}, 70%, 45%)`;
  ctx.fillRect(x - w * 0.34, top, w * 0.68, h * 0.08);
  ctx.fillStyle = '#222';
  ctx.fillRect(x - w * 0.9, top + h * 0.36, w * 0.7, h * 0.07);
  ctx.restore();
  // health and shield over its head
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 60, top - 30, 120, 14);
  ctx.fillStyle = '#4fb6ff'; ctx.fillRect(x - 60, top - 30, 120 * clamp01(e.hp * 2 - 1), 6);
  ctx.fillStyle = '#58d65a'; ctx.fillRect(x - 60, top - 22, 120 * clamp01(e.hp * 2), 6);
}

/** The fly's own skin, from behind: an orange hoodie, compound eyes, wings. */
function drawSkin(ctx, g, t) {
  const since = g.clock - g.shotAt;
  const kick = since < 0.15 ? (1 - since / 0.15) * 10 : 0;
  const bob = Math.sin(t * 5) * (g.enemy ? 2 : 4);
  // third person: the character stands left of the crosshair, not on it
  const x = MAIN_W * 0.3, y = MAIN_H - 30 + bob + kick;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.85, 0.85);
  // legs
  ctx.fillStyle = '#2b2d3a';
  ctx.fillRect(-58, -120, 44, 130); ctx.fillRect(14, -120, 44, 130);
  // wings
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.strokeStyle = '#c98a4c'; ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 40, -250); ctx.rotate(side * (0.5 + Math.sin(t * 20) * 0.03));
    ctx.beginPath(); ctx.ellipse(0, -40, 42, 110, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // hoodie
  ctx.fillStyle = '#d9731f';
  rrect(ctx, -86, -320, 172, 220, 50); ctx.fill();
  ctx.strokeStyle = '#a9541a'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-70, -200); ctx.lineTo(70, -200); ctx.moveTo(-74, -160); ctx.lineTo(74, -160); ctx.stroke();
  // arm reaching to the gun
  ctx.fillStyle = '#c4661b';
  ctx.save(); ctx.translate(70, -280); ctx.rotate(-0.9); rrect(ctx, 0, -20, 150, 44, 20); ctx.fill(); ctx.restore();
  // head and the eyes wrapping round it
  ctx.fillStyle = '#e3872f';
  ctx.beginPath(); ctx.arc(0, -370, 62, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b8321f';
  ctx.beginPath(); ctx.ellipse(-58, -380, 22, 34, 0.2, 0, TAU); ctx.ellipse(58, -380, 22, 34, -0.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a4a1a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-18, -428); ctx.lineTo(-30, -470); ctx.moveTo(18, -428); ctx.lineTo(30, -470); ctx.stroke();
  // the gun
  ctx.fillStyle = '#2a2c34';
  ctx.save(); ctx.translate(180, -420); ctx.rotate(-0.25); ctx.fillRect(0, 0, 160, 24); ctx.fillStyle = '#6a5a3a'; ctx.fillRect(-30, 14, 60, 28); ctx.restore();
  ctx.restore();
}

function drawFortniteHud(ctx, g, m) {
  // minimap
  const cx = MAIN_W - 110, cy = 110, r = 86;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  ctx.fillStyle = '#4a9e4a'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = '#3d7fc4'; ctx.fillRect(cx - r, cy + 30, r * 2, 20);
  ctx.fillStyle = 'rgba(140,50,220,0.6)'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const safe = r * (1 - m.storm * 0.85);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx + 10, cy - 5, safe, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + 10, cy - 5, safe, 0, TAU); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy + 7); ctx.lineTo(cx - 7, cy + 7); ctx.fill();
  // players left, eliminations, storm
  const row = (y, icon, value) => {
    text(ctx, icon, MAIN_W - 190, y, { size: 22, weight: 700, color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
    text(ctx, value, MAIN_W - 160, y, { size: 24, weight: 800, color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
  };
  row(232, '👤', String(m.players));
  row(264, '⌖', String(m.kills));
  row(296, '⏱', mmss(Math.max(0, (1 - m.storm) * 150)));
  // health and shield
  const hp = g.dead ? 0 : m.hp;
  const bx = MAIN_W / 2 - 200, by = MAIN_H - 70;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, by - 26, 400, 20); ctx.fillRect(bx, by, 400, 24);
  ctx.fillStyle = '#48a8ff'; ctx.fillRect(bx, by - 26, 400 * clamp01((hp - 50) / 50), 20);
  ctx.fillStyle = '#58d65a'; ctx.fillRect(bx, by, 400 * clamp01(hp / 100), 24);
  text(ctx, String(Math.round(hp)), bx - 12, by + 20, { size: 22, weight: 800, align: 'right', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
  // the loadout
  const rar = ['#8b8f98', '#4fb04a', '#3f8ee0', '#a14fe0', '#e0a03a'];
  rar.forEach((c, k) => {
    const x = MAIN_W - 380 + k * 70, y = MAIN_H - 90;
    rrect(ctx, x, y, 62, 62, 6); ctx.fillStyle = c; ctx.fill();
    if (k === 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 10, y + 26, 42, 10);
  });
  text(ctx, '5 / 32', MAIN_W - 40, MAIN_H - 104, { size: 22, weight: 800, align: 'right', color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
  [['#b07a44', 480 + m.walls * 10], ['#9aa0a8', 210], ['#6c7480', 90]].forEach(([c, n], k) => {
    const y = MAIN_H - 250 + k * 36;
    ctx.fillStyle = c; ctx.fillRect(MAIN_W - 130, y, 26, 26);
    text(ctx, String(Math.max(0, n - m.walls * 10)), MAIN_W - 96, y + 22, { size: 20, weight: 800, color: '#fff', shadow: 'rgba(0,0,0,0.5)' });
  });
}

// ----------------------------------------------------------------- League

let leagueMap = null;
const MAP_W = 3000;
const MAP_H = 1600;

/** The rift, painted once: jungle, a lane corner to corner, the river across it, towers. */
function buildLeagueMap() {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f3a24'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  for (let k = 0; k < 1400; k++) {
    const x = hash(k * 1.1) * MAP_W, y = hash(k * 2.3) * MAP_H, r = 10 + hash(k * 3.7) * 40;
    ctx.fillStyle = `rgba(${20 + hash(k) * 30}, ${60 + hash(k * 5) * 50}, ${25 + hash(k * 7) * 20}, 0.5)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // the river, top left to bottom right
  ctx.strokeStyle = '#2d6f8f'; ctx.lineWidth = 170; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-100, -200); ctx.bezierCurveTo(900, 500, 1900, 900, MAP_W + 100, MAP_H + 200); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,210,230,0.25)'; ctx.lineWidth = 60;
  ctx.beginPath(); ctx.moveTo(-100, -170); ctx.bezierCurveTo(900, 520, 1900, 930, MAP_W + 100, MAP_H + 230); ctx.stroke();
  // the lane, bottom left to top right
  ctx.strokeStyle = '#8a7650'; ctx.lineWidth = 230;
  ctx.beginPath(); ctx.moveTo(-100, MAP_H + 100); ctx.lineTo(MAP_W + 100, -100); ctx.stroke();
  ctx.strokeStyle = '#a58f63'; ctx.lineWidth = 160;
  ctx.beginPath(); ctx.moveTo(-100, MAP_H + 100); ctx.lineTo(MAP_W + 100, -100); ctx.stroke();
  for (let k = 0; k < 500; k++) {
    const u = hash(k * 9.1), v = (hash(k * 4.4) - 0.5) * 150;
    ctx.fillStyle = 'rgba(80,65,40,0.35)';
    ctx.beginPath(); ctx.arc(u * MAP_W + v * 0.5, MAP_H - u * MAP_H + v * 0.9, 3 + hash(k) * 6, 0, TAU); ctx.fill();
  }
  // brush beside the lane
  for (let k = 0; k < 16; k++) {
    const u = 0.08 + k * 0.058, side = k % 2 ? 1 : -1;
    const x = u * MAP_W + side * 210, y = MAP_H - u * MAP_H + side * 180;
    for (let j = 0; j < 7; j++) {
      ctx.fillStyle = j % 2 ? '#1a4a1f' : '#236128';
      ctx.beginPath(); ctx.arc(x + (hash(k * 7 + j) - 0.5) * 120, y + (hash(k * 11 + j) - 0.5) * 70, 34, 0, TAU); ctx.fill();
    }
  }
  // towers
  for (const [u, blue] of [[0.18, true], [0.36, true], [0.64, false], [0.82, false]]) {
    const x = u * MAP_W + 140, y = MAP_H - u * MAP_H + 90;
    ctx.fillStyle = '#5b5f66'; ctx.beginPath(); ctx.arc(x, y, 46, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a8088'; ctx.beginPath(); ctx.arc(x, y, 32, 0, TAU); ctx.fill();
    ctx.fillStyle = blue ? '#4fb0ff' : '#ff5a4a';
    ctx.beginPath(); ctx.moveTo(x, y - 60); ctx.lineTo(x + 16, y - 20); ctx.lineTo(x, y); ctx.lineTo(x - 16, y - 20); ctx.fill();
  }
  return c;
}

function drawLeague(ctx, g, t) {
  if (!leagueMap) leagueMap = buildLeagueMap();
  const m = g.match;
  // the camera stays on the fly's champion, which walks up and down the lane;
  // turning the view nudges the camera round it, never away from it
  const u = 0.5 + Math.sin((m?.t ?? t) * 0.05) * 0.08;
  const heroX = u * MAP_W, heroY = MAP_H - u * MAP_H;
  const pan = Math.sin(camYaw(g));
  const camX = heroX + pan * 240 - MAIN_W / 2;
  const camY = heroY - pan * 80 - MAIN_H / 2 + g.view.pitch * 300;
  ctx.drawImage(leagueMap, -camX, -camY);
  const toScreen = (wx, wy) => [wx - camX, wy - camY];
  // minion waves meeting in the middle of the screen
  for (let k = 0; k < 12; k++) {
    const blue = k < 6;
    const phase = ((m?.t ?? t) * 0.12 + k * 0.05) % 1;
    const du = blue ? -0.06 + phase * 0.05 : 0.06 - phase * 0.05;
    const wu = u + du + (k % 3) * 0.004;
    const off = ((k % 3) - 1) * 26;
    const [x, y] = toScreen(wu * MAP_W + off, MAP_H - wu * MAP_H + off);
    ctx.fillStyle = blue ? '#3f7fd8' : '#d84a3f';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 16, y - 26, 32, 5);
    ctx.fillStyle = blue ? '#58d65a' : '#e04a3a'; ctx.fillRect(x - 16, y - 26, 32 * (0.3 + hash(k + Math.floor((m?.t ?? 0) * 0.7)) * 0.7), 5);
  }
  // the enemy champion
  const en = enemyOnScreen(g);
  const [hx, hy] = toScreen(heroX, heroY);
  if (en) {
    const ex = hx + en.e.err * PX_PER_RAD * 0.9 + 200 * Math.sign(en.e.err || 1);
    const ey = hy - 60 - (en.e.loom ? (1 - en.e.grow) * 160 : 0);
    if (en.e.loom) {
      // a gank: a red area growing on the ground under the fly
      ctx.fillStyle = `rgba(230,40,30,${0.15 + en.e.grow * 0.3})`;
      ctx.beginPath(); ctx.arc(hx, hy, 60 + en.e.grow * 160, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,60,0.8)'; ctx.lineWidth = 4; ctx.stroke();
    }
    drawChampion(ctx, ex, ey, { enemy: true, name: en.e.name, hp: en.e.hp, flash: en.e.hitFlash, scale: 1 + (en.e.loom ? en.e.grow * 0.5 : 0) });
    // the fly's shots flying at it
    if (g.clock - g.shotAt < 0.3) {
      const k = (g.clock - g.shotAt) / 0.3;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(hx + (ex - hx) * k, hy - 30 + (ey - hy + 30) * k, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(hx, hy - 30); ctx.lineTo(hx + (ex - hx) * Math.min(1, k * 1.6), hy - 30 + (ey - hy) * Math.min(1, k * 1.6)); ctx.stroke();
    }
  }
  if (!g.dead) drawChampion(ctx, hx, hy, { enemy: false, name: TAG, hp: (m?.hp ?? 100) / 100, fly: true });
  // the cursor
  const cx = MAIN_W / 2 + (en ? en.e.err * 60 : 40), cy = MAIN_H / 2 - 60;
  ctx.fillStyle = en ? '#e0503a' : '#c8aa6e'; ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 26, cy + 16); ctx.lineTo(cx + 12, cy + 20); ctx.lineTo(cx + 18, cy + 34); ctx.lineTo(cx + 10, cy + 36); ctx.lineTo(cx + 5, cy + 22); ctx.lineTo(cx - 4, cy + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  drawLeagueHud(ctx, g, m);
  // announcements
  const r = g.lastResult;
  const age = r ? g.now() - r.at : 1e9;
  if (r && age < 2200 && (r.kind === 'kill' || r.kind === 'death')) {
    const msg = r.kind === 'death' ? 'You have been slain' : r.streak >= 3 ? 'Triple kill!' : r.streak === 2 ? 'Double kill!' : 'You have slain an enemy';
    text(ctx, msg, MAIN_W / 2, 150, { size: 36, weight: 800, align: 'center', color: r.kind === 'death' ? '#ff6a5a' : '#e8d9a8', shadow: 'rgba(0,0,0,0.7)' });
  }
  if (g.dead) {
    ctx.fillStyle = 'rgba(60,60,70,0.55)'; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
    text(ctx, `Respawning in ${Math.max(1, Math.ceil(2.8 - g.dead.t))}`, MAIN_W / 2, MAIN_H / 2, { size: 40, weight: 800, align: 'center', color: '#e8d9a8', shadow: 'rgba(0,0,0,0.6)' });
  }
}

function drawChampion(ctx, x, y, { enemy, name, hp, flash = 0, scale = 1, fly = false }) {
  const r = 30 * scale;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 1.1, r * 0.4, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = enemy ? '#e0503a' : '#4fb0ff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 1.2, r * 0.45, 0, 0, TAU); ctx.stroke();
  if (fly) drawFly(ctx, x, y - 6, r * 2.3);
  else {
    // a spider of a champion
    ctx.strokeStyle = '#1a1010'; ctx.lineWidth = 5;
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * r * 1.2, y - r * 0.8 + k * 12, x + s * r * 1.6, y + r * 0.3 + k * 10); ctx.stroke(); }
    }
    ctx.fillStyle = flash > 0.3 ? '#fff' : '#3a1a2a';
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff3030';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x - 12 + k * 8, y - r * 0.4, 3, 0, TAU); ctx.fill(); }
  }
  // name and health bar
  const bw = 120 * Math.min(1.4, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - bw / 2, y - r * 2 - 10, bw, 14);
  ctx.fillStyle = enemy ? '#d8403a' : '#58d65a'; ctx.fillRect(x - bw / 2 + 2, y - r * 2 - 8, (bw - 4) * clamp01(hp), 10);
  ctx.fillStyle = '#2a2a2a';
  for (let k = 1; k < 6; k++) ctx.fillRect(x - bw / 2 + k * bw / 6, y - r * 2 - 8, 1, 10);
  text(ctx, name, x, y - r * 2 - 18, { size: 16, weight: 700, align: 'center', color: enemy ? '#ffb0a8' : '#d8ecff', shadow: 'rgba(0,0,0,0.8)' });
}

function drawLeagueHud(ctx, g, m) {
  const gold = '#c8aa6e';
  // the bottom panel
  const px = MAIN_W / 2 - 300, py = MAIN_H - 128;
  rrect(ctx, px, py, 600, 118, 10); ctx.fillStyle = 'rgba(10,20,30,0.9)'; ctx.fill();
  ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#0a1420'; ctx.beginPath(); ctx.arc(px + 60, py + 58, 46, 0, TAU); ctx.fill();
  ctx.strokeStyle = gold; ctx.stroke();
  drawFly(ctx, px + 60, py + 56, 70);
  const cds = ['Q', 'W', 'E', 'R'];
  cds.forEach((k, i) => {
    const x = px + 124 + i * 70, y = py + 14;
    ctx.fillStyle = ['#2a6fb0', '#8a3fb0', '#2aa07a', '#c05030'][i]; ctx.fillRect(x, y, 58, 58);
    const cd = (g.clock * (0.4 + i * 0.13) + i * 0.3) % 1;
    if (cd < 0.6) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(x + 29, y + 29); ctx.arc(x + 29, y + 29, 42, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd / 0.6)); ctx.fill(); }
    ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.strokeRect(x, y, 58, 58);
    text(ctx, k, x + 29, y + 72, { size: 14, weight: 700, align: 'center', color: '#bbb' });
  });
  for (const [i, c] of [[0, '#e8c040'], [1, '#e06030']]) { ctx.fillStyle = c; ctx.fillRect(px + 410 + i * 44, py + 14, 38, 38); ctx.strokeStyle = gold; ctx.strokeRect(px + 410 + i * 44, py + 14, 38, 38); }
  const hp = g.dead ? 0 : (m?.hp ?? 100) / 100;
  ctx.fillStyle = '#111'; ctx.fillRect(px + 124, py + 88, 450, 12); ctx.fillRect(px + 124, py + 102, 450, 8);
  ctx.fillStyle = '#2ea44a'; ctx.fillRect(px + 124, py + 88, 450 * hp, 12);
  ctx.fillStyle = '#3a78d8'; ctx.fillRect(px + 124, py + 102, 450 * 0.7, 8);
  text(ctx, `${m?.gold ?? 0}`, px + 520, py + 46, { size: 22, weight: 800, align: 'right', color: '#f2d27a' });
  ctx.fillStyle = '#f2d27a'; ctx.beginPath(); ctx.arc(px + 540, py + 38, 9, 0, TAU); ctx.fill();
  // score, K/D/A, CS, clock
  rrect(ctx, MAIN_W / 2 - 120, 10, 240, 44, 6); ctx.fillStyle = 'rgba(10,20,30,0.85)'; ctx.fill();
  text(ctx, String(m?.teamScore ?? 0), MAIN_W / 2 - 40, 43, { size: 28, weight: 800, align: 'center', color: '#6ab8ff' });
  text(ctx, '⚔', MAIN_W / 2, 42, { size: 22, weight: 700, align: 'center', color: '#ddd' });
  text(ctx, String(m?.enemyScore ?? 0), MAIN_W / 2 + 40, 43, { size: 28, weight: 800, align: 'center', color: '#ff7a6a' });
  rrect(ctx, MAIN_W - 330, 10, 316, 40, 6); ctx.fillStyle = 'rgba(10,20,30,0.85)'; ctx.fill();
  text(ctx, `${m?.kills ?? 0}/${m?.deaths ?? 0}/${m?.assists ?? 0}`, MAIN_W - 314, 38, { size: 22, weight: 700, color: '#e8e8e8' });
  text(ctx, `${m?.cs ?? 0} cs`, MAIN_W - 190, 38, { size: 22, weight: 700, color: '#e8e8e8' });
  text(ctx, mmss((m?.t ?? 0) * 20 + 180), MAIN_W - 28, 38, { size: 22, weight: 700, align: 'right', color: '#e8e8e8', family: MONO });
  // minimap
  const mx = MAIN_W - 210, my = MAIN_H - 210;
  ctx.fillStyle = '#12301a'; ctx.fillRect(mx, my, 196, 196);
  ctx.strokeStyle = '#8a7650'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(mx + 10, my + 186); ctx.lineTo(mx + 186, my + 10); ctx.stroke();
  ctx.strokeStyle = '#2d6f8f'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(mx + 10, my + 10); ctx.lineTo(mx + 186, my + 186); ctx.stroke();
  ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.strokeRect(mx, my, 196, 196);
  ctx.fillStyle = '#4fb0ff'; ctx.beginPath(); ctx.arc(mx + 98, my + 98, 8, 0, TAU); ctx.fill();
  if (g.enemy) { ctx.fillStyle = '#ff5040'; ctx.beginPath(); ctx.arc(mx + 118, my + 80, 7, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(mx + 70, my + 74, 60, 44);
}

// ------------------------------------------------------------ between matches

function drawQueue(ctx, g, t) {
  if (CUSTOM[g.game]?.queue) { CUSTOM[g.game].queue(ctx, g, t); return; }
  const p = g.phaseProgress;
  const d = GAMES[g.game];
  const found = p > 0.78;
  if (g.game === 'minecraft') {
    // the dirt screen
    for (let y = 0; y < MAIN_H; y += 48) {
      for (let x = 0; x < MAIN_W; x += 48) {
        for (let k = 0; k < 16; k++) {
          const l = 22 + hash2(x + k, y + k * 3) * 14;
          ctx.fillStyle = `hsl(28, 30%, ${l}%)`;
          ctx.fillRect(x + (k % 4) * 12, y + Math.floor(k / 4) * 12, 12, 12);
        }
      }
    }
    text(ctx, found ? 'Loading terrain' : 'Joining world', MAIN_W / 2, MAIN_H / 2 - 20, { size: 34, weight: 700, align: 'center', family: MONO, color: '#fff', shadow: '#3f3f3f' });
    ctx.fillStyle = '#333'; ctx.fillRect(MAIN_W / 2 - 200, MAIN_H / 2 + 10, 400, 10);
    ctx.fillStyle = '#7ee04a'; ctx.fillRect(MAIN_W / 2 - 200, MAIN_H / 2 + 10, 400 * p, 10);
    return;
  }
  const bg = { lol: ['#0a1428', '#0f2a3a'], fortnite: ['#2a1a6a', '#1c6ad8'], cs2: ['#1a1d22', '#2c3038'] }[g.game];
  const grad = ctx.createLinearGradient(0, 0, MAIN_W, MAIN_H);
  grad.addColorStop(0, bg[0]); grad.addColorStop(1, bg[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
  if (g.game === 'fortnite') {
    // the lobby: its skin, turning slowly
    ctx.save(); ctx.translate(MAIN_W * 0.5, MAIN_H * 0.9); ctx.scale(0.8, 0.8); ctx.translate(-MAIN_W * 0.4, -MAIN_H + 40);
    drawSkin(ctx, { clock: 0, shotAt: -9, enemy: null }, t);
    ctx.restore();
    text(ctx, found ? 'DROPPING IN' : 'MATCHMAKING', MAIN_W / 2, 90, { size: 54, weight: 900, align: 'center', color: '#ffd84a', shadow: 'rgba(0,0,0,0.4)' });
    text(ctx, `${mmss(g.t)}`, MAIN_W / 2, 136, { size: 28, weight: 800, align: 'center', color: '#fff' });
    return;
  }
  if (g.game === 'cs2') {
    text(ctx, found ? 'YOUR MATCH IS READY' : 'SEARCHING', MAIN_W / 2, 230, { size: 48, weight: 800, align: 'center', color: '#e8e8e8' });
    text(ctx, mmss(g.t), MAIN_W / 2, 280, { size: 28, weight: 700, align: 'center', color: '#9aa', family: MONO });
    if (found) {
      const pressed = g.accepted;
      rrect(ctx, MAIN_W / 2 - 170, 330, 340, 110, 8);
      ctx.fillStyle = pressed ? '#3f8a3f' : '#4fb24f'; ctx.fill();
      text(ctx, pressed ? 'ACCEPTED' : 'ACCEPT', MAIN_W / 2, 402, { size: 44, weight: 900, align: 'center', color: '#fff' });
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(MAIN_W / 2 - 170, 460, 340 * (1 - clamp01((p - 0.78) / 0.22)), 6);
      drawCursor(ctx, MAIN_W / 2 + 40, 400);
    }
    return;
  }
  // League: the gold ring
  ctx.strokeStyle = '#c8aa6e'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(MAIN_W / 2, MAIN_H / 2 - 20, 120, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,170,110,0.5)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(MAIN_W / 2, MAIN_H / 2 - 20, 138, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
  drawFly(ctx, MAIN_W / 2, MAIN_H / 2 - 20, 140);
  text(ctx, found ? 'MATCH FOUND' : 'FINDING MATCH', MAIN_W / 2, MAIN_H / 2 + 170, { size: 40, weight: 800, align: 'center', color: '#e8d9a8' });
  text(ctx, `${d.short} · ranked solo/duo · ${mmss(g.t)}`, MAIN_W / 2, MAIN_H / 2 + 210, { size: 20, weight: 600, align: 'center', color: '#a8b4c0' });
}

function drawResult(ctx, g, t) {
  const r = g.result;
  if (!r) return;
  if (CUSTOM[r.game]?.result) { CUSTOM[r.game].result(ctx, g, t); return; }
  const k = clamp01(g.t * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.5 * k})`;
  ctx.fillRect(0, 0, MAIN_W, MAIN_H);
  const good = r.won;
  let title, sub;
  if (r.game === 'lol') { title = good ? 'VICTORY' : 'DEFEAT'; sub = `${r.kills}/${r.deaths} · ${r.delta > 0 ? '+' : ''}${r.delta} LP`; }
  else if (r.game === 'cs2') { title = good ? 'VICTORY' : 'DEFEAT'; sub = `${r.rounds.us} : ${r.rounds.them} · ${r.delta > 0 ? '+' : ''}${r.delta} rating`; }
  else if (r.game === 'fortnite') { title = good ? '#1 VICTORY' : `#${r.placement}`; sub = `${r.kills} elimination${r.kills === 1 ? '' : 's'}${!good && r.placement <= 3 ? ' · so close' : ''}`; }
  else if (r.game === 'minecraft') { title = good ? 'SUNRISE' : 'YOU LOST YOUR DIAMONDS'; sub = good ? `survived the night · ${r.carried} diamonds home` : `${r.deaths} deaths · back to spawn`; }
  else { title = good ? 'MISSION COMPLETE' : 'YOU DIED'; sub = `${r.kills} kills · ${r.deaths} deaths · ${formatRank(r.game, g.career[r.game].rank)}`; }
  const color = good ? (r.game === 'fortnite' ? '#ffd84a' : '#f0d27a') : '#ff5a4a';
  ctx.save();
  ctx.translate(MAIN_W / 2, MAIN_H / 2 - 20);
  ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
  if (good) {
    ctx.strokeStyle = 'rgba(255,220,120,0.25)'; ctx.lineWidth = 18;
    for (let j = 0; j < 12; j++) { const a = j / 12 * TAU + t * 0.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 700, Math.sin(a) * 700); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(10,12,20,0.8)'; ctx.fillRect(-MAIN_W / 2, -80, MAIN_W, 170);
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-MAIN_W / 2, -80); ctx.lineTo(MAIN_W / 2, -80); ctx.moveTo(-MAIN_W / 2, 90); ctx.lineTo(MAIN_W / 2, 90); ctx.stroke();
  text(ctx, title, 0, 30, { size: title.length > 12 ? 64 : 104, weight: 900, align: 'center', color, shadow: 'rgba(0,0,0,0.6)' });
  text(ctx, sub, 0, 72, { size: 24, weight: 600, align: 'center', color: '#dfe4ea' });
  ctx.restore();
}

/** Generic desktop icons for the four games: a sword, a grass block, a pickaxe, a crosshair. */
function drawGameIcon(ctx, id, x, y, s) {
  if (CUSTOM[id]?.icon) { CUSTOM[id].icon(ctx, x, y, s); return; }
  rrect(ctx, x, y, s, s, s * 0.2);
  ctx.fillStyle = { lol: '#0f2a3a', minecraft: '#5a3a1f', fortnite: '#4a2a9a', cs2: '#2a2d33', rdr2: '#5a1a14', gow: '#1f2a33', gowr: '#16283f' }[id] ?? '#333'; ctx.fill();
  ctx.save(); ctx.translate(x + s / 2, y + s / 2);
  if (id === 'lol') {
    ctx.strokeStyle = '#c8aa6e'; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.25); ctx.lineTo(s * 0.25, -s * 0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.05); ctx.lineTo(-s * 0.05, s * 0.2); ctx.stroke();
  } else if (id === 'minecraft') {
    ctx.fillStyle = '#79553a'; ctx.fillRect(-s * 0.28, -s * 0.28, s * 0.56, s * 0.56);
    ctx.fillStyle = '#6aaa40'; ctx.fillRect(-s * 0.28, -s * 0.28, s * 0.56, s * 0.18);
  } else if (id === 'fortnite') {
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = s * 0.08;
    ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.25, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.28); ctx.lineTo(0, s * 0.28); ctx.stroke();
  } else if (id === 'cs2') {
    ctx.strokeStyle = '#4dff6a'; ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.stroke();
    for (const [a, b] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { ctx.beginPath(); ctx.moveTo(a * s * 0.12, b * s * 0.12); ctx.lineTo(a * s * 0.32, b * s * 0.32); ctx.stroke(); }
  } else if (id === 'rdr2') {
    // a red "R"-less badge: a revolver cylinder
    ctx.fillStyle = '#e8d6b0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a1a14';
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.14, s * 0.05, 0, TAU); ctx.fill(); }
  } else {
    // an axe head
    ctx.fillStyle = id === 'gowr' ? '#e0703a' : '#9fc7e0';
    ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.3); ctx.lineTo(s * 0.26, -s * 0.22); ctx.quadraticCurveTo(s * 0.16, 0, s * 0.26, s * 0.12); ctx.lineTo(-s * 0.05, -s * 0.02); ctx.fill();
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-s * 0.1, -s * 0.32, s * 0.07, s * 0.62);
  }
  ctx.restore();
}

function drawDesktop(ctx, g, t, { cursor = null, focus = null } = {}) {
  const grad = ctx.createLinearGradient(0, 0, MAIN_W, MAIN_H);
  grad.addColorStop(0, '#1a1030'); grad.addColorStop(0.6, '#2a1650'); grad.addColorStop(1, '#0e1a3a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
  ctx.globalAlpha = 0.18; drawFly(ctx, MAIN_W * 0.62, MAIN_H * 0.45, 420); ctx.globalAlpha = 1;
  text(ctx, 'Fly Lab', MAIN_W * 0.62, MAIN_H * 0.45 + 250, { size: 30, weight: 700, align: 'center', color: 'rgba(246,234,214,0.35)' });
  // icons down the left
  const icons = [...GAME_ORDER.map((id) => ({ id, label: GAMES[id].short })), { id: null, label: 'homework_final_v3.docx' }, { id: null, label: 'Recycle Bin' }];
  icons.forEach((ic, k) => {
    const x = 40 + Math.floor(k / 5) * 112, y = 40 + (k % 5) * 104;
    if (focus === ic.id && ic.id) { rrect(ctx, x - 12, y - 8, 104, 100, 8); ctx.fillStyle = 'rgba(120,160,255,0.3)'; ctx.fill(); }
    if (ic.id) drawGameIcon(ctx, ic.id, x + 10, y, 60);
    else { ctx.fillStyle = k === 4 ? '#3a78d8' : '#8a8f98'; ctx.fillRect(x + 20, y + 4, 40, 52); }
    text(ctx, ic.label.length > 12 ? `${ic.label.slice(0, 11)}…` : ic.label, x + 40, y + 80, { size: 13, weight: 600, align: 'center', color: '#fff', shadow: 'rgba(0,0,0,0.6)' });
  });
  // the taskbar
  ctx.fillStyle = 'rgba(12,10,24,0.85)'; ctx.fillRect(0, MAIN_H - 48, MAIN_W, 48);
  GAME_ORDER.forEach((id, k) => drawGameIcon(ctx, id, MAIN_W / 2 - GAME_ORDER.length * 28 + k * 56, MAIN_H - 42, 36));
  const clock = new Date(2026, 8, 25, 23, 12 + Math.floor(g.clock / 60));
  text(ctx, `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`, MAIN_W - 20, MAIN_H - 18, { size: 16, weight: 600, align: 'right', color: '#ddd' });
  if (cursor) drawCursor(ctx, cursor[0], cursor[1]);
}

function drawRageQuit(ctx, g, t) {
  const p = g.phaseProgress;
  if (p < 0.28) {
    // still in the game, frozen, with the quit dialog on top
    drawPlay(ctx, g, t);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
    rrect(ctx, MAIN_W / 2 - 250, MAIN_H / 2 - 110, 500, 220, 10); ctx.fillStyle = '#1c1e24'; ctx.fill();
    text(ctx, 'Quit to desktop?', MAIN_W / 2, MAIN_H / 2 - 40, { size: 34, weight: 700, align: 'center', color: '#fff' });
    rrect(ctx, MAIN_W / 2 - 200, MAIN_H / 2 + 20, 180, 60, 6); ctx.fillStyle = '#d6322a'; ctx.fill();
    text(ctx, 'YES', MAIN_W / 2 - 110, MAIN_H / 2 + 60, { size: 26, weight: 800, align: 'center', color: '#fff' });
    rrect(ctx, MAIN_W / 2 + 20, MAIN_H / 2 + 20, 180, 60, 6); ctx.fillStyle = '#3a3d46'; ctx.fill();
    text(ctx, 'no', MAIN_W / 2 + 110, MAIN_H / 2 + 60, { size: 22, weight: 600, align: 'center', color: '#aaa' });
    drawCursor(ctx, MAIN_W / 2 - 100, MAIN_H / 2 + 50);
    // the keys it hit on the way
    text(ctx, 'ALT + F4', MAIN_W / 2, 110, { size: 64, weight: 900, align: 'center', color: '#ff5a4a', shadow: 'rgba(0,0,0,0.6)' });
    return;
  }
  drawDesktop(ctx, g, t);
  // the game window collapsing into the taskbar
  const k = clamp01((p - 0.28) / 0.18);
  if (k < 1) {
    const w = MAIN_W * (1 - k * 0.95), h = MAIN_H * (1 - k * 0.95);
    ctx.fillStyle = `rgba(20,20,30,${1 - k})`;
    ctx.fillRect(MAIN_W / 2 - w / 2, (MAIN_H - 48) * k + (MAIN_H / 2 - h / 2) * (1 - k), w, h);
  }
  if (p > 0.5) {
    text(ctx, 'uninstall?', MAIN_W / 2 + 120, MAIN_H / 2 - 120, { size: 44, weight: 800, align: 'center', color: 'rgba(255,255,255,0.12)' });
  }
}

function drawSwitching(ctx, g, t) {
  const p = g.phaseProgress;
  const to = g.nextGame ?? g.game;
  const k = GAME_ORDER.indexOf(to);
  const target = [80 + Math.floor(k / 5) * 112, 40 + (k % 5) * 104 + 30];
  const move = smooth(clamp01(p / 0.5));
  const cursor = [MAIN_W / 2 + (target[0] - MAIN_W / 2) * move, MAIN_H / 2 + (target[1] - MAIN_H / 2) * move];
  drawDesktop(ctx, g, t, { cursor, focus: p > 0.45 ? to : null });
  if (p > 0.62) {
    // the splash of the next game
    const s = clamp01((p - 0.62) / 0.2);
    ctx.fillStyle = `rgba(8,8,14,${0.85 * s})`; ctx.fillRect(MAIN_W / 2 - 280, MAIN_H / 2 - 150, 560, 300);
    ctx.globalAlpha = s;
    drawGameIcon(ctx, to, MAIN_W / 2 - 50, MAIN_H / 2 - 120, 100);
    text(ctx, GAMES[to].name, MAIN_W / 2, MAIN_H / 2 + 40, { size: 34, weight: 800, align: 'center', color: '#fff' });
    ctx.fillStyle = '#333'; ctx.fillRect(MAIN_W / 2 - 180, MAIN_H / 2 + 80, 360, 8);
    ctx.fillStyle = GAMES[to].accent; ctx.fillRect(MAIN_W / 2 - 180, MAIN_H / 2 + 80, 360 * clamp01((p - 0.62) / 0.38), 8);
    ctx.globalAlpha = 1;
  }
}

// =========================================================== the side monitor

const AVATAR = { [TAG]: '#d9731f', mothman: '#8a6fd8', BeeKay: '#e0b040', larva_main: '#6ac0a0', Aphid: '#58b848', xX_wasp_Xx: '#d04a4a' };
const avatarColor = (name) => AVATAR[name] ?? `hsl(${(name.length * 67) % 360}, 50%, 55%)`;

function avatar(ctx, name, x, y, r, speaking = 0) {
  if (speaking > 0.05) {
    ctx.strokeStyle = `rgba(35,165,90,${0.5 + speaking * 0.5})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = avatarColor(name);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (name === TAG) drawFly(ctx, x, y + 1, r * 1.9, { wings: false });
  else text(ctx, name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase(), x, y + r * 0.38, { size: r * 1.05, weight: 800, align: 'center', color: '#fff' });
}

/** Wrap a message into lines that fit. */
function wrapLines(ctx, s, width) {
  const words = s.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawSide(ctx, g) {
  const W = SIDE_W, H = SIDE_H;
  ctx.fillStyle = '#313338'; ctx.fillRect(0, 0, W, H);
  // the server rail
  ctx.fillStyle = '#1e1f22'; ctx.fillRect(0, 0, 64, H);
  ['#d9731f', '#5865f2', '#3ba55c', '#eb459e'].forEach((c, k) => {
    ctx.fillStyle = c;
    rrect(ctx, 12, 14 + k * 58, 40, 40, k === 0 ? 12 : 20); ctx.fill();
  });
  drawFly(ctx, 32, 34, 34, { wings: false });
  // header
  ctx.fillStyle = '#2b2d31'; ctx.fillRect(64, 0, W - 64, 56);
  text(ctx, '🔊', 80, 36, { size: 20, weight: 600, color: '#949ba4' });
  text(ctx, 'squad-voice', 112, 36, { size: 20, weight: 700, color: '#f2f3f5' });
  text(ctx, GAMES[g.nextGame ?? g.game].short, W - 16, 36, { size: 15, weight: 600, align: 'right', color: '#949ba4' });

  // the voice channel: who is in it, who is talking
  const team = g.match?.team ?? [{ name: TAG }, ...GAMES[g.game].ally.slice(0, 4).map((name) => ({ name }))];
  const left = g.phase === PHASES.RAGE_QUIT || g.phase === PHASES.SWITCHING;
  const speaking = g.clock < g.voice.until ? g.voice : null;
  let y = 76;
  text(ctx, 'VOICE CONNECTED', 80, y + 10, { size: 12, weight: 800, color: left ? '#f23f42' : '#23a55a' });
  y += 26;
  for (const p of team) {
    if (p.name === TAG && left) continue;
    const talking = speaking && speaking.who === p.name ? speaking.level * (0.6 + 0.4 * Math.abs(Math.sin(g.clock * 14))) : 0;
    avatar(ctx, p.name, 96, y + 16, 15, talking);
    text(ctx, p.name, 122, y + 22, { size: 16, weight: 600, color: talking ? '#f2f3f5' : '#b5bac1' });
    if (p.name === TAG && g.tilt > 0.6) text(ctx, '🎤', W - 26, y + 22, { size: 15, weight: 600, align: 'right', color: '#f23f42' });
    y += 38;
  }
  // text chat
  ctx.fillStyle = '#1e1f22'; ctx.fillRect(64, y + 6, W - 64, 2);
  const chatTop = y + 16;
  const chatBottom = H * 0.6 - 40;
  font(ctx, 500, 17, SANS);
  const blocks = [];
  let height = 0;
  for (let i = g.chat.length - 1; i >= 0 && height < chatBottom - chatTop; i--) {
    const c = g.chat[i];
    const caps = c.kind === 'me' && c.text === c.text.toUpperCase() && /[A-Z]/.test(c.text);
    font(ctx, caps ? 800 : 500, 17, SANS);
    const lines = wrapLines(ctx, c.text, W - 150);
    const h = c.kind === 'system' ? 30 : 30 + lines.length * 22;
    blocks.unshift({ c, lines, h, caps });
    height += h + 8;
  }
  let cy = chatBottom - height;
  ctx.save();
  ctx.beginPath(); ctx.rect(64, chatTop, W - 64, chatBottom - chatTop); ctx.clip();
  // a late-night session: the chat clock starts at 23:12 and runs with the fly's
  const minute = (clock) => { const m = 23 * 60 + 12 + Math.floor((clock ?? 0) / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  for (const b of blocks) {
    const c = b.c;
    if (c.kind === 'system') {
      text(ctx, '→', 84, cy + 20, { size: 16, weight: 700, color: c.text.includes('left') ? '#f23f42' : '#23a55a' });
      text(ctx, c.text, 106, cy + 20, { size: 14, weight: 500, color: '#949ba4' });
    } else {
      avatar(ctx, c.who, 96, cy + 18, 16);
      text(ctx, c.who, 124, cy + 16, { size: 16, weight: 700, color: c.kind === 'me' ? '#f0a35e' : '#f2f3f5' });
      font(ctx, 700, 16, SANS);
      text(ctx, `Today at ${minute(c.clock)}`, 124 + ctx.measureText(c.who).width + 10, cy + 16, { size: 12, weight: 500, color: '#949ba4' });
      b.lines.forEach((l, k) => text(ctx, l, 124, cy + 40 + k * 22, { size: 17, weight: b.caps ? 800 : 500, color: b.caps ? '#ff8a7a' : '#dbdee1' }));
    }
    cy += b.h + 8;
  }
  ctx.restore();
  // the input box, and the fly typing when it is about to say something
  rrect(ctx, 76, chatBottom + 2, W - 92, 34, 8); ctx.fillStyle = '#383a40'; ctx.fill();
  const typing = g.dead && g.tilt > 0.3;
  text(ctx, typing ? 'AAAAAAAAAAAA' : 'Message #squad-voice', 90, chatBottom + 25, { size: 15, weight: typing ? 800 : 500, color: typing ? '#ff8a7a' : '#6d6f78' });
  if (typing) text(ctx, `${TAG} is typing…`, 80, chatBottom - 4, { size: 12, weight: 700, color: '#b5bac1' });

  drawScoreboard(ctx, g, H * 0.6 + 6);
}

function drawScoreboard(ctx, g, top) {
  const W = SIDE_W;
  ctx.fillStyle = '#16181c'; ctx.fillRect(0, top - 6, W, SIDE_H - top + 6);
  const m = g.match;
  const inMatch = m && (g.phase === PHASES.PLAYING || g.phase === PHASES.RESULT);
  if (!inMatch) {
    // between matches: the career, per game
    text(ctx, 'RANKED', 20, top + 32, { size: 16, weight: 800, color: '#8a8f98' });
    GAME_ORDER.forEach((id, k) => {
      const c = g.career[id];
      const y = top + 58 + k * 74;
      drawGameIcon(ctx, id, 20, y, 50);
      text(ctx, GAMES[id].short, 84, y + 20, { size: 18, weight: 700, color: '#f2f3f5' });
      text(ctx, formatRank(id, c.rank), 84, y + 44, { size: 15, weight: 600, color: '#c8ccd2' });
      text(ctx, `${c.wins}W ${c.losses}L${c.rageQuits ? ` · ${c.rageQuits} rage-quit${c.rageQuits > 1 ? 's' : ''}` : ''}`, W - 20, y + 32, { size: 14, weight: 600, align: 'right', color: c.rageQuits ? '#f27a6a' : '#949ba4' });
    });
    return;
  }
  const game = m.game;
  if (GAMES[game].solo) {
    // a story game: nobody else is playing; the friends in voice are watching
    text(ctx, `${GAMES[game].short.toUpperCase()} · STORY`, 20, top + 30, { size: 15, weight: 800, color: '#8a8f98' });
    text(ctx, `${m.team.length - 1} watching`, W - 20, top + 30, { size: 14, weight: 700, align: 'right', color: '#23a55a' });
    const rows = [['kills', m.kills], ['deaths', m.deaths], ['time', mmss(m.t * 12)], [GAMES[game].id === 'rdr2' ? 'honor' : 'progress', formatRank(game, g.career[game].rank)]];
    rows.forEach(([label, v], k) => {
      const y = top + 62 + k * 48;
      ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(12, y, W - 24, 40);
      text(ctx, label, 26, y + 26, { size: 15, weight: 600, color: '#b5bac1' });
      text(ctx, String(v), W - 26, y + 27, { size: 17, weight: 800, align: 'right', color: k === 1 && m.deaths > m.kills ? '#ff8a7a' : '#f2f3f5', family: MONO });
    });
    return;
  }
  const title = game === 'cs2' ? `SCOREBOARD · ROUND ${m.round}` : game === 'fortnite' ? `SQUAD · ${m.players} LEFT` : game === 'minecraft' ? 'SERVER · NIGHT ' + Math.round(m.night * 100) + '%' : `SCOREBOARD · ${mmss(m.t * 20 + 180)}`;
  text(ctx, title, 20, top + 30, { size: 15, weight: 800, color: '#8a8f98' });
  if (game === 'cs2') text(ctx, `${m.rounds.us} : ${m.rounds.them}`, W - 20, top + 30, { size: 18, weight: 800, align: 'right', color: '#f2f3f5' });
  const cols = game === 'minecraft' ? ['mobs', 'deaths', '💎'] : ['K', 'D', 'A'];
  const cx = [W - 150, W - 95, W - 40];
  cols.forEach((c, k) => text(ctx, c, cx[k], top + 58, { size: 13, weight: 700, align: 'center', color: '#8a8f98' }));
  const rows = [...m.team.map((p) => ({ ...p, us: true })), ...(game === 'minecraft' || game === 'fortnite' ? [] : m.enemies.map((p) => ({ ...p, us: false })))];
  rows.forEach((p, k) => {
    const y = top + 70 + k * 30 + (p.us ? 0 : 10);
    if (p.me) { ctx.fillStyle = 'rgba(217,115,31,0.25)'; ctx.fillRect(12, y, W - 24, 28); }
    ctx.fillStyle = p.us ? '#4f8fe0' : '#e0604a'; ctx.fillRect(12, y, 4, 28);
    text(ctx, p.name, 26, y + 20, { size: 15, weight: p.me ? 800 : 600, color: p.me ? '#f0a35e' : '#dbdee1' });
    const vals = game === 'minecraft' ? (p.me ? [m.kills, m.deaths, m.carried] : [p.k, p.d, '']) : [p.k, p.d, p.a];
    vals.forEach((v, j) => text(ctx, String(v), cx[j], y + 20, { size: 15, weight: 700, align: 'center', color: '#dbdee1', family: MONO }));
  });
}
