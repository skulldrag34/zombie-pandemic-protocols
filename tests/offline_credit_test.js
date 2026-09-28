const H = require('./harness.js');
const { $, q, tab, loadSave, captureSave, fastForward, sleep, baseSave, makeChecker } = H;

const HOUR = 3600 * 1000;

// Loads `saveObj` into a fresh game whose clock is `awayMs` ahead of the save's savedAt.
async function loadAfterAway(saveObj, awayMs) {
  const sess = H.makeSession();
  saveObj.savedAt = Date.now();
  fastForward(sess.window, awayMs);
  loadSave(sess.window, saveObj);
  await sleep(300);
  return sess;
}
const stamina = (w) => $(w, 'apNum').textContent.trim();
const scrap = (w) => parseInt($(w, 'scrapNum').textContent, 10);
const logText = (w) => { tab(w, 'field'); return $(w, 'logFeed').textContent; };
const invHas = (w, name) => { tab(w, 'inventory'); const m = $(w, 'invGrid').innerHTML.match(new RegExp(name + '</span><span class="count">(\\d+)')); return m ? parseInt(m[1], 10) : 0; };

(async () => {
  const c = makeChecker('OFFLINE CREDIT');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('Stamina');
  let s = await loadAfterAway(baseSave({ stamina: 0 }), 55000);
  c.ok(stamina(s.window) === '5 / 20', `55s away restores 5 stamina (shows ${stamina(s.window)})`);
  c.ok(/While you were away \(0m\): \+5 stamina/.test(logText(s.window)), 'the log reports what was credited');
  done(s);

  s = await loadAfterAway(baseSave({ stamina: 15 }), 1 * HOUR);
  c.ok(stamina(s.window) === '20 / 20', `credit never exceeds max stamina (shows ${stamina(s.window)})`);
  done(s);

  s = await loadAfterAway(baseSave({ stamina: 20 }), 30000);
  c.ok(!logText(s.window).includes('While you were away'), 'no "while you were away" message when nothing was earned');
  done(s);

  console.log('Garden and outposts');
  s = await loadAfterAway(baseSave({ builtRooms: ['garden'] }), 10 * 60000);
  c.ok(invHas(s.window, 'Canned Food') === 10, `Garden: 10 minutes away yields 10 Canned Food (has ${invHas(s.window, 'Canned Food')})`);
  done(s);

  s = await loadAfterAway(baseSave(), 10 * 60000);
  c.ok(invHas(s.window, 'Canned Food') === 0, 'no Garden built -> no food credited');
  done(s);

  s = await loadAfterAway(baseSave({ claimedBlocks: { '1,0': { postedCompanionId: null }, '0,1': { postedCompanionId: null } } }), 6 * 60000);
  c.ok(scrap(s.window) === 504, `two outposts, 6 minutes away -> 2 ticks x 2 blocks = +4 scrap (shows ${scrap(s.window)})`);
  done(s);

  console.log('8-hour cap');
  s = await loadAfterAway(baseSave({ builtRooms: ['garden'] }), 24 * HOUR);
  c.ok(invHas(s.window, 'Canned Food') === 480, `24h away is capped at 8h (480 Canned Food, has ${invHas(s.window, 'Canned Food')})`);
  c.ok(/capped/.test(logText(s.window)), 'the log says the credit was capped');
  done(s);

  console.log('Systems that must stay online-only');
  const hurt = { id: 1, name: 'Sable', portraitSeed: 1, hp: 5, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null } };
  s = await loadAfterAway(baseSave({ roster: [hurt], safehouseIntegrity: 80, inventory: { 'Baseball Bat': 1, 'Bandage': 3, 'Scrap Metal': 500 } }), 5 * HOUR);
  tab(s.window, 'character');
  c.ok($(s.window, 'rosterContent').innerHTML.includes('HP 5/40'), 'auto-heal is NOT credited while away (companion still 5/40, Bandages untouched)');
  c.ok(invHas(s.window, 'Bandage') === 3, 'no aid items were consumed');
  tab(s.window, 'safehouse');
  c.ok($(s.window, 'roomList').innerHTML.includes('STRUCTURAL INTEGRITY: 80%'), 'passive repair is NOT credited while away (integrity still 80%)');
  done(s);

  console.log('Compatibility and robustness');
  const legacy = baseSave({ stamina: 0, builtRooms: ['garden'] });
  s = H.makeSession(); fastForward(s.window, 5 * HOUR);
  delete legacy.savedAt; loadSave(s.window, legacy); await sleep(300);
  c.ok(stamina(s.window) === '0 / 20' && invHas(s.window, 'Canned Food') === 0, 'a save with no savedAt (older saves) gets no credit and loads fine');
  done(s);

  s = H.makeSession();
  const future = baseSave({ stamina: 0 }); future.savedAt = Date.now() + 10 * HOUR;
  loadSave(s.window, future); await sleep(300);
  c.ok(stamina(s.window) === '0 / 20', 'a savedAt in the future (clock skew) grants nothing');
  done(s);

  s = H.makeSession(); loadSave(s.window, baseSave()); await sleep(300);
  const saved = await captureSave(s.window);
  c.ok(Number.isFinite(saved.savedAt) && Math.abs(saved.savedAt - Date.now()) < 5000, 'every save now records a savedAt timestamp');
  done(s);

  c.done(errors);
})();
