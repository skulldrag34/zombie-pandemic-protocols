// Scrap gear: six craftable pieces, recipe level gates, the first negative-stat gear (Tire Pauldron).
const H = require('./harness.js');
const { $, q, tab, clickEl, loadSave, sleep, baseSave, makeChecker, fastForward, settle } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const MATS = { 'Scrap Metal': 40, 'Duct Tape': 20, 'Cloth Strips': 20, 'Empty Bottle': 10, 'Work Gloves': 2 };
const ITEMS = { 'Site Helmet': ['craft_site_helmet', 2], 'Scavenger Gas Mask': ['craft_gas_mask', 2], 'Tire Pauldron': ['craft_tire_pauldron', 3],
  'Plate Bracers': ['craft_plate_bracers', 1], 'Chain-Knuckle Gloves': ['craft_chain_gloves', 1], 'Scrap Shin Guards': ['craft_shin_guards', 1] };
const attr = (w, k) => Number(q(w, `[data-hud-attr="${k}"] b`).textContent);

(async () => {
  const c = makeChecker('SCRAP GEAR');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('A) Recipes and level gates');
  let s = await session(baseSave({ level: 1, inventory: Object.assign({}, MATS) })); let w = s.window;
  tab(w, 'crafting');
  for (const [name, [id, lvl]] of Object.entries(ITEMS)) {
    const btn = q(w, `[data-craft="${id}"]`);
    c.ok(btn && (lvl > 1 ? btn.disabled && q(w, `[data-craft-locked="${id}"]`) : !btn.disabled), `${name}: ${lvl > 1 ? 'locked until level ' + lvl : 'craftable at level 1'}`);
  }
  const card = q(w, '[data-craft="craft_tire_pauldron"]').closest('.recipe-card');
  c.ok(/TORSO/.test(card.textContent) && /10 DEF/.test(card.textContent) && /−1 AGI/.test(card.textContent) && !/\+-1/.test(card.textContent), 'recipe card shows what it makes: TORSO · 10 DEF · +12 HP · −1 AGI');
  clickEl(w, q(w, '[data-craft="craft_tire_pauldron"]'));
  c.ok(!/crafting\.\.\./.test($(w, 'craftList').textContent), 'a locked recipe cannot be started');
  done(s);

  console.log('B) Crafting works');
  s = await session(baseSave({ level: 3, inventory: Object.assign({}, MATS) })); w = s.window;
  tab(w, 'crafting');
  clickEl(w, q(w, '[data-craft="craft_chain_gloves"]'));
  fastForward(w, 30000); await settle(w);
  tab(w, 'survivor');
  c.ok(q(w, '[data-equip="Chain-Knuckle Gloves"]'), 'Chain-Knuckle Gloves crafted from Work Gloves + Scrap Metal');
  c.ok(q(w, '#invGrid [data-art="Chain-Knuckle Gloves"]'), 'and it has art');
  done(s);

  console.log('C) Tire Pauldron: −1 AGI, never below 1');
  s = await session(baseSave({ level: 3, attributes: { str: 1, agi: 3, end: 1, per: 1, lck: 1 }, inventory: { 'Tire Pauldron': 1 } })); w = s.window;
  tab(w, 'survivor');
  c.ok(attr(w, 'agi') === 3, 'AGI 3 before');
  clickEl(w, q(w, '[data-equip="Tire Pauldron"]'));
  c.ok(attr(w, 'agi') === 2 && /−1 AGI/.test($(w, 'invGrid').textContent), 'wearing it: AGI 2, inventory shows −1 AGI');
  done(s);
  s = await session(baseSave({ level: 3, attributes: { str: 1, agi: 1, end: 1, per: 1, lck: 1 }, inventory: { 'Tire Pauldron': 1 },
    equipment: { head: null, torso: 'Tire Pauldron', hands: null, pants: null, feet: null } })); w = s.window;
  c.ok(attr(w, 'agi') === 1, 'at base AGI 1 the penalty cannot push it below 1');
  done(s);

  console.log('D) Every piece is wearable in its slot and scrappable');
  s = await session(baseSave({ level: 3, inventory: Object.fromEntries(Object.keys(ITEMS).map(n => [n, 1])) })); w = s.window;
  tab(w, 'survivor');
  const slots = { 'Site Helmet': 'head', 'Scavenger Gas Mask': 'head', 'Tire Pauldron': 'torso', 'Plate Bracers': 'hands', 'Chain-Knuckle Gloves': 'hands', 'Scrap Shin Guards': 'pants' };
  let ok = true;
  for (const [n, slot] of Object.entries(slots)) { clickEl(w, q(w, `[data-equip="${n}"]`)); if (!new RegExp(n).test(q(w, `#characterContent [data-slot-pick="${slot}"]`).textContent)) ok = false; }
  c.ok(ok, 'each piece lands in its slot (head, head, torso, hands, hands, pants)');
  c.ok(Object.keys(ITEMS).every(n => q(w, `[data-scrap="${n}"]`)), 'each piece can be scrapped for metal');
  done(s);

  c.done(errors);
})();
