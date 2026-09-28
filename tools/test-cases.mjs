import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CaseInventory, SKINS, SKIN_BY_ID, RARITIES, REEL_TARGET, REEL_START, CASE_TIMING, INVENTORY_KEY, UNLOCK_BUTTON,
  pickSkin, readInventory, reelPosition, reelSpeed, wearName, itemName, gradeLine, cursorAt, openingStage, spinStart, spinEnd, revealAt, openingEnd,
} from '../src/game/cases.js';
import { Gamer, PHASES } from '../src/game/gamer.js';
import { makeRng } from '../src/game/market.js';

const store = () => { const values = new Map(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }; };
const complete = (cases) => { while (cases.active) { cases.skip(); cases.advance(); } };
const run = (g, seconds) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) g.update(1 / 60); };
const appearance = (cases) => cases.items.map(({ skinId, float, pattern, stattrak }) => ({ skinId, float, pattern, stattrak }));

test('over 100 unique local WebP skins, all tiers, valid floats and a small payload', () => {
  assert(SKINS.length >= 100);
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
  assert.equal(new Set(SKINS.map((s) => s.image)).size, SKINS.length);
  let size = 0;
  for (const skin of SKINS) {
    const buf = fs.readFileSync(new URL(`../public${skin.image}`, import.meta.url));
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
    assert(skin.minFloat >= 0 && skin.minFloat < skin.maxFloat && skin.maxFloat <= 1);
    assert(RARITIES[skin.rarity]);
    size += buf.length;
  }
  assert(size < 1_500_000);
  assert.equal(new Set(SKINS.map((s) => s.rarity)).size, 5);
});

test('invalid counts and duplicate requests never create extra drops', () => {
  const cases = new CaseInventory();
  for (const n of [0, 4, -1, NaN, '3', Infinity]) assert.equal(cases.open(n), false);
  assert(cases.open(3));
  const first = cases.active;
  assert.equal(cases.open(1), false);
  assert.equal(cases.active, first);
  cases.advance();
  assert.equal(cases.items.length, 0);
  cases.skip(); cases.skip(); cases.update(0);
  assert.equal(cases.items.length, 1);
  cases.advance(); complete(cases);
  assert.equal(cases.items.length, 3);
  assert.equal(new Set(cases.items.map((s) => s.id)).size, 3);
});

test('seeded drops match through skips, variable frame sizes and normal playback', () => {
  const a = new CaseInventory({ seed: 42 }), b = new CaseInventory({ seed: 42 });
  for (let i = 0; i < 10; i++) {
    a.open(3); b.open(3); complete(a);
    while (b.active) b.update(1 / (i % 2 ? 30 : 60));
  }
  assert.deepEqual(appearance(a), appearance(b));
  const other = new CaseInventory({ seed: 43 }); other.open(3); complete(other);
  assert.notDeepEqual(appearance(a).slice(0, 3), appearance(other));
});

test('reels decelerate monotonically and land on the awarded skin, including reduced motion', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const cases = new CaseInventory({ seed }); cases.open(1);
    const o = cases.active.opening;
    assert.equal(o.reel[REEL_TARGET].id, o.item.skinId);
    assert.equal(reelPosition(o), REEL_START);
    assert.equal(reelPosition(o, true), REEL_START);
    let last = REEL_START, velocity = Infinity;
    for (let t = 0; t <= o.duration + .01; t += .01) {
      o.elapsed = spinStart() + t;
      const p = reelPosition(o);
      assert(p >= last - 1e-10);
      if (t > .011) assert(p - last <= velocity + 1e-8);
      velocity = p - last; last = p;
    }
    // the last half second still crawls: the tension of the real thing
    o.elapsed = spinEnd(o) - 0.5;
    assert(reelSpeed(o) > 0 && reelSpeed(o) < 0.6);
    o.elapsed = 0;
    cases.skip();
    assert(Math.abs(reelPosition(o) - REEL_TARGET) < 0.4, 'the marker stays on the winning card');
    assert.equal(reelPosition(o, true), reelPosition(o));
    assert.equal(cases.items[0].skinId, o.reel[REEL_TARGET].id);
  }
});

