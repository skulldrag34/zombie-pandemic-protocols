# Zombie Pandemic: Protocols — Roadmap

Companion to `GAME_DESIGN.md`. Status labels: **DONE**, **OPEN** (known issue), **DECISION** (needs the designer's call before building), **PLANNED** (design agreed, not built), **PARKED**.

Process reminder: propose design → get go-ahead on anything large → back up → build → dedicated test → full regression → ship. Say plainly what is and isn't verified.

---

## 1. Shipped so far

Roster (5, one traveler) · World Map · Compound Expansion (8 blocks) · Fitness/Marksmanship training · Energy Drink · crafting/building XP · bigger caches · vendor density scaling · player level cap 25 + reputation titles · companion leveling (cap 10) · Vendor Quests + reputation · companion manual & auto-heal · combat balance pass (faster zombies, danger ceiling 10, hordes up to 5, faster boss) · 32-name NPC pool · Safehouse structural integrity + repair · dropdown re-render fix · offline persistence of craft/build queues · capped (8h) offline credit for stamina, Garden and outposts · mobile viewport meta · per-device localStorage autosave · **phone layout pass (compact map, actions above the log, bigger tap targets, empty quest chip fixed) · **Alpha Phase 1: emergence** · **Alpha Phase 2: turned recruits + double agents** · **Audio Phase A: procedural Web Audio sound effects (20 SFX, settings panel, mute/M key, prefs in save)** · **Audio Phase B: adaptive music + ambience** · **Item art batch 1 (18 items, embedded)** · **Item art batch 2 (6 gear items)** · **Player portrait: add your own picture** · **Title banner + link preview + GitHub banner; popup screens no longer clip their top on phones** · **Combat visuals Phase 1: face-off panel + zombie art slots; ALLY bar no longer shows without a companion** · **Character model Phase A: full-body picture with gear slots around it** · **Survivor tab (Inventory + Character) and Squad tab; tap a slot to filter, unequip from the slot** · **Compact status header with the survivor record and attributes** · **Pinned header (desktop) + slim scroll bar (phone); companion portraits** · **Scrap gear: 6 craftable pieces with level-gated recipes** · **Room art: all 7** · **Alpha portraits: all 12** · **Alpha Phase 3: lair, intel, the Alpha fight, successors** · **Vendor job markers on the maps (latest)** · repair XP.

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

**Phase 2 — Turned NPCs + double agents. DONE.** Post-emergence recruits are secretly turned 10/15/20% by escalation. PER-weighted detection every 3 min of play (4% + 3%/PER, cap 50%) marks them SUSPICIOUS; no false positives (designer's call). Unconfronted traitors sabotage every 5 min at 25% (scrap theft or integrity damage at home; hesitation in the next fight on the road), defecting after the 3rd. Confront: 70% fight / 30% flee. Dismissing a suspect = flee. Interrogate: 25% + 5%/companion level (cap 70%) to make a **double agent** (one at a time), else fight. Double agent: Alpha attacks -1 level while guarding, +1 Alpha intel per 5 min (for Phase 3), 10% flip-back per 5 min (leak +2); release is safe. Leaks add +levels to the next Alpha attack. Achievements Trust No One (+1 PER) and Turncoat (+1 LCK). Tests: `alpha2_test.js` (66).
- **Phase 2 follow-ups DONE (designer approved):** (a) partial *tell at recruitment*: 50% of turned recruits log one of 5 subtle lines on joining; loyal recruits never do. (b) Suspects refuse to hand gear back ("refuses" on the card, enforced in game logic). Undetected traitors behave normally so nothing tips the player off.

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
- Sound design: **Phase A DONE** (SFX), **Phase B DONE** (adaptive music + ambience). Remaining: **Phase C** visual feedback (danger vignette, damage numbers, screen shake honoring `prefers-reduced-motion`, low-HP state, level-up banner). Music tuning (tempo, density, brightness) pending the designer's playtest.

## 5b. Art (in progress)

**Character model Phase B (proposal later):** one original faceless mannequin for everyone + ~30 see-through gear overlays (helmet, armor, gloves, pants, boots, weapon, backpack, accessories) drawn on its template, stacked as you equip. A player's own model can't take overlays; they choose their picture or the dressed mannequin.

**Factions Phase 1 DONE:** Continuity Authority (President Adelaide Voss), Salvage Union (Harlan Teague), Rust Jackals (Kade "Gravel" Marrow), The Bloom (Dr. Isolde Marsh; secular cult, no religious imagery). Creation setting Few (2) / Normal (3, default) / Many (4). Seeded HQs 8-15 steps out, territory radius 2, standing -100..+100 in five states, rivals, faction shops with Friendly/Allied exclusives, gifts, faction jobs, rumours. Peaceful by design. **Next: Phase 2** patrols, raids on your base, territory expansion, Bunkhouse room (squad to 7). **Phase 3** HQ assaults, leader fights, inter-faction politics. Art to request: 4 leader portraits, 4 emblems (text fallback until then).

**Combat visuals Phase 2 (proposal later):** zombie types get gameplay quirks; pick your target within a horde.


Designer's Gemini art in a gritty graphic-novel style, **embedded** in index.html (single-file rule kept; designer's call). Prompt pack: the "Art Prompt Pack" doc. Pipeline: originals in `art-src/`, crops in `tools/art_manifest.json`, `python3 tools/build_art.py` writes 256px WebP into the `zp-art` script block. Items without art render as before, so art lands in batches.
- **Batch 1 DONE (18):** Bandage, Ammo, Cloth Strips, Duct Tape, Scrap Metal, Empty Bottle, Painkillers, Energy Drink, Bandana, Work Gloves, Canned Food, Wallet, Watch, Jewelry, Improvised Flamethrower, Machete (grid cell; replace with a single card later), Crowbar, Medkit. Grid B's medkit cell was not used (cross symbol).
- **Batch 2 DONE (6):** Shotgun, Padded Vest, Riot Armor, Motorcycle Helmet, Reinforced Gauntlets, Padded Leg Guards.
- **Batch 3 DONE (4):** Pistol, Combat Boots, Leather Jacket, Camo Hoodie.
- **Zombie portraits (11, 300x400, prompts in the Art Prompt Pack):** ALL 11 DONE. Every fight shows a zombie portrait (traitors show their own face).
- **Companion portraits (12):** DONE 11: C1-C11 (C9 lab-coat scientist, C10 welder in cap, C11 braided woman in a leather vest). C12 DONE (young man with locs): all 12 slots filled. Held: a man in the same patched jacket (art-src/companions/held-patched-jacket-man.jpg); also held: a mohawk woman with a respirator (art-src/companions/held-mohawk-woman.jpg); all 5 women's slots are full, and adding a slot would change existing companions' faces.
- **Scrap gear DONE (6 craftable pieces).** Art in for all 6.
- **Room art:** ALL 7 DONE. Rejected: 'Alpha tokens' (lettered coins; not the pack's Alpha portraits).
- **Field banners and shop portraits: slots DONE.** Safehouse (rooftop survivors) and Commercial (street fight) banners in. Waiting on art: Residential, Industrial, Military, Wasteland, 3 landmarks, 4 HQs, Alpha lair, Patient Zero; 6 vendor portraits, the Home Supply Locker, 4 faction leaders.
- **Held back:** a wide street banner with a zombie lineup and a hand-lettered sign; it resembles another game's site header and carries baked-in text.
- **Scrap Plate Armor DONE.** **Every item in the game has art** (Trauma Kit redone without the cross mark).
- **Shop items: ALL DONE** (Cargo Pants and a logo-free Running Shoes added last).
- Then: Patient Zero zone + portrait, companion portraits, remaining items, rooms, vendors, Alphas, scenes. Companion/NPC portraits and scenes need new slots (not built yet); the player portrait frame (300x400) is built and can be reused.

## 6. Parked

- **Graphics/blood-and-gore visual pass** — superseded in part by the art track (5b); gore level still the designer's call. If revisited: original CSS/SVG only; do not use other games' archived pages as references.

---

## 7. Engineering notes

- **Test suites:** the earlier ~17 per-feature suites were lost when the working sandbox reset. They were replaced by `tests/regression_core.js` (31 checks across the major systems + a 250-action playthrough and save round-trip) `tests/persistence_test.js` (26 checks) `tests/offline_credit_test.js` (15 checks) and `tests/autosave_test.js` (13 checks) and `tests/layout_test.js` (6 checks) and `tests/alpha_test.js` (24 checks) and `tests/audio_test.js` (65 checks, strict Web Audio stub) and `tests/alpha2_test.js` (66 checks) and `tests/quickwins_test.js` (16 checks) and `tests/music_test.js` (42 checks), plus `tests/browser_smoke_audio.js` (real Chromium via Playwright, optional). `harness.js` resolves `index.html` first. Coverage is narrower than the old suites in places (e.g. no statistical vendor-density sampling, no world-map interaction tests, no achievement-unlock tests beyond formulas). **Keep test files in project knowledge or a repo — the sandbox is not durable.**
- Always back up the game file before edits (`*.vN.bak.html`) and keep the last-known-good copy in outputs until the new build passes.
- Prefer targeted edits; the file is large enough that full rewrites risk silent regressions.
