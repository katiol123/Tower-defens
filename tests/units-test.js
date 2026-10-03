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
  check('в ярости 50% сопротивления физ. урону: 10 → 5', hp0 - sh.hp === 5, `${hp0 - sh.hp}`);
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
  // Босс выходит на самую длинную дорожку
  let longestOk = true;
  for (let seed = 1; seed <= 60; seed++) {
    const gm = new TD.Game(seed); gm.wave = TD.WAVES - 1; gm.startWave();
    const q = gm.spawnQueue.find(x => TD.UNITS[x.type].boss);
    const maxLen = Math.max(...gm.map.paths.map(p => p.route.length));
    if (gm.map.paths[q.path].route.length !== maxLen) longestOk = false;
  }
  check('босс всегда идёт по самой длинной дорожке (60 карт)', longestOk);

  const tr = TD.createUnit('troll', TD.makeRng(21));
  check('Тролль: здоровье (5000 + 1000 × 15) / 2 = 10000, сила 10, скорость 1, спрайт ×2',
    tr.hpMax === 10000 && tr.stats.str === 10 && tr.stats.spd === 1 && tr.size === 2 && tr.boss);
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

// Безумный гоблин и уровень 2
{
  const m = TD.createUnit('madgoblin', TD.makeRng(31));
  check('Безумный гоблин: выносливость 7 (145 здоровья), сила 4, скорость 9, техника 7',
    m.stats.sta === 7 && m.hpMax === 145 && m.stats.str === 4 && m.stats.spd === 9 && m.stats.tech === 7 && m.perks.join() === 'warcry,axeblock');
  const g = new TD.Game(41); g.immortalCastle = true;
  let blocked = 0, firePass = true, magicPass = true;
  for (let i = 0; i < 6000; i++) { m.hp = m.hpMax; g.damage(m, 2, null, 'phys'); if (m.hp === m.hpMax) blocked++; }
  for (let i = 0; i < 300; i++) { m.hp = m.hpMax; g.damage(m, 2, null, 'fire'); if (m.hp === m.hpMax) firePass = false; m.hp = m.hpMax; g.damage(m, 2, null, 'magic'); if (m.hp === m.hpMax) magicPass = false; }
  check('топор отбивает физический урон с шансом ≈35%', Math.abs(blocked / 6000 - 0.35) < 0.02, `${(blocked / 60).toFixed(1)}%`);
  check('огонь и магию топор не отбивает', firePass && magicPass);
  // Отвага: трусливый гоблин рядом с безумным не замедляется, далеко — замедляется
  const g2 = new TD.Game(42); g2.immortalCastle = true;
  const mad = TD.createUnit('madgoblin', g2.rng), near = TD.createUnit('goblin', g2.rng), far = TD.createUnit('goblin', g2.rng);
  [[mad, 0.40], [near, 0.40], [far, 0.10]].forEach(([u, f]) => { g2.spawnEnemy(u, 0); u.dist = u.route.length * f; TD.placeEnemy(u); });
  near.hp = far.hp = 10;
  const R = TD.WARCRY.radius * TD.TILE;
  const dNear = Math.hypot(near.x - mad.x, near.y - mad.y), dFar = Math.hypot(far.x - mad.x, far.y - mad.y);
  const v0 = TD.F.enemySpeed(9) * TD.TILE;
  g2.update(TD.DT);
  check('рядом с безумным (в 4 клетках) «Трусливый» не действует', dNear <= R && Math.abs(TD.enemySpeedPx(near) - v0) < 1e-6);
  check('вдали от безумного гоблин трусит (−30%)', dFar > R ? Math.abs(TD.enemySpeedPx(far) - v0 * 0.7) < 1e-6 : true, `расстояние ${(dFar / TD.TILE).toFixed(1)} кл`);
  mad.hp = 10;
  check('сам безумный не трусит', Math.abs(TD.enemySpeedPx(mad) - v0) < 1e-6);

  // Состав волн уровня 2
  TD.setLevel(2);
  const w1 = TD.waveDef(1), w2 = TD.waveDef(2);
  const idx = (w, c) => w.list.map((x, i) => x.code === c ? i : -1).filter(i => i >= 0);
  const m1 = idx(w1, 'M'), m2 = idx(w2, 'M'), s2 = idx(w2, 'S');
  check('уровень 2, волна 1: гоблины + 2 безумных — до середины и после середины',
    w1.list.every(x => x.code === 'G' || x.code === 'M') && m1.length === 2 && m1[0] < w1.count / 2 && m1[1] > w1.count / 2, `позиции ${m1.join(', ')} из ${w1.count}`);
  check('волна 2 на 40% длиннее первой', w2.count === Math.round(w1.count * 1.4), `${w1.count} → ${w2.count}`);
  check('волна 2: 3 безумных и 2 шамана', m2.length === 3 && s2.length === 2);
  check('первый шаман выходит вместе с первым безумным', s2[0] === m2[0] + 1 && w2.list[s2[0]].together);
  const distTo = i => Math.min(...m2.map(j => Math.abs(i - j)));
  check('второй шаман — дальше всего от безумных', distTo(s2[1]) >= 6, `до ближайшего безумного ${distTo(s2[1])} врагов`);
  const gq = new TD.Game(43, { level: 2 }); gq.wave = 1; gq.startWave();
  const q = gq.spawnQueue, si = q.findIndex(x => x.type === 'shaman');
  check('в расписании первый шаман появляется в тот же момент, что и безумный', q[si - 1].type === 'madgoblin' && q[si - 1].at === q[si].at);
  check('у уровня 2 босс только в последней волне, замок 20 и 500 золота',
    TD.WAVE_LIST.findIndex(w => w.boss) === TD.WAVES - 1 && gq.castleHp === 20 && TD.START_GOLD === 500);
  TD.setLevel(1);
}

