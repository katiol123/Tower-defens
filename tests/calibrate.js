// Подбор отклонения (px), дающего заданный процент промахов. Запуск: node tests/calibrate.js
const { measure } = require('./accuracy-lib');
function solve(target) {
  let lo = 0, hi = 120;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const r = measure({ dev: mid, maps: 40 });
    if (r.miss < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
for (const dev of [0, 5, 10, 15, 20, 30, 40, 50]) {
  const r = measure({ dev, maps: 30 });
  console.log('dev', dev, 'shots', r.shots, 'miss', (r.miss * 100).toFixed(1) + '%');
}
console.log('dev for 5%:', solve(0.05).toFixed(2));
console.log('dev for 50%:', solve(0.50).toFixed(2));
