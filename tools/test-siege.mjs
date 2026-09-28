import test from 'node:test';
import assert from 'node:assert/strict';
import { Gamer, PHASES } from '../src/game/gamer.js';
import { GAME_ORDER } from '../src/game/games.js';
import { startSiegeRound, updateSiege, siegeRoundEnd, siegeMatchOver, SIEGE_TIME } from '../src/game/siege.js';

function game(seed = 42) {
  const g = new Gamer({ seed }); g.cases.autoEnabled = false; g.game = 'r6'; g.startMatch();
  return g;
}
function action(g) { updateSiege(g, SIEGE_TIME.preparation); return g.match.siege; }
function quiet(g) { const s = action(g); s.nextTrade = Infinity; s.tacticalNext = Infinity; g.match.calmFor = Infinity; return s; }

test('all eight games can be picked; it quits to the desktop and opens them; cases cannot be interrupted', () => {
  const g = game();
  assert.equal(GAME_ORDER.length, 8);
  for (const id of GAME_ORDER) {
    const from = g.game;
    if (id === from) { assert.equal(g.selectGame(id), false); continue; }
    assert(g.selectGame(id));
    assert.equal(g.phase, PHASES.SWITCHING); assert.equal(g.game, from); assert.equal(g.nextGame, id); assert.equal(g.switchBy, 'visitor');
    for (let i = 0; i < 60 * 4 && g.phase === PHASES.SWITCHING; i++) g.update(1 / 60);
    assert.equal(g.game, id); assert.equal(g.phase, PHASES.QUEUE);
  }
  assert.equal(g.selectGame('missing'), false);
  // changing its mind mid-switch retargets, without another quit
  g.selectGame('lol'); const n = g.switches; assert(g.selectGame('cs2')); assert.equal(g.switches, n); assert.equal(g.nextGame, 'cs2');
  const h = game(); h.openCases(3); assert.equal(h.selectGame('lol'), false); assert.equal(h.cases.active.count, 3);
});

test('Siege prepares five players on each side before live action', () => {
  const g = game(), s = g.match.siege;
  assert.equal(s.phase, 'preparation'); assert.equal(s.team.length, 5); assert.equal(s.foes.length, 5);
  updateSiege(g, 2); assert.equal(g.enemy, null); assert.equal(g.match.roundT, 0);
  updateSiege(g, 2.3); assert.equal(s.phase, 'action'); assert.equal(s.drone, false);
});

test('sides rotate at three rounds and alternate in overtime', () => {
  const g = game();
  for (const [round, attack] of [[1,true],[3,true],[4,false],[6,false],[7,true],[8,false],[9,true]]) {
    g.match.round = round; startSiegeRound(g); assert.equal(g.match.siege.attack, attack);
  }
  for (const [us,them,done] of [[3,0,false],[4,2,true],[4,3,false],[4,4,false],[5,4,true]]) {
    assert.equal(siegeMatchOver({rounds:{us,them}}),done);
  }
});

test('death persists until the next round; no respawn or health regeneration', () => {
  const g = game(), s = quiet(g); g.spawn(); g.enemy.name = s.foes[0].name; g.die('shot');
  updateSiege(g, 3); assert(g.dead); assert.equal(g.match.hp, 0); assert.equal(s.team[0].alive, false);
  siegeRoundEnd(g, 'them', 'TEST'); updateSiege(g, SIEGE_TIME.result);
  assert.equal(g.dead,null); assert.equal(g.match.hp,100); assert.equal(g.match.round,2);
});

test('eliminating all defenders wins once and surviving health is retained', () => {
  const g = game(), s = quiet(g); g.match.hp = 48;
  updateSiege(g,.1); assert.equal(g.match.hp,48);
  for (const p of s.foes) { g.spawn(); g.enemy.name = p.name; g.kill(false); }
  assert.equal(s.phase,'round-end'); assert.equal(g.match.rounds.us,1);
  siegeRoundEnd(g,'us','AGAIN'); assert.equal(g.match.rounds.us,1);
});

test('planting, disabling and posthumous defuser wins follow objective rules', () => {
  const g = game(), s = quiet(g); s.objectiveAt = 0;
  updateSiege(g,.1); assert.equal(s.phase,'planting');
  updateSiege(g,SIEGE_TIME.plant); assert.equal(s.phase,'planted');
  s.defuseAt = 99;
  s.team.forEach(p=>{p.alive=false;});
  updateSiege(g,SIEGE_TIME.planted); assert.equal(g.match.rounds.us,1);
  const h = game(), t = quiet(h); t.phase='planted'; t.defuseAt=0; t.team.forEach(p=>{p.alive=false;});
  updateSiege(h,SIEGE_TIME.defuse); assert.equal(h.match.rounds.them,1); assert.equal(h.match.roundOver.reason,'DEFUSER DISABLED');
});

test('unplanted timeout awards defenders; reload consumes finite reserves', () => {
  const g = game(), s = quiet(g); s.objectiveAt=Infinity;
  s.ammo=3; s.reserve=12; s.reload=.4;
  updateSiege(g,.5); assert.equal(s.ammo,15); assert.equal(s.reserve,0);
  updateSiege(g,SIEGE_TIME.action); assert.equal(g.match.rounds.them,1); assert.equal(g.match.roundOver.reason,'TIME EXPIRED');
});

test('30 seeded matches terminate with valid round results and finite state', () => {
  const outcomes = [];
  for (let seed=1; seed<=30; seed++) {
    const g=game(seed);
    for (let i=0;i<60*500 && g.phase===PHASES.PLAYING;i++) g.update(1/60);
    assert.equal(g.phase,PHASES.RESULT,`seed ${seed}`);
    assert(siegeMatchOver(g.match)); assert(Number.isFinite(g.match.hp));
    assert.equal(g.match.siege.rounds.length,g.match.rounds.us+g.match.rounds.them);
    outcomes.push(g.result.won);
  }
  assert(outcomes.includes(true)); assert(outcomes.includes(false));
});
