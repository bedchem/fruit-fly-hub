/**
 * What the fly at its gaming setup is thinking, in words.
 *
 * As everywhere in Fly Lab, the words are ours and the choice of line is not:
 * each situation is read off the gamer's actual state — the match, the last
 * kill or death, tilt, the giant fibre, NPF, and what its mushroom body has
 * learned about the game on screen.
 */
import { PHASES } from '../game/gamer.js';
import { GAMES } from '../game/games.js';

const HOLD_MS = 4800;
const RECENT_MS = 3200;

const SITUATIONS = [
  {
    key: 'ragequit', urgent: true,
    when: (g) => g.phase === PHASES.RAGE_QUIT,
    lines: ['UNINSTALLING. For real this time.', 'I am never playing this again. (Queues in four seconds.)', 'It is not me. It is the game.', 'Alt-F4 is a strategy.'],
  },
  {
    key: 'slam', urgent: true,
    when: (g) => g.slamPhase !== null,
    lines: ['THE DESK DID NOTHING WRONG', 'AAAAAAAAAAAAAAA', 'My foreleg hurts. Worth it.', 'WHO DESIGNED THIS GAME'],
  },
  {
    key: 'creeper', urgent: true,
    when: (g) => g.enemy?.kind === 'creeper' && g.enemy.grow > 0.3,
    lines: ['That hissing is coming from BEHIND me.', 'Not the creeper not the creeper not the—', 'Green. Silent. Growing. Every leg says run.'],
  },
  {
    key: 'flinch', urgent: true,
    when: (g) => g.escape > 0.75 || (g.loom > 0.5 && g.enemy?.loom),
    lines: ['WHAT WAS THAT', 'Something big — coming straight at me.', 'The giant fibre says jump. I am sitting in a chair.'],
  },
  {
    key: 'streak-death', urgent: true,
    when: (g, r) => r?.kind === 'death' && r.streak >= 3,
    lines: ['This lobby is rigged.', 'My team is the problem. Clearly.', 'Lag. That was lag. That was ALL lag.'],
  },
  {
    key: 'death', urgent: true,
    when: (g, r) => r?.kind === 'death',
    lines: ['How did that hit.', 'I was LOOKING at him.', 'The hitbox. The HITBOX.', 'Compound eyes, 800 facets, and I did not see that.'],
  },
  {
    key: 'victory', urgent: true,
    when: (g, r) => r?.kind === 'victory',
    lines: ['GG EZ. (It was not ez.)', 'PAM is firing. I am unstoppable.', 'One more. I am on a streak.'],
  },
  {
    key: 'defeat', urgent: true,
    when: (g, r) => r?.kind === 'defeat',
    lines: ['ff was the right call.', 'I did my part. Everyone else did not.', 'That match never happened.'],
  },
  {
    key: 'headshot', urgent: true,
    when: (g, r) => r?.kind === 'kill' && (r.hs || r.streak >= 2),
    lines: ['I am cracked. A small, cracked insect.', 'TAP. TAP. TAP.', 'Did everyone see that. Clip it.'],
  },
  {
    key: 'rdr2', urgent: false,
    when: (g) => g.phase === 'playing' && g.game === 'rdr2' && !g.enemy,
    lines: ['Just me, the horse, and a sunset.', 'Honour is a concept. Bounties are money.', 'I could ride to that mountain. I will not. There is a mission.'],
  },
  {
    key: 'gow', urgent: false,
    when: (g) => g.phase === 'playing' && (g.game === 'gow' || g.game === 'gowr') && !g.enemy,
    lines: ['The axe comes back. It always comes back.', 'Six legs, no beard. Still a god of war.', 'Do not be sorry. Be better.'],
  },
  {
    key: 'kill', urgent: false,
    when: (g, r) => r?.kind === 'kill',
    lines: ['Got him.', 'LC10a never misses.', 'Tracking like it is courtship season.'],
  },
  {
    key: 'flamed', urgent: false,
    when: (g) => g.clock < g.voice.until && g.voice.level > 0.8,
    lines: ['Who said that.', 'Report ME? Report YOU.', 'Muting. Muting everyone.'],
  },
  {
    key: 'switching', urgent: true,
    when: (g) => g.phase === PHASES.SWITCHING,
    lines: [
      (g) => (g.nextGame === 'minecraft' ? 'Minecraft. Minecraft is peaceful. Minecraft is safe.' : `Fine. ${GAMES[g.nextGame ?? g.game].short}. Something calmer.`),
      'Something else. Anything else.',
    ],
  },
  {
    key: 'queue', urgent: false,
    when: (g) => g.phase === PHASES.QUEUE,
    lines: ['One more game. Then sleep.', 'Queue pop. Queue pop. Please queue pop.', (g) => (g.gameValues[g.game] < -0.1 ? `${GAMES[g.game].short} hurts me. Queueing anyway.` : 'Locked in.')],
  },
  {
    key: 'tilted', urgent: false,
    when: (g) => g.tilt > 0.55,
    lines: ['I am not tilted. I am focused.', 'Every leg is shaking.', 'One more death and the keyboard goes out the window.'],
  },
  {
    key: 'hated', urgent: false,
    when: (g) => g.gameValues[g.game] < -0.15,
    lines: ['My mushroom body says this game is bad for me. My foreleg keeps clicking.', 'I know how this ends. I am playing anyway.'],
  },
  {
    key: 'calm', urgent: false,
    when: () => true,
    lines: ['Crosshair placement. Crosshair placement.', 'The monitor is 240 hertz. Finally something fast enough for these eyes.', 'Headset on. World off.', 'Just vibing. Just clicking heads.'],
  },
];

export class GameThinker {
  constructor() {
    this.key = null;
    this.text = '';
    this.since = 0;
    this.resultAt = null;
  }

  read(g) {
    const now = g.now();
    const r = g.lastResult && now - g.lastResult.at < RECENT_MS ? g.lastResult : null;
    const s = SITUATIONS.find((x) => x.when(g, r));
    const moment = r && r.at !== this.resultAt;
    const changed = s.key !== this.key || moment;
    const held = Date.now() - this.since >= HOLD_MS;
    if (changed && (s.urgent || held)) {
      this.key = s.key;
      this.since = Date.now();
      if (r) this.resultAt = r.at;
      const lines = s.lines.map((l) => (typeof l === 'function' ? l(g) : l));
      const options = lines.length > 1 ? lines.filter((t) => t !== this.text) : lines;
      this.text = options[Math.floor(Math.random() * options.length)];
    }
    return this.text;
  }
}
