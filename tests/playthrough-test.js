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

function play(seed, order) {
  const game = new TD.Game(seed);
  let k = 0;
  while (game.phase !== 'won' && game.phase !== 'lost') {
    if (game.phase === 'build') {
      for (let guard = 0; guard < 20; guard++) {
        const def = TD.TOWERS.find(d => d.id === order[k % order.length]);
        if (game.gold < def.price) break;
        if (!buy(game, def)) break;
        k++;
      }
      game.startWave();
    }
    game.update(TD.DT);
  }
  return { won: game.phase === 'won', wave: game.wave, hp: game.castleHp, towers: game.towers.length, kills: game.stats.kills };
}

const strategies = {
  'смешанная': ['falcon', 'rattle', 'thunder', 'dragon'],
  'только Соколы': ['falcon'],
  'только Громобои': ['thunder'],
  'только Трещотки': ['rattle'],
  'только Пасти': ['dragon'],
};
for (const [name, order] of Object.entries(strategies)) {
  let wins = 0, hpSum = 0, waveSum = 0;
  for (let g = 0; g < GAMES; g++) {
    const r = play(5000 + g, order);
    if (r.won) { wins++; hpSum += r.hp; }
    waveSum += r.wave;
  }
  console.log(`${name.padEnd(16)} побед ${String(wins).padStart(3)}/${GAMES}` +
    `, средн. замок у победителей ${wins ? (hpSum / wins).toFixed(0) : '—'}, средн. волна ${(waveSum / GAMES).toFixed(1)}`);
}
