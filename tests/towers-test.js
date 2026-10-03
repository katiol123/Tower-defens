// Новые вышки: Чародейский шпиль, Морозный тотем, Дозорный колокол. Запуск: node tests/towers-test.js
const TD = require('./load');
let ok = true;
const check = (name, pass, info) => { ok = ok && pass; console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${info ? ': ' + info : ''}`); };
const DEF = id => TD.TOWERS.find(d => d.id === id);
const T = TD.TILE;

// Ближайшая к точке свободная клетка
function tileNear(g, x, y, skip) {
  let best = null, bd = 1e9;
  for (let ty = 0; ty < TD.ROWS; ty++) for (let tx = 0; tx < TD.COLS; tx++) {
    if (!g.canBuild(tx, ty) || (skip && skip(tx, ty))) continue;
    const d = Math.hypot((tx + .5) * T - x, (ty + .5) * T - y);
    if (d < bd) { bd = d; best = { tx, ty }; }
  }
  return best;
}
function put(g, id, x, y, skip) { const c = tileNear(g, x, y, skip); return g.addTower(DEF(id), c.tx, c.ty, true); }
function unit(g, type, frac, path) { const e = TD.createUnit(type, g.rng); g.spawnEnemy(e, path || 0); e.dist = e.route.length * frac; TD.placeEnemy(e); return e; }

// ---------- Чародейский шпиль ----------
{
  const sp = DEF('spire'), a = TD.towerActual(sp);
  check('Шпиль: урон 9 → 18,36 (магия), скорость 5 → 0,7/с, дальность 10 → 4,7 кл',
    Math.abs(a.dmg - 18.36) < 0.03 && Math.abs(a.rate - 0.7) < 1e-9 && Math.abs(a.range - 4.7) < 1e-9 && sp.dmgType === 'magic', `${a.dmg} / ${a.rate} / ${a.range}`);
  // Не промахивается: стреляет по наездникам (скорость 15, «Серая молния»)
  let shots = 0, hits = 0;
  for (let m = 0; m < 20; m++) {
    const g = new TD.Game(900 + m); g.immortalCastle = true; g.map.spots.length = 0;
    const r = g.map.paths[0].route, q = TD.routeAt(r, r.length * 0.5);
    const t = put(g, 'spire', q.x, q.y);
    t.act.dmg = 0.01;   // чтобы цели не умирали и выстрелов было много
    for (let i = 0; i < 12; i++) unit(g, 'wolfrider', 0.3 + i * 0.012);
    for (let i = 0; i < 60 * 12; i++) g.update(TD.DT);
    shots += t.shots; hits += t.hits;
  }
  check('Самонаводящийся заряд: почти без промахов по быстрым наездникам', hits / shots > 0.97, `${hits}/${shots}`);
  // Магия не режется «Толстой шкурой» орка
  const g = new TD.Game(910, { level: 2 });
  const o = unit(g, 'orc', 0.3);
  const h = o.hp; g.damage(o, 18.36, null, 'magic');
  check('по орку магия проходит полностью', Math.abs(h - o.hp - 18.36) < 1e-9);
  TD.setLevel(1);
  // «Пробой чар»: +10% за каждое попадание подряд, до +50%, смена цели сбрасывает
  const g2 = new TD.Game(911); g2.map.spots.length = 0;
  const r = g2.map.paths[0].route, q = TD.routeAt(r, r.length * 0.5);
  const t = put(g2, 'spire', q.x, q.y);
  const e1 = unit(g2, 'troll', 0.5), e2 = unit(g2, 'troll', 0.52);
  const dealt = [];
  const hitWith = e => { const p = g2.fire(t, e); g2.projectiles.length = 0; const h0 = e.hp; for (let i = 0; i < 600 && !p.done; i++) g2.updateProjectile(p, TD.DT); dealt.push(+(h0 - e.hp).toFixed(2)); };
  for (let i = 0; i < 7; i++) hitWith(e1);
  e1.alive = false;   // чтобы заряд во второго не задел первого по пути
  hitWith(e2);
  const base = t.act.dmg;
  const exp = [0, 1, 2, 3, 4, 5, 5, 0].map(k => +(base * (1 + 0.1 * k)).toFixed(2));
  check('Пробой чар: 0, +10, +20 … +50% (потолок), смена цели — сброс', dealt.every((v, i) => Math.abs(v - exp[i]) < 0.02), dealt.join(', '));
}

// ---------- Морозный тотем ----------
{
  const fr = DEF('frost'), a = TD.towerActual(fr);
  check('Тотем: не стреляет, радиус 6 → 3,3 клетки', fr.aura === 'frost' && a.dps === 0 && Math.abs(a.range - 3.3) < 1e-9, `${a.range}`);
  const g = new TD.Game(920); g.map.spots.length = 0;
  const r = g.map.paths[0].route, q = TD.routeAt(r, r.length * 0.5);
  const t = put(g, 'frost', q.x, q.y);
  const inside = unit(g, 'goblin', 0.5), far = unit(g, 'goblin', 0.05);
  g.updateAuras();
  const base = TD.F.enemySpeed(9) * T;
  const v = e => TD.enemySpeedPx(e) / base;
  check('в зоне — замедление 30%, вне зоны — обычная скорость', inside.chill && Math.abs(v(inside) - 0.7) < 1e-9 && !far.chill && v(far) === 1, `${v(inside).toFixed(2)} / ${v(far)}`);
  inside.slowT = 3;
  check('с «Ледяной хваткой» не складывается: действует сильнейшее (−50%)', Math.abs(v(inside) - 0.5) < 1e-9);
  inside.slowT = 0;
  put(g, 'frost', q.x, q.y); g.updateAuras();
  check('два тотема не складываются', Math.abs(v(inside) - 0.7) < 1e-9);
  // Выход из зоны снимает замедление
  inside.dist = inside.route.length * 0.05; TD.placeEnemy(inside); g.updateAuras();
  check('вышел из зоны — замедление пропало', !inside.chill && v(inside) === 1);
  // Тотем не стреляет даже с врагами в зоне
  for (let i = 0; i < 120; i++) g.update(TD.DT);
  check('тотем не стреляет', g.towers.every(x => x.shots === 0) && g.projectiles.length === 0);
}

// ---------- Дозорный колокол ----------
{
  const bl = DEF('bell'), a = TD.towerActual(bl);
  check('Колокол: не стреляет, радиус дозора 8 → 4,0 клетки', bl.aura === 'bell' && a.dps === 0 && Math.abs(a.range - 4.0) < 1e-9);
  // «Зоркий дозор»: вора в радиусе колокола вышки видят, вне радиуса — нет
  const g = new TD.Game(930); g.immortalCastle = true; g.map.spots.length = 0;
  const r = g.map.paths[0].route, q = TD.routeAt(r, r.length * 0.5);
  const fal = put(g, 'falcon', q.x, q.y); fal.act.range = 99; fal.act.dmg = 0.01;
  const spd = TD.enemySpeedPx; TD.enemySpeedPx = () => 0;
  const th = unit(g, 'thief', 0.5);
  for (let i = 0; i < 120; i++) g.update(TD.DT);
  check('без колокола вышка вора не видит', fal.shots === 0);
  const bell = put(g, 'bell', q.x, q.y);
  fal.act.range = 99; fal.act.dmg = 0.01;   // колокол рядом пересчитал характеристики Сокола
  for (let i = 0; i < 120; i++) g.update(TD.DT);
  const s1 = fal.shots;
  check('вор в радиусе колокола — замечен, вышка стреляет', th.revealed && s1 > 0, `${s1} выстр.`);
  // Уводим вора туда, где он дальше радиуса колокола
  for (let f = 0; f <= 1; f += 0.01) {
    th.dist = th.route.length * f; TD.placeEnemy(th);
    const tb = TD.enemyBox(th);
    if (Math.hypot(tb.cx - bell.cx, tb.cy - bell.cy) > bell.act.range * T + 30) break;
  }
  for (let i = 0; i < 120; i++) g.update(TD.DT);
  check('вышел из радиуса — снова невидим, выстрелов нет', !th.revealed && fal.shots - s1 <= 1, `${fal.shots - s1}`);
  TD.enemySpeedPx = spd;

  // «Боевой набат»: соседние клетки (включая диагональ) +2 к точности и скорострельности
  const g2 = new TD.Game(931); g2.map.spots.length = 0;
  let spot = null;
  for (let ty = 1; ty < TD.ROWS - 3 && !spot; ty++) for (let tx = 1; tx < TD.COLS - 3 && !spot; tx++) {
    if ([0, 1, 2].every(dx => [0, 1].every(dy => g2.canBuild(tx + dx, ty + dy))) && g2.canBuild(tx + 3, ty)) spot = { tx, ty };
  }
  const b = g2.addTower(bl, spot.tx, spot.ty, true);
  const diag = g2.addTower(DEF('thunder'), spot.tx + 1, spot.ty + 1, true);
  const near = g2.addTower(DEF('rattle'), spot.tx + 1, spot.ty, true);
  const far = g2.addTower(DEF('falcon'), spot.tx + 3, spot.ty, true);
  const th0 = TD.towerActual(DEF('thunder')), ra0 = TD.towerActual(DEF('rattle'));
  check('Громобой по диагонали: точность 1 → 3, скорострельность 6 → 8',
    diag.buffed && diag.act.acc === 3 && Math.abs(diag.act.rate - TD.F.fireRate(8)) < 1e-9 && diag.act.dev < th0.dev, `${diag.act.acc}, ${diag.act.rate}`);
  check('Трещотка рядом: точность 5 → 7, перезарядка 3,5 → 3,0 с', near.buffed && near.act.acc === 7 && Math.abs(near.act.reload - 3.0) < 1e-9);
  check('вышка через клетку — без бонуса', !far.buffed && far.act.acc === 20);
  const b2 = g2.addTower(bl, spot.tx + 2, spot.ty + 1, true);
  check('второй колокол рядом не складывается', diag.act.acc === 3);
  g2.sellTower(b); g2.sellTower(b2);
  check('колокол продан — бонус пропал', !diag.buffed && diag.act.acc === 1 && Math.abs(near.act.reload - 3.5) < 1e-9);
}

console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
