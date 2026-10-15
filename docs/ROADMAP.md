# Zombie Pandemic: Protocols — Roadmap

Companion to `GAME_DESIGN.md`. Status labels: **DONE**, **OPEN** (known issue), **DECISION** (needs the designer's call before building), **PLANNED** (design agreed, not built), **PARKED**.

Process reminder: propose design → get go-ahead on anything large → back up → build → dedicated test → full regression → ship. Say plainly what is and isn't verified.

---

## 1. Shipped so far

Roster (5, one traveler) · World Map · Compound Expansion (8 blocks) · Fitness/Marksmanship training · Energy Drink · crafting/building XP · bigger caches · vendor density scaling · player level cap 25 + reputation titles · companion leveling (cap 10) · Vendor Quests + reputation · companion manual & auto-heal · combat balance pass (faster zombies, danger ceiling 10, hordes up to 5, faster boss) · 32-name NPC pool · Safehouse structural integrity + repair · dropdown re-render fix · offline persistence of craft/build queues · capped (8h) offline credit for stamina, Garden and outposts · mobile viewport meta · per-device localStorage autosave · **phone layout pass (compact map, actions above the log, bigger tap targets, empty quest chip fixed) · **Alpha Phase 1: emergence** · **Alpha Phase 2: turned recruits + double agents (latest)** · **Audio Phase A: procedural Web Audio sound effects (20 SFX, settings panel, mute/M key, prefs in save)** · repair XP.

---

## 2. Open issues

| # | Issue | Status | Notes |
|---|---|---|---|
| 1 | **"No more Safehouse upgrades" after a defense upgrade + repair** (player report) | **OPEN** | Could not reproduce in any sequence tested: barricade→barricade, repair→barricade, barricade→repair, all followed by checks of every other build option. **Need the player's save file from the moment it happens** (SAVE GAME button). Two by-design behaviors can look like it: only one project runs at a time, and each barricade tier costs more. Note: the new queue validation removes one plausible cause (a malformed/clock-skewed queue) but is not a confirmed fix for this report. |
| 2 | Repairs grant no XP | **DONE** | Repairs now grant `max(5, round(ms/1500))` like every other build (7-33 XP). The repair queue stores its duration; older saves without it get the 10s minimum. Covered by `quickwins_test.js`. |
| 3 | Interactive (player-present) Safehouse defense never damages integrity | OPEN (design) | Only auto-resolved attacks do. Decide whether winning at home should cost a small amount. |
| 4 | Safehouse attack levels (max 5) don't scale to the danger ceiling of 10 | OPEN (design) | Late-game bases are only ever attacked by levels 1–5. Needs a rule tied to something (claimed blocks? barricade level? days survived?). |
| 5 | Guard XP from defense events verified by code review only | **DONE** | Now tested deterministically (pin `Math.random`, fast-forward past the 90s check): repelled +level x4, overrun victim +level x3, others +level x2, fallen guard removed. `quickwins_test.js`. |
| 6 | Quest reward "premium item" is a flat 25% per turn-in | OPEN (tuning) | Watch in playtesting; consider pity timer. |

---

## 3. Decisions needed

### D1 — Offline credit for passive systems — **DONE**
Implemented as option B: stamina regen, Garden and outposts are credited for time away, capped at 8 hours. Auto-heal and passive repair remain online-only by design.

### D3 — Saving on phone and computer — **DONE (option B)**
Built: autosave to `localStorage` every 15s plus on tab hide/close (`visibilitychange`, `pagehide`); Continue on the title screen; artifact `window.storage` still used when present. Manual `.json` stays the cross-device path.

Original options:
Hosted on a normal website there is **no autosave** (the artifact-only `window.storage` is absent), so closing the tab loses unsaved progress. Options:
- **A. Manual only** (current) — save/load `.json` files; cross-device via a cloud drive.
- **B. Per-device autosave to `localStorage`** (recommended): saves every ~15s and on tab close, offers "Continue" on the title screen. Manual `.json` export/import remains the cross-device path.
- **C. Cloud sync** — needs a backend/account; out of scope for a static site.
Tradeoff for B: browser storage can be cleared by the user/OS, and each device/browser has its own save.

### D2 — Combat dynamics
Ranged combat is now riskier (faster zombies) but the player still acts before any zombie can. Watch feedback before adding more (e.g. zombie lunges, ranged zombie types).

---

## 4. Planned: The Alpha system (design agreed; phased so each ships and is testable alone)

Concept: a smart, very strong zombie with goals. It is a **separate threat from Patient Zero** (independently evolved), so **curing the pandemic does not stop it**. Curing instead grants a **modest permanent reduction to general zombie difficulty** (not yet built).

**Phase 1 — Emergence. DONE.** Trigger: first claimed block completes (retroactive for older saves; one-time flag). Seeded name ("The <Adjective> <Title>", 12x12 original words). Overlay + log + Safehouse status card. 10-minute *play-time* quiet period, then Safehouse hordes become Alpha-directed: attack chance x1.25, level +1/+1/+2 by escalation (1 + at 4 blocks + at 8 blocks), **no horde-size bump** (Option B, chosen after simulation: the originally approved size bump dropped a maxed 8-block Medium base to 14% repel), x1.5 salvage when repelled, escalating flavor text. No World Map marker yet.
Simulated Medium repel rates with Option B: 4 blocks/barricade 3/2 guards 45%; 8 blocks/barricade 5/4 guards 88%; no overruns on Medium at 4+ blocks.

**Phase 2 — Turned NPCs + double agents. DONE.** Post-emergence recruits are secretly turned 10/15/20% by escalation. PER-weighted detection every 3 min of play (4% + 3%/PER, cap 50%) marks them SUSPICIOUS; no false positives (designer's call). Unconfronted traitors sabotage every 5 min at 25% (scrap theft or integrity damage at home; hesitation in the next fight on the road), defecting after the 3rd. Confront: 70% fight / 30% flee. Dismissing a suspect = flee. Interrogate: 25% + 5%/companion level (cap 70%) to make a **double agent** (one at a time), else fight. Double agent: Alpha attacks -1 level while guarding, +1 Alpha intel per 5 min (for Phase 3), 10% flip-back per 5 min (leak +2); release is safe. Leaks add +levels to the next Alpha attack. Achievements Trust No One (+1 PER) and Turncoat (+1 LCK). Tests: `alpha2_test.js` (60).
- **Open (Phase 2 follow-ups):** (a) the original spec's *tell at recruitment* (subtle flavor line) was not in the approved design and is not built. Decide whether turned recruits show a partial tell. (b) You can take a suspect's gear back before confronting, which avoids the "they leave with their gear" cost. Decide whether suspects should refuse to hand gear over.

**Phase 3 — The Alpha fight.** Track and fight it (fightable boss with its own stats). Defeating it ends the current escalation, drops a unique reward. After a quiet cooldown a **new Alpha emerges tougher**, with a freshly seeded name/portrait (reuse the seeded portrait system) — a recurring cycle, not a one-time finale.

Noted during Phase 1 balancing (not Alpha-related): a fresh 1-block Medium base repels only ~14% of ordinary attacks. Worth a look in a later balance pass.

---

## 5. Backlog / ideas (unscoped)

- Phone layout, remaining: combat overlay, Safehouse/Shop/Character tabs on a real device (Field tab done).
- Optional PWA (manifest + service worker) for an installable, offline-capable app.

- Vendor quest type: retrieve an item from a specific location (needs a spatial marker system).
- Per-block damage/repair for claimed blocks (replaces the single integrity number; larger change).
- Room upgrade tiers so the seven rooms keep mattering late-game.
- More endgame sinks for cash/scrap once caps are reached.
- Additional world events (weather, night, scavenger rivals).
- Sound design: **Phase A DONE** (SFX). Remaining: **Phase B** adaptive music + ambience layered by distance/danger from the Safehouse (music/ambience buses already exist, unused); **Phase C** visual feedback (danger vignette, damage numbers, screen shake honoring `prefers-reduced-motion`, low-HP state, level-up banner).

## 6. Parked

- **Graphics/blood-and-gore visual pass** — designer will handle art direction later. If revisited: original CSS/SVG only; do not use other games' archived pages as references.

---

## 7. Engineering notes

- **Test suites:** the earlier ~17 per-feature suites were lost when the working sandbox reset. They were replaced by `tests/regression_core.js` (31 checks across the major systems + a 250-action playthrough and save round-trip) `tests/persistence_test.js` (26 checks) `tests/offline_credit_test.js` (15 checks) and `tests/autosave_test.js` (13 checks) and `tests/layout_test.js` (6 checks) and `tests/alpha_test.js` (24 checks) and `tests/audio_test.js` (65 checks, strict Web Audio stub) and `tests/alpha2_test.js` (60 checks) and `tests/quickwins_test.js` (16 checks), plus `tests/browser_smoke_audio.js` (real Chromium via Playwright, optional). `harness.js` resolves `index.html` first. Coverage is narrower than the old suites in places (e.g. no statistical vendor-density sampling, no world-map interaction tests, no achievement-unlock tests beyond formulas). **Keep test files in project knowledge or a repo — the sandbox is not durable.**
- Always back up the game file before edits (`*.vN.bak.html`) and keep the last-known-good copy in outputs until the new build passes.
- Prefer targeted edits; the file is large enough that full rewrites risk silent regressions.
