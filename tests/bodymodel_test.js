// Character model (Phase A): a full-body picture (2:3, 400x600) with the equipment slots around it.
// JSDOM has no canvas: pictures are handed over through the test hook; the real crop/encode runs in
// browser_portrait.js.
const H = require('./harness.js');
const { $, q, tab, clickEl, loadSave, captureSave, sleep, baseSave, makeChecker } = H;
const BODY = 'data:image/webp;base64,UklGRiwCAABXRUJQVlA4WAoAAAAQAAAAjwEAVwIAQUxQSBoAAAABBxARERCQJP3fHxjR/4z//Oc///nPf/5fE1ZQOCDsAQAAkDYAnQEqkAFYAj5tNplJpCMioSAIAIANiWlu4XdhHtwAABPYB77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2Tj+AAD+/8Gb//xC72Q5//WhaD50nCmxhQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const P = (w) => w.__zpPortrait;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const styleText = (w) => { const el = w.document.getElementById('zp-player-portrait'); return el ? el.textContent : ''; };

(async () => {
  const c = makeChecker('CHARACTER MODEL');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('A) No model: slots as before');
  let s = await session(baseSave({ inventory: { 'Pistol': 1, 'Bandana': 1, 'Combat Boots': 1 }, equippedWeapon: 'Pistol', equipment: { head: 'Bandana', torso: null, hands: null, pants: null, feet: 'Combat Boots' } }));
  let w = s.window; tab(w, 'character');
  c.ok(P(w).getBody() === null && $(w, 'characterContent').querySelector('.gear-slot-grid') && !$(w, 'gearDoll'), 'no model: the plain slot list');
  c.ok(/ADD CHARACTER MODEL/.test(q(w, '[data-body-add]').textContent) && !q(w, '[data-body-remove]'), 'ADD CHARACTER MODEL offered, no REMOVE');
  let opened = 0; $(w, 'portraitInput').click = () => { opened++; };
  clickEl(w, q(w, '[data-body-add]'));
  c.ok(opened === 1, 'it opens the image picker');

  console.log('B) With a model: slots around the body');
  c.ok(P(w).setBody(BODY) === true && P(w).getBody() === BODY, 'a processed picture is accepted');
  const doll = $(w, 'gearDoll');
  c.ok(doll && doll.querySelector('[data-body="player"].pp-body') && !$(w, 'characterContent').querySelector('.gear-slot-grid'), 'the body replaces the slot list');
  const slots = [...doll.querySelectorAll('[data-doll-slot]')].map(e => e.getAttribute('data-doll-slot'));
  c.ok(['HEAD', 'TORSO', 'HANDS', 'WEAPON', 'PANTS', 'FEET'].every(x => slots.includes(x)) && slots.length === 6, `six slots around it (${slots.join(', ')})`);
  const slot = (n) => doll.querySelector(`[data-doll-slot="${n}"]`);
  c.ok(/Bandana/.test(slot('HEAD').textContent) && slot('HEAD').querySelector('[data-art="Bandana"]') && slot('HEAD').classList.contains('filled'), 'head slot shows the Bandana with its art');
  c.ok(/Pistol/.test(slot('WEAPON').textContent) && /DMG 30/.test(slot('WEAPON').textContent) && slot('WEAPON').querySelector('[data-art="Pistol"]'), 'weapon slot shows the Pistol, its damage and art');
  c.ok(/empty/.test(slot('TORSO').textContent) && !slot('TORSO').classList.contains('filled'), 'empty slots say empty');
  c.ok(styleText(w).includes(BODY) && !/data:image/.test($(w, 'characterContent').innerHTML), 'picture via the stylesheet, not in the markup');
  c.ok(/CHANGE MODEL/.test(q(w, '[data-body-add]').textContent) && q(w, '[data-body-remove]'), 'buttons become CHANGE MODEL and REMOVE');
  tab(w, 'inventory');
  const uneq = q(w, '[data-equip="Bandana"]');
  clickEl(w, uneq); tab(w, 'character');
  c.ok(uneq && /empty/.test($(w, 'gearDoll').querySelector('[data-doll-slot="HEAD"]').textContent), 'taking the Bandana off (Inventory) empties the head slot');

  console.log('C) Refusals, save and load');
  const bad = [['javascript:alert(1)', 'a script URL'], ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'an SVG'],
    ['data:image/webp;base64,AAA") } body{display:none', 'CSS injection'], ['data:image/webp;base64,' + 'A'.repeat(P(w).bodyMaxChars), 'an oversized picture']];
  for (const [v, l] of bad) c.ok(P(w).setBody(v) === false && P(w).getBody() === BODY, `refused: ${l}`);
  const sv = await captureSave(w);
  c.ok(sv.bodyModel === BODY && sv.portrait === null, 'the model is saved, separately from the portrait');
  done(s);
  s = await session(sv); w = s.window; tab(w, 'character');
  c.ok(P(w).getBody() === BODY && $(w, 'gearDoll'), 'and restored on load');
  clickEl(w, q(w, '[data-body-remove]'));
  c.ok(P(w).getBody() === null && $(w, 'characterContent').querySelector('.gear-slot-grid'), 'REMOVE goes back to the slot list');
  done(s);
  for (const [v, l] of bad) { s = await session(baseSave({ bodyModel: v })); c.ok(P(s.window).getBody() === null && s.errors.length === 0, `a save holding ${l} loads without a model`); done(s); }
  s = await session(baseSave()); c.ok(P(s.window).getBody() === null, 'an old save (no field) loads without a model'); done(s);

  c.done(errors);
})();
