// Константы, формулы и описания вышек, врагов и перков.
var TD = globalThis.TD || (globalThis.TD = {});

TD.TILE = 48;            // размер клетки в мировых пикселях
TD.COLS = 26;
TD.ROWS = 15;
TD.W = TD.TILE * TD.COLS;
TD.H = TD.TILE * TD.ROWS;
TD.DT = 1 / 60;          // шаг симуляции, с

TD.CASTLE_HP = 100;
TD.START_GOLD = 200;
TD.SELL_RATE = 0.7;

// Высота спрайта гоблина в мировых пикселях (рамка обрезки 816×912 исходника).
TD.GOBLIN_H = 50;

// ---------------------------------------------------------------------------
// Формулы. Все параметры вышек и врагов — целые от 1 до 20.
// ---------------------------------------------------------------------------
TD.F = {
  // Скорость врага, клеток/с. Линейно: 0,8 при 1 и ровно в 2,5 раза больше (2,0) при 20.
  enemySpeed(s) { return 0.8 * (1 + 1.5 * (s - 1) / 19); },
  // Максимальное здоровье врага.
  enemyHp(sta) { return 40 + 15 * sta; },
  // Урон одного попадания вышки.
  damage(d) { return Math.round((3 * d + 0.12 * d * d) * 10) / 10; },
  // Выстрелов в секунду.
  fireRate(s) { return 0.2 + 0.1 * s; },
  // Дальность, клеток.
  range(r) { return 1.2 + 0.35 * r; },
  // Максимальное отклонение точки прицеливания от центра спрайта (мировые px)
  // для эталонного снаряда радиусом ACC_R0. Экспонента по точности:
  //   dev(A) = DEV1 · (DEV20 / DEV1) ^ ((A − 1) / 19)
  // Константы откалиброваны тестом tests/accuracy-test.js: промах ≈50% при A=1 и ≈5% при A=20
  // по гоблину со средней скоростью (10).
  maxDeviation(a) {
    const k = (a - 1) / 19;
    return TD.ACC.DEV1 * Math.pow(TD.ACC.DEV20 / TD.ACC.DEV1, k);
  },
  // Отклонение для конкретного снаряда: чем крупнее снаряд, тем шире разброс,
  // чтобы шанс задеть спрайт оставался тем же, что у эталона.
  aimDeviation(a, projR) { return TD.F.maxDeviation(a) + (projR - TD.ACC.R0); },
};

TD.ACC = { R0: 2.5, DEV1: 62.5, DEV20: 26.0 };

// ---------------------------------------------------------------------------
// Вышки
// ---------------------------------------------------------------------------
TD.TOWERS = [
  {
    id: 'rattle', name: 'Трещотка', title: 'Скорострельный арбалет',
    stats: { dmg: 2, rate: null, acc: 5, range: 6 },
    rateLabel: 'очередь',
    perk: { icon: '⋙', name: 'Стрельба очередью', desc: 'Очередь из 12 болтов, затем перезарядка 3,5 с.' },
    burst: { shots: 12, gap: 0.085, reload: 3.5 },
    proj: { kind: 'bolt', r: 2.5, speed: 14 },
    color: '#e8b04a', price: 0,
  },
  {
    id: 'thunder', name: 'Громобой', title: 'Бронзовая мортира',
    stats: { dmg: 13, rate: 6, acc: 1, range: 11 },
    perk: { icon: '✹', name: 'Урон по площади', desc: 'Ядро взрывается при попадании или на излёте: 60% урона всем в радиусе 1 клетки.' },
    splash: { radius: 1.0, mult: 0.6 },
    proj: { kind: 'shell', r: 5, speed: 8 },
    color: '#c7773a', price: 0,
  },
  {
    id: 'dragon', name: 'Драконья пасть', title: 'Огнемёт',
    stats: { dmg: 1, rate: 7, acc: 16, range: 1 },
    perk: { icon: '🔥', name: 'Огненный поцелуй', desc: 'Пока видит цель, извергает струю огня конусом. Каждый сгусток пламени проходит насквозь и обжигает всех, кого коснётся.' },
    flame: { perRate: 10, grow: 2.4 },
    proj: { kind: 'flame', r: 5, speed: 4.2 },
    color: '#ff5a2a', price: 0,
  },
  {
    id: 'falcon', name: 'Соколиный глаз', title: 'Дальнобойная баллиста',
    stats: { dmg: 17, rate: 3, acc: 20, range: 18 },
    perk: null,
    proj: { kind: 'lance', r: 2.5, speed: 24 },
    color: '#6fc3ff', price: 0,
  },
];
// Цены подобраны тестом tests/balance-test.js (см. README).
TD.TOWER_PRICES = { rattle: 40, thunder: 145, dragon: 95, falcon: 140 };
TD.TOWERS.forEach(t => { t.price = TD.TOWER_PRICES[t.id]; });

