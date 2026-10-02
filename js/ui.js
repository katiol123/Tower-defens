// DOM-интерфейс: магазин, список врагов, карта врага, панель вышки, HUD, баннеры.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const $ = id => document.getElementById(id);
  const fmt = (v, d) => (d ? v.toFixed(d) : String(Math.round(v))).replace('.', ',');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const UI = TD.UI = {
    placing: null, hover: null, selectedTower: null, selectedEnemy: null, castleHitT: 0,
    foes: new Map(), bg: null,
  };

  // ---------------- Магазин ----------------
  UI.buildShop = function () {
    const list = $('shopList');
    list.innerHTML = '';
    TD.TOWERS.forEach((def, i) => {
      const a = TD.towerActual(def);
      const s = def.stats;
      const card = document.createElement('button');
      card.className = 'tcard';
      card.dataset.id = def.id;
      card.style.setProperty('--tc', def.color);
      const row = (label, v, sub, pct, burst) =>
        `<div class="ts"><span class="ts-l">${label}</span><div class="ts-bar${burst ? ' burst' : ''}"><i style="width:${pct}%"></i></div><b>${v}<small>${sub}</small></b></div>`;
      card.innerHTML = `
        <div class="tc-top">
          <canvas class="tc-ico" width="116" height="116"></canvas>
          <div>
            <div class="tc-name">${esc(def.name)}</div>
            <div class="tc-sub">${esc(def.title)}</div>
            <div class="tprice"><span class="coin"></span>${def.price}</div>
          </div>
          <span class="tc-key">${i + 1}</span>
        </div>
        <div class="tc-stats">
          ${row('Урон', s.dmg, fmt(a.dmg, 1), s.dmg * 5)}
          ${def.burst
            ? row('Скорость стрельбы', 'очередь', `${def.burst.shots}× / ${fmt(def.burst.shots * def.burst.gap + def.burst.reload, 1)} с`, 100, true)
            : row('Скорость стрельбы', s.rate, def.flame ? fmt(a.rate, 0) + ' сгуст./с' : fmt(a.rate, 1) + '/с', s.rate * 5)}
          ${row('Точность', s.acc, '±' + fmt(a.dev, 0) + ' px', s.acc * 5)}
          ${row('Дальность', s.range, fmt(a.range, 1) + ' кл', s.range * 5)}
        </div>
        ${def.perk ? `<div class="tc-perk"><span class="tc-perk-ico">${def.perk.icon}</span><div><b>${esc(def.perk.name)}.</b> ${esc(def.perk.desc)}</div></div>` : `<div class="tc-perk"><span class="tc-perk-ico">◎</span><div><b>Без перка.</b> Бьёт через всё поле и почти не мажет.</div></div>`}
      `;
      const cv = card.querySelector('canvas');
      const cx = cv.getContext('2d');
      cx.scale(2, 2);
      cx.translate(29, 33);
      TD.drawTower(cx, def, { angle: -Math.PI / 5 });
      card.addEventListener('click', () => { TD.Sound.play('click'); UI.selectPlacing(UI.placing === def ? null : def); });
      list.appendChild(card);
    });
  };

  UI.selectPlacing = function (def) {
    UI.placing = def;
    if (def) UI.selectTower(null);
    document.querySelectorAll('.tcard').forEach(c => c.classList.toggle('active', !!def && c.dataset.id === def.id));
    $('field').classList.toggle('placing', !!def);
  };

  UI.toggleShop = function (open) {
    const shop = $('shop');
    const willOpen = open === undefined ? shop.classList.contains('closed') : open;
    shop.classList.toggle('closed', !willOpen);
  };

  // ---------------- HUD ----------------
  let lastGold = -1, lastHp = -1;
  UI.updateHud = function (game) {
    if (game.gold !== lastGold) {
      if (lastGold >= 0 && game.gold > lastGold) { const g = document.querySelector('.gold-stat'); g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop'); }
      lastGold = game.gold;
      $('goldVal').textContent = game.gold;
      document.querySelectorAll('.tcard').forEach(c => {
        const def = TD.TOWERS.find(d => d.id === c.dataset.id);
        c.classList.toggle('poor', game.gold < def.price);
      });
    }
    if (game.castleHp !== lastHp) {
      if (lastHp >= 0 && game.castleHp < lastHp) { const s = document.querySelector('.castle-stat'); s.classList.remove('hit'); void s.offsetWidth; s.classList.add('hit'); }
      lastHp = game.castleHp;
      $('castleFill').style.width = (game.castleHp / TD.CASTLE_HP * 100) + '%';
      $('castleVal').textContent = `${game.castleHp} / ${TD.CASTLE_HP}`;
    }
    $('waveVal').textContent = `${game.wave} / ${TD.WAVES}`;
    const btn = $('waveBtn');
    const busy = game.phase === 'wave';
    btn.disabled = busy || game.phase === 'won' || game.phase === 'lost';
    btn.classList.toggle('pulse', game.phase === 'build');
    $('waveHint').textContent = busy ? `Волна ${game.wave} идёт…`
      : game.phase === 'build' ? (game.countdown > 0 ? `Волна ${game.wave + 1} через ${Math.ceil(game.countdown)} с` : `Волна ${game.wave + 1}`)
      : '—';
  };
  UI.resetHud = function () { lastGold = -1; lastHp = -1; };

  // ---------------- Баннер ----------------
  let bannerTimer = 0;
  UI.banner = function (title, sub, ms) {
    const b = $('banner');
    b.innerHTML = `<h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}`;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), ms || 2200);
  };

  // ---------------- Враги на поле ----------------
  UI.updateRoster = function (game) {
    const list = $('rosterList');
    const alive = new Set();
    for (const e of game.enemies) {
      alive.add(e.id);
      let el = UI.foes.get(e.id);
      if (!el) {
        el = document.createElement('button');
        el.className = 'foe';
        const col = TD.PATH_COLORS[e.pathId];
        el.innerHTML = `
          <div class="foe-ava"><span class="foe-path" style="color:${col}"></span><img src="assets/${e.sprite}_front.png" alt=""></div>
          <div class="foe-info">
            <div class="foe-name">${esc(e.name)}</div>
            <div class="foe-meta"><span class="foe-tech">✦ ${e.stats.tech}</span><span class="foe-perks">${e.perks.map(p => TD.PERKS[p].icon).join('')}</span></div>
            <div class="foe-hp"><i></i></div>
          </div>`;
        el.addEventListener('click', () => UI.openEnemy(e));
        list.appendChild(el);
        UI.foes.set(e.id, el);
      }
      el.querySelector('.foe-hp i').style.width = (e.hp / e.hpMax * 100) + '%';
      el.classList.toggle('sel', UI.selectedEnemy === e.id);
    }
    for (const [id, el] of UI.foes) {
      if (!alive.has(id) && !el.classList.contains('dead')) {
        el.classList.add('dead');
        setTimeout(() => { el.remove(); UI.foes.delete(id); }, 320);
      }
    }
    $('rosterCount').textContent = game.enemies.length;
    $('rosterEmpty').hidden = game.enemies.length > 0;
  };
  UI.clearRoster = function () { $('rosterList').innerHTML = ''; UI.foes.clear(); };

  // ---------------- Карта врага ----------------
  let cardEnemy = null;
  UI.openEnemy = function (e) {
    cardEnemy = e;
    UI.selectedEnemy = e.id;
    renderCard(true);
    $('enemyModal').hidden = false;
  };
  UI.closeEnemy = function () {
    $('enemyModal').hidden = true;
    cardEnemy = null;
    UI.selectedEnemy = null;
  };
  UI.enemyOpen = () => !$('enemyModal').hidden;

  const STAT_COLORS = { sta: '#ff7a64', str: '#ffb454', spd: '#7ad1ff', tech: '#ffd24a' };

  function renderCard(full) {
    const e = cardEnemy;
    if (!e) return;
    const card = $('ecard');
    const dead = !e.alive;
    if (full) {
      const st = e.stats, base = e.base;
      const statRow = (k, extra) => {
        const info = TD.ENEMY_STAT_INFO[k];
        const v = st[k], b = k === 'tech' ? v : base[k];
        const diff = v - b;
        const maxV = 20;
        const barW = Math.max(0, Math.min(v, maxV)) / maxV * 100;
        let em = '';
        if (diff > 0) em = `<em style="left:${b / maxV * 100}%;width:${diff / maxV * 100}%"></em>`;
        if (diff < 0) em = `<em class="minus" style="left:${v / maxV * 100}%;width:${-diff / maxV * 100}%"></em>`;
        return `<div class="es" style="--c:${STAT_COLORS[k]}" title="${esc(info.hint)}">
          <div class="es-ico">${info.icon}</div>
          <div class="es-name">${info.name}<small>${extra || ''}</small></div>
          <div class="es-val">${v}${diff ? `<small>(${b}${diff > 0 ? '+' : '−'}${Math.abs(diff)})</small>` : ''}</div>
          <div class="es-bar"><i style="width:${barW}%"></i>${em}</div>
        </div>`;
      };
      const perksHtml = e.perks.length ? e.perks.map(id => {
        const p = TD.PERKS[id];
        const tech = TD.PERK_TECH[p.type];
        return `<div class="perk ${p.type}">
          <div class="perk-ico">${p.icon}</div>
          <div class="perk-top"><span class="perk-name">${esc(p.name)}</span><span class="perk-type">${TD.PERK_TYPE_LABEL[p.type]} · ${tech > 0 ? '+' : '−'}${Math.abs(tech)} ✦</span></div>
          <div class="perk-desc">${esc(p.desc)}</div>
        </div>`;
      }).join('') : '<div class="perk-none">Перков нет — самый обычный гоблин.</div>';
      const spd = TD.F.enemySpeed(st.spd);
      const sizeCls = e.size < 1 ? 'slip' : e.size > 1 ? 'fat' : '';
      card.innerHTML = `
        <div class="ec-left">
          <div class="ec-portrait ${sizeCls}"><div class="ec-shadow"></div><img src="assets/${e.sprite}_front.png" alt=""></div>
          <div class="ec-stamp" hidden>ПОВЕРЖЕН</div>
          <div class="ec-kind">${esc(e.kind)} · тропа ${e.pathId + 1}</div>
          <div class="ec-name">${esc(e.name)}</div>
          <div class="ec-hp"><i></i><b></b></div>
          <div class="ec-mini">
            <div><b>${st.str}</b>урон замку</div>
            <div><b>${fmt(spd, 2)}</b>клеток/с</div>
            <div><b class="ec-reward">${e.reward}</b>награда</div>
          </div>
        </div>
        <div class="ec-right">
          <button class="ec-close" data-close title="Закрыть (Esc)">✕</button>
          <h3 class="ec-h">Характеристики</h3>
          <div class="ec-stats">
            ${statRow('sta', `→ ${e.hpMax} здоровья`)}
            ${statRow('str', `→ ${st.str} урона замку`)}
            ${statRow('spd', `→ ${fmt(spd, 2)} кл/с`)}
            ${statRow('tech', `перков: ${e.perks.length}`)}
          </div>
          <h3 class="ec-h">Перки</h3>
          <div class="ec-perks">${perksHtml}</div>
        </div>`;
      card.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', UI.closeEnemy));
    }
    card.classList.toggle('ec-dead', dead);
    card.querySelector('.ec-stamp').hidden = !(dead && !e.leaked);
    if (dead && e.leaked) { const s = card.querySelector('.ec-stamp'); s.hidden = false; s.textContent = 'ПРОРВАЛСЯ'; }
    card.querySelector('.ec-hp i').style.width = (e.hp / e.hpMax * 100) + '%';
    card.querySelector('.ec-hp b').textContent = `${fmt(Math.ceil(e.hp))} / ${e.hpMax}`;
  }
  UI.tickCard = function () { if (cardEnemy) renderCard(false); };

  // ---------------- Панель вышки ----------------
  UI.selectTower = function (t, view) {
    UI.selectedTower = t;
    const pop = $('towerPop');
    if (!t) { pop.hidden = true; return; }
    UI.selectPlacing(null);
    pop.hidden = false;
    UI.renderTowerPop(view);
  };
  UI.renderTowerPop = function (view) {
    const t = UI.selectedTower;
    if (!t) return;
    const pop = $('towerPop');
    const a = t.act, s = t.def.stats;
    const hitPct = t.shots ? Math.round(t.hits / t.shots * 100) + '%' : '—';
    const refund = Math.floor(t.spent * TD.SELL_RATE);
    pop.innerHTML = `
      <div class="tp-head"><span class="tp-name">${esc(t.def.name)}</span><button class="tp-x" title="Закрыть">✕</button></div>
      <div class="tp-sub">${esc(t.def.title)}${t.def.perk ? ' · ' + t.def.perk.icon + ' ' + esc(t.def.perk.name) : ''}</div>
      <div class="tp-grid">
        <span>Урон ${s.dmg}</span><b>${fmt(a.dmg, 1)}</b>
        <span>Скорострельность ${t.def.burst ? 'очередь' : s.rate}</span><b>${t.def.burst ? `${t.def.burst.shots}× / ${fmt(t.def.burst.reload, 1)} с` : fmt(a.rate, t.def.flame ? 0 : 2) + (t.def.flame ? ' сгуст./с' : '/с')}</b>
        <span>Точность ${s.acc}</span><b>±${fmt(a.dev, 0)} px</b>
        <span>Дальность ${s.range}</span><b>${fmt(a.range, 1)} кл</b>
      </div>
      <div class="tp-sep"></div>
      <div class="tp-grid">
        <span>Выстрелов</span><b class="tp-shots">${t.shots}</b>
        <span>Попаданий</span><b class="tp-hits">${t.hits} (${hitPct})</b>
        <span>Нанесено урона</span><b class="tp-dmg">${fmt(t.dmgDealt)}</b>
        <span>Убито</span><b class="tp-kills">${t.kills}</b>
      </div>
      <button class="tp-sell">Продать за ${refund} <span class="coin" style="display:inline-block;width:12px;height:12px;vertical-align:-1px"></span></button>`;
    pop.querySelector('.tp-x').onclick = () => UI.selectTower(null);
    pop.querySelector('.tp-sell').onclick = () => { UI.game.sellTower(t); UI.selectTower(null); };
    if (view) UI.positionTowerPop(view);
  };
  UI.positionTowerPop = function (view) {
    const t = UI.selectedTower;
    if (!t) return;
    const pop = $('towerPop');
    const fx = view.ox + t.cx * view.scale, fy = view.oy + t.cy * view.scale;
    const field = $('field').getBoundingClientRect();
    let x = fx + 34, y = fy - 90;
    if (x + 260 > field.width - (document.getElementById('shop').classList.contains('closed') ? 10 : 340)) x = fx - 34 - 250;
    y = Math.max(10, Math.min(field.height - pop.offsetHeight - 10, y));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  };
  UI.tickTowerPop = function () {
    const t = UI.selectedTower;
    if (!t) return;
    const pop = $('towerPop');
    const q = s => pop.querySelector(s);
    if (!q('.tp-shots')) return;
    q('.tp-shots').textContent = t.shots;
    q('.tp-hits').textContent = `${t.hits} (${t.shots ? Math.round(t.hits / t.shots * 100) + '%' : '—'})`;
    q('.tp-dmg').textContent = fmt(t.dmgDealt);
    q('.tp-kills').textContent = t.kills;
  };

  // ---------------- Конец игры ----------------
  UI.showEnd = function (game, won) {
    const m = $('endModal');
    const c = $('endcard');
    c.className = 'endcard ' + (won ? 'win' : 'lose');
    c.innerHTML = `
      <h2>${won ? 'Крепость устояла!' : 'Замок пал'}</h2>
      <p>${won ? `Все ${TD.WAVES} волн отбиты. Прочность замка: ${game.castleHp} / ${TD.CASTLE_HP}.` : `Гоблины прорвались на волне ${game.wave}.`}<br>
      Повержено врагов: ${game.stats.kills}, прорвалось: ${game.stats.leaked}.</p>
      <div class="row"><button id="againBtn">↺ Эта же карта</button><button id="newBtn2">⟳ Новая карта</button></div>`;
    m.hidden = false;
    $('againBtn').onclick = () => { m.hidden = true; TD.newGame(game.seed); };
    $('newBtn2').onclick = () => { m.hidden = true; TD.newGame(); };
  };
})();
