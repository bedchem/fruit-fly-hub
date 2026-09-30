/**
 * Damian in class, headless: the real lesson, the real brain, stepped at
 * 60 fps on a simulated clock.
 *
 *   node tools/sim-67.mjs [minutes=6] [seed=1] [--quiet]
 *
 * One line per event, and a summary: how often he said it, how often anyone
 * laughed, how often he was caught, how many cues he sat through.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SixSeven } from '../src/game/sixSeven.js';
import { parseGraph } from '../src/neural/simulation.js';
import { SixSevenBrain } from '../src/neural/sixSevenBrain.js';
import meta from '../src/neural/cnsGraph.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const nums = args.filter((a) => !a.startsWith('--')).map(Number);
const minutes = nums[0] ?? 6;
const seed = nums[1] ?? 1;

const buf = fs.readFileSync(path.join(here, '../public/data/graph.bin'));
const graph = parseGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const brain = new SixSevenBrain(graph, meta);

let peak = 0;
const game = new SixSeven({
  seed,
  onEvent: (type, d) => {
    if (quiet) return;
    const t = `${game.clock.toFixed(1).padStart(6)}s`;
    const state = `fresh ${game.fresh.toFixed(2)} memory ${game.memory.toFixed(2)} suspicion ${game.teach.suspicion.toFixed(2)}`;
    if (type === 'cue') { peak = 0; console.log(`${t} cue ${d.cue.toFixed(2)}  "${d.text}"  watching ${game.watching.toFixed(1)}`); }
    if (type === 'say') console.log(`${t}   SIX SEVEN${d.mutter ? ' (muttered)' : ''} urge peak ${peak.toFixed(2)}, ${d.seen ? 'in plain sight' : 'behind its back'}`);
    if (type === 'laugh') console.log(`${t}   laughs ${d.laughs.toFixed(2)}  ${state}`);
    if (type === 'flop') console.log(`${t}   silence  ${state}`);
    if (type === 'caught') console.log(`${t}   CAUGHT, strike ${d.strikes}  ${state}`);
    if (type === 'detention') console.log(`${t} DETENTION`);
    if (type === 'released') console.log(`${t} day ${d.day}`);
  },
});
brain.attach(game);

const dt = 1 / 60;
for (let i = 0; i < minutes * 60 * 60; i++) {
  game.update(dt);
  brain.step(game, dt);
  peak = Math.max(peak, game.urge);
}
const s = game.stats;
console.log(`\n${minutes} min, seed ${seed}: ${game.itemCount} things on the board, ${s.cues} cues; said it ${s.said} times (${s.unprompted} unprompted)`);
console.log(`laughs ${s.laughs}, silence ${s.flops}, caught ${s.caught}, held it in ${s.held}, detentions ${s.detentions}; best streak ${s.bestStreak}`);
console.log(`fresh ${game.fresh.toFixed(2)}, memory ${game.memory.toFixed(2)}, learned ${game.learned.toFixed(2)}, strikes ${game.strikes}, day ${game.day}`);
