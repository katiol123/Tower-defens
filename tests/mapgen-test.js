// Проверка генератора: 1–3 дорожки по 1/3, слияние ~50%, все маршруты ведут к замку.
// Запуск: node tests/mapgen-test.js
const TD = require('./load');
const N = +(process.argv[2] || 600);
const cnt = { 1: 0, 2: 0, 3: 0 };
let mergeable = 0, merged = 0, crossings = 0, bad = 0, lens = [];
const t0 = Date.now();
for (let s = 1; s <= N; s++) {
  const m = TD.generateMap(s * 7919);
  cnt[m.paths.length]++;
  m.paths.forEach((p, i) => {
    if (i > 0) { mergeable++; if (p.mergeInto >= 0) merged++; }
    const end = p.route.pts[p.route.pts.length - 1];
    if (end.x !== m.gatePoint.x || end.y !== m.gatePoint.y) bad++;
    lens.push(p.route.length / TD.TILE);
  });
  const seen = new Map();
  m.paths.forEach(p => p.own.forEach(t => { const k = t.x + ',' + t.y; seen.set(k, (seen.get(k) || 0) + 1); }));
  for (const v of seen.values()) if (v > 1) crossings++;
}
const pct = x => (x * 100).toFixed(1) + '%';
console.log(`Карт: ${N} (${((Date.now() - t0) / N).toFixed(1)} мс на карту)`);
console.log(`1 дорожка: ${pct(cnt[1] / N)}, 2: ${pct(cnt[2] / N)}, 3: ${pct(cnt[3] / N)}`);
console.log(`Слияний среди дорожек, которые могут слиться: ${pct(merged / mergeable)} (${merged}/${mergeable})`);
console.log(`Клеток-перекрёстков в среднем на карту: ${(crossings / N).toFixed(1)}`);
lens.sort((a, b) => a - b);
console.log(`Длина маршрута, клеток: мин ${lens[0].toFixed(0)}, медиана ${lens[lens.length >> 1].toFixed(0)}, макс ${lens[lens.length - 1].toFixed(0)}`);
let ok = bad === 0;
for (const k of [1, 2, 3]) if (Math.abs(cnt[k] / N - 1 / 3) > 0.06) ok = false;
if (Math.abs(merged / mergeable - 0.5) > 0.07) ok = false;
console.log(bad ? `FAIL: ${bad} маршрутов не ведут к замку` : 'OK   все маршруты заканчиваются у ворот замка');
console.log(ok ? 'OK   распределения в норме' : 'FAIL распределения вне допуска');
process.exit(ok ? 0 : 1);
