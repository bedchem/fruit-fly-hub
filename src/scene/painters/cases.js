/**
 * The CS2 case opening on the fly's monitor, the way the game does it: the
 * case with what it contains and an "Unlock Container" button the fly's
 * cursor goes to and clicks; the reel, fast enough to blur, crawling to a
 * stop under the gold marker; the reveal; after several cases, a summary.
 *
 * It only reads cases.js. The reel, the landing offset and the winner are
 * the simulation's, so the monitor, the sound and the inventory agree. The
 * skin pictures are the real artwork, served from this site (credited in
 * public/skins/cs2/credits.json); the case, the menus and the effects are
 * drawn here.
 */
import {
  RARITIES, SKINS, SKIN_BY_ID, UNLOCK_BUTTON, REEL_TARGET, CASE_TIMING,
  reelPosition, reelSpeed, openingStage, cursorAt, spinStart, revealAt, wearName, itemName, gradeLine,
} from '../../game/cases.js';
import { TAG } from '../../game/gamer.js';
import { MAIN_W as W, MAIN_H as H, SANS, MONO, TAU, text, rrect, font, clamp01, hash, drawFly, drawCursor } from './kit.js';

const GOLD = '#e4ae39';
const INK = '#e9edf2';
const DIM = '#8d99a8';
const STATTRAK = '#cf6a32';
const REEL = { y: 236, h: 228, card: 204, gap: 10 };
const PITCH = REEL.card + REEL.gap;

// ------------------------------------------------------------------ pictures

