// Тёмные кристаллы. Запуск: node tests/crystals-test.js
const TD = require('./load');
let ok = true;
const check = (name, pass, info) => { ok = ok && pass; console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${info ? ': ' + info : ''}`); };
const T = TD.TILE;

// Расстановка
let countOk = true, nearRoad = true, spaced = true, freeTile = true;
for (let seed = 1; seed <= 60; seed++) {
  const g = new TD.Game(seed, { crystals: true });
  const cs = g.crystals, m = g.map;
  if (cs.length < 5 || cs.length > 7) countOk = false;
  for (const c of cs) {
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.road.has(m.key(c.tx + dx, c.ty + dy)))) nearRoad = false;
    if (!m.buildable(c.tx, c.ty) || m.spotAt(c.tx, c.ty) || g.canBuild(c.tx, c.ty)) freeTile = false;
    if (cs.some(o => o !== c && Math.max(Math.abs(o.tx - c.tx), Math.abs(o.ty - c.ty)) < 3)) spaced = false;
  }
}
check('5–7 кристаллов на каждой из 60 карт', countOk);
check('каждый вплотную к дороге, на свободной клетке (не место силы), строить на нём нельзя', nearRoad && freeTile);
check('не ближе 3 клеток друг к другу', spaced);
check('у кристалла 500 здоровья, радиус = дальность вышки с параметром 8 (4 клетки)', new TD.Game(5, { crystals: true }).crystals[0].hpMax === 500 && TD.F.range(TD.CRYSTAL.range) === 4);
check('по умолчанию кристаллы есть на всех уровнях', Object.values(TD.LEVELS).every(L => L.crystals));

// Усиление: +4 к выносливости, силе и скорости в радиусе, пропадает вне радиуса
{
  const g = new TD.Game(7, { crystals: true });
  const c = g.crystals[0];
  const e = TD.createUnit('goblin', g.rng); g.spawnEnemy(e, 0);
  const R = TD.F.range(8) * T;
  // ставим гоблина рядом с кристаллом (ищем точку маршрута в радиусе) и далеко от всех
  let din = -1, dout = -1;
  for (let d = 0; d < e.route.length; d += 4) {
    const q = TD.routeAt(e.route, d);
    const dist = Math.min(...g.crystals.map(k => Math.hypot(k.x - q.x, k.y - q.y)));
    if (din < 0 && dist < R * 0.7) din = d;
    if (dout < 0 && dist > R + 20) dout = d;
  }
  e.dist = din; TD.placeEnemy(e); g.updateCrystals();
  const hpFull = e.hp === e.hpMax;
  check('в радиусе кристалла: выносливость 2→6, сила 1→5, скорость 9→13, техника не меняется, здоровье 70→130',
    e.empowered && e.stats.sta === 6 && e.stats.str === 5 && e.stats.spd === 13 && e.stats.tech === 1 && e.hpMax === 130 && hpFull, JSON.stringify(e.stats) + ' hp ' + e.hpMax);
  e.hp = 65;   // половина
  e.dist = dout; TD.placeEnemy(e); g.updateCrystals();
  check('вышел из радиуса — параметры базовые, здоровье пропорционально (65/130 → 35/70)', !e.empowered && e.stats.sta === 2 && e.stats.spd === 9 && e.hpMax === 70 && Math.abs(e.hp - 35) < 1e-9, `${e.hp}/${e.hpMax}`);
  // Разрушенный кристалл не усиливает
  e.dist = din; TD.placeEnemy(e);
  for (const k of g.crystals) k.alive = false;
  g.updateCrystals();
  check('разрушенные кристаллы не усиливают', !e.empowered);
  // Шаман в ярости: бонусы складываются (скорость 7 + 5 + 4 = 16), сила 1 + 5 + 4 = 10
  for (const k of g.crystals) k.alive = true;
  const s = TD.createUnit('shaman', g.rng); g.spawnEnemy(s, 0); s.dist = din; TD.placeEnemy(s); g.updateCrystals();
  check('шаман в ярости у кристалла: скорость 16, сила 10, здоровье 40+15·9+250 = 425', s.stats.spd === 16 && s.stats.str === 10 && s.hpMax === 425, `${s.stats.spd}/${s.stats.str}/${s.hpMax}`);
  TD.setFrenzy(s, false);
  check('ярость спала — остаётся только кристалл: скорость 11, сила 5, здоровье 175', s.stats.spd === 11 && s.stats.str === 5 && s.hpMax === 175, `${s.stats.spd}/${s.stats.str}/${s.hpMax}`);
}

// Вышки бьют кристалл наравне с врагами
{
  const g = new TD.Game(11, { crystals: true }); g.immortalCastle = true;
  const c = g.crystals[0];
  let tw = null;
  for (let r = 1; r <= 3 && !tw; r++) for (let dy = -r; dy <= r && !tw; dy++) for (let dx = -r; dx <= r && !tw; dx++) if (g.canBuild(c.tx + dx, c.ty + dy)) tw = g.addTower(TD.TOWERS.find(d => d.id === 'falcon'), c.tx + dx, c.ty + dy, true);
  for (let i = 0; i < 60 * 4; i++) g.update(TD.DT);
  const hit = g.crystals.find(k => k.hp < 500);
  check('без врагов вышка стреляет по кристаллу и попадает', tw.shots > 0 && !!hit, `выстрелов ${tw.shots}, здоровье ${hit && Math.round(hit.hp)}`);
  for (let i = 0; i < 60 * 30 && hit.alive; i++) g.update(TD.DT);
  check('500 здоровья — кристалл разрушен', !hit.alive && hit.hp === 0 && g.stats.crystals >= 1);
  // Выбор цели: дальше по маршруту — приоритетнее, кристалл сравнивается по ближайшей точке дороги
  const g2 = new TD.Game(11, { crystals: true });
  const tw2 = g2.addTower(TD.TOWERS.find(d => d.id === 'falcon'), tw.tx, tw.ty, true);
  tw2.act.range = 99;
  const spd = TD.enemySpeedPx; TD.enemySpeedPx = () => 0;
  const behind = TD.createUnit('goblin', g2.rng); g2.spawnEnemy(behind, 0); behind.dist = 0; TD.placeEnemy(behind);
  g2.updateTower(tw2, TD.DT);
  const t1 = tw2.target;
  const ahead = TD.createUnit('goblin', g2.rng); g2.spawnEnemy(ahead, 0); ahead.dist = ahead.route.length * 0.97; TD.placeEnemy(ahead);
  g2.updateTower(tw2, TD.DT);
  TD.enemySpeedPx = spd;
  const maxProg = Math.max(...g2.crystals.map(k => k.prog));
  check('кристалл и враги — одинаковые цели: берётся тот, кто дальше по маршруту',
    t1 && t1.crystal && t1.prog === maxProg && tw2.target === ahead, `${t1 && t1.id}, затем ${tw2.target && (tw2.target.crystal ? 'кристалл' : 'враг')}`);
  // Взрыв задевает кристалл
  const g3 = new TD.Game(11, { crystals: true });
  const k3 = g3.crystals[0];
  const fake = { tower: { def: TD.TOWERS.find(d => d.id === 'thunder'), dmgDealt: 0, kills: 0 }, dmg: 30 };
  g3.explode(fake, k3.x, k3.y - 18, null);
  check('взрыв Громобоя задевает кристалл', Math.abs(500 - k3.hp - 18) < 1e-9, `${500 - k3.hp}`);
}

console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
