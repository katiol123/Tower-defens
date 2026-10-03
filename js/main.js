// Запуск: игровой цикл, масштабирование поля, мышь и клавиатура.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const $ = id => document.getElementById(id);
  const UI = TD.UI;
  const field = $('field');
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  TD.VIEW = view;   // для отладки и скриншотов: мировые координаты → экранные
  let game = null;
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let uiTimer = 0;

  function resize() {
    const r = field.getBoundingClientRect();
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * view.dpr);
    cv.height = Math.round(r.height * view.dpr);
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    const pad = 14;
    // Открытый магазин не перекрывает поле: карта ужимается влево.
    const shopW = $('shop').classList.contains('closed') ? 56 : 364;
    const availW = r.width - shopW;
    view.scale = Math.min((availW - pad * 2) / TD.W, (r.height - pad * 2) / TD.H);
    view.ox = (availW - TD.W * view.scale) / 2;
    view.oy = (r.height - TD.H * view.scale) / 2;
    if (game) UI.bg = TD.renderBackground(game.map, Math.min(3, view.scale * view.dpr * 1.1));
    UI.positionTowerPop(view);
  }

  TD.newGame = function (seed, level) {
    if (seed === undefined) seed = (Math.random() * 1e9) | 0;
    UI.level = level || UI.level || 1;
    // Купленные за звёзды открытия и улучшения — с начала боя.
    TD.Progress.apply();
    UI.buildShop();
    UI.buildSpells();
    game = new TD.Game(seed, { rng: TD.makeRng((Math.random() * 1e9) | 0), level: UI.level });
    const L = TD.LEVELS[UI.level];
    $('brandSub').textContent = L.sub;
    $('brandName').textContent = L.name;
    document.title = L.name;
    UI.game = game;
    UI.selectPlacing(null);
    UI.selectTower(null);
    UI.selectSpell(null, true);
    UI.closeEnemy();
    UI.clearRoster();
    UI.resetHud();
    TD.fx.length = 0;
    UI.bg = TD.renderBackground(game.map, Math.min(3, view.scale * view.dpr * 1.1));
    const n = game.map.paths.length;
    const merges = game.map.paths.filter(p => p.mergeInto >= 0).length;
    $('seedLbl').textContent = `Карта #${seed} · дорожек: ${n}${merges ? ` · слияний: ${merges}` : ''}`;
    UI.banner(`Уровень ${UI.level} · ${L.name}`, `${n === 1 ? 'Одна тропа' : n === 2 ? 'Две тропы' : 'Три тропы'} ведут к замку.${game.crystals.length ? ` У дорог ${game.crystals.length} тёмных кристаллов — они усиливают врагов.` : ""} Стройте вышки и жмите «В бой!»`, 3600);
    UI.updateHud(game);
  };

  function toWorld(ev) {
    const r = cv.getBoundingClientRect();
    const x = (ev.clientX - r.left - view.ox) / view.scale;
    const y = (ev.clientY - r.top - view.oy) / view.scale;
    return { x, y, tx: Math.floor(x / TD.TILE), ty: Math.floor(y / TD.TILE), inside: x >= 0 && y >= 0 && x < TD.W && y < TD.H };
  }

  cv.addEventListener('mousemove', ev => {
    const w = toWorld(ev);
    UI.hover = w.inside ? w : null;
    if ((UI.placing || UI.casting) && w.inside) cv.style.cursor = 'none';   // вместо курсора рисуется вышка или иконка заклинания
    else if (UI.placing || UI.casting) cv.style.cursor = 'default';
    else {
      const e = enemyAt(w);
      const t = game.towerAt(w.tx, w.ty);
      cv.style.cursor = e || t || crystalAt(w) ? 'pointer' : 'default';
    }
  });
  cv.addEventListener('mouseleave', () => { UI.hover = null; });
  cv.addEventListener('contextmenu', ev => { ev.preventDefault(); UI.selectPlacing(null); UI.selectTower(null); UI.selectSpell(null, true); });

  function enemyAt(w) {
    let best = null;
    for (const e of game.enemies) if (TD.hitTest(e, w.x, w.y, 3)) best = e;
    return best;
  }

  const crystalAt = w => game.crystals.find(c => c.alive && TD.hitTest(c, w.x, w.y, 6));

  cv.addEventListener('click', ev => {
    const w = toWorld(ev);
    if (!w.inside) return;
    if (UI.casting) {
      const id = UI.casting;
      if (game.castSpell(id, w.x, w.y)) UI.selectSpell(null, true);
      else { TD.Sound.play('deny'); if (id === 'chain') UI.banner('Нет цели', 'Кликните по врагу или рядом с ним', 1200); }
      return;
    }
    if (UI.placing) {
      const def = UI.placing;
      if (game.gold < def.price) { TD.Sound.play('deny'); UI.banner('Не хватает золота', `${def.name} стоит ${def.price}`, 1400); return; }
      if (!game.canBuild(w.tx, w.ty)) { TD.Sound.play('deny'); return; }
      game.addTower(def, w.tx, w.ty);
      // Shift — продолжить ставить такие же вышки.
      if (!ev.shiftKey || game.gold < def.price) UI.selectPlacing(null);
      return;
    }
    const e = enemyAt(w);
    if (e) { TD.Sound.play('click'); UI.openEnemy(e); return; }
    const c = crystalAt(w);
    if (c) {
      TD.Sound.play('click');
      UI.banner(`💎 Тёмный кристалл · ${Math.ceil(c.hp)} / ${c.hpMax}`, `Враги в радиусе ${String(TD.F.range(TD.CRYSTAL.range)).replace('.', ',')} клетки: +${TD.CRYSTAL.bonus} к выносливости, силе и скорости. Вышки стреляют по нему наравне с врагами.`, 2600);
      return;
    }
    const t = game.towerAt(w.tx, w.ty);
    if (t) TD.Sound.play('click');
    UI.selectTower(t || null, view);
  });

  $('shopTab').addEventListener('click', () => { TD.Sound.play('whoosh'); UI.toggleShop(); resize(); });
  const soundBtn = $('soundBtn');
  const syncSound = () => { soundBtn.textContent = TD.Sound.isMuted() ? '🔇' : '🔊'; soundBtn.classList.toggle('off', TD.Sound.isMuted()); };
  soundBtn.addEventListener('click', () => { TD.Sound.toggle(); syncSound(); });
  syncSound();
  $('waveBtn').addEventListener('click', () => { game.startWave(); });
  $('nwBtn').addEventListener('click', () => { game.startWave(); });
  $('newMapBtn').addEventListener('click', () => TD.newGame());
  // Карта похода: во время боя можно вернуться к нему, после конца уровня — нет.
  $('levelsBtn').addEventListener('click', () => {
    TD.Sound.play('click');
    TD.World.open({ select: UI.level, canReturn: game && game.phase !== 'won' && game.phase !== 'lost' });
  });
  $('enemyModal').addEventListener('click', ev => { if (ev.target.hasAttribute('data-close')) UI.closeEnemy(); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));

  let prevSpeed = 1;
  function setSpeed(s) {
    if (s > 0) prevSpeed = s;
    speed = s;
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }

  window.addEventListener('keydown', ev => {
    const spellKey = { q: 'meteor', й: 'meteor', w: 'frost', ц: 'frost', e: 'chain', у: 'chain', r: 'masonry', к: 'masonry' }[ev.key.toLowerCase()];
    // На карте похода игровые клавиши не работают; Esc закрывает карточку врага или возвращает к бою.
    if (TD.World.isOpen()) {
      if (ev.key === 'Escape') { if (UI.enemyOpen()) UI.closeEnemy(); else if (TD.World.shopOpen()) TD.World.closeShop(); else if (!$('wmBack').hidden) TD.World.close(); }
      if (ev.key === 'Tab' || ev.key === ' ') ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      if (UI.enemyOpen()) UI.closeEnemy();
      else { UI.selectPlacing(null); UI.selectTower(null); UI.selectSpell(null, true); }
    } else if (spellKey && !UI.enemyOpen()) {
      UI.selectSpell(spellKey);
    } else if (ev.key === ' ') {
      ev.preventDefault();
      setSpeed(speed === 0 ? prevSpeed : 0);
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      TD.Sound.play('whoosh');
      UI.toggleShop();
      resize();
    } else if (ev.key === 'm' || ev.key === 'M' || ev.key === 'ь' || ev.key === 'Ь') {
      TD.Sound.toggle(); syncSound();
    } else if (/^[1-7]$/.test(ev.key)) {
      const def = TD.TOWERS[+ev.key - 1];
      if (def.locked) { TD.Sound.play('deny'); UI.banner('Вышка закрыта', `«${def.name}» открывается на карте похода за ${TD.UNLOCK_COST} ★`, 1600); return; }
      UI.selectPlacing(UI.placing === def ? null : def);
    }
  });

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game) {
      const sp = UI.enemyOpen() || TD.World.isOpen() ? 0 : speed;
      acc += dt * sp;
      let steps = 0;
      while (acc >= TD.DT && steps < 12) { game.update(TD.DT); acc -= TD.DT; steps++; }
      if (steps >= 12) acc = 0;
      TD.Sound.handleEvents(game, sp);
      UI.handleEvents(game);
      TD.consumeEvents(game, UI);
      UI.castleHitT = Math.max(0, UI.castleHitT - dt);
      TD.renderFrame(ctx, game, view, UI, sp ? dt * sp : 0);
      uiTimer -= dt;
      if (uiTimer <= 0) {
        uiTimer = 0.12;
        UI.updateHud(game);
        UI.updateRoster(game);
        UI.updateBossBar(game);
        UI.tickCard();
        UI.tickTowerPop();
        if (UI.selectedTower && !game.towers.includes(UI.selectedTower)) UI.selectTower(null);
      }
      if (game.phase !== game._shownPhase) {
        game._shownPhase = game.phase;
        if (game.phase === 'won') setTimeout(() => UI.showEnd(game, true), 900);
        else if (game.phase === 'lost') setTimeout(() => UI.showEnd(game, false), 900);
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  UI.buildShop();
  UI.buildSpells();
  TD.loadSprites().then(() => {
    resize();
    const qs = new URLSearchParams(location.search);
    const q = qs.get('seed'), lv = +qs.get('level');
    TD.newGame(q !== null ? +q : undefined, lv || 1);
    resize();
    // В начале игры — карта похода (?level=N — сразу нужный уровень).
    TD.World.init();
    if (!lv) TD.World.open();
    requestAnimationFrame(frame);
  });
})();
