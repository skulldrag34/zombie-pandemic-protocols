const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, fastForward, settle, sleep, baseSave, makeChecker } = H;

const hidden = (w, id) => $(w, id).classList.contains('hidden');
const logText = (w) => { tab(w, 'field'); return $(w, 'logFeed').textContent; };
const scrap = (w) => parseInt($(w, 'scrapNum').textContent, 10);
const blocks = (n) => { const o = {}; [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].slice(0, n).forEach(([x,y]) => o[`${x},${y}`] = { postedCompanionId: null }); return o; };
async function session(save, ahead) { const s = H.makeSession(); if (ahead) fastForward(s.window, ahead); loadSave(s.window, save); await sleep(300); return s; }
// Forces the next Safehouse event roll: clock past the 90s check, RNG pinned.
async function forceAttack(w, rnd) { w.Math.random = () => rnd; fastForward(w, 100000); await settle(w); }

(async () => {
  const c = makeChecker('ALPHA PHASE 1');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('Trigger');
  let s = await session(baseSave()); await settle(s.window);
  c.ok(hidden(s.window, 'alphaOverlay') && (await captureSave(s.window)).alpha === null, 'no claimed blocks -> no Alpha');
  tab(s.window, 'safehouse');
  done(s);

  s = await session(baseSave({ visited: ['0,0', '1,0'] }));
  tab(s.window, 'safehouse'); clickEl(s.window, q(s.window, '[data-claim]'));
  c.ok(hidden(s.window, 'alphaOverlay'), 'starting a claim does not trigger it early');
  fastForward(s.window, 60000); await settle(s.window);
  c.ok(!hidden(s.window, 'alphaOverlay'), 'completing the first claim triggers the emergence overlay');
  const nm = $(s.window, 'alphaName').textContent;
  c.ok(/^THE [A-Z]+ [A-Z]+$/.test(nm), `the Alpha has a generated name (${nm})`);
  click(s.window, 'btnAlphaAck');
  c.ok(hidden(s.window, 'alphaOverlay'), 'UNDERSTOOD dismisses the overlay');
  let sv = await captureSave(s.window);
  c.ok(sv.alpha && sv.alpha.quietMs > 590000 && sv.alpha.quietMs <= 600000, `Alpha saved with a ~10 minute quiet period (${sv.alpha && sv.alpha.quietMs}ms)`);
  c.ok(/ALPHA EMERGENCE/.test(logText(s.window)), 'the emergence is written to the mission log');
  done(s);

  s = await session(baseSave({ claimedBlocks: blocks(2) })); await settle(s.window);
  c.ok(!hidden(s.window, 'alphaOverlay'), 'an older save that already has claimed blocks triggers emergence retroactively');
  done(s);

  console.log('Names');
  const nameFor = async (seed) => { const x = await session(baseSave({ seed, claimedBlocks: blocks(1) })); await settle(x.window); const n = $(x.window, 'alphaName').textContent; done(x); return n; };
  const n1 = await nameFor(42), n2 = await nameFor(42);
  c.ok(n1 === n2, `the same seed always names the same Alpha (${n1})`);
  const names = new Set([n1, await nameFor(7), await nameFor(99), await nameFor(12345)]);
  c.ok(names.size >= 3, `different seeds give different Alphas (${[...names].join(', ')})`);

  console.log('Save / load');
  s = await session(baseSave({ claimedBlocks: blocks(1), alpha: { name: 'The Pale Ferryman', quietMs: 123000 } })); await settle(s.window);
  c.ok(hidden(s.window, 'alphaOverlay'), 'loading a save with an existing Alpha does not replay the emergence');
  sv = await captureSave(s.window);
  c.ok(sv.alpha.name === 'The Pale Ferryman' && sv.alpha.quietMs <= 123000 && sv.alpha.quietMs > 115000, `name and remaining quiet time round-trip (${sv.alpha.quietMs}ms)`);
  done(s);

  s = await session(baseSave({ claimedBlocks: blocks(1), alpha: { name: 'The Pale Ferryman', quietMs: 300000 } }), 3 * 3600 * 1000); await settle(s.window);
  sv = await captureSave(s.window);
  c.ok(sv.alpha.quietMs > 290000, 'time away does not burn the quiet period (it counts play time only)');
  done(s);

  s = await session(baseSave({ alpha: { name: 42, quietMs: 'x' } })); await settle(s.window);
  c.ok((await captureSave(s.window)).alpha === null && s.errors.length === 0, 'a malformed Alpha record is discarded safely');
  done(s);

  console.log('Alpha-directed hordes (Medium: base level 2)');
  const away = { x: 5, y: 5, visited: ['0,0', '5,5'], turns: 20, barricadeLevel: 5, builtRooms: ['armory'] };
  for (const [n, lvl] of [[1, 3], [4, 3], [8, 4]]) {
    s = await session(baseSave(Object.assign({ claimedBlocks: blocks(n), alpha: { name: 'The Iron Deacon', quietMs: 0 } }, away)));
    await forceAttack(s.window, 0);
    const lg = logText(s.window);
    c.ok(lg.includes(`The Iron Deacon's pack (level ${lvl}, 2)`), `${n} claimed block(s): escalation gives a level ${lvl} pack of normal size 2`);
    done(s);
  }

  s = await session(baseSave(Object.assign({ claimedBlocks: blocks(8), alpha: { name: 'The Iron Deacon', quietMs: 0 } }, away)));
  const before = scrap(s.window);
  await forceAttack(s.window, 0);
  c.ok(/was repelled/.test(logText(s.window)) && scrap(s.window) - before === 8, `repelled Alpha salvage is x1.5 (5 -> ${scrap(s.window) - before})`);
  done(s);

  s = await session(baseSave(Object.assign({ claimedBlocks: blocks(1), alpha: { name: 'The Iron Deacon', quietMs: 300000 } }, away)));
  await forceAttack(s.window, 0);
  let lg = logText(s.window);
  c.ok(lg.includes('a level 2 horde (2)') && !lg.includes("Deacon's pack"), 'during the quiet period hordes are ordinary');
  done(s);

  // Attack chance: Medium base 10%; x1.25 = 12.5%. A roll of 0.11 only lands with the Alpha active.
  s = await session(baseSave(Object.assign({ claimedBlocks: blocks(1), alpha: { name: 'The Iron Deacon', quietMs: 0 } }, away)));
  await forceAttack(s.window, 0.11);
  c.ok(/Safehouse alert/.test(logText(s.window)), 'Alpha raises the attack chance (a 0.11 roll attacks at 12.5%)');
  done(s);
  s = await session(baseSave(Object.assign({ claimedBlocks: blocks(1), alpha: { name: 'The Iron Deacon', quietMs: 300000 } }, away)));
  await forceAttack(s.window, 0.11);
  c.ok(!/Safehouse alert/.test(logText(s.window)), 'without an active Alpha the same roll does not attack (10%)');
  done(s);

  s = await session(baseSave({ claimedBlocks: blocks(1), alpha: { name: 'The Iron Deacon', quietMs: 0 }, turns: 20, hp: 5000, baseMaxHp: 5000 }));
  await forceAttack(s.window, 0);
  c.ok(!hidden(s.window, 'combatOverlay') && $(s.window, 'combatLog').textContent.includes("The Iron Deacon's pack (level 3, 2)"), 'at the Safehouse, the player fights the Alpha pack directly');
  done(s);

  console.log('UI');
  s = await session(baseSave({ claimedBlocks: blocks(4), alpha: { name: 'The Iron Deacon', quietMs: 150000 } }));
  tab(s.window, 'safehouse');
  const h = $(s.window, 'roomList').innerHTML;
  c.ok(h.includes('ALPHA ACTIVE: The Iron Deacon') && h.includes('Escalation 2') && /quiet for ~3m/.test(h), 'Safehouse tab shows the Alpha, escalation and quiet time');
  done(s);
  s = await session(baseSave()); tab(s.window, 'safehouse');
  c.ok(!$(s.window, 'roomList').innerHTML.includes('ALPHA ACTIVE'), 'no Alpha card before emergence');
  done(s);

  c.done(errors);
})();