const images = new Map();
function image(skin) {
  let img = images.get(skin.id);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = skin.image;
    images.set(skin.id, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/**
 * The same picture blurred sideways: twelve copies averaged across BLUR_PX,
 * made once per skin at the size the reel draws it. The reel fades from the
 * sharp picture to this one as it speeds up.
 */
const BLUR_PX = 46;
const blurred = new Map();
function blurredSkin(skin, w, h) {
  let c = blurred.get(skin.id);
  if (c) return c;
  const img = image(skin);
  if (!img) return null;
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = Math.round(img.naturalWidth * k), dh = Math.round(img.naturalHeight * k);
  c = document.createElement('canvas');
  c.width = dw + BLUR_PX; c.height = dh;
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = 1 / 12;
  for (let i = 0; i < 12; i++) x.drawImage(img, (i / 11) * BLUR_PX, 0, dw, dh);
  blurred.set(skin.id, c);
  return c;
}

/** The picture, fitted into a box and centred; nothing while it loads. */
function drawSkin(ctx, skin, x, y, w, h, alpha = 1) {
  const img = image(skin);
  if (!img) return;
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.globalAlpha = 1;
}

/** In the reel: sharp when slow, the blurred copy when fast, a mix between. */
function drawMoving(ctx, skin, x, y, w, h, blur) {
  const b = clamp01((blur - 3) / 18);
  if (b < 1) drawSkin(ctx, skin, x, y, w, h, 1 - b * 0.85);
  if (b <= 0) return;
  const c = blurredSkin(skin, w, h);
  if (!c) return;
  ctx.globalAlpha = b;
  ctx.drawImage(c, x + (w - c.width) / 2, y + (h - c.height) / 2);
  ctx.globalAlpha = 1;
}

/** What the case screen lists: every tier, best last, and the gold tile. */
const CONTENTS = (() => {
  const by = (r, n) => SKINS.filter((s) => s.rarity === r && !s.collector).slice(0, n);
  return [...by('milspec', 4), ...by('restricted', 3), ...by('classified', 2), ...SKINS.filter((s) => s.rarity === 'covert').slice(0, 2), 'rare'];
})();

let reducedMotion;
const prefersReduced = () => {
  reducedMotion ??= typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  return reducedMotion.matches;
};

const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const alpha = (hex, a) => hex + Math.round(clamp01(a) * 255).toString(16).padStart(2, '0');

// ------------------------------------------------------------------ the menu around it

function background(ctx, glow = null, k = 0) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1c232d');
  bg.addColorStop(0.55, '#121820');
  bg.addColorStop(1, '#0a0d12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const light = ctx.createRadialGradient(W / 2, 200, 40, W / 2, 260, 760);
  light.addColorStop(0, '#5f7fa826');
  light.addColorStop(1, '#5f7fa800');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  if (glow && k > 0) {
    const g = ctx.createRadialGradient(W / 2, 340, 20, W / 2, 340, 520);
    g.addColorStop(0, alpha(glow, 0.42 * k));
    g.addColorStop(0.5, alpha(glow, 0.12 * k));
    g.addColorStop(1, alpha(glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // the faint diagonal weave of the CS2 menus
  ctx.strokeStyle = '#ffffff05';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -H; x < W; x += 22) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
  ctx.stroke();
}

function topBar(ctx, g) {
  ctx.fillStyle = '#0a0d12e6';
  ctx.fillRect(0, 0, W, 58);
  ctx.fillStyle = '#ffffff10';
  ctx.fillRect(0, 58, W, 1);
  // a plain mark, not the game's logo
  ctx.fillStyle = '#d8dde4';
  rrect(ctx, 26, 17, 24, 24, 5); ctx.fill();
  ctx.fillStyle = '#0a0d12';
  ctx.beginPath(); ctx.arc(38, 29, 6.5, 0, TAU); ctx.fill();
  const tabs = ['PLAY', 'INVENTORY', 'LOADOUT', 'SHOP', 'WATCH'];
  font(ctx, 700, 15, SANS);
  let x = 82;
  for (const tab of tabs) {
    const active = tab === 'INVENTORY';
    text(ctx, tab, x, 36, { size: 15, weight: 700, color: active ? INK : '#76818f' });
    const w = ctx.measureText(tab).width;
    if (active) { ctx.fillStyle = INK; ctx.fillRect(x, 54, w, 4); }
    x += w + 34;
  }
  // its profile: the fly, its name, a level
  drawFly(ctx, W - 204, 29, 30);
  text(ctx, TAG, W - 180, 35, { size: 15, weight: 700, color: INK });
  ctx.fillStyle = '#24303d';
  rrect(ctx, W - 72, 17, 46, 24, 4); ctx.fill();
  text(ctx, `${12 + Math.min(28, Math.floor(g.cases.items.length / 3))}`, W - 49, 35, { size: 14, weight: 800, align: 'center', color: '#9fd0ff', family: MONO });
}

function footer(ctx, g, batch) {
  ctx.fillStyle = '#07090ccc';
  ctx.fillRect(0, H - 40, W, 40);
  text(ctx, `INVENTORY · ${g.cases.items.length} ITEMS`, 28, H - 15, { size: 13, weight: 600, color: DIM, family: MONO });
  if (batch.count > 1) {
    for (let i = 0; i < batch.count; i++) {
      const done = i < batch.index || (i === batch.index && (batch.opening.landed || batch.summary));
      ctx.fillStyle = done ? GOLD : i === batch.index ? '#c9d2dd' : '#3a4452';
      rrect(ctx, W / 2 - batch.count * 22 + i * 44, H - 23, 36, 5, 2.5); ctx.fill();
    }
  }
  text(ctx, 'FLY LAB SIMULATION · NO STEAM ITEMS', W - 28, H - 15, { size: 12, weight: 600, align: 'right', color: '#5d6875', family: MONO });
}

// ------------------------------------------------------------------ the case

/** A hard weapon case, three-quarter view, in Fly Lab colours. */
function drawCase(ctx, cx, cy, s, { lid = 0, shake = 0, t = 0 } = {}) {
  ctx.save();
  ctx.translate(cx + Math.sin(t * 61) * shake * 7, cy + Math.cos(t * 47) * shake * 4);
  ctx.rotate(Math.sin(t * 53) * shake * 0.02 - 0.03);
  ctx.scale(s, s);
  // shadow on the floor
  ctx.save();
  ctx.translate(10, 128);
  ctx.scale(1, 0.18);
  const sh = ctx.createRadialGradient(0, 0, 10, 0, 0, 240);
  sh.addColorStop(0, '#000000b0'); sh.addColorStop(1, '#00000000');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.arc(0, 0, 240, 0, TAU); ctx.fill();
  ctx.restore();
  const w = 360, h = 190, depth = 56;
  // top face
  const top = ctx.createLinearGradient(0, -h / 2 - depth, 0, -h / 2);
  top.addColorStop(0, '#3b3f46'); top.addColorStop(1, '#262a30');
  ctx.save();
  ctx.translate(0, -lid * 26);
  ctx.rotate(-lid * 0.12);
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2 + 34, -h / 2 - depth); ctx.lineTo(w / 2 + 34, -h / 2 - depth); ctx.lineTo(w / 2, -h / 2);
  ctx.closePath(); ctx.fill();
  // handle
  ctx.strokeStyle = '#15181c'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-40 + 17, -h / 2 - depth / 2); ctx.quadraticCurveTo(17, -h / 2 - depth / 2 - 30, 40 + 17, -h / 2 - depth / 2); ctx.stroke();
  ctx.restore();
  if (lid > 0.05) {
    // the light inside, when it opens
    const inner = ctx.createLinearGradient(0, -h / 2 - 30, 0, -h / 2);
    inner.addColorStop(0, alpha(GOLD, 0)); inner.addColorStop(1, alpha('#ffe6a8', lid));
    ctx.fillStyle = inner;
    ctx.fillRect(-w / 2 + 10, -h / 2 - 40 * lid, w - 4, 40 * lid);
  }
  // side face
  ctx.fillStyle = '#16191d';
  ctx.beginPath();
  ctx.moveTo(w / 2, -h / 2); ctx.lineTo(w / 2 + 34, -h / 2 - depth); ctx.lineTo(w / 2 + 34, h / 2 - depth); ctx.lineTo(w / 2, h / 2);
  ctx.closePath(); ctx.fill();
  // front face: gunmetal with the artwork panel
  const front = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  front.addColorStop(0, '#383d45'); front.addColorStop(1, '#1d2026');
  ctx.fillStyle = front;
  rrect(ctx, -w / 2, -h / 2, w, h, 10); ctx.fill();
  const art = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  art.addColorStop(0, '#a4461a'); art.addColorStop(0.5, '#e07a24'); art.addColorStop(1, '#8e3413');
  ctx.fillStyle = art;
  rrect(ctx, -w / 2 + 22, -h / 2 + 30, w - 44, h - 62, 6); ctx.fill();
  ctx.save();
  rrect(ctx, -w / 2 + 22, -h / 2 + 30, w - 44, h - 62, 6); ctx.clip();
  ctx.strokeStyle = '#ffffff1c'; ctx.lineWidth = 10;
  for (let x = -w; x < w; x += 34) { ctx.beginPath(); ctx.moveTo(x, h / 2); ctx.lineTo(x + 120, -h / 2); ctx.stroke(); }
  ctx.restore();
  drawFly(ctx, 0, -2, 108);
  text(ctx, 'FLY LAB', 0, h / 2 - 11, { size: 13, weight: 800, align: 'center', color: '#c8ced6', family: MONO });
  // latches
  for (const x of [-w / 2 + 50, w / 2 - 50]) {
    ctx.fillStyle = '#0f1114'; rrect(ctx, x - 16, -h / 2 - 4, 32, 26, 4); ctx.fill();
    ctx.fillStyle = '#6d7580'; rrect(ctx, x - 11, -h / 2, 22, 14, 3); ctx.fill();
  }
  ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2;
  rrect(ctx, -w / 2, -h / 2, w, h, 10); ctx.stroke();
  ctx.restore();
}

function star(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.44 : r;
    ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, -r, 0, r);
  fill.addColorStop(0, '#fffbe8'); fill.addColorStop(0.55, '#ffe08a'); fill.addColorStop(1, '#d99a1e');
  ctx.shadowColor = '#fff0b0'; ctx.shadowBlur = r * 0.6;
  ctx.fillStyle = fill; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8a620f'; ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}

function goldTile(ctx, x, y, w, h, { big = false } = {}) {
  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, '#6d5519'); bg.addColorStop(1, '#c79a2d');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.42, 2, x + w / 2, y + h * 0.42, w * 0.55);
  glow.addColorStop(0, '#fff2c0cc'); glow.addColorStop(1, '#fff2c000');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  star(ctx, x + w / 2, y + h * (big ? 0.44 : 0.47), Math.min(w, h) * (big ? 0.24 : 0.3));
  if (big) text(ctx, '★ Rare Special Item ★', x + w / 2, y + h - 30, { size: 14, weight: 700, align: 'center', color: '#3b2a05' });
}

