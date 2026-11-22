// Combat face-off panel and enemy art (Phase 1: art only, no stats).
// Part A runs a copy with all enemy art removed (fallback behaviour), part B/C a copy with placeholder
// portraits for chosen types, part D the live file with the real portraits.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, sleep, baseSave, makeChecker } = H;

const PIC = 'data:image/webp;base64,UklGRiABAABXRUJQVlA4IBQBAACwHACdASosAZABPp1OpE4lpCOiICgAsBOJaW7hd2EbQAnsA99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D1gAP7/uYQ/0Hxcv/9St+uiqZO+Rgowj8gQAAAAAAAAAAAAAAAAAAA=';
const REAL = fs.readFileSync(H.GAME_PATH, 'utf8');
const NO_ART = REAL.replace(/(<script id="zp-art">[\s\S]*?<\/script>)/, `$1\n<script>window.ZP_ART.enemies = {};</script>`);
// Placeholder art for some types; 'courier', 'soldier', 'bloater' etc. stay missing on purpose.
const WITH_ART = REAL.replace(/(<script id="zp-art">[\s\S]*?<\/script>)/,
  `$1\n<script>window.ZP_ART.enemies = { office: "${PIC}", riot: "${PIC}", feral: "${PIC}", horde: "${PIC}", patient_zero: "${PIC}", resident: "${PIC}" };</script>`);

function session(html, saveObj) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/' });
  const w = dom.window, errors = [];
  w.URL.createObjectURL = () => 'blob:mock'; w.URL.revokeObjectURL = () => {};
  w.addEventListener('error', (e) => errors.push(e.error ? e.error.stack : e.message));
  loadSave(w, saveObj);
  return sleep(300).then(() => ({ window: w, errors, close: () => w.close() }));
}
const hidden = (w, id) => $(w, id).classList.contains('hidden');
const pin = (w, v) => { w.Math.random = () => v; };
const E = (w) => w.__zpEnemyArt;
const fight = (w) => { pin(w, 0.01); click(w, 'btnE'); pin(w, 0.5); };   // move east into Downtown Strip Mall (Commercial)

