// Отрисовка мира на canvas: фон, дороги со стрелками, замок, вышки, гоблины, снаряды, эффекты.
var TD = globalThis.TD || (globalThis.TD = {});

(function () {
  const T = TD.TILE;
  const TAU = Math.PI * 2;

  // ---------------- Изображения гоблина ----------------
  const IMG = {};
  const WHITE = {};
  TD.loadSprites = function () {
    const views = ['front', 'side', 'back'];
    return Promise.all(views.map(v => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        IMG[v] = im;
        // Белый силуэт для вспышки при попадании.
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const x = c.getContext('2d');
        x.drawImage(im, 0, 0);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        WHITE[v] = c;
        res();
      };
      im.onerror = res;
      im.src = `assets/goblin_${v}.png`;
    })));
  };

  // ---------------- Утилиты ----------------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function shadow(ctx, x, y, rx, ry, a) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${a || 0.28})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------------- Фон (один раз на карту) ----------------
  TD.renderBackground = function (map, scale) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(TD.W * scale); c.height = Math.ceil(TD.H * scale);
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    const rng = TD.makeRng(map.seed * 13 + 5);

    // Трава
    const g = ctx.createLinearGradient(0, 0, 0, TD.H);
    g.addColorStop(0, '#557f3c'); g.addColorStop(1, '#4a7234');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TD.W, TD.H);
    for (let i = 0; i < 70; i++) {
      const x = rng() * TD.W, y = rng() * TD.H, r = 40 + rng() * 120;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = rng() < 0.5;
      gg.addColorStop(0, light ? 'rgba(150,190,90,0.16)' : 'rgba(30,60,25,0.18)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Мелкая фактура
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,200,0.05)' : 'rgba(0,30,0,0.07)';
      ctx.fillRect(rng() * TD.W, rng() * TD.H, 1.5, 1.5);
    }
    // Пучки травы и цветы
    const flowerC = ['#f4e37a', '#f7a3c8', '#ffffff', '#b8a4ff'];
    for (const t of map.tufts) {
      if (t.kind === 'grass') {
        ctx.strokeStyle = 'rgba(40,80,25,0.55)';
        ctx.lineWidth = 1.2;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(t.x + k * 1.5, t.y);
          ctx.quadraticCurveTo(t.x + k * 2.5, t.y - 4 * t.s, t.x + k * 3.2, t.y - 7 * t.s);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(160,210,100,0.35)';
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + 1, t.y - 6 * t.s); ctx.stroke();
      } else if (t.kind === 'flower') {
        ctx.fillStyle = flowerC[t.c];
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(t.x + k * 4 - 4, t.y + (k % 2) * 3, 1.8 * t.s, 0, TAU); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(90,90,80,0.7)';
        ctx.beginPath(); ctx.ellipse(t.x, t.y, 3 * t.s, 2 * t.s, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(200,200,190,0.4)';
        ctx.beginPath(); ctx.ellipse(t.x - 0.8, t.y - 0.8, 1.5 * t.s, 1 * t.s, 0.3, 0, TAU); ctx.fill();
      }
    }

    // Дороги: край, полотно, светлая середина, камушки.
    const stroke = (pts, w, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = w;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
    };
    const roads = map.paths.map(p => p.ownPts);
    roads.forEach(pts => stroke(pts, T * 0.86 + 10, 'rgba(40,30,15,0.25)'));
    roads.forEach(pts => stroke(pts, T * 0.86 + 5, '#6e5431'));
    roads.forEach(pts => stroke(pts, T * 0.86, '#b98f59'));
    roads.forEach(pts => stroke(pts, T * 0.56, 'rgba(214,178,120,0.55)'));
    // Колеи и камушки
    for (const p of map.paths) {
      const pts = p.ownPts;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
        for (let d = 0; d < L; d += 5) {
          if (rng() < 0.55) continue;
          const f = d / L, o = (rng() - 0.5) * T * 0.7;
          const x = a.x + (b.x - a.x) * f + nx * o, y = a.y + (b.y - a.y) * f + ny * o;
          ctx.fillStyle = rng() < 0.6 ? 'rgba(110,80,45,0.45)' : 'rgba(235,210,160,0.4)';
          ctx.beginPath(); ctx.arc(x, y, 0.8 + rng() * 1.6, 0, TAU); ctx.fill();
        }
      }
    }

    // Едва заметные стрелки направления — своим цветом у каждой дорожки.
    for (const p of map.paths) {
      const pts = p.ownPts;
      let acc = 18;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
        while (acc < L) {
          const x = a.x + ux * acc, y = a.y + uy * acc;
          if (x > 4 && y > 4 && x < TD.W - 4 && y < TD.H - 4) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(uy, ux));
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(60,40,20,0.1)'; ctx.lineWidth = 4.2;
            ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(3, 0); ctx.lineTo(-4, 6); ctx.stroke();
            ctx.strokeStyle = hexA(p.color, 0.22); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(3, 0); ctx.lineTo(-4, 6); ctx.stroke();
            ctx.restore();
          }
          acc += 34;
        }
        acc -= L;
      }
    }

    // Декор: деревья, ели, валуны (клетка занята).
    const decos = map.deco.slice().sort((a, b) => a.y - b.y);
    for (const d of decos) drawDeco(ctx, (d.x + 0.5 + d.ox) * T, (d.y + 0.5 + d.oy) * T, d, rng);
    return c;
  };

  function drawDeco(ctx, x, y, d, rng) {
    const s = d.s;
    if (d.kind === 'rock') {
      shadow(ctx, x + 2, y + 9 * s, 16 * s, 6 * s, 0.3);
      ctx.fillStyle = '#7f7a70';
      ctx.strokeStyle = '#3f3a33'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 15 * s, y + 8 * s); ctx.lineTo(x - 11 * s, y - 5 * s); ctx.lineTo(x - 2 * s, y - 11 * s);
      ctx.lineTo(x + 10 * s, y - 7 * s); ctx.lineTo(x + 15 * s, y + 7 * s); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(x - 10 * s, y - 4 * s); ctx.lineTo(x - 2 * s, y - 10 * s); ctx.lineTo(x + 2 * s, y - 2 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(90,140,60,0.6)';
      ctx.beginPath(); ctx.ellipse(x + 6 * s, y + 6 * s, 5 * s, 2 * s, 0, 0, TAU); ctx.fill();
    } else if (d.kind === 'pine') {
      shadow(ctx, x + 4, y + 12 * s, 15 * s, 6 * s, 0.32);
      ctx.fillStyle = '#5a3b22'; ctx.fillRect(x - 2.5 * s, y + 4 * s, 5 * s, 9 * s);
      const layers = [[0, 17], [-9, 14], [-17, 10]];
      for (const [oy, w] of layers) {
        ctx.fillStyle = '#244d2c';
        ctx.strokeStyle = '#15301b'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + (oy - 16) * s); ctx.lineTo(x + w * s, y + (oy + 6) * s); ctx.lineTo(x - w * s, y + (oy + 6) * s); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(140,200,120,0.18)';
        ctx.beginPath(); ctx.moveTo(x, y + (oy - 16) * s); ctx.lineTo(x - w * s, y + (oy + 6) * s); ctx.lineTo(x - w * 0.3 * s, y + (oy + 6) * s); ctx.closePath(); ctx.fill();
      }
    } else {
      shadow(ctx, x + 4, y + 13 * s, 18 * s, 7 * s, 0.32);
      ctx.fillStyle = '#6a4526'; ctx.fillRect(x - 3 * s, y + 2 * s, 6 * s, 12 * s);
      const blobs = [[-8, -4, 11], [8, -4, 11], [0, -12, 12], [0, -2, 12]];
      ctx.fillStyle = '#2e6a2f';
      ctx.strokeStyle = '#1a3f1c'; ctx.lineWidth = 2;
      ctx.beginPath();
      blobs.forEach(([bx, by, r]) => { ctx.moveTo(x + (bx + r) * s, y + by * s); ctx.arc(x + bx * s, y + by * s, r * s, 0, TAU); });
      ctx.stroke(); ctx.fill();
      ctx.fillStyle = 'rgba(150,210,110,0.28)';
      ctx.beginPath(); ctx.arc(x - 4 * s, y - 13 * s, 6 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200,60,60,0.8)';
      if (rng() < 0.4) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + (rng() - 0.5) * 20 * s, y + (-10 + rng() * 10) * s, 1.6 * s, 0, TAU); ctx.fill(); }
    }
  }

  // ---------------- Порталы появления ----------------
  function drawPortal(ctx, path, t) {
    const a = path.ownPts[1], s = path.spawn;
    const ang = s.side === 'left' ? Math.PI : s.side === 'top' ? -Math.PI / 2 : Math.PI / 2;
    const x = a.x + Math.cos(ang) * T * 0.22, y = a.y + Math.sin(ang) * T * 0.22;
    // Светящееся пятно на земле — видно, откуда пойдут враги.
    const pulse = 0.75 + Math.sin(t * 2.5 + path.id) * 0.25;
    const glow = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, T * 1.3);
    glow.addColorStop(0, hexA(path.color, 0.38 * pulse));
    glow.addColorStop(1, hexA(path.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(a.x, a.y, T * 1.3, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    // Каменная арка
    ctx.fillStyle = '#4a4540';
    ctx.strokeStyle = '#26221e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, T * 0.62, Math.PI, 0); ctx.lineTo(T * 0.62, 6); ctx.lineTo(-T * 0.62, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Тёмный проём со светящимся вихрем
    const gg = ctx.createRadialGradient(0, 0, 2, 0, 0, T * 0.5);
    gg.addColorStop(0, hexA(path.color, 0.95));
    gg.addColorStop(0.45, hexA(path.color, 0.35));
    gg.addColorStop(1, 'rgba(10,5,15,0.95)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, T * 0.47, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(path.color, 0.6); ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const r = T * (0.12 + k * 0.11);
      ctx.arc(0, 0, r, Math.PI + ((t * (1.5 + k * 0.4) + k) % 1) * Math.PI * 0.6, Math.PI * 1.6 + ((t * (1.5 + k * 0.4) + k) % 1) * Math.PI * 0.4);
      ctx.stroke();
    }
    // Камни арки
    ctx.fillStyle = '#6b655d';
    for (let k = 0; k <= 6; k++) {
      const q = Math.PI + k / 6 * Math.PI;
      ctx.beginPath(); ctx.arc(Math.cos(q) * T * 0.55, Math.sin(q) * T * 0.55, 4.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------- Замок ----------------
  function drawCastle(ctx, map, t, hitT) {
    const c = map.castle;
    const x = c.x * T, y = c.y * T, w = c.w * T, h = c.h * T;
    ctx.save();
    if (hitT > 0) ctx.translate(Math.sin(t * 90) * hitT * 10, 0);
    shadow(ctx, x + w / 2 + 6, y + h - 6, w * 0.62, 16, 0.35);
    const stone = '#a9a39a', stoneD = '#7c766d', outline = '#3a332c', roof = '#b3403a', roofD = '#7e2a26';
    const bricks = (bx, by, bw, bh) => {
      ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
      ctx.strokeStyle = 'rgba(60,50,40,0.25)'; ctx.lineWidth = 1;
      for (let yy = by + 7, row = 0; yy < by + bh; yy += 7, row++) {
        ctx.beginPath(); ctx.moveTo(bx, yy); ctx.lineTo(bx + bw, yy); ctx.stroke();
        for (let xx = bx + (row % 2 ? 6 : 0); xx < bx + bw; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, yy - 7); ctx.lineTo(xx, yy); ctx.stroke(); }
      }
      ctx.restore();
    };
    const merlons = (mx, my, mw, col) => {
      ctx.fillStyle = col; ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
      for (let xx = mx; xx < mx + mw - 3; xx += 9) { ctx.fillRect(xx, my - 6, 6, 7); ctx.strokeRect(xx, my - 6, 6, 7); }
    };
    const wallBlock = (bx, by, bw, bh, col) => {
      ctx.fillStyle = col; ctx.fillRect(bx, by, bw, bh);
      bricks(bx, by, bw, bh);
      const sh = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = sh; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
      merlons(bx + 1, by, bw, col);
    };
    const tower = (cx, top, bottom, r, flagPhase) => {
      ctx.fillStyle = stone; ctx.fillRect(cx - r, top, r * 2, bottom - top);
      bricks(cx - r, top, r * 2, bottom - top);
      const sh = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = sh; ctx.fillRect(cx - r, top, r * 2, bottom - top);
      ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.strokeRect(cx - r, top, r * 2, bottom - top);
      ctx.fillStyle = '#2a2018'; rr(ctx, cx - 3, top + 14, 6, 10, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,90,0.7)'; rr(ctx, cx - 2, top + 16, 4, 7, 2); ctx.fill();
      // Коническая крыша
      ctx.beginPath(); ctx.moveTo(cx - r - 4, top + 2); ctx.lineTo(cx, top - r * 2.3); ctx.lineTo(cx + r + 4, top + 2); ctx.closePath();
      const rg = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
      rg.addColorStop(0, roof); rg.addColorStop(1, roofD);
      ctx.fillStyle = rg; ctx.fill(); ctx.strokeStyle = outline; ctx.stroke();
      // Флаг
      const fy = top - r * 2.3;
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, fy); ctx.lineTo(cx, fy - 14); ctx.stroke();
      ctx.fillStyle = '#e8b957';
      ctx.beginPath(); ctx.moveTo(cx, fy - 14);
      const wv = Math.sin(t * 5 + flagPhase) * 2.5;
      ctx.quadraticCurveTo(cx + 7, fy - 16 + wv, cx + 14, fy - 11 + wv);
      ctx.quadraticCurveTo(cx + 7, fy - 8 - wv, cx, fy - 8);
      ctx.closePath(); ctx.fill();
    };
    // Задняя стена
    wallBlock(x + 14, y + 26, w - 22, h - 42, stoneD);
    // Донжон
    wallBlock(x + 46, y - 4, 56, h - 30, stone);
    ctx.fillStyle = '#2a2018'; rr(ctx, x + 66, y + 26, 16, 22, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,90,0.75)'; rr(ctx, x + 69, y + 30, 10, 16, 5); ctx.fill();
    ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 74, y + 30); ctx.lineTo(x + 74, y + 46); ctx.stroke();
    // Большое знамя на донжоне
    const bw = Math.sin(t * 3) * 3;
    ctx.fillStyle = '#8e1f18';
    ctx.beginPath(); ctx.moveTo(x + 60, y + 6); ctx.lineTo(x + 88, y + 6); ctx.lineTo(x + 88 + bw * 0.3, y + 20); ctx.lineTo(x + 74, y + 16 + bw * 0.2); ctx.lineTo(x + 60 + bw * 0.3, y + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8b957'; ctx.font = 'bold 9px serif'; ctx.textAlign = 'center'; ctx.fillText('♜', x + 74, y + 15);
    // Угловые башни
    tower(x + 22, y + 18, y + h - 12, 15, 0);
    tower(x + w - 16, y + 12, y + h - 14, 15, 1.7);
    tower(x + 74, y - 2, y + 2, 17, 3.1);
    // Передняя стена
    wallBlock(x + 30, y + h - 44, w - 56, 32, stone);
    // Надвратная башня слева (к ней идут враги)
    const gx = x - 4, gy = y + h * 0.36, gw = 36, gh = h * 0.52;
    wallBlock(gx, gy, gw, gh, stone);
    ctx.fillStyle = '#1b140f';
    ctx.beginPath(); ctx.moveTo(gx + 7, gy + gh); ctx.lineTo(gx + 7, gy + 22); ctx.arc(gx + gw / 2, gy + 22, gw / 2 - 7, Math.PI, 0); ctx.lineTo(gx + gw - 7, gy + gh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b5a45'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) { const xx = gx + 10 + k * 5.3; ctx.beginPath(); ctx.moveTo(xx, gy + 16); ctx.lineTo(xx, gy + gh - 20); ctx.stroke(); }
    for (let k = 0; k < 4; k++) { const yy = gy + 20 + k * 7; ctx.beginPath(); ctx.moveTo(gx + 8, yy); ctx.lineTo(gx + gw - 8, yy); ctx.stroke(); }
    // Факелы
    for (const fx of [gx - 3, gx + gw + 3]) {
      const fl = 0.7 + Math.sin(t * 17 + fx) * 0.15 + Math.sin(t * 29 + fx) * 0.1;
      const tg = ctx.createRadialGradient(fx, gy + 18, 0, fx, gy + 18, 18 * fl);
      tg.addColorStop(0, 'rgba(255,200,90,0.55)'); tg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(fx, gy + 18, 18 * fl, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.ellipse(fx, gy + 16, 2.2, 4 * fl, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a3020'; ctx.fillRect(fx - 1, gy + 19, 2, 7);
    }
    if (hitT > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,40,20,${hitT * 1.2})`;
      ctx.fillRect(x - 10, y - 60, w + 20, h + 70);
    }
    ctx.restore();
  }

  // ---------------- Вышки ----------------
  // Рисуется в локальных координатах: (0,0) — центр клетки.
  TD.drawTower = function (ctx, def, o) {
    o = o || {};
    const ang = o.angle !== undefined ? o.angle : -Math.PI / 4;
    const rec = (o.recoil || 0);
    const t = o.t || 0;
    const outline = '#2a2018';
    shadow(ctx, 3, 14, 21, 8, 0.32);

    const head = (fn) => { ctx.save(); ctx.translate(0, -9); ctx.rotate(ang); fn(); ctx.restore(); };

    if (def.id === 'rattle') {
      // Деревянная площадка
      ctx.fillStyle = '#6b4a2b'; ctx.strokeStyle = outline; ctx.lineWidth = 2;
      oct(ctx, 0, 4, 18); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let k = -12; k <= 12; k += 6) { ctx.beginPath(); ctx.moveTo(k, -12); ctx.lineTo(k, 20); ctx.stroke(); }
      ctx.fillStyle = '#8a6238'; oct(ctx, 0, -4, 14); ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke();
      head(() => {
        ctx.translate(-rec * 3, 0);
        // Приклад и ложе
        ctx.fillStyle = '#5a3a1e'; rr(ctx, -12, -4, 26, 8, 3); ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();
        // Барабан магазина
        ctx.fillStyle = '#c9982f'; ctx.beginPath(); ctx.arc(-4, 0, 6.5, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6b4a12';
        for (let k = 0; k < 6; k++) { const q = k / 6 * TAU + t * (o.firing ? 20 : 0); ctx.beginPath(); ctx.arc(-4 + Math.cos(q) * 3.8, Math.sin(q) * 3.8, 1.2, 0, TAU); ctx.fill(); }
        // Дуга арбалета
        ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(8, -13); ctx.quadraticCurveTo(15, 0, 8, 13); ctx.stroke();
        ctx.strokeStyle = '#e8b957'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(8, -13); ctx.quadraticCurveTo(15, 0, 8, 13); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,230,0.7)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(8, -13); ctx.lineTo(2, 0); ctx.lineTo(8, 13); ctx.stroke();
        ctx.fillStyle = '#d8d0c0'; ctx.fillRect(10, -1.2, 9, 2.4);
      });
      if (o.reload > 0) reloadRing(ctx, o.reload, def.color);
    } else if (def.id === 'thunder') {
      ctx.fillStyle = '#6f6a62'; ctx.strokeStyle = outline; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 6, 20, 13, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8d877d'; ctx.beginPath(); ctx.ellipse(0, 1, 18, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let k = 0; k < 8; k++) { const q = k / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(q) * 10, 1 + Math.sin(q) * 6); ctx.lineTo(Math.cos(q) * 18, 1 + Math.sin(q) * 11); ctx.stroke(); }
      head(() => {
        ctx.translate(-rec * 5, 0);
        const bg = ctx.createLinearGradient(0, -9, 0, 9);
        bg.addColorStop(0, '#e1a760'); bg.addColorStop(0.5, '#b8742f'); bg.addColorStop(1, '#6d3e14');
        ctx.fillStyle = bg; ctx.strokeStyle = outline; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(14, -9.5); ctx.lineTo(16, -10.5); ctx.lineTo(16, 10.5); ctx.lineTo(14, 9.5); ctx.lineTo(-10, 8); ctx.quadraticCurveTo(-16, 0, -10, -8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.ellipse(16, 0, 2.5, 8, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#6d3e14'; ctx.lineWidth = 2;
        [-2, 7].forEach(bx => { ctx.beginPath(); ctx.moveTo(bx, -9); ctx.lineTo(bx, 9); ctx.stroke(); });
        if (o.firing) { ctx.fillStyle = `rgba(255,190,80,${o.firing * 6})`; ctx.beginPath(); ctx.arc(20, 0, 9, 0, TAU); ctx.fill(); }
      });
    } else if (def.id === 'dragon') {
      ctx.fillStyle = '#3a302c'; ctx.strokeStyle = outline; ctx.lineWidth = 2;
      oct(ctx, 0, 4, 19); ctx.fill(); ctx.stroke();
      // Лавовые трещины
      ctx.strokeStyle = `rgba(255,${120 + Math.sin(t * 3) * 40 | 0},40,0.8)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(-6, 8); ctx.lineTo(-9, 16); ctx.moveTo(10, -6); ctx.lineTo(6, 4); ctx.lineTo(13, 12); ctx.stroke();
      ctx.fillStyle = '#4a3d38'; oct(ctx, 0, -4, 14); ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke();
      head(() => {
        // Голова дракона
        ctx.fillStyle = '#a3261c'; ctx.strokeStyle = outline; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-10, -8); ctx.quadraticCurveTo(4, -11, 17, -4); ctx.lineTo(17, -1); ctx.lineTo(9, 0); ctx.lineTo(17, 1); ctx.lineTo(17, 4); ctx.quadraticCurveTo(4, 11, -10, 8); ctx.quadraticCurveTo(-15, 0, -10, -8); ctx.fill(); ctx.stroke();
        // Рога
        ctx.fillStyle = '#e8d9b8';
        ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-17, -13); ctx.lineTo(-4, -8.5); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(-17, 13); ctx.lineTo(-4, 8.5); ctx.fill(); ctx.stroke();
        // Глаза
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.ellipse(1, -5, 2.2, 1.3, 0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(1, 5, 2.2, 1.3, -0.3, 0, TAU); ctx.fill();
        // Чешуя
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
        for (let k = -6; k < 6; k += 4) { ctx.beginPath(); ctx.arc(k, 0, 3, -1.2, 1.2); ctx.stroke(); }
        if (o.firing) {
          const fg = ctx.createRadialGradient(18, 0, 0, 18, 0, 12);
          fg.addColorStop(0, 'rgba(255,240,150,0.9)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
          ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(18, 0, 12, 0, TAU); ctx.fill();
        }
      });
    } else if (def.id === 'falcon') {
      // Высокое белокаменное основание с синим стягом
      ctx.fillStyle = '#cfc8ba'; ctx.strokeStyle = outline; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-15, 18); ctx.lineTo(-12, -6); ctx.lineTo(12, -6); ctx.lineTo(15, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let yy = 0; yy < 18; yy += 6) { ctx.beginPath(); ctx.moveTo(-14, yy); ctx.lineTo(14, yy); ctx.stroke(); }
      ctx.fillStyle = '#2f6fb3';
      ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(5, -4); ctx.lineTo(5, 12); ctx.lineTo(0, 9); ctx.lineTo(-5, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8b957'; ctx.beginPath(); ctx.arc(0, 2, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e7e1d4'; ctx.strokeStyle = outline; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -8, 14, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      head(() => {
        ctx.translate(-rec * 4, 0);
        ctx.fillStyle = '#4b3a2a'; ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
        rr(ctx, -12, -3, 34, 6, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9fb8c8'; ctx.beginPath(); ctx.moveTo(22, -3); ctx.lineTo(28, 0); ctx.lineTo(22, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(4, -16); ctx.quadraticCurveTo(14, 0, 4, 16); ctx.stroke();
        ctx.strokeStyle = '#6fc3ff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(4, -16); ctx.quadraticCurveTo(14, 0, 4, 16); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,245,255,0.8)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(4, -16); ctx.lineTo(-6 + rec * 6, 0); ctx.lineTo(4, 16); ctx.stroke();
        ctx.fillStyle = '#6fc3ff'; ctx.shadowColor = '#6fc3ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(-8, 0, 2.5, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      });
    }
  };
  function oct(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const q = (k + 0.5) / 8 * TAU;
      const px = x + Math.cos(q) * r, py = y + Math.sin(q) * r * 0.72;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function reloadRing(ctx, f, col) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 22, 5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 22, 5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - f)); ctx.stroke();
    ctx.restore();
  }

  // ---------------- Гоблин ----------------
  function drawGoblin(ctx, e, o) {
    const b = TD.enemyBox(e);
    const img = IMG[e.view];
    shadow(ctx, e.x, e.y + 13 * e.size, 13 * e.size - e.bob * 0.6, 4.5 * e.size, 0.32);
    if (o && o.selected) {
      const pulse = 0.5 + Math.sin(o.t * 6) * 0.5;
      ctx.save();
      ctx.strokeStyle = `rgba(255,217,138,${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 13 * e.size, 17 * e.size + pulse * 3, 7 * e.size + pulse, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (!img) return;
    ctx.save();
    ctx.translate(b.cx, b.cy);
    if (e.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -b.W / 2, -b.H / 2, b.W, b.H);
    if (e.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, e.hitFlash * 7) * 0.75;
      ctx.drawImage(WHITE[e.view], -b.W / 2, -b.H / 2, b.W, b.H);
    }
    ctx.restore();
    // Полоска здоровья
    if (e.hp < e.hpMax) {
      const w = 30 * Math.max(1, e.size), x = e.x - w / 2, y = b.cy - b.H / 2 - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(ctx, x - 1, y - 1, w + 2, 5, 2.5); ctx.fill();
      const f = e.hp / e.hpMax;
      ctx.fillStyle = f > 0.5 ? '#7fd46a' : f > 0.25 ? '#f0b93a' : '#ff5a44';
      rr(ctx, x, y, w * f, 3, 1.5); ctx.fill();
    }
  }

  // ---------------- Снаряды ----------------
  function drawProjectile(ctx, p) {
    const a = Math.atan2(p.vy, p.vx);
    if (p.kind === 'bolt') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      const g = ctx.createLinearGradient(-14, 0, 0, 0);
      g.addColorStop(0, 'rgba(255,210,110,0)'); g.addColorStop(1, 'rgba(255,220,130,0.8)');
      ctx.fillStyle = g; ctx.fillRect(-14, -1.2, 14, 2.4);
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (p.kind === 'lance') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      const g = ctx.createLinearGradient(-40, 0, 0, 0);
      g.addColorStop(0, 'rgba(111,195,255,0)'); g.addColorStop(1, 'rgba(160,220,255,0.9)');
      ctx.fillStyle = g; ctx.fillRect(-40, -1.5, 40, 3);
      ctx.shadowColor = '#6fc3ff'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#e8f7ff'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (p.kind === 'shell') {
      ctx.save();
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.6);
      g.addColorStop(0, 'rgba(255,160,60,0.5)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2622'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.35, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (p.kind === 'flame') {
      const life = Math.min(1, p.traveled / p.maxTravel);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const R = p.r * 1.7;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      g.addColorStop(0, `rgba(255,${240 - life * 120 | 0},${150 - life * 130 | 0},${0.9 - life * 0.5})`);
      g.addColorStop(0.55, `rgba(255,${120 - life * 60 | 0},20,${0.55 - life * 0.35})`);
      g.addColorStop(1, 'rgba(200,30,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ---------------- Эффекты ----------------
  const fx = [];
  TD.fx = fx;
  function spawnFx(o) { fx.push(Object.assign({ age: 0 }, o)); if (fx.length > 900) fx.shift(); }

  TD.consumeEvents = function (game, ui) {
    for (const ev of game.events) {
      if (ev.type === 'hit') {
        const col = ev.kind === 'lance' ? '#bfe6ff' : '#ffe39a';
        for (let i = 0; i < 6; i++) { const q = Math.random() * TAU, s = 40 + Math.random() * 90; spawnFx({ t: 'spark', x: ev.x, y: ev.y, vx: Math.cos(q) * s, vy: Math.sin(q) * s, life: 0.25, col }); }
      } else if (ev.type === 'explode') {
        spawnFx({ t: 'ring', x: ev.x, y: ev.y, r: ev.r, life: 0.45 });
        spawnFx({ t: 'flash', x: ev.x, y: ev.y, r: ev.r * 0.8, life: 0.2 });
        for (let i = 0; i < 16; i++) { const q = Math.random() * TAU, s = 30 + Math.random() * 120; spawnFx({ t: 'spark', x: ev.x, y: ev.y, vx: Math.cos(q) * s, vy: Math.sin(q) * s, life: 0.4, col: i % 2 ? '#ffb454' : '#ffe08a' }); }
        for (let i = 0; i < 7; i++) { const q = Math.random() * TAU; spawnFx({ t: 'smoke', x: ev.x + Math.cos(q) * 10, y: ev.y + Math.sin(q) * 10, vx: Math.cos(q) * 15, vy: Math.sin(q) * 15 - 10, life: 0.9, s: 8 + Math.random() * 8 }); }
      } else if (ev.type === 'burn') {
        if (Math.random() < 0.5) spawnFx({ t: 'ember', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40, life: 0.5 });
      } else if (ev.type === 'dmg') {
        // Урон от огня копится в одной цифре над врагом, чтобы числа не налезали друг на друга.
        const prev = ev.fire && fx.find(f => f.t === 'num' && f.fire && f.eid === ev.eid && f.age < 0.45);
        if (prev) { prev.v += ev.v; prev.x = ev.x; prev.y = ev.y; prev.age = Math.min(prev.age, 0.15); }
        else spawnFx({ t: 'num', x: ev.x + (Math.random() - 0.5) * 12, y: ev.y, v: ev.v, fire: ev.fire, eid: ev.eid, life: ev.fire ? 0.9 : 0.8 });
      } else if (ev.type === 'death') {
        const e = ev.e;
        spawnFx({ t: 'corpse', e: { view: e.view, flip: e.flip, size: e.size, x: e.x, y: e.y, bob: e.bob }, life: 0.7 });
        spawnFx({ t: 'coin', x: e.x, y: e.y - 30, v: ev.gold, life: 1.0 });
        for (let i = 0; i < 8; i++) { const q = Math.random() * TAU; spawnFx({ t: 'smoke', x: e.x, y: e.y - 6, vx: Math.cos(q) * 30, vy: Math.sin(q) * 20 - 12, life: 0.6, s: 5 + Math.random() * 5 }); }
      } else if (ev.type === 'castle') {
        ui.castleHitT = 0.35;
        spawnFx({ t: 'num', x: ev.e.x, y: ev.e.y - 50, v: -ev.dmg, castle: true, life: 1.1 });
      } else if (ev.type === 'fire') {
        if (ev.kind === 'shell') for (let i = 0; i < 4; i++) spawnFx({ t: 'smoke', x: ev.x + Math.cos(ev.a) * 10, y: ev.y + Math.sin(ev.a) * 10, vx: Math.cos(ev.a) * 30 + (Math.random() - 0.5) * 20, vy: Math.sin(ev.a) * 30 - 10, life: 0.6, s: 5 + Math.random() * 4 });
        if (ev.kind === 'flame') for (let i = 0; i < 2; i++) spawnFx({ t: 'ember', x: ev.x, y: ev.y, vx: Math.cos(ev.a + (Math.random() - 0.5) * 0.9) * (70 + Math.random() * 60), vy: Math.sin(ev.a + (Math.random() - 0.5) * 0.9) * (70 + Math.random() * 60), life: 0.35 });
      } else if (ev.type === 'build' || ev.type === 'sell') {
        for (let i = 0; i < 12; i++) { const q = Math.random() * TAU; spawnFx({ t: 'smoke', x: ev.x + Math.cos(q) * 14, y: ev.y + 10 + Math.sin(q) * 6, vx: Math.cos(q) * 25, vy: -8, life: 0.6, s: 5 + Math.random() * 5, light: true }); }
        if (ev.type === 'sell') spawnFx({ t: 'coin', x: ev.x, y: ev.y - 20, v: ev.gold, life: 1.0 });
      } else if (ev.type === 'stubborn') {
        spawnFx({ t: 'text', x: ev.e.x, y: ev.e.y - 44, s: 'Упрямец!', col: '#ffcc4d', life: 1.1 });
      }
    }
    game.events.length = 0;
  };

  function drawFx(ctx, dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.age += dt;
      if (f.age >= f.life) { fx.splice(i, 1); continue; }
      const k = f.age / f.life;
      if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; }
      ctx.save();
      if (f.t === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.04, f.y - f.vy * 0.04); ctx.stroke();
      } else if (f.t === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,${180 - k * 120 | 0},60,${1 - k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 2.2 * (1 - k) + 0.6, 0, TAU); ctx.fill();
      } else if (f.t === 'smoke') {
        ctx.fillStyle = f.light ? `rgba(230,215,190,${0.45 * (1 - k)})` : `rgba(60,55,50,${0.45 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.s * (0.6 + k), 0, TAU); ctx.fill();
      } else if (f.t === 'ring') {
        ctx.strokeStyle = `rgba(255,200,110,${0.8 * (1 - k)})`; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * Math.sqrt(k)), 0, TAU); ctx.stroke();
      } else if (f.t === 'flash') {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(255,240,180,${1 - k})`); g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      } else if (f.t === 'num') {
        const y = f.y - k * 22;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = f.castle ? 'bold 18px Philosopher, sans-serif' : f.fire ? 'bold 12px Philosopher, sans-serif' : 'bold 13px Philosopher, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        const s = f.castle ? `♜ ${f.v}` : (Math.round(f.v * 10) / 10).toString().replace('.', ',');
        ctx.strokeText(s, f.x, y);
        ctx.fillStyle = f.castle ? '#ff6a55' : f.fire ? '#ffb454' : '#fff2d0';
        ctx.fillText(s, f.x, y);
      } else if (f.t === 'text') {
        ctx.globalAlpha = 1 - k; ctx.font = 'bold 14px Philosopher, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.s, f.x, f.y - k * 20);
        ctx.fillStyle = f.col; ctx.fillText(f.s, f.x, f.y - k * 20);
      } else if (f.t === 'coin') {
        const y = f.y - k * 26;
        ctx.globalAlpha = 1 - k * k;
        const g = ctx.createRadialGradient(f.x - 9, y - 5, 0, f.x - 8, y - 4, 6);
        g.addColorStop(0, '#fff1b8'); g.addColorStop(0.5, '#f0b93a'); g.addColorStop(1, '#9b6612');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x - 8, y - 4, 5, 0, TAU); ctx.fill();
        ctx.font = 'bold 13px Philosopher, sans-serif'; ctx.textAlign = 'left';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText('+' + f.v, f.x - 1, y);
        ctx.fillStyle = '#ffd98a'; ctx.fillText('+' + f.v, f.x - 1, y);
      } else if (f.t === 'corpse') {
        const e = f.e, b = TD.enemyBox(e), img = IMG[e.view];
        if (img) {
          ctx.globalAlpha = 1 - k;
          ctx.translate(b.cx, b.cy + b.H / 2);
          ctx.rotate((e.flip ? -1 : 1) * k * 1.4);
          if (e.flip) ctx.scale(-1, 1);
          ctx.filter = 'grayscale(0.7) brightness(0.8)';
          ctx.drawImage(img, -b.W / 2, -b.H, b.W, b.H);
        }
      }
      ctx.restore();
    }
  }

  // ---------------- Кадр ----------------
  TD.renderFrame = function (ctx, game, view, ui, dt) {
    const { scale, ox, oy, dpr } = view;
    const t = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f0c09';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, TD.W, TD.H); ctx.clip();
    if (ui.bg) ctx.drawImage(ui.bg, 0, 0, TD.W, TD.H);

    // Сетка при строительстве
    if (ui.placing) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      for (let x = 0; x <= TD.COLS; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, TD.H); ctx.stroke(); }
      for (let y = 0; y <= TD.ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(TD.W, y * T); ctx.stroke(); }
      for (let y = 0; y < TD.ROWS; y++) for (let x = 0; x < TD.COLS; x++) {
        if (game.canBuild(x, y)) { ctx.fillStyle = 'rgba(160,255,140,0.05)'; ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); }
      }
    }

    for (const p of game.map.paths) drawPortal(ctx, p, t);

    // Радиус выбранной вышки
    const selT = ui.selectedTower;
    if (selT) rangeCircle(ctx, selT.cx, selT.cy, selT.act.range * T, selT.def.color, t);

    // Сортировка по глубине: вышки, враги, замок
    const items = [];
    for (const tw of game.towers) items.push({ y: tw.cy + 14, f: () => { ctx.save(); ctx.translate(tw.cx, tw.cy); TD.drawTower(ctx, tw.def, { angle: tw.angle, recoil: tw.recoil, firing: tw.firing, reload: tw.def.burst && tw.cd > tw.def.burst.gap ? tw.cd / tw.def.burst.reload : 0, t }); ctx.restore(); } });
    for (const e of game.enemies) items.push({ y: e.y + 12, f: () => drawGoblin(ctx, e, { selected: ui.selectedEnemy === e.id, t }) });
    const c = game.map.castle;
    items.push({ y: (c.y + c.h) * T - 8, f: () => drawCastle(ctx, game.map, t, ui.castleHitT || 0) });
    items.sort((a, b) => a.y - b.y);
    items.forEach(i => i.f());

    for (const p of game.projectiles) drawProjectile(ctx, p);
    drawFx(ctx, dt);

    // Призрак размещаемой вышки
    if (ui.placing && ui.hover) {
      const { tx, ty } = ui.hover;
      const ok = game.canBuild(tx, ty) && game.gold >= ui.placing.price;
      const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
      rangeCircle(ctx, cx, cy, TD.F.range(ui.placing.stats.range) * T, ok ? ui.placing.color : '#ff5a44', t);
      ctx.fillStyle = ok ? 'rgba(140,255,120,0.18)' : 'rgba(255,80,60,0.22)';
      ctx.strokeStyle = ok ? 'rgba(160,255,140,0.8)' : 'rgba(255,100,80,0.9)';
      ctx.lineWidth = 2;
      rr(ctx, tx * T + 2, ty * T + 2, T - 4, T - 4, 8); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalAlpha = 0.75; ctx.translate(cx, cy);
      TD.drawTower(ctx, ui.placing, { angle: -Math.PI / 4, t });
      ctx.restore();
    }

    // Виньетка
    const vg = ctx.createRadialGradient(TD.W / 2, TD.H / 2, TD.H * 0.45, TD.W / 2, TD.H / 2, TD.W * 0.68);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,2,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, TD.W, TD.H);
    ctx.restore();

    // Рамка поля
    ctx.strokeStyle = 'rgba(232,185,87,0.35)'; ctx.lineWidth = 2 / scale;
    ctx.strokeRect(0, 0, TD.W, TD.H);
  };

  function rangeCircle(ctx, x, y, r, col, t) {
    ctx.save();
    ctx.fillStyle = hexA(col.length === 7 ? col : '#ffffff', 0.08);
    ctx.strokeStyle = hexA(col.length === 7 ? col : '#ffffff', 0.7);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
})();
