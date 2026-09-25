/**
 * A night at the desk, headless: the real coder, the real brain — the dFB,
 * the giant fibre, PAM, PPL1, the mushroom body — stepped at 60 fps on a
 * simulated clock.
 *
 *   node tools/sim-code.mjs [minutes=10] [seed=1] [--quiet] [--no-brain]
 *   node tools/sim-code.mjs --nights [seeds=6]     one line per seed: how its first night went
 *
 * One line per event that matters: the game clock, caffeine in mg, the sleep
 * drive the dFB reports, the pressure behind it, commits, errors, deploys,
 * and whether it is awake.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Coder, PHASES } from '../src/game/coder.js';
import { parseGraph } from '../src/neural/simulation.js';
import { CodeBrain } from '../src/neural/codeBrain.js';
import meta from '../src/neural/cnsGraph.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const nightsMode = args.includes('--nights');
const quiet = args.includes('--quiet') || nightsMode;
const noBrain = args.includes('--no-brain');
const trace = args.includes('--trace');
const nums = args.filter((a) => !a.startsWith('--')).map(Number);

const buf = fs.readFileSync(path.join(here, '../public/data/graph.bin'));
const graph = parseGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const SHOWN = new Set([
  'compiled', 'typeError', 'buildOk', 'buildFail', 'commit', 'push', 'rejected', 'conflict', 'resolved',
  'ciFail', 'deploy', 'refill', 'nod', 'jerk', 'asleep', 'wake', 'morning', 'night', 'flow', 'flowLost',
  'jitters', 'crash', 'task', 'lean',
]);

function play(seed, minutes, { stopAtMorning = false } = {}) {
  let clock = 0;
  const brain = noBrain ? null : new CodeBrain(graph, meta);
  const log = [];
  let morning = null;
  let c = null;
  c = new Coder({
    seed,
    now: () => clock,
    onEvent: (type, d) => {
      if (type === 'morning') morning = { ...d };
      if (!c || quiet || !SHOWN.has(type)) return;
      const what = type === 'task' ? `task: ${d.task.msg}${d.task.hotfix ? ' (hotfix)' : ''}`
        : type === 'lean' ? `coffee ×${c.sipPlan?.sips} — ${c.why}`
          : type === 'deploy' ? '★ DEPLOYED to pokyh.com'
            : type === 'morning' ? `── morning: ${d.commits} commits, ${d.deploys} deploys, ${Math.round(d.mg)} mg, slept ${Math.round(d.slept)} min ──`
              : type === 'typeError' || type === 'buildFail' ? `${type}: ${d.msg}`
                : type === 'ciFail' ? `ciFail at ${d.step}: ${d.reason}`
                  : type === 'jerk' || type === 'asleep' ? `${type} (giant fibre peaked at ${c.nodEscape.toFixed(2)}, dFB ${c.sleepiness.toFixed(2)})`
                    : type;
      log.push(`${(clock / 1000).toFixed(0).padStart(4)}s n${c.night} ${c.clock}  caf ${String(Math.round(c.caffeine)).padStart(3)}mg`
        + `  dFB ${c.sleepiness.toFixed(2)} (drive ${c.sleepDrive.toFixed(2)}, P ${c.pressure.toFixed(2)})`
        + `  da ${c.dopamine.toFixed(2)} flow ${c.flow.toFixed(2)} jit ${c.jitter.toFixed(2)} crash ${c.crash.toFixed(2)}`
        + `  ${String(c.commits).padStart(2)}c ${String(c.errors).padStart(2)}e ${c.deploys}d  ${c.asleep ? 'zz' : 'up'} | ${what}`);
    },
  });
  brain?.attach(c);
  const dt = 1 / 60;
  const frames = Math.round(minutes * 60 / dt);
  for (let f = 0; f < frames; f++) {
    c.update(dt);
    brain?.step(c, dt);
    clock += dt * 1000;
    if (!morning) {
      c.maxSeen ??= { jitter: 0, crash: 0, flow: 0 };
      c.maxSeen.jitter = Math.max(c.maxSeen.jitter, c.jitter);
      c.maxSeen.crash = Math.max(c.maxSeen.crash, c.crash);
      c.maxSeen.flow = Math.max(c.maxSeen.flow, c.flow);
    }
    if (trace && f % 600 === 0) {
      log.push(`${(clock / 1000).toFixed(0).padStart(4)}s    ${c.clock}  · ${c.phase} stage ${c.task.stage} line ${c.editor.line}/${c.task.end} pending ${c.pending.map((p) => p.cmd).join(',')} plan ${c.plan?.kind ?? '-'} tap ${c.tapRate.toFixed(1)}/s`);
    }
    if (stopAtMorning && morning && c.phase !== PHASES.MORNING) break;
  }
  return { c, brain, log, morning };
}

if (nightsMode) {
  const seeds = nums[0] ?? 6;
  console.log('seed  commits  deploys  errors  ciFails  mugs   mg  peak  jitters  crash  flow  nods jerks  asleep-at  slept   real-s');
  for (let s = 1; s <= seeds; s++) {
    const { c, morning } = play(s, 14, { stopAtMorning: true });
    const m = morning ?? c.nightStats;
    console.log(`${String(s).padStart(4)}  ${String(m.commits).padStart(7)}  ${String(m.deploys).padStart(7)}  ${String(m.errors).padStart(6)}`
      + `  ${String(c.ciFails).padStart(7)}  ${String(c.mugs).padStart(4)}  ${String(Math.round(m.mg)).padStart(4)}  ${String(m.peak).padStart(4)}  ${c.maxSeen.jitter.toFixed(2).padStart(7)}  ${c.maxSeen.crash.toFixed(2).padStart(5)}  ${c.maxSeen.flow.toFixed(2)}`
      + `  ${String(c.nods).padStart(4)} ${String(c.jerks).padStart(5)}`
      + `  ${String(m.asleepAt ?? '—').padStart(9)}  ${String(Math.round(m.slept)).padStart(4)}m  ${(c.lastEvent?.at / 1000).toFixed(0).padStart(6)}`);
  }
} else {
  const { c, brain, log } = play(nums[1] ?? 1, nums[0] ?? 10);
  if (!quiet) console.log(log.join('\n'));
  if (brain) console.log(`\ndFB types read: ${brain.dfbShown.map((t) => t.name).join(', ')} (of ${brain.dFB.length} FB6 types)`);
  console.log(`night ${c.night}, ${c.clock}: ${c.commits} commits, ${c.deploys} deploys, ${c.errors} errors (${c.ciFails} on CI), `
    + `${c.lines} lines, ${c.sips} sips / ${c.mugs} refills, ${Math.round(c.caffeineMg)} mg caffeine, ${c.nods} nods (${c.jerks} jerked awake), ${c.sleeps} times asleep, `
    + `memory ${c.memory.toFixed(2)}, tolerance ${c.tolerance.toFixed(2)}`);
}
