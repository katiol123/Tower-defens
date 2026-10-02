// Проверка юнитов и их перков. Запуск: node tests/units-test.js
const { TD, measure } = require('./accuracy-lib');
let ok = true;
const check = (name, pass, info) => { ok = ok && pass; console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${info ? ': ' + info : ''}`); };
const pct = x => (x * 100).toFixed(1) + '%';

// Фиксированные параметры и перки
const g = TD.createUnit('goblin', TD.makeRng(1)), w = TD.createUnit('wolfrider', TD.makeRng(2));
check('Гоблин: выносливость 2, сила 1, скорость 9, перк «Трусливый»',
  g.stats.sta === 2 && g.stats.str === 1 && g.stats.spd === 9 && g.perks.join() === 'coward', JSON.stringify(g.stats));
check('Лютоволк: выносливость 2, сила 1, скорость 15, два своих перка',
  w.stats.sta === 2 && w.stats.str === 1 && w.stats.spd === 15 && w.perks.join() === 'dismount,blur', JSON.stringify(w.stats));
check('Техника: гоблин 3 − 2 = 1, лютоволк 3 + 2 + 2 = 7', g.stats.tech === 1 && w.stats.tech === 7);
let same = true;
for (let i = 0; i < 200; i++) { const u = TD.createUnit(i % 2 ? 'goblin' : 'wolfrider', TD.makeRng(i)); if (u.perks.join() !== TD.UNITS[u.type].perks.join()) same = false; }
check('перки не случайны — всегда одни и те же у типа', same);

// «Последний рывок волка»: 30% шанс, наездник с 50% здоровья на том же месте
const game = new TD.Game(77);
let dismounts = 0, ridersOk = true;
const N = 4000;
for (let i = 0; i < N; i++) {
  const e = TD.createUnit('wolfrider', game.rng);
  game.spawnEnemy(e, 0);
  e.dist = 200; TD.placeEnemy(e);
  game.pending.length = 0;
  game.damage(e, 1000, null, false);
  if (game.pending.length) {
    dismounts++;
    const r = game.pending[0];
    if (r.type !== 'goblin' || Math.abs(r.hp - r.hpMax / 2) > 1e-9 || r.dist !== e.dist || r.route !== e.route) ridersOk = false;
  }
  game.enemies.length = 0;
}
check('шанс спешивания ≈ 30%', Math.abs(dismounts / N - 0.3) < 0.03, `${pct(dismounts / N)} из ${N}`);
check('наездник — гоблин с 50% здоровья на месте волка', ridersOk);

// «Серая молния»: точность вышек −3 (не ниже 1)
const tw = acc => ({ def: { stats: { acc } } });
check('точность 20 → 17, 3 → 1, 1 → 1',
  TD.effectiveAcc(tw(20), w) === 17 && TD.effectiveAcc(tw(3), w) === 1 && TD.effectiveAcc(tw(1), w) === 1 && TD.effectiveAcc(tw(20), g) === 20);

// Шаман: параметры и «Грибное безумие»
{
  const sh = TD.createUnit('shaman', TD.makeRng(3));
  check('Шаман: выносливость 5, сила 1, скорость 7, техника 3 + 2 + 5 = 10 («Грибное безумие» — большой перк)',
    sh.base.sta === 5 && sh.base.str === 1 && sh.base.spd === 7 && sh.stats.tech === 10 && sh.perks.join() === 'spores,frenzy');
  check('в ярости: здоровье 115 + 250, скорость 7 + 5, сила 1 + 5',
    sh.frenzy && sh.hpMax === 365 && sh.hp === 365 && sh.stats.spd === 12 && sh.stats.str === 6);
  const gm = new TD.Game(11);
  gm.spawnEnemy(sh, 0); sh.dist = 150; TD.placeEnemy(sh);
  const step = sec => { for (let i = 0; i < Math.round(sec * 60); i++) gm.update(TD.DT); };
  const hp0 = sh.hp;
  step(8); gm.damage(sh, 10, null, false);
  check('в ярости 50% сопротивления урону: 10 → 5', hp0 - sh.hp === 5, `${hp0 - sh.hp}`);
  step(8);
  check('урон сбрасывает таймер: через 16 с (урон на 8-й) ярость ещё есть', sh.frenzy);
  step(2.2);
  check('после 10 с без урона ярость спадает: 115 здоровья, скорость 7, сила 1',
    !sh.frenzy && sh.hpMax === 115 && sh.hp <= 115 && sh.stats.spd === 7 && sh.stats.str === 1);
  const coward = TD.createUnit('goblin', TD.makeRng(4)); coward.hp = 10;
  coward.frenzy = true;
  const fast = TD.enemySpeedPx(coward); coward.frenzy = false;
  check('иммунитет к негативным эффектам: «Трусливый» не замедляет в ярости', fast > TD.enemySpeedPx(coward));
}

// Шаман: «Целебные споры»
{
  const gm = new TD.Game(12);
  const sh = TD.createUnit('shaman', TD.makeRng(5));
  const near = TD.createUnit('goblin', TD.makeRng(6)), far = TD.createUnit('goblin', TD.makeRng(7)), full = TD.createUnit('goblin', TD.makeRng(8));
  for (const [u, d] of [[sh, 300], [near, 300 + TD.TILE], [far, 300 + 3 * TD.TILE], [full, 300 - 20]]) { gm.spawnEnemy(u, 0); u.dist = d; }
  // Замораживаем движение, чтобы проверить только лечение
  const spd = TD.enemySpeedPx; TD.enemySpeedPx = () => 0;
  [sh, near, far, full].forEach(TD.placeEnemy);
  near.hp = 20; far.hp = 20; full.hp = full.hpMax; sh.hp = 300;
  for (let i = 0; i < Math.round(1.9 * 60); i++) gm.update(TD.DT);
  const before = near.hp;
  for (let i = 0; i < Math.round(0.2 * 60); i++) gm.update(TD.DT);
  TD.enemySpeedPx = spd;
  check('лечение раз в 2 с: до срабатывания не лечит', before === 20);
  check('союзник в радиусе 1,5 клетки получает +30', near.hp === 50, `здоровье ${near.hp}`);
  check('союзник дальше радиуса не лечится', far.hp === 20, `здоровье ${far.hp}`);
  check('шаман лечит и себя, не выше максимума', sh.hp === 330 && full.hp === full.hpMax);
}

// Босс: Тролль-мусорщик
{
  const tr = TD.createUnit('troll', TD.makeRng(21));
  check('Тролль: здоровье 5000 + 1000 × 15 = 20000, сила 10, скорость 1, спрайт ×2',
    tr.hpMax === 20000 && tr.stats.str === 10 && tr.stats.spd === 1 && tr.size === 2 && tr.boss);
  check('Тролль: техника 3 − 2 − 2 + 5 = 4', tr.stats.tech === 4);

  // «Тупоголовый»: проверка раз в 5 с вне ступора, шанс 25%, ступор 4 с
  const gm = new TD.Game(31); gm.immortalCastle = true;
  gm.spawnEnemy(tr, 0);
  let checks = 0, stupors = 0, stopped = true, paused = true;
  const rngOrig = gm.rng;
  gm.rng = Object.assign(() => { const v = rngOrig(); return v; }, rngOrig);
  const em = gm.emit.bind(gm);
  gm.emit = ev => { if (ev.type === 'stupor') stupors++; em(ev); };
  let lastDumb = 0;
  for (let i = 0; i < 60 * 2000 && tr.alive; i++) {
    const d0 = tr.dist, inStupor = tr.stupor > 0, dumb0 = tr.dumbT;
    tr.nestT = -1e9;           // гнездо здесь не проверяем
    tr.dist = Math.min(tr.dist, tr.route.length * 0.5);
    gm.update(TD.DT);
    if (inStupor && tr.stupor > 0) { if (tr.dist !== d0) stopped = false; if (tr.dumbT !== dumb0) paused = false; }
    if (!inStupor && tr.dumbT < lastDumb) checks++;
    lastDumb = tr.dumbT;
  }
  check('ступор срабатывает примерно в 25% проверок', Math.abs(stupors / checks - 0.25) < 0.03, `${pct(stupors / checks)} из ${checks}`);
  check('в ступоре тролль стоит, а отсчёт до следующей проверки не идёт', stopped && paused);

  // «Гоблинское гнездо»: каждые 10 с 5 гоблинов, часть впереди, часть позади
  const g2 = new TD.Game(32); g2.immortalCastle = true;
  const t2 = TD.createUnit('troll', TD.makeRng(22));
  g2.spawnEnemy(t2, 0); t2.dist = t2.route.length * 0.4; TD.placeEnemy(t2);
  t2.dumbT = -1e9; t2.perks = t2.perks.filter(p => p !== 'dumb');
  const drops = [];
  const em2 = g2.emit.bind(g2);
  g2.emit = ev => { if (ev.type === 'nest') drops.push({ t: g2.time, d: ev.e.dist }); em2(ev); };
  let ahead = 0, behind = 0;
  for (let i = 0; i < Math.round(10.05 * 60); i++) g2.update(TD.DT);
  const kids = g2.enemies.filter(e => e.type === 'goblin');
  kids.forEach(k => { if (k.dist > t2.dist) ahead++; else behind++; });
  check('через 10 с спрыгивают 5 гоблинов', drops.length === 1 && kids.length === 5, `${kids.length}`);
  check('гоблины спрыгивают и спереди, и сзади', ahead >= 2 && behind >= 2, `спереди ${ahead}, сзади ${behind}`);
  for (let i = 0; i < Math.round(20 * 60); i++) g2.update(TD.DT);
  check('следующие партии — каждые 10 с', drops.length === 3 && Math.abs(drops[1].t - drops[0].t - 10) < 0.05 && Math.abs(drops[2].t - drops[1].t - 10) < 0.05);

  // Пинок: каждый гоблин проверяется не больше одного раза, шанс 25%, в ступоре не пинает
  let kicked = 0, tested = 0, double = false, kickedInStupor = false;
  for (let trial = 0; trial < 1500; trial++) {
    const g3 = new TD.Game(1000 + trial);
    const t3 = TD.createUnit('troll', g3.rng); t3.nestT = -1e9; t3.dumbT = -1e9;
    g3.spawnEnemy(t3, 0); t3.dist = t3.route.length * 0.3; TD.placeEnemy(t3);
    const stun = trial % 10 === 0;
    if (stun) t3.stupor = 1e9;
    const gob = TD.createUnit('goblin', g3.rng); g3.spawnEnemy(gob, 0);
    gob.dist = t3.dist - 120; TD.placeEnemy(gob);
    let checksSeen = 0;
    for (let i = 0; i < 60 * 8 && gob.alive && gob.dist < t3.dist + 150; i++) {
      const before = gob.kickChecked;
      g3.update(TD.DT);
      if (!before && gob.kickChecked) checksSeen++;
    }
    if (checksSeen > 1) double = true;
    if (stun) { if (gob.kicked) kickedInStupor = true; continue; }
    if (checksSeen) { tested++; if (gob.kicked) kicked++; }
  }
  check('пинок с шансом ≈ 25%', Math.abs(kicked / tested - 0.25) < 0.04, `${pct(kicked / tested)} из ${tested}`);
  check('не больше одной проверки на гоблина', !double);
  check('в ступоре тролль не пинает', !kickedInStupor);
}

const MAPS = +(process.argv[2] || 100);
console.log('\nПромахи по лютоволку (скорость 15), без перка и с «Серой молнией»:');
for (const def of TD.TOWERS) {
  const o = { acc: def.stats.acc, projR: def.proj.r, projSpeed: def.proj.speed, rangeParam: Math.max(3, def.stats.range), maps: MAPS, seed0: 41000, unit: 'wolfrider', spd: 15 };
  const a = measure(Object.assign({ perks: [] }, o)), b = measure(Object.assign({ perks: ['blur'] }, o));
  console.log(`  ${def.name.padEnd(15)} точность ${String(def.stats.acc).padStart(2)} → ${String(Math.max(1, def.stats.acc - 3)).padStart(2)}: промах ${pct(a.miss).padStart(6)} → ${pct(b.miss).padStart(6)}`);
  if (def.stats.acc > 1) check(`  ${def.name}: с перком промахов больше`, b.miss > a.miss);
}
console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
