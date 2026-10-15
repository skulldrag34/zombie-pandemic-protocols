// Quick wins (Oct 2026): repair XP (roadmap issue #2) and guard XP from Safehouse defense
// events (issue #5, previously verified by code review only). Defense events are forced
// deterministically by pinning Math.random and fast-forwarding past the 90s attack check.
const H = require('./harness.js');
const { $, q, tab, click, loadSave, captureSave, fastForward, settle, sleep, baseSave, makeChecker } = H;

const xpOf = (win) => parseInt($(win, 'xpNum').textContent.split('/')[0].trim(), 10);
const logText = (win) => $(win, 'logFeed').textContent;
const rosterText = (win) => { tab(win, 'character'); return $(win, 'rosterContent').textContent.replace(/\s+/g, ' '); };

async function session(saveObj, aheadMs) {
  const s = H.makeSession();
  if (aheadMs) fastForward(s.window, aheadMs);
  loadSave(s.window, saveObj);
  await sleep(300);
  return s;
}

const guard = (id, name) => ({ id, name, portraitSeed: id, hp: 40, maxHp: 40, mode: 'guard', level: 1, xp: 0, equipment: { weapon: null, armor: null } });

(async () => {
  const c = makeChecker('QUICK WINS');
  const errors = [];
  const done = (s) => { errors.push(...s.errors); s.close(); };

  // ---------- Repair XP ----------
  console.log('A) Repairs grant construction XP like every other build');
  {
    // 50 missing integrity -> 25s repair -> max(5, round(25000/1500)) = 17 XP.
    let s = await session(baseSave({ safehouseIntegrity: 50 }));
    tab(s.window, 'safehouse'); click(s.window, 'btnRepairSafehouse');
    const saved = await captureSave(s.window);
    c.ok(saved.buildQueue && saved.buildQueue.timeMs === 25000, 'repair queue records its duration (25000ms for 50 missing)');
    fastForward(s.window, 30000); await settle(s.window);
    tab(s.window, 'safehouse');
    c.ok($(s.window, 'roomList').innerHTML.includes('STRUCTURAL INTEGRITY: 100%'), 'repair completes');
    c.ok(xpOf(s.window) === 17, `repair grants 17 XP (got ${xpOf(s.window)})`);
    c.ok(/repairs complete\. Integrity restored to 100%\. \+17 XP/.test(logText(s.window)), 'mission log reports the XP');
    done(s);

    // Minimum: 10 missing -> 5s computed, floored to the 10s minimum -> round(10000/1500) = 7 XP.
    s = await session(baseSave({ safehouseIntegrity: 90 }));
    tab(s.window, 'safehouse'); click(s.window, 'btnRepairSafehouse');
    fastForward(s.window, 15000); await settle(s.window);
    c.ok(xpOf(s.window) === 7, `small repair uses the 10s minimum -> 7 XP (got ${xpOf(s.window)})`);
    done(s);

    // Persists across save/load and completes once with the right XP.
    s = await session(saved, 60000); await settle(s.window);
    c.ok(xpOf(s.window) === 17, `a saved in-progress repair completes after load with 17 XP (got ${xpOf(s.window)})`);
    done(s);

    // Legacy repair queue (pre-XP saves have no timeMs): still completes, minimum XP.
    s = await session(baseSave({ safehouseIntegrity: 50, buildQueue: { kind: 'repair', finishAt: Date.now() - 1000 } }));
    await settle(s.window);
    c.ok(xpOf(s.window) === 7, `legacy repair queue without timeMs completes with minimum 7 XP (got ${xpOf(s.window)})`);
    done(s);

    // Hostile timeMs is clamped (max 100 points * 500ms = 50s -> 33 XP).
    s = await session(baseSave({ safehouseIntegrity: 50, buildQueue: { kind: 'repair', finishAt: Date.now() - 1000, timeMs: 1e12 } }));
    await settle(s.window);
    c.ok(xpOf(s.window) === 33, `absurd saved timeMs is clamped to 50s -> 33 XP (got ${xpOf(s.window)})`);
    done(s);
  }

  // ---------- Guard XP from defense events ----------
  // With Math.random pinned at 0.01 on Medium: attack fires, level 2, count 2+1-1 = 2, threat 40.
  console.log('B) Guard XP from auto-resolved Safehouse defense (player away)');
  {
    // Repelled: barricade 5 (40) + one unarmed guard (5) = 45 >= 40. Guard gains level*4 = 8.
    let s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], barricadeLevel: 5, roster: [guard(1, 'Rook')] }));
    s.window.Math.random = () => 0.01;
    fastForward(s.window, 95000); await settle(s.window);
    c.ok(/probed the perimeter while you were out and was repelled/.test(logText(s.window)), 'attack forced and repelled');
    c.ok(/Rook.*\(8\/30 XP\)/.test(rosterText(s.window)), 'repelled attack: each guard gains level x 4 = 8 XP');
    done(s);

    // Overrun: no barricade, two unarmed guards = 10 < 20. Victim (first guard) takes 20, gains level*3 = 6;
    // the other gains level*2 = 4.
    s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], roster: [guard(1, 'Rook'), guard(2, 'Sable')] }));
    s.window.Math.random = () => 0.01;
    fastForward(s.window, 95000); await settle(s.window);
    c.ok(/overran the barricade while you were away/.test(logText(s.window)), 'attack forced and overran the base');
    c.ok(/Rook held the line, took 20 damage/.test(logText(s.window)), 'victim takes the overrun damage (20)');
    const r = rosterText(s.window);
    c.ok(/Rook.*HP 20\/40.*\(6\/30 XP\)/.test(r), 'victim gains level x 3 = 6 XP');
    c.ok(/Sable.*HP 40\/40.*\(4\/30 XP\)/.test(r), 'other guard gains level x 2 = 4 XP');
    done(s);

    // A guard killed in the defense is removed and gains nothing.
    s = await session(baseSave({ x: 0, y: 1, visited: ['0,0', '0,1'], roster: [Object.assign(guard(1, 'Rook'), { hp: 10 }), guard(2, 'Sable')] }));
    s.window.Math.random = () => 0.01;
    fastForward(s.window, 95000); await settle(s.window);
    c.ok(/Rook fell defending the Safehouse/.test(logText(s.window)), 'a guard reduced to 0 HP falls');
    const r2 = rosterText(s.window);
    c.ok(!/Rook/.test(r2) && /Sable.*\(4\/30 XP\)/.test(r2), 'the fallen guard leaves the roster; the survivor still gains 4 XP');
    done(s);
  }

  c.done(errors);
})();
