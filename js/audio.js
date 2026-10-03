// Звуки: всё синтезируется через Web Audio API, внешние файлы не нужны.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('td-muted') === '1'; } catch (e) { /* хранилище недоступно */ }
  const last = {};          // время последнего проигрывания по типу — чтобы не было каши на ×3
  let flame = null;         // постоянный треск огнемёта

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  // Браузеры разрешают звук только после действия пользователя.
  const unlock = () => { if (init() && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const ready = () => ctx && ctx.state === 'running' && !muted;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function gate(type, ms) {
    const now = performance.now();
    if (last[type] && now - last[type] < ms) return false;
    last[type] = now;
    return true;
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(type, f0, f1, dur, vol, opts) {
    opts = opts || {};
    const t = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, opts.attack || 0.005, vol, dur);
    let node = o;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; node.connect(f); node = f; }
    node.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, filter, f0, f1, opts) {
    opts = opts || {};
    const t = ctx.currentTime + (opts.delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = opts.rate || 1;
    const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = opts.q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    env(g, t, opts.attack || 0.003, vol, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const SFX = {
    bolt() { noise(0.06, 0.18, 'highpass', 2500, 2500, { q: 0.7 }); tone('square', rnd(700, 820), 260, 0.06, 0.05, { lp: 2500 }); },
    shell() { tone('sine', 120, 38, 0.35, 0.7); noise(0.25, 0.35, 'lowpass', 900, 200); },
    lance() { tone('triangle', rnd(950, 1050), 240, 0.18, 0.28); noise(0.22, 0.2, 'bandpass', 4000, 900, { q: 2 }); },
    explode() { tone('sine', 90, 30, 0.55, 0.9); noise(0.6, 0.6, 'lowpass', 2200, 120); noise(0.12, 0.25, 'highpass', 3000); },
    hit() { noise(0.07, 0.22, 'bandpass', rnd(700, 1000), 300, { q: 1.5 }); tone('sine', 180, 90, 0.07, 0.12); },
    death() {
      const f = rnd(340, 440);
      tone('sawtooth', f, f * 0.35, 0.32, 0.14, { lp: 1800 });
      tone('square', f * 1.5, f * 0.5, 0.22, 0.05, { lp: 1400, delay: 0.03 });
      noise(0.18, 0.12, 'bandpass', 600, 200, { q: 1 });
    },
    coin() { tone('sine', 1320, 1320, 0.08, 0.12); tone('sine', 1760, 1760, 0.16, 0.12, { delay: 0.07 }); },
    castle() {
      tone('sine', 70, 35, 0.6, 0.9);
      noise(0.5, 0.5, 'lowpass', 1200, 90);
      tone('triangle', 620, 580, 0.5, 0.12, { delay: 0.02 });
      tone('triangle', 931, 900, 0.45, 0.08, { delay: 0.02 });
    },
    build() { for (let i = 0; i < 3; i++) { noise(0.06, 0.35, 'bandpass', 500 + i * 120, 300, { q: 3, delay: i * 0.11 }); tone('sine', 160 + i * 20, 90, 0.08, 0.25, { delay: i * 0.11 }); } },
    sell() { for (let i = 0; i < 4; i++) tone('sine', 1200 + i * 220, 1200 + i * 220, 0.09, 0.1, { delay: i * 0.06 }); },
    wave() {
      // Боевой рог
      [[196, 0], [294, 0], [392, 0.25]].forEach(([f, d]) => tone('sawtooth', f, f * 1.01, 0.9, 0.09, { lp: 1300, attack: 0.12, delay: d }));
      tone('sine', 55, 45, 0.9, 0.3, { attack: 0.05 });
    },
    waveEnd() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.35, 0.14, { delay: i * 0.1 })); },
    won() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 6 ? 0.9 : 0.25, 0.16, { delay: i * 0.13 })); },
    lost() { [392, 370, 330, 262].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.5, 0.1, { lp: 900, delay: i * 0.28 })); tone('sine', 60, 30, 1.2, 0.5, { delay: 0.8 }); },
    // Вой раненого волка
    // Шелест спор и мягкий перезвон лечения
    spores() { noise(0.45, 0.08, 'bandpass', 3000, 6000, { q: 2 }); [660, 880, 1100].forEach((f, i) => tone('sine', f, f, 0.3, 0.05, { delay: i * 0.06, attack: 0.02 })); },
    // Тролль: прыжки гоблинов, пинок, ступор, рёв
    nest() { for (let i = 0; i < 5; i++) tone('square', 300 + i * 70, 700 + i * 90, 0.09, 0.05, { lp: 2200, delay: i * 0.07 }); },
    kick() { tone('sine', 140, 60, 0.15, 0.6); noise(0.08, 0.3, 'lowpass', 1500, 300); tone('triangle', 500, 1400, 0.35, 0.12, { delay: 0.05 }); },
    stupor() { tone('sawtooth', 220, 110, 0.9, 0.1, { lp: 700, attack: 0.05 }); tone('sine', 880, 870, 0.5, 0.05, { delay: 0.15 }); tone('sine', 1100, 1090, 0.5, 0.04, { delay: 0.3 }); },
    roar() { tone('sawtooth', 110, 55, 1.2, 0.3, { lp: 600, attack: 0.08 }); noise(1.0, 0.35, 'lowpass', 500, 120, { attack: 0.08 }); tone('sine', 50, 35, 1.2, 0.6, { attack: 0.05 }); },
    // Заклинания
    // Метеор: нарастающий рёв падения с треском огня
    meteorCast() {
      noise(1.05, 0.55, 'bandpass', 220, 1800, { q: 0.7, attack: 0.85 });
      noise(1.0, 0.25, 'highpass', 2500, 5000, { attack: 0.8 });
      tone('sawtooth', 90, 260, 1.0, 0.16, { lp: 1200, attack: 0.8 });
      for (let i = 0; i < 8; i++) noise(0.04, 0.25, 'bandpass', 3000 + Math.random() * 2000, 2000, { q: 4, delay: 0.2 + i * 0.1 });
    },
    // Удар метеора
    meteor() { tone('sine', 70, 25, 1.0, 1.0); noise(1.1, 0.8, 'lowpass', 2600, 90); noise(0.2, 0.35, 'highpass', 2500); tone('square', 55, 30, 0.6, 0.2, { lp: 300 }); },
    // Лёд: хруст льда, порыв ветра и хрустальный перезвон
    frost() {
      for (let i = 0; i < 10; i++) noise(0.05, 0.4, 'highpass', 3500 + Math.random() * 3000, 2500, { delay: i * 0.035 });
      noise(0.8, 0.35, 'bandpass', 900, 3500, { q: 0.8, attack: 0.08 });
      [1568, 2093, 2637, 3136, 4186].forEach((f, i) => tone('triangle', f, f * 0.99, 0.9, 0.14, { delay: 0.08 + i * 0.06 }));
      tone('sine', 523, 520, 0.9, 0.12, { delay: 0.05, attack: 0.03 });
    },
    // Молния: электрический треск и раскат
    chain() {
      for (let i = 0; i < 7; i++) {
        tone('sawtooth', 1800 + Math.random() * 1500, 200 + Math.random() * 300, 0.07, 0.22, { lp: 6000, delay: i * 0.045 });
        noise(0.06, 0.5, 'bandpass', 2500 + Math.random() * 2500, 1500, { q: 2, delay: i * 0.045 });
      }
      tone('square', 110, 55, 0.45, 0.25, { lp: 700, delay: 0.05 });
      noise(0.7, 0.4, 'lowpass', 900, 120, { delay: 0.1 });
    },
    repair() { for (let i = 0; i < 3; i++) { noise(0.06, 0.7, 'bandpass', 1800, 900, { q: 4, delay: i * 0.13 }); tone('square', 520, 480, 0.06, 0.14, { lp: 2000, delay: i * 0.13 }); } },
    early() { [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, f, 0.12, 0.1, { delay: i * 0.05 })); },
    // Блок топором: металлический лязг
    block() { tone('square', 1250, 1150, 0.12, 0.08, { lp: 5000 }); tone('triangle', 2400, 2300, 0.2, 0.06); noise(0.06, 0.3, 'highpass', 4000); },
    calm() { tone('triangle', 330, 165, 0.6, 0.12, { attack: 0.05 }); },
    dismount() { tone('sawtooth', 520, 880, 0.35, 0.09, { lp: 1600, attack: 0.08 }); tone('sawtooth', 880, 380, 0.7, 0.09, { lp: 1400, delay: 0.35 }); },
    click() { tone('sine', 900, 700, 0.04, 0.08); },
    whoosh() { noise(0.25, 0.14, 'bandpass', 500, 2200, { q: 1.2 }); },
    deny() { tone('square', 220, 180, 0.12, 0.07, { lp: 1200 }); tone('square', 165, 140, 0.16, 0.07, { lp: 1200, delay: 0.1 }); },
  };
  const GAP = { bolt: 45, shell: 80, lance: 60, explode: 70, hit: 35, death: 60, coin: 70, castle: 150, build: 100, sell: 100, dismount: 200, spores: 250, calm: 200, nest: 300, kick: 80, stupor: 500, roar: 1000, meteor: 100, repair: 300, block: 70 };

  // Звуки из файлов (assets/audio). Обычный HTML-аудио работает и при открытии index.html с диска.
  // Громкость выровнена: лёд записан тише остальных.
  const FILES = {
    meteor: { src: 'assets/audio/meteor.mp3', vol: 0.6 },
    frost: { src: 'assets/audio/frost.mp3', vol: 1.0 },
    chain: { src: 'assets/audio/chain.mp3', vol: 0.7 },
  };
  const fileEls = {};
  if (typeof Audio !== 'undefined') {
    for (const k in FILES) {
      const a = new Audio(FILES[k].src);
      a.preload = 'auto';
      a.addEventListener('error', () => { fileEls[k] = null; });   // нет файла — играем синтезированный звук
      fileEls[k] = a;
    }
  }
  function playFile(name) {
    const base = fileEls[name];
    if (!base) return false;
    if (muted) return true;
    const a = base.cloneNode();
    a.volume = FILES[name].vol;
    a.play().catch(() => {});
    return true;
  }

  function play(name) {
    if (!ready() || !SFX[name]) return;
    if (!gate(name, GAP[name] || 30)) return;
    SFX[name]();
  }

  function setFlame(on) {
    if (!ctx) return;
    if (!ready()) { if (flame) flame.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); return; }
    if (!flame) {
      if (!on) return;            // создаём шум только когда огнемёт реально стреляет
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2600;
      const g = ctx.createGain(); g.gain.value = 0;
      // Треск: громкость пульсирует 1 ± 0,35. Пульсация умножается на основную громкость,
      // поэтому при громкости 0 тишина (раньше она прибавлялась и шум был слышен всегда).
      const crackle = ctx.createGain(); crackle.gain.value = 1;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 13; lg.gain.value = 0.35;
      lfo.connect(lg).connect(crackle.gain);
      s.connect(f).connect(f2).connect(g).connect(crackle).connect(master);
      s.start(); lfo.start();
      flame = { g };
    }
    flame.g.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, on ? 0.04 : 0.12);
  }

  TD.Sound = {
    play,
    // Звуки игровых событий. Вызывается до того, как рендер очистит очередь событий.
    handleEvents(game, speed) {
      setFlame(speed > 0 && game.towers.some(t => t.def.flame && t.firing > 0));
      for (const ev of game.events) {
        switch (ev.type) {
          case 'fire': if (ev.kind !== 'flame') play(ev.kind); break;
          case 'hit': play('hit'); break;
          case 'explode': play('explode'); break;
          case 'death': play('death'); setTimeout(() => play('coin'), 90); break;
          case 'castle': play('castle'); break;
          case 'build': play('build'); break;
          case 'sell': play('sell'); break;
          case 'wave': play('wave'); break;
          case 'waveEnd': if (game.wave < TD.WAVES) play('waveEnd'); break;
          case 'won': play('won'); break;
          case 'lost': play('lost'); break;
          case 'dismount': play('dismount'); break;
          case 'spores': play('spores'); break;
          case 'calm': play('calm'); break;
          case 'nest': play('nest'); break;
          case 'block': play('block'); break;
          case 'meteorCast': play('meteorCast'); break;
          case 'meteor': if (!playFile('meteor')) play('meteor'); break;
          case 'frost': if (!playFile('frost')) play('frost'); break;
          case 'chain': if (!playFile('chain')) play('chain'); break;
          case 'repair': case 'masonry': play('repair'); break;
          case 'early': play('early'); break;
          case 'kick': play('kick'); break;
          case 'stupor': play('stupor'); break;
          case 'spawn': if (ev.e.boss) play('roar'); break;
        }
      }
    },
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { localStorage.setItem('td-muted', muted ? '1' : '0'); } catch (e) { /* не страшно */ }
      if (init()) { master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05); if (!muted) ctx.resume(); }
      if (muted) setFlame(false);
      return muted;
    },
  };
})();
