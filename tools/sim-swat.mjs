/**
 * The fly and the swatter, headless: the real game, the real brain, stepped
 * at 60 fps on a simulated clock.
 *
 *   node tools/sim-swat.mjs [minutes=5] [seed=1] [--quiet]
 *
 * One line per swing, and a summary: escapes, hits, reaction times, takeoff
 * modes, and how wary the table has made it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SwatGame } from '../src/game/swatter.js';
import { parseGraph } from '../src/neural/simulation.js';
import { SwatBrain } from '../src/neural/swatBrain.js';
import meta from '../src/neural/cnsGraph.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const nums = args.filter((a) => !a.startsWith('--')).map(Number);
const minutes = nums[0] ?? 5;
const seed = nums[1] ?? 1;

const buf = fs.readFileSync(path.join(here, '../public/data/graph.bin'));
const graph = parseGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const brain = new SwatBrain(graph, meta);

let peak = 0;
const game = new SwatGame({
  seed,
  onEvent: (type, d) => {
    const t = `${game.clock.toFixed(1).padStart(6)}s`;
    if (type === 'swing') peak = 0;
    if (quiet) return;
    if (type === 'takeoff') console.log(`${t} takeoff ${d.mode.padEnd(5)} during ${d.during}${d.reaction !== null ? ` after ${d.reaction.toFixed(0)} ms` : ''}`);
    if (type === 'hit' || type === 'miss') {
      console.log(`${t} ${d.kind.toUpperCase().padEnd(6)} margin ${d.margin?.toFixed(0) ?? "—"} ms, swing ${d.swing.toFixed(0)} ms, GF peak ${peak.toFixed(2)}, skill ${game.hand.skill.toFixed(2)}, vigilance ${game.vigilance.toFixed(2)}, memory ${game.memory.toFixed(2)}`);
    }
    if (type === 'feint') console.log(`${t} feint`);
  },
});
brain.attach(game);

const dt = 1 / 60;
for (let i = 0; i < minutes * 60 * 60; i++) {
  game.update(dt);
  brain.step(game, dt);
  peak = Math.max(peak, game.escape);
}
const s = game.stats;
console.log(`\n${minutes} min, seed ${seed}: ${s.swings} swings, ${s.escapes} escaped (${s.near} near, ${s.whiffs} whiffed), ${s.blackouts} blackouts, ${s.hits} hits, ${s.early} left before the swing, ${s.feints} feints`);
console.log(`takeoffs: long ${s.long}, short ${s.short}; reaction mean ${game.meanReaction?.toFixed(0) ?? '—'} ms, best ${s.best?.toFixed(0) ?? '—'} ms; best streak ${s.bestStreak}`);
console.log(`drank ${s.sipped.toFixed(0)} s, peak ${(game.peakBac / 21.7).toFixed(2)} permille; memory ${game.memory.toFixed(2)}, learned ${game.learned.toFixed(2)}, vigilance ${game.vigilance.toFixed(2)}, hand skill ${game.hand.skill.toFixed(2)}`);
