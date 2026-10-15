// Real-browser smoke test: runs the engine against Chromium's actual Web Audio implementation.
// Usage: node browser_smoke_audio.js  (needs playwright + a chromium build)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const H = require('./harness.js');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(H.GAME_PATH));
  const save = H.baseSave();
  await page.setInputFiles('#creationLoadInput', { name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await page.waitForSelector('#app:not(.hidden)');
  const pre = await page.evaluate(() => { window.__zpAudio.clearLog(); window.__zpAudio.play('coin'); return window.__zpAudio.log()[0]; });
  await page.mouse.click(5, 5); // real user activation
  await page.waitForTimeout(300);
  const result = await page.evaluate(async () => {
    const ids = window.__zpAudio.ids();
    window.__zpAudio.clearLog();
    for (const id of ids) { window.__zpAudio.play(id); await new Promise(r => setTimeout(r, 50)); }
    return { ids: ids.length, log: window.__zpAudio.log(), voices: window.__zpAudio.voiceCount() };
  });
  // Music: a fight switches to the dense combat theme, which must keep scheduling notes.
  await page.evaluate(() => { Math.random = () => 0.01; });
  await page.click('#btnE');
  await page.waitForTimeout(400);
  const m0 = await page.evaluate(() => window.__zpAudio.music());
  await page.waitForTimeout(2000);
  const m1 = await page.evaluate(() => window.__zpAudio.music());
  const musicOk = m1.mood === 'combat' && m1.notes > m0.notes;
  await page.keyboard.press('m');
  const muted = await page.evaluate(() => window.__zpAudio.prefs().muted);
  await page.waitForTimeout(2500); // let scheduled sounds finish; surfaces any late audio errors
  const ok = pre.reason === 'locked'
    && result.log.length === result.ids && result.log.every(e => e.played)
    && result.voices <= 12 && muted === true && musicOk && errors.length === 0;
  console.log('pre-gesture:', pre.reason);
  console.log(`played ${result.log.filter(e => e.played).length}/${result.ids}; live voices ${result.voices}; muted via M: ${muted}`);
  console.log(`music: ${m1.mood}, +${m1.notes - m0.notes} notes in 2s`);
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  console.log(`BROWSER AUDIO SMOKE: ${ok ? 'PASS' : 'FAIL'}`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
