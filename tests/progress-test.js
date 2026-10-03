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

// Сокровищница
const T = id => TD.TOWERS.find(d => d.id === id);
check('в начале закрыты Чародейский шпиль, Морозный тотем и Дозорный колокол', ['spire', 'frost', 'bell'].every(id => T(id).locked) && ['rattle', 'thunder', 'dragon', 'falcon'].every(id => !T(id).locked));
check('у каждой из 7 вышек и 3 заклинаний (кроме ремонта) по 3 улучшения', TD.TOWERS.every(d => TD.UPGRADES[d.id].length === 3) && ['meteor', 'frost_spell', 'chain'].every(id => TD.UPGRADES[id].length === 3) && !TD.UPGRADES.masonry);
P.stars = { 1: 3, 2: 3 };
check('без звёзд открыть нельзя: 6 звёзд → открыть шпиль (4), осталось 2', P.unlock('spire') && P.free() === 2 && !T('spire').locked);
check('закрытую вышку улучшать нельзя', !P.upgrade('frost') && P.rank('frost') === 0);
check('улучшение I стоит 1 звезду, II — 2', P.upgrade('rattle') && P.free() === 1 && !P.upgrade('rattle') && P.rank('rattle') === 1);
check('улучшение меняет характеристики: перезарядка Трещотки 3,5 → 3,0 с, описание обновлено',
  T('rattle').burst.reload === 3 && T('rattle').perk.desc.includes('3 с') && TD.towerActual(T('rattle')).reload === 3);
P.stars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 };
['rattle', 'rattle', 'meteor', 'meteor', 'meteor', 'chain'].forEach(id => P.upgrade(id));
check('три ступени — максимум', P.rank('rattle') === 3 && !P.upgrade('rattle') && T('rattle').burst.shots === 14 && T('rattle').stats.acc === 8);
check('метеор III: урон 150, радиус 1,8, перезарядка 20 с; молния I: урон 75', TD.SPELL.meteor.dmg === 150 && TD.SPELL.meteor.radius === 1.8 && TD.SPELL.meteor.cd === 20 && TD.SPELL.chain.dmg === 75 && TD.SPELL.meteor.desc.includes('150'));
check('потрачено: 4 + (1+2+3) + (1+2+3) + 1 = 17', P.spent() === 17, String(P.spent()));
P.refund();
check('«Вернуть звёзды»: всё по-старому, звёзды за уровни остались', P.spent() === 0 && P.total() === 24 && T('spire').locked && T('rattle').burst.reload === 3.5 && TD.SPELL.meteor.dmg === 120);
// Улучшенный колокол и тотем
P.unlock('bell'); P.unlock('frost');
['bell', 'bell', 'bell', 'frost', 'frost', 'frost'].forEach(id => P.upgrade(id));
check('колокол III: дозор 10, набат +3/+3 в радиусе 2; тотем III: −40%, радиус 7', T('bell').stats.range === 10 && T('bell').buff.acc === 3 && T('bell').buffRadius === 2 && T('frost').slow === 0.4 && T('frost').stats.range === 7);
const g = new TD.Game(931); g.map.spots.length = 0;
let spot = null;
for (let ty = 2; ty < TD.ROWS - 3 && !spot; ty++) for (let tx = 2; tx < TD.COLS - 3 && !spot; tx++) if (g.canBuild(tx, ty) && g.canBuild(tx + 2, ty)) spot = { tx, ty };
g.addTower(T('bell'), spot.tx, spot.ty, true);
const far = g.addTower(T('thunder'), spot.tx + 2, spot.ty, true);
check('набат III достаёт вышку через клетку: Громобой точность 1 → 4', far.act.acc === 4, String(far.act.acc));
P.reset();
check('сброс прогресса возвращает базу', TD.TOWERS.every(d => !d.rank) && T('bell').locked);

console.log(ok ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '\nЕСТЬ ОШИБКИ');
process.exit(ok ? 0 : 1);
