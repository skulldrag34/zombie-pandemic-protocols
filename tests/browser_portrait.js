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

  await page.click('[data-tab="character"]'); await page.waitForTimeout(300);
  c.ok(await page.$('#characterContent [data-portrait="player"]') !== null, 'Character tab shows the picture');
  if (shots) await page.screenshot({ path: path.join(shots, 'portrait_desktop.png') });

  // Change it with a tall JPEG from the Character tab.
  await choose(page, '[data-portrait-add]', { name: 'tall.jpg', mimeType: 'image/jpeg', buffer: await makePicture(page, 600, 1400, 'image/jpeg') });
  info = await picInfo(page);
  c.ok(info && info.w === 300 && info.h === 400, 'CHANGE from the Character tab: a tall JPEG is also cropped to 300x400');

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

  await page.click('[data-portrait-remove]'); await page.waitForTimeout(300);
  c.ok(await page.evaluate(() => window.__zpPortrait.get()) === null && await page.$('#characterContent svg') !== null, 'REMOVE returns to the drawn face');

  await b.close();
  c.done(errs);
})();
