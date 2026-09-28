const fs = require('fs');
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, fastForward, settle, sleep, createCharacter, baseSave, makeChecker } = H;

const GAME = fs.readFileSync(H.GAME_PATH, 'utf8');
const hidden = (win, id) => $(win, id).classList.contains('hidden');
const xpOf = (win) => parseInt($(win, 'xpNum').textContent.split('/')[0].trim(), 10);

async function session(saveObj, aheadMs) {
  const s = H.makeSession();
  if (aheadMs) fastForward(s.window, aheadMs);
  if (saveObj) { loadSave(s.window, saveObj); await sleep(300); }
  return s;
}

async function fightUntilCombat(win, maxTries) {
  const dirs = ['btnN', 'btnE', 'btnS', 'btnW'];
  for (let i = 0; i < maxTries; i++) {
    click(win, dirs[i % 4]);
    if (!hidden(win, 'deathOverlay') === true) click(win, 'btnRespawn');
    if (!hidden(win, 'combatOverlay')) return true;
    await sleep(3);
  }
  return false;
}

(async () => {
  const c = makeChecker('CORE REGRESSION');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  // ---- 1. Full playthrough smoke test ----
  console.log('1) Playthrough smoke test (creation -> ~250 actions -> every tab -> save/load)');
  {
    const s = await session(null);
    const w = s.window;
    createCharacter(w);
    c.ok(!hidden(w, 'app'), 'character creation completes and the game starts');
    let fights = 0;
    const dirs = ['btnN', 'btnE', 'btnS', 'btnW'];
    for (let i = 0; i < 250; i++) {
      click(w, dirs[i % 4]);
      if (i % 7 === 0) click(w, 'btnF');
      let guard = 0;
      while (!hidden(w, 'combatOverlay') && guard++ < 40) {
        if (guard === 1) fights++;
        if (!click(w, 'btnFire')) click(w, 'btnAdvance');
        if (!hidden(w, 'deathOverlay')) break;
      }
      if (!hidden(w, 'deathOverlay')) click(w, 'btnRespawn');
      if (i % 5 === 0) { click(w, 'btnR'); }
    }
    for (const t of ['field', 'inventory', 'crafting', 'safehouse', 'shop', 'character', 'achievements', 'worldmap']) tab(w, t);
    c.ok(fights > 0, `combat occurred during the run (${fights} fights)`);
    const saved = await captureSave(w);
    c.ok(saved.name && saved.level >= 1 && typeof saved.safehouseIntegrity === 'number', 'save file contains core fields');
    const s2 = await session(saved);
    const resaved = await captureSave(s2.window);
    const keys = ['name', 'level', 'cash', 'inventory', 'roster', 'claimedBlocks', 'vendorRep', 'fitnessLevel', 'marksmanshipLevel', 'safehouseIntegrity', 'postCapXp', 'builtRooms', 'barricadeLevel', 'kills'];
    c.ok(keys.every(k => JSON.stringify(saved[k]) === JSON.stringify(resaved[k])), 'save -> load -> save round-trips all key fields identically');
    done(s); done(s2);
  }

  // ---- 2. Defense penalty from structural integrity ----
  console.log('2) Structural integrity');
  {
    const s = await session(baseSave({ barricadeLevel: 5, safehouseIntegrity: 50 }));
    tab(s.window, 'safehouse');
    const h = $(s.window, 'roomList').innerHTML;
    c.ok(h.includes('SAFEHOUSE DEFENSE: 30'), 'barricade 5 (40 defense) at 50% integrity yields 30 defense');
    done(s);
  }

  // ---- 3. Roster: guard exclusion, single traveler, cap clamp ----
  console.log('3) Roster');
  {
    const comp = (id, name, mode) => ({ id, name, portraitSeed: id, hp: 40, maxHp: 40, mode, level: 1, xp: 0, equipment: { weapon: null, armor: null } });
    let s = await session(baseSave({ roster: [comp(1, 'Rook', 'travel'), comp(2, 'Sable', 'guard')] }));
    tab(s.window, 'character');
    clickEl(s.window, q(s.window, '[data-set-mode="2"]'));
    const g = $(s.window, 'gearLine').innerHTML;
    c.ok(g.includes('TRAVELING WITH: <span>Sable') && g.includes('GUARDING SAFEHOUSE: <span>Rook'), 'promoting one companion to traveler demotes the previous traveler');
    c.ok($(s.window, 'rosterCountLabel').textContent.trim() === '(2/5)', 'roster cap is 5');
    done(s);

    s = await session(baseSave({ roster: [1, 2, 3, 4, 5, 6].map(i => comp(i, 'N' + i, 'guard')) }));
    tab(s.window, 'character');
    c.ok($(s.window, 'rosterCountLabel').textContent.trim() === '(5/5)', 'oversized roster in a save is clamped to 5');
    done(s);

    s = await session(baseSave({
      settings: { severity: 'Nightmare', infection: 'Fast', armedPct: 'High' }, hp: 5000, baseMaxHp: 5000,
      x: 12, y: 12, visited: ['0,0', '12,12'],
      inventory: { 'Baseball Bat': 1, 'Shotgun': 1, 'Ammo': 300 }, equippedWeapon: 'Shotgun',
      roster: [Object.assign(comp(9, 'Talon', 'guard'), { equipment: { weapon: 'Baseball Bat', armor: null } })]
    }));
    const found = await fightUntilCombat(s.window, 60);
    c.ok(found, 'a fight was triggered for the guard-exclusion check');
    if (found) {
      c.ok(hidden(s.window, 'companionRow'), 'a guarding companion does not appear as an ally in combat');
      for (let i = 0; i < 6 && !hidden(s.window, 'combatOverlay'); i++) { if (!click(s.window, 'btnFire')) click(s.window, 'btnAdvance'); }
      c.ok(!$(s.window, 'combatLog').textContent.includes('Talon'), 'a guarding companion never assists in field combat');
    }
    done(s);
  }

  // ---- 4. Healing ----
  console.log('4) Companion healing');
  {
    const hurt = (id, name, hp) => ({ id, name, portraitSeed: id, hp, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null } });
    let s = await session(baseSave({ inventory: { 'Baseball Bat': 1, 'Bandage': 3 }, roster: [hurt(1, 'Sable', 10)] }));
    tab(s.window, 'character');
    clickEl(s.window, q(s.window, '[data-heal-companion="1"]'));
    c.ok($(s.window, 'rosterContent').innerHTML.includes('HP 40/40'), 'manual heal works on a guarding companion');
    done(s);

    s = await session(baseSave({ inventory: { 'Baseball Bat': 1, 'Bandage': 3 }, roster: [hurt(2, 'Dutch', 5)] }));
    fastForward(s.window, 16000); await settle(s.window);
    tab(s.window, 'character');
    c.ok($(s.window, 'rosterContent').innerHTML.includes('HP 35/40'), 'auto-heal patches a companion below 60% HP');
    done(s);

    s = await session(baseSave({ autoHealCompanions: false, inventory: { 'Baseball Bat': 1, 'Bandage': 3 }, roster: [hurt(3, 'Wren', 5)] }));
    fastForward(s.window, 16000); await settle(s.window);
    tab(s.window, 'character');
    c.ok($(s.window, 'rosterContent').innerHTML.includes('HP 5/40'), 'auto-heal does nothing when toggled off');
    done(s);
  }

  // ---- 5. Progression: level cap, craft XP, training ----
  console.log('5) Progression');
  {
    let s = await session(baseSave({ level: 24, xp: 15, xpToNext: 20 }));
    tab(s.window, 'crafting'); clickEl(s.window, q(s.window, '[data-craft="craft_bandage"]'));
    fastForward(s.window, 20000); await settle(s.window);
    tab(s.window, 'character');
    const ch = $(s.window, 'characterContent').innerHTML;
    c.ok(ch.includes('Level 25/25 (MAX)'), 'player caps at level 25');
    c.ok(ch.includes('3 / 400 XP to "Unbroken"'), 'overflow XP (15+8-20 = 3) rolls into title progress');
    done(s);

    s = await session(baseSave({ builtRooms: ['gym'] }));
    const before = parseInt($(s.window, 'apNum').textContent.split('/')[1], 10);
    tab(s.window, 'safehouse'); click(s.window, 'btn-train-fitness');
    fastForward(s.window, 70000); await settle(s.window);
    const after = parseInt($(s.window, 'apNum').textContent.split('/')[1], 10);
    c.ok(after - before === 2, `fitness tier 1 grants +2 max stamina (${before} -> ${after})`);
    done(s);

    s = await session(baseSave({ inventory: { 'Baseball Bat': 1, 'Energy Drink': 1 }, stamina: 5 }));
    tab(s.window, 'inventory'); clickEl(s.window, q(s.window, '[data-aid="Energy Drink"]'));
    c.ok($(s.window, 'apNum').textContent === '20 / 20', 'Energy Drink restores stamina (capped at max)');
    done(s);
  }

  // ---- 6. Compound expansion & vendors ----
  console.log('6) Compound expansion and vendors');
  {
    let s = await session(baseSave({ visited: ['0,0', '1,0', '-1,0', '0,1', '0,-1'] }));
    tab(s.window, 'safehouse');
    const btns = s.window.document.querySelectorAll('[data-claim]');
    c.ok(btns.length === 4, `all 4 adjacent scouted low-danger sectors are claimable (${btns.length})`);
    clickEl(s.window, btns[0]);
    fastForward(s.window, 60000); await settle(s.window);
    tab(s.window, 'safehouse');
    const h = $(s.window, 'roomList').innerHTML;
    c.ok(h.includes('COMPOUND EXPANSION: 1/8'), 'claim completes and registers');
    const m = h.match(/cost: (\d+) Scrap Metal/);
    c.ok(m && parseInt(m[1], 10) > 15, `second claim costs more (${m && m[1]} scrap > 15)`);
    done(s);

    s = await session(baseSave({ vendorRep: { '0,0': { rep: 5, questsCompleted: 2 } } }));
    tab(s.window, 'shop');
    const shop = $(s.window, 'shopContent').innerHTML;
    c.ok(shop.includes('15% buy discount') && shop.includes('15% sell bonus'), 'reputation 5 shows 15% buy discount and sell bonus');
    c.ok(q(s.window, '[data-buy="Bandage"]').getAttribute('data-price') === '15', 'Bandage price 18 -> 15 at rep 5');
    done(s);

    s = await session(baseSave({ vendorQuests: { '0,0': { type: 'fetch', itemName: 'Canned Food', qtyNeeded: 4, rewardXp: 60, rewardCash: 50, rewardRepGain: 2, status: 'active' } }, inventory: { 'Baseball Bat': 1, 'Canned Food': 4 } }));
    tab(s.window, 'shop'); click(s.window, 'btnTurnInQuest');
    c.ok(parseInt($(s.window, 'cashNum').textContent, 10) === 1050 && xpOf(s.window) === 60, 'fetch quest turn-in pays exact cash (+50) and XP (+60)');
    done(s);
  }

  // ---- 7. Combat / world balance & UI regressions ----
  console.log('7) Balance and UI');
  {
    let s = await session(baseSave({ questStage: 'located', patientZeroCoords: { x: 3, y: 3 }, x: 2, y: 3, visited: ['0,0', '2,3', '3,3'] }));
    click(s.window, 'btnE');
    c.ok($(s.window, 'zDist').textContent === '10' && $(s.window, 'zSpeed').textContent === '6', 'boss starts at distance 10, speed 6');
    done(s);

    const comp = { id: 1, name: 'Rook', portraitSeed: 1, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null } };
    s = await session(baseSave({ roster: [comp] }));
    tab(s.window, 'character');
    const sel = q(s.window, '[data-give-weapon-select="1"]');
    sel.focus(); await sleep(1300);
    c.ok(q(s.window, '[data-give-weapon-select="1"]') === sel && s.window.document.activeElement === sel, 'a focused dropdown survives the 1s render loop (dropdown bug stays fixed)');
    done(s);
  }

  // ---- 8. Source invariants ----
  console.log('8) Source invariants');
  {
    const names = (GAME.match(/const NPC_NAMES = \[([\s\S]*?)\];/)[1].match(/"[^"]+"/g) || []);
    c.ok(names.length === 32 && new Set(names).size === 32, 'NPC name pool has 32 unique names');
    c.ok(['Ahmed', 'Rashid', 'Muhammad', 'Moses', 'Zachary', 'Adam', 'Yolanda', 'Sarah'].every(n => names.includes(`"${n}"`)), 'all requested NPC names present');
    c.ok(!/key === "1,0"\)\s*\{\s*base\.hasShop = true/.test(GAME), 'no hardcoded guaranteed vendor next to the Safehouse');
    c.ok(/Math\.min\(10, 1 \+ Math\.floor\(dist \/ divisor\)/.test(GAME), 'zombie danger ceiling is 10');
    c.ok(/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(GAME), 'mobile viewport meta tag is present (required for phone play)');
  }

  c.done(errors);
})();
