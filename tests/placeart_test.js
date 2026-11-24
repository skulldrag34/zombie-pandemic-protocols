// Field-tab location banners and vendor / faction-leader portraits.
// Runs against a copy of the game with stand-in vendor art injected (the real vendor art isn't in yet).
const fs = require('fs'), path = require('path'), os = require('os');
const real = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const fake = { ray: PIX, locker: PIX, authority: PIX, bogus: PIX };
if (!/"vendors":\{[^}]*\}/.test(real)) { console.error('expected a vendors art family in index.html'); process.exit(1); }
const copy = path.join(os.tmpdir(), `zp_placeart_${process.pid}.html`);
// Every sector type now has a banner, so the copy also drops Wasteland's (renamed to a key the game ignores) to test the no-art case.
fs.writeFileSync(copy, real.replace(/"vendors":\{[^}]*\}/, () => '"vendors":' + JSON.stringify(fake)).replace('"wasteland":"data:image', '"bogusland":"data:image'));
process.env.GAME_PATH = copy;
const H = require('./harness.js');
const { $, q, tab, click, loadSave, sleep, settle, baseSave, makeChecker } = H;
async function session(o) { const s = H.makeSession(); loadSave(s.window, o); await sleep(300); return s; }
const P = (w) => w.__zpPlaceArt;

(async () => {
  const c = makeChecker('PLACE ART');
  const errors = []; const done = (s) => { errors.push(...s.errors); s.close(); };
  const realLoc = (real.match(/"locations":\{(.*?)\}/) || [])[1] || '';
  c.ok(['safehouse', 'commercial', 'residential', 'industrial', 'military'].every(k => new RegExp('"' + k + '":"data:image/webp').test(realLoc)), 'the live build embeds the Safehouse, Commercial, Residential, Industrial and Military banners');
  c.ok(/"wasteland":"data:image\/webp/.test(realLoc), 'and Wasteland: every sector type has a banner');
  const realVend = (real.match(/"vendors":\{(.*?)\}/) || [])[1] || '';
  c.ok(['locker', 'ray', 'diane', 'pete', 'route9', 'miller', 'bill', 'authority'].every(k => new RegExp('"' + k + '":"data:image/webp').test(realVend)), 'the live build embeds the locker, all six vendors and President Voss');

  let s = await session(baseSave()); let w = s.window;
  c.ok(['safehouse', 'commercial', 'residential', 'industrial', 'military'].every(k => P(w).locations().includes(k)) && P(w).vendors().sort().join(',') === 'authority,locker,ray', 'only known keys get a style (a bogus key is ignored)');
  const ban = $(w, 'sectorBanner');
  c.ok(!ban.classList.contains('hidden') && ban.getAttribute('data-location-art') === 'safehouse' && /Safehouse Sector/.test(ban.textContent) && /safe/.test(ban.textContent), 'at home the Field tab shows the Safehouse banner with name and status');
  c.ok(ban === $(w, 'tab-field').firstElementChild, 'the banner sits at the top of the Field tab');

  // Landmark without its own art falls back to its type; a type without art hides the banner.
  c.ok(P(w).locKey(1, 0) === 'commercial', 'the Strip Mall (no art yet) falls back to Commercial');
  c.ok(P(w).locKey(0, 1) === 'residential', 'the Suburban Neighborhood (no art yet) falls back to Residential');
  w.Math.random = () => 0.99;
  click(w, 'btnN'); await sleep(50);
  c.ok($(w, 'sectorBanner').getAttribute('data-location-art') === 'residential' && /Suburban Neighborhood/.test($(w, 'sectorBanner').textContent), 'walking north shows the Residential banner under its own name');
  // Wasteland has no art yet: find one and check the banner hides there.
  let waste = null;
  for (let r = 6; r < 40 && !waste; r++) for (let x = -r; x <= r && !waste; x++) { const y = r - Math.abs(x); const sc = w.__zpFactions.sector(x, y); if (sc.type === 'Wasteland' && !sc.faction) waste = { x, y }; }
  c.ok(waste && P(w).locKey(waste.x, waste.y) === null, `with its art removed, Wasteland has no banner (checked at [${waste && waste.x},${waste && waste.y}])`);
  w.__zpFactions.teleport(waste.x, waste.y); await settle(w);
  c.ok($(w, 'sectorBanner').classList.contains('hidden'), 'standing in a sector without art hides the banner');
  w.__zpFactions.teleport(0, 1); await settle(w);
  click(w, 'btnS'); click(w, 'btnE'); await sleep(50);
  c.ok(!$(w, 'sectorBanner').classList.contains('hidden') && $(w, 'sectorBanner').getAttribute('data-location-art') === 'commercial' && /Downtown Strip Mall/.test($(w, 'sectorBanner').textContent), 'and stepping into the Strip Mall shows the Commercial banner with its own name');
  const before = $(w, 'sectorBanner').innerHTML;
  await settle(w);
  c.ok($(w, 'sectorBanner').innerHTML === before, 'the banner is not rebuilt every second');

  // A faction HQ and the lair/Patient Zero fall back to the underlying type when they have no art.
  const auth = w.__zpFactions.all().authority;
  const hqType = w.__zpFactions.sector(auth.x, auth.y).type.toLowerCase();
  c.ok(P(w).locKey(auth.x, auth.y) === (['safehouse', 'commercial', 'residential', 'industrial', 'military'].includes(hqType) ? hqType : null), `an HQ without its own art falls back to its sector type (${hqType})`);

  // Vendor portraits.
  tab(w, 'shop'); await sleep(50);
  done(s);
  s = await session(baseSave()); w = s.window;
  tab(w, 'shop'); await sleep(50);
  c.ok(!!q(w, '#shopContent [data-vendor-art="locker"]') && !q(w, '#shopContent .portrait-frame svg'), 'the Home Supply Locker shows its picture, not a drawn face');
  done(s);

  // Find a Ray's Trading Post and some other named vendor near home for this seed.
  s = await session(baseSave()); w = s.window;
  let ray = null, other = null;
  for (let r = 1; r < 14 && (!ray || !other); r++) for (let x = -r; x <= r; x++) for (const y of [r - Math.abs(x), -(r - Math.abs(x))]) {
    const sc = w.__zpFactions.sector(x, y);
    if (!sc.hasShop || sc.factionHq) continue;
    if (sc.shopName === "Ray's Trading Post" && !ray) ray = { x, y };
    else if (sc.shopName !== "Ray's Trading Post" && !other) other = { x, y, name: sc.shopName };
  }
  c.ok(ray && other, `found Ray's at [${ray && ray.x},${ray && ray.y}] and ${other && other.name}`);
  w.__zpFactions.teleport(ray.x, ray.y); tab(w, 'shop'); await settle(w);
  c.ok(!!q(w, '#shopContent [data-vendor-art="ray"]'), "Ray's Trading Post shows Ray's portrait");
  w.__zpFactions.teleport(other.x, other.y); await settle(w);
  c.ok(!q(w, '#shopContent [data-vendor-art]') && !!q(w, '#shopContent .portrait-frame svg'), 'a vendor without art keeps the drawn face');
  w.__zpFactions.teleport(auth.x, auth.y); await settle(w);
  c.ok(!!q(w, '#shopContent [data-faction-hq="authority"] [data-vendor-art="authority"]'), "the Authority HQ shows President Voss's portrait");
  done(s);

  fs.unlinkSync(copy);
  c.done(errors);
})();
