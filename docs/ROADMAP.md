# Zombie Pandemic: Protocols — Roadmap

Companion to `GAME_DESIGN.md`. Status labels: **DONE**, **OPEN** (known issue), **DECISION** (needs the designer's call before building), **PLANNED** (design agreed, not built), **PARKED**.

Process reminder: propose design → get go-ahead on anything large → back up → build → dedicated test → full regression → ship. Say plainly what is and isn't verified.

---

## 1. Shipped so far

Roster (5, one traveler) · World Map · Compound Expansion (8 blocks) · Fitness/Marksmanship training · Energy Drink · crafting/building XP · bigger caches · vendor density scaling · player level cap 25 + reputation titles · companion leveling (cap 10) · Vendor Quests + reputation · companion manual & auto-heal · combat balance pass (faster zombies, danger ceiling 10, hordes up to 5, faster boss) · 32-name NPC pool · Safehouse structural integrity + repair · dropdown re-render fix · offline persistence of craft/build queues · **capped (8h) offline credit for stamina, Garden and outposts · mobile viewport meta (latest)**.

---

## 2. Open issues

| # | Issue | Status | Notes |
|---|---|---|---|
| 1 | **"No more Safehouse upgrades" after a defense upgrade + repair** (player report) | **OPEN** | Could not reproduce in any sequence tested: barricade→barricade, repair→barricade, barricade→repair, all followed by checks of every other build option. **Need the player's save file from the moment it happens** (SAVE GAME button). Two by-design behaviors can look like it: only one project runs at a time, and each barricade tier costs more. Note: the new queue validation removes one plausible cause (a malformed/clock-skewed queue) but is not a confirmed fix for this report. |
| 2 | Repairs grant no XP | OPEN (trivial) | Every other construction type does. Suggest `max(5, ms/1500)` like the rest. |
| 3 | Interactive (player-present) Safehouse defense never damages integrity | OPEN (design) | Only auto-resolved attacks do. Decide whether winning at home should cost a small amount. |
| 4 | Safehouse attack levels (max 5) don't scale to the danger ceiling of 10 | OPEN (design) | Late-game bases are only ever attacked by levels 1–5. Needs a rule tied to something (claimed blocks? barricade level? days survived?). |
| 5 | Guard XP from defense events verified by code review only | OPEN (test) | No way to force an attack event in tests. Add a debug hook or extract the resolver so it can be called directly. |
| 6 | Quest reward "premium item" is a flat 25% per turn-in | OPEN (tuning) | Watch in playtesting; consider pity timer. |

---

## 3. Decisions needed

### D1 — Offline credit for passive systems — **DONE**
Implemented as option B: stamina regen, Garden and outposts are credited for time away, capped at 8 hours. Auto-heal and passive repair remain online-only by design.

### D3 — Saving on phone and computer (recommended next)
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

**Phase 1 — Emergence.** After a milestone (trigger TBD; suggest a player level or first claimed block), a narrative beat announces the Alpha. Safehouse hordes become Alpha-directed: stronger and re-flavored (log text, escalating). Reuses the existing Safehouse attack system — cheapest phase.

**Phase 2 — Turned NPCs.** Some field recruits are secretly working for the Alpha. Requirements for fairness:
- A **tell shown at recruitment** (subtle flavor line) so an attentive player can catch it.
- **PER gates perception**: a periodic PER-weighted check surfaces a "something's off" log line and unlocks **Confront** on that companion's roster card.
- **Confront outcomes** are probabilistic: most often hostile (combat vs. the companion); sometimes they **flee**, taking equipped gear and potentially leaking intel to the Alpha (feeds later escalation).
- Betrayal is never silent: the consequence must be visible and attributable.
- If left unconfronted, a turned NPC eventually acts (e.g. sabotage/defection) with a clear log message.

**Phase 3 — The Alpha fight.** Track and fight it (fightable boss with its own stats). Defeating it ends the current escalation, drops a unique reward. After a quiet cooldown a **new Alpha emerges tougher**, with a freshly seeded name/portrait (reuse the seeded portrait system) — a recurring cycle, not a one-time finale.

Open sub-questions for Phase 1: what triggers emergence, how much stronger Alpha hordes are, and whether the Alpha's existence shows anywhere on the World Map.

---

## 5. Backlog / ideas (unscoped)

- Verify and polish the phone layout (real-device screenshots, tap-target sizes, combat overlay height).
- Optional PWA (manifest + service worker) for an installable, offline-capable app.

- Vendor quest type: retrieve an item from a specific location (needs a spatial marker system).
- Per-block damage/repair for claimed blocks (replaces the single integrity number; larger change).
- Room upgrade tiers so the seven rooms keep mattering late-game.
- More endgame sinks for cash/scrap once caps are reached.
- Additional world events (weather, night, scavenger rivals).
- Sound design (WebAudio, no external assets).

## 6. Parked

- **Graphics/blood-and-gore visual pass** — designer will handle art direction later. If revisited: original CSS/SVG only; do not use other games' archived pages as references.

---

## 7. Engineering notes

- **Test suites:** the earlier ~17 per-feature suites were lost when the working sandbox reset. They were replaced by `tests/regression_core.js` (31 checks across the major systems + a 250-action playthrough and save round-trip) `tests/persistence_test.js` (26 checks) and `tests/offline_credit_test.js` (15 checks). Coverage is narrower than the old suites in places (e.g. no statistical vendor-density sampling, no world-map interaction tests, no achievement-unlock tests beyond formulas). **Keep test files in project knowledge or a repo — the sandbox is not durable.**
- Always back up the game file before edits (`*.vN.bak.html`) and keep the last-known-good copy in outputs until the new build passes.
- Prefer targeted edits; the file is large enough that full rewrites risk silent regressions.