// Гоблин-вор и третья волна уровня 2
{
  const th = TD.createUnit('thief', TD.makeRng(51));
  check('Гоблин-вор: выносливость 2, сила 1, скорость 9, техника 3 + 5 + 2 = 10',
    th.stats.sta === 2 && th.stats.str === 1 && th.stats.spd === 9 && th.stats.tech === 10 && th.perks.join() === 'stealth,robber');
  // Вышки его не видят: вор один в зоне Сокола — выстрелов нет
  const g = new TD.Game(52); g.immortalCastle = true;
  const r = g.map.paths[0].route;
  const t = TD.createUnit('thief', g.rng); g.spawnEnemy(t, 0); t.dist = r.length * 0.4; TD.placeEnemy(t);
  const tw = g.addTower(TD.TOWERS[3], 0, 0, true) || (() => { for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) if (g.canBuild(x, y)) return g.addTower(TD.TOWERS[3], x, y, true); })();
  tw.act.range = 99;
  const spd = TD.enemySpeedPx; TD.enemySpeedPx = () => 0;
  for (let i = 0; i < 300; i++) g.update(TD.DT);
  check('вышки не стреляют по вору, даже если он один в зоне', tw.shots === 0);
  // Но снаряд, летящий в другого, его задевает: вор стоит точно на линии выстрела между вышкой и гоблином
  const gob = TD.createUnit('goblin', g.rng); g.spawnEnemy(gob, 0); gob.dist = r.length * 0.6; TD.placeEnemy(gob);
  tw.act.dev = 0;
  const p = g.fire(tw, gob);
  const gb = TD.enemyBox(gob);
  const mx = (p.x + gb.cx) / 2, my = (p.y + gb.cy) / 2;
  const tb = TD.enemyBox(t);
  t.x += mx - tb.cx; t.y += my - tb.cy;            // центр спрайта вора — на середине линии огня
  const h0t = t.hp, h0g = gob.hp;
  for (let i = 0; i < 120 && !p.done; i++) g.updateProjectile(p, TD.DT);
  TD.enemySpeedPx = spd;
  check('снаряд, летевший в другого, попадает в вора на линии огня', t.hp < h0t && gob.hp === h0g && !p.hitTarget);
  // Взрыв Громобоя и заклинания задевают вора
  const g2 = new TD.Game(53); g2.immortalCastle = true; g2.mana = 100;
  const t2 = TD.createUnit('thief', g2.rng); g2.spawnEnemy(t2, 0); t2.dist = t2.route.length * 0.4; TD.placeEnemy(t2);
  const b2 = TD.enemyBox(t2), h0 = t2.hp;
  g2.castSpell('chain', b2.cx, b2.cy);
  check('заклинания по вору работают (молния)', t2.hp < h0);
  // Кража золота
  const g3 = new TD.Game(54); g3.gold = 777;
  const t3 = TD.createUnit('thief', g3.rng); g3.spawnEnemy(t3, 0); t3.dist = t3.route.length - 1;
  g3.update(TD.DT);
  check('добравшись до замка, вор уносит всё золото и бьёт замок на 1', g3.gold === 0 && g3.castleHp === TD.CASTLE_HP - 1 && g3.stats.stolen === 777);

  TD.setLevel(2);
  const w2 = TD.waveDef(2), w3 = TD.waveDef(3);
  const cnt = c => w3.list.filter(x => x.code === c).length;
  check('уровень 2, волна 3: без воров столько же врагов, сколько во второй (42)', w3.count - cnt('T') === w2.count, `${w3.count - cnt('T')}`);
  check('5 воров, 2 безумных, 2 шамана', cnt('T') === 5 && cnt('M') === 2 && cnt('S') === 2);
  const rank = cnt('W') + cnt('G');
  check('около 60% рядовых — наездники', Math.abs(cnt('W') / rank - 0.6) < 0.02, `${cnt('W')} из ${rank}`);
  const tpos = w3.list.map((x, i) => x.code === 'T' ? i : -1).filter(i => i >= 0);
  const gaps = tpos.slice(1).map((p, i) => p - tpos[i]);
  check('воры распределены равномерно по волне', Math.max(...gaps) - Math.min(...gaps) <= 1 && tpos[0] <= 6 && w3.count - 1 - tpos[4] <= 6, tpos.join(', '));
  TD.setLevel(1);
}

