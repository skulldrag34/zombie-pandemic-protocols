// Real-browser layout checks for popup screens (JSDOM has no layout engine):
//  - a popup taller than the screen starts at its top and scrolls (the old align-items:center
//    clipped the top of the new-character card on phones, hiding its first ~100-200px)
//  - popups that fit are still centred
//  - the title banner paints and nothing scrolls sideways
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
  await b.close();
  c.done(errs);
})();
