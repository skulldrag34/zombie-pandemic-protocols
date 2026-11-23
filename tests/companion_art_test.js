// Companion portraits: fixed face slots by name gender + portraitSeed, art where the slot has it,
// the drawn face where it doesn't; roster cards, encounter card and traitor face-off.
const fs = require('fs'), path = require('path');
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, sleep, baseSave, makeChecker } = H;
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'art_manifest.json'), 'utf8'));
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const comp = (id, name, seed, extra) => Object.assign({ id, name, portraitSeed: seed, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null } }, extra || {});
function webpSize(buf) { if (buf.toString('ascii', 12, 16) !== 'VP8 ') return null; return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }; }

(async () => {
  const c = makeChecker('COMPANION ART');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  let s = await session(baseSave()); let w = s.window;
  const CA = w.__zpCompanionArt, arts = w.ZP_ART.companions || {};
  console.log('A) Data and slots');
  const keys = Object.keys(arts).sort();
  c.ok(keys.length === Object.keys(MAN.companions).length && keys.every(k => /^c\d+$/.test(k)), `all manifest portraits embedded (${keys.join(', ')})`);
  c.ok(keys.every(k => { const z = webpSize(Buffer.from(arts[k].split(',')[1], 'base64')); return z && z.w === 240 && z.h === 320; }), 'each is a 240x320 WebP');
  c.ok(!arts.c1, 'C1 is held back (not embedded)');
  c.ok(CA.slots.m.length + CA.slots.f.length === 12 && new Set([...CA.slots.m, ...CA.slots.f]).size === 12, '12 distinct slots: 7 men, 5 women');
  c.ok(CA.female.has('Fatima') && !CA.female.has('Kwame'), 'names carry a gender (Fatima: woman, Kwame: man)');
  c.ok(CA.slots.f.includes(CA.slot('Naomi', 123456)) && CA.slots.m.includes(CA.slot('Jamal', 123456)), "a woman's name gets a woman's slot, a man's name a man's");
  c.ok(CA.slot('Rook', 987654) === CA.slot('Rook', 987654), 'the same companion always gets the same slot');
  c.ok(CA.slot('Hazel', 0) === 'c2' && CA.key('Hazel', 0) === 'c2' && CA.slot('Hazel', 4) === 'c11' && CA.key('Hazel', 4) === null, 'a slot with art gives its key; a slot without art (C11) gives none');
  c.ok(CA.slot('Cole', 0) === 'c1' && CA.key('Cole', 0) === null && CA.key('Cole', 1) === 'c3', 'C1 slot falls back to the drawn face; C3 has art');
  done(s);

  console.log('B) Roster cards (Squad tab)');
  s = await session(baseSave({ roster: [comp(1, 'Hazel', 0), comp(2, 'Cole', 0), comp(3, 'Kenji', 1)] })); w = s.window;
  tab(w, 'squad');
  const card = (name) => [...w.document.querySelectorAll('.roster-card')].find(e => e.textContent.includes(name));
  c.ok(card('Hazel').querySelector('[data-comp-art="c2"].ca-c2') && card('Hazel').querySelector('.portrait-frame.has-photo'), 'Hazel shows portrait C2 (sepia filter lifted)');
  c.ok(card('Kenji').querySelector('[data-comp-art="c3"]'), 'Kenji shows portrait C3');
  c.ok(card('Cole').querySelector('.portrait-frame svg') && !card('Cole').querySelector('[data-comp-art]'), 'Cole (C1 slot, held back) keeps the drawn face');
  c.ok(!/data:image/.test($(w, 'rosterContent').innerHTML) && w.document.getElementById('zp-companion-art'), 'cards carry a class; images live in one stylesheet');
  done(s);

  console.log('C) Encounter card');
  s = await session(baseSave()); w = s.window;
  for (let i = 0; i < 8 && !q(w, '#btnRecruit'); i++) { let n = 0; w.Math.random = () => (n++ === 0 ? 0.9 : 0.01); click(w, i % 2 === 0 ? 'btnN' : 'btnS'); }
  const npcCard = q(w, '.npc-card');
  if (npcCard) {
    const name = npcCard.querySelector('.title').textContent.split(' (')[0];
    const seed = Math.floor(0.01 * 4294967295), k = w.__zpCompanionArt.key(name, seed);
    c.ok(k ? !!npcCard.querySelector(`[data-comp-art="${k}"]`) : !!npcCard.querySelector('svg'), `the survivor you meet (${name}) shows ${k ? 'portrait ' + k : 'the drawn face'}`);
    w.Math.random = () => 0.5; clickEl(w, q(w, '#btnRecruit')); tab(w, 'squad');
    const rc = [...w.document.querySelectorAll('.roster-card')].find(e => e.textContent.includes(name));
    c.ok(rc && (k ? !!rc.querySelector(`[data-comp-art="${k}"]`) : !!rc.querySelector('svg')), 'and keeps the same face after recruiting');
  } else { c.ok(false, 'could not trigger a survivor encounter'); c.ok(false, '(skipped)'); }
  done(s);

  console.log('D) Traitor face-off');
  s = await session(baseSave({ claimedBlocks: { '1,0': { postedCompanionId: null } }, alpha: { name: 'The Pale Ferryman', quietMs: 0 },
    roster: [comp(7, 'Hazel', 0, { turned: true, suspicious: true })] })); w = s.window;
  tab(w, 'squad'); w.Math.random = () => 0.01; clickEl(w, q(w, '[data-confront="7"]'));
  c.ok(!$(w, 'faceoff').classList.contains('hidden') && $(w, 'faceoff').querySelector('.fo-enemy [data-comp-art="c2"]'), "a traitor fight shows the traitor's own portrait (C2)");
  done(s);

  c.done(errors);
})();
