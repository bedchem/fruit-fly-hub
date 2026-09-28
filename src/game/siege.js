/** A compressed 5v5 Bomb simulation. Durations are simulation seconds. */
export const SIEGE_TIME = { preparation: 4.2, action: 28, plant: 2.4, defuse: 2.3, planted: 8, result: 2.5 };
export const OPERATORS = {
  attack: [
    { name: 'THERMITE', weapon: '556XI', gadget: 'EXOTHERMIC CHARGE', color: '#e8883c', icon: 'breach' },
    { name: 'SLEDGE', weapon: 'L85A2', gadget: 'BREACHING HAMMER', color: '#ac7cc4', icon: 'hammer' },
    { name: 'ASH', weapon: 'R4-C', gadget: 'BREACHING ROUND', color: '#ba604f', icon: 'breach' },
    { name: 'TWITCH', weapon: 'F2', gadget: 'SHOCK DRONE', color: '#a989ce', icon: 'drone' },
    { name: 'THATCHER', weapon: 'AR33', gadget: 'EMP GRENADE', color: '#869bb3', icon: 'emp' },
  ],
  defend: [
    { name: 'MUTE', weapon: 'MP5K', gadget: 'SIGNAL DISRUPTOR', color: '#ad7991', icon: 'jammer' },
    { name: 'JÄGER', weapon: '416-C', gadget: 'ACTIVE DEFENSE', color: '#8baf89', icon: 'shield' },
    { name: 'BANDIT', weapon: 'MP7', gadget: 'SHOCK WIRE', color: '#d6ac4f', icon: 'emp' },
    { name: 'ROOK', weapon: 'MP5', gadget: 'ARMOR PACK', color: '#7d9bbb', icon: 'shield' },
    { name: 'VALKYRIE', weapon: 'MPX', gadget: 'BLACK EYE', color: '#84a4b0', icon: 'camera' },
  ],
};

// Original lodge layout. 1 plaster, 2 wood, 3 stone, 4 barricade, 5 reinforcement.
export const SIEGE_MAP = [
  '111111111111111111',
  '100000000100000001',
  '100000000100000001',
  '100000000500000001',
  '100000000100000001',
  '111141111100000001',
  '200000000100000001',
  '200000000111411111',
  '200000000000000001',
  '200000000000000001',
  '200000000000000001',
  '222242222111411111',
  '300000000100000003',
  '300000000000000003',
  '300000000100000003',
  '333333333333333333',
];
export const SIEGE_SITES = [{ x: 13.5, y: 3.5, name: '2F SERVER ROOM', letter: 'A' }, { x: 5.5, y: 2.5, name: '2F ARCHIVES', letter: 'B' }];
export function siegeCell(x, y, breached = false) {
  const type = Number(SIEGE_MAP[Math.floor(y)]?.[Math.floor(x)] ?? 1);
  return breached && (type === 4 || type === 5) ? 0 : type;
}
export function siegeMatchOver(m) {
  return Math.max(m.rounds.us, m.rounds.them) >= 5
    || (Math.max(m.rounds.us, m.rounds.them) >= 4 && Math.abs(m.rounds.us - m.rounds.them) >= 2);
}

export function startSiegeRound(g) {
  const m = g.match;
  const attack = m.round <= 3 || (m.round >= 7 && m.round % 2 === 1);
  const previous = m.siege;
  const operator = g.pick(attack ? OPERATORS.attack : OPERATORS.defend);
  m.siege = {
    phase: 'preparation', timer: 0, attack, operator, site: SIEGE_SITES[(m.round - 1) % 2],
    x: attack ? 4.5 : 13.5, y: attack ? 13.5 : 4.5, lean: 0, ads: 0, movement: 0,
    ammo: 31, reserve: 150, reload: 0, gadget: 2, gadgetAt: -99, breached: false, breachAt: -99,
    smoke: 0, sparks: 0, drone: attack, spotted: false, objective: null, plantT: 0, plantedT: 0,
    defuseT: 0, defuseAt: 2.5 + g.rng() * 2.5, nextTrade: 5 + g.rng() * 2,
    tacticalNext: 4 + g.rng() * 2, objectiveAt: 15 + g.rng() * 7,
    team: m.team.map((p, i) => ({ ...p, alive: true, operator: (attack ? OPERATORS.attack : OPERATORS.defend)[i] })),
    foes: m.enemies.map((p, i) => ({ ...p, alive: true, operator: (attack ? OPERATORS.defend : OPERATORS.attack)[i] })),
    rounds: previous?.rounds ?? [], kills: 0,
    route: attack ? [[4.5, 13.5], [4.5, 9.5], [12.5, 9.5], [12.5, 6.5], [13.5, 3.5]]
      : [[13.5, 4.5], [12.5, 6.5], [12.5, 9.5], [8.5, 9.5], [5.5, 8.5]],
    waypoint: 1,
  };
  g.enemy = null; g.dead = null; g.banner = null; g.firing = 0;
  g.view.yaw = attack ? -Math.PI / 2 : Math.PI / 2; g.view.yawVel = 0; g.view.pitch = 0;
  m.roundT = 0; m.roundOver = null; m.roundKills = 0; m.hp = 100; m.calmFor = 2.2;
  g.emit('siegePrep', { attack, operator: operator.name });
}

