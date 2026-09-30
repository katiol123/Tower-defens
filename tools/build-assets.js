// Готовит игровые спрайты гоблина и маски столкновений из исходников в assets/source.
// Запуск: node tools/build-assets.js  (нужен Playwright с Chromium)
// Результат: assets/goblin_{front,side,back}.png и js/masks.js
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const VIEWS = ['front', 'side', 'back'];
// Общая рамка обрезки для всех ракурсов (в пикселях исходника 1024×1024),
// чтобы центр спрайта и масштаб совпадали во всех направлениях.
const CROP = { x: 104, y: 56, w: 816, h: 912 };
const CELL = 16;          // размер клетки маски в пикселях исходника
const OUT_SCALE = 0.3;    // масштаб игровой картинки

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const masks = {};
  for (const v of VIEWS) {
    const src = fs.readFileSync(path.join(ROOT, `assets/source/goblin_${v}_minimal_transparent.png`)).toString('base64');
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
    fs.writeFileSync(path.join(ROOT, `assets/goblin_${v}.png`), Buffer.from(res.png, 'base64'));
    masks[v] = res.rows;
    console.log(v, res.gw + '×' + res.gh, 'cells');
  }
  await browser.close();
  const out = '// Сгенерировано tools/build-assets.js — не редактировать вручную.\n' +
    '// Маски непрозрачности спрайтов гоблина: 1 — клетка спрайта занята (альфа > 50%).\n' +
    'var TD = globalThis.TD || (globalThis.TD = {});\n' +
    `TD.SPRITE_CROP = ${JSON.stringify({ w: CROP.w, h: CROP.h, cell: CELL })};\n` +
    `TD.GOBLIN_MASKS = ${JSON.stringify(masks, null, 0).replace(/\],/g, '],\n')};\n`;
  fs.writeFileSync(path.join(ROOT, 'js/masks.js'), out);
  console.log('js/masks.js written');
})();
