# Tests

Headless JSDOM tests for `zombie_pandemic_protocols.html`.

## Setup
Place this `tests/` folder next to (or one level below) the game file (`index.html` or `zombie_pandemic_protocols.html`), or set `GAME_PATH`.

    cd tests
    npm install
    npm test            # runs all suites

Run one suite: `node regression_core.js` or `node persistence_test.js`.
Test another build: `GAME_PATH=/path/to/older_build.html node regression_core.js`

## Files
- `harness.js` — shared helpers: `makeSession`, `loadSave` (via the creation-screen file input), `captureSave` (clicks the real Save button), `fastForward` + `settle` (clock spoof + wait for the 1s render tick), `createCharacter`, `baseSave` (a complete current-schema save), `makeChecker`.
- `regression_core.js` — 31 checks: 250-action playthrough, save round-trip, integrity, roster rules, healing, level cap, training, compound claims, vendor pricing/quests, boss stats, dropdown fix, source invariants.
- `offline_credit_test.js` — 15 checks: stamina/Garden/outpost credit amounts, the 8-hour cap, max-stamina clamp, online-only systems stay online-only, legacy and clock-skewed saves.
- `alpha_test.js` — 24 checks: emergence on first claim (and retroactively), seeded names, save round-trip, quiet period counts play time only, escalation levels (+1/+1/+2, no size bump), x1.25 attack chance, x1.5 salvage, interactive defense text, Safehouse card.
- `autosave_test.js` — 13 checks: localStorage autosave on tab hide/close and every 15s, none from the title screen, Continue restores state, corrupt/blocked storage is harmless, manual save/load unaffected.
- `layout_test.js` — 6 checks: phone layout hooks and CSS (map -> actions -> log order, 190px map, 48px tap targets), empty quest chip hidden, desktop layout unchanged.
- `persistence_test.js` — 26 checks: craft/build/repair queues survive save/load, resume, complete while away, and malformed queues are discarded.

## Rules of thumb
- After `fastForward`, always `await settle(win)` (>=1200 ms real time) — the game only notices on its next 1s render.
- Add a field to the game -> add it to `baseSave` in `harness.js`.
- The playthrough in `regression_core.js` is random; rerun once before calling a failure real.
- "Not implemented: navigation to another Document" in the output is jsdom noise from the Save button's download link, not a failure.
