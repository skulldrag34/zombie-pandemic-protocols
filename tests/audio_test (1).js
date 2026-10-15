// Audio Phase A: engine, SFX wiring, settings, persistence.
// JSDOM has no Web Audio, so most checks run against a strict fake AudioContext injected
// before the game script loads. The fake throws on the same invalid inputs the real API
// rejects (non-finite values, exponential ramps to <= 0) so scheduling bugs surface here.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, fastForward, settle, sleep, baseSave, makeChecker } = H;

const html = fs.readFileSync(H.GAME_PATH, 'utf8');
const hidden = (win, id) => $(win, id).classList.contains('hidden');

function installFakeAudio(window) {
  const stats = { contexts: 0, sources: 0, started: 0, stoppedEarly: 0, resumes: 0, ctx: null, badParams: [] };
  const check = (v, label) => { if (!Number.isFinite(v)) { stats.badParams.push(label + '=' + v); throw new TypeError('non-finite ' + label); } };
  class Param {
    constructor(v) { this.value = v; }
    setValueAtTime(v, t) { check(v, 'value'); check(t, 'time'); this.value = v; return this; }
    exponentialRampToValueAtTime(v, t) { check(v, 'value'); check(t, 'time'); if (!(v > 0)) { stats.badParams.push('expRamp<=0'); throw new RangeError('exp ramp to <= 0'); } this.value = v; return this; }
    setTargetAtTime(v, t, c) { check(v, 'value'); check(t, 'time'); check(c, 'const'); this.value = v; return this; }
    linearRampToValueAtTime(v, t) { check(v, 'value'); this.value = v; return this; }
  }
  class Node { connect(n) { return n; } disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(1); } }
  class Src extends Node {
    constructor() { super(); stats.sources++; }
    start(t, off) { if (t !== undefined) check(t, 'start'); stats.started++; }
    stop(t) { if (t === undefined) stats.stoppedEarly++; else check(t, 'stop'); }
  }
  class Osc extends Src { constructor() { super(); this.frequency = new Param(440); this.detune = new Param(0); this.type = 'sine'; } }
  class BufSrc extends Src { constructor() { super(); this.buffer = null; this.loop = false; } }
  class Filter extends Node { constructor() { super(); this.frequency = new Param(350); this.Q = new Param(1); this.type = 'lowpass'; } }
  class Comp extends Node { constructor() { super(); this.threshold = new Param(-24); this.ratio = new Param(12); } }
  class Ctx {
    constructor() { stats.contexts++; stats.ctx = this; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = new Node(); this.gains = []; }
    createGain() { const g = new Gain(); this.gains.push(g); return g; }
    createOscillator() { return new Osc(); }
    createBufferSource() { return new BufSrc(); }
    createBiquadFilter() { return new Filter(); }
    createDynamicsCompressor() { return new Comp(); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
    resume() { stats.resumes++; this.state = 'running'; return Promise.resolve(); }
  }
  window.AudioContext = Ctx;
  return stats;
}

function makeAudioSession() {
  let stats = null;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/',
    beforeParse(w) { stats = installFakeAudio(w); }
  });
  const window = dom.window;
  const errors = [];
  window.__lastBlob = null;
  window.URL.createObjectURL = (blob) => { window.__lastBlob = blob; return 'blob:mock'; };
  window.URL.revokeObjectURL = () => {};
  window.addEventListener('error', (e) => errors.push(e.error ? e.error.stack : e.message));
  return { window, errors, stats, close: () => window.close() };
}

const A = (win) => win.__zpAudio;
const playedIds = (win) => A(win).log().filter(e => e.played).map(e => e.id);
const hasPlayed = (win, id) => playedIds(win).includes(id);
const reasonsFor = (win, id) => A(win).log().filter(e => e.id === id).map(e => e.reason);
const gesture = (win) => win.dispatchEvent(new win.Event('pointerdown'));
const key = (win, k) => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k }));
const fixRandom = (win, v) => { win.Math.random = () => v; };
const nextFrame = () => sleep(60); // clears the 40ms same-sound dedupe window

