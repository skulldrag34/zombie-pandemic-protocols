// Audio Phase B: adaptive music + ambience.
// Mood selection is checked in the plain harness (no Web Audio needed). The engine is checked
// against a strict Web Audio stub whose clock the test advances by hand, so scheduling, crossfades,
// mute/volume gating, ambience and the background pause are deterministic. How it *sounds* is a
// playtest call; these tests prove the right music is scheduled at the right time.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, sleep, baseSave, makeChecker } = H;

const html = fs.readFileSync(H.GAME_PATH, 'utf8');
const hidden = (win, id) => $(win, id).classList.contains('hidden');
const M = (win) => win.__zpAudio.music();
const pin = (win, v) => { win.Math.random = () => v; };

function installFakeAudio(window) {
  const stats = { contexts: 0, ctx: null, badParams: [], suspends: 0, resumes: 0 };
  const check = (v, label) => { if (!Number.isFinite(v)) { stats.badParams.push(label + '=' + v); throw new TypeError('non-finite ' + label); } };
  class Param {
    constructor(v) { this.value = v; }
    setValueAtTime(v, t) { check(v, 'value'); check(t, 'time'); this.value = v; return this; }
    exponentialRampToValueAtTime(v, t) { check(v, 'value'); check(t, 'time'); if (!(v > 0)) { stats.badParams.push('expRamp<=0'); throw new RangeError('exp ramp to <= 0'); } this.value = v; return this; }
    setTargetAtTime(v, t, c) { check(v, 'value'); check(t, 'time'); check(c, 'const'); this.value = v; return this; }
    linearRampToValueAtTime(v, t) { check(v, 'value'); this.value = v; return this; }
    cancelScheduledValues(t) { check(t, 'time'); return this; }
  }
  class Node { connect(n) { return n; } disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(1); } }
  class Src extends Node { start(t) { if (t !== undefined) check(t, 'start'); } stop(t) { if (t !== undefined) check(t, 'stop'); } }
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
    suspend() { stats.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  }
  window.AudioContext = Ctx;
  return stats;
}

function audioSession() {
  let stats = null;
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', beforeParse(w) { stats = installFakeAudio(w); } });
  const window = dom.window, errors = [];
  window.__lastBlob = null;
  window.URL.createObjectURL = (blob) => { window.__lastBlob = blob; return 'blob:mock'; };
  window.URL.revokeObjectURL = () => {};
  window.addEventListener('error', (e) => errors.push(e.error ? e.error.stack : e.message));
  return { window, errors, stats, close: () => window.close() };
}

const gesture = (w) => w.dispatchEvent(new w.Event('pointerdown'));
// Advance the stub's audio clock smoothly (0.1s steps, like a real clock) and let the 25ms music timer
// run between steps. A single big jump would trip the scheduler's stall-resync, which by design skips
// overdue notes instead of firing them in a burst.
const advance = async (sess, secs) => {
  const steps = Math.max(1, Math.round(secs / 0.1));
  for (let i = 0; i < steps; i++) { sess.stats.ctx.currentTime += secs / steps; await sleep(30); }
  await sleep(30);
};

async function plain(saveObj) { const s = H.makeSession(); loadSave(s.window, saveObj); await sleep(300); return s; }
async function live(saveObj) { const s = audioSession(); gesture(s.window); loadSave(s.window, saveObj); await sleep(300); return s; }

const ALPHA = { name: 'The Pale Ferryman', quietMs: 0 };
const BLOCK = { '1,0': { postedCompanionId: null } };

