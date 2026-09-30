// Запуск: игровой цикл, масштабирование поля, мышь и клавиатура.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const $ = id => document.getElementById(id);
  const UI = TD.UI;
  const field = $('field');
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
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

  TD.newGame = function (seed) {
    if (seed === undefined) seed = (Math.random() * 1e9) | 0;
    game = new TD.Game(seed, { rng: TD.makeRng((Math.random() * 1e9) | 0) });
    UI.game = game;
    UI.selectPlacing(null);
    UI.selectTower(null);
    UI.closeEnemy();
    UI.clearRoster();
    UI.resetHud();
    TD.fx.length = 0;
    UI.bg = TD.renderBackground(game.map, Math.min(3, view.scale * view.dpr * 1.1));
    const n = game.map.paths.length;
    const merges = game.map.paths.filter(p => p.mergeInto >= 0).length;
    $('seedLbl').textContent = `Карта #${seed} · дорожек: ${n}${merges ? ` · слияний: ${merges}` : ''}`;
    UI.banner('Уровень 1', `${n === 1 ? 'Одна тропа' : n === 2 ? 'Две тропы' : 'Три тропы'} ведут к замку. Стройте вышки и жмите «В бой!»`, 3200);
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
    if (!UI.placing) {
      const e = enemyAt(w);
      const t = game.towerAt(w.tx, w.ty);
      cv.style.cursor = e || t ? 'pointer' : 'default';
    }
  });
  cv.addEventListener('mouseleave', () => { UI.hover = null; });
  cv.addEventListener('contextmenu', ev => { ev.preventDefault(); UI.selectPlacing(null); UI.selectTower(null); });

  function enemyAt(w) {
    let best = null;
    for (const e of game.enemies) if (TD.hitTest(e, w.x, w.y, 3)) best = e;
    return best;
  }

  cv.addEventListener('click', ev => {
    const w = toWorld(ev);
    if (!w.inside) return;
    if (UI.placing) {
      const def = UI.placing;
      if (game.gold < def.price) { UI.banner('Не хватает золота', `${def.name} стоит ${def.price}`, 1400); return; }
      if (!game.canBuild(w.tx, w.ty)) return;
      game.addTower(def, w.tx, w.ty);
      // Shift — продолжить ставить такие же вышки.
      if (!ev.shiftKey || game.gold < def.price) UI.selectPlacing(null);
      return;
    }
    const e = enemyAt(w);
    if (e) { UI.openEnemy(e); return; }
    const t = game.towerAt(w.tx, w.ty);
    UI.selectTower(t || null, view);
  });

  $('shopTab').addEventListener('click', () => { UI.toggleShop(); resize(); });
  $('waveBtn').addEventListener('click', () => { game.startWave(); });
  $('newMapBtn').addEventListener('click', () => TD.newGame());
  $('enemyModal').addEventListener('click', ev => { if (ev.target.hasAttribute('data-close')) UI.closeEnemy(); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));

  let prevSpeed = 1;
  function setSpeed(s) {
    if (s > 0) prevSpeed = s;
    speed = s;
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  }

  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (UI.enemyOpen()) UI.closeEnemy();
      else { UI.selectPlacing(null); UI.selectTower(null); }
    } else if (ev.key === ' ') {
      ev.preventDefault();
      setSpeed(speed === 0 ? prevSpeed : 0);
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      UI.toggleShop();
      resize();
    } else if (/^[1-4]$/.test(ev.key)) {
      const def = TD.TOWERS[+ev.key - 1];
      UI.selectPlacing(UI.placing === def ? null : def);
    }
  });

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game) {
      const sp = UI.enemyOpen() ? 0 : speed;
      acc += dt * sp;
      let steps = 0;
      while (acc >= TD.DT && steps < 12) { game.update(TD.DT); acc -= TD.DT; steps++; }
      if (steps >= 12) acc = 0;
      TD.consumeEvents(game, UI);
      UI.castleHitT = Math.max(0, UI.castleHitT - dt);
      TD.renderFrame(ctx, game, view, UI, sp ? dt * sp : 0);
      uiTimer -= dt;
      if (uiTimer <= 0) {
        uiTimer = 0.12;
        UI.updateHud(game);
        UI.updateRoster(game);
        UI.tickCard();
        UI.tickTowerPop();
        if (UI.selectedTower && !game.towers.includes(UI.selectedTower)) UI.selectTower(null);
      }
      if (game.phase !== game._shownPhase) {
        const prev = game._shownPhase;
        game._shownPhase = game.phase;
        if (game.phase === 'wave') UI.banner(`Волна ${game.wave}`, `${TD.waveDef(game.wave).count} гоблинов на подходе`, 1800);
        else if (game.phase === 'build' && prev === 'wave') UI.banner(`Волна ${game.wave} отбита!`, `+${TD.waveDef(game.wave).reward} золота · следующая через 20 с`, 2200);
        else if (game.phase === 'won') setTimeout(() => UI.showEnd(game, true), 900);
        else if (game.phase === 'lost') setTimeout(() => UI.showEnd(game, false), 900);
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  UI.buildShop();
  TD.loadSprites().then(() => {
    resize();
    const q = new URLSearchParams(location.search).get('seed');
    TD.newGame(q !== null ? +q : undefined);
    resize();
    requestAnimationFrame(frame);
  });
})();
