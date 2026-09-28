const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, fastForward, settle, sleep, baseSave, makeChecker } = H;

const xpOf = (win) => parseInt($(win, 'xpNum').textContent.split('/')[0].trim(), 10);
const safehouseHtml = (win) => { tab(win, 'safehouse'); return $(win, 'roomList').innerHTML; };
const gardenBtn = (win) => q(win, '[data-build="garden"]');

async function freshLoaded(saveObj, spoofAheadMs) {
  const sess = H.makeSession();
  if (spoofAheadMs) fastForward(sess.window, spoofAheadMs);
  loadSave(sess.window, saveObj);
  await sleep(300);
  return sess;
}

(async () => {
  const c = makeChecker('PERSISTENCE');
  const allErrors = [];

  // ---------- A: barricade in progress survives save/load and resumes ----------
  console.log('A) Barricade in progress -> save -> load -> resumes -> completes');
  let s1 = await freshLoaded(baseSave());
  tab(s1.window, 'safehouse');
  click(s1.window, 'btnBarricade');
  const saveA = await captureSave(s1.window);
  allErrors.push(...s1.errors); s1.close();
  c.ok(saveA.buildQueue && saveA.buildQueue.kind === 'barricade' && Number.isFinite(saveA.buildQueue.finishAt), 'save file contains the in-progress barricade queue with a finish timestamp');
  c.ok(saveA.inventory['Scrap Metal'] === 485 && saveA.cash === 980, 'resources were already spent (485 scrap, $980) and are saved that way');

  let s2 = await freshLoaded(saveA);
  let h = safehouseHtml(s2.window);
  c.ok(h.includes('reinforcing...'), 'after loading, the barricade is still shown as in progress (not silently dropped)');
  c.ok(h.includes('Barricade Level 0/5'), 'barricade level has not been granted early');
  c.ok(gardenBtn(s2.window).disabled, 'other construction is correctly blocked while the restored project runs');
  fastForward(s2.window, 30000); await settle(s2.window);
  h = safehouseHtml(s2.window);
  c.ok(h.includes('Barricade Level 1/5'), 'restored project completes once its timer elapses');
  c.ok(!gardenBtn(s2.window).disabled, 'queue is released afterward: garden is buildable again');
  c.ok(xpOf(s2.window) === 13, 'completion XP was granted (13)');
  allErrors.push(...s2.errors); s2.close();

  // ---------- B: finishes while the player was away ----------
  console.log('B) Project finishes while away (elapsed time before load)');
  let s3 = await freshLoaded(saveA, 60000);
  await settle(s3.window);
  h = safehouseHtml(s3.window);
  c.ok(h.includes('Barricade Level 1/5'), 'a project that finished during downtime is completed on load');
  tab(s3.window, 'field');
  c.ok($(s3.window, 'logFeed').innerHTML.includes('Barricade reinforced'), 'the mission log reports the completion');
  c.ok(xpOf(s3.window) === 13, 'and grants its XP exactly once');
  allErrors.push(...s3.errors); s3.close();

  // ---------- C: craft queue ----------
  console.log('C) Crafting in progress survives save/load');
  let s4 = await freshLoaded(baseSave());
  tab(s4.window, 'crafting');
  clickEl(s4.window, q(s4.window, '[data-craft="craft_bandage"]'));
  const saveC = await captureSave(s4.window);
  allErrors.push(...s4.errors); s4.close();
  c.ok(saveC.craftQueue && saveC.craftQueue.recipeId === 'craft_bandage', 'save file contains the craft queue');
  c.ok(saveC.inventory['Cloth Strips'] === 18, 'ingredients (2 Cloth Strips) were consumed and stay consumed');
  let s5 = await freshLoaded(saveC, 60000);
  await settle(s5.window);
  tab(s5.window, 'inventory');
  c.ok($(s5.window, 'invGrid').innerHTML.includes('Bandage'), 'crafted Bandage is delivered after loading past its finish time');
  c.ok(xpOf(s5.window) === 8, 'craft XP granted (8)');
  allErrors.push(...s5.errors); s5.close();

  // ---------- D: repair queue ----------
  console.log('D) Repair in progress survives save/load');
  let s6 = await freshLoaded(baseSave({ safehouseIntegrity: 50 }));
  tab(s6.window, 'safehouse');
  click(s6.window, 'btnRepairSafehouse');
  const saveD = await captureSave(s6.window);
  allErrors.push(...s6.errors); s6.close();
  c.ok(saveD.buildQueue && saveD.buildQueue.kind === 'repair', 'repair queue saved');
  let s7 = await freshLoaded(saveD, 60000);
  await settle(s7.window);
  h = safehouseHtml(s7.window);
  c.ok(h.includes('STRUCTURAL INTEGRITY: 100%'), 'repair completes when loaded after its finish time');
  allErrors.push(...s7.errors); s7.close();

  // ---------- E: malformed / hostile queues must never block construction ----------
  console.log('E) Malformed queues are rejected instead of blocking the queue forever');
  const cases = [
    ['missing finishAt', { kind: 'barricade', targetLevel: 1 }],
    ['unknown kind', { kind: 'teleport', finishAt: Date.now() + 5000 }],
    ['unknown room', { kind: 'room', roomId: 'nonsense', finishAt: Date.now() + 5000 }],
    ['out-of-range tier', { kind: 'barricade', targetLevel: 99, finishAt: Date.now() + 5000 }],
    ['NaN finishAt', { kind: 'repair', finishAt: 'soon' }],
    ['claim of an already-claimed block', { kind: 'claim', x: 1, y: 0, finishAt: Date.now() + 5000 }]
  ];
  for (const [label, bq] of cases) {
    const extra = label.startsWith('claim') ? { claimedBlocks: { '1,0': { postedCompanionId: null } } } : {};
    const sess = await freshLoaded(baseSave(Object.assign({ buildQueue: bq }, extra)));
    tab(sess.window, 'safehouse');
    c.ok(!gardenBtn(sess.window).disabled, `${label}: discarded, construction remains available`);
    allErrors.push(...sess.errors); sess.close();
  }
  // far-future finish time (e.g. system clock changed) is capped, not honored
  let s8 = await freshLoaded(baseSave({ buildQueue: { kind: 'barricade', targetLevel: 1, finishAt: Date.now() + 365 * 24 * 3600 * 1000 } }));
  h = safehouseHtml(s8.window);
  const secs = parseInt((h.match(/(\d+)s remaining/) || [])[1], 10);
  c.ok(Number.isFinite(secs) && secs <= 600, `absurd finish time is capped (shows ${secs}s remaining, max 600s)`);
  fastForward(s8.window, 11 * 60 * 1000); await settle(s8.window);
  c.ok(safehouseHtml(s8.window).includes('Barricade Level 1/5'), 'and the capped project still completes');
  allErrors.push(...s8.errors); s8.close();

  // ---------- F: old saves without queue fields still load ----------
  console.log('F) Backward compatibility');
  const legacy = baseSave(); delete legacy.craftQueue; delete legacy.buildQueue;
  let s9 = await freshLoaded(legacy);
  tab(s9.window, 'safehouse');
  c.ok(!gardenBtn(s9.window).disabled, 'a save with no queue fields loads with an empty queue');
  allErrors.push(...s9.errors); s9.close();

  c.done(allErrors);
})();
