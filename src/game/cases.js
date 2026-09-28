/**
 * The fly's CS2 cases: what a case can drop, how the reel runs, and the
 * inventory it fills. Everything here is simulation state; the monitor
 * (painters/cases.js) and the inventory (ui/GameCases.jsx) only read it.
 *
 * A batch of one to three cases is opened one case at a time, like the real
 * game: the case screen, the cursor on "Unlock Container", the reel, the
 * reveal — and after more than one case, a summary. Each drop is decided the
 * moment its case is unlocked; the reel is then built around it, so the reel,
 * the ticks and the monitor can never disagree with the inventory.
 */
import catalog from './csSkins.json' with { type: 'json' };
import { makeRng } from './market.js';

export const SKINS = catalog;
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((skin) => [skin.id, skin]));
export const INVENTORY_KEY = 'flylab.cs2.inventory.v1';

/**
 * Counter-Strike's own tier colours. The odds are a little kinder than a real
 * case (79.92 / 15.98 / 3.20 / 0.64 / 0.26 %), so a knife is rare, not mythical.
 */
export const RARITIES = {
  milspec: { name: 'Mil-Spec Grade', color: '#4b69ff', weight: 72, rank: 0 },
  restricted: { name: 'Restricted', color: '#8847ff', weight: 19, rank: 1 },
  classified: { name: 'Classified', color: '#d32ce6', weight: 6, rank: 2 },
  covert: { name: 'Covert', color: '#eb4b4b', weight: 2.2, rank: 3 },
  rare: { name: 'Rare Special Item', color: '#e4ae39', weight: 0.8, rank: 4 },
};
export const REAL_ODDS = { milspec: 79.92, restricted: 15.98, classified: 3.2, covert: 0.64, rare: 0.26 };
const POOLS = Object.fromEntries(Object.keys(RARITIES).map((r) => [r, SKINS.filter((s) => s.rarity === r)]));

/** Seconds. `spin` is a range: no two reels take exactly as long. */
export const CASE_TIMING = { intro: 1.7, click: 1.25, spin: [5.6, 6.4], hold: 0.8, reveal: 3.4, summary: 3.6 };
/** The winner's slot in the reel, and where the reel starts. */
export const REEL_TARGET = 46;
export const REEL_START = 4;
const REEL_LENGTH = REEL_TARGET + 8;

/** Seconds between automatic batches, and the chance of one per CS2 match. */
export const AUTO_COOLDOWN = 75;
export const AUTO_CHANCE = 0.5;

export function wearName(value) {
  return value < 0.07 ? 'Factory New' : value < 0.15 ? 'Minimal Wear' : value < 0.38 ? 'Field-Tested' : value < 0.45 ? 'Well-Worn' : 'Battle-Scarred';
}
export const WEAR_SHORT = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' };

