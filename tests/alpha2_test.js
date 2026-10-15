// Alpha Phase 2: turned recruits, detection, sabotage/defection, confront/interrogate/dismiss,
// double agents (defense, intel, flip-back, release), leaks, save migration.
// Determinism: Math.random is pinned (or scripted), and Phase 2's play-time timers are saved just
// below their thresholds so one 5s tick crosses them. fastForward(5000) never reaches the 90s attack check.
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, fastForward, settle, sleep, baseSave, makeChecker } = H;

const hidden = (win, id) => $(win, id).classList.contains('hidden');
const xpOf = (win) => parseInt($(win, 'xpNum').textContent.split('/')[0].trim(), 10);
const logText = (win) => $(win, 'logFeed').textContent;
const rosterHtml = (win) => { tab(win, 'character'); return $(win, 'rosterContent').innerHTML; };
const rosterText = (win) => { tab(win, 'character'); return $(win, 'rosterContent').textContent.replace(/\s+/g, ' '); };
const pin = (win, v) => { win.Math.random = () => v; };
const script = (win, seq, then) => { let i = 0; win.Math.random = () => (i < seq.length ? seq[i++] : then); };
const tick = async (win) => { fastForward(win, 5000); await settle(win); };

const ALPHA = (extra) => Object.assign({ name: 'The Pale Ferryman', quietMs: 0 }, extra || {});
const BLOCK = { '1,0': { postedCompanionId: null } };
const comp = (id, name, extra) => Object.assign({ id, name, portraitSeed: id, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: 'Crowbar', armor: null } }, extra || {});
const alphaSave = (o) => baseSave(Object.assign({ claimedBlocks: BLOCK, alpha: ALPHA() }, o || {}));

async function session(saveObj) {
  const s = H.makeSession();
  loadSave(s.window, saveObj);
  await sleep(300);
  return s;
}

