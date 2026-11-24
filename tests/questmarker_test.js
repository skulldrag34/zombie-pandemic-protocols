// Vendor job markers on the minimap and world map: "!" on offer, "?" taken, green "?" ready to hand in.
const H = require('./harness.js');
const { $, q, tab, loadSave, sleep, baseSave, makeChecker } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const FETCH = (status) => ({ type: 'fetch', itemName: 'Cloth Strips', qtyNeeded: 5, rewardXp: 50, rewardCash: 20, rewardRepGain: 2, status });
const marker = (w, root) => { const m = q(w, `#${root} [data-quest-marker]`); return m ? m.getAttribute('data-quest-marker') + ':' + m.textContent : 'none'; };

(async () => {
  const c = makeChecker('QUEST MARKERS');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  let s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], vendorQuests: {} })); let w = s.window;
  c.ok(marker(w, 'minimap') === 'none', 'no job: no marker');
  done(s);

  s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], vendorQuests: { '0,0': FETCH('offered') } })); w = s.window;
  c.ok(marker(w, 'minimap') === 'offer:!', 'a job on offer shows "!" on the minimap');
  tab(w, 'worldmap');
  c.ok(marker(w, 'wmapGrid') === 'offer:!', 'and on the world map');
  const cell = q(w, '#minimap [data-quest-marker]').parentElement;
  c.ok(/job on offer: bring 5 Cloth Strips/.test(cell.title), `the cell tooltip names the job (${cell.title.slice(0, 70)}...)`);
  q(w, '#wmapGrid [data-quest-marker]').parentElement.dispatchEvent(new w.Event('click'));
  c.ok(/Job on offer: bring 5 Cloth Strips/.test($(w, 'wmapInfo').textContent), 'the sector panel names the job');
  c.ok(/Job on offer/.test($(w, 'wmapLegend').textContent) && /Job to hand in/.test($(w, 'mapLegend').textContent), 'both legends explain the markers');
  done(s);

  s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], inventory: { 'Cloth Strips': 2 }, vendorQuests: { '0,0': FETCH('active') } })); w = s.window;
  c.ok(marker(w, 'minimap') === 'taken:?', 'a taken job without the goods shows "?"');
  done(s);
  s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], inventory: { 'Cloth Strips': 9 }, vendorQuests: { '0,0': FETCH('active') } })); w = s.window;
  c.ok(marker(w, 'minimap') === 'ready:?', 'with the goods in hand it turns green: ready to hand in');
  done(s);
  s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], vendorQuests: { '0,0': { type: 'bounty', zombieLevelMin: 1, countNeeded: 2, progress: 2, rewardXp: 10, rewardCash: 5, rewardRepGain: 3, status: 'active' } } })); w = s.window;
  c.ok(marker(w, 'minimap') === 'ready:?', 'a bounty with enough kills is ready too');
  done(s);
  s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], vendorQuests: { '0,0': { status: 'completed', cooldownUntil: Date.now() + 60000 } } })); w = s.window;
  c.ok(marker(w, 'minimap') === 'none', 'a completed job on cooldown shows no marker');
  done(s);

  c.done(errors);
})();