// Фактические характеристики вышки из параметров 1–20.
TD.towerActual = function (def) {
  const s = def.stats;
  const a = {
    dmg: TD.F.damage(s.dmg),
    range: TD.F.range(s.range),
    dev: TD.F.aimDeviation(s.acc, def.proj.r),
    projSpeed: def.proj.speed,
  };
  if (def.burst) {
    a.rate = def.burst.shots / (def.burst.shots * def.burst.gap + def.burst.reload);
    a.cooldown = def.burst.gap;
  } else if (def.flame) {
    a.rate = TD.F.fireRate(s.rate) * def.flame.perRate;
    a.cooldown = 1 / a.rate;
  } else {
    a.rate = TD.F.fireRate(s.rate);
    a.cooldown = 1 / a.rate;
  }
  a.dps = a.dmg * a.rate;
  return a;
};

// ---------------------------------------------------------------------------
// Перки врагов. type: 'pos' — обычный позитивный (+2 техники), 'rare' — редкий (+5),
// 'neg' — негативный (−2). Взаимоисключающие перки указаны в excl.
// ---------------------------------------------------------------------------
TD.PERKS = {
  thickhide: { type: 'pos', icon: '🛡️', name: 'Толстая шкура', desc: 'Каждое попадание наносит на 1,5 урона меньше (но не меньше 30% урона).' },
  brute:     { type: 'pos', icon: '💪', name: 'Громила', desc: '+3 к силе: бьёт по замку сильнее.', excl: [] },
  swift:     { type: 'pos', icon: '🏃', name: 'Быстроногий', desc: '+3 к скорости.', excl: ['lame'] },
  sturdy:    { type: 'pos', icon: '❤️', name: 'Крепыш', desc: '+3 к выносливости.', excl: ['frail'] },
  regen:     { type: 'pos', icon: '🌿', name: 'Заживление', desc: 'Восстанавливает 1,5% максимального здоровья в секунду.' },
  stubborn:  { type: 'rare', icon: '💀', name: 'Упрямец', desc: 'Первый смертельный удар оставляет 1 здоровья, и гоблин 2 с бежит на 50% быстрее.' },
  fireproof: { type: 'rare', icon: '🧯', name: 'Огнеупорный', desc: 'Огонь наносит лишь 25% урона.', excl: ['flammable'] },
  slippery:  { type: 'rare', icon: '🌀', name: 'Вёрткий', desc: 'Спрайт на 20% меньше — в него труднее попасть.', excl: ['glutton'] },
  lame:      { type: 'neg', icon: '🦶', name: 'Хромой', desc: '−3 к скорости.', excl: ['swift'] },
  frail:     { type: 'neg', icon: '🥀', name: 'Хилый', desc: '−3 к выносливости.', excl: ['sturdy'] },
  glutton:   { type: 'neg', icon: '🍖', name: 'Обжора', desc: 'Спрайт на 20% больше — в него легче попасть.', excl: ['slippery'] },
  flammable: { type: 'neg', icon: '🕯️', name: 'Горючий', desc: 'Огонь наносит на 50% больше урона.', excl: ['fireproof'] },
  coward:    { type: 'neg', icon: '😱', name: 'Трус', desc: 'При здоровье ниже половины скорость падает на 30%.' },
};
TD.PERK_TECH = { pos: 2, rare: 5, neg: -2 };
TD.PERK_TYPE_LABEL = { pos: 'Позитивный', rare: 'Редкий', neg: 'Негативный' };

TD.ENEMY_STAT_INFO = {
  sta: { name: 'Выносливость', icon: '❤', hint: 'Здоровье = 40 + 15 × выносливость' },
  str: { name: 'Сила', icon: '⚔', hint: 'Урон замку = сила' },
  spd: { name: 'Скорость', icon: '➶', hint: 'Скорость = 0,8 × (1 + 1,5 × (скорость − 1) / 19) клеток/с' },
  tech: { name: 'Техника', icon: '✦', hint: '3, +2 за позитивный перк, +5 за редкий, −2 за негативный' },
};

// ---------------------------------------------------------------------------
// Имена гоблинов
// ---------------------------------------------------------------------------
TD.GOBLIN_FIRST = ['Гнусь', 'Шмыг', 'Кривозуб', 'Хрящ', 'Бугай', 'Сопля', 'Гроб', 'Жмых', 'Скрип', 'Клык',
  'Рыгун', 'Ухват', 'Мордоворот', 'Зуботык', 'Хмырь', 'Щербак', 'Гнилоух', 'Шкряб', 'Пузо', 'Дрызг',
  'Чвак', 'Буркало', 'Хряп', 'Сморчок', 'Грызь', 'Шпынь', 'Кочерыжка', 'Бородавка', 'Лишай', 'Трухля'];
TD.GOBLIN_LAST = ['Костеглод', 'Грязнолап', 'Пнёвый', 'Вонючка', 'Кривоногий', 'Ржавый Тесак', 'из Топей',
  'Рваное Ухо', 'Жабоед', 'Сажевый', 'Червивый', 'Трёхпалый', 'Лысый', 'Кочкарь', 'Дубинщик', 'Болотник',
  'Косой', 'Громкоглот', 'Сухопятый', 'Злыдень'];

TD.WAVES = 10;
TD.waveDef = function (n) {
  return {
    count: 9 + 3 * n,
    gap: Math.max(0.42, 1.1 - 0.07 * n),
    staBonus: n - 1 + Math.floor(n / 3),
    perkBoost: 0.04 * (n - 1),
    reward: 15 + 3 * n,
  };
};
