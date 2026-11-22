// Survivor tab (Inventory + Character combined) and Squad tab (roster).
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, sleep, baseSave, makeChecker } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const inPanel = (w, panelId, elId) => !!w.document.querySelector(`#${panelId} #${elId}`);
const invNames = (w) => [...$(w, 'invGrid').querySelectorAll('.inv-card .name')].map(e => e.textContent);
const key = (w, k) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
const active = (w) => w.document.querySelector('.tabpanel.active').id;

(async () => {
  const c = makeChecker('SURVIVOR TAB');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };
  const INV = { 'Bandana': 1, 'Motorcycle Helmet': 1, 'Riot Armor': 1, 'Combat Boots': 1, 'Pistol': 1, 'Baseball Bat': 1, 'Bandage': 3, 'Molotov Cocktail': 2 };
  let s = await session(baseSave({ inventory: INV, equippedWeapon: 'Baseball Bat', unspentPoints: 1,
    roster: [{ id: 1, name: 'Rook', portraitSeed: 1, hp: 40, maxHp: 40, mode: 'follow', level: 1, xp: 0, equipment: { weapon: null, armor: null } }] }));
  let w = s.window;

  console.log('A) Tabs');
  const names = [...w.document.querySelectorAll('.tabbtn')].map(b => b.getAttribute('data-tab'));
  c.ok(names.join(',') === 'field,survivor,crafting,safehouse,shop,squad,achievements,worldmap', `tab order (${names.join(', ')})`);
  c.ok(!$(w, 'tab-inventory') && !$(w, 'tab-character'), 'the old Inventory and Character tabs are gone');
  key(w, '2'); c.ok(active(w) === 'tab-survivor', 'key 2 opens Survivor');
  key(w, '6'); c.ok(active(w) === 'tab-squad', 'key 6 opens Squad');
  c.ok(inPanel(w, 'tab-survivor', 'characterContent') && inPanel(w, 'tab-survivor', 'invGrid') && inPanel(w, 'tab-survivor', 'volMaster'), 'Survivor holds the record, gear, inventory and audio');
  c.ok(inPanel(w, 'tab-squad', 'rosterContent') && !inPanel(w, 'tab-survivor', 'rosterContent') && /Rook/.test($(w, 'rosterContent').textContent), 'Squad holds the roster');
  c.ok($(w, 'audioPanel').tagName === 'DETAILS' && !$(w, 'audioPanel').open, 'audio settings are a collapsed section');
  $(w, 'audioPanel').open = true; await sleep(1250);
  c.ok($(w, 'audioPanel').open, 'once opened, audio settings stay open through the 1s refresh');
  c.ok(/Survivor tab/.test($(w, 'gearLine').textContent), 'the unspent-points hint points at the Survivor tab');

  console.log('B) Equip and see it on the same tab');
  tab(w, 'survivor');
  clickEl(w, q(w, '[data-equip="Motorcycle Helmet"]'));
  const headCard = () => q(w, '#characterContent [data-slot-pick="head"]');
  c.ok(/Motorcycle Helmet/.test(headCard().textContent), 'equipping in the inventory fills the HEAD slot above it');

  console.log('C) Tap a slot to filter the inventory');
  clickEl(w, headCard());
  c.ok(invNames(w).sort().join(',') === 'Bandana,Motorcycle Helmet', `HEAD shows only headwear (${invNames(w).join(', ')})`);
  c.ok(!$(w, 'slotFilterChip').classList.contains('hidden') && /HEAD/.test($(w, 'slotFilterChip').textContent) && !q(w, '#catTabs .active'), 'a "showing HEAD gear" chip appears and no category is highlighted');
  c.ok(headCard().classList.contains('slot-picked'), 'the picked slot is highlighted');
  await sleep(1250);
  c.ok(invNames(w).length === 2, 'the filter survives the 1s refresh');
  clickEl(w, q(w, '#characterContent [data-slot-pick="feet"]'));
  c.ok(invNames(w).join(',') === 'Combat Boots', 'FEET shows boots');
  clickEl(w, q(w, '[data-clear-slot]'));
  c.ok(invNames(w).length === Object.keys(INV).length && $(w, 'slotFilterChip').classList.contains('hidden'), '"show all" clears it');
  clickEl(w, q(w, '#characterContent [data-slot-pick="torso"]')); clickEl(w, q(w, '#characterContent [data-slot-pick="torso"]'));
  c.ok(invNames(w).length === Object.keys(INV).length, 'tapping the same slot again clears it');
  clickEl(w, q(w, '#characterContent [data-slot-pick="pants"]'));
  c.ok(/Nothing in your pack fits/.test($(w, 'invGrid').textContent), 'an empty slot filter says nothing fits');
  clickEl(w, q(w, '#catTabs [data-cat="Aid"]'));
  c.ok(invNames(w).join(',') === 'Bandage' && $(w, 'slotFilterChip').classList.contains('hidden'), 'picking a category clears the slot filter');

  console.log('D) Unequip from the slot');
  clickEl(w, q(w, '#characterContent [data-slot-unequip="head"]'));
  c.ok(/empty/.test(headCard().textContent) && !q(w, '#characterContent [data-slot-unequip="head"]'), 'unequip empties HEAD and the button goes');
  c.ok(invNames(w).join(',') === 'Bandage', 'the unequip button does not also trigger the slot filter');
  done(s);

  console.log('E) With a character model');
  const BODY = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  s = await session(baseSave({ inventory: INV, equippedWeapon: 'Pistol', bodyModel: BODY, equipment: { head: 'Bandana', torso: null, hands: null, pants: null, feet: null } }));
  w = s.window; tab(w, 'survivor');
  c.ok($(w, 'gearDoll'), 'the doll shows');
  clickEl(w, q(w, '#gearDoll [data-slot-pick="weapon"]'));
  c.ok(invNames(w).sort().join(',') === 'Baseball Bat,Pistol', `WEAPON shows weapons, not throwables (${invNames(w).join(', ')})`);
  clickEl(w, q(w, '#gearDoll [data-slot-unequip="head"]'));
  c.ok(/empty/.test(q(w, '#gearDoll [data-slot-pick="head"]').textContent), 'doll slots unequip too');
  c.ok(!q(w, '#gearDoll [data-slot-unequip="weapon"]'), 'no unequip on the weapon slot (you always hold something)');
  done(s);

  c.done(errors);
})();
