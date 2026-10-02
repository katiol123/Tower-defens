// Симуляция игры без DOM: враги, вышки, прицеливание, снаряды, попадания по маске спрайта.
// Этот же код гоняют тесты в tests/.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const T = () => TD.TILE;

  // ---------------- Маски спрайтов ----------------
  let MASKS = null;
  function masks(sprite) {
    if (!MASKS) {
      MASKS = {};
      for (const sp in TD.SPRITES) {
        MASKS[sp] = {};
        for (const v in TD.SPRITES[sp].masks) {
          const rows = TD.SPRITES[sp].masks[v];
          const gh = rows.length, gw = rows[0].length;
          const bits = new Uint8Array(gw * gh);
          for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) bits[y * gw + x] = rows[y].charCodeAt(x) === 49 ? 1 : 0;
          MASKS[sp][v] = { gw, gh, bits };
        }
      }
    }
    return MASKS[sprite];
  }

  // Смещение центра спрайта над точкой на дороге: ноги стоят на 14 px ниже точки маршрута.
  function centerLift(e) {
    const sp = TD.SPRITES[e.sprite], H = e.height * e.size;
    return (sp.foot - 0.5) * H - 14 * e.size;
  }

  // Геометрия спрайта врага: центр (с учётом покачивания при ходьбе), размеры.
  TD.enemyBox = function (e) {
    const sp = TD.SPRITES[e.sprite];
    const H = e.height * e.size;
    const s = H / sp.h;
    return { cx: e.x, cy: e.y - centerLift(e) - e.bob, W: sp.w * s, H, cell: sp.cell * s };
  };

  // Пересекается ли круглый снаряд (px, py, r) с непрозрачными пикселями спрайта врага.
  TD.hitTest = function (e, px, py, r) {
    const b = TD.enemyBox(e);
    if (Math.abs(px - b.cx) > b.W / 2 + r || Math.abs(py - b.cy) > b.H / 2 + r) return false;
    const m = masks(e.sprite)[e.view];
    let lx = (px - (b.cx - b.W / 2)) / b.cell;
    const ly = (py - (b.cy - b.H / 2)) / b.cell;
    if (e.flip) lx = m.gw - lx;
    const rc = r / b.cell, rc2 = rc * rc;
    const x0 = Math.max(0, Math.floor(lx - rc)), x1 = Math.min(m.gw - 1, Math.floor(lx + rc));
    const y0 = Math.max(0, Math.floor(ly - rc)), y1 = Math.min(m.gh - 1, Math.floor(ly + rc));
    for (let gy = y0; gy <= y1; gy++) {
      const ny = ly < gy ? gy : ly > gy + 1 ? gy + 1 : ly;
      const dy = ly - ny;
      for (let gx = x0; gx <= x1; gx++) {
        if (!m.bits[gy * m.gw + gx]) continue;
        const nx = lx < gx ? gx : lx > gx + 1 ? gx + 1 : lx;
        const dx = lx - nx;
        if (dx * dx + dy * dy <= rc2) return true;
      }
    }
    return false;
  };

  // ---------------- Враги ----------------
  let nextId = 1;

  // Враг заданного типа (TD.UNITS). Параметры и перки берутся из типа;
  // opts.stats / opts.perks / opts.name переопределяют их (используется тестами и спешиванием).
  TD.createUnit = function (type, rng, opts) {
    opts = opts || {};
    const U = TD.UNITS[type];
    const base = Object.assign({}, U.stats, opts.stats || {});
    const perks = (opts.perks || U.perks).slice();
    const st = Object.assign({}, base);
    for (const k in st) st[k] = Math.max(1, Math.min(20, st[k]));
    let tech = 3;
    perks.forEach(p => { tech += TD.PERK_TECH[TD.PERKS[p].type]; });
    st.tech = tech;
    const hpMax = U.boss ? TD.F.bossHp(st.sta) : TD.F.enemyHp(st.sta);
    const e = {
      id: nextId++, type,
      name: opts.name || (U.boss ? U.name : rng.pick(TD.GOBLIN_FIRST) + ' ' + rng.pick(TD.GOBLIN_LAST)),
      kind: opts.kind || (U.boss ? 'Босс первого уровня' : U.name),
      sprite: U.sprite, height: U.height,
      base, stats: st, perks,
      hpMax, hp: hpMax,
      boss: !!U.boss,
      size: perks.includes('giant') ? TD.GIANT.size : 1,
      dist: 0, x: 0, y: 0, dx: 1, dy: 0, view: 'side', flip: false, bob: 0,
      alive: true, age: 0,
      hitsTaken: 0, dmgTaken: 0, hitFlash: 0,
    };
    e.reward = U.reward || 2 * (2 + Math.round(hpMax / 40));
    if (perks.includes('spores')) e.sporeT = 0;
    if (perks.includes('dumb')) { e.dumbT = 0; e.stupor = 0; }
    if (perks.includes('nest')) e.nestT = 0;
    if (perks.includes('frenzy')) setFrenzy(e, true);
    return e;
  };

  // «Грибное безумие»: прибавка к макс. здоровью, скорости и силе; спадает без урона.
  function setFrenzy(e, on) {
    const F = TD.FRENZY;
    if (on) {
      e.frenzy = true; e.calmT = 0;
      e.stats.spd = Math.min(20, e.base.spd + F.spd);
      e.stats.str = Math.min(20, e.base.str + F.str);
      e.hpMax += F.hp; e.hp += F.hp;
    } else {
      e.frenzy = false;
      e.stats.spd = e.base.spd; e.stats.str = e.base.str;
      e.hpMax -= F.hp; e.hp = Math.min(e.hp, e.hpMax);
    }
  }
  TD.setFrenzy = setFrenzy;
  // Иммунитет к негативным эффектам (пока это негативные перки вроде «Трусливого»).
  TD.isImmune = e => !!e.frenzy;
  const negActive = (e, id) => e.perks.includes(id) && !TD.isImmune(e);
  TD.createGoblin = (rng, opts) => TD.createUnit('goblin', rng, opts);

  function speedMult(e) {
    let m = 1;
    if (negActive(e, 'coward') && e.hp < e.hpMax / 2) m *= 0.7;
    if (e.stupor > 0) m = 0;
    return m;
  }
  TD.enemySpeedPx = e => TD.F.enemySpeed(e.stats.spd) * T() * speedMult(e);

  function placeEnemy(e) {
    const p = TD.routeAt(e.route, e.dist);
    e.x = p.x; e.y = p.y; e.dx = p.dx; e.dy = p.dy;
    if (Math.abs(p.dx) > Math.abs(p.dy)) {
      e.view = 'side';
      // Боковой ракурс отражается, когда юнит идёт не туда, куда смотрит исходная картинка.
      e.flip = TD.SPRITES[e.sprite].sideFaces === 'left' ? p.dx > 0 : p.dx < 0;
    } else { e.view = p.dy > 0 ? 'front' : 'back'; e.flip = false; }
    // Прыжок с тролля — высота прыжка входит в bob, поэтому столкновения совпадают с картинкой.
    if (e.jumpT > 0) e.bob = Math.sin(Math.PI * e.jumpT / e.jumpDur) * e.jumpH;
    else if (e.stupor > 0) e.bob = 0;
    else e.bob = Math.abs(Math.sin(e.dist / T() * Math.PI * 1.6)) * 2.5 * Math.min(e.size, 1.3);
  }
  TD.placeEnemy = placeEnemy;

  // Центр спрайта врага через t секунд (по маршруту, при текущей скорости).
  TD.predictCenter = function (e, t) {
    const p = TD.routeAt(e.route, e.dist + TD.enemySpeedPx(e) * t);
    return { x: p.x, y: p.y - centerLift(e) - e.bob };
  };

  // Точность вышки против конкретного врага («Серая молния» — на 3 меньше, не меньше 1).
  TD.effectiveAcc = (tower, e) => e.perks.includes('blur') ? Math.max(1, tower.def.stats.acc - 3) : tower.def.stats.acc;

  // ---------------- Игра ----------------
  TD.Game = function (seed, opts) {
    opts = opts || {};
    this.seed = seed;
    this.rng = opts.rng || TD.makeRng((seed ^ 0x9e3779b9) >>> 0);
    this.map = opts.map || TD.generateMap(seed);
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.pending = [];
    this.events = [];
    this.gold = TD.START_GOLD;
    this.castleHp = TD.CASTLE_HP;
    this.wave = 0;
    this.phase = 'build';   // build | wave | won | lost
    this.spawnQueue = [];
    this.time = 0;
    this.countdown = 0;
    this.stats = { kills: 0, leaked: 0 };
    this.onShot = null;     // (projectile, outcome) — используется тестами
  };

  const G = TD.Game.prototype;

  G.emit = function (ev) { this.events.push(ev); if (this.events.length > 400) this.events.shift(); };

  G.towerAt = function (tx, ty) { return this.towers.find(t => t.tx === tx && t.ty === ty); };
  G.canBuild = function (tx, ty) { return this.map.buildable(tx, ty) && !this.towerAt(tx, ty); };

  G.addTower = function (def, tx, ty, free) {
    if (!this.canBuild(tx, ty)) return null;
    if (!free) { if (this.gold < def.price) return null; this.gold -= def.price; }
    const t = {
      def, tx, ty, cx: (tx + 0.5) * T(), cy: (ty + 0.5) * T(),
      act: TD.towerActual(def), cd: 0.3, burstLeft: def.burst ? def.burst.shots : 0,
      angle: -Math.PI / 2, target: null, spent: free ? 0 : def.price,
      shots: 0, hits: 0, dmgDealt: 0, kills: 0, firing: 0, recoil: 0,
    };
    this.towers.push(t);
    this.emit({ type: 'build', x: t.cx, y: t.cy });
    return t;
  };

  G.sellTower = function (t) {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    this.towers.splice(i, 1);
    const refund = Math.floor(t.spent * TD.SELL_RATE);
    this.gold += refund;
    this.emit({ type: 'sell', x: t.cx, y: t.cy, gold: refund });
  };

  G.spawnEnemy = function (e, pathId) {
    const path = this.map.paths[pathId];
    e.pathId = pathId;
    e.route = path.route;
    e.dist = 0;
    placeEnemy(e);
    this.enemies.push(e);
    this.emit({ type: 'spawn', e });
    return e;
  };

  G.startWave = function () {
    if (this.phase === 'won' || this.phase === 'lost') return;
    if (this.phase === 'wave' && this.spawnQueue.length) return;
    this.wave++;
    const w = TD.waveDef(this.wave);
    this.spawnQueue.push(...TD.waveSchedule(w, this.map.paths.length, this.rng, this.time + 0.4));
    this.phase = 'wave';
    this.countdown = 0;
    this.emit({ type: 'wave', n: this.wave });
  };

  // Расписание появления врагов волны: порядок юнитов сохраняется, а интервалы рваные —
  // плотные кучки (вся кучка идёт по одной тропе), одиночки и пары с разным шагом, паузы.
  // В среднем на одного врага по-прежнему приходится около w.gap секунд.
  TD.waveSchedule = function (w, nPaths, rng, t0) {
    const out = [];
    const load = new Array(nPaths).fill(0);
    // Тропа для группы — наименее загруженная (при равенстве случайная), чтобы тропы не пустовали.
    const pickPath = () => {
      const min = Math.min(...load);
      const c = load.map((v, i) => v === min ? i : -1).filter(i => i >= 0);
      return rng.pick(c);
    };
    // Типы групп тянутся из перемешанного «мешка»: кучки встречаются равномерно по всей волне,
    // а не случайными сериями.
    let bag = [];
    const draw = () => {
      if (!bag.length) {
        bag = ['pack', 'pack', 'single', 'single', 'trickle'];
        for (let k = bag.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [bag[k], bag[j]] = [bag[j], bag[k]]; }
      }
      return bag.pop();
    };
    let t = t0, i = 0;
    while (i < w.count) {
      const g = draw();
      let size, inner, after, kind;
      if (g === 'pack') {       // кучка: 3–6 врагов почти вплотную
        kind = 'pack'; size = rng.int(3, 6); inner = () => w.gap * (0.12 + rng() * 0.2); after = w.gap * (1.6 + rng() * 1.6);
      } else if (g === 'single') { // одиночка или пара с обычным шагом
        kind = 'single'; size = rng.int(1, 2); inner = () => w.gap * (0.7 + rng() * 0.9); after = w.gap * (0.6 + rng() * 1.2);
      } else {                  // редкая цепочка с большими промежутками
        kind = 'trickle'; size = rng.int(2, 4); inner = () => w.gap * (1.5 + rng() * 1.2); after = w.gap * (1.0 + rng() * 1.5);
      }
      size = Math.min(size, w.count - i);
      const groupPath = pickPath();
      for (let k = 0; k < size; k++, i++) {
        const path = kind === 'pack' ? groupPath : pickPath();
        load[path]++;
        out.push({ at: t, path, type: TD.WAVE_UNIT[w.units[i]], group: kind });
        if (k < size - 1) t += inner();
      }
      t += after;
    }
    return out;
  };

  // Прицеливание: итеративное упреждение по маршруту врага + случайное отклонение в круге.
  G.aim = function (tower, e, mx, my) {
    const sp = tower.act.projSpeed * T();
    let P = TD.predictCenter(e, 0);
    let t = Math.hypot(P.x - mx, P.y - my) / sp;
    for (let i = 0; i < 8; i++) {
      P = TD.predictCenter(e, t);
      t = Math.hypot(P.x - mx, P.y - my) / sp;
    }
    const ang = this.rng() * Math.PI * 2;
    const acc = TD.effectiveAcc(tower, e);
    const dev = acc === tower.def.stats.acc ? tower.act.dev : TD.F.aimDeviation(acc, tower.def.proj.r);
    const rho = dev * Math.sqrt(this.rng());
    return { x: P.x + Math.cos(ang) * rho, y: P.y + Math.sin(ang) * rho, t };
  };

  G.fire = function (tower, e) {
    const def = tower.def;
    const ang0 = Math.atan2(e.y - 10 - tower.cy, e.x - tower.cx);
    const mx = tower.cx + Math.cos(ang0) * 16, my = tower.cy - 8 + Math.sin(ang0) * 12;
    const aim = this.aim(tower, e, mx, my);
    const dx = aim.x - mx, dy = aim.y - my, L = Math.hypot(dx, dy) || 1;
    const sp = tower.act.projSpeed * T();
    const p = {
      kind: def.proj.kind, tower, targetId: e.id,
      x: mx, y: my, px: mx, py: my, vx: dx / L * sp, vy: dy / L * sp,
      r: def.proj.r, r0: def.proj.r, dmg: tower.act.dmg,
      traveled: 0, hitTarget: false, hitAny: false, done: false, hitSet: null, age: 0,
    };
    if (def.flame) {
      p.maxTravel = tower.act.range * T() * 1.08;
      p.hitSet = new Set();
      p.grow = def.flame.grow;
    } else if (def.splash) {
      p.maxTravel = L + T() * 0.25;
    } else {
      p.maxTravel = L + T() * 1.5;
    }
    tower.angle = Math.atan2(dy, dx);
    tower.shots++;
    tower.recoil = 1;
    tower.firing = 0.12;
    this.projectiles.push(p);
    this.emit({ type: 'fire', tower, kind: p.kind, x: mx, y: my, a: tower.angle });
    return p;
  };

  G.damage = function (e, dmg, tower, fire) {
    if (!e.alive) return 0;
    if (e.frenzy) dmg *= 1 - TD.FRENZY.resist;
    dmg = Math.round(dmg * 10) / 10;
    e.calmT = 0;
    e.hitsTaken++;
    e.hitFlash = 0.12;
    const dealt = Math.min(e.hp, dmg);
    e.hp -= dmg;
    e.dmgTaken += dealt;
    if (tower) tower.dmgDealt += dealt;
    this.emit({ type: 'dmg', x: e.x, y: e.y - 30 * e.size, v: dmg, fire, eid: e.id });
    if (e.hp <= 0) {
      e.hp = 0; e.alive = false;
      this.gold += e.reward;
      this.stats.kills++;
      if (tower) tower.kills++;
      this.emit({ type: 'death', e, gold: e.reward });
      // «Последний рывок волка»: с шансом 30% наездник остаётся жив с 50% здоровья.
      if (e.perks.includes('dismount') && this.rng() < 0.3) {
        const g = TD.createUnit('goblin', this.rng, { name: e.name, kind: 'Гоблин (спешенный наездник)' });
        g.hp = g.hpMax * 0.5;
        g.pathId = e.pathId; g.route = e.route; g.dist = e.dist;
        placeEnemy(g);
        this.pending.push(g);
        this.emit({ type: 'dismount', e, g });
      }
    }
    return dealt;
  };

  // «Целебные споры»: лечение себя и союзников рядом.
  G.spores = function (src) {
    const R = TD.SPORES.radius * T();
    const healed = [];
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - src.x, e.y - src.y) > R) continue;
      const add = Math.min(TD.SPORES.heal, e.hpMax - e.hp);
      if (add > 0) { e.hp += add; healed.push({ e, v: add }); }
    }
    this.emit({ type: 'spores', e: src, r: R, healed });
  };

  // «Гоблинское гнездо»: с тролля спрыгивают гоблины — часть впереди, часть позади него.
  G.nestDrop = function (troll) {
    const n = TD.NEST.count;
    const behind = Math.floor(n / 2);
    const half = TD.enemyBox(troll).W / 2;
    for (let i = 0; i < n; i++) {
      const back = i < behind;
      const off = half * 0.55 + 18 + this.rng() * 40 + (back ? 0 : 6);
      const g = TD.createUnit('goblin', this.rng, { kind: 'Гоблин из гнезда' });
      g.pathId = troll.pathId; g.route = troll.route;
      g.dist = Math.max(0, Math.min(troll.route.length - 1, troll.dist + (back ? -off : off)));
      g.jumpT = g.jumpDur = 0.45 + this.rng() * 0.2;
      g.jumpH = 26 + this.rng() * 16;
      g.kickChecked = false;
      g.fromX = troll.x; g.fromY = troll.y - troll.height * troll.size * 0.55;
      placeEnemy(g);
      this.pending.push(g);
    }
    this.emit({ type: 'nest', e: troll });
  };

  // Гоблин, пробегающий сквозь тролля, один раз проверяется на пинок (25%), если тролль не в ступоре.
  G.trollKicks = function () {
    for (const tr of this.enemies) {
      if (!tr.alive || !tr.perks.includes('nest') || tr.stupor > 0) continue;
      for (const g of this.enemies) {
        if (!g.alive || g.type !== 'goblin' || g.kickChecked || g.jumpT > 0) continue;
        const b = TD.enemyBox(g);
        if (!TD.hitTest(tr, b.cx, b.cy, 0)) continue;
        g.kickChecked = true;
        if (this.rng() >= TD.NEST.kick) continue;
        g.alive = false; g.kicked = true;
        this.stats.kicked = (this.stats.kicked || 0) + 1;
        this.emit({ type: 'kick', e: g, troll: tr });
      }
    }
  };

  G.explode = function (p, x, y, direct) {
    const def = p.tower.def;
    const R = def.splash.radius * T();
    if (direct) this.damage(direct, p.dmg, p.tower, false);
    for (const e of this.enemies) {
      if (!e.alive || e === direct) continue;
      const b = TD.enemyBox(e);
      if (Math.hypot(b.cx - x, b.cy - y) <= R + 8) this.damage(e, p.dmg * def.splash.mult, p.tower, false);
    }
    this.emit({ type: 'explode', x, y, r: R });
  };

  G.finishProjectile = function (p) {
    if (p.done) return;
    p.done = true;
    if (p.hitAny) p.tower.hits++;
    if (this.onShot) this.onShot(p);
  };

  G.updateProjectile = function (p, dt) {
    const sp = Math.hypot(p.vx, p.vy);
    const move = sp * dt;
    const steps = Math.max(1, Math.ceil(move / Math.max(1, p.r * 0.7)));
    const sdt = dt / steps;
    for (let s = 0; s < steps && !p.done; s++) {
      p.px = p.x; p.py = p.y;
      p.x += p.vx * sdt; p.y += p.vy * sdt;
      p.traveled += sp * sdt;
      if (p.grow) p.r = p.r0 * (1 + (p.grow - 1) * Math.min(1, p.traveled / p.maxTravel));
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (p.hitSet && p.hitSet.has(e.id)) continue;
        if (!TD.hitTest(e, p.x, p.y, p.r)) continue;
        p.hitAny = true;
        if (e.id === p.targetId) p.hitTarget = true;
        if (p.kind === 'flame') {
          p.hitSet.add(e.id);
          this.damage(e, p.dmg, p.tower, true);
          this.emit({ type: 'burn', x: p.x, y: p.y });
          continue;
        }
        if (p.kind === 'shell') this.explode(p, p.x, p.y, e);
        else { this.damage(e, p.dmg, p.tower, false); this.emit({ type: 'hit', x: p.x, y: p.y, kind: p.kind }); }
        this.finishProjectile(p);
        break;
      }
      if (!p.done && p.traveled >= p.maxTravel) {
        if (p.kind === 'shell') this.explode(p, p.x, p.y, null);
        this.finishProjectile(p);
      }
    }
    p.age += dt;
  };

  G.updateTower = function (t, dt) {
    t.cd -= dt;
    t.recoil = Math.max(0, t.recoil - dt * 6);
    t.firing = Math.max(0, t.firing - dt);
    const R = t.act.range * T();
    // Цель — враг, прошедший дальше всех по маршруту, в радиусе действия.
    let best = null, bestProg = -1;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const b = TD.enemyBox(e);
      if (Math.hypot(b.cx - t.cx, b.cy - t.cy) > R) continue;
      const prog = e.dist / e.route.length;
      if (prog > bestProg) { bestProg = prog; best = e; }
    }
    t.target = best;
    if (best) {
      const want = Math.atan2(best.y - 10 - t.cy, best.x - t.cx);
      let d = want - t.angle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      t.angle += d * Math.min(1, dt * 10);
    }
    const def = t.def;
    if (def.burst) {
      if (t.cd > 0) return;
      if (!best) { if (t.burstLeft < def.burst.shots && t.burstLeft > 0) { /* держим очередь */ } return; }
      this.fire(t, best);
      t.burstLeft--;
      if (t.burstLeft <= 0) { t.burstLeft = def.burst.shots; t.cd = def.burst.reload; t.reloading = def.burst.reload; }
      else t.cd = def.burst.gap;
      return;
    }
    if (t.cd > 0 || !best) return;
    this.fire(t, best);
    t.cd += t.act.cooldown;
    if (t.cd < 0) t.cd = t.act.cooldown;
  };

  G.update = function (dt) {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.time += dt;
    // Появление врагов
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(TD.createUnit(s.type, this.rng), s.path);
    }
    // Движение врагов
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.age += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.frenzy) {
        e.calmT += dt;
        if (e.calmT >= TD.FRENZY.calm) { setFrenzy(e, false); this.emit({ type: 'calm', e }); }
      }
      if (e.jumpT > 0) e.jumpT = Math.max(0, e.jumpT - dt);
      if (e.dumbT !== undefined) {
        // «Тупоголовый»: проверка раз в 5 с, пока не в ступоре.
        if (e.stupor > 0) {
          e.stupor = Math.max(0, e.stupor - dt);
          if (e.stupor === 0) this.emit({ type: 'stuporEnd', e });
        } else if (negActive(e, 'dumb')) {
          e.dumbT += dt;
          if (e.dumbT >= TD.DUMB.every) {
            e.dumbT -= TD.DUMB.every;
            if (this.rng() < TD.DUMB.chance) { e.stupor = TD.DUMB.stun; this.emit({ type: 'stupor', e }); }
          }
        }
      }
      if (e.nestT !== undefined) {
        e.nestT += dt;
        if (e.nestT >= TD.NEST.every) { e.nestT -= TD.NEST.every; this.nestDrop(e); }
      }
      if (e.sporeT !== undefined) {
        e.sporeT += dt;
        if (e.sporeT >= TD.SPORES.every) { e.sporeT -= TD.SPORES.every; this.spores(e); }
      }
      e.dist += TD.enemySpeedPx(e) * dt;
      if (e.dist >= e.route.length) {
        e.alive = false; e.leaked = true;
        if (!this.immortalCastle) this.castleHp = Math.max(0, this.castleHp - e.stats.str);
        this.stats.leaked++;
        this.emit({ type: 'castle', e, dmg: e.stats.str });
        continue;
      }
      placeEnemy(e);
    }
    this.trollKicks();
    for (const t of this.towers) this.updateTower(t, dt);
    for (const p of this.projectiles) if (!p.done) this.updateProjectile(p, dt);
    this.projectiles = this.projectiles.filter(p => !p.done);
    this.enemies = this.enemies.filter(e => e.alive);
    // Спешенные наездники появляются после обработки снарядов этого шага.
    if (this.pending.length) { this.enemies.push(...this.pending); this.pending.length = 0; }

    if (this.castleHp <= 0 && this.phase !== 'lost') { this.phase = 'lost'; this.emit({ type: 'lost' }); return; }
    if (this.phase === 'wave' && !this.spawnQueue.length && !this.enemies.length) {
      const w = TD.waveDef(this.wave);
      this.gold += w.reward;
      this.emit({ type: 'waveEnd', n: this.wave, reward: w.reward });
      if (this.wave >= TD.WAVES) { this.phase = 'won'; this.emit({ type: 'won' }); }
      else { this.phase = 'build'; this.countdown = 20; }
    }
    if (this.phase === 'build' && this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave();
    }
  };
})();
