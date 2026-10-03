// Мана, заклинания и порядок волн. Запуск: node tests/spells-test.js
const TD = require('./load');
let ok = true;
const check = (name, pass, info) => { ok = ok && pass; console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${info ? ': ' + info : ''}`); };
const run = (g, sec) => { for (let i = 0; i < Math.round(sec * 60); i++) g.update(TD.DT); };
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-6);
// Враг стоит на месте в заданной точке маршрута (чтобы проверять только заклинание).
function dummy(g, type, frac, path) {
  const e = TD.createUnit(type, g.rng);
  g.spawnEnemy(e, path || 0); e.dist = e.route.length * frac; TD.placeEnemy(e);
  e.stats.spd = 1; e.frozen = true;
  return e;
}
const origSpeed = TD.enemySpeedPx;
TD.enemySpeedPx = e => e.frozen ? 0 : origSpeed(e);

// --- Мана
{
  const g = new TD.Game(1); g.immortalCastle = true;
  check('мана на старте 50', g.mana === 50);
  run(g, 10);
  check('мана копится 1 в секунду всегда (и до первой волны)', near(g.mana, 60, 0.05), g.mana.toFixed(2));
  const e = dummy(g, 'goblin', 0.3); const m0 = g.mana;
  g.damage(e, 1000, null, false);
  check('за убийство +0,5 маны', near(g.mana - m0, 0.5), (g.mana - m0).toFixed(2));
  run(g, 100);
  check('максимум маны 100', g.mana === 100);
}

// --- Метеор
{
  const g = new TD.Game(2); g.immortalCastle = true; g.mana = 100;
  const a = dummy(g, 'shaman', 0.4); TD.setFrenzy(a, false);           // 115 здоровья, без сопротивления
  const b = TD.enemyBox(a);
  const far = dummy(g, 'shaman', 0.7); TD.setFrenzy(far, false);
  check('метеор стоит 40 маны', g.castSpell('meteor', b.cx, b.cy) && g.mana === 60);
  run(g, 0.9);
  check('до падения (1 с) урона нет', a.hp === 115);
  run(g, 0.15);
  check('удар метеора 120 урона... по шаману со 115 здоровья — насмерть', !a.alive);
  check('враг вне радиуса не задет', far.hp === 115);
  check('перезарядка 25 с', near(g.spellCd.meteor, 25 - 1.05, 0.02) && !g.spellReady('meteor'));
  // Поджог: 5 урона в секунду 4 с
  const g2 = new TD.Game(3); g2.immortalCastle = true; g2.mana = 100;
  const t = dummy(g2, 'troll', 0.4); const tb = TD.enemyBox(t);
  t.dumbT = -1e9; t.nestT = -1e9;
  g2.castSpell('meteor', tb.cx, tb.cy); run(g2, 1.05);
  const afterHit = t.hpMax - t.hp;
  run(g2, 5);
  check('метеор по троллю: 120 + поджог 4 с × 5 = 140', near(afterHit, 120) && near(t.hpMax - t.hp, 140), `${afterHit} + ${(t.hpMax - t.hp - afterHit).toFixed(1)}`);
}

// --- Ярость шамана режет только физический урон
{
  const g = new TD.Game(14); g.immortalCastle = true;
  const sh = dummy(g, 'shaman', 0.4);
  const res = {};
  for (const type of ['phys', 'fire', 'magic']) { const h = sh.hp; g.damage(sh, 10, null, type); res[type] = +(h - sh.hp).toFixed(2); }
  check('в ярости: физ 10 → 5, огонь 10 → 10, магия 10 → 10', res.phys === 5 && res.fire === 10 && res.magic === 10, JSON.stringify(res));
  const tw = TD.TOWERS.find(d => d.id === 'dragon'), h0 = sh.hp;
  g.damage(sh, 4, { def: tw, dmgDealt: 0 }, tw.dmgType);
  check('Драконья пасть (огонь) пробивает ярость полностью', +(h0 - sh.hp).toFixed(2) === 4);
  g.mana = 100; const b = TD.enemyBox(sh), h1 = sh.hp;
  g.castSpell('chain', b.cx, b.cy);
  check('цепная молния (магия) пробивает ярость полностью: 60', +(h1 - sh.hp).toFixed(2) === 60);
}

// --- Ледяная хватка
{
  const g = new TD.Game(4); g.immortalCastle = true; g.mana = 100;
  const gob = dummy(g, 'goblin', 0.4), sh = dummy(g, 'shaman', 0.4);
  gob.frozen = sh.frozen = false; gob.stats.spd = 9; sh.stats.spd = 12;
  const v0 = TD.enemySpeedPx(gob), s0 = TD.enemySpeedPx(sh);
  const b = TD.enemyBox(gob);
  check('ледяная хватка стоит 35 маны', g.castSpell('frost', b.cx, b.cy) && near(g.mana, 65));
  check('скорость −50%', near(TD.enemySpeedPx(gob), v0 * 0.5));
  check('шаман в ярости не замедляется (иммунитет к негативным эффектам)', near(TD.enemySpeedPx(sh), s0) && !(sh.slowT > 0));
  gob.frozen = true; run(g, 5.1); gob.frozen = false;
  check('замедление длится 5 с', near(TD.enemySpeedPx(gob), v0));
}

// --- Цепная молния
{
  const g = new TD.Game(5); g.immortalCastle = true; g.mana = 100;
  const list = [0.40, 0.405, 0.41, 0.415, 0.42, 0.425].map(f => { const e = dummy(g, 'troll', f); e.dumbT = -1e9; e.nestT = -1e9; return e; });
  const b = TD.enemyBox(list[0]);
  check('цепная молния стоит 30 маны', g.castSpell('chain', b.cx, b.cy) && near(g.mana, 70));
  const dmg = list.map(e => +(e.hpMax - e.hp).toFixed(2)).filter(v => v > 0).sort((a, c) => c - a);
  check('бьёт 1 + 4 цели: 60, 48, 38,4, 30,72, 24,58', dmg.length === 5 && near(dmg[0], 60) && near(dmg[1], 48) && near(dmg[2], 38.4) && near(dmg[3], 30.72) && near(dmg[4], 24.58, 0.01), dmg.join(', '));
  check('без цели не срабатывает и ману не тратит', (() => { const g2 = new TD.Game(6); g2.mana = 100; return !g2.castSpell('chain', 10, 10) && g2.mana === 100; })());
}

// --- Каменная кладка
{
  const g = new TD.Game(7); g.mana = 99; g.castleHp = 10;
  check('каменная кладка требует 100 маны', !g.castSpell('masonry'));
  g.mana = 100;
  check('сотворилась', g.castSpell('masonry') && g.mana === 0);
  run(g, 9.9);
  check('первая единица — через 10 с', g.castleHp === 10);
  run(g, 0.2);
  check('+1 прочности', g.castleHp === 11);
  run(g, 45);
  check('всего +5 за 50 с, не больше', g.castleHp === 15);
  g.mana = 100;
  check('один раз за уровень', !g.castSpell('masonry'));
  const g2 = new TD.Game(8); g2.mana = 100; g2.castleHp = 19; g2.castSpell('masonry'); run(g2, 60);
  check('не выше максимума прочности', g2.castleHp === TD.CASTLE_HP);
}

// --- Порядок волн
{
  const g = new TD.Game(9); g.immortalCastle = true;
  const ev = [];
  const em = g.emit.bind(g); g.emit = e => { ev.push({ t: g.time, e }); em(e); };
  g.startWave();
  let lastSpawn = 0;
  while (g.wave === 1 && g.time < 200) { const q = g.spawnQueue.length; g.update(TD.DT); if (q && !g.spawnQueue.length) lastSpawn = g.time; }
  check('волна 2 выходит через 10 с после последнего врага волны 1', near(g.time - lastSpawn, 10, 0.05), (g.time - lastSpawn).toFixed(2));
  check('не дожидаясь, пока перебьют всех', g.enemies.length > 0, `на поле ${g.enemies.length}`);
  while (g.spawnQueue.length) g.update(TD.DT);
  run(g, 3.2);
  const gold0 = g.gold, sec = Math.ceil(g.countdown);
  check('кнопка досрочного запуска доступна во время отсчёта', g.canStartWave());
  g.startWave();
  check('бонус 15 золота за каждую сброшенную секунду', g.gold - gold0 === sec * 15, `${sec} с → +${g.gold - gold0}`);
  check('во время выхода волны досрочно запускать нельзя', !g.canStartWave());
}

// --- Толпа в волне
{
  let withCrowd = 0, total = 0, bossCrowd = false, spacingOk = true, onePath = true, sizeOk = true;
  for (let seed = 1; seed <= 600; seed++) {
    const g = new TD.Game(seed);
    g.wave = seed % TD.WAVES;      // 0..3 → запускаем волны 1..4 (4 — босс)
    g.startWave();
    const w = TD.waveDef(g.wave), q = g.spawnQueue, cr = q.filter(x => x.crowd);
    if (w.boss) { if (cr.length) bossCrowd = true; continue; }
    total++;
    if (!cr.length) continue;
    withCrowd++;
    if (new Set(cr.map(x => x.path)).size !== 1) onePath = false;
    if (cr.length < 5 || cr.length > Math.max(5, Math.round(w.count * 0.35)) + 1) sizeOk = false;
    for (let i = 1; i < cr.length; i++) {
      const tiles = (cr[i].at - cr[i - 1].at) * TD.F.enemySpeed(TD.UNITS[cr[i].type].stats.spd);
      if (tiles < 0.8 - 1e-9 || tiles > 1.1 + 1e-9) spacingOk = false;
    }
  }
  check('толпа примерно в половине обычных волн', Math.abs(withCrowd / total - 0.5) < 0.07, `${(withCrowd / total * 100).toFixed(1)}% из ${total}`);
  check('в волне с боссом толпы нет', !bossCrowd);
  check('толпа идёт по одной тропе, 25–35% волны (не меньше 5)', onePath && sizeOk);
  check('между соседями в толпе 0,8–1,1 клетки — не впритык', spacingOk);
}

// --- Места силы: +30% к фактическому урону, дальности, скорострельности (у очереди — перезарядка)
{
  const g = new TD.Game(10); g.gold = 1e6;
  const res = {};
  for (const kind of ['dmg', 'range', 'rate']) {
    g.map.spots.length = 0;
    // Ставим место силы на свободную клетку и строим на нём каждую вышку
    const free = []; for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) if (g.canBuild(x, y)) free.push({ x, y });
    TD.TOWERS.forEach((def, i) => {
      const c = free[i * 7 + 3];
      g.map.spots.push({ x: c.x, y: c.y, kind });
      const t = g.addTower(def, c.x, c.y, true), base = TD.towerActual(def);
      const okK = kind === 'dmg' ? near(t.act.dmg, base.dmg * 1.3) && near(t.act.range, base.range)
        : kind === 'range' ? near(t.act.range, base.range * 1.3) && near(t.act.dmg, base.dmg)
        : def.burst ? near(t.act.reload, def.burst.reload / 1.3) && near(t.act.cooldown, base.cooldown)
        : near(t.act.rate, base.rate * 1.3);
      res[kind] = (res[kind] !== false) && okK;
    });
  }
  check('место ярости: +30% к фактическому урону', res.dmg);
  check('место дальнозоркости: +30% к дальности', res.range);
  check('место быстроты: +30% к скорострельности, у Трещотки перезарядка 3,5 → 2,69 с', res.rate);
  check('Трещотка: урон 4 → 6,95 (физ), Драконья пасть — огонь', TD.F.damage(TD.TOWERS[0].stats.dmg) === 6.95 && TD.TOWERS[0].dmgType === 'phys' && TD.TOWERS[2].dmgType === 'fire');
}

TD.enemySpeedPx = origSpeed;
console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
