// Alpha Phase 3: intel from repelled packs, locating the lair, weakening, the lair fight
// (guard pack then the Alpha), win/death/flee outcomes, successor Alphas, saves.
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, fastForward, settle, sleep, baseSave, makeChecker } = H;
const BLOCK = { '1,0': { postedCompanionId: null } };
const ALPHA = (x) => Object.assign({ name: 'The Pale Ferryman', quietMs: 0 }, x || {});
const STRONG = { hp: 90000, baseMaxHp: 90000, inventory: { 'Precision Rifle': 1, 'Ammo': 500 }, equippedWeapon: 'Precision Rifle' };
const comp = (id, name, x) => Object.assign({ id, name, portraitSeed: id, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: 'Crowbar', armor: null } }, x || {});
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const hidden = (w, id) => $(w, id).classList.contains('hidden');
const pin = (w, v) => { w.Math.random = () => v; };
const logText = (w) => $(w, 'logFeed').textContent;
const fightOut = (w, max) => { for (let i = 0; i < (max || 80) && !hidden(w, 'combatOverlay'); i++) { if (!click(w, 'btnFire')) click(w, 'btnAdvance'); } };

(async () => {
  const c = makeChecker('ALPHA PHASE 3');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('A) Intel from repelled Alpha packs');
  let s = await session(baseSave(Object.assign({ claimedBlocks: BLOCK, alpha: ALPHA() }, STRONG))); let w = s.window;
  pin(w, 0.01); fastForward(w, 95000); await settle(w);
  c.ok(!hidden(w, 'combatOverlay') && /Ferryman/.test($(w, 'combatLog').textContent), 'test setup: an Alpha pack attacks the Safehouse');
  fightOut(w);
  let sv = await captureSave(w);
  c.ok(hidden(w, 'combatOverlay') && sv.alpha.intel === 1 && /track a straggler/.test(logText(w)), 'repelling it can yield +1 intel (roll 1% < 35%)');
  done(s);
  s = await session(baseSave(STRONG)); w = s.window;
  pin(w, 0.01); fastForward(w, 95000); await settle(w); fightOut(w);
  c.ok(!/track a straggler/.test(logText(w)), 'an ordinary (non-Alpha) attack gives no intel');
  done(s);

  console.log('B) Locating the lair');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA({ intel: 2 }) })); w = s.window;
  tab(w, 'safehouse');
  c.ok(q(w, '[data-alpha-locate]') && q(w, '[data-alpha-locate]').disabled, 'with 2 intel, "locate lair (3 intel)" is disabled');
  done(s);
  s = await session(baseSave({ seed: 42, claimedBlocks: BLOCK, alpha: ALPHA({ intel: 3 }) })); w = s.window;
  tab(w, 'safehouse'); clickEl(w, q(w, '[data-alpha-locate]'));
  sv = await captureSave(w);
  const L = sv.alpha.lair, d = L ? Math.abs(L.x) + Math.abs(L.y) : -1;
  c.ok(L && sv.alpha.intel === 0 && d >= 6 && d <= 9, `3 intel finds the lair at [${L && L.x},${L && L.y}], ${d} steps out (6-9)`);
  c.ok(JSON.stringify(w.__zpAlpha3.lairFor(42, 0)) === JSON.stringify(L), 'the lair is fixed by the world seed');
  c.ok(!hidden(w, 'lairChip') && $(w, 'lairChip').textContent === `LAIR: [${L.x},${L.y}]`, 'a LAIR chip appears in the header');
  c.ok(/LAIR at/.test($(w, 'roomList').textContent) && q(w, '[data-alpha-weaken]'), 'the Alpha card shows the lair and a weaken button');
  let dists = new Set(); for (let sd = 1; sd < 60; sd++) { const l = w.__zpAlpha3.lairFor(sd, 0); dists.add(Math.abs(l.x) + Math.abs(l.y)); }
  c.ok([...dists].every(x => x >= 6 && x <= 9) && dists.size >= 3, `across worlds the lair is always 6-9 steps out (${[...dists].sort().join(', ')})`);
  done(s);

  console.log('C) Weakening');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA({ intel: 5, lair: { x: 0, y: 1 } }) })); w = s.window;
  tab(w, 'safehouse');
  c.ok(w.__zpAlpha3.bossHp() === 260, 'escalation 1: the Alpha has 260 HP');
  for (let i = 0; i < 4; i++) clickEl(w, q(w, '[data-alpha-weaken]'));
  sv = await captureSave(w);
  c.ok(sv.alpha.weaken === 3 && sv.alpha.intel === 2 && q(w, '[data-alpha-weaken]').disabled, 'weakening caps at 3 (-30%); the 4th click does nothing');
  c.ok(w.__zpAlpha3.bossHp() === 182, 'weakened 30%: 260 -> 182 HP');
  done(s);

  console.log('D) The lair fight and winning it');
  s = await session(baseSave(Object.assign({ claimedBlocks: BLOCK, alpha: ALPHA({ intel: 0, lair: { x: 0, y: 1 } }),
    roster: [comp(1, 'Rook', { turned: true }), comp(2, 'Sable', { doubleAgent: true })] }, STRONG))); w = s.window;
  pin(w, 0.01); click(w, 'btnN');
  c.ok(!hidden(w, 'combatOverlay') && $(w, 'combatTitle').textContent === 'ALPHA LAIR: THE PALE FERRYMAN' && /guard pack \(2, level 5\)/.test($(w, 'combatLog').textContent), 'stepping into the lair starts the fight: guard pack of 2 at level 5');
  c.ok($(w, 'zLevel').textContent === '5' && w.__zpAudio.music().desired === 'boss', 'guard pack first; boss music plays');
  for (let i = 0; i < 40 && $(w, 'zLevel').textContent !== 'ALPHA'; i++) { if (!click(w, 'btnFire')) click(w, 'btnAdvance'); }
  c.ok($(w, 'zLevel').textContent === 'ALPHA' && $(w, 'zHpNum').textContent === '260 / 260' && /steps out of the dark/.test($(w, 'combatLog').textContent), 'after the pack, the Alpha steps out (260 HP)');
  c.ok($(w, 'faceoff').querySelector('[data-alpha-art="ferryman"]'), 'the face-off shows the Alpha portrait');
  const xp0 = Number($(w, 'xpNum').textContent.split('/')[0]); const cash0 = Number($(w, 'cashNum').textContent);
  fightOut(w);
  sv = await captureSave(w);
  c.ok(hidden(w, 'combatOverlay') && sv.alpha === null && sv.alphaKills === 1 && /IS DEAD/.test(logText(w)), 'killing it ends the Alpha (alphaKills 1)');
  c.ok(sv.cash >= cash0 + 300 && sv.inventory['Scrap Metal'] >= 40 && sv.achievements.includes('pack_breaker'), 'rewards: +$300, +40 Scrap Metal, Pack Breaker');
  c.ok(sv.alphaRespawnMs > 3590000 && sv.alphaRespawnMs <= 3600000 && sv.lastAlphaName === 'The Pale Ferryman', 'a successor is due after 60 minutes of play');
  const rook = sv.roster.find(r => r.name === 'Rook'), sable = sv.roster.find(r => r.name === 'Sable');
  c.ok(rook && !rook.turned && sable && !sable.doubleAgent && /comes clean/.test(logText(w)) && /double-agent work is done/.test(logText(w)), 'hidden spy comes clean; double agent stays on as an ordinary companion');
  tab(w, 'safehouse');
  c.ok(/ALPHAS KILLED: 1/.test($(w, 'roomList').textContent) && hidden(w, 'lairChip'), 'Safehouse shows the kill count; LAIR chip is gone');
  done(s);

  console.log('E) Losing');
  s = await session(baseSave({ hp: 1, claimedBlocks: BLOCK, alpha: ALPHA({ lair: { x: 0, y: 1 }, weaken: 2 }) })); w = s.window;
  pin(w, 0.01); click(w, 'btnN'); pin(w, 0.5);
  for (let i = 0; i < 10 && hidden(w, 'deathOverlay'); i++) click(w, 'btnAdvance');
  sv = await captureSave(w);
  c.ok(!hidden(w, 'deathOverlay') && sv.alpha.leak === 1 && sv.alpha.weaken === 0 && sv.alpha.lair && /learned from beating you/.test(logText(w)), 'death: +1 leak, weakening lost, lair stays known');
  done(s);
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA({ lair: { x: 0, y: 1 }, weaken: 2 }) })); w = s.window;
  pin(w, 0.01); click(w, 'btnN'); click(w, 'btnFlee');
  sv = await captureSave(w);
  c.ok(hidden(w, 'combatOverlay') && sv.alpha.leak === 0 && sv.alpha.weaken === 0 && sv.alpha.lair && /groundwork is undone/.test(logText(w)), 'fleeing: no leak, weakening lost, lair stays known');
  done(s);

  console.log('F) Successor');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: null, alphaKills: 1, alphaRespawnMs: 4000, lastAlphaName: 'The Pale Ferryman' })); w = s.window;
  fastForward(w, 5000); await settle(w);
  sv = await captureSave(w);
  c.ok(sv.alpha && !/Ferryman$/.test(sv.alpha.name) && !hidden(w, 'alphaOverlay') && /NEW ALPHA RISES/.test(logText(w)), `a successor rises with a new title (${sv.alpha && sv.alpha.name})`);
  c.ok(w.__zpAlpha3.bossHp() === 299, 'the successor is 15% tougher (260 -> 299 HP)');
  done(s);
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: null, alphaKills: 1, alphaRespawnMs: 600000 })); w = s.window;
  fastForward(w, 5000); await settle(w);
  sv = await captureSave(w);
  c.ok(sv.alpha === null && sv.alphaRespawnMs < 600000 && sv.alphaRespawnMs > 590000, 'no successor before the timer runs out (it counts down in play time)');
  done(s);
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA({ lair: { x: 0, y: 1 } }), alphaKills: 9 })); w = s.window;
  c.ok(w.__zpAlpha3.bossHp() === Math.round(260 * 1.45), 'successor toughness caps at +45%');
  done(s);

  console.log('G) Saves');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA({ lair: { x: 3, y: -4 }, weaken: 9 }), alphaKills: -3, alphaRespawnMs: 1e12 })); w = s.window;
  sv = await captureSave(w);
  c.ok(sv.alpha.lair.x === 3 && sv.alpha.lair.y === -4 && sv.alpha.weaken === 3 && sv.alphaKills === 0 && sv.alphaRespawnMs === 3600000, 'lair round-trips; hostile values are clamped');
  done(s);
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA() })); w = s.window;
  sv = await captureSave(w);
  c.ok(sv.alpha.lair === null && sv.alpha.weaken === 0 && sv.alphaKills === 0, 'older saves load with no lair and no kills');
  done(s);

  c.done(errors);
})();
