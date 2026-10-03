// Улучшения за звёзды: открытие новых вышек и по 3 ступени улучшений вышек и заклинаний.
// Базовые характеристики хранятся отдельно, TD.applyUpgrades() каждый раз собирает их заново
// с купленными ступенями (вызывается перед каждым уровнем и после покупки).
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const pct = v => Math.round(v * 100) + '%';
  const num = v => String(Math.round(v * 100) / 100).replace('.', ',');

  TD.UNLOCK_COST = 4;                       // открыть новую вышку
  TD.UPGRADE_COST = [1, 2, 3];              // ступени I, II, III
  TD.LOCKED_TOWERS = ['spire', 'frost', 'bell'];

  // Ступени улучшений. apply(def) меняет копию базового описания вышки или заклинания.
  TD.UPGRADES = {
    // ---------------- Вышки ----------------
    rattle: [
      { name: 'Промасленный механизм', desc: 'Перезарядка очереди 3,5 → 3,0 с', apply: d => { d.burst.reload -= 0.5; } },
      { name: 'Длинный магазин', desc: 'Очередь 12 → 14 болтов', apply: d => { d.burst.shots += 2; } },
      { name: 'Оптический прицел', desc: 'Точность +3 (5 → 8)', apply: d => { d.stats.acc += 3; } },
    ],
    thunder: [
      { name: 'Тяжёлые ядра', desc: 'Урон +1 (13 → 14): 29,65 → 32,75', apply: d => { d.stats.dmg += 1; } },
      { name: 'Начинённые ядра', desc: 'Радиус взрыва 1 → 1,25 клетки', apply: d => { d.splash.radius += 0.25; } },
      { name: 'Бронзовый прицел', desc: 'Точность +3 (1 → 4)', apply: d => { d.stats.acc += 3; } },
    ],
    dragon: [
      { name: 'Длинное сопло', desc: 'Дальность +1 (2 → 3): 1,9 → 2,25 клетки', apply: d => { d.stats.range += 1; } },
      { name: 'Мехи кузнеца', desc: 'Скорострельность +1 (7 → 8): 9 → 10 сгустков/с', apply: d => { d.stats.rate += 1; } },
      { name: 'Широкая струя', desc: 'Конус шире: сгусток разрастается ×3,2 → ×3,8', apply: d => { d.flame.grow = 3.8; } },
    ],
    falcon: [
      { name: 'Стальные наконечники', desc: 'Урон +1 (17 → 18): 42,85 → 46,45', apply: d => { d.stats.dmg += 1; } },
      { name: 'Взведённый ворот', desc: 'Скорострельность +1 (3 → 4): 0,5 → 0,6 выстр./с', apply: d => { d.stats.rate += 1; } },
      { name: 'Орлиный глаз', desc: 'Дальность +2 (18 → 20): 7,5 → 8,2 клетки', apply: d => { d.stats.range += 2; } },
    ],
    spire: [
      { name: 'Резонанс', desc: 'Урон +1 (9 → 10): 18,35 → 21', apply: d => { d.stats.dmg += 1; } },
      { name: 'Глубокий пробой', desc: 'Потолок «Пробоя чар» +50% → +80%', apply: d => { d.pierce.max = 8; } },
      { name: 'Ускоренный ритуал', desc: 'Скорострельность +1 (5 → 6): 0,7 → 0,8 выстр./с', apply: d => { d.stats.rate += 1; } },
    ],
    frost: [
      { name: 'Лютый холод', desc: 'Замедление 30% → 35%', apply: d => { d.slow = 0.35; } },
      { name: 'Ледяной простор', desc: 'Радиус +1 (6 → 7): 3,3 → 3,65 клетки', apply: d => { d.stats.range += 1; } },
      { name: 'Вечная мерзлота', desc: 'Замедление 35% → 40%', apply: d => { d.slow = 0.4; } },
    ],
    bell: [
      { name: 'Зоркие дозорные', desc: 'Радиус дозора +2 (8 → 10): 4,0 → 4,7 клетки', apply: d => { d.stats.range += 2; } },
      { name: 'Громкий набат', desc: 'Набат +3 к точности и скорострельности (Трещотке −0,75 с перезарядки)', apply: d => { d.buff = { acc: 3, rate: 3, reload: 0.75 }; } },
      { name: 'Колокольня', desc: 'Набат слышно в радиусе 2 клеток (24 клетки вокруг)', apply: d => { d.buffRadius = 2; } },
    ],
    // ---------------- Заклинания ----------------
    meteor: [
      { name: 'Раскалённое ядро', desc: 'Урон 120 → 150', apply: s => { s.dmg = 150; } },
      { name: 'Широкий кратер', desc: 'Радиус 1,5 → 1,8 клетки', apply: s => { s.radius = 1.8; } },
      { name: 'Огненный дождь', desc: 'Перезарядка 25 → 20 с', apply: s => { s.cd = 20; } },
    ],
    frost_spell: [
      { name: 'Долгая стужа', desc: 'Длительность 5 → 7 с', apply: s => { s.dur = 7; } },
      { name: 'Буран', desc: 'Радиус 2 → 2,5 клетки', apply: s => { s.radius = 2.5; } },
      { name: 'Лёд по жилам', desc: 'Замедление 50% → 60%', apply: s => { s.slow = 0.6; } },
    ],
    chain: [
      { name: 'Сильный разряд', desc: 'Урон 60 → 75', apply: s => { s.dmg = 75; } },
      { name: 'Длинная цепь', desc: 'Прыжков 4 → 6', apply: s => { s.jumps = 6; } },
      { name: 'Без потерь', desc: 'Потеря урона за прыжок 20% → 10%', apply: s => { s.falloff = 0.1; } },
    ],
  };
  // Ключ улучшения заклинания «Ледяная хватка» отличается от вышки «Морозный тотем».
  TD.SPELL_UPGRADE_KEY = { meteor: 'meteor', frost: 'frost_spell', chain: 'chain' };

  // Описания, в которых есть изменяемые числа.
  const TOWER_DESC = {
    rattle: d => { d.perk.desc = `Очередь из ${d.burst.shots} болтов, затем перезарядка ${num(d.burst.reload)} с.`; },
    thunder: d => { d.perk.desc = `Ядро взрывается при попадании или на излёте: ${pct(d.splash.mult)} урона всем в радиусе ${num(d.splash.radius)} клетки.`; },
    spire: d => { d.perk2.desc = `Каждое попадание подряд в ту же цель: +10% урона, до +${d.pierce.max * 10}%. Смена цели сбрасывает.`; },
    frost: d => { d.perk.desc = `Не стреляет. Все враги в радиусе действия замедлены на ${pct(d.slow)}, пока находятся в нём. Несколько тотемов не складываются; с «Ледяной хваткой» действует более сильное замедление.`; },
    bell: d => { d.perk2.desc = `Вышки в радиусе ${d.buffRadius} ${d.buffRadius === 1 ? 'клетки' : 'клеток'} (включая диагонали): +${d.buff.acc} к точности и +${d.buff.rate} к скорострельности (у Трещотки — перезарядка на ${num(d.buff.reload)} с быстрее). Несколько колоколов не складываются.`; },
  };
  const SPELL_DESC = {
    meteor: s => `Через 1 с в выбранную точку падает метеор: ${s.dmg} урона всем в радиусе ${num(s.radius)} клетки и поджог — ${s.burn.dps} урона в секунду ${s.burn.dur} с.`,
    frost: s => `Сковывает льдом всех врагов в радиусе ${num(s.radius)} клеток: скорость −${pct(s.slow)} на ${s.dur} с.`,
    chain: s => `Бьёт выбранного врага на ${s.dmg} урона и перескакивает ещё на ${s.jumps} ближайших, теряя ${pct(s.falloff)} урона за каждый прыжок. Не промахивается.`,
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const BASE_TOWERS = TD.TOWERS.map(clone);
  const BASE_SPELLS = TD.SPELLS.map(clone);

  // Собирает характеристики заново: база + купленные ступени. ranks — { id: 0..3 }, unlocked — { id: true }.
  TD.applyUpgrades = function (ranks, unlocked) {
    ranks = ranks || {}; unlocked = unlocked || {};
    TD.TOWERS.forEach((def, i) => {
      const base = clone(BASE_TOWERS[i]);
      for (const k of Object.keys(base)) def[k] = base[k];
      const r = ranks[def.id] || 0;
      for (let k = 0; k < r; k++) TD.UPGRADES[def.id][k].apply(def);
      if (TOWER_DESC[def.id]) TOWER_DESC[def.id](def);
      def.rank = r;
      def.locked = TD.LOCKED_TOWERS.includes(def.id) && !unlocked[def.id];
    });
    TD.SPELLS.forEach((sp, i) => {
      const base = clone(BASE_SPELLS[i]);
      for (const k of Object.keys(base)) sp[k] = base[k];
      const key = TD.SPELL_UPGRADE_KEY[sp.id];
      const r = key ? ranks[key] || 0 : 0;
      for (let k = 0; k < r; k++) TD.UPGRADES[key][k].apply(sp);
      if (SPELL_DESC[sp.id]) sp.desc = SPELL_DESC[sp.id](sp);
      sp.rank = r;
    });
  };
  TD.applyUpgrades();   // по умолчанию — базовые значения, новые вышки закрыты
})();
