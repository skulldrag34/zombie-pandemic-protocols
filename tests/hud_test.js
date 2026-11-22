// Status header: face, name, title, cash/scrap, bars, attributes and a compact gear line, on every tab.
const H = require('./harness.js');
const { $, q, tab, clickEl, loadSave, sleep, baseSave, makeChecker } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const attrVal = (w, k) => Number(q(w, `[data-hud-attr="${k}"] b`).textContent);

(async () => {
  const c = makeChecker('STATUS HEADER');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };

  console.log('A) Record in the header');
  let s = await session(baseSave({ name: 'Sk<i>ll', attributes: { str: 3, agi: 2, end: 4, per: 6, lck: 7 }, kills: 12, turns: 40,
    inventory: { 'Bandana': 1, 'Baseball Bat': 1 }, equipment: { head: 'Bandana', torso: null, hands: null, pants: null, feet: null } }));
  let w = s.window;
  c.ok($(w, 'hudName').textContent === 'Sk<i>ll' && !$(w, 'hudName').querySelector('i'), 'name shown as text (not HTML)');
  c.ok($(w, 'hudFaceDrawn').querySelector('svg') && $(w, 'hudPortrait').classList.contains('hidden'), 'no portrait: the drawn face is in the header');
  c.ok(['str', 'agi', 'end', 'per', 'lck'].every(k => q(w, `[data-hud-attr="${k}"]`)) && /Base 3\b/.test(q(w, '[data-hud-attr="str"]').title) && /Base 7\b/.test(q(w, '[data-hud-attr="lck"]').title) && attrVal(w, 'str') >= 3, 'all five attributes with their values (base in the tooltip; achievements can add more)');
  c.ok(attrVal(w, 'per') === 7 && q(w, '[data-hud-attr="per"] b').classList.contains('boosted') && /Base 6 \+ 1/.test(q(w, '[data-hud-attr="per"]').title), 'gear-boosted PER shows 7, highlighted, tooltip explains base 6 + 1');
  c.ok(/melee damage/.test(q(w, '[data-hud-attr="str"]').title), 'each attribute has its description as a tooltip');
  c.ok(!w.document.querySelector('#hudAttrs [data-spend]') && !/to spend/.test($(w, 'hudAttrs').textContent), 'no + buttons with no points to spend');
  c.ok(/12 kills/.test($(w, 'lvlChip').title) && /40 turns/.test($(w, 'lvlChip').title), 'kills and turns in the level tooltip');
  const g = $(w, 'gearLine').innerHTML;
  c.ok(/Baseball Bat/.test(g) && /DMG \d+/.test(g) && /DEF \d+/.test(g) && /GEAR 1\/5/.test(g) && !/<br>/.test(g), `gear line is one compact line (${$(w, 'gearLine').textContent})`);
  const first = $(w, 'hudAttrs').firstChild; await sleep(1250);
  c.ok($(w, 'hudAttrs').firstChild === first, 'the header record is not rebuilt every second');
  c.ok(!$(w, 'characterContent').querySelector('[data-spend], .attr-row') && /Level 1/.test($(w, 'characterContent').textContent) && /12 kills/.test($(w, 'characterContent').textContent), 'Survivor tab no longer repeats the attributes; its record line keeps level, kills, turns');
  done(s);

  console.log('B) Spend points from any tab');
  s = await session(baseSave({ unspentPoints: 2, attributes: { str: 3, agi: 10, end: 1, per: 1, lck: 1 } })); w = s.window;
  tab(w, 'shop');
  c.ok(/2 points to spend/.test($(w, 'hudAttrs').textContent) && w.document.querySelectorAll('#hudAttrs [data-spend]').length === 5, 'with points: "+2 points to spend" and a + on each attribute');
  c.ok(q(w, '#hudAttrs [data-spend="agi"]').disabled && !q(w, '#hudAttrs [data-spend="str"]').disabled, 'an attribute at the cap (10) has its + disabled');
  clickEl(w, q(w, '#hudAttrs [data-spend="str"]'));
  c.ok(attrVal(w, 'str') === 4 && /1 point to spend/.test($(w, 'hudAttrs').textContent), 'spending from the Shop tab raises STR to 4, one point left');
  clickEl(w, q(w, '#hudAttrs [data-spend="end"]'));
  c.ok(attrVal(w, 'end') === 2 && !w.document.querySelector('#hudAttrs [data-spend]'), 'last point spent: the + buttons go away');
  done(s);

  console.log('C) Title at the cap, companions');
  s = await session(baseSave({ level: 25, xpToNext: 400, postCapXp: 0,
    roster: [{ id: 1, name: 'Rook', portraitSeed: 1, hp: 30, maxHp: 40, mode: 'travel', level: 1, xp: 0, equipment: { weapon: null, armor: null } },
             { id: 2, name: 'Sable', portraitSeed: 2, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null } }] })); w = s.window;
  c.ok(/^".+"$/.test($(w, 'hudTitle').textContent) && /max/.test($(w, 'lvlChip').title), `at level 25 the title shows by the level (${$(w, 'hudTitle').textContent})`);
  c.ok(/WITH: <span>Rook/.test($(w, 'gearLine').innerHTML) && /GUARDS: <span>Sable/.test($(w, 'gearLine').innerHTML), 'traveling companion and guards on short lines');
  done(s);

  c.done(errors);
})();
