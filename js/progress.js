// Прогресс похода: звёзды за уровни и открытые локации. Хранится в localStorage
// (в Node и при недоступном хранилище — только в памяти).
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const KEY = 'td-progress-v1';
  const P = TD.Progress = { stars: {} };

  // Звёзды за победу: замок цел — 3, прочность выше 10 — 2, иначе 1.
  TD.starsFor = function (castleHp) {
    if (castleHp >= TD.CASTLE_HP) return 3;
    if (castleHp > 10) return 2;
    return 1;
  };

  P.load = function () {
    try {
      const raw = globalThis.localStorage && localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.stars) P.stars = d.stars; }
    } catch (e) { /* хранилище недоступно — играем без сохранения */ }
    return P;
  };
  P.save = function () {
    try { if (globalThis.localStorage) localStorage.setItem(KEY, JSON.stringify({ stars: P.stars })); } catch (e) { /* нет хранилища */ }
  };
  P.reset = function () { P.stars = {}; P.save(); };

  P.levelStars = n => P.stars[n] || 0;
  P.total = () => Object.values(P.stars).reduce((s, v) => s + v, 0);
  P.maxTotal = () => Object.keys(TD.LEVELS).length * 3;
  // Уровень открыт, если он первый или предыдущий пройден.
  P.isOpen = n => n === 1 || P.levelStars(n - 1) > 0;
  // Самый верхний открытый уровень — туда указывает флажок на карте.
  P.frontier = function () {
    const ids = Object.keys(TD.LEVELS).map(Number).sort((a, b) => a - b);
    let f = 1;
    for (const id of ids) if (P.isOpen(id)) f = id;
    return f;
  };
  // Победа на уровне: запоминаем лучший результат. Возвращает { stars, best, gained }.
  P.award = function (level, castleHp) {
    const stars = TD.starsFor(castleHp);
    const before = P.levelStars(level);
    if (stars > before) { P.stars[level] = stars; P.save(); }
    return { stars, best: Math.max(stars, before), gained: Math.max(0, stars - before) };
  };

  P.load();
})();
