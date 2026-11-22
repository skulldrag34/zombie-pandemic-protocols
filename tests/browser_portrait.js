// Real-browser check of the portrait pipeline (decode -> centre-crop 3:4 -> 300x400 WebP) that JSDOM
// cannot run. Uses the Chromium + Playwright preinstalled in the dev container:
//   node tests/browser_portrait.js [shotsDir]
const path = require('path');
const { chromium } = require('playwright');
const H = require('./harness.js');
const c = H.makeChecker('BROWSER PORTRAIT');
const shots = process.argv[2] || null;

// Draw a test picture in the page: wide (not 3:4), with a bright marker in the centre column.
async function makePicture(page, w, h, type) {
  const url = await page.evaluate(([w, h, type]) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d'); x.fillStyle = '#203040'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff0000'; x.fillRect(w / 2 - 20, h / 2 - 20, 40, 40);
    return cv.toDataURL(type);
  }, [w, h, type]);
  return Buffer.from(url.split(',')[1], 'base64');
}
async function choose(page, trigger, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(trigger)]);
  await fc.setFiles(file);
  await page.waitForTimeout(600);
}
const picInfo = (page) => page.evaluate(() => new Promise((res) => {
  const u = window.__zpPortrait.get();
  if (!u) return res(null);
  const im = new Image();
  im.onload = () => {
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
    const mid = x.getImageData(150, 200, 1, 1).data, corner = x.getImageData(5, 5, 1, 1).data;
    res({ w: im.width, h: im.height, type: u.slice(5, u.indexOf(';')), len: u.length, max: window.__zpPortrait.maxChars, mid: [...mid], corner: [...corner] });
  };
  im.src = u;
}));

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(H.GAME_PATH));
  await page.waitForTimeout(400);

  // Creation screen: a wide 1600x900 PNG.
  await choose(page, '#btnDraftPortrait', { name: 'wide.png', mimeType: 'image/png', buffer: await makePicture(page, 1600, 900, 'image/png') });
  c.ok(await page.$('#portraitPreview [data-portrait="draft"]') !== null, 'creation: the chosen picture shows in the preview');
  c.ok(await page.$eval('#portraitPreview .player-portrait', (e) => getComputedStyle(e).backgroundImage.startsWith('url("data:image/')), 'creation: the preview is actually painted');
  for (let i = 0; i < 5; i++) await page.click('[data-dplus="str"]').catch(() => {});
  await page.click('#btnStart');
  await page.waitForTimeout(500);
  let info = await picInfo(page);
  c.ok(info && info.w === 300 && info.h === 400, `stored picture is 300x400 (${info && info.w}x${info && info.h})`);
  c.ok(info && (info.type === 'image/webp' || info.type === 'image/jpeg') && info.len < info.max, `stored as ${info && info.type}, ${info && Math.round(info.len / 1024)} KB of text (cap ${Math.round(info.max / 1024)} KB)`);
  c.ok(info && info.mid[0] > 200 && info.mid[1] < 60 && info.corner[0] < 80, 'cropped from the centre (red marker in the middle, dark corner)');
  c.ok(await page.$eval('#hudPortrait', (e) => !e.classList.contains('hidden') && getComputedStyle(e).backgroundImage.startsWith('url("data:image/')), 'stats panel thumbnail is painted');

  await page.click('[data-tab="survivor"]'); await page.waitForTimeout(300);
  c.ok(await page.$eval('#hudFaceDrawn', (e) => e.classList.contains('hidden')) && await page.$('#characterContent [data-portrait-remove]') !== null, 'header shows the picture (drawn face hidden); Survivor tab offers REMOVE');
  if (shots) await page.screenshot({ path: path.join(shots, 'portrait_desktop.png') });

  // Change it with a tall JPEG from the Character tab.
  await choose(page, '[data-portrait-add]', { name: 'tall.jpg', mimeType: 'image/jpeg', buffer: await makePicture(page, 600, 1400, 'image/jpeg') });
  info = await picInfo(page);
  c.ok(info && info.w === 300 && info.h === 400, 'CHANGE from the Survivor tab: a tall JPEG is also cropped to 300x400');

  // Refusals keep the current picture.
  const cur = await page.evaluate(() => window.__zpPortrait.get());
  await choose(page, '[data-portrait-add]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  c.ok(await page.evaluate(() => window.__zpPortrait.get()) === cur && /isn't a PNG/.test(await page.textContent('#playerPortraitNote')), 'a text file is refused with a reason; picture kept');
  await choose(page, '[data-portrait-add]', { name: 'tiny.png', mimeType: 'image/png', buffer: await makePicture(page, 40, 40, 'image/png') });
  c.ok(await page.evaluate(() => window.__zpPortrait.get()) === cur && /too small/.test(await page.textContent('#playerPortraitNote')), 'a 40x40 image is refused as too small');
  await choose(page, '[data-portrait-add]', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  c.ok(await page.evaluate(() => window.__zpPortrait.get()) === cur && /Couldn't open/.test(await page.textContent('#playerPortraitNote')), 'a corrupt image is refused');

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(1200);
  c.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'phone width: no sideways scroll on the Character tab');
  if (shots) await page.screenshot({ path: path.join(shots, 'portrait_phone.png'), fullPage: false });

  // Character model: a transparent 900x1000 PNG (not 2:3) with an opaque marker in the middle.
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(1200);
  const bodyPng = Buffer.from((await page.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 900; cv.height = 1000;
    const x = cv.getContext('2d'); x.fillStyle = '#00ff00'; x.fillRect(400, 450, 100, 100); return cv.toDataURL('image/png'); })).split(',')[1], 'base64');
  await choose(page, '[data-body-add]', { name: 'body.png', mimeType: 'image/png', buffer: bodyPng });
  const bi = await page.evaluate(() => new Promise((res) => { const u = window.__zpPortrait.getBody(); if (!u) return res(null);
    const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
      res({ w: im.width, h: im.height, type: u.slice(5, u.indexOf(';')), kb: Math.round(u.length / 1024), corner: [...x.getImageData(5, 5, 1, 1).data], mid: [...x.getImageData(200, 300, 1, 1).data] }); }; im.src = u; }));
  c.ok(bi && bi.w === 400 && bi.h === 600 && bi.type === 'image/webp', `character model stored as 400x600 WebP (${bi && bi.w}x${bi && bi.h} ${bi && bi.type}, ${bi && bi.kb} KB)`);
  c.ok(bi && bi.corner[3] === 0 && bi.mid[1] > 200 && bi.mid[3] === 255, 'transparency kept (clear corner), picture centred (marker in the middle)');
  // A tall, narrow full-body picture keeps its head and feet (fitted whole, not cropped).
  const tall = Buffer.from((await page.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 1200;
    const x = cv.getContext('2d'); x.fillStyle = '#334'; x.fillRect(0, 0, 300, 1200); x.fillStyle = '#f00'; x.fillRect(100, 0, 100, 40); x.fillStyle = '#00f'; x.fillRect(100, 1160, 100, 40); return cv.toDataURL('image/png'); })).split(',')[1], 'base64');
  await choose(page, '[data-body-add]', { name: 'tall.png', mimeType: 'image/png', buffer: tall });
  const tb = await page.evaluate(() => new Promise((res) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = 400; cv.height = 600; const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
    res({ top: [...x.getImageData(200, 5, 1, 1).data], bottom: [...x.getImageData(200, 595, 1, 1).data], side: [...x.getImageData(20, 300, 1, 1).data] }); }; im.src = window.__zpPortrait.getBody(); }));
  c.ok(tb.top[0] > 200 && tb.top[2] < 60 && tb.bottom[2] > 200 && tb.side[3] === 0, 'a tall narrow figure is fitted whole: head (red) and feet (blue) kept, see-through sides');
  const lay = async () => page.evaluate(() => { const d = document.getElementById('gearDoll'); if (!d) return null; const r = d.getBoundingClientRect(), b = d.querySelector('.doll-body').getBoundingClientRect();
    return { bw: b.width, ratio: b.height / b.width, inside: [...d.querySelectorAll('.doll-slot')].every(e => { const q = e.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; }),
      painted: getComputedStyle(d.querySelector('.doll-body')).backgroundImage.startsWith('url("data:image/'), ow: document.documentElement.scrollWidth > innerWidth }; });
  let L = await lay();
  c.ok(L && L.painted && Math.abs(L.ratio - 1.5) < 0.03 && L.inside && !L.ow, `desktop: body painted at 2:3 (${L && Math.round(L.bw)}px wide), slots inside, no sideways scroll`);
  if (shots) await page.screenshot({ path: path.join(shots, 'bodymodel_desktop.png') });
  await page.setViewportSize({ width: 360, height: 740 }); await page.waitForTimeout(1200);
  L = await lay();
  c.ok(L && L.painted && L.bw >= 100 && L.inside && !L.ow, `phone 360px: body ${L && Math.round(L.bw)}px wide, slots inside, no sideways scroll`);
  if (shots) await page.screenshot({ path: path.join(shots, 'bodymodel_phone.png'), fullPage: true });
  await page.click('[data-body-remove]'); await page.waitForTimeout(300);
  c.ok(await page.evaluate(() => window.__zpPortrait.getBody()) === null && await page.$('#gearDoll') === null, 'REMOVE model returns to the slot list');

  await page.click('[data-portrait-remove]'); await page.waitForTimeout(300);
  c.ok(await page.evaluate(() => window.__zpPortrait.get()) === null && await page.$('#hudFaceDrawn svg') !== null, 'REMOVE returns to the drawn face');

  await b.close();
  c.done(errs);
})();