test('one case runs intro, click, spin, landing, hold and reveal, in that order and on time', () => {
  const events = [];
  const cases = new CaseInventory({ seed: 5, onEvent: (type) => { if (type !== 'caseTick') events.push(type); } });
  cases.open(1);
  const o = cases.active.opening;
  const stages = [];
  let ticks = 0;
  cases.onEvent = (type) => { if (type === 'caseTick') ticks++; else events.push(`${type}@${o.elapsed.toFixed(2)}`); };
  while (cases.active) { const st = openingStage(o); if (stages.at(-1) !== st) stages.push(st); cases.update(1 / 60); }
  assert.deepEqual(stages, ['intro', 'spin', 'hold', 'reveal']);
  assert.deepEqual(events.map((e) => e.split('@')[0]), ['caseStart', 'caseUnlock', 'caseDrop', 'caseReveal', 'caseComplete']);
  const at = Object.fromEntries(events.slice(1).map((e) => e.split('@')).map(([k, v]) => [k, Number(v)]));
  assert(Math.abs(at.caseUnlock - CASE_TIMING.click) < 0.02);
  assert(Math.abs(at.caseDrop - spinEnd(o)) < 0.02);
  assert(Math.abs(at.caseReveal - revealAt(o)) < 0.02);
  assert(Math.abs(at.caseComplete - openingEnd(o)) < 0.02);
  // one tick per card that passes the marker
  assert(Math.abs(ticks - (REEL_TARGET - REEL_START)) <= 1, `${ticks} ticks`);
});

test('several cases end on a summary, then hand back', () => {
  const types = [];
  const cases = new CaseInventory({ seed: 8, onEvent: (t) => types.push(t) });
  cases.open(3);
  while (cases.active && !cases.active.summary) cases.update(1 / 30);
  assert.equal(cases.items.length, 3);
  assert.equal(types.filter((t) => t === 'caseReveal').length, 3);
  assert(cases.active.summary);
  for (let t = 0; t < CASE_TIMING.summary + 0.1; t += 1 / 30) cases.update(1 / 30);
  assert.equal(cases.active, null);
  assert.deepEqual(types.filter((t) => t === 'caseSummary' || t === 'caseComplete'), ['caseSummary', 'caseComplete']);
});

test('the cursor goes to the unlock button, presses at the click and stays put', () => {
  const cases = new CaseInventory({ seed: 3 }); cases.open(1);
  const o = cases.active.opening;
  o.elapsed = 0; const start = cursorAt(o);
  o.elapsed = CASE_TIMING.click; const click = cursorAt(o);
  assert(Math.abs(click.x - UNLOCK_BUTTON.x) < 1e-9 && Math.abs(click.y - UNLOCK_BUTTON.y) < 1e-9);
  assert.equal(click.press, 1);
  assert(start.press === 0 && start.x < click.x);
  o.elapsed = spinStart() + 2; assert.equal(cursorAt(o).visible, false);
});

test('names and grades read like the game', () => {
  const find = (part) => SKINS.find((s) => s.name.includes(part));
  const knife = find('Karambit | Fade'), ak = find('AK-47 | Redline'), gem = find('Blue Gem #661');
  assert.equal(itemName(knife, { stattrak: true }), '★ StatTrak™ Karambit | Fade');
  assert.equal(itemName(ak, { stattrak: true }), 'StatTrak™ AK-47 | Redline');
  assert.equal(itemName(ak, { stattrak: false }), 'AK-47 | Redline');
  assert.equal(gradeLine(knife), '★ Covert Knife');
  assert.equal(gradeLine(ak), 'Classified Rifle');
  assert.equal(gradeLine(gem), '★ Classified Rifle · Blue Gem');
  assert.equal(Object.values(RARITIES).reduce((a, r) => a + r.weight, 0).toFixed(6), '100.000000');
});

test('automatic eligibility requires positive CS2 value between matches, never tilt', () => {
  for (const [game, value, enabled, expected] of [['cs2', 0, true, false], ['cs2', -.1, true, false], ['cs2', .01, true, true], ['lol', .9, true, false], ['cs2', .9, false, false]]) {
    const g = new Gamer({ seed: 42 }); g.game = game; g.tilt = 0; g.gameValues.cs2 = value; g.cases.autoEnabled = enabled;
    g.cases.autoRng = () => .49;
    g.update(1 / 60);
    assert.equal(!!g.cases.active, expected);
    if (expected) { assert([1, 2, 3].includes(g.cases.active.count)); assert.equal(g.cases.active.source, 'auto'); }
  }
  for (const phase of [PHASES.PLAYING, PHASES.RAGE_QUIT, PHASES.SWITCHING]) {
    const g = new Gamer(); g.game = 'cs2'; g.gameValues.cs2 = .9; g.phase = phase;
    assert.equal(g.cases.shouldAutoOpen(g), false);
  }
  const tilted = new Gamer(); tilted.game = 'cs2'; tilted.tilt = .99;
  assert.equal(tilted.cases.shouldAutoOpen(tilted), false);
});

