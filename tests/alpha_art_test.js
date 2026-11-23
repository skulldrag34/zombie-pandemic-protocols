// Alpha portraits: 12 titles, shown on emergence, on the Safehouse Alpha card, and in the face-off
// when an Alpha pack attacks. Keyed by the title (last word of the Alpha's name).
const H = require('./harness.js');
const { $, q, tab, loadSave, sleep, settle, fastForward, baseSave, makeChecker } = H;
const BLOCK = { '1,0': { postedCompanionId: null } };
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const hidden = (w, id) => $(w, id).classList.contains('hidden');

(async () => {
  const c = makeChecker('ALPHA ART');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  let s = await session(baseSave()); let w = s.window;
  const arts = w.ZP_ART.alphas || {};
  const titles = ['warden', 'shepherd', 'marshal', 'deacon', 'foreman', 'choirmaster', 'quartermaster', 'surveyor', 'ferryman', 'matron', 'bishop', 'herald'];
  c.ok(titles.every(t => arts[t]) && Object.keys(arts).length === 12, 'all 12 Alpha titles have a portrait');
  c.ok((w.document.getElementById('zp-alpha-art').textContent.match(/\.aa-[a-z]+\{/g) || []).length === 12, 'one CSS class per portrait');
  done(s);

  console.log('A) Emergence');
  s = H.makeSession(); w = s.window;
  loadSave(w, baseSave({ claimedBlocks: BLOCK })); await settle(w);
  const ap = $(w, 'alphaPortrait');
  const title = $(w, 'alphaName').textContent.trim().split(/\s+/).pop().toLowerCase();
  c.ok(!hidden(w, 'alphaOverlay') && !ap.classList.contains('hidden') && ap.classList.contains('aa-' + title), `the emergence screen shows the new Alpha's portrait (${title})`);
  done(s);

  console.log('B) Safehouse Alpha card');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: { name: 'The Pale Ferryman', quietMs: 0 } })); w = s.window;
  tab(w, 'safehouse');
  const thumb = q(w, '#roomList [data-alpha-art="ferryman"]');
  c.ok(thumb && thumb.classList.contains('aa-ferryman') && /ALPHA ACTIVE: The Pale Ferryman/.test(thumb.closest('.quest-card').textContent), 'the Alpha card shows the Ferryman portrait beside its details');
  c.ok(!/data:image/.test($(w, 'roomList').innerHTML), 'markup carries a class, not image data');
  done(s);

  console.log('C) Alpha pack attack face-off');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: { name: 'The Hollow Bishop', quietMs: 0 } })); w = s.window;
  w.Math.random = () => 0.01; fastForward(w, 95000); await settle(w);
  const fo = $(w, 'faceoff');
  c.ok(!hidden(w, 'combatOverlay') && /Bishop/.test($(w, 'combatLog').textContent), 'test setup: the Alpha pack attacks the Safehouse');
  c.ok(!hidden(w, 'faceoff') && fo.querySelector('[data-alpha-art="bishop"]') && /The Hollow Bishop/.test(fo.textContent), 'the face-off shows the Alpha, not a zombie type');
  done(s);
  s = await session(baseSave()); w = s.window;
  w.Math.random = () => 0.01; fastForward(w, 95000); await settle(w);
  c.ok(!hidden(w, 'combatOverlay') && !$(w, 'faceoff').querySelector('[data-alpha-art]'), 'an ordinary Safehouse attack still shows zombie art');
  done(s);

  console.log('D) Unknown title falls back');
  s = await session(baseSave({ claimedBlocks: BLOCK, alpha: { name: 'Something Else', quietMs: 0 } })); w = s.window;
  tab(w, 'safehouse');
  c.ok(!q(w, '#roomList [data-alpha-art]') && /ALPHA ACTIVE: Something Else/.test($(w, 'roomList').textContent) && s.errors.length === 0, 'a name with no matching portrait shows the card without art');
  done(s);

  c.done(errors);
})();