export function siegeRoundEnd(g, winner, reason) {
  const m = g.match, s = m.siege;
  if (s.phase === 'round-end') return;
  m.rounds[winner]++;
  m.roundOver = { t: 0, winner, reason };
  s.rounds.push({ winner, reason, attack: s.attack });
  s.phase = 'round-end'; s.timer = 0; s.drone = false;
  g.enemy = null; g.firing = 0;
  g.banner = { text: `${winner === 'us' ? 'ROUND WON' : 'ROUND LOST'} · ${reason}`, good: winner === 'us', at: g.clock };
  if (winner === 'us') g.rewardPulse = Math.max(g.rewardPulse, .6);
  else g.punishPulse = Math.max(g.punishPulse, .5);
  g.emit('round', { winner, reason });
}

function teamForSide(s, attackers) { return s.attack === attackers ? s.team : s.foes; }
function winSide(g, attackers, reason) { siegeRoundEnd(g, g.match.siege.attack === attackers ? 'us' : 'them', reason); }

export function siegeDuel(g, died, name) {
  const s = g.match.siege;
  if (died) s.team[0].alive = false;
  else {
    const foe = s.foes.find((p) => p.name === name && p.alive);
    if (foe) foe.alive = false;
    s.kills++;
    if (s.ammo < 20) { s.reload = 1.35; g.emit('siegeReload'); }
  }
  checkElimination(g);
}

function checkElimination(g) {
  const s = g.match.siege;
  const attackers = teamForSide(s, true).filter((p) => p.alive).length;
  const defenders = teamForSide(s, false).filter((p) => p.alive).length;
  if (!defenders) { winSide(g, true, 'ENEMIES ELIMINATED'); return true; }
  // A planted defuser can still win after all attackers are eliminated.
  if (!attackers && s.phase !== 'planted') { winSide(g, false, 'ENEMIES ELIMINATED'); return true; }
  return false;
}

function trade(g) {
  const m = g.match, s = m.siege;
  const allies = s.team.slice(1).filter((p) => p.alive), foes = s.foes.filter((p) => p.alive && p.name !== g.enemy?.name);
  if (!allies.length || !foes.length) return;
  const us = g.rng() < .51;
  const a = g.pick(us ? allies : foes), b = g.pick(us ? foes : allies);
  b.alive = false;
  const scorer = (us ? m.team : m.enemies).find((p) => p.name === a.name);
  const victim = (us ? m.enemies : m.team).find((p) => p.name === b.name);
  scorer.k++; victim.d++;
  if (us) m.teamScore++; else m.enemyScore++;
  g.pushFeed(a.name, b.name, g.rng() < .45, us);
}

function move(g, dt) {
  const s = g.match.siege;
  const target = s.route[s.waypoint];
  if (!target || g.enemy || g.dead || s.phase === 'planting' || s.phase === 'planted') { s.movement *= Math.exp(-dt * 5); return; }
  const dx = target[0] - s.x, dy = target[1] - s.y, distance = Math.hypot(dx, dy);
  if (distance < .16) { s.waypoint = Math.min(s.route.length, s.waypoint + 1); return; }
  const angle = Math.atan2(dy, dx);
  const turn = Math.atan2(Math.sin(angle - g.view.yaw), Math.cos(angle - g.view.yaw));
  g.view.yawVel = turn * 3; g.view.yaw += g.view.yawVel * dt;
  const speed = .82 * dt;
  const nx = s.x + dx / distance * speed, ny = s.y + dy / distance * speed;
  if (!siegeCell(nx, s.y, s.breached)) s.x = nx;
  if (!siegeCell(s.x, ny, s.breached)) s.y = ny;
  s.movement += (1 - s.movement) * dt * 4;
}

