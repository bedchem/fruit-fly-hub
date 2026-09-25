/**
 * The four games on the fly's monitor, as data: what each is called, how a
 * match of it runs, what counts as a rank, who is on the team and what they
 * say. The rules of play live in gamer.js and the pictures in
 * scene/gamePainters.js; nothing here is drawn or simulated.
 *
 * The games are the real ones by name only. Every picture of them is painted
 * by us, procedurally — no logos, no footage, no assets — and none of their
 * makers has anything to do with this page.
 */

export const GAME_ORDER = ['lol', 'minecraft', 'fortnite', 'cs2'];

/**
 * `seconds` is one match in real time, compressed. `loom` is the chance an
 * encounter comes at the fly fast and big — a gank, a creeper, a builder over
 * the wall, a peek — rather than as a target it has time to line up. `ttk` is
 * how long an enemy takes to kill it, and `hp` how much of the crosshair's
 * time on target it takes to kill the enemy.
 */
export const GAMES = {
  lol: {
    id: 'lol',
    name: 'League of Legends',
    short: 'League',
    maker: 'Riot Games',
    seconds: 82,
    calm: [2.4, 4.6],
    loom: 0.3,
    ttk: [1.5, 2.3],
    hp: [0.55, 0.85],
    // the key light the screen throws: summoner's-rift green and a gold rim
    glow: '#3fae7a',
    accent: '#c8aa6e',
    enemyKind: 'champion',
    loomKind: 'gank',
    ally: ['mothman', 'BeeKay', 'larva_main', 'Aphid'],
    enemy: ['Spider_Main', 'SwatterGG', 'Frogger', 'Dragonfly', 'vinegarTrap'],
    flame: ['?', 'ff 15', 'jungle diff', 'fly why', 'report fly for inting', 'bro', 'mid gap', 'open mid?'],
    praise: ['nice', 'W fly', 'ty', 'carry us'],
    rage: ['JUNGLE WHERE WERE U', 'HOW DID THAT HIT', 'I HAD FLASH', 'LAG', 'REPORT HIM', 'FF NOW', 'UNINSTALLING'],
    calmTalk: ['gg', 'ty', 'wp'],
    cockyTalk: ['ez', 'too easy', 'solo carry'],
  },
  minecraft: {
    id: 'minecraft',
    name: 'Minecraft',
    short: 'Minecraft',
    maker: 'Mojang Studios',
    seconds: 72,
    calm: [2.6, 4.8],
    loom: 0.38,
    ttk: [1.7, 2.6],
    hp: [0.5, 0.8],
    glow: '#6fbf45',
    accent: '#7ec850',
    enemyKind: 'zombie',
    loomKind: 'creeper',
    ally: ['mothman', 'BeeKay', 'larva_main'],
    enemy: ['Zombie', 'Skeleton', 'Spider'],
    flame: ['bro where are the diamonds', 'not the lava again', 'lmaooo', 'RUN', 'creeper behind u', 'u died to a zombie??'],
    praise: ['diamonds!!', 'W', 'nice'],
    rage: ['WHO LET THE CREEPER IN', 'WHY IS THERE LAVA', 'MY DIAMONDS', 'I DIDNT EVEN SEE IT', 'THIS GAME HATES ME'],
    calmTalk: ['gg', 'sunrise :)', 'we made it'],
    cockyTalk: ['ez night', 'full diamond', 'built different'],
  },
  fortnite: {
    id: 'fortnite',
    name: 'Fortnite',
    short: 'Fortnite',
    maker: 'Epic Games',
    seconds: 76,
    calm: [2.4, 4.4],
    loom: 0.34,
    ttk: [1.3, 2.1],
    hp: [0.55, 0.85],
    glow: '#9b6bff',
    accent: '#45c3ff',
    enemyKind: 'player',
    loomKind: 'builder',
    ally: ['mothman', 'BeeKay', 'xX_wasp_Xx'],
    enemy: ['Spider_Main', 'SwatterGG', 'Frogger', 'Dragonfly', 'Mantis'],
    flame: ['revive me', 'build!!', 'he is cracked', '#2 again??', 'why u push', 'bro'],
    praise: ['W', 'nice one', 'cracked fly'],
    rage: ['HE BUILT A HOTEL', 'THE STORM', 'HOW IS HE SO FAST', 'I HIT HIM FIRST', 'SECOND AGAIN'],
    calmTalk: ['gg', 'wp', 'close one'],
    cockyTalk: ['ez', 'no build diff', 'too cracked'],
  },
  cs2: {
    id: 'cs2',
    name: 'Counter-Strike 2',
    short: 'CS2',
    maker: 'Valve',
    seconds: 84,
    calm: [2.0, 3.8],
    loom: 0.42,
    ttk: [1.25, 1.9],
    hp: [0.45, 0.75],
    glow: '#e0a64a',
    accent: '#f2c572',
    enemyKind: 'player',
    loomKind: 'peek',
    ally: ['mothman', 'BeeKay', 'larva_main', 'Aphid'],
    enemy: ['Spider_Main', 'SwatterGG', 'Frogger', 'Dragonfly', 'Mantis'],
    flame: ['nt', 'bro u had him', 'why u peek', 'eco?', 'full buy pls', 'report fly'],
    praise: ['nice one', 'nt nt', 'W', 'clutch!'],
    rage: ['HE WAS BEHIND A WALL', 'THAT WAS A HEADSHOT', 'MY CROSSHAIR WAS ON HIM', 'DESYNC', 'NO WAY'],
    calmTalk: ['gg', 'nt', 'wp'],
    cockyTalk: ['ez', 'one tap', 'headshot machine'],
  },
};

/** CS2 plays rounds inside the match; first to this many takes it. */
export const CS2_ROUNDS_TO_WIN = 5;
/** Fortnite starts every match with this many players. */
export const FORTNITE_PLAYERS = 100;

// ------------------------------------------------------------------ ranks

const LOL_TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];

/**
 * Every game keeps its own number, and says it its own way. LoL: 100 LP a
 * division. CS2: a rating in the thousands. Fortnite: points. Minecraft:
 * diamonds kept.
 */
export const START_RANK = { lol: 843, minecraft: 12, fortnite: 1200, cs2: 8450 };

export function formatRank(id, v) {
  if (id === 'lol') {
    const div = Math.max(0, Math.floor(v / 100));
    const tier = LOL_TIERS[Math.min(LOL_TIERS.length - 1, Math.floor(div / 4))];
    return tier === 'Master' ? `Master ${Math.round(v - 2800)} LP` : `${tier} ${DIVISIONS[div % 4]} · ${Math.round(v % 100)} LP`;
  }
  if (id === 'cs2') return `${Math.round(v).toLocaleString('en-US')} rating`;
  if (id === 'fortnite') return `${Math.round(v).toLocaleString('en-US')} pts`;
  return `${Math.round(v)} diamonds`;
}

/** How a match result moves the rank. `m` is the finished match. */
export function rankDelta(id, m, rng) {
  const r = rng();
  if (id === 'lol') return m.won ? 18 + Math.round(r * 8) : -(15 + Math.round(r * 7));
  if (id === 'cs2') return m.won ? 120 + Math.round(r * 110) : -(100 + Math.round(r * 120));
  if (id === 'fortnite') return Math.round((100 - m.placement) * 1.6) - 60;
  // Minecraft: what it carried home at sunrise; dying on the way drops it all
  return m.won ? m.carried : -Math.min(6, 1 + m.deaths);
}
