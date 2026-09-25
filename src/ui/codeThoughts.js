/**
 * What the coder fly is thinking, in words.
 *
 * As in every Fly Lab experiment, the words are ours and the choice of line
 * is not: each situation is read off the coder's actual state — the build,
 * CI, the caffeine in its body, the sleep drive from its dorsal fan-shaped
 * body, the giant fibre, flow, and what its mushroom body has learned.
 */
import { PHASES } from '../game/coder.js';

const HOLD_MS = 5200;
const RECENT_MS = 3600;

const SITUATIONS = [
  {
    key: 'asleep', urgent: true,
    when: (c) => c.phase === PHASES.ASLEEP,
    lines: ['jjjjjjjjjjjjjjjjjjjjjjjj', 'zzz… merge… conflict… zzz', '…five more minutes…'],
  },
  {
    key: 'morning', urgent: true,
    when: (c) => c.phase === PHASES.MORNING,
    lines: ['The sun. Is that the sun. Already?', 'Shipped it. Going to sleep. In the chair. Fine.', 'Night well spent. Probably.'],
  },
  {
    key: 'jerk', urgent: true,
    when: (c, r) => r?.kind === 'jerk',
    lines: ['I WAS NOT ASLEEP', 'The keyboard came at my face.', 'Resting my eyes. All eight hundred of them.'],
  },
  {
    key: 'nodding', urgent: true,
    when: (c) => c.phase === PHASES.NODDING,
    lines: ['Just… closing… the… tab…', 'The code is… so… soft…'],
  },
  {
    key: 'deploy', urgent: true,
    when: (c, r) => r?.kind === 'deploy',
    lines: ['Deployed. I am a god.', 'It is live on pokyh.com. Someone check it. Not me. I am tired.', 'Green on main. PAM is throwing a party.'],
  },
  {
    key: 'ci', urgent: true,
    when: (c, r) => r?.kind === 'ciFail',
    lines: ['It works on my machine.', 'CI is wrong. CI is always wrong.', 'Why is the runner in UTC. Why is anything in UTC.'],
  },
  {
    key: 'build', urgent: true,
    when: (c, r) => r?.kind === 'buildFail' || r?.kind === 'typeError',
    lines: ['Why is it undefined.', 'Who wrote this. Oh. Me.', 'TypeScript knows. TypeScript always knows.'],
  },
  {
    key: 'conflict', urgent: true,
    when: (c, r) => r?.kind === 'conflict' || r?.kind === 'rejected',
    lines: ['Somebody pushed. At three in the morning. Who.', 'Merge conflict. Accept mine. Accept all of mine.'],
  },
  {
    key: 'commit', urgent: false,
    when: (c, r) => r?.kind === 'commit' || r?.kind === 'buildOk',
    lines: ['One more commit. Then sleep.', 'git push and pray.', 'Clean build. Suspicious.'],
  },
  {
    key: 'sip', urgent: true,
    when: (c) => c.phase === PHASES.SIPPING,
    lines: [
      (c) => (c.familiar < 0.3 ? 'Bitter. Every taste neuron says no. Drinking anyway.' : 'Coffee is bitter. Coffee is life.'),
      (c) => (c.sugar ? 'Sugar in it. PAM approves.' : 'Black. Like the terminal.'),
      'The mushroom body remembers: this keeps me up.',
    ],
  },
  {
    key: 'jitters', urgent: false,
    when: (c) => c.jitter > 0.5,
    lines: ['I can hear my own heart. It is typing faster than me.', 'Too much coffee. Or not enough. Hard to tell.', 'Every leg is buzzing. Only one of them is coding.'],
  },
  {
    key: 'crash', urgent: false,
    when: (c) => c.crash > 0.4,
    lines: ['The coffee is leaving. I felt it go.', 'Crash incoming. Need another mug.'],
  },
  {
    key: 'tired', urgent: false,
    when: (c) => c.sleepiness > 0.62,
    lines: ['The dFB is winning.', 'My eyes are compound and all of them are closing.', 'Just one more line. Then another one.'],
  },
  {
    key: 'flow', urgent: false,
    when: (c) => c.flow > 0.6,
    lines: ['In the flow. Do not talk to me.', 'The code is writing itself. I am just the foreleg.', 'Nobody move.'],
  },
  {
    key: 'problems', urgent: false,
    when: (c) => c.problems > 0,
    lines: ['Red squiggles. My old friends.', 'That is a typo. That is definitely a typo.'],
  },
  {
    key: 'waiting', urgent: false,
    when: (c) => c.phase === PHASES.RUNNING || c.ci?.running,
    lines: ['Watching the progress bar like it owes me money.', 'Come on, CI. Come on.'],
  },
  {
    key: 'rain', urgent: false,
    when: (c) => c.daylight > 0.2,
    lines: ['The sky is getting light. That is not a good sign.', 'Birds. The birds are awake. Why.'],
  },
  {
    key: 'calm', urgent: false,
    when: () => true,
    lines: ['Rain, lo-fi, and a timetable that finally renders.', 'Just vibing. Just shipping.', 'Students will open this at 7:40 and never know.'],
  },
];

export class CodeThinker {
  constructor() {
    this.key = null;
    this.text = '';
    this.since = 0;
    this.resultAt = null;
  }

  read(c) {
    const now = c.now();
    const r = c.lastResult && now - c.lastResult.at < RECENT_MS ? c.lastResult : null;
    const s = SITUATIONS.find((x) => x.when(c, r));
    const moment = r && r.at !== this.resultAt;
    const changed = s.key !== this.key || moment;
    const held = Date.now() - this.since >= HOLD_MS;
    if (changed && (s.urgent || held)) {
      this.key = s.key;
      this.since = Date.now();
      if (r) this.resultAt = r.at;
      const lines = s.lines.map((l) => (typeof l === 'function' ? l(c) : l));
      const options = lines.length > 1 ? lines.filter((t) => t !== this.text) : lines;
      this.text = options[Math.floor(Math.random() * options.length)];
    }
    return this.text;
  }
}