export function updateSiege(g, dt) {
  const m = g.match, s = m.siege;
  m.t += dt; s.timer += dt;
  s.smoke = Math.max(0, s.smoke - dt * .22); s.sparks = Math.max(0, s.sparks - dt * 2);
  s.ads += ((g.enemy && !g.dead && s.reload <= 0 ? .86 : 0) - s.ads) * Math.min(1, dt * 7);
  s.lean += ((g.enemy ? Math.sin(g.enemy.t * .7 + m.round) * .8 : 0) - s.lean) * Math.min(1, dt * 5);
  if (s.reload > 0) {
    s.reload = Math.max(0, s.reload - dt);
    if (s.reload === 0) { const n = Math.min(31 - s.ammo, s.reserve); s.ammo += n; s.reserve -= n; }
  }
  if (s.phase === 'round-end') {
    m.roundOver.t += dt;
    if (s.timer >= SIEGE_TIME.result) {
      if (siegeMatchOver(m)) g.endMatch();
      else { m.round++; startSiegeRound(g); }
    }
    return;
  }
  if (s.phase === 'preparation') {
    s.spotted = s.timer > 2;
    if (s.timer >= SIEGE_TIME.preparation) {
      s.phase = 'action'; s.timer = 0; s.drone = false;
      g.emit('siegeAction', { attack: s.attack });
    }
    return;
  }
  m.roundT += dt;
  if (g.dead) { g.dead.t += dt; s.drone = true; }
  if (checkElimination(g)) return;
  if (s.phase === 'planting') {
    s.plantT += dt;
    if (s.plantT >= SIEGE_TIME.plant) {
      s.phase = 'planted'; s.plantedT = 0;
      g.emit('siegePlant'); g.rewardPulse = Math.max(g.rewardPulse, s.attack ? .5 : 0);
    }
  } else if (s.phase === 'planted') {
    s.plantedT += dt;
    const defenders = teamForSide(s, false).filter((p) => p.alive);
    const attackers = teamForSide(s, true).filter((p) => p.alive);
    if (defenders.length && s.plantedT > s.defuseAt && (!attackers.length || (!g.enemy && defenders.length >= attackers.length))) {
      s.defuseT += dt;
      if (s.defuseT >= SIEGE_TIME.defuse) { winSide(g, false, 'DEFUSER DISABLED'); return; }
    } else s.defuseT = Math.max(0, s.defuseT - dt * 2);
    if (s.plantedT >= SIEGE_TIME.planted) { winSide(g, true, 'BOMB DEFUSED'); return; }
  } else {
    if (m.roundT >= SIEGE_TIME.action) { winSide(g, false, 'TIME EXPIRED'); return; }
    if (m.roundT > s.objectiveAt && !g.enemy && teamForSide(s, true).some((p) => p.alive)) {
      s.phase = 'planting'; s.objective = 'A'; s.plantT = 0; g.emit('siegePlantStart');
    }
  }
  if (m.roundT > s.tacticalNext && s.gadget > 0) {
    s.gadget--; s.gadgetAt = g.clock; s.tacticalNext += 9;
    s.breached = true; s.breachAt = g.clock; s.smoke = 1; s.sparks = 1;
    g.emit('siegeBreach', { attack: s.attack, gadget: s.operator.gadget });
  }
  s.nextTrade -= dt;
  if (s.nextTrade <= 0) { s.nextTrade = 3.8 + g.rng() * 3; trade(g); if (checkElimination(g)) return; }
  move(g, dt);
  if (s.phase === 'planting' || (s.phase === 'planted' && s.defuseT > 0)) { g.firing = 0; return; }
  if (g.dead) return;
  if (g.enemy) g.updateEncounter(dt);
  else {
    g.firing = 0;
    m.calmFor -= dt;
    if (m.calmFor <= 0 && s.foes.some((p) => p.alive)) {
      g.spawn();
      const foe = g.pick(s.foes.filter((p) => p.alive));
      g.enemy.name = foe.name; g.enemy.operator = foe.operator;
      g.enemy.startHP = m.hp;
      // Siege peeks are small silhouettes, not enemies swelling over the camera.
      g.enemy.loom = false; g.enemy.grow = 1; g.enemy.size = .13;
      g.enemy.ttk *= 1.25;
    }
  }
}
