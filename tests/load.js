// Загружает игровые скрипты (без DOM) в глобальный контекст Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
// Тесты по умолчанию без тёмных кристаллов (они меняют баланс и цели вышек); свои тесты включают их явно.
globalThis.TD = globalThis.TD || {};
globalThis.TD.NO_CRYSTALS = true;
for (const f of ['js/data.js', 'js/masks.js', 'js/mapgen.js', 'js/sim.js', 'js/progress.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
module.exports = globalThis.TD;
