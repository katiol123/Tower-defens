// Прохождение уровня простым ботом: перед каждой волной тратит золото на вышки,
// ставя их туда, где маршрут дольше всего в зоне поражения. Проверяет, что уровень проходим,
// но не тривиален. Запуск: node tests/playthrough-test.js [игр]
const TD = require('./load');
const GAMES = +(process.argv[2] || 40);

function coverage(game, def, x, y) {
  const R = TD.F.range(def.stats.range) * TD.TILE;
  const cx = (x + .5) * TD.TILE, cy = (y + .5) * TD.TILE;
  let cov = 0;
  for (const p of game.map.paths) for (let d = 0; d < p.route.length; d += 8) {
    const q = TD.routeAt(p.route, d);
    if (Math.hypot(q.x - cx, q.y - cy - 10) <= R) cov += 8;
  }
  return cov;
}
function buy(game, def) {
  let best = null, bc = 0;
  for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
    if (!game.canBuild(x, y)) continue;
    const c = coverage(game, def, x, y);
    if (c > bc) { bc = c; best = { x, y }; }
  }
  return best && game.addTower(def, best.x, best.y);
}

// Точка, где в радиусе r больше всего врагов (центры спрайтов врагов — кандидаты).
function bestCluster(game, r) {
  let best = null, bc = 0;
  for (const e of game.enemies) {
    const c = TD.enemyBox(e);
    let n = 0;
    for (const o of game.enemies) { const d = TD.enemyBox(o); if (Math.hypot(d.cx - c.cx, d.cy - c.cy) <= r) n += o.boss ? 4 : 1; }
    if (n > bc) { bc = n; best = { x: c.cx, y: c.cy, n }; }
  }
  return best;
}

// Простые правила колдовства бота.
function castSpells(game) {
  const T = TD.TILE;
  if (game.spellReady('masonry') && game.castleHp <= TD.CASTLE_HP - 5) game.castSpell('masonry');
  if (game.spellReady('meteor')) {
    const c = bestCluster(game, TD.SPELL.meteor.radius * T);
    if (c && c.n >= 4) game.castSpell('meteor', c.x, c.y);
  }
  if (game.spellReady('frost')) {
    const c = bestCluster(game, TD.SPELL.frost.radius * T);
    if (c && c.n >= 4) game.castSpell('frost', c.x, c.y);
  }
  if (game.spellReady('chain') && game.mana >= 70) {
    // Молния — в самого продвинутого врага, если мана с запасом.
    let lead = null;
    for (const e of game.enemies) if (!lead || e.dist / e.route.length > lead.dist / lead.route.length) lead = e;
    if (lead) { const b = TD.enemyBox(lead); game.castSpell('chain', b.cx, b.cy); }
  }
}

function play(seed, order, spells) {
  const game = new TD.Game(seed);
  let k = 0, bossKilled = false, tick = 0;
  const em = game.emit.bind(game);
  game.emit = ev => { if (ev.type === 'death' && ev.e.boss) bossKilled = true; em(ev); };
  game.startWave();
  while (game.phase !== 'won' && game.phase !== 'lost') {
    // Раз в полсекунды игрового времени: покупаем вышки и колдуем.
    if (tick++ % 30 === 0) {
      for (let guard = 0; guard < 20; guard++) {
        const def = TD.TOWERS.find(d => d.id === order[k % order.length]);
        if (game.gold < def.price) break;
        if (!buy(game, def)) break;
        k++;
      }
      if (spells) castSpells(game);
    }
    game.update(TD.DT);
  }
  return { bossKilled, won: game.phase === 'won', wave: game.wave, hp: game.castleHp, towers: game.towers.length, kills: game.stats.kills };
}

const strategies = {
  'смешанная': ['falcon', 'rattle', 'thunder', 'dragon'],
  'только Соколы': ['falcon'],
  'только Громобои': ['thunder'],
  'только Трещотки': ['rattle'],
  'только Пасти': ['dragon'],
};
const runs = [['смешанная без заклинаний', strategies['смешанная'], false]]
  .concat(Object.entries(strategies).map(([n, o]) => [n + ' + заклинания', o, true]));
for (const [name, order, spells] of runs) {
  let wins = 0, hpSum = 0, waveSum = 0, bosses = 0;
  for (let g = 0; g < GAMES; g++) {
    const r = play(5000 + g, order, spells);
    if (r.won) { wins++; hpSum += r.hp; }
    waveSum += r.wave;
    if (r.bossKilled) bosses++;
  }
  console.log(`${name.padEnd(30)} побед ${String(wins).padStart(3)}/${GAMES}` +
    `, средн. замок у победителей ${wins ? (hpSum / wins).toFixed(0) : '—'}, средн. волна ${(waveSum / GAMES).toFixed(1)}, босс убит ${bosses}`);
}
