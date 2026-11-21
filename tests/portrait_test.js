// Player portrait: the player's own picture, cropped to 3:4 (300x400) in the browser and kept in the save.
// JSDOM has no canvas, so these checks hand the game an already-processed picture through the test hook
// and cover state, save/load, sanitizing, UI and the creation screen. The real decode/crop/encode path
// is covered in a real browser by browser_portrait.js.
const H = require('./harness.js');
const { $, q, tab, click, clickEl, loadSave, captureSave, sleep, baseSave, makeChecker, createCharacter } = H;

// Two tiny 300x400 WebP pictures (solid colours), the shape the game produces.
const PIC_A = 'data:image/webp;base64,UklGRiABAABXRUJQVlA4IBQBAADwHACdASosAZABPm02mUmkIyKhICgAgA2JaW7hd2Ee3AAAFpbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snCgA/v+zhX//WpkY+jF///JT+u7yi5eAAAAAAAAAAAAAAAAAAAA=';
const PIC_B = 'data:image/webp;base64,UklGRiABAABXRUJQVlA4IBQBAADwHACdASosAZABPm02mUmkIyKhICgAgA2JaW7hd2Ee3AAAE9gHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIesAA/v+11v//+Ic6HOhy/9//1te28MKAAAAAAAAAAAAAAAAAAAA=';
const P = (w) => w.__zpPortrait;
const hidden = (w, id) => $(w, id).classList.contains('hidden');
const styleText = (w) => { const el = w.document.getElementById('zp-player-portrait'); return el ? el.textContent : ''; };
async function session(saveObj) { const s = H.makeSession(); loadSave(s.window, saveObj); await sleep(300); return s; }
const nextTick = () => sleep(1150);   // let the 1s render pass run