test('the coin flip is strictly 50%, and a losing flip cannot retry every frame', () => {
  for (const [roll, opens] of [[0, true], [.49999, true], [.5, false], [.99999, false]]) {
    const g = new Gamer(); g.game = 'cs2'; g.gameValues.cs2 = .1;
    let calls = 0; g.cases.autoRng = () => { calls++; return roll; };
    assert.equal(g.cases.shouldAutoOpen(g), opens);
    for (let i = 0; i < 100; i++) assert.equal(g.cases.shouldAutoOpen(g), false);
    assert.equal(calls, 1);
    g.gameValues.cs2 = -.1; g.cases.shouldAutoOpen(g); g.gameValues.cs2 = .2;
    assert.equal(g.cases.shouldAutoOpen(g), false);
    g.career.cs2.played++;
    assert.equal(g.cases.shouldAutoOpen(g), opens);
    assert.equal(calls, 2);
  }
});

test('cooldown and once-per-match opportunities prevent repeated batches', () => {
  const g = new Gamer(); g.game = 'cs2'; g.gameValues.cs2 = .5; g.cases.autoRng = () => .1;
  g.update(1 / 60); assert(g.cases.active); complete(g.cases);
  g.clock += 80; assert.equal(g.cases.shouldAutoOpen(g), false);
  g.career.cs2.played++; assert.equal(g.cases.shouldAutoOpen(g), true);
  g.openCases(1); complete(g.cases); g.career.cs2.played++;
  assert.equal(g.cases.shouldAutoOpen(g), false);
  g.clock += 80; assert.equal(g.cases.shouldAutoOpen(g), true);
});

test('automatic openings have ~50% probability and randomize 1, 2 and 3 equally', () => {
  const counts = [0, 0, 0, 0];
  for (let seed = 1; seed <= 2000; seed++) {
    const g = new Gamer({ seed }); g.game = 'cs2'; g.gameValues.cs2 = .5; g.update(1 / 60);
    counts[g.cases.active?.count ?? 0]++;
  }
  assert(Math.abs(counts[0] / 2000 - .5) < .04, counts);
  for (let n = 1; n <= 3; n++) assert(Math.abs(counts[n] / (2000 - counts[0]) - 1 / 3) < .07, counts);
});

test('manual opening works in every phase and restores the phase timer and match', () => {
  for (const phase of [PHASES.QUEUE, PHASES.PLAYING, PHASES.RESULT, PHASES.RAGE_QUIT, PHASES.SWITCHING]) {
    const g = new Gamer({ seed: 42 }); g.game = 'lol'; g.startMatch(); g.spawn(); g.phase = phase; g.t = 1.2;
    const match = JSON.stringify(g.match), enemy = JSON.stringify(g.enemy), history = JSON.stringify(g.history);
    assert(g.openCases(3));
    const resume = g.caseResume;
    assert.equal(g.openCases(1), false); assert.equal(g.caseResume, resume);
    run(g, 3);
    assert.equal(JSON.stringify(g.match), match);
    assert.equal(JSON.stringify(g.enemy), enemy);
    complete(g.cases);
    assert.equal(g.phase, phase); assert.equal(g.t, 1.2); assert.equal(g.game, 'lol');
    assert.equal(JSON.stringify(g.history), history); assert.equal(g.cases.items.length, 3);
  }
});

test('a natural three-case run awards exactly three and resumes gameplay', () => {
  const g = new Gamer({ seed: 21 }); g.game = 'cs2'; g.startMatch(); g.cases.autoEnabled = false;
  g.openCases(3); run(g, 3 * (CASE_TIMING.intro + CASE_TIMING.spin[1] + CASE_TIMING.hold + CASE_TIMING.reveal) + CASE_TIMING.summary + 1);
  assert.equal(g.cases.active, null); assert.equal(g.cases.items.length, 3); assert.notEqual(g.phase, PHASES.CASE_OPENING);
  assert(g.match.t > 0);
});

