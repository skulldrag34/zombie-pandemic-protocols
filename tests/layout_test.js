const fs = require('fs');
const H = require('./harness.js');
const { $, loadSave, sleep, baseSave, makeChecker } = H;
const GAME = fs.readFileSync(H.GAME_PATH, 'utf8');

(async () => {
  const c = makeChecker('PHONE LAYOUT');
  const s = H.makeSession();
  loadSave(s.window, baseSave()); await sleep(300);
  const w = s.window;
  c.ok(w.getComputedStyle($(w, 'questChip')).display === 'none', 'the quest chip is actually hidden when there is no quest (was an empty box)');
  const field = $(w, 'tab-field');
  c.ok(field.querySelector('.panel-map #minimap') && field.querySelector('.panel-actions #btnN') && field.querySelector('.panel-log #logFeed'), 'field panels carry the map/actions/log hooks the phone layout orders by');
  const mq = (GAME.match(/@media \(max-width: 639px\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
  c.ok(/\.panel-map \{ order: 1; \}/.test(mq) && /\.panel-actions \{ order: 2; \}/.test(mq) && /\.panel-log \{ order: 3; \}/.test(mq), 'on phones the order is map -> actions -> log');
  c.ok(/\.minimap \{ max-width: 190px/.test(mq), 'on phones the minimap is capped at 190px');
  c.ok(/repeat\(3, 52px\)/.test(mq) && /min-height: 48px/.test(mq), 'phone tap targets are at least 48px tall');
  c.ok(/@media \(min-width: 640px\) \{ \.grid-2col \{ grid-template-columns: 190px 1fr; \} \}/.test(GAME), 'desktop two-column field layout is unchanged');
  s.window.close();
  c.done(s.errors);
})();