(async () => {
  const c = makeChecker('MUSIC');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  // ---------- A: mood selection ----------
  console.log('A) Mood follows location and situation, not level');
  {
    const moodAt = async (o) => { const s = await plain(baseSave(o)); const m = M(s.window).desired; done(s); return m; };
    c.ok(await moodAt({}) === 'haven', 'Safehouse -> haven');
    c.ok(await moodAt({ claimedBlocks: BLOCK, alpha: ALPHA }) === 'haven_alpha', 'Safehouse with an active Alpha -> haven_alpha');
    c.ok(await moodAt({ claimedBlocks: BLOCK, alpha: Object.assign({}, ALPHA, { quietMs: 60000 }) }) === 'haven', 'Alpha still in its quiet period -> plain haven');
    c.ok(await moodAt({ x: 1, y: 0, visited: ['0,0', '1,0'] }) === 'outskirts', 'danger 2 (strip mall) -> outskirts');
    c.ok(await moodAt({ x: 1, y: 1, visited: ['0,0', '1,1'] }) === 'hostile', 'danger 3 (precinct) -> hostile');
    c.ok(await moodAt({ x: 8, y: 8, visited: ['0,0', '8,8'] }) === 'deadzone', 'far out (danger 6+) -> deadzone');
    c.ok(await moodAt({ x: 1, y: 0, visited: ['0,0', '1,0'], level: 25 }) === 'outskirts', 'player level does not change the mood');

    let s = await plain(baseSave({ hp: 5000, baseMaxHp: 5000 }));
    pin(s.window, 0.01); click(s.window, 'btnE');
    c.ok(!hidden(s.window, 'combatOverlay') && M(s.window).desired === 'combat', 'a field fight -> combat');
    done(s);
    s = await plain(baseSave({ questStage: 'located', patientZeroCoords: { x: 3, y: 3 }, x: 2, y: 3, visited: ['0,0', '2,3', '3,3'] }));
    click(s.window, 'btnE');
    c.ok(M(s.window).desired === 'boss', 'Patient Zero -> boss');
    done(s);
    s = await plain(baseSave({ claimedBlocks: BLOCK, alpha: ALPHA, roster: [{ id: 1, name: 'Rook', portraitSeed: 1, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null }, turned: true, suspicious: true }] }));
    tab(s.window, 'character'); pin(s.window, 0.01); clickEl(s.window, q(s.window, '[data-confront="1"]'));
    c.ok(M(s.window).desired === 'boss', 'a traitor fight -> boss');
    done(s);
    s = await plain(baseSave({ hp: 1 }));
    pin(s.window, 0.01); click(s.window, 'btnE'); pin(s.window, 0.5);
    for (let i = 0; i < 8 && hidden(s.window, 'deathOverlay'); i++) click(s.window, 'btnAdvance');
    c.ok(!hidden(s.window, 'deathOverlay') && M(s.window).desired === 'fallen', 'death -> fallen');
    done(s);
    s = await plain(baseSave());
    click(s.window, 'btnNewChar');
    c.ok(M(s.window).desired === null, 'back on the character screen -> no music');
    done(s);
  }

  // ---------- B: engine ----------
  console.log('B) Scheduler, crossfades, gating');
  {
    let s = audioSession();
    loadSave(s.window, baseSave()); await sleep(300);
    c.ok(s.stats.contexts === 0 && M(s.window).running === false && M(s.window).notes === 0, 'nothing runs before the first user gesture');
    done(s);

    s = await live(baseSave());
    let m = M(s.window);
    c.ok(m.running && m.mood === 'haven' && m.notes > 0, `after a gesture the haven theme starts (${m.notes} notes)`);
    c.ok(m.moods[0].mood === 'haven' && m.moods[0].fade === 2, 'mood changes crossfade over 2s');
    const n0 = m.notes;
    await advance(s, 4);
    c.ok(M(s.window).notes > n0, `notes keep being scheduled as the clock moves (${n0} -> ${M(s.window).notes})`);
    // haven = 60bpm -> 0.5s 8th notes; over 30s the step count is ~60, so pads + bells stay sparse.
    const before = M(s.window).notes; await advance(s, 30); const added = M(s.window).notes - before;
    c.ok(added > 5 && added < 120, `haven stays sparse (${added} notes in 30s)`);

    pin(s.window, 0.01); click(s.window, 'btnE'); await advance(s, 0.2);
    m = M(s.window);
    c.ok(m.mood === 'combat' && m.moods[m.moods.length - 1].fade === 0.5, 'combat cuts in with a fast 0.5s crossfade');
    const cb = m.notes; await advance(s, 2);
    // 120bpm -> 0.25s steps -> 8 steps in 2s; per step: hat + bass, kick every 2nd, snare every 4th = 22 notes.
    const cAdded = M(s.window).notes - cb;
    c.ok(cAdded >= 18 && cAdded <= 26, `combat is dense: ~22 notes in 2s at 120bpm (got ${cAdded})`);

    click(s.window, 'btnMute');
    let mn = M(s.window).notes; await advance(s, 3);
    c.ok(M(s.window).notes === mn, 'muted: no notes are scheduled');
    click(s.window, 'btnMute');
    const vm = $(s.window, 'volMusic'); vm.value = '0'; vm.dispatchEvent(new s.window.Event('input'));
    mn = M(s.window).notes; await advance(s, 3);
    c.ok(M(s.window).notes === mn, 'music at 0%: no notes are scheduled');
    vm.value = '50'; vm.dispatchEvent(new s.window.Event('input'));
    c.ok(Math.abs(s.stats.ctx.gains[2].gain.value - 0.5) < 1e-9 && $(s.window, 'volMusicVal').textContent === '50%', 'music slider drives the music bus (50%)');
    mn = M(s.window).notes; await advance(s, 1);
    c.ok(M(s.window).notes > mn, 'music resumes when volume returns');

    Object.defineProperty(s.window.document, 'hidden', { configurable: true, get: () => true });
    s.window.document.dispatchEvent(new s.window.Event('visibilitychange'));
    mn = M(s.window).notes; await advance(s, 3);
    c.ok(s.stats.suspends === 1 && M(s.window).notes === mn, 'background tab: context suspended, no notes scheduled');
    Object.defineProperty(s.window.document, 'hidden', { configurable: true, get: () => false });
    s.window.document.dispatchEvent(new s.window.Event('visibilitychange'));
    await sleep(20); await advance(s, 1);
    c.ok(s.stats.ctx.state === 'running' && M(s.window).notes > mn, 'tab back in front: resumes');
    c.ok(s.stats.badParams.length === 0, 'no invalid audio parameters across all moods so far');
    done(s);

    // Every mood schedules cleanly on the strict stub.
    const moodSaves = {
      haven_alpha: baseSave({ claimedBlocks: BLOCK, alpha: ALPHA }),
      outskirts: baseSave({ x: 1, y: 0, visited: ['0,0', '1,0'] }),
      hostile: baseSave({ x: 1, y: 1, visited: ['0,0', '1,1'] }),
      deadzone: baseSave({ x: 8, y: 8, visited: ['0,0', '8,8'] })
    };
    for (const [mood, sv] of Object.entries(moodSaves)) {
      s = await live(sv);
      const a = M(s.window).notes; await advance(s, 8);
      c.ok(M(s.window).mood === mood && M(s.window).notes > a && s.stats.badParams.length === 0, `${mood}: plays cleanly (${M(s.window).notes - a} notes in 8s)`);
      done(s);
    }
    s = await live(baseSave({ questStage: 'located', patientZeroCoords: { x: 3, y: 3 }, x: 2, y: 3, visited: ['0,0', '2,3', '3,3'] }));
    click(s.window, 'btnE'); await advance(s, 0.2); const bn = M(s.window).notes; await advance(s, 4);
    c.ok(M(s.window).mood === 'boss' && M(s.window).notes > bn && s.stats.badParams.length === 0, 'boss: plays cleanly');
    done(s);
    s = await live(baseSave({ hp: 1 }));
    pin(s.window, 0.01); click(s.window, 'btnE'); pin(s.window, 0.5);
    for (let i = 0; i < 8 && hidden(s.window, 'deathOverlay'); i++) click(s.window, 'btnAdvance');
    await advance(s, 0.2); const fn = M(s.window).notes; await advance(s, 5);
    c.ok(M(s.window).mood === 'fallen' && M(s.window).notes === fn, 'fallen: one fading tone, then silence');
    done(s);
  }

  // ---------- C: ambience ----------
  console.log('C) Ambience');
  {
    let s = await live(baseSave());
    await advance(s, 0.2);
    c.ok(Math.abs(M(s.window).wind - 0.012) < 1e-9, 'Safehouse: faint wind (0.012)');
    done(s);
    s = await live(baseSave({ x: 1, y: 1, visited: ['0,0', '1,1'] }));
    pin(s.window, 0.01);
    await advance(s, 0.2);
    c.ok(Math.abs(M(s.window).wind - 0.044) < 1e-9, 'danger 3: wind thickens (0.02 + 0.008 x 3 = 0.044)');
    for (let i = 0; i < 6; i++) await advance(s, 3);
    c.ok(M(s.window).groans > 0, `danger 3+: distant groans occur (${M(s.window).groans})`);
    const va = $(s.window, 'volAmbience'); va.value = '0'; va.dispatchEvent(new s.window.Event('input'));
    await advance(s, 0.2);
    const g0 = M(s.window).groans;
    for (let i = 0; i < 4; i++) await advance(s, 3);
    c.ok(M(s.window).wind === 0.0001 && M(s.window).groans === g0, 'ambience at 0%: wind silent, no groans');
    done(s);
    s = await live(baseSave({ x: 1, y: 0, visited: ['0,0', '1,0'] }));
    pin(s.window, 0.01);
    for (let i = 0; i < 6; i++) await advance(s, 3);
    c.ok(M(s.window).groans === 0, 'danger 2: no groans yet (they start at danger 3)');
    done(s);
  }

  // ---------- D: identity and settings ----------
  console.log('D) Per-world key and saved settings');
  {
    const keyFor = async (seed) => { const s = await plain(baseSave({ seed })); const k = JSON.stringify(M(s.window).key); done(s); return k; };
    const k42a = await keyFor(42), k42b = await keyFor(42);
    c.ok(k42a === k42b && k42a !== 'null', `the same world always gets the same key (${k42a})`);
    const keys = new Set([k42a, await keyFor(7), await keyFor(99), await keyFor(12345), await keyFor(2024)]);
    c.ok(keys.size >= 3, `different worlds get different keys (${keys.size} distinct of 5)`);

    let s = await live(baseSave());
    const vm = $(s.window, 'volMusic'); vm.value = '20'; vm.dispatchEvent(new s.window.Event('input'));
    const va = $(s.window, 'volAmbience'); va.value = '80'; va.dispatchEvent(new s.window.Event('input'));
    const sv = await captureSave(s.window);
    c.ok(sv.settings.audio.music === 0.2 && sv.settings.audio.ambience === 0.8, 'music and ambience volumes are saved');
    done(s);
    s = await live(sv);
    c.ok($(s.window, 'volMusic').value === '20' && $(s.window, 'volAmbience').value === '80' && $(s.window, 'volAmbienceVal').textContent === '80%', 'and restored into the sliders on load');
    done(s);
    s = await plain(baseSave());
    c.ok($(s.window, 'volMusic').value === '35' && $(s.window, 'volAmbience').value === '50', 'defaults: music 35%, ambience 50%');
    done(s);
  }

  c.done(errors);
})();
