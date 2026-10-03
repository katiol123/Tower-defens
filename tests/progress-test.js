// Звёзды и открытие уровней на карте похода. Запуск: node tests/progress-test.js
const TD = require('./load');
let ok = true;
const check = (name, pass, info) => { ok = ok && pass; console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}${info ? ': ' + info : ''}`); };
const P = TD.Progress;
P.reset();

check('звёзды: замок цел (20) — 3, 11–19 — 2, 1–10 — 1',
  TD.starsFor(20) === 3 && TD.starsFor(19) === 2 && TD.starsFor(11) === 2 && TD.starsFor(10) === 1 && TD.starsFor(1) === 1);
check('в начале открыт только уровень 1, флажок на нём', P.isOpen(1) && !P.isOpen(2) && P.frontier() === 1 && P.total() === 0);
let r = P.award(1, 12);
check('победа на уровне 1 с прочностью 12 — 2 звезды, открывается уровень 2', r.stars === 2 && r.gained === 2 && P.isOpen(2) && P.frontier() === 2);
r = P.award(1, 5);
check('худший результат не уменьшает звёзды', r.stars === 1 && r.gained === 0 && P.levelStars(1) === 2);
r = P.award(1, 20);
check('лучший результат добавляет только разницу', r.stars === 3 && r.gained === 1 && P.total() === 3);
check('максимум звёзд — 3 за каждый уровень', P.maxTotal() === Object.keys(TD.LEVELS).length * 3);
P.reset();

console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