(async () => {
  const c = makeChecker('PORTRAIT');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('A) No portrait: drawn face, nothing extra');
  let s = await session(baseSave());
  let w = s.window;
  tab(w, 'character');
  let cc = $(w, 'characterContent');
  c.ok(P(w).get() === null && cc.querySelector('svg') && !cc.querySelector('[data-portrait]'), 'a save without a portrait keeps the drawn face');
  c.ok(q(w, '[data-portrait-add]') && /ADD PORTRAIT/.test(q(w, '[data-portrait-add]').textContent) && !q(w, '[data-portrait-remove]'), 'Character tab offers ADD PORTRAIT, no REMOVE');
  c.ok(hidden(w, 'hudPortrait'), 'no thumbnail in the stats panel');
  let opened = 0; $(w, 'portraitInput').click = () => { opened++; };
  clickEl(w, q(w, '[data-portrait-add]'));
  c.ok(opened === 1, 'ADD PORTRAIT opens the image picker');

  console.log('B) Adding a portrait');
  c.ok(P(w).setPlayer(PIC_A) === true && P(w).get() === PIC_A, 'a processed picture is accepted');
  cc = $(w, 'characterContent');
  c.ok(cc.querySelector('[data-portrait="player"].pp-cur') && !cc.querySelector('svg.portrait, .portrait-frame svg'), 'Character tab shows the picture instead of the drawn face');
  c.ok(cc.querySelector('.portrait-frame.has-photo'), 'the sepia frame filter is lifted for real pictures');
  c.ok(/CHANGE/.test(q(w, '[data-portrait-add]').textContent) && q(w, '[data-portrait-remove]'), 'buttons become CHANGE and REMOVE');
  c.ok(!hidden(w, 'hudPortrait') && $(w, 'hudPortrait').classList.contains('pp-cur'), 'stats panel shows a thumbnail');
  c.ok(styleText(w).includes(PIC_A), 'the picture lives in one generated stylesheet');
  await nextTick();
  c.ok(!/data:image/.test(cc.innerHTML) && !/data:image/.test($(w, 'hudPortrait').outerHTML), 'markup carries a class, not image data (cheap 1s re-render)');
  c.ok(P(w).setPlayer(PIC_B) && styleText(w).includes(PIC_B) && !styleText(w).includes(PIC_A), 'changing it swaps the stylesheet');

  console.log('C) Bad input is refused');
  const bad = [
    ['javascript:alert(1)', 'a script URL'],
    ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'an SVG (could carry script)'],
    ['data:image/webp;base64,AAA") ; } body{display:none', 'CSS injection'],
    ['data:image/webp;base64,' + 'A'.repeat(P(w).maxChars), 'an oversized picture'],
    [12345, 'a non-string']
  ];
  for (const [v, label] of bad) c.ok(P(w).setPlayer(v) === false && P(w).get() === PIC_B, `refused: ${label}`);

  console.log('D) Save and load');
  let sv = await captureSave(w);
  c.ok(sv.portrait === PIC_B, 'the portrait is written to the save');
  done(s);
  s = await session(sv); w = s.window; tab(w, 'character');
  c.ok(P(w).get() === PIC_B && q(w, '[data-portrait="player"]') && styleText(w).includes(PIC_B), 'and restored on load');
  done(s);
  for (const [v, label] of bad) {
    s = await session(baseSave({ portrait: v })); w = s.window;
    c.ok(P(w).get() === null && s.errors.length === 0, `a save holding ${label} loads with no portrait`);
    done(s);
  }
  s = await session(baseSave({ portrait: PIC_A })); w = s.window; tab(w, 'character');
  clickEl(w, q(w, '[data-portrait-remove]'));
  c.ok(P(w).get() === null && $(w, 'characterContent').querySelector('svg') && hidden(w, 'hudPortrait'), 'REMOVE goes back to the drawn face');
  sv = await captureSave(w);
  c.ok(sv.portrait === null, 'and the save no longer carries a picture');
  done(s);

  console.log('E) Death screen');
  s = await session(baseSave({ hp: 1, portrait: PIC_A })); w = s.window;
  w.Math.random = () => 0.01; click(w, 'btnE'); w.Math.random = () => 0.5;
  for (let i = 0; i < 8 && hidden(w, 'deathOverlay'); i++) click(w, 'btnAdvance');
  c.ok(!hidden(w, 'deathOverlay') && !hidden(w, 'dPortrait') && $(w, 'dPortrait').classList.contains('pp-cur'), 'the death screen shows your portrait');
  done(s);
  s = await session(baseSave({ hp: 1 })); w = s.window;
  w.Math.random = () => 0.01; click(w, 'btnE'); w.Math.random = () => 0.5;
  for (let i = 0; i < 8 && hidden(w, 'deathOverlay'); i++) click(w, 'btnAdvance');
  c.ok(!hidden(w, 'deathOverlay') && hidden(w, 'dPortrait'), 'and nothing extra without one');
  done(s);

  console.log('F) Character creation');
  s = H.makeSession(); w = s.window; await sleep(300);
  c.ok(/ADD PORTRAIT/.test($(w, 'btnDraftPortrait').textContent) && hidden(w, 'btnDraftPortraitRemove') && !hidden(w, 'btnReroll'), 'creation screen offers ADD PORTRAIT next to REROLL LOOK');
  const inp = $(w, 'portraitInput');
  Object.defineProperty(inp, 'files', { configurable: true, value: [new w.File(['hello'], 'notes.txt', { type: 'text/plain' })] });
  clickEl(w, $(w, 'btnDraftPortrait'));
  inp.dispatchEvent(new w.Event('change'));
  c.ok(/isn't a PNG, JPEG, WebP or GIF/.test($(w, 'draftPortraitNote').textContent), 'a non-image file is refused with a reason');
  P(w).setDraft(PIC_A);
  const pv = $(w, 'portraitPreview');
  c.ok(pv.querySelector('[data-portrait="draft"].pp-draft') && pv.classList.contains('has-photo') && styleText(w).includes(PIC_A), 'the preview shows the picture');
  c.ok(hidden(w, 'btnReroll') && !hidden(w, 'btnDraftPortraitRemove') && /CHANGE/.test($(w, 'btnDraftPortrait').textContent) && $(w, 'draftPortraitNote').textContent === '', 'REROLL hides, CHANGE/REMOVE show, the old error clears');
  clickEl(w, $(w, 'btnDraftPortraitRemove'));
  c.ok(pv.querySelector('svg') && !hidden(w, 'btnReroll'), 'REMOVE brings back the drawn face and REROLL');
  P(w).setDraft(PIC_B);
  createCharacter(w); await sleep(200);
  c.ok(P(w).get() === PIC_B && !hidden(w, 'hudPortrait'), 'starting the game keeps the chosen portrait');
  click(w, 'btnNewChar'); await sleep(200);
  c.ok($(w, 'portraitPreview').querySelector('svg') && hidden(w, 'btnDraftPortraitRemove'), 'a new character starts without the old portrait');
  done(s);

  c.done(errors);
})();