export function pickSkin(rng) {
  let roll = rng() * 100;
  let rarity = 'rare';
  for (const [key, def] of Object.entries(RARITIES)) {
    roll -= def.weight;
    if (roll < 0) { rarity = key; break; }
  }
  const pool = POOLS[rarity];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** "StatTrak™ AK-47 | Redline", "★ StatTrak™ Karambit | Fade". */
export function itemName(skin, item) {
  if (!item?.stattrak) return skin.name;
  return skin.name.startsWith('★ ') ? `★ StatTrak™ ${skin.name.slice(2)}` : `StatTrak™ ${skin.name}`;
}

const WEAPON_TYPES = {
  Pistol: ['Glock-18', 'USP-S', 'P2000', 'P250', 'Five-SeveN', 'Tec-9', 'CZ75-Auto', 'Desert Eagle', 'R8 Revolver', 'Dual Berettas'],
  SMG: ['MP9', 'MAC-10', 'MP7', 'MP5-SD', 'UMP-45', 'P90', 'PP-Bizon'],
  Rifle: ['AK-47', 'M4A4', 'M4A1-S', 'Galil AR', 'FAMAS', 'AUG', 'SG 553'],
  'Sniper Rifle': ['AWP', 'SSG 08', 'SCAR-20', 'G3SG1'],
  Shotgun: ['Nova', 'XM1014', 'Sawed-Off', 'MAG-7'],
  Machinegun: ['M249', 'Negev'],
};
const TYPE_OF = Object.fromEntries(Object.entries(WEAPON_TYPES).flatMap(([type, list]) => list.map((w) => [w, type])));
/** "Classified Rifle", "Covert Knife": the line under a name in the game. */
export function weaponType(skin) {
  return skin.name.startsWith('★') ? 'Knife' : TYPE_OF[skin.weapon] ?? 'Weapon';
}
export function gradeLine(skin) {
  const type = weaponType(skin);
  const gem = skin.fixedPattern ? ' · Blue Gem' : '';
  // a knife is a Covert ★; the gold tier's rifle is a Classified Case Hardened
  if (skin.rarity === 'rare') return type === 'Knife' ? `★ Covert Knife${gem}` : `★ Classified ${type}${gem}`;
  return `${RARITIES[skin.rarity].name.replace(' Grade', '')} ${type}`;
}

// ------------------------------------------------------------------ the clock of one case

export const spinStart = () => CASE_TIMING.intro;
export const spinEnd = (o) => CASE_TIMING.intro + o.duration;
export const revealAt = (o) => spinEnd(o) + CASE_TIMING.hold;
export const openingEnd = (o) => revealAt(o) + CASE_TIMING.reveal;

/** 'intro' | 'spin' | 'hold' | 'reveal', from the case's own clock. */
export function openingStage(o) {
  if (o.elapsed < spinStart()) return 'intro';
  if (!o.landed) return 'spin';
  return o.elapsed < revealAt(o) ? 'hold' : 'reveal';
}

/**
 * Where the reel is, in cards: the winner is card REEL_TARGET, and the marker
 * lands `offset` of a card from its centre. A cubic ease-out, like the game:
 * fast enough to blur, then a long crawl where every card might be the one.
 */
export function reelPosition(o, reducedMotion = false) {
  const end = REEL_TARGET + o.offset;
  if (o.landed) return end;
  if (reducedMotion) return REEL_START;
  const p = Math.max(0, Math.min(1, (o.elapsed - spinStart()) / o.duration));
  return REEL_START + (end - REEL_START) * (1 - Math.pow(1 - p, 3));
}

/** Cards per second at the marker, for the motion blur. */
export function reelSpeed(o) {
  if (o.landed) return 0;
  const p = Math.max(0, Math.min(1, (o.elapsed - spinStart()) / o.duration));
  return 3 * (REEL_TARGET + o.offset - REEL_START) * Math.pow(1 - p, 2) / o.duration;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The fly's cursor on the case screen, in 0..1 of the monitor: it drifts from
 * where it was to the unlock button, presses at CASE_TIMING.click and lets
 * go. The painter draws it; the Gamer moves the real mouse by the same path.
 */
export const UNLOCK_BUTTON = { x: 0.845, y: 0.868 };
export function cursorAt(o) {
  const from = { x: 0.52 + (o.jitter ?? 0) * 0.08, y: 0.5 };
  const t = Math.max(0, Math.min(1, (o.elapsed - 0.15) / (CASE_TIMING.click - 0.3)));
  const k = ease(t);
  // a slight arc, the way a hand moves a mouse
  const x = from.x + (UNLOCK_BUTTON.x - from.x) * k;
  const y = from.y + (UNLOCK_BUTTON.y - from.y) * k - Math.sin(Math.PI * k) * 0.05;
  const press = Math.max(0, 1 - Math.abs(o.elapsed - CASE_TIMING.click) / 0.12);
  return { x, y, press, visible: o.elapsed < spinStart() + 0.1 };
}

// ------------------------------------------------------------------ storage

/** Browser storage is optional; a blocked or damaged store never breaks play. */
export function readInventory(storage) {
  try {
    const data = JSON.parse(storage?.getItem(INVENTORY_KEY) ?? 'null');
    if (data?.version !== 1 || !Array.isArray(data.items)) return [];
    const ids = new Set();
    return data.items.filter((item) => {
      const skin = item && Object.hasOwn(SKIN_BY_ID, item.skinId) ? SKIN_BY_ID[item.skinId] : null;
      if (!skin || typeof item.id !== 'string' || ids.has(item.id)
        || !Number.isFinite(item.float) || item.float < skin.minFloat || item.float > skin.maxFloat
        || !Number.isInteger(item.pattern) || item.pattern < 1 || item.pattern > 1000
        || typeof item.stattrak !== 'boolean' || !Number.isFinite(item.at)) return false;
      ids.add(item.id);
      return true;
    });
  } catch { return []; }
}

// ------------------------------------------------------------------ the inventory

/** Separate random streams keep opening cases from rerolling match outcomes. */
export class CaseInventory {
  constructor({ seed = 1, now = () => Date.now(), onEvent = () => {}, storage = null } = {}) {
    this.rng = makeRng(Math.imul(seed ^ 0x3c6ef372, 0x9e3779b1));
    this.visualRng = makeRng(Math.imul(seed ^ 0x510e527f, 0x9e3779b1));
    this.autoRng = makeRng(Math.imul(seed ^ 0x1f83d9ab, 0x9e3779b1));
    this.now = now;
    this.onEvent = onEvent;
    this.storage = storage;
    this.items = readInventory(storage);
    this.saved = !!storage;
    this.sessionId = `${seed.toString(36)}-${now().toString(36)}`;
    this.serial = this.items.reduce((max, item) => item.id.startsWith(`${this.sessionId}-`)
      ? Math.max(max, Number(item.id.slice(this.sessionId.length + 1)) || 0) : max, 0);
    this.active = null;
    this.lastBatch = null;
    /** Bumped on every change the UI shows: a cheap "did anything happen". */
    this.version = 0;
    this.autoEnabled = true;
    this.lastAutoOpportunity = -1;
    this.nextAutoAt = 0;
  }

  /** Called every frame; flips the coin at most once per CS2 match. */
  shouldAutoOpen(g) {
    if (!this.autoEnabled || this.active || g.game !== 'cs2' || !(g.gameValues.cs2 > 0)
      || g.clock < this.nextAutoAt || !['queue', 'result'].includes(g.phase)) return false;
    const opportunity = g.career.cs2.played;
    if (opportunity === this.lastAutoOpportunity) return false;
    // one coin flip per match, a lost one included: never a retry every frame
    this.lastAutoOpportunity = opportunity;
    return this.autoRng() < AUTO_CHANCE;
  }

  /** One, two or three cases; all drops are rolled now, revealed one by one. */
  open(count, source = 'manual') {
    if (this.active || ![1, 2, 3].includes(count)) return false;
    const drops = Array.from({ length: count }, () => {
      const skin = pickSkin(this.rng);
      return {
        id: `${this.sessionId}-${++this.serial}`, skinId: skin.id,
        float: skin.minFloat + this.rng() * (skin.maxFloat - skin.minFloat),
        pattern: skin.fixedPattern ?? 1 + Math.floor(this.rng() * 1000),
        stattrak: skin.stattrak && this.rng() < 0.1, at: this.now(), source,
      };
    });
    this.active = { id: drops[0].id, count, source, drops, index: 0, opening: null, summary: null };
    this.beginReel();
    this.onEvent('caseStart', { count, source });
    return true;
  }

  beginReel() {
    const batch = this.active;
    const item = batch.drops[batch.index];
    const reel = Array.from({ length: REEL_LENGTH }, () => pickSkin(this.visualRng));
    reel[REEL_TARGET] = SKIN_BY_ID[item.skinId];
    const [lo, hi] = CASE_TIMING.spin;
    batch.opening = {
      item, reel, elapsed: 0, duration: lo + this.visualRng() * (hi - lo),
      // anywhere on the winning card but its very edges
      offset: (this.visualRng() - 0.5) * 0.76,
      jitter: this.visualRng() - 0.5,
      landed: false, clicked: false, lastTick: REEL_START,
    };
    this.version++;
  }

  update(dt) {
    const batch = this.active;
    if (!batch) return;
    dt = Math.max(0, dt);
    if (batch.summary) {
      batch.summary.elapsed += dt;
      if (batch.summary.elapsed >= CASE_TIMING.summary) this.complete();
      return;
    }
    const o = batch.opening;
    o.elapsed += dt;
    if (!o.clicked && o.elapsed >= CASE_TIMING.click) {
      o.clicked = true;
      this.onEvent('caseUnlock', { index: batch.index, count: batch.count });
    }
    if (!o.landed) {
      const tick = Math.floor(reelPosition(o) + 0.5);
      if (o.elapsed > spinStart() && tick !== o.lastTick) {
        o.lastTick = tick;
        this.onEvent('caseTick', { speed: reelSpeed(o) });
      }
      if (o.elapsed >= spinEnd(o)) this.land();
    }
    if (o.landed && !o.revealed && o.elapsed >= revealAt(o)) {
      o.revealed = true;
      this.onEvent('caseReveal', { item: o.item, skin: SKIN_BY_ID[o.item.skinId] });
    }
    if (o.elapsed >= openingEnd(o)) this.advance();
  }

  /** The reel stops: the drop goes into the inventory. */
  land() {
    const o = this.active.opening;
    o.landed = true;
    o.item.at = this.now();
    this.items.push(o.item);
    this.persist();
    this.version++;
    this.onEvent('caseDrop', { item: o.item, skin: SKIN_BY_ID[o.item.skinId] });
  }

  /** Jump to the landing: for tests and screenshots. It never changes the drop. */
  skip() {
    const o = this.active?.opening;
    if (!o || o.landed || this.active.summary) return;
    o.clicked = true;
    o.elapsed = spinEnd(o);
    this.update(0);
  }

  /** On from a landed case: the next case, the summary, or back to the game. */
  advance() {
    const batch = this.active;
    if (!batch) return;
    if (batch.summary) { this.complete(); return; }
    if (!batch.opening.landed) return;
    if (++batch.index < batch.count) this.beginReel();
    else if (batch.count > 1) {
      batch.index = batch.count - 1;
      batch.summary = { elapsed: 0 };
      this.version++;
      this.onEvent('caseSummary', { drops: batch.drops });
    } else this.complete();
  }

  complete() {
    this.lastBatch = this.active;
    this.active = null;
    this.version++;
    this.onEvent('caseComplete', this.lastBatch);
  }

  /** Another tab may have saved drops since: merge, never overwrite. */
  merge() {
    const known = new Set(this.items.map((item) => item.id));
    let added = 0;
    for (const item of readInventory(this.storage)) if (!known.has(item.id)) { this.items.push(item); added++; }
    if (added) this.version++;
    return added;
  }

  persist() {
    try {
      this.merge();
      this.storage?.setItem(INVENTORY_KEY, JSON.stringify({ version: 1, items: this.items }));
      this.saved = !!this.storage;
    } catch { this.saved = false; }
  }
}
