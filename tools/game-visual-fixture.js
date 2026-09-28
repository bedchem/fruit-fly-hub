// Development-only screenshot fixture for the gaming setup. Loaded by
// .cache/game-check/index.html, never by an application entry or the
// production build.
//
//   /.cache/game-check/?pose=<game>[:<state>]
//     game:  lol | minecraft | fortnite | cs2 | rdr2 | gow | gowr | r6
//     state: enemy (default) | calm | loom | death | result | lost | queue
//   /.cache/game-check/?pose=slam | ragequit | desktop | creeper | victory | queue
//   /.cache/game-check/?pose=gesture:<name>   (a gesture from gamerGestures.js, if present)
//   /.cache/game-check/?pose=case:<intro|click|spin|slow|hold|reveal|summary>[&count=1..3][&skin=<name part>]
//
// Each pose sets the gamer up, lets it run for a moment, then freezes it, so
// a screenshot shows the same frame every time. `&run=1` leaves it running.
import { PHASES } from '../src/game/gamer.js';
import { GAME_ORDER } from '../src/game/games.js';
import { SKINS, SKIN_BY_ID, REEL_TARGET, CASE_TIMING, spinStart, spinEnd, revealAt } from '../src/game/cases.js';

const params = new URLSearchParams(location.search);
const mode = params.get('pose') ?? 'lol';
const keepRunning = params.get('run') === '1';
const LOOM = { lol: 'gank', minecraft: 'creeper', fortnite: 'builder', cs2: 'peek', rdr2: 'ambush', gow: 'troll', gowr: 'berserker' };

function run(g, seconds) { for (let i = 0; i < seconds * 60; i++) g.update(1 / 60); }

function pose() {
  const g = window.__gamer;
  if (!g) { requestAnimationFrame(pose); return; }
  g.chooseNext = () => {};
  const fight = (game, patch = {}) => {
    g.game = game;
    g.startMatch();
    g.match.t = game === 'minecraft' ? 30 : 20;
    g.match.calmFor = 99;
    g.spawn();
    Object.assign(g.enemy, { ttk: 99, need: 99 }, patch);
    run(g, 0.9);
  };
  const [head, state = 'enemy'] = mode.split(':');
  if (head === 'case') {
    g.game = 'cs2'; g.startQueue(); run(g, 0.3);
    g.cases.autoEnabled = false;
    g.openCases(Number(params.get('count') ?? (state === 'summary' ? 3 : 1)), 'manual');
    const c = g.cases;
    const want = params.get('skin');
    if (want) {
      const skin = SKINS.find((s) => s.name.toLowerCase().includes(want.toLowerCase()));
      for (const item of c.active.drops.slice(0, 1)) { item.skinId = skin.id; item.float = skin.minFloat + (skin.maxFloat - skin.minFloat) * 0.12; item.pattern = skin.fixedPattern ?? item.pattern; }
      c.active.opening.reel[REEL_TARGET] = SKIN_BY_ID[skin.id];
    }
    if (state === 'summary') { while (!c.active.summary) { c.skip(); c.advance(); } run(g, 1.4); }
    else {
      const o = c.active.opening;
      const at = { intro: 0.7, click: CASE_TIMING.click, spin: spinStart() + 0.9, slow: spinEnd(o) - 0.9, hold: spinEnd(o) + 0.5, reveal: revealAt(o) + 1.3 }[state] ?? 1;
      run(g, at);
    }
  } else if (head === 'r6' && state !== 'queue') {
    g.game = 'r6'; g.startMatch();
    const s = g.match.siege;
    s.timer = 2.8;
    if (state !== 'prep') {
      s.phase = 'action'; s.drone = false; s.breached = true; s.spotted = true;
      s.x = 12.5; s.y = 9.5; g.view.yaw = -Math.PI / 2; g.clock = 10; g.match.roundT = 12;
      if (state === 'enemy') { g.spawn(); Object.assign(g.enemy, {err:.12,bearing:g.view.yaw+.12,size:.13,grow:1,t:1,ttk:99,need:99}); s.ads=.86; s.lean=.3; }
      if (state === 'breach') { s.smoke=.65; s.sparks=.8; s.breachAt=g.clock; }
      if (state === 'plant') { s.phase='planting'; s.plantT=1.2; }
      if (state === 'planted') { s.phase='planted'; s.plantedT=3; s.defuseT=.8; }
      if (state === 'death') { g.spawn(); g.die('shot'); s.drone=true; }
      if (state === 'result') { g.match.rounds={us:4,them:2}; g.endMatch(); }
    }
  } else if (GAME_ORDER.includes(head)) {
    if (state === 'queue') { g.game = head; g.startQueue(); run(g, 2.4); }
    else if (state === 'calm') { g.game = head; g.startMatch(); g.match.t = 25; g.match.calmFor = 99; run(g, 1.5); }
    else if (state === 'loom') fight(head, { loom: true, kind: LOOM[head], ...(LOOM[head] === 'creeper' ? { name: 'Creeper' } : {}), grow: 0, t: 0 });
    else if (state === 'death') { fight(head); g.die('shot'); run(g, 1.4); }
    else if (state === 'result' || state === 'lost') {
      fight(head);
      g.enemy = null;
      g.match.kills = 7;
      if (head === 'fortnite') { g.match.players = 1; g.match.placement = state === 'result' ? 1 : 3; }
      if (head === 'minecraft') g.match.carried = state === 'result' ? 5 : 0;
      if (head === 'cs2') { g.match.rounds = state === 'result' ? { us: 5, them: 3 } : { us: 2, them: 5 }; }
      g.endMatch();
      g.result.won = state === 'result';
      run(g, 1.2);
    } else {
      const minecraft = head === 'minecraft' ? { kind: 'zombie', name: 'Zombie' } : {};
      fight(head, { loom: false, grow: 1, size: 0.12, ...minecraft });
    }
  } else if (head === 'gesture') {
    g.game = 'lol'; g.startMatch(); g.match.calmFor = 99; run(g, 0.5);
    if (['slam', 'double', 'mouseSlam', 'shove', 'handsUp', 'headsetGrip'].includes(state)) { g.slamCooldown = 0; g.startSlam(state); } else g.gestures.play(state, g.gestures.idleOpts(state));
    run(g, Number(params.get('at') ?? 0.8));
  } else if (mode === 'creeper') fight('minecraft', { kind: 'creeper', name: 'Creeper', loom: true, grow: 0, t: 0 });
  else if (mode === 'slam') { fight('cs2'); g.tilt = 0.8; g.slamCooldown = 0; g.startSlam(); run(g, 0.42); }
  else if (mode === 'ragequit') { fight('lol'); g.enemy = null; g.tilt = 0.9; g.rageQuit(true); run(g, 0.6); }
  else if (mode === 'desktop') { g.nextGame = 'rdr2'; g.phase = PHASES.SWITCHING; g.t = 2.2; }
  else if (mode === 'victory') { fight('fortnite'); g.enemy = null; g.match.players = 1; g.match.placement = 1; g.match.kills = 6; g.endMatch(); run(g, 0.6); }
  else if (mode === 'queue') { g.game = 'lol'; g.startQueue(); run(g, 2.4); }
  if (!keepRunning) g.update = () => g;
  document.documentElement.dataset.visualPose = mode;
}
requestAnimationFrame(pose);