// ------------------------------------------------------------------ 1. the case screen

function drawIntro(ctx, g, batch, o) {
  const t = o.elapsed;
  const leaving = clamp01((t - (spinStart() - 0.32)) / 0.32);
  const shake = t > CASE_TIMING.click ? clamp01((t - CASE_TIMING.click) / 0.12) * (1 - leaving) : 0;
  ctx.save();
  ctx.globalAlpha = 1 - leaving;
  text(ctx, 'CONTAINER', 64, 112, { size: 13, weight: 700, color: GOLD, family: MONO });
  text(ctx, 'Fly Lab Case', 62, 156, { size: 42, weight: 800, color: INK });
  text(ctx, batch.count > 1 ? `Case ${batch.index + 1} of ${batch.count}` : 'Unlock this container to receive one item.', 64, 188, { size: 17, weight: 500, color: DIM });
  const bob = prefersReduced() ? 0 : Math.sin(t * 2.2) * 6;
  drawCase(ctx, 330, 392 + bob, 0.92 + leaving * 0.25, { lid: leaving, shake, t });

  // what it contains
  text(ctx, 'Contains one of the following:', 640, 112, { size: 16, weight: 600, color: '#b7c1cd' });
  const cols = 4, tw = 142, th = 104, gap = 10;
  CONTENTS.forEach((entry, i) => {
    const x = 640 + (i % cols) * (tw + gap), y = 128 + Math.floor(i / cols) * (th + gap);
    if (entry === 'rare') { goldTile(ctx, x, y, tw, th); ctx.fillStyle = GOLD; ctx.fillRect(x, y + th - 4, tw, 4); text(ctx, '★ Rare Special Item', x + 8, y + th - 11, { size: 11, weight: 700, color: '#3b2a05' }); return; }
    const color = RARITIES[entry.rarity].color;
    const bg = ctx.createLinearGradient(0, y, 0, y + th);
    bg.addColorStop(0, '#262c35'); bg.addColorStop(1, alpha(color, 0.3));
    ctx.fillStyle = bg; ctx.fillRect(x, y, tw, th);
    drawSkin(ctx, entry, x + 8, y + 6, tw - 16, th - 34);
    ctx.fillStyle = color; ctx.fillRect(x, y + th - 4, tw, 4);
    text(ctx, entry.weapon, x + 8, y + th - 11, { size: 11, weight: 600, color: '#c3ccd6' });
  });

  // the key, and the button
  const bx = UNLOCK_BUTTON.x * W, by = UNLOCK_BUTTON.y * H, bw = 300, bh = 58;
  const cur = cursorAt(o);
  const hover = Math.abs(cur.x * W - bx) < bw / 2 && Math.abs(cur.y * H - by) < bh / 2;
  const pressed = cur.press > 0.2;
  text(ctx, 'USE KEY', bx - bw / 2 - 24, by - 6, { size: 12, weight: 700, align: 'right', color: DIM, family: MONO });
  text(ctx, `Fly Lab Case Key ×${batch.count - batch.index}`, bx - bw / 2 - 24, by + 16, { size: 15, weight: 600, align: 'right', color: INK });
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(pressed ? 0.96 : 1, pressed ? 0.96 : 1);
  const btn = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  btn.addColorStop(0, hover ? '#6aa33c' : '#5a8f31'); btn.addColorStop(1, hover ? '#4c7f27' : '#3f6c20');
  ctx.fillStyle = pressed ? '#3a611d' : btn;
  rrect(ctx, -bw / 2, -bh / 2, bw, bh, 4); ctx.fill();
  ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1; ctx.stroke();
  text(ctx, 'UNLOCK CONTAINER', 0, 7, { size: 19, weight: 800, align: 'center', color: '#f4f8ef' });
  ctx.restore();
  ctx.restore();
  if (leaving > 0) {
    // the case opens in a flash of light
    const flash = Math.sin(Math.PI * leaving);
    ctx.fillStyle = alpha('#fff4d6', flash * 0.35);
    ctx.fillRect(0, 0, W, H);
  }
  if (cur.visible) drawCursor(ctx, cur.x * W, cur.y * H);
}