// Босс второго уровня: Орк
{
  const o = TD.createUnit('orc', TD.makeRng(61));
  check('Орк: здоровье (5000 + 1000 × 8) / 2 = 6500, сила 20, скорость 5, спрайт ×2, как у тролля',
    o.hpMax === 6500 && o.stats.str === 20 && o.stats.spd === 5 && o.size === TD.GIANT.size && o.boss && o.kind === 'Босс второго уровня',
    `hp ${o.hpMax}, size ${o.size}`);
  check('Орк: перки «Великан» и «Толстая шкура», техника 3 − 2 + 2 = 3', o.perks.join() === 'giant,ironhide' && o.stats.tech === 3);
  // «Толстая шкура»: −5 от каждого физического попадания, огонь и магия — полностью
  const g = new TD.Game(62, { level: 2 });
  const e = TD.createUnit('orc', g.rng); g.spawnEnemy(e, 0);
  let h = e.hp; g.damage(e, 42.8, null, 'phys');
  check('физическое попадание 42,8 → 37,8', Math.abs(h - e.hp - 37.8) < 1e-9, `${(h - e.hp).toFixed(2)}`);
  h = e.hp; g.damage(e, 3, null, 'phys');
  check('слабое физическое попадание (3) поглощается целиком', e.hp === h && e.absorbed === 8);
  h = e.hp; g.damage(e, 10, null, 'fire'); g.damage(e, 10, null, 'magic');
  check('огонь и магия проходят без вычета', Math.abs(h - e.hp - 20) < 1e-9);
  // Последняя волна уровня 2: первым — орк, за ним группами гоблины и наездники
  const w = TD.waveDef(TD.WAVES);
  check('последняя волна уровня 2 — босс: первым выходит Орк, дальше только гоблины и наездники',
    w.boss && w.list[0].type === 'orc' && w.list.slice(1).every(x => x.code === 'G' || x.code === 'W'), `${w.count} врагов`);
  g.wave = TD.WAVES - 1; g.startWave();
  const q = g.spawnQueue;
  const groups = []; let cur = null;
  for (let i = 1; i < q.length; i++) {
    if (!cur || q[i].at - q[i - 1].at > 2) groups.push(cur = []);
    cur.push(q[i]);
  }
  check('свита выходит после орка группами с паузами', q[0].type === 'orc' && q[1].at - q[0].at > 3 && groups.length === 6,
    `групп ${groups.length}: ${groups.map(x => x.length).join(', ')}`);
  check('каждая группа идёт по одной тропе, первая — вслед за орком',
    groups.every(gr => gr.every(x => x.path === gr[0].path)) && groups[0][0].path === q[0].path);
  TD.setLevel(1);
}

// Боссы-великаны стоят на дороге так же, как обычные враги: ноги на 14 px ниже точки маршрута
{
  for (const type of ['troll', 'orc', 'goblin']) {
    const e = TD.createUnit(type, TD.makeRng(70)), b = TD.enemyBox(e), sp = TD.SPRITES[e.sprite];
    const feet = b.cy - b.H / 2 + sp.foot * b.H - e.y;
    check(`${TD.UNITS[type].name}: ноги на линии дороги (+14 px)`, Math.abs(feet - 14) < 1e-6, feet.toFixed(2));
  }
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