test('a visitor can ask for exactly one case, and only while it plays CS2', () => {
  const g = new Gamer({ seed: 4 }); g.cases.autoEnabled = false;
  g.game = 'lol'; g.startQueue();
  assert.equal(g.canTriggerCase, false); assert.equal(g.triggerCase(), false);
  g.game = 'cs2';
  for (const phase of [PHASES.SWITCHING, PHASES.RAGE_QUIT]) { g.phase = phase; assert.equal(g.triggerCase(), false); }
  for (const phase of [PHASES.QUEUE, PHASES.PLAYING, PHASES.RESULT]) {
    const h = new Gamer({ seed: 4 }); h.cases.autoEnabled = false; h.game = 'cs2'; h.startMatch(); h.phase = phase;
    assert.equal(h.canTriggerCase, true);
    assert.equal(h.triggerCase(), true);
    assert.equal(h.cases.active.count, 1); assert.equal(h.cases.active.source, 'manual');
    assert.equal(h.canTriggerCase, false); assert.equal(h.triggerCase(), false);
    complete(h.cases);
    assert.equal(h.cases.items.length, 1); assert.equal(h.cases.items[0].source, 'manual'); assert.equal(h.phase, phase);
  }
});

test('its mouse goes to the button and the view is exactly restored afterwards', () => {
  const g = new Gamer({ seed: 6 }); g.cases.autoEnabled = false; g.game = 'cs2'; g.startMatch();
  g.view.yaw = 0.7; g.view.pitch = -0.1;
  g.triggerCase();
  let clicks = 0; const press = g.click.bind(g); g.click = (d) => { clicks++; press(d); };
  run(g, CASE_TIMING.click + 0.05);
  assert(g.view.yaw > 0.7 + 0.2, 'turned right, to the button');
  assert(g.view.pitch < -0.1 - 0.1, 'and down');
  assert.equal(clicks, 1);
  complete(g.cases);
  assert.equal(g.view.yaw, 0.7); assert.equal(g.view.pitch, -0.1);
});

test('cosmetic RNG does not consume the match RNG', () => {
  const a = new Gamer({ seed: 42 }), b = new Gamer({ seed: 42 });
  a.openCases(3); complete(a.cases);
  assert.equal(a.rng(), b.rng());
});

test('inventory survives reload; blocked, malformed and partial saves are safe', () => {
  const storage = store();
  const cases = new CaseInventory({ storage }); cases.open(3); complete(cases);
  assert.deepEqual(new CaseInventory({ storage }).items, cases.items);
  storage.setItem(INVENTORY_KEY, '{invalid'); assert.deepEqual(readInventory(storage), []);
  const valid = cases.items[0];
  storage.setItem(INVENTORY_KEY, JSON.stringify({ version: 1, items: [null, {}, valid, valid, { ...valid, id:'bad', float:-1 }, { ...valid, id:'unknown', skinId:'__proto__' }] }));
  assert.deepEqual(readInventory(storage), [valid]);
  const blocked = new CaseInventory({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } } });
  blocked.open(1); complete(blocked); assert.equal(blocked.items.length, 1); assert.equal(blocked.saved, false);
  const session = new CaseInventory(); session.open(1); complete(session); assert.equal(session.saved, false);
});

test('a second tab preserves previously saved skins when it awards a drop', () => {
  const storage = store();
  const a = new CaseInventory({ storage, seed: 1 }), b = new CaseInventory({ storage, seed: 2 });
  a.open(3); complete(a); b.open(1); complete(b);
  assert.equal(readInventory(storage).length, 4);
});

test('wear boundaries and randomized floats respect each skin range', () => {
  assert.deepEqual([0, .07, .15, .38, .45].map(wearName), ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']);
  const cases = new CaseInventory();
  for (let i = 0; i < 300; i++) { cases.open(3); complete(cases); }
  for (const item of cases.items) {
    const skin = SKIN_BY_ID[item.skinId];
    assert(item.float >= skin.minFloat && item.float <= skin.maxFloat);
    assert(item.pattern >= 1 && item.pattern <= 1000);
    if (!skin.stattrak) assert.equal(item.stattrak, false);
  }
  assert(cases.items.some((item) => item.stattrak));
});

test('weighted RNG reaches every skin and follows declared rarity odds', () => {
  const rng = makeRng(3000), counts = {}, seen = new Set();
  const n = 600000;
  for (let i = 0; i < n; i++) { const skin = pickSkin(rng); counts[skin.rarity] = (counts[skin.rarity] ?? 0) + 1; seen.add(skin.id); }
  assert.equal(seen.size, SKINS.length);
  for (const [rarity, def] of Object.entries(RARITIES)) assert(Math.abs(counts[rarity] / n * 100 - def.weight) < .25, rarity);
});
