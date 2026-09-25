// Development-only screenshot fixture for the gaming setup. Loaded by
// .cache/game-check/index.html, never by an application entry or the
// production build.
//
//   /.cache/game-check/?pose=lol|minecraft|fortnite|cs2|creeper|slam|ragequit|victory|desktop|queue
//
// Each pose sets the gamer up, lets it run for a moment, then freezes it, so
// a screenshot shows the same frame every time.
import { PHASES } from '../src/game/gamer.js';

const mode = new URLSearchParams(location.search).get('pose') ?? 'lol';
const GAMES = ['lol', 'minecraft', 'fortnite', 'cs2'];

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
  if (GAMES.includes(mode)) fight(mode, mode === 'minecraft' ? { kind: 'zombie', name: 'Zombie', loom: false, grow: 1, size: 0.12 } : { loom: false, grow: 1, size: 0.12 });
  else if (mode === 'creeper') fight('minecraft', { kind: 'creeper', name: 'Creeper', loom: true, grow: 0, t: 0 });
  else if (mode === 'slam') { fight('cs2'); g.tilt = 0.8; g.slamCooldown = 0; g.startSlam(); run(g, 0.42); }
  else if (mode === 'ragequit') { fight('lol'); g.enemy = null; g.tilt = 0.9; g.rageQuit(true); run(g, 0.6); }
  else if (mode === 'desktop') { g.nextGame = 'minecraft'; g.phase = PHASES.SWITCHING; g.t = 2.2; }
  else if (mode === 'victory') { fight('fortnite'); g.enemy = null; g.match.players = 1; g.match.placement = 1; g.match.kills = 6; g.endMatch(); run(g, 0.6); }
  else if (mode === 'queue') { g.game = 'lol'; g.startQueue(); run(g, 2.4); }
  g.update = () => g;
  document.documentElement.dataset.visualPose = mode;
}
requestAnimationFrame(pose);
