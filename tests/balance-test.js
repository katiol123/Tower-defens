// Баланс цен вышек. Запуск: node tests/balance-test.js
// Каждая вышка ставится одна на лучшую клетку (где маршрут дольше всего в зоне поражения)
// на N случайных картах; через неё идёт стандартная волна: 25 гоблинов (выносливость 5,
// скорость 10, без перков) с интервалом 1 с. Ценность вышки = полезный урон (без оверкилла).
// Цена пропорциональна ценности; эталон — средняя цена 105 золотых.
const TD = require('./load');
const MAPS = +(process.argv[2] || 60);

function bestTile(game, def) {
  const R = TD.F.range(def.stats.range) * TD.TILE;
  let best = null, bestCov = -1;
  for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
    if (!game.map.buildable(x, y)) continue;
    const cx = (x + .5) * TD.TILE, cy = (y + .5) * TD.TILE;
    let cov = 0;
    for (const p of game.map.paths) for (let d = 0; d < p.route.length; d += 6) {
      const q = TD.routeAt(p.route, d);
      if (Math.hypot(q.x - cx, q.y - cy - 10) <= R) cov += 6;
    }
    if (cov > bestCov) { bestCov = cov; best = { x, y }; }
  }
  return best;
}

const res = {};
for (const def of TD.TOWERS) {
  let dmg = 0, kills = 0, shots = 0, hits = 0;
  for (let m = 0; m < MAPS; m++) {
    const game = new TD.Game(3000 + m);
    game.immortalCastle = true;
    game.map.spots.length = 0;   // цены считаем для вышки без мест силы
    const rng = TD.makeRng(777 + m);
    const c = bestTile(game, def);
    const t = game.addTower(def, c.x, c.y, true);
    let at = 0;
    const queue = [];
    for (let i = 0; i < 25; i++) queue.push({ at: (at += 1.0), path: i % game.map.paths.length });
    let guard = 0;
    while ((queue.length || game.enemies.length) && guard++ < 60 * 400) {
      while (queue.length && queue[0].at <= game.time) {
        const q = queue.shift();
        game.spawnEnemy(TD.createGoblin(rng, { stats: { sta: 5, spd: 10, str: 3 }, perks: [] }), q.path);
      }
      game.update(TD.DT);
    }
    dmg += t.dmgDealt; kills += t.kills; shots += t.shots; hits += t.hits;
  }
  res[def.id] = { def, dmg: dmg / MAPS, kills: kills / MAPS, hitRate: hits / shots };
}

const avgVal = Object.values(res).reduce((s, r) => s + r.dmg, 0) / TD.TOWERS.length;
console.log('Вышка            | урон/волну | убийств | попадания | факт. DPS | цена сейчас | цена по тесту');
for (const id in res) {
  const r = res[id], a = TD.towerActual(r.def);
  const fair = Math.round(105 * r.dmg / avgVal / 5) * 5;
  r.fair = fair;
  console.log(`${r.def.name.padEnd(16)} | ${r.dmg.toFixed(0).padStart(10)} | ${r.kills.toFixed(1).padStart(7)} | ${(r.hitRate * 100).toFixed(1).padStart(8)}% | ${a.dps.toFixed(1).padStart(9)} | ${String(r.def.price).padStart(11)} | ${String(fair).padStart(13)}`);
}
let ok = true;
for (const id in res) {
  const dev = Math.abs(res[id].def.price - res[id].fair) / res[id].fair;
  if (dev > 0.15) { ok = false; console.log(`FAIL ${res[id].def.name}: цена ${res[id].def.price} отличается от расчётной ${res[id].fair} больше чем на 15%`); }
}
console.log(ok ? '\nOK   цены соответствуют эффективности (±15%)' : '\nЦЕНЫ РАЗБАЛАНСИРОВАНЫ');
process.exit(ok ? 0 : 1);
