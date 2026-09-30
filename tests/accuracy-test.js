// Тест системы прицеливания. Запуск: node tests/accuracy-test.js
// Одиночный гоблин со средней скоростью (10), без перков, обычного размера, бессмертный.
// Вышка ставится на случайную клетку у маршрута на случайной карте и стреляет каждые 0,35 с.
// Промах — снаряд не коснулся маски спрайта цели.
const { TD, measure } = require('./accuracy-lib');

const MAPS = +(process.argv[2] || 200);
const pct = x => (x * 100).toFixed(1).padStart(5) + '%';
let ok = true;

console.log(`Формула: dev(A) = ${TD.ACC.DEV1} · (${TD.ACC.DEV20}/${TD.ACC.DEV1})^((A−1)/19) px; спрайт гоблина ${TD.GOBLIN_H}px в высоту\n`);
console.log('Точность | макс. откл. | выстрелов | промахов');
const rows = {};
for (const a of [1, 2, 3, 5, 8, 10, 12, 14, 16, 18, 19, 20]) {
  const r = measure({ acc: a, maps: MAPS, seed0: 90000 });
  rows[a] = r;
  console.log(String(a).padStart(8), '|', TD.F.maxDeviation(a).toFixed(1).padStart(8), 'px |', String(r.shots).padStart(9), '|', pct(r.miss));
}
const check = (name, v, lo, hi) => {
  const pass = v >= lo && v <= hi;
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: ${pct(v)} (ожидается ${pct(lo)}…${pct(hi)})`);
};
console.log();
check('промах при точности 20', rows[20].miss, 0.035, 0.065);
check('промах при точности 1', rows[1].miss, 0.45, 0.55);
let mono = true;
const keys = Object.keys(rows).map(Number);
for (let i = 1; i < keys.length; i++) if (rows[keys[i]].miss > rows[keys[i - 1]].miss + 0.01) mono = false;
console.log(`${mono ? 'OK  ' : 'FAIL'} промахи убывают с ростом точности`);
ok = ok && mono;

console.log('\nРеальные вышки (их снаряды, скорость и дальность), одиночные выстрелы:');
for (const def of TD.TOWERS) {
  const r = measure({ acc: def.stats.acc, projR: def.proj.r, projSpeed: def.proj.speed, rangeParam: Math.max(3, def.stats.range), maps: Math.round(MAPS / 2), seed0: 70000 });
  console.log(`  ${def.name.padEnd(15)} точность ${String(def.stats.acc).padStart(2)}: промах ${pct(r.miss)} (${r.shots} выстр.)`);
}

console.log('\nСкорость врагов: 1 →', TD.F.enemySpeed(1).toFixed(3), 'кл/с, 20 →', TD.F.enemySpeed(20).toFixed(3), 'кл/с, отношение', (TD.F.enemySpeed(20) / TD.F.enemySpeed(1)).toFixed(4));
const ratioOk = Math.abs(TD.F.enemySpeed(20) / TD.F.enemySpeed(1) - 2.5) < 1e-9;
console.log(`${ratioOk ? 'OK  ' : 'FAIL'} отношение скоростей 20/1 = 2,5`);
ok = ok && ratioOk;

console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
