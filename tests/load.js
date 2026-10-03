// Загружает игровые скрипты (без DOM) в глобальный контекст Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
for (const f of ['js/data.js', 'js/masks.js', 'js/mapgen.js', 'js/sim.js', 'js/progress.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
module.exports = globalThis.TD;