// ------------------------------------------------------------------ 2. the reel

function drawReel(ctx, g, batch, o) {
  const stage = openingStage(o);
  const fadeIn = easeOut((o.elapsed - spinStart()) / 0.3);
  const position = reelPosition(o, prefersReduced());
  // pixels the strip moves per monitor frame (24 fps): the length of the blur
  const blur = prefersReduced() ? 0 : Math.min(60, reelSpeed(o) * PITCH / 24);
  const held = stage === 'hold' ? clamp01((o.elapsed - (revealAt(o) - CASE_TIMING.hold)) / 0.25) : 0;
  const { y, h, card } = REEL;

  text(ctx, 'Fly Lab Case', 64, 128, { size: 28, weight: 800, color: INK });
  text(ctx, batch.count > 1 ? `Unlocking case ${batch.index + 1} of ${batch.count}` : 'Unlocking container', 64, 158, { size: 16, weight: 500, color: DIM });

  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.fillStyle = '#080b0f';
  ctx.fillRect(0, y - 14, W, h + 28);
  ctx.fillStyle = '#ffffff12';
  ctx.fillRect(0, y - 14, W, 1); ctx.fillRect(0, y + h + 13, W, 1);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, y - 14, W, h + 28); ctx.clip();
  const first = Math.max(0, Math.floor(position - W / 2 / PITCH) - 1);
  const last = Math.min(o.reel.length - 1, Math.ceil(position + W / 2 / PITCH) + 1);
  for (let i = first; i <= last; i++) {
    const skin = o.reel[i];
    const x = W / 2 + (i - position) * PITCH - card / 2;
    const winner = i === REEL_TARGET;
    if (skin.rarity === 'rare') { goldTile(ctx, x, y, card, h); ctx.fillStyle = GOLD; ctx.fillRect(x, y + h - 6, card, 6); }
    else {
      const color = RARITIES[skin.rarity].color;
      const bg = ctx.createLinearGradient(0, y, 0, y + h);
      bg.addColorStop(0, '#2a3039');
      bg.addColorStop(0.62, '#20252d');
      bg.addColorStop(1, alpha(color, 0.45));
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, card, h);
      const pool = ctx.createRadialGradient(x + card / 2, y + h, 4, x + card / 2, y + h, card * 0.75);
      pool.addColorStop(0, alpha(color, 0.38)); pool.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = pool;
      ctx.fillRect(x, y, card, h);
      // blurred along the direction of travel: the eye can't hold it either
      drawMoving(ctx, skin, x + 10, y + 16, card - 20, h - 50, blur);
      ctx.fillStyle = color;
      ctx.fillRect(x, y + h - 6, card, 6);
    }
    if (held > 0 && !winner) {
      ctx.fillStyle = `rgba(4,6,9,${0.55 * held})`;
      ctx.fillRect(x, y, card, h);
    }
    if (held > 0 && winner) {
      const color = RARITIES[skin.rarity].color;
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 30 * held;
      ctx.strokeStyle = alpha(color, held); ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, card - 3, h - 3);
      ctx.restore();
    }
  }
  ctx.restore();

  // the ends fall away into the dark
  for (const [x0, x1] of [[0, 260], [W, W - 260]]) {
    const fade = ctx.createLinearGradient(x0, 0, x1, 0);
    fade.addColorStop(0, '#080b0f'); fade.addColorStop(1, '#080b0f00');
    ctx.fillStyle = fade;
    ctx.fillRect(Math.min(x0, x1), y - 13, 260, h + 26);
  }

  // the marker
  ctx.save();
  ctx.shadowColor = GOLD; ctx.shadowBlur = 14;
  ctx.fillStyle = GOLD;
  ctx.fillRect(W / 2 - 1.5, y - 14, 3, h + 28);
  ctx.beginPath(); ctx.moveTo(W / 2 - 11, y - 16); ctx.lineTo(W / 2 + 11, y - 16); ctx.lineTo(W / 2, y - 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W / 2 - 11, y + h + 16); ctx.lineTo(W / 2 + 11, y + h + 16); ctx.lineTo(W / 2, y + h + 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();

  if (stage === 'hold') {
    const skin = SKIN_BY_ID[o.item.skinId];
    text(ctx, skin.rarity === 'rare' ? '★  RARE SPECIAL ITEM  ★' : RARITIES[skin.rarity].name.toUpperCase(), W / 2, y + h + 70, { size: 20, weight: 800, align: 'center', color: RARITIES[skin.rarity].color });
  }
}

