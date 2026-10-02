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
