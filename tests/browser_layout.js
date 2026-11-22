// Real-browser layout checks for popup screens (JSDOM has no layout engine):
//  - a popup taller than the screen starts at its top and scrolls (the old align-items:center
//    clipped the top of the new-character card on phones, hiding its first ~100-200px)
//  - popups that fit are still centred
//  - the title banner paints and nothing scrolls sideways
//  - the combat face-off fits phone and desktop (with placeholder enemy art)
//   node tests/browser_layout.js [shotsDir]
const path = require('path');
const { chromium } = require('playwright');
const H = require('./harness.js');
const c = H.makeChecker('BROWSER LAYOUT');
const shots = process.argv[2] || null;

(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[390, 640], [390, 844], [1280, 900], [1920, 1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + path.resolve(H.GAME_PATH)); await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const o = document.getElementById('creationOverlay'); o.scrollTop = 0;
      const card = document.querySelector('.creation-card').getBoundingClientRect();
      const t = document.getElementById('titleArt');
      return { top: card.top, tall: card.height > innerHeight, painted: getComputedStyle(t).backgroundImage.startsWith('url("data:image/'), ow: document.documentElement.scrollWidth > innerWidth };
    });
    c.ok(r.top >= 0, `${w}x${h}: new-character card top is on screen at scroll 0 (top ${Math.round(r.top)}px${r.tall ? ', card taller than screen' : ''})`);
    c.ok(r.painted && !r.ow, `${w}x${h}: title banner painted, no sideways scroll`);
    if (shots) await p.screenshot({ path: path.join(shots, `layout_${w}x${h}.png`) });
    // A popup that fits stays centred: the death screen.
    // (layout only, so the screen is opened directly rather than by dying)
    const d = await p.evaluate(() => { document.getElementById('creationOverlay').classList.add('hidden'); const o = document.getElementById('deathOverlay'); o.classList.remove('hidden'); const r = document.querySelector('.death-card').getBoundingClientRect(); return { above: r.top, below: innerHeight - r.bottom }; });
    c.ok(d && Math.abs(d.above - d.below) <= 2, `${w}x${h}: death screen is still centred (${d ? Math.round(d.above) + ' above / ' + Math.round(d.below) + ' below' : 'not shown'})`);
    await p.close();
  }
  // Combat face-off with placeholder enemy art (the live file has none yet).
  const os = require('os'), fs = require('fs');
  const PIC = 'data:image/webp;base64,UklGRiABAABXRUJQVlA4IBQBAACwHACdASosAZABPp1OpE4lpCOiICgAsBOJaW7hd2EbQAnsA99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D1gAP7/uYQ/0Hxcv/9St+uiqZO+Rgowj8gQAAAAAAAAAAAAAAAAAAA=';
  const variant = path.join(os.tmpdir(), 'zp_faceoff_layout.html');
  fs.writeFileSync(variant, fs.readFileSync(path.resolve(H.GAME_PATH), 'utf8').replace(/(<script id="zp-art">[\s\S]*?<\/script>)/,
    `$1\n<script>window.ZP_ART.enemies = { office: "${PIC}", courier: "${PIC}", horde: "${PIC}" };</script>`));
  for (const [w, h] of [[360, 640], [390, 844], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + variant); await p.waitForTimeout(300);
    await p.setInputFiles('#creationLoadInput', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(H.baseSave({ hp: 5000, baseMaxHp: 5000 }))) });
    await p.waitForTimeout(500);
    await p.evaluate(() => { const r = Math.random; Math.random = () => 0.01; document.getElementById('btnE').click(); Math.random = r; });
    await p.waitForTimeout(400);
    const f = await p.evaluate(() => {
      const o = document.getElementById('combatOverlay'); o.scrollTop = 0;
      const fo = document.getElementById('faceoff'), frames = [...fo.querySelectorAll('.fo-frame')].map(e => e.getBoundingClientRect());
      const card = document.getElementById('combatCard').getBoundingClientRect();
      return { shown: !fo.classList.contains('hidden'), n: frames.length, minW: Math.min(...frames.map(r => r.width)), ratio: frames[1] ? frames[1].height / frames[1].width : 0,
        inside: frames.every(r => r.left >= card.left && r.right <= card.right), top: card.top, ow: document.documentElement.scrollWidth > innerWidth,
        painted: frames[1] ? getComputedStyle(fo.querySelectorAll('.fo-frame')[1]).backgroundImage.startsWith('url("data:image/') : false,
        leaks: [...document.querySelectorAll('.hidden')].filter(e => e.offsetParent !== null).map(e => e.id || e.className) };
    });
    c.ok(f.shown && f.n === 2 && f.painted, `${w}x${h}: combat face-off shows both portraits, enemy painted`);
    c.ok(f.minW >= 100 && Math.abs(f.ratio - 4 / 3) < 0.05 && f.inside && !f.ow && f.top >= 0, `${w}x${h}: frames ${Math.round(f.minW)}px wide at 3:4, inside the card, card top on screen, no sideways scroll`);
    c.ok(f.leaks.length === 0, `${w}x${h}: nothing marked hidden is visible in combat (e.g. the ALLY bar with no companion)${f.leaks.length ? ' - leaks: ' + f.leaks.join(', ') : ''}`);
    if (shots) await p.screenshot({ path: path.join(shots, `faceoff_${w}x${h}.png`) });
    await p.close();
  }

  // Survivor tab (record + gear + inventory) on a phone and a desktop.
  for (const [w, h] of [[360, 740], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + path.resolve(H.GAME_PATH)); await p.waitForTimeout(300);
    await p.setInputFiles('#creationLoadInput', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(H.baseSave({
      inventory: { 'Bandana': 1, 'Motorcycle Helmet': 1, 'Pistol': 1, 'Baseball Bat': 1, 'Bandage': 3 }, equipment: { head: 'Bandana', torso: null, hands: null, pants: null, feet: null } }))) });
    await p.waitForTimeout(500); await p.click('[data-tab="survivor"]'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ ow: document.documentElement.scrollWidth > innerWidth,
      leaks: [...document.querySelectorAll('#tab-survivor .hidden')].filter(e => e.offsetParent !== null).map(e => e.id || e.className),
      order: ['characterContent', 'invGrid', 'audioPanel'].map(id => document.getElementById(id).getBoundingClientRect().top) }));
    c.ok(!r.ow && r.leaks.length === 0 && r.order[0] < r.order[1] && r.order[1] < r.order[2], `${w}x${h}: Survivor tab: record, then inventory, then audio; no sideways scroll; nothing hidden leaks`);
    await p.click('[data-slot-pick="head"] .slotname');
    await p.waitForTimeout(700);
    await p.waitForTimeout(800);   // smooth scroll
    const f = await p.evaluate(() => { const r = document.getElementById('invGrid').getBoundingClientRect(); return { n: document.querySelectorAll('#invGrid .inv-card').length, top: r.top, bottom: r.bottom, vh: innerHeight }; });
    c.ok(f.n === 2 && f.top >= 0 && f.bottom <= f.vh, `${w}x${h}: tapping HEAD filters to 2 items and the filtered list is on screen (${Math.round(f.top)}-${Math.round(f.bottom)}px of ${f.vh})`);
    if (shots) await p.screenshot({ path: path.join(shots, `survivor_${w}x${h}.png`) });
    await p.close();
  }

  // Status header: compact on phone and desktop, no sideways scroll, nothing hidden leaks.
  for (const [w, h, max] of [[360, 740, 200], [390, 844, 200], [1280, 900, 135]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + path.resolve(H.GAME_PATH)); await p.waitForTimeout(300);
    await p.setInputFiles('#creationLoadInput', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(H.baseSave({ name: 'Skulldrag', unspentPoints: 1,
      inventory: { 'Pistol': 1, 'Ammo': 20 }, equippedWeapon: 'Pistol', roster: [{ id: 1, name: 'Rook', portraitSeed: 1, hp: 30, maxHp: 40, mode: 'travel', level: 1, xp: 0, equipment: { weapon: null, armor: null } }] }))) });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => { const hud = document.querySelector('.hud-panel'); const hr = hud.getBoundingClientRect();
      return { h: hr.height, ow: document.documentElement.scrollWidth > innerWidth, inside: [...hud.querySelectorAll('.hud-attr, .chip, .bar-track')].filter(e => e.offsetParent !== null).every(e => { const q = e.getBoundingClientRect(); return q.right <= hr.right + 1 && q.left >= hr.left - 1; }),
        leaks: [...hud.querySelectorAll('.hidden')].filter(e => e.offsetParent !== null).map(e => e.id || e.className) }; });
    c.ok(r.h <= max && !r.ow && r.inside && r.leaks.length === 0, `${w}x${h}: status header ${Math.round(r.h)}px tall (limit ${max}), everything inside it, no sideways scroll${r.leaks.length ? ' leaks: ' + r.leaks.join(',') : ''}`);
    if (shots) await p.screenshot({ path: path.join(shots, `header_${w}x${h}.png`) });
    await p.close();
  }

  await b.close();
  c.done(errs);
})();
