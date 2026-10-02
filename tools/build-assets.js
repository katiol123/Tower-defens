// Готовит игровые спрайты юнитов и маски столкновений из исходников в assets/source.
// Запуск: node tools/build-assets.js  (нужен Playwright с Chromium)
// Результат: assets/<юнит>_{front,side,back}.png и js/masks.js
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const VIEWS = ['front', 'side', 'back'];
const CELL = 16;          // размер клетки маски в пикселях исходника
const OUT_SCALE = 0.3;    // масштаб игровой картинки
// Рамки обрезки (в пикселях исходника 1024×1024). Ширина и высота общие для всех ракурсов юнита,
// а смещение по вертикали подобрано так, чтобы ноги во всех ракурсах стояли на одной линии (foot).
const UNITS = {
  goblin: {
    src: v => `assets/source/goblin_${v}_minimal_transparent.png`,
    w: 816, h: 912, x: { front: 104, side: 104, back: 104 }, y: { front: 56, side: 56, back: 56 },
    foot: 905, sideFaces: 'left',
  },
  wolfrider: {
    src: v => `assets/source/wolfrider_${v}.png`,
    w: 856, h: 880, x: { front: 84, side: 84, back: 84 }, y: { front: 74, side: 34, back: 26 },
    foot: 864, sideFaces: 'right',
  },
  shaman: {
    src: v => `assets/source/shaman_${v}.png`,
    w: 640, h: 780, x: { front: 210, side: 210, back: 210 }, y: { front: 125, side: 114, back: 132 },
    foot: 770, sideFaces: 'right',
  },
  troll: {
    src: v => `assets/source/troll_${v}.png`,
    w: 620, h: 880, x: { front: 200, side: 200, back: 200 }, y: { front: 75, side: 35, back: 36 },
    foot: 870, sideFaces: 'right',
  },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sprites = {};
  for (const [unit, U] of Object.entries(UNITS)) {
    const masks = {};
    for (const v of VIEWS) {
      const src = fs.readFileSync(path.join(ROOT, U.src(v))).toString('base64');
      const CROP = { x: U.x[v], y: U.y[v], w: U.w, h: U.h };
      const res = await page.evaluate(async ({ src, CROP, CELL, OUT_SCALE }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = CROP.w; c.height = CROP.h;
        const x = c.getContext('2d');
        x.drawImage(img, -CROP.x, -CROP.y);
        const px = x.getImageData(0, 0, CROP.w, CROP.h).data;
        const gw = Math.ceil(CROP.w / CELL), gh = Math.ceil(CROP.h / CELL);
        const rows = [];
        for (let gy = 0; gy < gh; gy++) {
          let row = '';
          for (let gx = 0; gx < gw; gx++) {
            let on = 0, all = 0;
            for (let yy = gy * CELL; yy < Math.min(CROP.h, (gy + 1) * CELL); yy++)
              for (let xx = gx * CELL; xx < Math.min(CROP.w, (gx + 1) * CELL); xx++) {
                all++; if (px[(yy * CROP.w + xx) * 4 + 3] > 128) on++;
              }
            row += on * 2 >= all ? '1' : '0';
          }
          rows.push(row);
        }
        const o = document.createElement('canvas');
        o.width = Math.round(CROP.w * OUT_SCALE); o.height = Math.round(CROP.h * OUT_SCALE);
        const ox = o.getContext('2d');
        ox.imageSmoothingQuality = 'high';
        ox.drawImage(c, 0, 0, o.width, o.height);
        return { rows, gw, gh, png: o.toDataURL('image/png').split(',')[1] };
      }, { src, CROP, CELL, OUT_SCALE });
      fs.writeFileSync(path.join(ROOT, `assets/${unit}_${v}.png`), Buffer.from(res.png, 'base64'));
      masks[v] = res.rows;
      console.log(unit, v, res.gw + '×' + res.gh, 'cells');
    }
    sprites[unit] = { w: U.w, h: U.h, cell: CELL, foot: +(U.foot / U.h).toFixed(4), sideFaces: U.sideFaces, masks };
  }
  await browser.close();
  const out = '// Сгенерировано tools/build-assets.js — не редактировать вручную.\n' +
    '// Спрайты юнитов: размер рамки, доля высоты до ног (foot), куда смотрит боковой ракурс,\n' +
    '// маски непрозрачности (1 — клетка занята, альфа > 50%).\n' +
    'var TD = globalThis.TD || (globalThis.TD = {});\n' +
    `TD.SPRITES = ${JSON.stringify(sprites).replace(/\],/g, '],\n')};\n`;
  fs.writeFileSync(path.join(ROOT, 'js/masks.js'), out);
  console.log('js/masks.js written');
})();