// ------------------------------------------------------------------ 3. the reveal

function rays(ctx, cx, cy, color, k, t, n = 14) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(prefersReduced() ? 0 : t * 0.18);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const grad = ctx.createLinearGradient(0, 0, Math.cos(a) * 620, Math.sin(a) * 620);
    grad.addColorStop(0, alpha(color, 0.22 * k)); grad.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, 620, a - 0.07, a + 0.07);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawReveal(ctx, g, batch, o) {
  const skin = SKIN_BY_ID[o.item.skinId];
  const rarity = RARITIES[skin.rarity];
  const t = o.elapsed - revealAt(o);
  const k = easeOut(t / 0.45);
  background(ctx, rarity.color, k);
  topBar(ctx, g);
  if (rarity.rank >= 2) rays(ctx, W / 2, 330, rarity.color, k * (0.6 + rarity.rank * 0.12), t);
  if (skin.rarity === 'rare' || skin.fixedPattern) {
    // gold dust for the ones people scream about
    for (let i = 0; i < 46; i++) {
      const life = (t * (0.18 + hash(i) * 0.2) + hash(i + 7)) % 1;
      const x = W / 2 + (hash(i + 3) - 0.5) * 900;
      const y = 560 - life * 460;
      ctx.fillStyle = alpha(i % 3 ? '#ffe28a' : '#ffffff', Math.sin(Math.PI * life) * 0.9 * k);
      ctx.beginPath(); ctx.arc(x, y, 1.2 + hash(i + 11) * 2.4, 0, TAU); ctx.fill();
    }
  }
  const scale = 0.84 + 0.16 * k;
  const float = prefersReduced() ? 0 : Math.sin(t * 1.7) * 5;
  ctx.save();
  ctx.translate(W / 2, 318 + float);
  ctx.scale(scale, scale);
  ctx.shadowColor = '#000000c0'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  drawSkin(ctx, skin, -300, -170, 600, 340, k);
  ctx.restore();

  const name = itemName(skin, o.item);
  const [weapon, finish] = name.split(' | ');
  ctx.globalAlpha = k;
  font(ctx, 700, 34, SANS);
  const st = o.item.stattrak;
  const lead = st ? (weapon.startsWith('★') ? '★ StatTrak™ ' : 'StatTrak™ ') : '';
  const rest = `${weapon.slice(lead.length)}${finish ? ` | ${finish}` : ''}`;
  const total = ctx.measureText(lead + rest).width;
  let x = W / 2 - total / 2;
  if (lead) { text(ctx, lead, x, 560, { size: 34, weight: 700, color: STATTRAK }); x += ctx.measureText(lead).width; }
  text(ctx, rest, x, 560, { size: 34, weight: 700, color: INK });
  ctx.fillStyle = rarity.color;
  ctx.fillRect(W / 2 - 140, 578, 280, 3);
  text(ctx, gradeLine(skin), W / 2, 606, { size: 17, weight: 700, align: 'center', color: rarity.color });
  const extra = skin.fixedPattern ? `  ·  Pattern #${o.item.pattern}` : skin.phase && !skin.name.includes(skin.phase) ? `  ·  ${skin.phase}` : '';
  text(ctx, `${wearName(o.item.float)}  ·  ${o.item.float.toFixed(9)}${extra}`, W / 2, 636, { size: 15, weight: 500, align: 'center', color: '#aeb8c4', family: MONO });
  text(ctx, '✓  ADDED TO INVENTORY', W / 2, 668, { size: 13, weight: 700, align: 'center', color: '#8fcf7a', family: MONO });
  ctx.globalAlpha = 1;
  if (t < 0.45) {
    ctx.fillStyle = alpha('#ffffff', (1 - t / 0.45) * 0.55);
    ctx.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------ 4. several cases: what came out

function drawSummary(ctx, g, batch) {
  const t = batch.summary.elapsed;
  const best = batch.drops.reduce((a, b) => (RARITIES[SKIN_BY_ID[b.skinId].rarity].rank > RARITIES[SKIN_BY_ID[a.skinId].rarity].rank ? b : a));
  background(ctx, RARITIES[SKIN_BY_ID[best.skinId].rarity].color, easeOut(t / 0.6) * 0.7);
  topBar(ctx, g);
  text(ctx, `${batch.count} items unlocked`, W / 2, 130, { size: 38, weight: 800, align: 'center', color: INK });
  text(ctx, 'All of them went to the inventory.', W / 2, 162, { size: 16, weight: 500, align: 'center', color: DIM });
  const cw = 340, ch = 380, gap = 26;
  const x0 = W / 2 - (batch.count * cw + (batch.count - 1) * gap) / 2;
  batch.drops.forEach((item, i) => {
    const k = easeOut((t - i * 0.18) / 0.45);
    if (k <= 0) return;
    const skin = SKIN_BY_ID[item.skinId];
    const color = RARITIES[skin.rarity].color;
    const x = x0 + i * (cw + gap), y = 196 + (1 - k) * 40;
    ctx.globalAlpha = k;
    const bg = ctx.createLinearGradient(0, y, 0, y + ch);
    bg.addColorStop(0, '#262c35'); bg.addColorStop(1, alpha(color, 0.35));
    ctx.fillStyle = bg;
    rrect(ctx, x, y, cw, ch, 6); ctx.fill();
    drawSkin(ctx, skin, x + 16, y + 18, cw - 32, 200);
    ctx.fillStyle = color; ctx.fillRect(x, y + ch - 6, cw, 6);
    const [weapon, finish = ''] = itemName(skin, item).split(' | ');
    text(ctx, weapon, x + 20, y + 262, { size: 16, weight: 600, color: item.stattrak ? STATTRAK : '#c3ccd6' });
    text(ctx, finish.length > 24 ? `${finish.slice(0, 23)}…` : finish, x + 20, y + 294, { size: 24, weight: 800, color: INK });
    text(ctx, gradeLine(skin), x + 20, y + 324, { size: 14, weight: 700, color });
    text(ctx, wearName(item.float), x + 20, y + 350, { size: 13, weight: 500, color: DIM, family: MONO });
    ctx.globalAlpha = 1;
  });
}

// ------------------------------------------------------------------ the screen

export function drawCases(ctx, g) {
  const batch = g.cases.active;
  if (!batch) return;
  ctx.save();
  if (batch.summary) drawSummary(ctx, g, batch);
  else {
    const o = batch.opening;
    const stage = openingStage(o);
    if (stage === 'reveal') drawReveal(ctx, g, batch, o);
    else {
      background(ctx);
      topBar(ctx, g);
      if (stage === 'intro') {
        // the reel's pictures load while the case is on screen
        for (const skin of o.reel) image(skin);
        image(SKIN_BY_ID[o.item.skinId]);
        drawIntro(ctx, g, batch, o);
      } else drawReel(ctx, g, batch, o);
    }
  }
  footer(ctx, g, batch);
  ctx.restore();
}
