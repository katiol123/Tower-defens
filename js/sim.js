// Симуляция игры без DOM: враги, вышки, прицеливание, снаряды, попадания по маске спрайта.
// Этот же код гоняют тесты в tests/.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const T = () => TD.TILE;

  // ---------------- Маски спрайтов ----------------
  let MASKS = null;
  function masks() {
    if (MASKS) return MASKS;
    MASKS = {};
    for (const v in TD.GOBLIN_MASKS) {
      const rows = TD.GOBLIN_MASKS[v];
      const gh = rows.length, gw = rows[0].length;
      const bits = new Uint8Array(gw * gh);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) bits[y * gw + x] = rows[y].charCodeAt(x) === 49 ? 1 : 0;
      MASKS[v] = { gw, gh, bits };
    }
    return MASKS;
  }

  // Геометрия спрайта врага: центр (с учётом покачивания при ходьбе), размеры.
  TD.enemyBox = function (e) {
    const H = TD.GOBLIN_H * e.size;
    const s = H / TD.SPRITE_CROP.h;
    return { cx: e.x, cy: e.y - 10 * e.size - e.bob, W: TD.SPRITE_CROP.w * s, H, cell: TD.SPRITE_CROP.cell * s };
  };

  // Пересекается ли круглый снаряд (px, py, r) с непрозрачными пикселями спрайта врага.
  TD.hitTest = function (e, px, py, r) {
    const b = TD.enemyBox(e);
    if (Math.abs(px - b.cx) > b.W / 2 + r || Math.abs(py - b.cy) > b.H / 2 + r) return false;
    const m = masks()[e.view];
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

  TD.rollPerks = function (rng, boost) {
    const ids = Object.keys(TD.PERKS);
    const pos = ids.filter(k => TD.PERKS[k].type === 'pos');
    const rare = ids.filter(k => TD.PERKS[k].type === 'rare');
    const neg = ids.filter(k => TD.PERKS[k].type === 'neg');
    const out = [];
    const ok = k => !out.includes(k) && !out.some(o => (TD.PERKS[o].excl || []).includes(k) || (TD.PERKS[k].excl || []).includes(o));
    const add = list => { for (let i = 0; i < 12; i++) { const k = rng.pick(list); if (ok(k)) { out.push(k); return; } } };
    const r = rng();
    const nPos = r < 0.42 - boost ? 0 : r < 0.84 - boost / 2 ? 1 : 2;
    for (let i = 0; i < nPos; i++) add(rng.chance(0.15 + boost / 2) ? rare : pos);
    if (rng.chance(0.4)) add(neg);
    return out;
  };

  TD.createGoblin = function (rng, opts) {
    opts = opts || {};
    const base = {
      sta: rng.int(2, 6) + (opts.staBonus || 0),
      str: rng.int(2, 5),
      spd: rng.int(7, 13),
      acc: rng.int(3, 12),
    };
    Object.assign(base, opts.stats || {});
    const perks = opts.perks || TD.rollPerks(rng, opts.perkBoost || 0);
    const st = Object.assign({}, base);
    if (perks.includes('brute')) st.str += 3;
    if (perks.includes('swift')) st.spd += 3;
    if (perks.includes('lame')) st.spd -= 3;
    if (perks.includes('sturdy')) st.sta += 3;
    if (perks.includes('frail')) st.sta -= 3;
    for (const k in st) st[k] = Math.max(1, Math.min(20, st[k]));
    let tech = 3;
    perks.forEach(p => { tech += TD.PERK_TECH[TD.PERKS[p].type]; });
    st.tech = tech;
    const hpMax = TD.F.enemyHp(st.sta);
    const e = {
      id: nextId++,
      name: opts.name || rng.pick(TD.GOBLIN_FIRST) + ' ' + rng.pick(TD.GOBLIN_LAST),
      kind: 'Гоблин',
      base, stats: st, perks,
      hpMax, hp: hpMax,
      size: perks.includes('slippery') ? 0.8 : perks.includes('glutton') ? 1.2 : 1,
      dist: 0, x: 0, y: 0, dx: 1, dy: 0, view: 'side', flip: true, bob: 0,
      alive: true, stubbornUsed: false, haste: 0, age: 0,
      hitsTaken: 0, dmgTaken: 0, hitFlash: 0,
    };
    e.reward = 2 + Math.round(hpMax / 40);
    return e;
  };

  function speedMult(e) {
    let m = 1;
    if (e.haste > 0) m *= 1.5;
    if (e.perks.includes('coward') && e.hp < e.hpMax / 2) m *= 0.7;
    return m;
  }
  TD.enemySpeedPx = e => TD.F.enemySpeed(e.stats.spd) * T() * speedMult(e);

  function placeEnemy(e) {
    const p = TD.routeAt(e.route, e.dist);
    e.x = p.x; e.y = p.y; e.dx = p.dx; e.dy = p.dy;
    if (Math.abs(p.dx) > Math.abs(p.dy)) { e.view = 'side'; e.flip = p.dx > 0; }
    else { e.view = p.dy > 0 ? 'front' : 'back'; e.flip = false; }
    e.bob = Math.abs(Math.sin(e.dist / T() * Math.PI * 1.6)) * 2.5 * e.size;
  }
  TD.placeEnemy = placeEnemy;

  // Центр спрайта врага через t секунд (по маршруту, при текущей скорости).
  TD.predictCenter = function (e, t) {
    const p = TD.routeAt(e.route, e.dist + TD.enemySpeedPx(e) * t);
    return { x: p.x, y: p.y - 10 * e.size - e.bob };
  };

  // ---------------- Игра ----------------
  TD.Game = function (seed, opts) {
    opts = opts || {};
    this.seed = seed;
    this.rng = opts.rng || TD.makeRng((seed ^ 0x9e3779b9) >>> 0);
    this.map = opts.map || TD.generateMap(seed);
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
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
    let t = this.time + 0.4;
    for (let i = 0; i < w.count; i++) {
      this.spawnQueue.push({ at: t, path: i % this.map.paths.length, w });
      t += w.gap * (0.8 + this.rng() * 0.4);
    }
    this.phase = 'wave';
    this.countdown = 0;
    this.emit({ type: 'wave', n: this.wave });
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
    const rho = tower.act.dev * Math.sqrt(this.rng());
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
    if (fire && e.perks.includes('fireproof')) dmg *= 0.25;
    if (fire && e.perks.includes('flammable')) dmg *= 1.5;
    if (e.perks.includes('thickhide')) dmg = Math.max(dmg * 0.3, dmg - 1.5);
    dmg = Math.round(dmg * 10) / 10;
    e.hitsTaken++;
    e.hitFlash = 0.12;
    if (e.hp - dmg <= 0 && e.perks.includes('stubborn') && !e.stubbornUsed) {
      e.stubbornUsed = true;
      const dealt = e.hp - 1;
      e.hp = 1; e.haste = 2;
      e.dmgTaken += dealt;
      if (tower) tower.dmgDealt += dealt;
      this.emit({ type: 'stubborn', e });
      return dealt;
    }
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
    }
    return dealt;
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
      const e = TD.createGoblin(this.rng, { staBonus: s.w.staBonus, perkBoost: s.w.perkBoost });
      this.spawnEnemy(e, s.path);
    }
    // Движение врагов
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.age += dt;
      e.haste = Math.max(0, e.haste - dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.perks.includes('regen')) e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.015 * dt);
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
    for (const t of this.towers) this.updateTower(t, dt);
    for (const p of this.projectiles) if (!p.done) this.updateProjectile(p, dt);
    this.projectiles = this.projectiles.filter(p => !p.done);
    this.enemies = this.enemies.filter(e => e.alive);

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
