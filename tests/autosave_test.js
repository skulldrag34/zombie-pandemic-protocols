const fs = require('fs');
const { JSDOM } = require('jsdom');
const H = require('./harness.js');
const { $, q, click, createCharacter, sleep, baseSave, makeChecker, loadSave } = H;
const html = fs.readFileSync(H.GAME_PATH, 'utf8');
const KEY = 'zp_autosave';

// Session whose localStorage is seeded (or sabotaged) before the game script runs.
function seeded(prep) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/',
    beforeParse(w) { w.__lastBlob = null; w.URL.createObjectURL = (b) => { w.__lastBlob = b; return 'blob:mock'; }; w.URL.revokeObjectURL = () => {}; if (prep) prep(w); } });
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.error ? e.error.stack : e.message));
  return { window: dom.window, errors, close: () => dom.window.close() };
}
function hide(w) {
  Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
}
const stored = (w) => { const r = w.localStorage.getItem(KEY); return r ? JSON.parse(r) : null; };

(async () => {
  const c = makeChecker('AUTOSAVE');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('Writing');
  let s = seeded(); await sleep(200);
  s.window.dispatchEvent(new s.window.Event('pagehide'));
  c.ok(stored(s.window) === null, 'nothing is autosaved from the character-creation screen');
  s.window.document.getElementById('nameInput') && (s.window.document.getElementById('nameInput').value = 'Tess');
  createCharacter(s.window); await sleep(100);
  hide(s.window);
  let d = stored(s.window);
  c.ok(d && d.version === 6 && Number.isFinite(d.savedAt), 'hiding the tab writes a full save to localStorage');
  c.ok(d && d.attributes && d.attributes.str >= 1 && Array.isArray(d.visited), 'the stored save has the normal save shape');
  s.window.localStorage.removeItem(KEY);
  s.window.dispatchEvent(new s.window.Event('pagehide'));
  c.ok(stored(s.window) !== null, 'closing/navigating away (pagehide) also writes the save');
  s.window.localStorage.removeItem(KEY);
  console.log('  (waiting 16s for the periodic autosave)');
  await sleep(16000);
  c.ok(stored(s.window) !== null, 'the 15-second periodic autosave writes to localStorage');
  done(s);

  console.log('Continue on the title screen');
  const save = baseSave({ name: 'Marlowe', level: 7, cash: 321, savedAt: Date.now() });
  s = seeded((w) => w.localStorage.setItem(KEY, JSON.stringify(save))); await sleep(300);
  const note = $(s.window, 'continueBlock').textContent;
  c.ok(/Marlowe, level 7/.test(note), `title screen offers to continue the autosave (${note.trim().slice(0, 40)})`);
  click(s.window, 'btnContinueAutosave'); await sleep(200);
  c.ok(!$(s.window, 'app').classList.contains('hidden'), 'CONTINUE starts the game');
  c.ok(parseInt($(s.window, 'cashNum').textContent, 10) === 321, 'continued game has the saved state (cash 321)');
  done(s);

  s = seeded(); await sleep(300);
  c.ok(!q(s.window, '#btnContinueAutosave'), 'no Continue button when there is no autosave');
  done(s);

  console.log('Robustness');
  s = seeded((w) => w.localStorage.setItem(KEY, '{not json')); await sleep(300);
  c.ok(!q(s.window, '#btnContinueAutosave'), 'a corrupt autosave is ignored (no Continue button, no crash)');
  done(s);

  s = seeded((w) => { w.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }; }); await sleep(200);
  createCharacter(s.window); await sleep(100);
  hide(s.window); s.window.dispatchEvent(new s.window.Event('pagehide'));
  click(s.window, 'btnN'); await sleep(50);
  c.ok(s.errors.length === 0 && !$(s.window, 'app').classList.contains('hidden'), 'a full/blocked localStorage never breaks the game');
  s.errors.length = 0; done(s);

  console.log('Manual save/load still works alongside autosave');
  s = seeded(); await sleep(200);
  loadSave(s.window, baseSave({ name: 'Quill', cash: 77 })); await sleep(300);
  const man = await H.captureSave(s.window);
  c.ok(man.name === 'Quill' && man.cash === 77, 'SAVE GAME export is unaffected');
  hide(s.window);
  c.ok(stored(s.window).name === 'Quill', 'loading a .json file becomes the new autosave on this device');
  done(s);

  c.done(errors);
})();