(async () => {
  const c = makeChecker('ALPHA PHASE 2');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  // ---------- A: who gets turned ----------
  console.log('A) Turned recruits');
  {
    // Step north into [0,1] (danger 1, no vendor): the first roll of the move is the ambush check and is
    // forced high so no fight starts; every roll after it is low, so a survivor is met.
    async function meetSurvivor(saveObj) {
      const s = await session(saveObj);
      for (let i = 0; i < 6 && !q(s.window, '#btnRecruit'); i++) {
        script(s.window, [0.9], 0.01);
        click(s.window, i % 2 === 0 ? 'btnN' : 'btnS');
      }
      return s;
    }
    let s = await meetSurvivor(alphaSave());
    c.ok(!!q(s.window, '#btnRecruit') && hidden(s.window, 'combatOverlay'), 'test setup: a survivor was met without a fight');
    pin(s.window, 0.09); clickEl(s.window, q(s.window, '#btnRecruit'));
    let sv = await captureSave(s.window);
    c.ok(sv.roster.length === 1 && sv.roster[0].turned === true, 'escalation 1: a roll under 10% turns the recruit');
    c.ok(!/SUSPICIOUS|DOUBLE AGENT/.test(rosterHtml(s.window)), 'a hidden traitor looks like any other companion');
    done(s);

    s = await meetSurvivor(alphaSave());
    pin(s.window, 0.11); clickEl(s.window, q(s.window, '#btnRecruit'));
    sv = await captureSave(s.window);
    c.ok(sv.roster[0].turned === false, 'escalation 1: a roll of 11% does not turn the recruit');
    done(s);

    const four = { '1,0': { postedCompanionId: null }, '-1,0': { postedCompanionId: null }, '0,1': { postedCompanionId: null }, '0,-1': { postedCompanionId: null } };
    s = await meetSurvivor(alphaSave({ claimedBlocks: four, visited: ['0,0', '1,0', '-1,0', '0,1', '0,-1'] }));
    pin(s.window, 0.14); clickEl(s.window, q(s.window, '#btnRecruit'));
    sv = await captureSave(s.window);
    c.ok(sv.roster[0].turned === true, 'escalation 2 (4 blocks): the chance rises to 15%');
    done(s);

    s = await meetSurvivor(baseSave());
    pin(s.window, 0.01); clickEl(s.window, q(s.window, '#btnRecruit'));
    sv = await captureSave(s.window);
    c.ok(sv.roster[0].turned === false, 'before the Alpha emerges, no recruit is ever turned');
    done(s);
  }

  // ---------- B: detection ----------
  console.log('B) Perception detection (every 3 min of play)');
  {
    const det = (attr, rnd) => async () => {
      const s = await session(alphaSave({ attributes: Object.assign({ str: 1, agi: 1, end: 1, per: 1, lck: 1 }, attr), alpha: ALPHA({ detectMs: 179000 }), roster: [comp(1, 'Rook', { turned: true })] }));
      pin(s.window, rnd); await tick(s.window);
      return s;
    };
    let s = await det({}, 0.069)();
    c.ok(/SUSPICIOUS/.test(rosterHtml(s.window)), 'PER 1 = 7%: a roll of 6.9% exposes the traitor');
    c.ok(/Something's off about Rook/.test(logText(s.window)), 'the exposure is written to the mission log');
    c.ok(!!q(s.window, '[data-confront="1"]') && !!q(s.window, '[data-interrogate="1"]'), 'Confront and Interrogate appear on the card');
    done(s);
    s = await det({}, 0.071)();
    c.ok(!/SUSPICIOUS/.test(rosterHtml(s.window)), 'PER 1: a roll of 7.1% does not');
    done(s);
    s = await det({ per: 10 }, 0.339)();
    c.ok(/SUSPICIOUS/.test(rosterHtml(s.window)), 'PER 10 = 34%: a roll of 33.9% exposes the traitor');
    done(s);
    s = await session(alphaSave({ alpha: ALPHA({ detectMs: 100000 }), roster: [comp(1, 'Rook', { turned: true })] }));
    pin(s.window, 0.01); await tick(s.window);
    c.ok(!/SUSPICIOUS/.test(rosterHtml(s.window)), 'no roll happens before 3 minutes of play have accumulated');
    done(s);
    s = await session(alphaSave({ alpha: ALPHA({ detectMs: 179000 }), roster: [comp(1, 'Rook')] }));
    pin(s.window, 0.01); await tick(s.window);
    c.ok(!/SUSPICIOUS/.test(rosterHtml(s.window)), 'a loyal companion is never marked suspicious (no false positives)');
    done(s);
  }

  // ---------- C: sabotage and defection ----------
  console.log('C) Sabotage (every 5 min of play while the Alpha is active)');
  {
    let s = await session(alphaSave({ alpha: ALPHA({ sabotageMs: 299000 }), roster: [comp(1, 'Rook', { turned: true })] }));
    pin(s.window, 0.01); await tick(s.window);
    let sv = await captureSave(s.window);
    c.ok(sv.safehouseIntegrity === 95 && /barricade brace was cut on Rook's watch/.test(logText(s.window)), 'guard sabotage: -5 integrity, named in the log');
    c.ok(sv.roster[0].sabotage === 1, 'sabotage count recorded');
    done(s);

    s = await session(alphaSave({ alpha: ALPHA({ sabotageMs: 299000 }), roster: [comp(1, 'Rook', { turned: true })] }));
    script(s.window, [0.01, 0.9], 0.99); await tick(s.window);
    sv = await captureSave(s.window);
    c.ok(sv.inventory['Scrap Metal'] === 450 && /50 Scrap Metal is missing/.test(logText(s.window)), 'guard sabotage: steals 10% of scrap (500 -> 450)');
    done(s);

    s = await session(alphaSave({ alpha: ALPHA({ sabotageMs: 299000 }), roster: [comp(1, 'Rook', { turned: true })] }));
    pin(s.window, 0.26); await tick(s.window);
    sv = await captureSave(s.window);
    c.ok(sv.safehouseIntegrity === 100 && sv.roster[0].sabotage === 0, '25% gate: a roll of 26% does nothing');
    done(s);

    s = await session(alphaSave({ alpha: ALPHA({ quietMs: 100000, sabotageMs: 299000 }), roster: [comp(1, 'Rook', { turned: true })] }));
    pin(s.window, 0.01); await tick(s.window);
    sv = await captureSave(s.window);
    c.ok(sv.safehouseIntegrity === 100, 'no sabotage during the Alpha quiet period');
    done(s);

    s = await session(alphaSave({ alpha: ALPHA({ sabotageMs: 299000 }), roster: [comp(1, 'Rook', { turned: true, sabotage: 2 })] }));
    pin(s.window, 0.01); await tick(s.window);
    sv = await captureSave(s.window);
    c.ok(sv.roster.length === 0 && /Rook defects to The Pale Ferryman/.test(logText(s.window)), 'the third sabotage is followed by defection');
    c.ok(!sv.inventory['Crowbar'] && sv.alpha.leak === 1, 'the defector keeps their gear and leaks intel (+1 next attack)');
    done(s);

    // Traveler sabotage: hesitates in the next fight (no assist, won't take a hit).
    s = await session(alphaSave({ hp: 5000, baseMaxHp: 5000, alpha: ALPHA({ sabotageMs: 299000 }), roster: [comp(1, 'Rook', { turned: true, mode: 'travel' })] }));
    pin(s.window, 0.01); await tick(s.window);
    c.ok(/Rook has gone quiet on the road/.test(logText(s.window)), 'traveler sabotage is logged by name');
    pin(s.window, 0.01); click(s.window, 'btnN');
    c.ok(!hidden(s.window, 'combatOverlay') && /Rook hangs back/.test($(s.window, 'combatLog').textContent), 'the next fight opens with them hanging back');
    for (let i = 0; i < 4 && !hidden(s.window, 'combatOverlay'); i++) { if (!click(s.window, 'btnFire')) click(s.window, 'btnAdvance'); }
    c.ok(!/Rook (opens fire|lends a hand|takes the hit)/.test($(s.window, 'combatLog').textContent), 'a hesitating companion neither assists nor takes hits');
    done(s);
  }

  // ---------- D: leaks and the double-agent defense on Alpha attacks ----------
  console.log('D) Alpha attack levels: leaks and double agents');
  {
    // Pinned 0.01 on Medium: base level 2, escalation 1 adds +1 -> 3.
    const attackLevel = async (o) => {
      const s = await session(alphaSave(o));
      pin(s.window, 0.01); fastForward(s.window, 95000); await settle(s.window);
      const lvl = parseInt($(s.window, 'zLevel').textContent, 10);
      const sv = await captureSave(s.window);
      return { s, lvl, sv };
    };
    let r = await attackLevel({});
    c.ok(r.lvl === 3, `baseline Alpha attack at home is level 3 (got ${r.lvl})`);
    done(r.s);
    r = await attackLevel({ alpha: ALPHA({ leak: 2 }) });
    c.ok(r.lvl === 5 && r.sv.alpha.leak === 0 && /Leaked intel guides/.test(logText(r.s.window)), `leaked intel adds +2 once, then clears (got ${r.lvl}, leak now ${r.sv.alpha.leak})`);
    done(r.s);
    r = await attackLevel({ roster: [comp(1, 'Rook', { doubleAgent: true })] });
    c.ok(r.lvl === 2 && /false reports send part of the pack/.test(logText(r.s.window)), `a guarding double agent cuts the attack by 1 (got ${r.lvl})`);
    done(r.s);
    r = await attackLevel({ roster: [comp(1, 'Rook', { doubleAgent: true, mode: 'travel' })] });
    c.ok(r.lvl === 3, `a traveling double agent gives no defense (got ${r.lvl})`);
    done(r.s);
    r = await attackLevel({ alpha: ALPHA({ leak: 1 }), roster: [comp(1, 'Rook', { doubleAgent: true })] });
    c.ok(r.lvl === 3, `leak and double agent combine (+1 -1) (got ${r.lvl})`);
    done(r.s);
    const s = await session(baseSave({ roster: [comp(1, 'Rook', { doubleAgent: true })] }));
    pin(s.window, 0.01); fastForward(s.window, 95000); await settle(s.window);
    c.ok(parseInt($(s.window, 'zLevel').textContent, 10) === 2, 'ordinary (non-Alpha) attacks are unaffected');
    done(s);
  }

  // ---------- E: confront ----------
  console.log('E) Confront and the traitor fight');
  {
    const suspect = (extra) => comp(1, 'Rook', Object.assign({ turned: true, suspicious: true }, extra || {}));
    let s = await session(alphaSave({ hp: 5000, baseMaxHp: 5000, inventory: { 'Pistol': 1, 'Ammo': 50 }, equippedWeapon: 'Pistol', roster: [suspect()] }));
    tab(s.window, 'character'); pin(s.window, 0.01);
    clickEl(s.window, q(s.window, '[data-confront="1"]'));
    c.ok(!hidden(s.window, 'combatOverlay') && $(s.window, 'combatTitle').textContent === 'TRAITOR: ROOK', 'a hostile confront opens a traitor fight');
    c.ok($(s.window, 'zLevel').textContent === '2' && $(s.window, 'zHpNum').textContent === '40 / 40', 'traitor level = companion level + escalation (1+1), HP = their max HP');
    c.ok(!/Rook/.test(rosterText(s.window)), 'they leave the roster as soon as they turn on you');
    for (let i = 0; i < 20 && !hidden(s.window, 'combatOverlay'); i++) click(s.window, 'btnFire');
    let sv = await captureSave(s.window);
    c.ok(hidden(s.window, 'combatOverlay') && /Rook is down/.test(logText(s.window)), 'winning ends the fight');
    c.ok(sv.inventory['Crowbar'] === 1 && xpOf(s.window) === 30, 'gear recovered and +30 XP (level 2 x 15)');
    c.ok(sv.achievements.includes('trust_no_one') && sv.traitorsDefeated === 1, 'Trust No One unlocks');
    c.ok(!sv.inventory['Research Fragment'] && sv.kills === 0, 'a traitor is not counted as a zombie kill');
    done(s);

    s = await session(alphaSave({ roster: [suspect()] }));
    tab(s.window, 'character'); pin(s.window, 0.71);
    clickEl(s.window, q(s.window, '[data-confront="1"]'));
    sv = await captureSave(s.window);
    c.ok(hidden(s.window, 'combatOverlay') && sv.roster.length === 0 && /Rook bolts/.test(logText(s.window)), 'a roll over 70% means they flee instead');
    c.ok(!sv.inventory['Crowbar'] && sv.alpha.leak === 1, 'the runner keeps their gear and leaks intel');
    done(s);

    s = await session(alphaSave({ roster: [suspect()] }));
    tab(s.window, 'character'); pin(s.window, 0.01);
    clickEl(s.window, q(s.window, '[data-confront="1"]'));
    click(s.window, 'btnFlee');
    sv = await captureSave(s.window);
    c.ok(hidden(s.window, 'combatOverlay') && /Rook escapes to The Pale Ferryman/.test(logText(s.window)) && sv.alpha.leak === 1, 'fleeing a traitor fight lets them escape and leak');
    done(s);

    s = await session(alphaSave({ roster: [suspect()] }));
    tab(s.window, 'character');
    clickEl(s.window, q(s.window, '[data-dismiss="1"]'));
    sv = await captureSave(s.window);
    c.ok(sv.roster.length === 0 && !sv.inventory['Crowbar'] && sv.alpha.leak === 1 && /You send Rook away/.test(logText(s.window)), 'dismissing a suspect = the flee outcome (no gear back, leak)');
    done(s);

    s = await session(alphaSave({ roster: [comp(1, 'Rook', { turned: true })] }));
    tab(s.window, 'character');
    clickEl(s.window, q(s.window, '[data-dismiss="1"]'));
    sv = await captureSave(s.window);
    c.ok(sv.inventory['Crowbar'] === 1 && sv.alpha.leak === 0, 'dismissing an undetected traitor looks normal (gear back, no tell)');
    done(s);
  }

  // ---------- F: interrogate ----------
  console.log('F) Interrogate -> double agent');
  {
    let s = await session(alphaSave({ roster: [comp(1, 'Rook', { turned: true, suspicious: true })] }));
    c.ok(/30% double agent/.test(rosterHtml(s.window)), 'level 1: card shows a 30% chance');
    pin(s.window, 0.29); clickEl(s.window, q(s.window, '[data-interrogate="1"]'));
    let sv = await captureSave(s.window);
    c.ok(sv.roster[0].doubleAgent === true && sv.roster[0].turned === false && sv.roster[0].suspicious === false, 'a roll of 29% makes them a double agent');
    c.ok(/DOUBLE AGENT/.test(rosterHtml(s.window)) && /release/.test(rosterHtml(s.window)), 'card shows DOUBLE AGENT and a release button');
    c.ok(sv.achievements.includes('turncoat') && sv.doubleAgentsTurned === 1, 'Turncoat unlocks');
    done(s);

    s = await session(alphaSave({ roster: [comp(1, 'Rook', { turned: true, suspicious: true })] }));
    tab(s.window, 'character'); pin(s.window, 0.31); clickEl(s.window, q(s.window, '[data-interrogate="1"]'));
    c.ok(!hidden(s.window, 'combatOverlay') && /won't talk/.test($(s.window, 'combatLog').textContent), 'a roll of 31% fails: straight into a fight (no flee outcome)');
    done(s);

    s = await session(alphaSave({ roster: [comp(1, 'Rook', { turned: true, suspicious: true, level: 9 })] }));
    c.ok(/70% double agent/.test(rosterHtml(s.window)), 'level 9: chance capped at 70%');
    pin(s.window, 0.69); clickEl(s.window, q(s.window, '[data-interrogate="1"]'));
    sv = await captureSave(s.window);
    c.ok(sv.roster[0].doubleAgent === true, 'a roll of 69% succeeds at level 9');
    done(s);

    s = await session(alphaSave({ roster: [comp(1, 'Rook', { doubleAgent: true }), comp(2, 'Sable', { turned: true, suspicious: true })] }));
    const btn = (tab(s.window, 'character'), q(s.window, '[data-interrogate="2"]'));
    c.ok(btn && btn.disabled && /Only one double agent at a time \(Rook\)/.test(rosterText(s.window)), 'only one double agent at a time');
    done(s);
  }

  // ---------- G: double agent upkeep ----------
  console.log('G) Double agent intel, flip-back and release');
  {
    let s = await session(alphaSave({ alpha: ALPHA({ agentMs: 299000 }), roster: [comp(1, 'Rook', { doubleAgent: true })] }));
    pin(s.window, 0.5); await tick(s.window);
    let sv = await captureSave(s.window);
    c.ok(sv.alpha.intel === 1 && sv.roster.length === 1 && /Rook slips you a report/.test(logText(s.window)), '+1 intel per 5 min; a 50% roll keeps them loyal');
    c.ok(/Alpha intel: 1/.test((tab(s.window, 'safehouse'), $(s.window, 'roomList').innerHTML)), 'intel shows on the Alpha card');
    done(s);

    s = await session(alphaSave({ alpha: ALPHA({ agentMs: 299000 }), roster: [comp(1, 'Rook', { doubleAgent: true })] }));
    pin(s.window, 0.09); await tick(s.window);
    sv = await captureSave(s.window);
    c.ok(sv.alpha.intel === 1 && sv.roster.length === 0 && sv.alpha.leak === 2 && !sv.inventory['Crowbar'], 'a 9% roll flips them back: they leave with gear and leak +2');
    done(s);

    s = await session(alphaSave({ roster: [comp(1, 'Rook', { doubleAgent: true })] }));
    tab(s.window, 'character'); clickEl(s.window, q(s.window, '[data-dismiss="1"]'));
    sv = await captureSave(s.window);
    c.ok(sv.roster.length === 0 && sv.inventory['Crowbar'] === 1 && sv.alpha.leak === 0, 'releasing a double agent is safe: gear back, no leak');
    done(s);
  }

  // ---------- H: saves ----------
  console.log('H) Save migration and validation');
  {
    let s = await session(alphaSave({ roster: [comp(1, 'Rook')] }));
    let sv = await captureSave(s.window);
    const r = sv.roster[0];
    c.ok(r.turned === false && r.suspicious === false && r.doubleAgent === false && r.sabotage === 0, 'pre-Phase-2 companions load with safe defaults');
    c.ok(sv.alpha.intel === 0 && sv.alpha.leak === 0 && sv.traitorsDefeated === 0 && sv.doubleAgentsTurned === 0, 'new Alpha and stat fields default to 0');
    done(s);

    s = await session(baseSave({ roster: [comp(1, 'Rook', { turned: true, suspicious: true }), comp(2, 'Sable', { doubleAgent: true })] }));
    sv = await captureSave(s.window);
    c.ok(sv.roster.every(x => !x.turned && !x.suspicious && !x.doubleAgent), 'with no Alpha, spy flags are cleared');
    done(s);

    s = await session(alphaSave({ roster: [comp(1, 'Rook', { doubleAgent: true }), comp(2, 'Sable', { doubleAgent: true }), comp(3, 'Wren', { doubleAgent: true, turned: true })] }));
    sv = await captureSave(s.window);
    c.ok(sv.roster.filter(x => x.doubleAgent).length === 1 && sv.roster[2].turned === true && sv.roster[2].doubleAgent === false, 'at most one double agent; turned wins over double agent');
    done(s);

    s = await session(alphaSave({ traitorsDefeated: 'lots', doubleAgentsTurned: -3, alpha: ALPHA({ intel: -5, leak: 99, detectMs: 1e12 }), roster: [comp(1, 'Rook', { turned: true, sabotage: 50, suspicious: 'yes' })] }));
    sv = await captureSave(s.window);
    c.ok(sv.alpha.intel === 0 && sv.alpha.leak === 5 && sv.alpha.detectMs < 180000, 'hostile Alpha values are clamped (intel >= 0, leak <= 5, timers < interval)');
    c.ok(sv.roster[0].sabotage === 2 && sv.roster[0].suspicious === false && sv.traitorsDefeated === 0 && sv.doubleAgentsTurned === 0, 'hostile companion/stat values are clamped');
    done(s);

    s = await session(alphaSave({ alpha: ALPHA({ intel: 4, leak: 1 }), roster: [comp(1, 'Rook', { turned: true, suspicious: true, sabotage: 1 }), comp(2, 'Sable', { doubleAgent: true })], traitorsDefeated: 2, doubleAgentsTurned: 1 }));
    sv = await captureSave(s.window);
    const s2 = await session(sv);
    const sv2 = await captureSave(s2.window);
    const pick = (o) => JSON.stringify({ a: { intel: o.alpha.intel, leak: o.alpha.leak }, r: o.roster.map(x => [x.turned, x.suspicious, x.sabotage, x.doubleAgent]), t: o.traitorsDefeated, d: o.doubleAgentsTurned });
    c.ok(pick(sv) === pick(sv2) && sv2.alpha.intel === 4 && sv2.traitorsDefeated === 2, 'Phase 2 state round-trips through save/load unchanged');
    done(s); done(s2);
  }

  c.done(errors);
})();