async function loaded(saveObj, opts) {
  const sess = makeAudioSession();
  if (opts && opts.ahead) fastForward(sess.window, opts.ahead);
  if (!opts || opts.gesture !== false) gesture(sess.window);
  if (saveObj) { loadSave(sess.window, saveObj); await sleep(300); }
  A(sess.window).clearLog();
  return sess;
}

(async () => {
  const c = makeChecker('AUDIO');
  const allErrors = [];
  const done = (sess) => { allErrors.push(...sess.errors); sess.close(); };

  // ---------- A: engine lifecycle ----------
  console.log('A) Engine lifecycle: locked until a user gesture, then one context');
  {
    const sess = makeAudioSession();
    const w = sess.window;
    loadSave(w, baseSave()); await sleep(300);
    c.ok(sess.stats.contexts === 0, 'no AudioContext is created before any user gesture (avoids autoplay warnings)');
    A(w).clearLog(); A(w).play('coin');
    c.ok(reasonsFor(w, 'coin')[0] === 'locked', 'sounds requested before the first gesture are skipped, not queued');
    gesture(w); await sleep(10);
    c.ok(sess.stats.contexts === 1 && sess.stats.resumes >= 1, 'first gesture creates exactly one context and resumes it');
    gesture(w); gesture(w);
    c.ok(sess.stats.contexts === 1, 'repeat gestures reuse the same context');
    A(w).clearLog(); await nextFrame(); A(w).play('coin');
    c.ok(hasPlayed(w, 'coin'), 'after unlock, sounds are scheduled');
    done(sess);
  }

  // ---------- B: every SFX builds cleanly; voice cap ----------
  console.log('B) All sound definitions and the 12-voice cap');
  {
    const sess = await loaded(baseSave());
    const w = sess.window;
    const ids = A(w).ids();
    c.ok(ids.length >= 19, `sound library has ${ids.length} effects`);
    ids.forEach(id => A(w).play(id));
    const failed = ids.filter(id => !hasPlayed(w, id));
    c.ok(failed.length === 0, `every effect schedules without error on a strict Web Audio stub${failed.length ? ' (failed: ' + failed.join(', ') + ')' : ''}`);
    c.ok(sess.stats.badParams.length === 0, 'no invalid audio parameters (NaN, exponential ramp to zero)');
    c.ok(A(w).voiceCount() <= 12, `simultaneous voices capped at 12 (${A(w).voiceCount()} live after ${ids.length} requests)`);
    c.ok(sess.stats.stoppedEarly > 0, 'oldest voices are stopped to make room');
    await nextFrame(); A(w).clearLog(); A(w).play('melee_hit'); A(w).play('melee_hit');
    const r = reasonsFor(w, 'melee_hit');
    c.ok(r[0] === 'ok' && r[1] === 'dedupe', 'identical sound within 40ms is collapsed (no stacking)');
    done(sess);
  }

  // ---------- C: combat wiring (Math.random pinned for determinism) ----------
  console.log('C) Combat events -> sounds');
  {
    // Moving east from the Safehouse into the danger-2 landmark with random pinned low always ambushes.
    let sess = await loaded(baseSave({ hp: 5000, baseMaxHp: 5000, inventory: { 'Pistol': 1, 'Ammo': 50, 'Baseball Bat': 1 }, equippedWeapon: 'Pistol' }));
    let w = sess.window;
    fixRandom(w, 0.01);
    click(w, 'btnE');
    c.ok(!hidden(w, 'combatOverlay') && hasPlayed(w, 'zombie_alert'), 'encounter start plays the zombie alert');
    A(w).clearLog(); await nextFrame();
    click(w, 'btnFire');
    c.ok(hasPlayed(w, 'ranged_shot') && !hasPlayed(w, 'melee_hit'), 'firing a gun plays a gunshot, not a melee impact');
    let guard = 0;
    while (!hasPlayed(w, 'zombie_death') && guard++ < 20) { await nextFrame(); click(w, 'btnFire'); }
    c.ok(hasPlayed(w, 'zombie_death'), 'a kill plays the zombie death sound');
    c.ok(hasPlayed(w, 'achievement'), 'first kill unlocks First Blood and plays the achievement sting');
    done(sess);

    // Out of ammo -> dry fire, then a bare-handed swing. FIRE is (by design) disabled for an
    // empty gun out of melee range, so close the distance first.
    sess = await loaded(baseSave({ hp: 5000, baseMaxHp: 5000, inventory: { 'Pistol': 1 }, equippedWeapon: 'Pistol' }));
    w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE');
    c.ok($(w, 'btnFire').disabled, 'empty gun at range: FIRE is disabled (existing rule, unchanged)');
    for (let i = 0; i < 10 && !$(w, 'btnAdvance').disabled; i++) click(w, 'btnAdvance');
    A(w).clearLog(); await nextFrame();
    click(w, 'btnFire');
    c.ok(hasPlayed(w, 'dry_fire') && !hasPlayed(w, 'ranged_shot'), 'empty gun plays dry-fire, never a gunshot');
    c.ok(hasPlayed(w, 'melee_hit'), 'the fallback bare-hand hit plays a melee impact');
    done(sess);

    // Melee miss -> swing; getting hit -> hurt.
    sess = await loaded(baseSave({ hp: 5000, baseMaxHp: 5000 }));
    w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE'); fixRandom(w, 0.99);
    for (let i = 0; i < 6 && !hasPlayed(w, 'player_hurt'); i++) { await nextFrame(); click(w, 'btnAdvance'); }
    c.ok(hasPlayed(w, 'player_hurt'), 'taking damage plays the hurt sound');
    A(w).clearLog(); await nextFrame();
    click(w, 'btnFire');
    c.ok(hasPlayed(w, 'melee_swing'), 'a missed melee attack plays a swing');
    done(sess);

    // Crit.
    sess = await loaded(baseSave({ hp: 5000, baseMaxHp: 5000, attributes: { str: 1, agi: 1, end: 1, per: 1, lck: 10 }, inventory: { 'Pistol': 1, 'Ammo': 50 }, equippedWeapon: 'Pistol' }));
    w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE'); A(w).clearLog(); await nextFrame();
    click(w, 'btnFire');
    c.ok(hasPlayed(w, 'crit'), 'a critical hit plays the crit sound');
    done(sess);

    // Death.
    sess = await loaded(baseSave({ hp: 1 }));
    w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE'); fixRandom(w, 0.5);
    for (let i = 0; i < 8 && hidden(w, 'deathOverlay'); i++) { await nextFrame(); click(w, 'btnAdvance'); }
    c.ok(!hidden(w, 'deathOverlay') && hasPlayed(w, 'player_death'), 'dying plays the death sound');
    c.ok(!A(w).log().some(e => e.id === 'player_hurt'), 'the killing blow plays death, not hurt');
    done(sess);

    // Flee.
    sess = await loaded(baseSave({ hp: 5000, baseMaxHp: 5000 }));
    w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE'); A(w).clearLog(); await nextFrame();
    click(w, 'btnFlee');
    c.ok(hidden(w, 'combatOverlay') && hasPlayed(w, 'flee'), 'a successful flee plays the escape whoosh');
    done(sess);

    // Thrown weapon.
    sess = await loaded(baseSave({ hp: 5000, baseMaxHp: 5000, inventory: { 'Baseball Bat': 1, 'Molotov Cocktail': 2 } }));
    w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE'); click(w, 'subtabThrow'); A(w).clearLog(); await nextFrame();
    clickEl(w, q(w, '[data-throw="Molotov Cocktail"]'));
    c.ok(hasPlayed(w, 'throw'), 'throwing a Molotov plays the throw/ignite sound');
    done(sess);

    // Boss.
    sess = await loaded(baseSave({ questStage: 'located', patientZeroCoords: { x: 3, y: 3 }, x: 2, y: 3, visited: ['0,0', '2,3', '3,3'] }));
    w = sess.window;
    click(w, 'btnE');
    c.ok(hasPlayed(w, 'boss_alert') && !hasPlayed(w, 'zombie_alert'), 'Patient Zero has its own encounter sound');
    done(sess);
  }

  // ---------- D: progression, construction, economy ----------
  console.log('D) Progression, construction, crafting, aid, economy');
  {
    let sess = await loaded(baseSave({ xp: 95, xpToNext: 100, hp: 5000, baseMaxHp: 5000, inventory: { 'Pistol': 1, 'Ammo': 50 }, equippedWeapon: 'Pistol' }));
    let w = sess.window; fixRandom(w, 0.01);
    click(w, 'btnE');
    for (let i = 0; i < 20 && !hasPlayed(w, 'level_up'); i++) { await nextFrame(); click(w, 'btnFire'); }
    c.ok(hasPlayed(w, 'level_up'), 'leveling up plays the level-up motif');
    c.ok(A(w).log().filter(e => e.id === 'level_up').length === 1, 'level-up sound fires once per level-up event');
    done(sess);

    sess = await loaded(baseSave());
    w = sess.window;
    tab(w, 'safehouse'); click(w, 'btnBarricade'); A(w).clearLog();
    fastForward(w, 30000); await settle(w);
    c.ok(hasPlayed(w, 'build_complete'), 'finishing construction plays the build-complete sound');
    tab(w, 'crafting'); clickEl(w, q(w, '[data-craft="craft_bandage"]')); A(w).clearLog();
    fastForward(w, 60000); await settle(w);
    c.ok(hasPlayed(w, 'craft_complete'), 'finishing a craft plays the craft-complete sound');
    done(sess);

    sess = await loaded(baseSave({ hp: 50, inventory: { 'Baseball Bat': 1, 'Bandage': 2 } }));
    w = sess.window;
    click(w, 'btnH');
    c.ok(hasPlayed(w, 'heal'), 'using an aid item plays the heal sound');
    A(w).clearLog(); await nextFrame();
    tab(w, 'shop'); clickEl(w, q(w, '[data-buy="Bandage"]'));
    c.ok(hasPlayed(w, 'coin'), 'buying plays the coin sound');
    A(w).clearLog(); await nextFrame();
    tab(w, 'shop'); clickEl(w, q(w, '[data-shopsell="Bandage"]'));
    c.ok(hasPlayed(w, 'coin'), 'selling plays the coin sound');
    done(sess);

    // Safehouse attack while home: 90s check, random pinned so the attack always lands.
    sess = await loaded(baseSave());
    w = sess.window; fixRandom(w, 0.01);
    fastForward(w, 95000); await settle(w);
    c.ok(!hidden(w, 'combatOverlay') && hasPlayed(w, 'safehouse_alarm'), 'a Safehouse attack plays the siren');
    done(sess);

    // Safehouse breach while away (auto-resolved): siren too.
    sess = await loaded(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], settings: { severity: 'Nightmare', infection: 'Normal', armedPct: 'Medium' } }));
    w = sess.window; fixRandom(w, 0.01);
    fastForward(w, 95000); await settle(w);
    c.ok(hasPlayed(w, 'safehouse_alarm'), 'an auto-resolved breach while away also plays the siren');
    done(sess);
  }

  // ---------- E: settings, mute, UI clicks ----------
  console.log('E) Settings and mute');
  {
    let sess = await loaded(baseSave());
    let w = sess.window;
    const masterGain = () => sess.stats.ctx.gains[0].gain.value;
    c.ok(Math.abs(masterGain() - 0.6) < 1e-9, 'default master volume is 60%');
    c.ok($(w, 'btnMute').textContent === 'SOUND: ON', 'mute button shows SOUND: ON by default');
    click(w, 'btnMute');
    c.ok(masterGain() === 0 && $(w, 'btnMute').textContent === 'SOUND: OFF' && $(w, 'chkMute').checked, 'mute button silences the master bus and syncs both controls');
    A(w).clearLog(); A(w).play('coin');
    c.ok(reasonsFor(w, 'coin')[0] === 'muted', 'while muted, nothing is scheduled');
    key(w, 'm');
    c.ok(masterGain() > 0 && $(w, 'btnMute').textContent === 'SOUND: ON', 'M key toggles sound back on');
    click(w, 'btnFire'); // no-op outside combat; make sure M also works in combat
    fixRandom(w, 0.01); click(w, 'btnE');
    key(w, 'm');
    c.ok(!hidden(w, 'combatOverlay') && getAudio(w).muted === true, 'M key works during combat');
    key(w, 'm');

    const slider = $(w, 'volMaster');
    slider.value = '25'; slider.dispatchEvent(new w.Event('input'));
    c.ok(Math.abs(masterGain() - 0.25) < 1e-9 && $(w, 'volMasterVal').textContent === '25%', 'master slider sets the bus gain and label');
    const sfx = $(w, 'volSfx');
    sfx.value = '40'; sfx.dispatchEvent(new w.Event('input'));
    c.ok(Math.abs(sess.stats.ctx.gains[1].gain.value - 0.4) < 1e-9, 'effects slider sets the SFX bus gain');

    A(w).clearLog(); await nextFrame(); tab(w, 'inventory');
    c.ok(hasPlayed(w, 'ui_click'), 'tab switches play an interface click');
    const ui = $(w, 'chkUiSounds'); ui.checked = false; ui.dispatchEvent(new w.Event('change'));
    A(w).clearLog(); await nextFrame(); tab(w, 'field');
    c.ok(reasonsFor(w, 'ui_click')[0] === 'ui-off', 'interface clicks can be turned off independently');
    A(w).clearLog(); await nextFrame(); A(w).play('melee_hit');
    c.ok(hasPlayed(w, 'melee_hit'), 'gameplay sounds still play with interface clicks off');

    tab(w, 'character');
    slider.focus(); await sleep(1300);
    c.ok($(w, 'volMaster') === slider && w.document.activeElement === slider, 'audio controls survive the 1s render loop (not rebuilt mid-drag)');
    done(sess);
  }

  // ---------- F: persistence and migration ----------
  console.log('F) Save/load and migration');
  {
    let sess = await loaded(baseSave());
    let w = sess.window;
    const slider = $(w, 'volMaster'); slider.value = '35'; slider.dispatchEvent(new w.Event('input'));
    click(w, 'btnMute');
    const ui = $(w, 'chkUiSounds'); ui.checked = false; ui.dispatchEvent(new w.Event('change'));
    const saved = await captureSave(w);
    c.ok(saved.settings && saved.settings.audio && saved.settings.audio.master === 0.35 && saved.settings.audio.muted === true && saved.settings.audio.uiSounds === false, 'audio prefs are written into the save under settings.audio');
    c.ok(saved.settings.severity === 'Medium' && saved.settings.infection === 'Normal', 'existing outbreak settings are untouched');
    done(sess);

    sess = await loaded(saved);
    w = sess.window;
    c.ok(getAudio(w).master === 0.35 && getAudio(w).muted === true && $(w, 'volMaster').value === '35' && $(w, 'btnMute').textContent === 'SOUND: OFF', 'loading restores prefs and syncs the controls');
    const resaved = await captureSave(w);
    c.ok(JSON.stringify(resaved.settings.audio) === JSON.stringify(saved.settings.audio), 'audio prefs round-trip unchanged');
    done(sess);

    // Legacy save with no audio block: keeps whatever the player set this session.
    sess = await loaded(baseSave());
    w = sess.window;
    click(w, 'btnMute');
    const legacy = baseSave({ name: 'Legacy' });
    loadSave(w, legacy); await sleep(300);
    c.ok(getAudio(w).muted === true && Math.abs(getAudio(w).master - 0.6) < 1e-9, 'a pre-audio save does not reset the current session prefs');
    const legacyResave = await captureSave(w);
    c.ok(legacyResave.settings.audio && legacyResave.settings.audio.muted === true, 'and the migrated save now carries an audio block');
    done(sess);

    // Garbage values are sanitized.
    sess = await loaded(baseSave({ settings: { severity: 'High', infection: 'Fast', armedPct: 'Low', audio: { master: 5, sfx: 'loud', music: -2, muted: 'yes', uiSounds: null } } }));
    w = sess.window;
    const p = getAudio(w);
    c.ok(p.master === 1 && p.sfx === 0.7 && p.music === 0 && p.muted === false && p.uiSounds === true, 'out-of-range or wrong-type prefs are clamped or reset to defaults');
    c.ok($(w, 'volMaster').value === '100', 'sanitized values reach the UI');
    done(sess);

    // New character keeps the player's audio prefs.
    sess = makeAudioSession();
    w = sess.window;
    loadSave(w, baseSave()); await sleep(300);
    click(w, 'btnMute');
    click(w, 'btnNewChar'); await sleep(50);
    for (let i = 0; i < 5; i++) clickEl(w, q(w, '[data-dplus="str"]'));
    click(w, 'btnStart');
    const fresh = await captureSave(w);
    c.ok(fresh.name === 'Survivor' && fresh.settings.audio.muted === true, 'starting a new character carries the current audio prefs');
    done(sess);
  }

  // ---------- G: headless safety (no AudioContext at all) ----------
  console.log('G) No Web Audio available');
  {
    const sess = H.makeSession();
    const w = sess.window;
    c.ok(!A(w).available(), 'harness has no AudioContext');
    loadSave(w, baseSave({ hp: 5000, baseMaxHp: 5000 })); await sleep(300);
    gesture(w);
    fixRandom(w, 0.01);
    click(w, 'btnE');
    for (let i = 0; i < 10 && !hidden(w, 'combatOverlay'); i++) { if (!click(w, 'btnFire')) click(w, 'btnAdvance'); }
    tab(w, 'shop'); tab(w, 'character'); click(w, 'btnMute'); click(w, 'btnMute'); click(w, 'btnTestSound');
    const log = A(w).log();
    c.ok(log.length > 0 && log.every(e => e.played === false), 'events are still logged but nothing claims to have played');
    c.ok(log.some(e => e.reason === 'unavailable'), 'reason is reported as unavailable');
    c.ok(sess.errors.length === 0, 'no runtime errors without Web Audio');
    allErrors.push(...sess.errors); sess.close();
  }

  // ---------- H: Alpha (repo build) ----------
  console.log('H) Alpha emergence and Alpha-pack attacks');
  {
    const block = { '1,0': { postedCompanionId: null } };
    // Emergence fires on the render after load, so don't clear the log in between.
    let sess = makeAudioSession();
    let w = sess.window;
    gesture(w);
    loadSave(w, baseSave({ claimedBlocks: block })); await settle(w);
    c.ok(!hidden(w, 'alphaOverlay') && hasPlayed(w, 'boss_alert'), 'Alpha emergence plays the boss sting with its overlay');
    c.ok(A(w).log().filter(e => e.id === 'boss_alert').length === 1, 'emergence sting plays exactly once');
    done(sess);

    sess = makeAudioSession();
    w = sess.window;
    gesture(w);
    loadSave(w, baseSave({ claimedBlocks: block, alpha: { name: 'The Pale Ferryman', quietMs: 123000 } })); await settle(w);
    c.ok(hidden(w, 'alphaOverlay') && !A(w).log().some(e => e.id === 'boss_alert'), 'loading a save with an existing Alpha does not replay the sting');
    done(sess);

    // Alpha-directed attack at home (quiet period over): siren still plays.
    sess = await loaded(baseSave({ claimedBlocks: block, alpha: { name: 'The Pale Ferryman', quietMs: 0 } }));
    w = sess.window; fixRandom(w, 0.01);
    fastForward(w, 95000); await settle(w);
    c.ok(!hidden(w, 'combatOverlay') && /Ferryman/.test($(w, 'combatLog').textContent) && hasPlayed(w, 'safehouse_alarm'), 'an Alpha pack attack on the Safehouse plays the siren');
    done(sess);

    // Alpha-directed breach while away.
    sess = await loaded(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], claimedBlocks: block, alpha: { name: 'The Pale Ferryman', quietMs: 0 }, settings: { severity: 'Nightmare', infection: 'Normal', armedPct: 'Medium' } }));
    w = sess.window; fixRandom(w, 0.01);
    fastForward(w, 95000); await settle(w);
    c.ok(hasPlayed(w, 'safehouse_alarm'), 'an Alpha-pack breach while away plays the siren');
    done(sess);
  }

  c.done(allErrors);
})();

function getAudio(w) { return w.__zpAudio.prefs(); }
