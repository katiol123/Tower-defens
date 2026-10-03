// DOM-интерфейс: магазин, список врагов, карта врага, панель вышки, HUD, баннеры.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const $ = id => document.getElementById(id);
  const fmt = (v, d) => (d ? v.toFixed(d) : String(Math.round(v))).replace('.', ',');
  // Число до сотых без лишних нулей: 3,25 / 29,65 / 9
  const num = v => String(Math.round(v * 100) / 100).replace('.', ',');
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
        `<div class="ts"><span class="ts-l">${label}</span><div class="ts-bar${burst ? ' burst' : ''}"><i style="width:${pct}%"></i></div><b class="ts-v">${v}</b><small class="ts-a">${sub}</small></div>`;
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
          ${def.aura ? row('Урон', '—', 'не стреляет', 0) : row('Урон', s.dmg, `${num(a.dmg)} (${TD.DMG_TYPE_LABEL[def.dmgType]})`, s.dmg * 5)}
          ${def.aura ? row('Скорость стрельбы', '—', 'не стреляет', 0)
            : def.burst
            ? row('Скорость стрельбы', 'очередь', `${def.burst.shots}× / ${fmt(def.burst.shots * def.burst.gap + def.burst.reload, 1)} с`, 100, true)
            : row('Скорость стрельбы', s.rate, def.flame ? fmt(a.rate, 0) + ' сгуст./с' : fmt(a.rate, 1) + '/с', s.rate * 5)}
          ${def.aura ? row('Точность', '—', 'не стреляет', 0) : s.acc === null ? row('Точность', '∞', def.accLabel, 100) : row('Точность', s.acc, '±' + fmt(a.dev, 0) + ' px', s.acc * 5)}
          ${row(def.aura ? 'Радиус действия' : 'Дальность', s.range, fmt(a.range, 1) + ' кл', s.range * 5)}
        </div>
        ${[def.perk, def.perk2].filter(Boolean).map(pk => `<div class="tc-perk"><span class="tc-perk-ico">${pk.icon}</span><div><b>${esc(pk.name)}.</b> ${esc(pk.desc)}</div></div>`).join('') || `<div class="tc-perk"><span class="tc-perk-ico">◎</span><div><b>Без перка.</b> Бьёт через всё поле и почти не мажет.</div></div>`}
      `;
      const cv = card.querySelector('canvas');
      const cx = cv.getContext('2d');
      cx.scale(2, 2);
      // Высокие вышки (шпиль с кристаллом, колокол под крышей) чуть уменьшаем, чтобы влезли в иконку.
      const tall = def.id === 'bell' || def.id === 'spire';
      cx.translate(29, tall ? 41 : 33);
      if (tall) cx.scale(0.8, 0.8);
      TD.drawTower(cx, def, { angle: -Math.PI / 5 });
      card.addEventListener('click', () => { TD.Sound.play('click'); UI.selectPlacing(UI.placing === def ? null : def); });
      list.appendChild(card);
    });
  };

  UI.selectPlacing = function (def) {
    UI.placing = def;
    if (def && UI.casting) UI.selectSpell(null, true);
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
    const can = game.canStartWave();
    btn.disabled = !can;
    btn.classList.toggle('pulse', game.phase === 'build');
    const cd = Math.ceil(game.countdown - 1e-9);
    $('waveHint').textContent = game.phase === 'build' ? `Волна 1`
      : game.countdown > 0 ? `Волна ${game.wave + 1} через ${cd} с · +${game.earlyBonus()} зол.`
      : game.spawnQueue.length ? `Волна ${game.wave} выходит…`
      : game.phase === 'wave' ? 'Последняя волна' : '—';
    // Мана
    $('manaFill').style.width = (game.mana / TD.MANA.max * 100) + '%';
    $('manaVal').textContent = `${Math.floor(game.mana)} / ${TD.MANA.max}`;
    // Виджет отсчёта до следующей волны
    const nw = $('nextWave');
    if (game.countdown > 0 && game.phase === 'wave') {
      nw.hidden = false;
      $('nwSec').textContent = cd;
      $('nwArc').style.strokeDashoffset = 119.4 * (1 - game.countdown / TD.NEXT_WAVE_DELAY);
      const nextDef = TD.waveDef(game.wave + 1);
      $('nwTitle').textContent = nextDef.boss ? 'Босс через' : `Волна ${game.wave + 1} через`;
      $('nwBonus').textContent = '+' + game.earlyBonus();
    } else nw.hidden = true;
    UI.updateSpells(game);
  };

  // ---------------- Заклинания ----------------
  UI.casting = null;
  UI.buildSpells = function () {
    const bar = $('spellBar');
    bar.innerHTML = '';
    TD.SPELLS.forEach(sp => {
      const b = document.createElement('button');
      b.className = 'spell';
      b.dataset.id = sp.id;
      b.innerHTML = `<span class="sp-key">${sp.key}</span><span class="sp-ico">${sp.icon}</span><span class="sp-cost">${sp.cost}</span><span class="sp-cd"></span><span class="sp-cdt"></span>`;
      b.addEventListener('click', () => UI.selectSpell(sp.id));
      b.addEventListener('mouseenter', () => {
        const tip = $('spellTip');
        tip.innerHTML = `<h4>${sp.icon} ${esc(sp.name)}</h4><div class="st-meta">✦ ${sp.cost} маны${sp.cd ? ` · перезарядка ${sp.cd} с` : ''}${sp.once ? ' · один раз за уровень' : ''} · клавиша ${sp.key}</div>${esc(sp.desc)}`;
        tip.hidden = false;
      });
      b.addEventListener('mouseleave', () => { $('spellTip').hidden = true; });
      bar.appendChild(b);
    });
  };
  UI.updateSpells = function (game) {
    document.querySelectorAll('.spell').forEach(b => {
      const sp = TD.SPELL[b.dataset.id];
      const cd = game.spellCd[sp.id] || 0;
      const used = sp.once && game.spellUsed[sp.id];
      b.style.setProperty('--cd', sp.cd && cd > 0 ? cd / sp.cd : 0);
      b.querySelector('.sp-cdt').textContent = cd > 0 ? Math.ceil(cd) : used ? '✓' : '';
      b.classList.toggle('used', !!used);
      b.classList.toggle('nomana', !used && game.mana < sp.cost);
      b.classList.toggle('ready', game.spellReady(sp.id));
      b.classList.toggle('active', UI.casting === sp.id);
    });
    if (UI.casting && !game.spellReady(UI.casting)) UI.selectSpell(null, true);
  };
  // Выбрать заклинание для прицеливания (или сотворить сразу, если цель не нужна).
  UI.selectSpell = function (id, silent) {
    const game = UI.game;
    if (id && UI.casting === id) id = null;
    if (id && !game.spellReady(id)) {
      if (!silent) { TD.Sound.play('deny'); UI.banner(TD.SPELL[id].once && game.spellUsed[id] ? 'Уже использовано' : 'Не хватает маны', TD.SPELL[id].name, 1200); }
      return;
    }
    if (id && TD.SPELL[id].target === 'none') { if (game.castSpell(id)) TD.Sound.play('click'); return; }
    UI.casting = id || null;
    if (id) { UI.selectPlacing(null); UI.selectTower(null); }
    $('field').classList.toggle('casting', !!UI.casting);
  };

  // Баннеры по событиям игры (вызывается до того, как рендер очистит очередь).
  UI.handleEvents = function (game) {
    for (const ev of game.events) {
      if (ev.type === 'wave') {
        const w = TD.waveDef(ev.n);
        const n = ch => (w.units.match(new RegExp(ch, 'g')) || []).length;
        const bossType = w.boss && w.list.find(u => TD.UNITS[u.type].boss);
        if (bossType) { const U = TD.UNITS[bossType.type]; UI.banner('Босс: ' + U.name, U.banner, 3000); }
        else UI.banner(`Волна ${ev.n}`, [`${n('G')} гоблинов`, n('M') && `${n('M')} безумных`, n('T') && `${n('T')} воров`, n('W') && `${n('W')} на лютоволках`, n('S') && `${n('S')} шамана`].filter(Boolean).join(', ') + ' на подходе', 2200);
      } else if (ev.type === 'waveEnd' && ev.n < TD.WAVES) {
        UI.banner(`Волна ${ev.n} отбита!`, `+${ev.reward} золота`, 1800);
      } else if (ev.type === 'robbed') {
        UI.banner('Ограбление!', `Гоблин-вор унёс ${ev.gold} золота`, 2200);
      } else if (ev.type === 'early') {
        UI.banner('Досрочно!', `+${ev.gold} золота за ${ev.sec} с`, 1500);
      }
    }
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

  // ---------------- Полоса здоровья босса ----------------
  UI.updateBossBar = function (game) {
    const bar = $('bossBar');
    const boss = game.enemies.find(e => e.boss && e.alive);
    if (!boss) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.querySelector('.bb-name').textContent = boss.name;
    bar.querySelector('.bb-state').textContent = boss.stupor > 0 ? '💫 в ступоре' : '';
    bar.querySelector('.bb-val').textContent = `${fmt(Math.ceil(boss.hp))} / ${boss.hpMax}`;
    bar.querySelector('.bb-track i').style.width = (boss.hp / boss.hpMax * 100) + '%';
    bar.onclick = () => UI.openEnemy(boss);
  };

  // ---------------- Карта врага ----------------
  let cardEnemy = null;
  UI.openEnemy = function (e) {
    cardEnemy = e;
    cardFrenzy = null;
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
          <div class="ec-kind">${esc(e.kind)}${e.preview ? '' : ` · тропа ${e.pathId + 1}`}</div>
          <div class="ec-name">${esc(e.name)}</div>
          <div class="ec-hp"><i></i><b></b></div>
          <div class="ec-status" hidden></div>
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
    const status = card.querySelector('.ec-status');
    const extra = [];
    if (e.brave && e.perks.includes('coward')) extra.push('🪓 Воодушевлён безумцем — не трусит');
    if (e.blocks) extra.push(`🛡️ Отбито топором: <b>${e.blocks}</b>`);
    if (e.absorbed) extra.push(`🛡️ Шкура поглотила: <b>${fmt(Math.round(e.absorbed))}</b> урона`);
    if (e.slowT > 0) extra.push(`❄️ Скован льдом · ещё <b>${fmt(e.slowT, 1)} с</b>`);
    if (e.chill && !TD.isImmune(e)) extra.push(`🧊 Вечная стужа тотема: <b>−${Math.round(TD.FROST_AURA.slow * 100)}%</b> скорости`);
    if (e.revealed && e.perks.includes('stealth')) extra.push('👁️ Замечен дозорным колоколом — вышки его видят');
    if (e.burnT > 0) extra.push(`🔥 Горит · ещё <b>${fmt(e.burnT, 1)} с</b>`);
    if (e.stupor > 0) {
      status.hidden = false;
      status.innerHTML = `💫 В ступоре · очнётся через <b>${fmt(e.stupor, 1)} с</b>`;
    } else if (e.perks.includes('dumb')) {
      status.hidden = false;
      status.innerHTML = `💫 Следующая проверка на ступор через <b>${fmt(TD.DUMB.every - e.dumbT, 1)} с</b>`;
    } else if (e.frenzy) {
      status.hidden = false;
      status.innerHTML = `🍄 В ярости: −50% физ. урона · спадёт через <b>${fmt(Math.max(0, TD.FRENZY.calm - e.calmT), 1)} с</b> без урона`;
    } else if (e.perks.includes('frenzy')) {
      status.hidden = false;
      status.innerHTML = 'Ярость прошла';
    } else status.hidden = true;
    if (extra.length) {
      status.innerHTML = (status.hidden ? '' : status.innerHTML + '<br>') + extra.join('<br>');
      status.hidden = false;
    }
    card.querySelector('.ec-hp i').style.width = (e.hp / e.hpMax * 100) + '%';
    card.querySelector('.ec-hp b').textContent = `${fmt(Math.ceil(e.hp))} / ${e.hpMax}`;
  }
  let cardFrenzy = null;
  UI.tickCard = function () {
    if (!cardEnemy) return;
    // При смене ярости меняются параметры — перерисовываем карту целиком.
    const full = cardFrenzy !== null && cardFrenzy !== !!cardEnemy.frenzy;
    cardFrenzy = !!cardEnemy.frenzy;
    renderCard(full);
  };

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
      <div class="tp-sub">${esc(t.def.title)}${[t.def.perk, t.def.perk2].filter(Boolean).map(pk => ' · ' + pk.icon + ' ' + esc(pk.name)).join('')}</div>
      ${t.spot ? `<div class="tp-spot" style="--sc:${TD.SPOTS[t.spot].color}">${TD.SPOTS[t.spot].icon} ${esc(TD.SPOTS[t.spot].name)}: ${esc(TD.SPOTS[t.spot].desc)}</div>` : ''}
      ${t.buffed ? `<div class="tp-spot" style="--sc:${TD.TOWERS.find(d => d.id === 'bell').color}">🔔 Боевой набат: +${TD.BELL.acc} к точности, ${t.def.burst ? `перезарядка −${fmt(TD.BELL.reload, 1)} с` : `+${TD.BELL.rate} к скорострельности`}</div>` : ''}
      ${t.def.aura ? `<div class="tp-grid">
        <span>${t.def.aura === 'frost' ? 'Радиус стужи' : 'Радиус дозора'} ${s.range}</span><b>${fmt(a.range, 1)} кл</b>
        ${t.def.aura === 'frost' ? `<span>Замедление</span><b>−${Math.round(TD.FROST_AURA.slow * 100)}%</b>` : `<span>Набат</span><b>соседние клетки</b>`}
        <span>Сейчас в зоне</span><b class="tp-zone">${UI.auraCount(t)}</b>
      </div>` : `<div class="tp-grid">
        <span>Урон ${s.dmg}</span><b>${num(a.dmg)} (${TD.DMG_TYPE_LABEL[t.def.dmgType]})</b>
        <span>Скорострельность ${t.def.burst ? 'очередь' : s.rate + (t.buffed ? TD.BELL.rate : 0)}</span><b>${t.def.burst ? `${t.def.burst.shots}× / ${fmt(a.reload, 1)} с` : fmt(a.rate, t.def.flame ? 0 : 2) + (t.def.flame ? ' сгуст./с' : '/с')}</b>
        <span>Точность ${a.acc === null ? '∞' : a.acc}</span><b>${a.acc === null ? t.def.accLabel : '±' + fmt(a.dev, 0) + ' px'}</b>
        <span>Дальность ${s.range}</span><b>${fmt(a.range, 1)} кл</b>
        ${t.def.pierce ? `<span>Пробой чар</span><b class="tp-pierce">+${(t.pierce || 0) * 10}%</b>` : ''}
      </div>
      <div class="tp-sep"></div>
      <div class="tp-grid">
        <span>Выстрелов</span><b class="tp-shots">${t.shots}</b>
        <span>Попаданий</span><b class="tp-hits">${t.hits} (${hitPct})</b>
        <span>Нанесено урона</span><b class="tp-dmg">${fmt(t.dmgDealt)}</b>
        <span>Убито</span><b class="tp-kills">${t.kills}</b>
      </div>`}
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
    if (x + 300 > field.width - (document.getElementById('shop').classList.contains('closed') ? 10 : 340)) x = fx - 34 - 290;
    y = Math.max(10, Math.min(field.height - pop.offsetHeight - 10, y));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  };
  // Сколько врагов сейчас в зоне ауры (у колокола — замеченных воров).
  UI.auraCount = function (t) {
    if (!UI.game) return 0;
    const R = t.act.range * TD.TILE;
    const inZone = UI.game.enemies.filter(e => e.alive && Math.hypot(TD.enemyBox(e).cx - t.cx, TD.enemyBox(e).cy - t.cy) <= R);
    return t.def.aura === 'frost' ? `${inZone.length} врагов` : `${inZone.filter(e => e.perks.includes('stealth')).length} воров`;
  };
  UI.tickTowerPop = function () {
    const t = UI.selectedTower;
    if (!t) return;
    const pop = $('towerPop');
    const q = s => pop.querySelector(s);
    if (q('.tp-zone')) q('.tp-zone').textContent = UI.auraCount(t);
    if (q('.tp-pierce')) q('.tp-pierce').textContent = `+${(t.pierce || 0) * 10}%`;
    if (!q('.tp-shots')) return;
    q('.tp-shots').textContent = t.shots;
    q('.tp-hits').textContent = `${t.hits} (${t.shots ? Math.round(t.hits / t.shots * 100) + '%' : '—'})`;
    q('.tp-dmg').textContent = fmt(t.dmgDealt);
    q('.tp-kills').textContent = t.kills;
  };

  // ---------------- Конец уровня ----------------
  // Победа: звёзды (замок цел — 3, прочность выше 10 — 2, иначе 1) и путь дальше по карте.
  UI.showEnd = function (game, won) {
    const m = $('endModal');
    const c = $('endcard');
    const res = won ? TD.Progress.award(game.level, game.castleHp) : null;
    const next = won && TD.LEVELS[game.level + 1] ? game.level + 1 : null;
    c.className = 'endcard ' + (won ? 'win' : 'lose');
    c.innerHTML = `
      <h2>${won ? 'Крепость устояла!' : 'Замок пал'}</h2>
      ${won ? `<div class="end-stars">${[0, 1, 2].map(q => `<span class="${q < res.stars ? 'on' : ''}">★</span>`).join('')}</div>
      <div class="end-note">${res.gained ? (res.best > res.gained ? `Новый рекорд! +${res.gained} ★` : `+${res.gained} ★ в сокровищницу`) : res.best > res.stars ? `Лучший результат на этом уровне — ${res.best} ★` : ''}${next && res.best === res.stars && res.gained === res.stars ? ' · открыт уровень ' + next : ''}</div>` : ''}
      <p>${won ? `Все ${TD.WAVES} волн отбиты. Прочность замка: ${game.castleHp} / ${TD.CASTLE_HP}.` : `Гоблины прорвались на волне ${game.wave}.`}<br>
      Повержено врагов: ${game.stats.kills}, прорвалось: ${game.stats.leaked}.</p>
      <div class="row"><button id="mapBtn2" class="primary">🗺 К карте</button><button id="againBtn">↺ Ещё раз</button></div>`;
    m.hidden = false;
    $('mapBtn2').onclick = () => { m.hidden = true; TD.Sound.play('click'); TD.World.open({ select: next || game.level }); };
    $('againBtn').onclick = () => { m.hidden = true; TD.newGame(undefined, game.level); };
  };
})();
