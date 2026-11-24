// Factions Phase 1: seeded HQs, territory, standing states, rivals, trade, gifts, jobs, discovery, maps, saves.
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, createCharacter, fastForward, settle, sleep, baseSave, makeChecker } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const F = (w) => w.__zpFactions;
const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

(async () => {
  const c = makeChecker('FACTIONS');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  // --- Old save without factions: Normal, three undiscovered factions at their starting standing.
  let s = await session(baseSave()); let w = s.window;
  let all = F(w).all();
  c.ok(Object.keys(all).join(',') === 'authority,union,jackals', `an old save gets the Normal set (${Object.keys(all)})`);
  c.ok(all.authority.standing === 0 && all.union.standing === 10 && all.jackals.standing === -30, 'starting standing: Authority 0, Union +10, Jackals -30');
  c.ok(Object.values(all).every(f => !f.discovered), 'all start undiscovered');
  c.ok(F(w).stateOf('jackals') === 'Wary' && F(w).stateOf('union') === 'Neutral', 'Jackals start Wary, Union Neutral');

  // --- State thresholds.
  const th = [[-100, 'Hostile'], [-60, 'Hostile'], [-59, 'Wary'], [-20, 'Wary'], [-19, 'Neutral'], [19, 'Neutral'], [20, 'Friendly'], [59, 'Friendly'], [60, 'Allied'], [100, 'Allied']];
  c.ok(th.every(([v, st]) => F(w).stateFor(v) === st), 'standing bands: Hostile <=-60, Wary to -20, Neutral to 19, Friendly to 59, Allied 60+');

  // --- Seeded sites across many seeds and all three settings.
  let siteOk = true, siteMsg = '';
  for (let seed = 1; seed <= 300 && siteOk; seed++) {
    for (const setting of ['Few', 'Normal', 'Many']) {
      const sites = F(w).sites(seed * 7919, setting);
      const again = F(w).sites(seed * 7919, setting);
      const ids = Object.keys(sites);
      const pz = F(w).pz(seed * 7919);
      if (ids.length !== F(w).sets[setting].length) { siteOk = false; siteMsg = 'wrong count'; break; }
      for (const id of ids) {
        const p = sites[id], d = Math.abs(p.x) + Math.abs(p.y);
        if (d < 8 || d > 16) { siteOk = false; siteMsg = `${id} at distance ${d}`; }
        if (p.x === pz.x && p.y === pz.y) { siteOk = false; siteMsg = `${id} on Patient Zero`; }
        if (JSON.stringify(p) !== JSON.stringify(again[id])) { siteOk = false; siteMsg = 'not deterministic'; }
      }
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        if (manh(sites[ids[i]], sites[ids[j]]) <= 4) { siteOk = false; siteMsg = `${ids[i]} and ${ids[j]} territories overlap`; }
      }
    }
  }
  c.ok(siteOk, `900 seeded layouts: HQs 8-16 steps out, never on Patient Zero, territories never overlap, deterministic${siteMsg ? ' (' + siteMsg + ')' : ''}`);

  // --- Lair never lands on an HQ.
  let lairOk = true;
  for (let k = 0; k < 60; k++) { const l = w.__zpAlpha3.lairFor(42, k); if (F(w).territoryAt(l.x, l.y) && F(w).territoryAt(l.x, l.y).hq) lairOk = false; }
  c.ok(lairOk, 'Alpha lairs (60 successors) never land on an HQ');

  // --- Rival penalty.
  F(w).gain('authority', 10);
  c.ok(all.authority.standing === 10 && all.jackals.standing === -35, `helping the Authority +10 costs the Jackals 5 (${all.jackals.standing})`);
  F(w).gain('jackals', 4);
  c.ok(all.jackals.standing === -31 && all.authority.standing === 8, 'and the reverse');
  done(s);

  // --- Territory discovery on entry, HQ sector, danger, map glyphs.
  s = await session(baseSave()); w = s.window; all = F(w).all();
  const auth = all.authority;
  const sec = F(w).sector(auth.x, auth.y);
  c.ok(sec.factionHq === 'authority' && sec.hasShop && sec.danger === 0 && sec.name === 'Civil-Defense Bunker', 'the HQ sector is a safe faction vendor');
  // Step in from just outside the territory.
  const dirToHq = Math.abs(auth.x) >= Math.abs(auth.y) ? (auth.x > 0 ? ['e', -3, 0] : ['w', 3, 0]) : (auth.y > 0 ? ['n', 0, -3] : ['s', 0, 3]);
  F(w).teleport(auth.x + dirToHq[1], auth.y + dirToHq[2]);
  w.Math.random = () => 0.99;  // no ambush, no rumour
  const btn = { n: 'btnN', s: 'btnS', e: 'btnE', w: 'btnW' }[dirToHq[0]];
  click(w, btn);
  c.ok(all.authority.discovered, 'stepping into their territory discovers the faction');
  c.ok(/crossed into Continuity Authority territory/.test($(w, 'logFeed').textContent), 'the log announces it');
  c.ok(!!q(w, '#minimap [data-faction-cell="authority"]'), 'territory cells get the faction outline on the minimap');
  c.ok(!!q(w, '#minimap [data-hq="authority"]'), 'the HQ shows as an H on the minimap before you have visited it');
  tab(w, 'worldmap');
  c.ok(!!q(w, '#wmapGrid [data-hq="authority"]') && /Faction HQ/.test($(w, 'wmapLegend').textContent) && /Faction territory/.test($(w, 'mapLegend').textContent), 'world map shows the HQ; both legends explain it');
  q(w, '#wmapGrid [data-hq="authority"]').parentElement.dispatchEvent(new w.Event('click'));
  c.ok(/Civil-Defense Bunker/.test($(w, 'wmapInfo').textContent) && /Adelaide Voss/.test($(w, 'wmapInfo').textContent), 'the sector panel names the HQ and its leader');

  // Friendly standing thins the dead in their territory.
  F(w).setStanding('authority', 0);
  const cells = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 2 && (dx || dy)) cells.push([auth.x + dx, auth.y + dy]);
  const before = cells.map(([x, y]) => F(w).sector(x, y).danger);
  F(w).setStanding('authority', 25);
  const after = cells.map(([x, y]) => F(w).sector(x, y).danger);
  c.ok(cells.every((_, i) => after[i] === (before[i] > 1 ? before[i] - 1 : before[i])), 'Friendly: zombie danger -1 in their territory (never below 1)');
  done(s);

  // --- HQ panel: prices, exclusives, spending, gifts, hostility.
  const hqSave = (id, standing, o) => {
    const base = baseSave(o || {});
    return Object.assign(base, { x: 0, y: 0, factions: { [id]: { standing, discovered: true } } });
  };
  const goHq = async (id, standing, o) => {
    const ss = await session(hqSave(id, standing, o)); const ww = ss.window;
    const f = F(ww).all()[id]; F(ww).teleport(f.x, f.y); tab(ww, 'shop'); await settle(ww);
    return ss;
  };

  s = await goHq('authority', 0); w = s.window;
  c.ok(!!q(w, '[data-faction-hq="authority"]') && /Adelaide Voss/.test($(w, 'shopContent').textContent), 'the HQ panel shows the faction and its leader');
  c.ok(!!q(w, '[data-standing="authority"]') && /Neutral \(0\)/.test($(w, 'shopContent').textContent), 'with a standing bar and state');
  const vest = q(w, '[data-exclusive="Friendly"]');
  c.ok(vest && vest.classList.contains('locked') && /NEEDS FRIENDLY STANDING/.test(vest.textContent), 'the Friendly exclusive is locked at Neutral');
  const ammoBtn = q(w, '[data-buy="Ammo"]');
  c.ok(ammoBtn && ammoBtn.getAttribute('data-price') === '17', 'Neutral pays the list price');
  // Spending: $100 earns +2.
  const cash0 = w.__zpFactions.all().authority.standing;
  for (let i = 0; i < 6; i++) clickEl(w, q(w, '[data-buy="Ammo"]'));   // 6 x $17 = $102
  c.ok(F(w).all().authority.standing === cash0 + 2, `spending $102 earns +2 standing (${F(w).all().authority.standing})`);
  c.ok(F(w).all().jackals.standing === -31, 'and the rival Jackals lose half of that');
  for (let i = 0; i < 10; i++) clickEl(w, q(w, '[data-buy="Medkit"]'));
  c.ok(F(w).all().authority.standing === 5, `shopping standing caps at +5 per hour (${F(w).all().authority.standing})`);
  // Gifts.
  const cashBefore = JSON.parse(JSON.stringify(await captureSave(w))).cash;
  for (let i = 0; i < 8; i++) click(w, 'btnFactionGift');
  const afterGift = await captureSave(w);
  c.ok(F(w).all().authority.standing === 10 && afterGift.cash === cashBefore - 125, `gifts: $25 per point, 5 per hour (standing ${F(w).all().authority.standing}, paid $${cashBefore - afterGift.cash})`);
  c.ok($(w, 'btnFactionGift').disabled && /0\/5 gifts left/.test($(w, 'shopContent').textContent), 'the gift button disables at the cap');
  // An hour later the caps reset.
  fastForward(w, 3600000 + 5000); await settle(w);
  click(w, 'btnFactionGift');
  c.ok(F(w).all().authority.standing === 11, 'after an hour, gifts work again');
  done(s);

  s = await goHq('authority', 25); w = s.window;
  const vest2 = q(w, '[data-exclusive="Friendly"]');
  c.ok(vest2 && !vest2.classList.contains('locked'), 'Friendly unlocks the Reinforced Combat Vest');
  c.ok(q(w, '[data-buy="Ammo"]').getAttribute('data-price') === String(Math.round(17 * 0.9)), 'Friendly: prices -10%');
  c.ok(q(w, '[data-exclusive="Allied"]').classList.contains('locked'), 'the Allied exclusive stays locked');
  done(s);

  s = await goHq('authority', 70); w = s.window;
  c.ok(!q(w, '[data-exclusive="Allied"]').classList.contains('locked') && q(w, '[data-buy="Ammo"]').getAttribute('data-price') === String(Math.round(17 * 0.8)), 'Allied: Precision Rifle unlocked, prices -20%');
  done(s);

  s = await goHq('jackals', -30); w = s.window;
  c.ok(q(w, '[data-buy="Crowbar"]').getAttribute('data-price') === '25', 'Wary: prices +25%');
  const batPrice = Math.round(F(w).basePrice('Baseball Bat') * 1.3);
  const cashA = (await captureSave(w)).cash;
  clickEl(w, q(w, '[data-shopsell="Baseball Bat"]'));
  c.ok((await captureSave(w)).cash === cashA + batPrice, `the Jackals buy your loot at +30% ($${batPrice} for the bat)`);
  done(s);

  // Job generation: Wary -> fetch only; Neutral -> bounty possible.
  const jobAt = async (id, standing) => {
    const ss = await session(hqSave(id, standing)); const ww = ss.window;
    const f = F(ww).all()[id];
    ww.Math.random = () => 0.55;
    F(ww).teleport(f.x - 1, f.y);
    click(ww, 'btnE');
    const save = await captureSave(ww);
    const job = save.vendorQuests[`${f.x},${f.y}`];
    done(ss);
    return job;
  };
  let job = await jobAt('jackals', -30);
  c.ok(job && job.type === 'fetch' && job.factionId === 'jackals', `Wary: the HQ only offers supply runs (${job && job.type})`);
  job = await jobAt('authority', 0);
  c.ok(job && job.type === 'bounty' && job.factionId === 'authority', `Neutral: bounties too (${job && job.type})`);
  job = await jobAt('jackals', -70);
  c.ok(!job, 'Hostile: no jobs');

  // Faction job turn-in: standing +8..12, rival loses half.
  {
    const base = hqSave('authority', 0, { inventory: { 'Baseball Bat': 1, 'Cloth Strips': 20 } });
    const ss = await session(base); const ww = ss.window;
    const f = F(ww).all().authority; const key = `${f.x},${f.y}`;
    ss.close();
    const s2 = await session(Object.assign(hqSave('authority', 0, { inventory: { 'Baseball Bat': 1, 'Cloth Strips': 20 } }), {
      vendorQuests: { [key]: { type: 'fetch', itemName: 'Cloth Strips', qtyNeeded: 5, rewardXp: 50, rewardCash: 20, rewardRepGain: 0, status: 'active', factionId: 'authority' } }
    }));
    const w2 = s2.window; F(w2).teleport(f.x, f.y); tab(w2, 'shop'); await settle(w2);
    c.ok(/ACTIVE JOB/.test($(w2, 'shopContent').textContent), 'the faction job shows at the HQ');
    click(w2, 'btnTurnInQuest');
    const a = F(w2).all();
    c.ok(a.authority.standing >= 8 && a.authority.standing <= 12 && a.authority.jobs === 1, `turning it in: standing +8 to +12 (${a.authority.standing})`);
    c.ok(Math.abs(a.jackals.standing - (-30 - a.authority.standing / 2)) < 1e-9, `the rival loses half (${a.jackals.standing})`);
    const sv = await captureSave(w2);
    c.ok(!sv.vendorRep[key], 'faction jobs build standing, not per-vendor reputation');
    done(s2);
  }

  // Faction bounties only count kills near their HQ.
  {
    const probe = await session(baseSave()); const pf = F(probe.window).all().authority; const key = `${pf.x},${pf.y}`; probe.close();
    const sb = await session(Object.assign(baseSave(), { vendorQuests: { [key]: { type: 'bounty', zombieLevelMin: 1, countNeeded: 3, progress: 0, rewardXp: 10, rewardCash: 5, rewardRepGain: 0, status: 'active', factionId: 'authority' } } }));
    const wb = sb.window;
    F(wb).kill(2);
    let sv = await captureSave(wb);
    const p0 = sv.vendorQuests[key].progress;
    F(wb).teleport(pf.x + 3, pf.y); F(wb).kill(2);
    sv = await captureSave(wb);
    c.ok(p0 === 0 && sv.vendorQuests[key].progress === 1, `faction bounty kills only count within 4 blocks of the HQ (${p0} at home, ${sv.vendorQuests[key].progress} nearby)`);
    done(sb);
  }

  // Hostile HQ: turned away, gift still possible.
  s = await goHq('jackals', -80); w = s.window;
  c.ok(!!q(w, '[data-faction-refused="jackals"]') && !q(w, '[data-buy]') && !q(w, '[data-shopsell]'), 'Hostile: no trade, no jobs');
  c.ok(!$(w, 'btnFactionGift').disabled, 'but gifts are still accepted');
  click(w, 'btnFactionGift');
  c.ok(F(w).all().jackals.standing === -79, 'a gift moves them +1');
  done(s);

  // Bloom (Many): Research Fragment once per hour at Allied.
  s = await goHq('bloom', 70, { settings: { severity: 'Medium', infection: 'Normal', armedPct: 'Medium', factions: 'Many' } }); w = s.window;
  c.ok(Object.keys(F(w).all()).length === 4, 'Many adds the Bloom');
  const fragBtn = q(w, '[data-buy="Research Fragment"]');
  c.ok(fragBtn && !fragBtn.disabled, 'Allied with the Bloom: a Research Fragment is for sale');
  clickEl(w, fragBtn); await settle(w);
  const fragCard = q(w, '[data-buy="Research Fragment"]').closest('.shop-card');
  c.ok(fragCard.classList.contains('locked') && /RESTOCKS IN 60 MIN/.test(fragCard.textContent), 'then it restocks in an hour');
  const fsave = await captureSave(w);
  c.ok(fsave.factions.bloom.fragLeftMs > 3500000 && fsave.settings.factions === 'Many', 'the restock timer and setting are saved');
  done(s);

  // --- Rumours at ordinary vendors.
  s = await session(baseSave({ visited: ['0,0', '0,1', '1,0'] })); w = s.window;
  let shop = null;
  for (let r = 1; r < 6 && !shop; r++) for (let x = -r; x <= r && !shop; x++) for (const y of [r - Math.abs(x), -(r - Math.abs(x))]) {
    const sc = F(w).sector(x, y);
    if (sc.hasShop && !sc.faction && !(x === 0 && y === 0)) { shop = { x, y }; break; }
  }
  c.ok(!!shop, `found an ordinary vendor to test rumours at [${shop && shop.x},${shop && shop.y}]`);
  F(w).teleport(shop.x - 1, shop.y);
  w.Math.random = () => 0.05;
  click(w, 'btnE');
  c.ok(Object.values(F(w).all()).filter(f => f.discovered).length === 1 && /A vendor talks/.test($(w, 'logFeed').textContent), 'a 10% vendor rumour reveals one HQ');
  done(s);

  // --- Claiming a block in their territory costs 15.
  s = await session(baseSave()); w = s.window;
  {
    const a = F(w).all().union;
    w.__zpFactionsClaim = true;
    F(w).teleport(0, 0);
    w.__zpFactions.queueClaim(a.x + 1, a.y);
    fastForward(w, 2000); await settle(w);
    c.ok(F(w).all().union.standing === -5, `claiming inside Union territory: standing -15 (${F(w).all().union.standing})`);
  }
  done(s);

  // --- Save round trip.
  s = await session(hqSave('union', 33)); w = s.window;
  F(w).discover('authority');
  const sv1 = await captureSave(w);
  c.ok(sv1.factions && sv1.factions.union.standing === 33 && sv1.factions.authority.discovered && !('x' in sv1.factions.union), 'saves keep standing and discovery; sites are not stored');
  done(s);
  s = await session(sv1); w = s.window;
  const sites42 = F(w).sites(42, 'Normal');
  c.ok(F(w).all().union.standing === 33 && F(w).all().authority.discovered && F(w).all().union.x === sites42.union.x, 'loading restores them, sites re-derived from the seed');
  done(s);
  // Garbage in the save is clamped.
  s = await session(Object.assign(baseSave(), { settings: { severity: 'Medium', infection: 'Normal', armedPct: 'Medium', factions: 'Lots' }, factions: { union: { standing: 999, discovered: 'yes', spendUsed: 40 }, evil: { standing: 5 } } })); w = s.window;
  c.ok(Object.keys(F(w).all()).length === 3 && F(w).all().union.standing === 100 && F(w).all().union.discovered === false && !F(w).all().evil, 'bad setting falls back to Normal; values clamped; unknown factions dropped');
  done(s);

  // --- Squad tab panel.
  s = await session(hqSave('union', 25)); w = s.window;
  tab(w, 'squad'); await settle(w);
  c.ok(!!q(w, '[data-faction-card="union"]') && /Harlan Teague/.test($(w, 'factionContent').textContent), 'the Squad tab lists a discovered faction with its leader');
  c.ok(w.document.querySelectorAll('[data-faction-card="unknown"]').length === 2 && /1\/3 found/.test($(w, 'factionCountLabel').textContent), 'undiscovered factions show as unknown');
  c.ok(/Friendly/.test(q(w, '[data-faction-card="union"]').textContent) && /Trauma Kit/.test(q(w, '[data-faction-card="union"]').textContent), 'with its state and unlocks');
  done(s);

  // --- Creation setting.
  s = H.makeSession(); w = s.window; await sleep(300);
  const sel = $(w, 'factionSelect');
  c.ok(sel && [...sel.options].map(o => o.value).join(',') === 'Few,Normal,Many' && sel.value === 'Normal', 'creation offers Few / Normal / Many, default Normal');
  sel.value = 'Few';
  createCharacter(w); await sleep(200);
  c.ok(Object.keys(F(w).all()).join(',') === 'authority,union', 'Few: Authority and Union only');
  done(s);

  c.done(errors);
})();
