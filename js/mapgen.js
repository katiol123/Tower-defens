// Процедурная генерация уровня: 1–3 дорожки, петли и пересечения, слияния, замок.
var TD = globalThis.TD || (globalThis.TD = {});

// Детерминированный генератор (mulberry32) — чтобы тесты были воспроизводимы.
TD.makeRng = function (seed) {
  let a = seed >>> 0;
  const rng = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.pick = arr => arr[Math.floor(rng() * arr.length)];
  rng.chance = p => rng() < p;
  return rng;
};

TD.PATH_COLORS = ['#ff6b6b', '#7ad1ff', '#c78bff'];

(function () {
  const C = () => TD.COLS, R = () => TD.ROWS;
  const key = (x, y) => x + ',' + y;

  // Прямоугольный маршрут между двумя клетками: сначала по одной оси, потом по другой.
  function lRoute(a, b, horizFirst) {
    const out = [];
    let x = a.x, y = a.y;
    const stepX = () => { while (x !== b.x) { x += Math.sign(b.x - x); out.push({ x, y }); } };
    const stepY = () => { while (y !== b.y) { y += Math.sign(b.y - y); out.push({ x, y }); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    return out;
  }

  function edgeKey(a, b) {
    return a.x < b.x || (a.x === b.x && a.y < b.y) ? key(a.x, a.y) + '|' + key(b.x, b.y) : key(b.x, b.y) + '|' + key(a.x, a.y);
  }

  function buildTiles(points, rng) {
    const tiles = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const seg = lRoute(tiles[tiles.length - 1], points[i], rng.chance(0.5));
      tiles.push(...seg);
    }
    return tiles;
  }

  // Проверка и оценка одной дорожки. Возвращает штраф или Infinity, если дорожка негодна.
  function scorePath(tiles, blocked, usedEdges, usedTiles, allowOverlapFrom) {
    const edges = new Set();
    let penalty = 0, crossings = 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.x < 0 || t.y < 0 || t.x >= C() || t.y >= R()) return Infinity;
      if (blocked.has(key(t.x, t.y)) && i < tiles.length - 1) return Infinity;
      if (i >= 2 && tiles[i - 2].x === t.x && tiles[i - 2].y === t.y) return Infinity; // разворот назад
      if (i > 0) {
        const e = edgeKey(tiles[i - 1], t);
        if (edges.has(e)) return Infinity; // дорога идёт по самой себе
        edges.add(e);
        if (usedEdges.has(e) && i < allowOverlapFrom) penalty += 6; // едет вдоль чужой дороги
      }
    }
    // Самопересечения и пересечения с другими дорожками (петли) — желательны, но в меру.
    const seen = new Map();
    tiles.forEach((t, i) => {
      const k = key(t.x, t.y);
      if (seen.has(k) && i - seen.get(k) > 2) crossings++;
      seen.set(k, i);
      if (usedTiles.has(k) && i < allowOverlapFrom) crossings++;
    });
    // Параллельные соседние полосы выглядят как одна широкая дорога — штраф.
    const own = new Map();
    tiles.forEach((t, i) => own.set(key(t.x, t.y), i));
    for (let i = 1; i < tiles.length; i++) {
      const t = tiles[i], p = tiles[i - 1];
      const dx = t.x - p.x, dy = t.y - p.y;
      for (const s of [-1, 1]) {
        const nx = t.x + dy * s, ny = t.y + dx * s;
        const k = key(nx, ny);
        const j = own.get(k);
        if (j !== undefined && Math.abs(j - i) > 3) {
          const q = tiles[j], q2 = tiles[j - 1] || tiles[j + 1];
          if (q2 && (q2.x - q.x === dx || q2.x - q.x === -dx) && (q2.y - q.y === dy || q2.y - q.y === -dy)) penalty += 3;
        }
        if (usedTiles.has(k) && i < allowOverlapFrom - 2) penalty += 2;
      }
    }
    penalty += Math.abs(Math.min(crossings, 3) - 2) * 1.2 + Math.max(0, crossings - 4) * 2;
    return penalty;
  }

  TD.generateMap = function (seed) {
    const rng = TD.makeRng(seed);
    const cols = C(), rows = R();

    // Замок 3×3 у правого края, ворота слева посередине.
    const castle = { x: cols - 4, y: rng.int(3, rows - 6), w: 3, h: 3 };
    const gateTile = { x: castle.x - 1, y: castle.y + 1 };
    const blocked = new Set();
    for (let x = castle.x - 1; x < castle.x + castle.w + 1; x++)
      for (let y = castle.y - 1; y < castle.y + castle.h + 1; y++) blocked.add(key(x, y));
    blocked.delete(key(gateTile.x, gateTile.y));

    // Количество дорожек: 2 или 3 с шансом по 1/2.
    const nPaths = rng() < 0.5 ? 2 : 3;

    // Точки появления на краях (левый край и левая часть верхнего/нижнего краёв).
    function spawnCandidate() {
      const side = rng.pick(['left', 'left', 'top', 'bottom']);
      if (side === 'left') return { x: 0, y: rng.int(1, rows - 2), side };
      if (side === 'top') return { x: rng.int(1, Math.floor(cols * 0.55)), y: 0, side };
      return { x: rng.int(1, Math.floor(cols * 0.55)), y: rows - 1, side };
    }

    const paths = [];
    const usedEdges = new Set(), usedTiles = new Set();

    for (let p = 0; p < nPaths; p++) {
      const mergeInto = p > 0 && rng.chance(0.5) ? rng.int(0, p - 1) : -1;
      let best = null;
      for (let attempt = 0; attempt < 260; attempt++) {
        let spawn;
        for (let k = 0; k < 40; k++) {
          spawn = spawnCandidate();
          if (paths.every(q => Math.abs(q.spawn.x - spawn.x) + Math.abs(q.spawn.y - spawn.y) >= 6)) break;
        }
        let target, mergeIdx = -1;
        if (mergeInto >= 0) {
          const own = paths[mergeInto].own;
          mergeIdx = rng.int(Math.floor(own.length * 0.3), Math.floor(own.length * 0.75));
          target = own[mergeIdx];
        } else {
          target = gateTile;
        }
        // Промежуточные точки: петляем по полю, двигаясь в целом к цели.
        const nWp = rng.int(2, 4);
        const pts = [spawn];
        for (let w = 1; w <= nWp; w++) {
          const f = w / (nWp + 1);
          const baseX = spawn.x + (target.x - spawn.x) * f;
          const wx = Math.round(baseX + rng.int(-5, 5));
          const wy = rng.int(1, rows - 2);
          pts.push({ x: Math.max(1, Math.min(cols - 5, wx)), y: wy });
        }
        // Иногда — явная петля: точка «позади» предыдущей, чтобы дорога пересекла сама себя.
        if (rng.chance(0.35) && pts.length >= 3) {
          const i = rng.int(1, pts.length - 1);
          const a = pts[i];
          pts.splice(i + 1, 0, { x: Math.max(1, a.x - rng.int(2, 4)), y: Math.max(1, Math.min(rows - 2, a.y + rng.pick([-3, -2, 2, 3]))) });
        }
        pts.push(target);
        const tiles = buildTiles(pts, rng);
        // Первая клетка дорожки — на краю, дальше дорога не должна снова выходить на край рядом с порталом.
        if (tiles.length < 26 || tiles.length > 95) continue;
        const allowFrom = mergeInto >= 0 ? tiles.length - 1 : tiles.length;
        let sc = scorePath(tiles, blocked, usedEdges, usedTiles, allowFrom);
        if (!isFinite(sc)) continue;
        // Для слияния: подход к точке слияния не должен идти вдоль целевой дороги.
        if (mergeInto >= 0) {
          const own = paths[mergeInto].own;
          const prev = tiles[tiles.length - 2];
          const a = own[mergeIdx - 1], b = own[mergeIdx + 1];
          if ((a && a.x === prev.x && a.y === prev.y) || (b && b.x === prev.x && b.y === prev.y)) continue;
        }
        sc += Math.abs(tiles.length - 55) * 0.05;
        if (!best || sc < best.sc) best = { sc, tiles, spawn, mergeInto, mergeIdx };
        if (sc < 1 && attempt > 40) break;
      }
      if (!best) return TD.generateMap(seed * 7 + 13); // крайне редко — пробуем другой сид
      const path = {
        id: p, spawn: best.spawn, own: best.tiles, mergeInto: best.mergeInto, mergeIdx: best.mergeIdx,
        color: TD.PATH_COLORS[p],
      };
      paths.push(path);
      for (let i = 0; i < path.own.length; i++) {
        usedTiles.add(key(path.own[i].x, path.own[i].y));
        if (i > 0) usedEdges.add(edgeKey(path.own[i - 1], path.own[i]));
      }
    }

    // Полный маршрут каждой дорожки (с продолжением после слияния) в клетках.
    function fullTiles(p) {
      const path = paths[p];
      if (path.mergeInto < 0) return path.own.slice();
      const rest = fullTiles(path.mergeInto);
      const target = paths[path.mergeInto].own[path.mergeIdx];
      const at = rest.findIndex(t => t.x === target.x && t.y === target.y);
      return path.own.concat(rest.slice(at + 1));
    }

    const T = TD.TILE;
    const center = t => ({ x: (t.x + 0.5) * T, y: (t.y + 0.5) * T });
    const gatePoint = { x: castle.x * T + 0.35 * T, y: (castle.y + 1.5) * T };
    paths.forEach(path => {
      const tiles = fullTiles(path.id);
      const pts = tiles.map(center);
      // Старт за краем карты, чтобы враги выходили из портала.
      const s = path.spawn, first = pts[0];
      const off = s.side === 'left' ? { x: -T, y: 0 } : s.side === 'top' ? { x: 0, y: -T } : { x: 0, y: T };
      pts.unshift({ x: first.x + off.x, y: first.y + off.y });
      pts.push(gatePoint);
      path.route = TD.simplifyRoute(pts);
      path.ownPts = [pts[0]].concat(path.own.map(center));
      if (path.mergeInto < 0) path.ownPts.push(gatePoint);
    });

    // Клетки дороги, замка и декор.
    const road = new Set();
    paths.forEach(p => p.own.forEach(t => road.add(key(t.x, t.y))));
    const castleSet = new Set();
    for (let x = castle.x; x < castle.x + castle.w; x++)
      for (let y = castle.y; y < castle.y + castle.h; y++) castleSet.add(key(x, y));
    const deco = [];
    const decoSet = new Set();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const k = key(x, y);
      if (road.has(k) || castleSet.has(k)) continue;
      if (x === castle.x - 1 && y >= castle.y - 1 && y <= castle.y + castle.h) continue;
      if (rng.chance(0.075)) {
        const kind = rng.pick(['tree', 'tree', 'pine', 'rock']);
        deco.push({ x, y, kind, s: 0.8 + rng() * 0.35, ox: (rng() - 0.5) * 0.2, oy: (rng() - 0.5) * 0.2 });
        decoSet.add(k);
      }
    }
    // Мелкий неблокирующий декор: трава, цветы, камушки.
    const tufts = [];
    for (let i = 0; i < 260; i++) {
      const x = rng() * cols, y = rng() * rows;
      if (road.has(key(Math.floor(x), Math.floor(y))) || castleSet.has(key(Math.floor(x), Math.floor(y)))) continue;
      tufts.push({ x: x * T, y: y * T, kind: rng.pick(['grass', 'grass', 'grass', 'flower', 'pebble']), c: rng.int(0, 3), s: 0.7 + rng() * 0.6 });
    }

    const buildable = (x, y) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      const k = key(x, y);
      return !road.has(k) && !castleSet.has(k) && !decoSet.has(k);
    };

    return { seed, cols, rows, castle, gatePoint, paths, road, castleSet, deco, decoSet, tufts, buildable, key };
  };

  // Убираем промежуточные точки на прямых — остаются только повороты.
  TD.simplifyRoute = function (pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) > 1e-6) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    // Кумулятивные длины для быстрого поиска позиции по пройденному пути.
    let acc = 0;
    const cum = [0];
    for (let i = 1; i < out.length; i++) {
      acc += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
      cum.push(acc);
    }
    return { pts: out, cum, length: acc };
  };

  // Позиция и направление на маршруте по пройденному расстоянию.
  TD.routeAt = function (route, d) {
    const { pts, cum } = route;
    if (d <= 0) {
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y, L = Math.hypot(dx, dy) || 1;
      return { x: pts[0].x + dx / L * d, y: pts[0].y + dy / L * d, dx: dx / L, dy: dy / L };
    }
    let lo = 0, hi = cum.length - 1;
    if (d >= cum[hi]) {
      const a = pts[hi - 1], b = pts[hi], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: b.x, y: b.y, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
    }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const a = pts[lo], b = pts[lo + 1], L = cum[lo + 1] - cum[lo];
    const f = (d - cum[lo]) / L;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
  };
})();
