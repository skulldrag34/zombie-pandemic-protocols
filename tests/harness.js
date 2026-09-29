const fs = require('fs');
const { JSDOM } = require('jsdom');

const path = require('path');
const GAME_PATH = [process.env.GAME_PATH,
  path.join(__dirname, 'zombie_pandemic_protocols.html'),
  path.join(__dirname, '..', 'zombie_pandemic_protocols.html'),
  path.join(__dirname, 'index.html'),
  path.join(__dirname, '..', 'index.html')].filter(Boolean).find(p => fs.existsSync(p));
if (!GAME_PATH) throw new Error('Cannot find the game file (index.html or zombie_pandemic_protocols.html). Set GAME_PATH or place it next to / above this folder');
const html = fs.readFileSync(GAME_PATH, 'utf8');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeSession() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/' });
  const { window } = dom;
  const errors = [];
  window.__lastBlob = null;
  window.URL.createObjectURL = (blob) => { window.__lastBlob = blob; return 'blob:mock'; };
  window.URL.revokeObjectURL = () => {};
  window.addEventListener('error', (e) => errors.push(e.error ? e.error.stack : e.message));
  return { window, errors, close: () => window.close() };
}

const $ = (win, id) => win.document.getElementById(id);
const click = (win, id) => { const el = $(win, id); if (!el || el.disabled) return false; el.dispatchEvent(new win.Event('click')); return true; };
const clickEl = (win, el) => { if (!el || el.disabled) return false; el.dispatchEvent(new win.Event('click')); return true; };
const tab = (win, name) => [...win.document.querySelectorAll('.tabbtn')].find(b => b.getAttribute('data-tab') === name).dispatchEvent(new win.Event('click'));
const q = (win, sel) => win.document.querySelector(sel);

function loadSave(win, dataObj) {
  const blob = new win.Blob([JSON.stringify(dataObj)], { type: 'application/json' });
  const file = new win.File([blob], 'save.json', { type: 'application/json' });
  const input = $(win, 'creationLoadInput');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change'));
}

// Clicks the real SAVE GAME button and returns the parsed JSON it would have downloaded.
async function captureSave(win) {
  win.__lastBlob = null;
  click(win, 'btnSave');
  if (!win.__lastBlob) throw new Error('Save button did not produce a blob');
  const text = await new Promise((res, rej) => {
    const r = new win.FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(win.__lastBlob);
  });
  return JSON.parse(text);
}

// Shifts the game's clock forward. The game only notices on its next 1s render tick,
// so callers must follow this with `await settle(win)`.
function fastForward(win, ms) {
  const realNow = win.Date.now();
  win.Date.now = () => realNow + ms;
}
const settle = (win) => sleep(1250);

function createCharacter(win) {
  for (let i = 0; i < 5; i++) {
    const b = q(win, '[data-dplus="str"]');
    if (b && !b.disabled) b.dispatchEvent(new win.Event('click'));
  }
  click(win, 'btnStart');
}

function baseSave(overrides) {
  return Object.assign({
    version: 6, name: 'Tester', portraitSeed: 1, seed: 42, locationTheme: null,
    settings: { severity: 'Medium', infection: 'Normal', armedPct: 'Medium' },
    attributes: { str: 1, agi: 1, end: 1, per: 1, lck: 1 }, unspentPoints: 0,
    hp: 100, baseMaxHp: 100, stamina: 20, maxStaminaBase: 20,
    xp: 0, level: 1, xpToNext: 100000, cash: 1000, totalCashEarned: 0,
    x: 0, y: 0,
    inventory: { 'Baseball Bat': 1, 'Scrap Metal': 500, 'Cloth Strips': 20 }, equippedWeapon: 'Baseball Bat',
    equipment: { head: null, torso: null, hands: null, pants: null, feet: null },
    builtRooms: [], visited: ['0,0'], collectedCaches: [], barricadeLevel: 0,
    kills: 0, turns: 15, deathCount: 0,
    roster: [], companionEverRecruited: false,
    fleeSuccesses: 0, hasCrit: false, hadCloseCallWin: false,
    questStage: 'none', patientZeroCoords: null, achievements: [], craftedRecipes: [],
    claimedBlocks: {}, lastClaimTick: Date.now(),
    fitnessLevel: 0, marksmanshipLevel: 0,
    postCapXp: 0, battleHardenedEverReached: false,
    vendorQuests: {}, vendorRep: {}, totalVendorQuestsCompleted: 0,
    autoHealCompanions: true, lastCompanionHealTick: Date.now(),
    safehouseIntegrity: 100, lastSafehouseRepairTick: Date.now(),
    alpha: null
  }, overrides || {});
}

// Minimal assertion helper that collects failures and exits non-zero at the end.
function makeChecker(label) {
  let failures = 0, passes = 0;
  return {
    ok(cond, msg) {
      if (cond) { passes++; console.log('  PASS:', msg); }
      else { failures++; console.error('  FAIL:', msg); }
    },
    done(errors) {
      if (errors && errors.length) { failures++; console.error('  FAIL: runtime errors:\n' + errors.join('\n')); }
      console.log(`${label}: ${passes} passed, ${failures} failed`);
      process.exit(failures ? 1 : 0);
    }
  };
}

module.exports = { GAME_PATH, makeSession, $, click, clickEl, tab, q, loadSave, captureSave, fastForward, settle, sleep, createCharacter, baseSave, makeChecker };