(async () => {
  const c = makeChecker('FACE-OFF');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('A) No enemy art: combat as before');
  let s = await session(NO_ART, baseSave({ hp: 5000, baseMaxHp: 5000 })); let w = s.window;
  fight(w);
  c.ok(!hidden(w, 'combatOverlay') && hidden(w, 'faceoff') && !hidden(w, 'crosshairWrap'), 'a zombie with no art: combat looks exactly as before (crosshair, no face-off)');
  c.ok(!w.document.getElementById('zp-enemy-art'), 'no enemy stylesheet when there is no enemy art');
  done(s);
  s = await session(NO_ART, baseSave({ claimedBlocks: { '1,0': { postedCompanionId: null } }, alpha: { name: 'The Pale Ferryman', quietMs: 0 },
    roster: [{ id: 7, name: 'Rook', portraitSeed: 7, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null }, turned: true, suspicious: true }] }));
  w = s.window; tab(w, 'squad'); pin(w, 0.01); clickEl(w, q(w, '[data-confront="7"]'));
  c.ok(!hidden(w, 'faceoff') && $(w, 'faceoff').querySelector('.fo-enemy svg') && /Traitor/.test($(w, 'faceoff').textContent), 'a traitor fight shows you vs the traitor\'s face (needs no art)');
  done(s);

  console.log('B) Type selection (art only, stable per fight)');
  s = await session(WITH_ART, baseSave()); w = s.window;
  const key = (o) => E(w).key(Object.assign({ startX: 1, startY: 0, level: 2, queue: [] }, o));
  c.ok(key({ isBoss: true }) === 'patient_zero', 'Patient Zero fight -> patient_zero');
  c.ok(key({ queue: [{ level: 2 }] }) === 'horde', 'more zombies queued -> horde');
  c.ok(key({ isTraitor: true, traitor: { id: 1 } }) === null, 'traitor -> no zombie type');
  c.ok(['office', 'courier'].includes(key({})), 'Commercial area (strip mall) -> office or courier');
  c.ok(['riot', 'soldier'].includes(key({ startX: 1, startY: 1, level: 3 })), 'Military area (precinct) -> riot or soldier');
  c.ok(['resident', 'jogger'].includes(key({ startX: 0, startY: 1, level: 1 })), 'Residential area -> resident or jogger');
  c.ok(['feral', 'bloater'].includes(key({ level: 8 })) && ['feral', 'bloater'].includes(key({ startX: 0, startY: 1, level: 9 })), 'level 8+ anywhere -> feral or bloater');
  const k1 = key({ level: 3, hp: 60, distance: 8 }), k2 = key({ level: 3, hp: 5, distance: 0 });
  c.ok(k1 === k2, 'type does not change as HP or distance change mid-fight');
  let seen = new Set(); for (let x = 1; x < 40; x++) seen.add(E(w).key({ startX: x, startY: 0, level: 2, queue: [] }));
  c.ok(seen.size >= 2, `different spots give different types (${[...seen].join(', ')})`);
  c.ok(E(w).art({ startX: 1, startY: 0, level: 2, queue: [] }) === 'office', 'a type with no art falls back to its pool partner (courier -> office)');
  c.ok(E(w).art({ startX: 1, startY: 1, level: 3, queue: [] }) === 'riot' && E(w).art({ level: 9, startX: 1, startY: 0, queue: [] }) === 'feral', 'fallback works in other pools too');
  c.ok(E(w).art({ startX: 1, startY: 0, level: 2, queue: [{ level: 2 }] }) === 'horde', 'a horde with horde art shows the horde');
  c.ok(['worker', 'courier'].every(k => E(w).art({ startX: 1, startY: 0, level: 2, queue: [] }) !== k), 'missing art is never shown');
  done(s);

  console.log('C) Face-off panel');
  s = await session(WITH_ART, baseSave({ hp: 5000, baseMaxHp: 5000, name: 'Sk<u>ll' })); w = s.window;
  fight(w);
  const fo = $(w, 'faceoff');
  c.ok(!hidden(w, 'faceoff') && hidden(w, 'crosshairWrap'), 'with art the face-off replaces the crosshair');
  const shown = () => { const e = fo.querySelector('[data-enemy-art]'); return e && e.getAttribute('data-enemy-art'); };
  const horde = $(w, 'queueLine').textContent !== '';
  c.ok(shown() === (horde ? 'horde' : 'office') && fo.querySelector('[data-enemy-art]').getAttribute('role') === 'img', `enemy side shows ${horde ? 'The Horde (more are queued)' : 'the strip-mall zombie'} as a labelled picture`);
  c.ok(/VS/.test(fo.textContent) && (horde ? /The Horde/ : /Office Drone/).test(fo.textContent), 'type name and VS are shown');
  c.ok(fo.querySelector('.fo-player svg') && fo.querySelector('.fo-player .fo-name').textContent === 'Sk<u>ll' && !fo.querySelector('u'), 'player side: drawn face and your name (escaped)');
  c.ok(!/data:image/.test(fo.innerHTML), 'markup carries a class, not image data');
  const node = fo.firstChild; await sleep(1250);
  c.ok(fo.firstChild === node, 'the panel is not rebuilt every second');
  if (horde) {
    for (let i = 0; i < 60 && $(w, 'queueLine').textContent !== '' && !hidden(w, 'combatOverlay'); i++) { pin(w, 0.01); click(w, 'btnFire'); click(w, 'btnAdvance'); }
    pin(w, 0.5);
    c.ok(!hidden(w, 'combatOverlay') && shown() === 'office' && /Office Drone/.test(fo.textContent), 'when only the last zombie is left, the panel shows its own type (Office Drone)');
  } else c.ok(true, '(no horde this run: last-zombie switch not exercised)');
  c.ok(/Z-HP/.test($(w, 'combatCard').textContent) && $(w, 'zDist').textContent !== '' && !$(w, 'btnFire').hidden, 'distance, HP and actions are still there');
  done(s);
  s = await session(WITH_ART, baseSave({ hp: 5000, baseMaxHp: 5000, portrait: PIC })); w = s.window;
  fight(w);
  c.ok($(w, 'faceoff').querySelector('.fo-player .pp-cur'), 'with your own portrait, the player side shows it');
  done(s);
  s = await session(WITH_ART, baseSave({ questStage: 'located', patientZeroCoords: { x: 3, y: 3 }, x: 2, y: 3, visited: ['0,0', '2,3', '3,3'] })); w = s.window;
  click(w, 'btnE');
  c.ok($(w, 'faceoff').querySelector('[data-enemy-art="patient_zero"]') && /Patient Zero/.test($(w, 'faceoff').textContent), 'Patient Zero gets its own portrait');
  done(s);
  s = await session(WITH_ART, baseSave({ hp: 5000, baseMaxHp: 5000 })); w = s.window;
  fight(w);
  for (let i = 0; i < 40 && !hidden(w, 'combatOverlay'); i++) { pin(w, 0.01); click(w, 'btnFire'); click(w, 'btnAdvance'); }
  pin(w, 0.5);
  c.ok(hidden(w, 'combatOverlay'), 'the fight can still be won');
  pin(w, 0.01); click(w, 'btnW'); pin(w, 0.5);    // walk back and forth until another fight starts
  for (let i = 0; i < 10 && hidden(w, 'combatOverlay'); i++) { pin(w, 0.01); click(w, i % 2 ? 'btnW' : 'btnE'); pin(w, 0.5); }
  c.ok(!hidden(w, 'combatOverlay') && !hidden(w, 'faceoff') && $(w, 'faceoff').querySelector('[data-enemy-art]'), 'a second fight sets the panel up again');
  done(s);

  console.log('D) Live file: the real portraits');
  const MAN = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'tools', 'art_manifest.json'), 'utf8'));
  s = await session(REAL, baseSave({ hp: 5000, baseMaxHp: 5000 })); w = s.window;
  const live = Object.keys(w.ZP_ART.enemies || {});
  c.ok(live.length === Object.keys(MAN.enemies).length && live.every(k => E(w).types[k]), `every manifest portrait is embedded under a known type (${live.join(', ')})`);
  fight(w);
  const art = $(w, 'faceoff').querySelector('[data-enemy-art]');
  c.ok(!hidden(w, 'faceoff') && art && ['office', 'courier'].includes(art.getAttribute('data-enemy-art')), `a strip-mall fight shows a real portrait (${art && art.getAttribute('data-enemy-art')})`);
  c.ok(w.ZP_ART.enemies.horde || E(w).art({ startX: 1, startY: 0, level: 2, queue: [{ level: 2 }] }) !== null, 'no horde art yet: a horde fight still shows the zombie in front of you');
  done(s);

  c.done(errors);
})();
