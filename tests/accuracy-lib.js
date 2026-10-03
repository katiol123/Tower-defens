// Стрельба по одиночному бессмертному гоблину на случайных картах; считаем промахи.
const TD = require('./load');

// opts: { dev (px) | acc (1–20), projR, projSpeed, rangeParam, spd, maps, seed0, unit, perks }
function measure(opts) {
  const o = Object.assign({ projR: TD.ACC.R0, projSpeed: 14, rangeParam: 8, spd: 10, maps: 60, seed0: 1000, interval: 0.35 }, opts);
  let shots = 0, missed = 0;
  for (let m = 0; m < o.maps; m++) {
    const seed = o.seed0 + m;
    const game = new TD.Game(seed);
    game.immortalCastle = true;
    game.map.spots.length = 0;   // места силы не влияют на измерение
    const rng = TD.makeRng(seed * 31 + 7);
    const def = {
      id: 'test', stats: { dmg: 1, rate: 5, acc: o.acc || 10, range: o.rangeParam },
      proj: { kind: 'bolt', r: o.projR, speed: o.projSpeed },
    };
    for (let p = 0; p < game.map.paths.length; p++) {
      const route = game.map.paths[p].route;
      // Вышка — случайная клетка для строительства рядом с маршрутом (в пределах дальности).
      const R = TD.F.range(o.rangeParam) * TD.TILE;
      const cand = [];
      for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
        if (!game.map.buildable(x, y)) continue;
        const cx = (x + .5) * TD.TILE, cy = (y + .5) * TD.TILE;
        let near = false;
        for (let d = 0; d < route.length; d += 12) { const q = TD.routeAt(route, d); if (Math.hypot(q.x - cx, q.y - cy) < R * 0.8) { near = true; break; } }
        if (near) cand.push({ x, y });
      }
      if (!cand.length) continue;
      const c = rng.pick(cand);
      game.towers = [];
      const t = game.addTower(def, c.x, c.y, true);
      t.act.dmg = 0;
      t.act.cooldown = o.interval;
      if (o.dev !== undefined) t.act.dev = o.dev;
      const e = TD.createUnit(o.unit || 'goblin', rng, { stats: { spd: o.spd, sta: 5 }, perks: o.perks || [] });
      game.enemies = []; game.projectiles = [];
      game.spawnEnemy(e, p);
      game.onShot = pr => { if (pr.targetId === e.id) { shots++; if (!pr.hitTarget) missed++; } };
      // Первый выстрел — со сдвигом, чтобы фаза покачивания и позиция были разными.
      t.cd = rng() * o.interval;
      let guard = 0;
      while ((game.enemies.length || game.projectiles.length) && guard++ < 60 * 200) game.update(TD.DT);
    }
  }
  return { shots, missed, miss: missed / shots };
}

module.exports = { TD, measure };
