// Bulk selling at vendors: sell 1, sell all, or a typed amount (button or Enter).
const H = require('./harness.js');
const { $, q, tab, clickEl, loadSave, captureSave, settle, sleep, baseSave, makeChecker } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const btn = (w, sel) => q(w, sel);
const inv = async (w) => (await captureSave(w)).inventory;

(async () => {
  const c = makeChecker('BULK SELL');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  let s = await session(baseSave({ inventory: { 'Baseball Bat': 1, 'Scrap Metal': 100, 'Cloth Strips': 20, 'Bandage': 1 } })); let w = s.window;
  tab(w, 'shop'); await sleep(100);
  const unit = parseInt(q(w, '[data-shopsell="Scrap Metal"]').closest('.shop-card').querySelector('.req-list').textContent.replace(/\D/g, ''), 10);
  c.ok(!!btn(w, '[data-shopsell="Scrap Metal"][data-sellcount="1"]') && !!btn(w, '[data-shopsell="Scrap Metal"][data-sellcount="100"]') && !!btn(w, '[data-sellqty="Scrap Metal"]'), 'a stack shows sell 1, all (100) and a quantity box');
  c.ok(!btn(w, '[data-sellqty="Bandage"]') && !!btn(w, '[data-shopsell="Bandage"][data-sellcount="1"]') && !btn(w, '[data-shopsell="Bandage"][data-sellcount="2"]'), 'a single item shows only sell 1');

  let cash0 = (await captureSave(w)).cash;
  clickEl(w, btn(w, '[data-shopsell="Scrap Metal"][data-sellcount="1"]'));
  c.ok((await inv(w))['Scrap Metal'] === 99, 'sell 1 sells one');

  // Typed amount via the button.
  let box = btn(w, '[data-sellqty="Scrap Metal"]');
  box.value = '7'; box.dispatchEvent(new w.Event('input'));
  clickEl(w, btn(w, '[data-shopsell-typed="Scrap Metal"]'));
  let sv = await captureSave(w);
  c.ok(sv.inventory['Scrap Metal'] === 92 && sv.cash === cash0 + unit * 8, `typing 7 and pressing sell sells 7 at $${unit} each`);
  c.ok(/Sold 7x Scrap Metal to the vendor for \$\d+/.test($(w, 'logFeed').textContent), 'one log line for the batch');
  c.ok(btn(w, '[data-sellqty="Scrap Metal"]').value === '', 'the box clears after a sale');

  // Enter key sells, and does not trigger the game's keyboard shortcuts.
  box = btn(w, '[data-sellqty="Scrap Metal"]');
  box.focus(); box.value = '2'; box.dispatchEvent(new w.Event('input'));
  box.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  c.ok((await inv(w))['Scrap Metal'] === 90, 'Enter in the box sells the typed amount');

  // The 1s re-render must not wipe a number being typed.
  box = btn(w, '[data-sellqty="Scrap Metal"]');
  box.focus(); box.value = '12'; box.dispatchEvent(new w.Event('input'));
  await settle(w);
  c.ok(btn(w, '[data-sellqty="Scrap Metal"]') === box && box.value === '12', 'typing survives the once-a-second refresh');
  box.blur(); await settle(w);
  c.ok(btn(w, '[data-sellqty="Scrap Metal"]').value === '12', 'and is kept if you click away');

  // Bad and oversized amounts.
  box = btn(w, '[data-sellqty="Scrap Metal"]');
  box.value = '0'; box.dispatchEvent(new w.Event('input'));
  clickEl(w, btn(w, '[data-shopsell-typed="Scrap Metal"]'));
  c.ok((await inv(w))['Scrap Metal'] === 90 && box.classList.contains('bad'), 'zero sells nothing and flags the box');
  box.value = '5000'; box.dispatchEvent(new w.Event('input'));
  cash0 = (await captureSave(w)).cash;
  clickEl(w, btn(w, '[data-shopsell-typed="Scrap Metal"]'));
  sv = await captureSave(w);
  c.ok(!sv.inventory['Scrap Metal'] && sv.cash === cash0 + unit * 90, 'more than you have sells the whole stack');

  // Sell all.
  cash0 = sv.cash;
  const clothUnit = parseInt(q(w, '[data-shopsell="Cloth Strips"]').closest('.shop-card').querySelector('.req-list').textContent.replace(/\D/g, ''), 10);
  clickEl(w, btn(w, '[data-shopsell="Cloth Strips"][data-sellcount="20"]'));
  sv = await captureSave(w);
  c.ok(!sv.inventory['Cloth Strips'] && sv.cash === cash0 + clothUnit * 20, 'all (20) sells the whole stack');
  done(s);

  // Equipped gear sold in bulk is unequipped once the stack is gone.
  s = await session(baseSave({ inventory: { 'Baseball Bat': 1, 'Work Gloves': 3 }, equipment: { head: null, torso: null, hands: 'Work Gloves', pants: null, feet: null } })); w = s.window;
  tab(w, 'shop'); await sleep(100);
  clickEl(w, btn(w, '[data-shopsell="Work Gloves"][data-sellcount="3"]'));
  sv = await captureSave(w);
  c.ok(!sv.inventory['Work Gloves'] && sv.equipment.hands === null, 'selling the last of an equipped item unequips it');
  done(s);

  c.done(errors);
})();
