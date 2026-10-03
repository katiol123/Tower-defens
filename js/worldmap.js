// Карта похода: процедурно нарисованная карта мира с метками уровней, соединёнными цепью.
// Открывается в начале игры и между уровнями. Игрок начинает с нижней метки и идёт вверх.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TAU = Math.PI * 2;
  const W = 1240, H = 1240;     // логический размер карты
  const FUTURE = 3;             // неизведанные земли выше последнего уровня
  const NODE_R = 42;

  const WM = TD.World = { sel: 1, hover: null, view: { s: 1, ox: 0, oy: 0 } };
  let cv, ctx, terrain = null, terrainKey = '', nodes = [], raf = 0, t0 = performance.now();

  // ---------------- Раскладка меток ----------------
  function layout() {
    const ids = Object.keys(TD.LEVELS).map(Number).sort((a, b) => a - b);
    const n = ids.length + FUTURE;
    nodes = [];
    for (let i = 0; i < n; i++) {
      const y = H - 150 - i * (H - 330) / (n - 1);
      const x = W / 2 + Math.sin(i * 1.85 + 0.5) * 300;
      nodes.push({ i, id: ids[i] || null, x, y, future: i >= ids.length });
    }
  }
  // Изогнутое звено между метками: квадратичная кривая с выносом вбок.
  function curve(a, b, i) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const side = i % 2 ? 1 : -1;
    return { a, b, c: { x: mx - dy / L * 90 * side, y: my + dx / L * 90 * side } };
  }
  const bez = (q, t) => ({
    x: (1 - t) * (1 - t) * q.a.x + 2 * (1 - t) * t * q.c.x + t * t * q.b.x,
    y: (1 - t) * (1 - t) * q.a.y + 2 * (1 - t) * t * q.c.y + t * t * q.b.y,
  });
  function curvePoints(q, step) {
    const fine = [];
    for (let k = 0; k <= 200; k++) fine.push(bez(q, k / 200));
    const out = [];
    let acc = 0;
    for (let k = 1; k < fine.length; k++) {
      const p = fine[k - 1], c = fine[k], d = Math.hypot(c.x - p.x, c.y - p.y);
      acc += d;
      while (acc >= step) {
        acc -= step;
        const f = 1 - acc / d;
        out.push({ x: p.x + (c.x - p.x) * f, y: p.y + (c.y - p.y) * f, a: Math.atan2(c.y - p.y, c.x - p.x) });
      }
    }
    return out;
  }

  // ---------------- Местность (рисуется один раз) ----------------
  function paintTerrain(scale) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * scale); c.height = Math.round(H * scale);
    const x = c.getContext('2d');
    x.scale(scale, scale);
    const rng = TD.makeRng(20241003);
    const R = (a, b) => a + rng() * (b - a);

    // Пергамент
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e2cfa3'); g.addColorStop(0.5, '#ead9b0'); g.addColorStop(1, '#dcc396');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let k = 0; k < 18; k++) {
      const sx = R(0, W), sy = R(0, H), sr = R(60, 220);
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, `rgba(150,105,50,${R(0.04, 0.09)})`); sg.addColorStop(1, 'rgba(150,105,50,0)');
      x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fill();
    }
    for (let k = 0; k < 6000; k++) {
      x.fillStyle = `rgba(${rng() < 0.5 ? '90,60,30' : '255,250,235'},${R(0.03, 0.12)})`;
      x.fillRect(R(0, W), R(0, H), R(0.6, 1.8), R(0.6, 1.8));
    }

    // Куда нельзя ставить деревья и горы: около цепи и меток
    const busy = [];
    for (let i = 0; i + 1 < nodes.length; i++) busy.push(...curvePoints(curve(nodes[i], nodes[i + 1], i), 12));
    nodes.forEach(n => {
      busy.push({ x: n.x, y: n.y, big: true });
      // Место под ленту с названием и подписью
      const rc = ribbonX(n);
      for (let dx = -170; dx <= 170; dx += 20) for (let dy = -30; dy <= 40; dy += 14) busy.push({ x: rc + dx, y: n.y + dy });
    });
    const free = (px, py, d) => busy.every(p => Math.hypot(p.x - px, p.y - py) > (p.big ? d + 60 : d));

    // Акварельные области: луга внизу, лес и топи в середине, горы наверху
    const wash = (cx, cy, r, col) => {
      const wg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      wg.addColorStop(0, col); wg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      x.fillStyle = wg; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    };
    for (let k = 0; k < 36; k++) wash(R(0, W), R(880, H), R(80, 200), 'rgba(120,160,70,0.20)');
    for (let k = 0; k < 36; k++) wash(R(0, W), R(520, 900), R(70, 180), 'rgba(70,110,50,0.20)');
    const n2 = nodes[1] || nodes[0];
    for (let k = 0; k < 10; k++) wash(n2.x + R(-200, 200), n2.y + R(-90, 120), R(50, 120), 'rgba(90,100,60,0.22)');
    for (let k = 0; k < 30; k++) wash(R(0, W), R(60, 480), R(80, 200), 'rgba(110,105,100,0.18)');

    // Река
    x.save();
    x.lineCap = 'round'; x.lineJoin = 'round';
    const river = [];
    for (let k = 0; k <= 80; k++) { const rx = k / 80 * (W + 60) - 30; river.push({ x: rx, y: 790 - k * 1.4 + Math.sin(k * 0.4) * 28 + Math.sin(k * 0.15) * 32 }); }
    const stroke = (w, col) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); river.forEach((p, k) => k ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)); x.stroke(); };
    stroke(30, 'rgba(60,70,60,0.55)'); stroke(25, '#86aec4'); stroke(12, 'rgba(170,205,222,0.7)');
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1.2;
    for (let k = 2; k < river.length - 2; k += 3) { const p = river[k]; x.beginPath(); x.moveTo(p.x - 6, p.y - 3); x.quadraticCurveTo(p.x, p.y - 6, p.x + 6, p.y - 3); x.stroke(); }
    x.restore();
    river.forEach(p => busy.push({ x: p.x, y: p.y }));

    // Озеро на лугу
    x.save();
    x.fillStyle = '#86aec4'; x.strokeStyle = 'rgba(50,60,50,0.6)'; x.lineWidth = 2.5;
    x.beginPath(); x.ellipse(170, 1060, 90, 42, -0.2, 0, TAU); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(125 + k * 20, 1048 + k * 7); x.lineTo(141 + k * 20, 1048 + k * 7); x.stroke(); }
    x.restore();
    busy.push({ x: 170, y: 1060, big: true });

    // Объекты местности: собираем и рисуем по глубине
    const items = [];
    // Холмы на лугу
    for (let k = 0; k < 20; k++) { const hx = R(50, W - 50), hy = R(920, H - 60); if (free(hx, hy, 40)) items.push({ y: hy, f: () => hill(x, hx, hy, R(26, 44)) }); }
    // Лес
    for (let k = 0; k < 600; k++) {
      const tx = R(40, W - 40), ty = k < 420 ? R(500, 940) : R(380, 1180);
      if (!free(tx, ty, 26)) continue;
      busy.push({ x: tx, y: ty, tree: true });
      const pine = ty < 700 ? rng() < 0.7 : rng() < 0.35, s = R(0.8, 1.2);
      items.push({ y: ty, f: () => (pine ? pineTree : roundTree)(x, tx, ty, s) });
    }
    // Камыш в топях
    for (let k = 0; k < 40; k++) { const rx = n2.x + R(-220, 220), ry = n2.y + R(-80, 140); if (free(rx, ry, 18)) items.push({ y: ry, f: () => reeds(x, rx, ry) }); }
    // Горы
    for (let k = 0; k < 110; k++) {
      const mx = R(50, W - 50), my = R(150, 480), ms = R(40, 85);
      if (Math.abs(mx - W / 2) < 300 && my < 200) continue;
      if (!free(mx, my, ms * 0.7)) continue;
      busy.push({ x: mx, y: my, big: true });
      items.push({ y: my, f: () => mountain(x, mx, my, ms, rng) });
    }
    // Руины сторожевой башни
    items.push({ y: 1010, f: () => ruin(x, 1020, 1010) });
    busy.push({ x: 1020, y: 1010, big: true });
    items.sort((a, b) => a.y - b.y).forEach(i => i.f());

    // Роза ветров
    compass(x, W - 120, H - 120, 56);
    // Рамка и обожжённые края
    const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(90,50,15,0)'); v.addColorStop(1, 'rgba(70,35,8,0.55)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#5a3d1e'; x.lineWidth = 3; x.strokeRect(16, 16, W - 32, H - 32);
    x.strokeStyle = 'rgba(90,61,30,0.6)'; x.lineWidth = 1; x.strokeRect(24, 24, W - 48, H - 48);
    [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]].forEach(([cx, cy]) => {
      x.fillStyle = '#5a3d1e'; x.beginPath(); x.arc(cx, cy, 9, 0, TAU); x.fill();
      x.fillStyle = '#c9a25a'; x.beginPath(); x.arc(cx, cy, 4, 0, TAU); x.fill();
    });
    return c;
  }

  const INK = '#3b2a18';
  function hill(x, hx, hy, r) {
    x.save();
    x.fillStyle = 'rgba(140,165,85,0.55)'; x.strokeStyle = INK; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(hx - r, hy); x.quadraticCurveTo(hx, hy - r * 0.9, hx + r, hy); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(59,42,24,0.35)'; x.lineWidth = 1;
    for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(hx + r * 0.15 * k, hy - r * 0.32 + k * 3); x.lineTo(hx + r * 0.15 * k + 6, hy - 2); x.stroke(); }
    x.restore();
  }
  function roundTree(x, tx, ty, s) {
    x.save(); x.translate(tx, ty); x.scale(s, s);
    x.fillStyle = 'rgba(40,30,15,0.18)'; x.beginPath(); x.ellipse(2, 2, 9, 3, 0, 0, TAU); x.fill();
    x.strokeStyle = INK; x.lineWidth = 1.4;
    x.fillStyle = '#6b4a2b'; x.fillRect(-1.5, -6, 3, 7);
    x.fillStyle = '#5f8a3e'; x.beginPath(); x.arc(0, -12, 8.5, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,220,0.25)'; x.beginPath(); x.arc(-3, -15, 3.5, 0, TAU); x.fill();
    x.restore();
  }
  function pineTree(x, tx, ty, s) {
    x.save(); x.translate(tx, ty); x.scale(s, s);
    x.fillStyle = 'rgba(40,30,15,0.18)'; x.beginPath(); x.ellipse(2, 2, 8, 3, 0, 0, TAU); x.fill();
    x.strokeStyle = INK; x.lineWidth = 1.3; x.fillStyle = '#3f6b3a';
    for (let k = 0; k < 3; k++) {
      const yy = -4 - k * 7, w = 9 - k * 2;
      x.beginPath(); x.moveTo(-w, yy); x.lineTo(0, yy - 11); x.lineTo(w, yy); x.closePath(); x.fill(); x.stroke();
    }
    x.restore();
  }
  function reeds(x, rx, ry) {
    x.save(); x.strokeStyle = '#4d5a2a'; x.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(rx + k * 2, ry); x.quadraticCurveTo(rx + k * 3, ry - 8, rx + k * 4, ry - 14 - Math.abs(k)); x.stroke(); }
    x.fillStyle = '#6b4a2b'; x.fillRect(rx - 1, ry - 17, 2.4, 5);
    x.restore();
  }
  function mountain(x, mx, my, s, rng) {
    const w = s * (0.75 + rng() * 0.3), h = s * (0.9 + rng() * 0.35), px = mx + (rng() - 0.5) * s * 0.3;
    x.save();
    x.fillStyle = 'rgba(40,30,15,0.16)'; x.beginPath(); x.ellipse(mx + 6, my + 2, w * 0.9, 6, 0, 0, TAU); x.fill();
    x.fillStyle = '#a49a8a'; x.strokeStyle = INK; x.lineWidth = 1.8;
    x.beginPath(); x.moveTo(mx - w, my); x.lineTo(px, my - h); x.lineTo(mx + w, my); x.closePath(); x.fill();
    x.fillStyle = '#7d7466'; x.beginPath(); x.moveTo(px, my - h); x.lineTo(mx + w, my); x.lineTo(px + w * 0.15, my); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(mx - w, my); x.lineTo(px, my - h); x.lineTo(mx + w, my); x.stroke();
    // Снежная шапка
    x.fillStyle = '#f4f1ea';
    x.beginPath(); x.moveTo(px, my - h); x.lineTo(px - w * 0.3, my - h * 0.68); x.lineTo(px - w * 0.1, my - h * 0.74); x.lineTo(px + w * 0.05, my - h * 0.64); x.lineTo(px + w * 0.27, my - h * 0.7); x.closePath(); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(59,42,24,0.4)'; x.lineWidth = 1;
    for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(px + w * 0.12 * k, my - h * (0.55 - k * 0.1)); x.lineTo(px + w * 0.12 * k + 5, my - 4); x.stroke(); }
    x.restore();
  }
  function ruin(x, rx, ry) {
    x.save(); x.strokeStyle = INK; x.lineWidth = 1.6; x.fillStyle = '#b9ad98';
    x.beginPath(); x.moveTo(rx - 14, ry); x.lineTo(rx - 14, ry - 34); x.lineTo(rx - 8, ry - 30); x.lineTo(rx - 4, ry - 38); x.lineTo(rx + 2, ry - 26); x.lineTo(rx + 14, ry - 22); x.lineTo(rx + 14, ry); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = INK; x.fillRect(rx - 3, ry - 14, 6, 14);
    x.restore();
  }
  function compass(x, cx, cy, r) {
    x.save(); x.translate(cx, cy);
    x.strokeStyle = 'rgba(90,61,30,0.8)'; x.lineWidth = 1.2;
    x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke();
    x.beginPath(); x.arc(0, 0, r * 0.82, 0, TAU); x.stroke();
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU - Math.PI / 2, L = k % 2 ? r * 0.55 : r * 0.95;
      x.fillStyle = k % 4 === 0 ? '#8b2a1e' : k % 2 ? '#b89660' : '#5a3d1e';
      x.beginPath(); x.moveTo(Math.cos(a) * L, Math.sin(a) * L);
      x.lineTo(Math.cos(a + 0.35) * r * 0.16, Math.sin(a + 0.35) * r * 0.16);
      x.lineTo(Math.cos(a - 0.35) * r * 0.16, Math.sin(a - 0.35) * r * 0.16);
      x.closePath(); x.fill();
    }
    x.fillStyle = '#5a3d1e'; x.font = 'bold 14px "Yeseva One", Georgia, serif'; x.textAlign = 'center';
    x.fillText('С', 0, -r - 6);
    x.restore();
  }

  // ---------------- Динамический слой ----------------
  function star(x, cx, cy, r, filled) {
    x.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
      k ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath();
    if (filled) {
      const g = x.createLinearGradient(cx, cy - r, cx, cy + r);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffcf3e'); g.addColorStop(1, '#c98a12');
      x.fillStyle = g; x.fill();
      x.strokeStyle = '#6b4310'; x.lineWidth = 1.4; x.stroke();
    } else {
      x.fillStyle = 'rgba(60,40,20,0.35)'; x.fill();
      x.strokeStyle = 'rgba(60,40,20,0.7)'; x.lineWidth = 1.2; x.stroke();
    }
  }

  function drawChain(x, q, open, t) {
    const pts = curvePoints(q, 14);
    x.save();
    // Тень цепи
    x.strokeStyle = 'rgba(40,25,10,0.25)'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.moveTo(q.a.x + 3, q.a.y + 4); x.quadraticCurveTo(q.c.x + 3, q.c.y + 4, q.b.x + 3, q.b.y + 4); x.stroke();
    pts.forEach((p, k) => {
      if (Math.hypot(p.x - q.a.x, p.y - q.a.y) < NODE_R + 4 || Math.hypot(p.x - q.b.x, p.y - q.b.y) < NODE_R + 4) return;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a);
      const dark = open ? '#2b2b30' : 'rgba(70,45,25,0.55)';
      const metal = open ? '#8d939c' : 'rgba(150,100,60,0.55)';
      const hi = open ? '#dfe4ea' : 'rgba(220,170,120,0.35)';
      if (k % 2 === 0) {
        x.strokeStyle = dark; x.lineWidth = 5.5; x.beginPath(); x.ellipse(0, 0, 11, 6, 0, 0, TAU); x.stroke();
        x.strokeStyle = metal; x.lineWidth = 3.2; x.beginPath(); x.ellipse(0, 0, 11, 6, 0, 0, TAU); x.stroke();
        x.strokeStyle = hi; x.lineWidth = 1.3; x.beginPath(); x.ellipse(0, 0, 11, 6, 0, Math.PI * 1.1, Math.PI * 1.7); x.stroke();
      } else {
        x.fillStyle = dark; x.beginPath(); x.ellipse(0, 0, 11.5, 3.4, 0, 0, TAU); x.fill();
        x.fillStyle = metal; x.beginPath(); x.ellipse(0, -0.5, 9.8, 1.8, 0, 0, TAU); x.fill();
      }
      x.restore();
    });
    // Блеск, бегущий по открытой цепи
    if (open) {
      const f = (t * 0.25) % 1, p = bez(q, f);
      const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
      g.addColorStop(0, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, 14, 0, TAU); x.fill();
    }
    x.restore();
  }

  function ribbon(x, cx, cy, text, sub, state) {
    x.save();
    x.font = '700 22px "Yeseva One", Georgia, serif';
    const w = Math.max(x.measureText(text).width, 60) + 40, h = 36;
    const left = cx - w / 2;
    // Загнутые концы
    x.fillStyle = state === 'locked' ? '#7d7466' : '#7a2418';
    x.beginPath(); x.moveTo(left + 6, cy + 6); x.lineTo(left - 16, cy + 6); x.lineTo(left - 6, cy + 19); x.lineTo(left - 16, cy + 32); x.lineTo(left + 6, cy + 32); x.fill();
    x.beginPath(); x.moveTo(left + w - 6, cy + 6); x.lineTo(left + w + 16, cy + 6); x.lineTo(left + w + 6, cy + 19); x.lineTo(left + w + 16, cy + 32); x.lineTo(left + w - 6, cy + 32); x.fill();
    const g = x.createLinearGradient(0, cy, 0, cy + h);
    if (state === 'locked') { g.addColorStop(0, '#b3a994'); g.addColorStop(1, '#8f8572'); }
    else { g.addColorStop(0, '#c4402c'); g.addColorStop(1, '#8d2717'); }
    x.fillStyle = g; x.strokeStyle = '#3b1a10'; x.lineWidth = 1.5;
    x.beginPath(); x.rect(left, cy, w, h); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(255,220,160,0.4)'; x.setLineDash([3, 3]); x.strokeRect(left + 4, cy + 4, w - 8, h - 8); x.setLineDash([]);
    x.fillStyle = state === 'locked' ? '#3e3a33' : '#fff1d6'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 2;
    x.fillText(text, cx, cy + h / 2 + 1);
    x.shadowBlur = 0;
    if (sub) {
      x.font = 'italic 17px Philosopher, Georgia, serif'; x.fillStyle = 'rgba(59,42,24,0.9)';
      x.fillText(sub, cx, cy + h + 15);
    }
    x.restore();
  }

  // Лента с названием — сбоку от метки, ближе к центру карты.
  function ribbonX(n) {
    const side = n.x < W / 2 ? 1 : -1, width = 280;
    return Math.max(width / 2 + 50, Math.min(W - width / 2 - 50, n.x + side * 230));
  }

  function nodeState(n) {
    if (n.future) return 'future';
    if (!TD.Progress.isOpen(n.id)) return 'locked';
    return TD.Progress.levelStars(n.id) > 0 ? 'done' : 'open';
  }

  function drawNode(x, n, t) {
    const st = nodeState(n);
    const hov = WM.hover === n, sel = WM.sel === (n.future ? 'f' + n.i : n.id);
    const L = n.id && TD.LEVELS[n.id];
    const k = hov ? 1.07 : 1;
    x.save(); x.translate(n.x, n.y); x.scale(k, k);
    // Тень и пульс доступной метки
    x.fillStyle = 'rgba(40,25,10,0.35)'; x.beginPath(); x.ellipse(4, 30, 36, 11, 0, 0, TAU); x.fill();
    if (st === 'open') {
      const p = 0.5 + Math.sin(t * 3) * 0.5;
      const g = x.createRadialGradient(0, 0, NODE_R * 0.8, 0, 0, NODE_R + 22);
      g.addColorStop(0, `rgba(255,190,80,${0.55 * p + 0.2})`); g.addColorStop(1, 'rgba(255,150,40,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, NODE_R + 22, 0, TAU); x.fill();
    }
    if (sel) {
      x.save(); x.rotate(t * 0.6);
      x.strokeStyle = '#ffe9a8'; x.lineWidth = 2.5; x.setLineDash([7, 6]);
      x.beginPath(); x.arc(0, 0, NODE_R + 12, 0, TAU); x.stroke();
      x.restore();
    }
    // Кольцо-оправа
    const ring = x.createLinearGradient(0, -NODE_R, 0, NODE_R);
    if (st === 'locked' || st === 'future') { ring.addColorStop(0, '#c9c2b4'); ring.addColorStop(1, '#6d665a'); }
    else { ring.addColorStop(0, '#fbe6a2'); ring.addColorStop(0.5, '#d4a548'); ring.addColorStop(1, '#8a5c18'); }
    x.fillStyle = ring; x.strokeStyle = '#2a1a0c'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(0, 0, NODE_R, 0, TAU); x.fill(); x.stroke();
    // Насечки на оправе
    x.strokeStyle = 'rgba(60,35,10,0.45)'; x.lineWidth = 1.2;
    for (let q = 0; q < 24; q++) { const a = q / 24 * TAU; x.beginPath(); x.moveTo(Math.cos(a) * (NODE_R - 2), Math.sin(a) * (NODE_R - 2)); x.lineTo(Math.cos(a) * (NODE_R - 6), Math.sin(a) * (NODE_R - 6)); x.stroke(); }
    // Сердцевина
    const core = x.createRadialGradient(-8, -8, 2, 0, 0, NODE_R - 7);
    if (st === 'done') { core.addColorStop(0, '#5c9b5c'); core.addColorStop(1, '#1f4a2a'); }
    else if (st === 'open') { core.addColorStop(0, '#d9573c'); core.addColorStop(1, '#5e1610'); }
    else { core.addColorStop(0, '#77706a'); core.addColorStop(1, '#3a3632'); }
    x.fillStyle = core; x.beginPath(); x.arc(0, 0, NODE_R - 7, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1.5; x.stroke();
    // Эмблема
    x.font = '36px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (st === 'future') { x.fillStyle = '#e8e0d0'; x.font = '700 30px "Yeseva One", Georgia, serif'; x.fillText('?', 0, 2); }
    else {
      if (st === 'locked') x.globalAlpha = 0.45;
      x.fillText(L.icon || '⚔', 0, 2);
      x.globalAlpha = 1;
      if (st === 'locked') { x.font = '20px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; x.fillText('🔒', 14, 14); }
    }
    // Номер уровня
    if (!n.future) {
      x.fillStyle = '#2a1a0c'; x.beginPath(); x.arc(-NODE_R + 4, -NODE_R + 6, 11, 0, TAU); x.fill();
      x.fillStyle = '#ffe3a0'; x.font = '700 13px "Yeseva One", Georgia, serif'; x.fillText(String(n.id), -NODE_R + 4, -NODE_R + 7);
    }
    // Значок босса
    if (L && L.waves.some(w => w.boss)) {
      x.fillStyle = '#3a0d08'; x.strokeStyle = '#ffcf6a'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(NODE_R - 4, -NODE_R + 6, 12, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = '#ffe3c0'; x.font = '15px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; x.fillText('☠', NODE_R - 4, -NODE_R + 7);
    }
    x.restore();
    // Звёзды под меткой
    if (!n.future) {
      const s = TD.Progress.levelStars(n.id);
      for (let q = 0; q < 3; q++) star(x, n.x + (q - 1) * 26, n.y + NODE_R + 16 + (q === 1 ? 5 : 0), q === 1 ? 13 : 11, q < s);
    }
    // Лента с названием
    const name = n.future ? 'Неизведанные земли' : L.name;
    const sub = n.future ? 'скоро' : L.region;
    ribbon(x, ribbonX(n), n.y - 22, name, sub, st === 'locked' || st === 'future' ? 'locked' : st);
  }

  function drawFlag(x, n, t) {
    x.save(); x.translate(n.x - 6, n.y - NODE_R - 4); x.scale(1.3, 1.3);
    x.strokeStyle = '#2a1a0c'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -46); x.stroke();
    x.fillStyle = '#ffcf6a'; x.beginPath(); x.arc(0, -47, 3.5, 0, TAU); x.fill();
    const g = x.createLinearGradient(0, -44, 30, -26);
    g.addColorStop(0, '#2f5fb0'); g.addColorStop(1, '#1d3c78');
    x.fillStyle = g; x.strokeStyle = '#0f1c38'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(1, -44);
    for (let k = 0; k <= 10; k++) x.lineTo(1 + k * 3.2, -44 + Math.sin(t * 5 + k * 0.6) * 2.4 * k / 10);
    for (let k = 10; k >= 0; k--) x.lineTo(1 + k * 3.2, -24 + Math.sin(t * 5 + k * 0.6) * 2.4 * k / 10);
    x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#ffe3a0'; x.font = '12px serif'; x.textAlign = 'center'; x.fillText('♜', 15, -30);
    x.restore();
  }

  const clouds = Array.from({ length: 8 }, (_, k) => ({ x: (k * 233) % W, y: 160 + (k * 211) % 950, s: 0.7 + (k % 3) * 0.3, v: 6 + (k % 4) * 3 }));
  function drawClouds(x, t) {
    for (const c of clouds) {
      const cx = ((c.x + t * c.v) % (W + 300)) - 150;
      x.save(); x.globalAlpha = 0.33;
      x.fillStyle = '#fffaf0';
      [[0, 0, 40], [34, 6, 30], [-32, 8, 28], [12, -16, 26]].forEach(([dx, dy, r]) => { x.beginPath(); x.arc(cx + dx * c.s, c.y + dy * c.s, r * c.s, 0, TAU); x.fill(); });
      x.restore();
    }
  }
  // Туман над неоткрытыми землями
  function drawFog(x, t) {
    const firstLocked = nodes.find(n => n.future);
    if (!firstLocked) return;
    const edge = firstLocked.y + 90;
    const g = x.createLinearGradient(0, 0, 0, edge);
    g.addColorStop(0, 'rgba(236,230,218,0.86)'); g.addColorStop(0.75, 'rgba(236,230,218,0.6)'); g.addColorStop(1, 'rgba(236,230,218,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, edge);
    x.save(); x.globalAlpha = 0.5; x.fillStyle = '#f2ede2';
    for (let k = 0; k < 12; k++) {
      const fx = ((k * 97 + t * (8 + k % 3 * 4)) % (W + 200)) - 100, fy = edge - 40 - (k % 4) * 30;
      x.beginPath(); x.ellipse(fx, fy, 90, 26, 0, 0, TAU); x.fill();
    }
    x.restore();
  }

  function drawTitle(x) {
    x.save();
    const cx = W / 2, cy = 76;
    x.fillStyle = 'rgba(234,217,176,0.92)'; x.strokeStyle = '#5a3d1e'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(cx - 230, cy - 36); x.lineTo(cx + 230, cy - 36); x.quadraticCurveTo(cx + 260, cy, cx + 230, cy + 36); x.lineTo(cx - 230, cy + 36); x.quadraticCurveTo(cx - 260, cy, cx - 230, cy - 36); x.closePath(); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(90,61,30,0.5)'; x.lineWidth = 1; x.setLineDash([4, 4]); x.strokeRect(cx - 215, cy - 27, 430, 54); x.setLineDash([]);
    x.fillStyle = '#5a2414'; x.font = '700 40px "Yeseva One", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('Земли гоблинов', cx, cy + 1);
    x.restore();
  }

  function draw() {
    const t = (performance.now() - t0) / 1000;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const s = Math.min(r.width / W, r.height / H);
    WM.view = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2 };
    const key = `${(s * dpr).toFixed(3)}`;
    if (key !== terrainKey) { terrain = paintTerrain(Math.min(3, s * dpr)); terrainKey = key; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, WM.view.ox * dpr, WM.view.oy * dpr);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.drawImage(terrain, 0, 0, W, H);
    for (let i = 0; i + 1 < nodes.length; i++) {
      const open = !nodes[i + 1].future && TD.Progress.isOpen(nodes[i + 1].id);
      drawChain(ctx, curve(nodes[i], nodes[i + 1], i), open, t);
    }
    drawClouds(ctx, t);
    drawFog(ctx, t);
    nodes.forEach(n => drawNode(ctx, n, t));
    const front = nodes.find(n => n.id === TD.Progress.frontier());
    if (front) drawFlag(ctx, front, t);
    drawTitle(ctx);
    ctx.restore();
    raf = requestAnimationFrame(draw);
  }

  // ---------------- Мышь ----------------
  function nodeAt(ev) {
    const r = cv.getBoundingClientRect(), v = WM.view;
    const x = (ev.clientX - r.left - v.ox) / v.s, y = (ev.clientY - r.top - v.oy) / v.s;
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) <= NODE_R + 8) || null;
  }

  // ---------------- Панель локации ----------------
  function levelTypes(L) {
    const types = [];
    L.waves.forEach(w => { for (const ch of w.units) { const ty = TD.WAVE_UNIT[ch]; if (ty && !types.includes(ty)) types.push(ty); } });
    return types;
  }
  WM.renderPanel = function () {
    const box = $('wmLoc');
    const n = nodes.find(q => (q.future ? 'f' + q.i : q.id) === WM.sel) || nodes[0];
    const P = TD.Progress;
    $('wmStars').textContent = `${P.total()} / ${P.maxTotal()}`;
    $('wmFree').textContent = P.free();
    if (n.future) {
      box.innerHTML = `<div class="wl-kicker">За туманом</div><h3 class="wl-name">Неизведанные земли</h3>
        <p class="wl-desc">Дальше на север лежат горы, о которых гоблины рассказывают шёпотом. Эти земли откроются в следующих походах.</p>`;
      return;
    }
    const L = TD.LEVELS[n.id], st = P.levelStars(n.id), open = P.isOpen(n.id);
    const types = levelTypes(L);
    const regular = types.filter(ty => !TD.UNITS[ty].boss), bosses = types.filter(ty => TD.UNITS[ty].boss);
    const foe = ty => `<button class="wl-foe" data-type="${ty}" title="Открыть карточку">
        <span class="wl-foe-img"><img src="assets/${TD.UNITS[ty].sprite}_front.png" alt=""></span>
        <span class="wl-foe-name">${esc(TD.UNITS[ty].name)}</span></button>`;
    const boss = ty => `<button class="wl-boss" data-type="${ty}" title="Открыть карточку босса">
        <span class="wl-boss-tag">☠ Босс</span>
        <span class="wl-boss-img"><img src="assets/${TD.UNITS[ty].sprite}_front.png" alt=""></span>
        <span class="wl-boss-info"><b>${esc(TD.UNITS[ty].name)}</b><small>${TD.UNITS[ty].perks.map(p => TD.PERKS[p].icon + ' ' + esc(TD.PERKS[p].name)).join('<br>')}</small></span></button>`;
    const prev = TD.LEVELS[n.id - 1];
    box.innerHTML = `
      <div class="wl-kicker">Уровень ${n.id} · ${esc(L.region || '')}</div>
      <h3 class="wl-name">${L.icon || ''} ${esc(L.name)}</h3>
      <div class="wl-stars">${[0, 1, 2].map(q => `<span class="${q < st ? 'on' : ''}">★</span>`).join('')}<small>${st ? 'лучший результат' : open ? 'ещё не пройден' : 'закрыт'}</small></div>
      <p class="wl-desc">${esc(L.desc)}</p>
      <div class="wl-meta">Волн: ${L.waves.length}</div>
      <div class="wl-h">Враги</div>
      <div class="wl-foes">${regular.map(foe).join('')}</div>
      ${bosses.length ? `<div class="wl-h">Босс</div>${bosses.map(boss).join('')}` : ''}
      ${open
        ? `<button class="wl-go" id="wlGo">${st ? '↺ Пройти снова' : '⚔ В поход!'}</button>`
        : `<button class="wl-go" disabled>🔒 Сначала пройдите «${esc(prev ? prev.name : '')}»</button>`}`;
    box.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
      TD.Sound.play('click');
      const e = TD.createUnit(b.dataset.type, TD.makeRng(7 + n.id));
      e.preview = true;
      TD.UI.openEnemy(e);
    }));
    if ($('wlGo')) $('wlGo').onclick = () => { TD.Sound.play('click'); WM.close(); TD.newGame(undefined, n.id); };
  };

  // ---------------- Сокровищница: полноэкранное окно улучшений ----------------
  const ROMAN = ['I', 'II', 'III'];
  function towerIcon(def, size) {
    size = size || 52;
    const c = document.createElement('canvas');
    c.width = size * 2; c.height = size * 2; c.className = 'tr-ico';
    c.style.width = c.style.height = size + 'px';
    const x = c.getContext('2d');
    const k = size / 52;
    x.scale(2 * k, 2 * k);
    const tall = def.id === 'bell' || def.id === 'spire';
    x.translate(26, tall ? 37 : 30);
    x.scale(tall ? 0.72 : 0.9, tall ? 0.72 : 0.9);
    TD.drawTower(x, def, { angle: -Math.PI / 5 });
    return c;
  }
  // Дорожка из трёх ступеней: купленные — золотые, следующая — с кнопкой, дальние — приглушены.
  function track(id, can) {
    const P = TD.Progress, r = P.rank(id), free = WM.midBattle ? 0 : P.free();
    return `<div class="tr-track">${TD.UPGRADES[id].map((u, k) => {
      const cost = TD.UPGRADE_COST[k];
      const state = k < r ? 'done' : k === r ? 'next' : 'later';
      const btn = state === 'done' ? '<span class="tr-ok">✓ куплено</span>'
        : state === 'next' && can ? `<button class="tr-buy" data-up="${id}" ${free < cost ? 'disabled' : ''}>★ ${cost}</button>`
        : `<span class="tr-cost">★ ${cost}</span>`;
      return `<div class="tr-step ${state}">
        <span class="tr-node">${ROMAN[k]}</span>
        <div class="tr-txt"><b>${esc(u.name)}</b><small>${esc(u.desc)}</small></div>${btn}</div>`;
    }).join('')}</div>`;
  }
  const pips = id => `<span class="tr-pips">${[0, 1, 2].map(k => `<i class="${k < TD.Progress.rank(id) ? 'on' : ''}"></i>`).join('')}</span>`;

  WM.openShop = function () {
    $('treasury').hidden = false;
    WM.renderShop();
  };
  WM.closeShop = function () { $('treasury').hidden = true; WM.renderPanel(); };
  WM.shopOpen = () => !$('treasury').hidden;
  WM.renderShop = function () {
    const P = TD.Progress, free = WM.midBattle ? 0 : P.free();
    const towers = TD.TOWERS, spells = TD.SPELLS.filter(s => TD.SPELL_UPGRADE_KEY[s.id]);
    $('trFree').textContent = P.free();
    $('trInfo').textContent = `заработано ${P.total()} из ${P.maxTotal()} · потрачено ${P.spent()}`;
    $('trRefund').disabled = !P.spent() || WM.midBattle;
    $('trMid').hidden = !WM.midBattle;
    const body = $('trBody');
    body.innerHTML = `
      <section class="tr-sec">
        <h3 class="tr-h"><span>Новые вышки</span><small>Открыть вышку — ★ ${TD.UNLOCK_COST}. До открытия она закрыта в магазине боя и её нельзя улучшать.</small></h3>
        <div class="tr-showcase">${TD.LOCKED_TOWERS.map(id => {
          const d = towers.find(t => t.id === id), open = P.unlocked[id];
          return `<div class="tr-hero ${open ? 'open' : ''}" style="--tc:${d.color}">
            <div class="tr-pedestal" data-icon="${id}" data-size="120"></div>
            <div class="tr-hero-info">
              <div class="tr-kicker">${esc(d.title)}</div>
              <h4>${esc(d.name)}</h4>
              ${[d.perk, d.perk2].filter(Boolean).map(pk => `<p><span>${pk.icon}</span><b>${esc(pk.name)}.</b> ${esc(pk.desc)}</p>`).join('')}
              ${open ? '<div class="tr-opened">✓ Открыта</div>' : `<button class="tr-buy big" data-unlock="${id}" ${free < TD.UNLOCK_COST ? 'disabled' : ''}>🔓 Открыть · ★ ${TD.UNLOCK_COST}</button>`}
            </div>
          </div>`;
        }).join('')}</div>
      </section>
      <section class="tr-sec">
        <h3 class="tr-h"><span>Улучшения вышек</span><small>Ступень I — ★ 1, II — ★ 2, III — ★ 3. Действуют с начала следующего боя.</small></h3>
        <div class="tr-grid">${towers.map(d => {
          const can = P.canUpgrade(d.id);
          return `<div class="tr-card ${can ? '' : 'locked'}" style="--tc:${d.color}">
            <div class="tr-card-head"><div class="tr-icobox" data-icon="${d.id}" data-size="64"></div>
              <div><h4>${esc(d.name)}</h4><div class="tr-sub">${esc(d.title)} ${pips(d.id)}</div></div></div>
            ${track(d.id, can)}
            ${can ? '' : `<div class="tr-lock"><span>🔒</span>Сначала откройте вышку</div>`}
          </div>`;
        }).join('')}</div>
      </section>
      <section class="tr-sec">
        <h3 class="tr-h"><span>Улучшения заклинаний</span><small>Ремонт замка не улучшается.</small></h3>
        <div class="tr-grid">${spells.map(s => {
          const key = TD.SPELL_UPGRADE_KEY[s.id];
          return `<div class="tr-card tr-spell" style="--tc:#8fc2ff">
            <div class="tr-card-head"><div class="tr-medal">${s.icon}</div>
              <div><h4>${esc(s.name)}</h4><div class="tr-sub">✦ ${s.cost} маны${s.cd ? ` · перезарядка ${s.cd} с` : ''} ${pips(key)}</div></div></div>
            ${track(key, true)}
          </div>`;
        }).join('')}</div>
      </section>`;
    body.querySelectorAll('[data-icon]').forEach(el => el.prepend(towerIcon(towers.find(t => t.id === el.dataset.icon), +el.dataset.size)));
    body.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
      if (P.upgrade(b.dataset.up)) { TD.Sound.play('build'); WM.renderShop(); }
    }));
    body.querySelectorAll('[data-unlock]').forEach(b => b.addEventListener('click', () => {
      if (P.unlock(b.dataset.unlock)) { TD.Sound.play('build'); WM.renderShop(); }
    }));
  };

  WM.isOpen = () => !$('world').hidden;
  // opts.select — какую метку выделить; opts.canReturn — можно вернуться к текущему бою.
  WM.open = function (opts) {
    opts = opts || {};
    layout();
    const P = TD.Progress;
    WM.sel = opts.select && TD.LEVELS[opts.select] ? opts.select : P.frontier();
    $('wmBack').hidden = !opts.canReturn;
    WM.midBattle = !!opts.canReturn;   // посреди боя покупки закрыты — только между уровнями
    $('world').hidden = false;
    WM.renderPanel();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  };
  WM.close = function () {
    $('world').hidden = true;
    $('treasury').hidden = true;
    cancelAnimationFrame(raf);
  };

  WM.init = function () {
    cv = $('wmCanvas'); ctx = cv.getContext('2d');
    layout();
    cv.addEventListener('mousemove', ev => { WM.hover = nodeAt(ev); cv.style.cursor = WM.hover ? 'pointer' : 'default'; });
    cv.addEventListener('mouseleave', () => { WM.hover = null; });
    cv.addEventListener('click', ev => {
      const n = nodeAt(ev);
      if (!n) return;
      TD.Sound.play('click');
      WM.sel = n.future ? 'f' + n.i : n.id;
      WM.renderPanel();
    });
    $('wmBack').onclick = () => { TD.Sound.play('click'); WM.close(); };
    $('wmShopBtn').onclick = () => { TD.Sound.play('click'); WM.openShop(); };
    $('trClose').onclick = () => { TD.Sound.play('click'); WM.closeShop(); };
    $('trRefund').onclick = () => {
      if (!confirm('Сбросить все открытия и улучшения и вернуть звёзды?')) return;
      TD.Progress.refund(); TD.Sound.play('sell'); WM.renderShop();
    };
  };
})();
