/**
 * Games headless: the real gamer, the real brain — motion detectors, target
 * and looming detectors, the giant fibre, Johnston's organ, the mushroom body
 * learning each game — stepped at 60 fps on a simulated clock.
 *
 *   node tools/sim-game.mjs [minutes=10] [seed=1] [--quiet]
 *   node tools/sim-game.mjs --league [minutes=10] [seeds=8]
 *
 * One line per moment that matters: kills, deaths, flinches, slams, results,
 * rage-quits and switches, with its tilt and what it tracks. `--league` plays
 * several seeds and prints only the summary: how often it rages, and which
 * game it learns to hate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Gamer } from '../src/game/gamer.js';
import { GAME_ORDER, GAMES, formatRank } from '../src/game/games.js';
import { parseGraph } from '../src/neural/simulation.js';
import { GamerBrain } from '../src/neural/gamerBrain.js';
import meta from '../src/neural/cnsGraph.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const league = args.includes('--league');
const quiet = args.includes('--quiet') || league;
const nums = args.filter((a) => !a.startsWith('--')).map(Number);
const minutes = nums[0] ?? 10;

const buf = fs.readFileSync(path.join(here, '../public/data/graph.bin'));
const graph = parseGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const SHOWN = new Set(['kill', 'headshot', 'death', 'explode', 'flinch', 'slam', 'victory', 'defeat', 'rageQuit', 'switch', 'start']);

function play(seed) {
  let clock = 0;
  const brain = new GamerBrain(graph, meta);
  const log = [];
  const g = new Gamer({
    seed,
    now: () => clock,
    onEvent: (type, d) => {
      if (!SHOWN.has(type)) return;
      const t = `${(clock / 1000).toFixed(0).padStart(4)}s ${GAMES[g.game].short.padEnd(9)}`;
      let what = type.toUpperCase();
      if (type === 'kill' || type === 'headshot') what += ` ${d.name}`;
      if (type === 'death' || type === 'explode') what += ` by ${d.name}`;
      if (type === 'victory' || type === 'defeat') what += ` ${d.kills}/${d.deaths}${d.placement ? ` #${d.placement}` : ''} → ${formatRank(g.game, g.career[g.game].rank)}`;
      if (type === 'switch') what += ` ${d.from} → ${d.to}`;
      if (type === 'rageQuit') what += d.midMatch ? ' (mid-match)' : '';
      log.push(`${t}  ${what.padEnd(40)} tilt ${g.tilt.toFixed(2)}  track ${g.track.toFixed(2)}  gf ${g.escape.toFixed(2)}`
        + `  da ${g.dopamine.toFixed(2)} oa ${g.octopamine.toFixed(2)} npf ${g.npf.toFixed(2)}`
        + `  values ${GAME_ORDER.map((id) => `${id.slice(0, 3)} ${g.gameValues[id] >= 0 ? '+' : ''}${g.gameValues[id].toFixed(2)}`).join(' ')}`);
    },
  });
  brain.attach(g);
  const dt = 1 / 60;
  const frames = Math.round(minutes * 60 / dt);
  let tiltSum = 0, tiltMax = 0;
  for (let f = 0; f < frames; f++) {
    g.update(dt);
    brain.step(g, dt);
    clock += dt * 1000;
    tiltSum += g.tilt; tiltMax = Math.max(tiltMax, g.tilt);
  }
  return { g, brain, log, tiltMean: tiltSum / frames, tiltMax };
}

const summary = (g) => GAME_ORDER.map((id) => {
  const c = g.career[id];
  return `${GAMES[id].short.padEnd(9)} played ${String(c.played).padStart(2)}  W/L ${c.wins}/${c.losses}  K/D ${c.kills}/${c.deaths}`
    + `  slams ${String(c.slams).padStart(2)}  rage-quits ${c.rageQuits}  value ${g.gameValues[id] >= 0 ? '+' : ''}${g.gameValues[id].toFixed(2)}  ${formatRank(id, c.rank)}`;
}).join('\n');

if (league) {
  const seeds = nums[1] ?? 8;
  console.log('seed  matches  slams  quits  switches  flinches  tilt(mean/max)  most hated');
  for (let s = 1; s <= seeds; s++) {
    const { g, tiltMean, tiltMax } = play(s);
    const hated = GAME_ORDER.slice().sort((a, b) => g.gameValues[a] - g.gameValues[b])[0];
    console.log(`${String(s).padStart(4)}  ${String(g.matches).padStart(7)}  ${String(g.slams).padStart(5)}  ${String(g.rageQuits).padStart(5)}`
      + `  ${String(g.switches).padStart(8)}  ${String(g.flinches).padStart(8)}  ${tiltMean.toFixed(2)} / ${tiltMax.toFixed(2)}     ${GAMES[hated].short}`);
  }
} else {
  const { g, brain, log, tiltMean, tiltMax } = play(nums[1] ?? 1);
  if (!quiet) console.log(log.join('\n'));
  console.log(`\nturns right with: ${brain.readers.right.map((r) => r.name).join(', ')}`);
  console.log(`turns left with: ${brain.readers.left.map((r) => r.name).join(', ')}`);
  console.log(`tracks targets with: ${brain.readers.target.map((r) => r.name).join(', ')}`);
  console.log(`Kenyon cells per game: ${GAME_ORDER.map((id) => `${id}: ${brain.kcSets[id].map((i) => meta.names[i]).join('/')}`).join('  ')}`);
  console.log(`\n${minutes} minutes: ${g.matches} matches, ${g.slams} desk slams, ${g.rageQuits} rage-quits, ${g.switches} switches, ${g.flinches} flinches; tilt mean ${tiltMean.toFixed(2)}, max ${tiltMax.toFixed(2)}`);
  console.log(summary(g));
}
