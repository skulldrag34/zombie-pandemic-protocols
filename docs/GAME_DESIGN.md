# Zombie Pandemic: Protocols — Game Design Reference

Authoritative description of what the game does **as implemented** (single file: `zombie_pandemic_protocols.html`, published as `index.html` in the GitHub repo, ~3,500 lines, vanilla JS/CSS, no external assets). Values below were read from the code, not from memory. If code and this doc disagree, the code wins — then fix the doc.

Originality rule: all code, names, text and visuals are original. Only generic genre conventions are used. Never copy another game's art, logos, UI chrome, text or characters.

---

## 1. Design pillars

1. **Danger scales with distance from the Safehouse, not player level.** Leveling up makes old zones easier.
2. **Everything is capped** so builds force tradeoffs (attributes 10, player level 25, companion level 10, roster 5, claimed blocks 8, vendor rep 10).
3. **Scarcity near home** (few vendors) pushes early exploration and scavenging.
4. **One construction project at a time** — rooms, barricade, repairs, claims and training share a single queue.
5. **Meaningful risk at every stage** — ranged combat must not be risk-free.
6. **Reuse existing patterns** (tick systems, tier tables, card UI) over new machinery.

---

## 2. Architecture

- **Global state object `s`.** Sets (`visited`, `builtRooms`, `collectedCaches`, `achievements`, `craftedRecipes`) are converted to arrays on save.
- **Save format:** JSON via `serialize()` / `applySaveData()`, `version: 6`. Every new field needs: a `newGame()` default, a `serialize()` entry, and handling (or a safe default) in `applySaveData()`. Old saves load because `Object.assign(fresh, data)` leaves `newGame()` defaults for missing keys.
- **Rendering:** `render()` runs every 1s (`setInterval`) and after every action. It calls `tickRegen()` first, then every tab renderer. Tabs are rebuilt with `innerHTML`.
- **Dropdown rule:** any tab containing `<select>` must skip its rebuild while one of its selects is focused (`renderRosterTab` for gear selects, `renderSafehouseTab` for post selects). Action buttons must `blur()` the select before running the action so the next render isn't suppressed.
- **Time systems** compare `Date.now()` timestamps inside `tickRegen()`.
- **Autosave:** every 15s and on tab hide/close (`visibilitychange`, `pagehide`) to `localStorage` key `zp_autosave` (per device/browser), plus `window.storage` when running as a Claude artifact. Never written from the title screen. Title screen shows CONTINUE when an autosave exists. Manual save/load is a `.json` download/upload (the cross-device path).
- **Determinism:** world layout is a pure function of `(x, y, worldSeed)` via `hash()` and `mulberry32()`. Vendor identity, stock, caches and sector names never change for a given seed.

### Time and persistence behavior (important)

| System | Interval | Across save/load |
|---|---|---|
| **Craft queue** | recipe time | **Persisted** — saved with absolute `finishAt`; completes on load if enough real time has passed |
| **Build queue** (room, barricade, repair, claim, fitness, marksmanship) | tier time | **Persisted** — same mechanism |
| **Stamina regen** | 1 per 10s | **Credited on load** for time away (cap 8h), up to max stamina |
| **Garden** | 1 Canned Food / 60s | **Credited on load** for time away (cap 8h) |
| **Compound outposts** | 1 Scrap / block / 180s | **Credited on load** for time away (cap 8h) |
| Companion auto-heal | 15s check | Online only — timestamp resets on load |
| Passive Safehouse repair | 180s | Online only — resets on load |
| Safehouse attack check | 90s (after 10-turn grace) | Online only — resets on load (no attacks while away) |

**Offline credit** (`applyOfflineCredit`): every save records `savedAt`. On load, `away = now − savedAt` (ignored if ≤ 0 or `savedAt` is missing/in the future), capped at **8 hours**, and stamina, Garden and outpost income are credited at their normal rates, once, with a "While you were away…" log line. Auto-heal and passive repair are deliberately not credited (they consume items / need decisions), and no Safehouse attacks occur while away. Because a load replaces state with the file's state, reloading an old file cannot stack credit.

Loaded queues are **validated** (`sanitizeCraftQueue`, `sanitizeBuildQueue`): unknown kind/recipe/room, out-of-range tier, non-numeric `finishAt`, or a claim on an already-claimed/over-cap block are discarded, and any `finishAt` more than 10 minutes in the future (e.g. system clock change) is capped. A bad queue can therefore never block construction permanently. Combat, pending NPC offers and the death flag are always cleared on load.

---

## 3. Character

### Attributes (STR, AGI, END, PER, LCK)
- Creation: all start at 1, plus **5 points** to spend. Each level grants **+1 point**. Cap **10** each (before gear/achievement bonuses, which stack on top).
- Total lifetime points at level cap 25: **9 + 25 = 34** → cannot max all five (needs 50). This is deliberate.
- **Effective attribute** = base + gear bonus + achievement bonus. All formulas use effective values.

| Derived stat | Formula |
|---|---|
| Melee damage multiplier | `1 + (STR−1) × 0.05` |
| Max HP | `baseMaxHp + (STR−1)×2 + (END−1)×8 + gear HP` (`baseMaxHp` starts 100, +10 per level) |
| Max stamina | `20 + gym(5) + fitness tiers(2 each) + (END−1)` |
| Accuracy bonus (all weapons) | `gear accuracy + range room(10) + (AGI−1)×3` |
| Ranged accuracy bonus | `(PER−1)×4 + marksmanship tiers(2 each)` — ranged/thrown only |
| Flee bonus | `(AGI−1)×3` |
| Crit chance | `(LCK−1)×3 %` (crit = ×1.5 damage) |
| Bonus-loot chance | `(LCK−1)×2 %` |
| Rare-loot bias | `(PER−1)×3 %` |

### Levels and XP
- XP to next level starts at 100, ×1.35 per level. Level-up: +10 base HP, +1 attribute point, heal 20.
- **Player level cap: 25.** Overflow XP feeds `postCapXp` → **reputation titles** (cosmetic, with portrait-frame color): Grizzled (0), Unbroken (400), Dread Walker (1,200), Wasteland Myth (3,000), Living Legend (7,000).
- XP sources: kills (`zombieLevel × 10`), scavenging (2), crafting (`max(3, ms/2000)`), construction (`max(5, ms/1500)`, covers rooms/barricade/claims/training — **not repairs**), quests (per quest).
- **Death:** respawn at Safehouse with 50% HP and −25% cash. Character persists. "New Character" is a separate explicit action.

### Equipment
5 slots: head, torso, hands, pants, feet. Items give defense, HP, accuracy and/or attribute bonuses. Weapons are separate (one equipped). Armor/clothing can be scrapped or sold. **39 catalog items** (weapons, gear, aid, ammo, materials, quest-only rewards).

Quest-only items (never in shops or loot): Reinforced Combat Vest (DEF 15, +20 HP), Precision Rifle (65 dmg, +25 acc), Trauma Kit (heal 90).

---

## 4. World

- **Sector danger** `= min(10, 1 + floor(dist / divisor) + (15% chance of +1))`, where `dist = |x|+|y|` and divisor = 3 / 2 / 1 for infection Slow / Normal / Fast.
- **Type by danger:** ≤1 Residential; 2 Residential/Commercial; 3 Commercial/Industrial; 4 Industrial/Military; ≥5 Military (1/3) or Wasteland (2/3).
- **Fixed landmarks:** [0,0] Safehouse (danger 0); [0,1] Suburban Neighborhood (Residential, 1); [1,0] Downtown Strip Mall (Commercial, 2); [1,1] Police Precinct (Military, 3).
- **Vendors:** [0,0] always has the Home Supply Locker (fixed stock). Elsewhere: chance `min(25, 3 + 2×dist)` %, **never in Wasteland**. Stock is a seeded random 5 from a pool; some items are level-gated.
- **Supply caches:** 20% of sectors (not [0,0]); one-time; **3–5 items** from that sector type's loot table.
- **Themes:** optional city name sets (NYC, LA, Chicago, London, Tokyo, Sydney) for sector names only.
- **World settings** (chosen at creation, fixed after): Outbreak Severity (Low/Medium/High/Nightmare → ambush ×0.7/1/1.3/1.6, damage ×0.8/1/1.2/1.5, horde chance 5/12/22/35%), Infection Spread (danger ramp), Civilians Armed % (20/45/70%).
- **World Map tab:** 13×13 pannable/draggable viewport, jump-to-coordinates, click-to-inspect, fog of war, markers for vendor/cache/claimed/posted/boss.

---

## 5. Combat

Turn-based; **every action costs a turn** (fire, advance, retreat, switch weapon, use aid, throw). After each action the zombie closes distance, and if distance ≤ 0 it attacks.

- **Zombie:** HP `20 × level`; start distance `5 + level`; speed `2 + floor(0.6 × level)`; damage per hit `round(level × 8 × (0.8–1.2) × severity dmg)` minus armor (min 1).
- **Hit chance** `= clamp(55 + weapon accuracy + accuracy bonus + ranged bonus − 4 × zombieLevel, 10, 95)`.
- **Melee** cannot fire until distance is 0 (advance first). **Ranged** works at any distance but burns 1 Ammo per shot; with no Ammo it falls back to bare fists. **Thrown** items are consumed. Flamethrower is ranged (uses Ammo).
- **Ambush chance** on entering a sector `= min(0.75, danger × 0.22 × severity ambush)`.
- **Horde size (max 5):** `m = 1 + danger×0.15`; extra zombie rolls at `hordeChance × m`, `× m × 0.6`; plus `× m × 0.35` if danger ≥ 4; plus `× m × 0.2` if danger ≥ 6.
- **Flee** chance `= clamp(50 + distance×5 − zombieLevel×5 + flee bonus, 5, 90)`; failure lets the zombie close in.
- **Boss — Patient Zero:** 320 HP, start distance 10, speed 6. Appears at the located coordinates (10–14 sectors from home) once the Lab has decoded 3 Research Fragments. Curing sets `questStage = "cured"` and offers Continue Playing.
- **Combat log/subpanels:** switch weapon, use aid (self or traveling companion), throw.

---

## 6. Safehouse (tab 4)

Must be at [0,0] to start any project. All projects share **one queue**.

### Rooms (one-time builds)
| Room | Cost | Time | Effect |
|---|---|---|---|
| Armory | 20 scrap, $50 | 30s | +15% weapon damage, +5 Safehouse defense |
| Sickbay | 15, $30 | 25s | +50% healing from aid |
| Shooting Range | 25, $40 | 35s | +10 accuracy (all weapons) |
| Garden | 10, $20 | 20s | 1 Canned Food / min |
| Gym | 15, $25 | 25s | +5 max stamina; unlocks Fitness Training |
| Workshop | 20, $35 | 30s | −30% craft time |
| Lab | 30, $80 | 45s | Decode Research Fragments (Cure Protocol) |

Scrap Metal is **one unified resource**: the HUD chip is the inventory item.

### Barricade (5 tiers)
Cost scrap/$ and time: L1 15/20 20s · L2 25/35 25s · L3 35/55 30s · L4 50/80 35s · L5 70/120 45s. **+8 defense per level.**

### Safehouse Defense value
`(barricade×8 + claimed blocks×5 + armory 5 + Σ guards) × (0.5 + 0.5 × integrity/100)` where each guarding companion contributes their weapon damage, or 5 if unarmed.

### Attack events
Checked every 90s after a 10-turn grace. Chance per check by severity: 5/10/18/30%. Horde level range by severity (1–2 … 4–5), count 1–3 (+/−1).
- **Player at [0,0]:** interactive "Safehouse Under Attack" fight. (No integrity damage — known gap.)
- **Player away:** auto-resolve. `threat = level × 10 × count`. Defense ≥ threat → **repelled** (+5–14 scrap). Defense ≥ 50% of threat → **barely held**. Otherwise **overrun**.
  - Barely/overrun: lose 15% / 35% of scrap and cash; integrity −(10–20) / −(25–40); one random guard takes 8–17 / 20–39 damage (dies at 0).
  - Guards earn XP: repelled → `level×4` each; bad outcome → victim `level×3`, others `level×2`.

### Structural integrity (0–100)
Below 100 it scales Safehouse Defense down to as low as ×0.5. **Manual repair:** `max(1, round(missing × 0.5))` scrap, time `max(10s, missing × 0.5s)`, restores to 100. **Passive:** every 180s each guarding companion restores +2.

### Compound Expansion (max 8 blocks)
Claimable sector must be adjacent (N/S/E/W) to [0,0] or an existing claim, **already visited**, **danger ≤ 2**, not already claimed. Cost `15 scrap / $25 × (1 + 0.35 × claimedCount)`, time `20s + 4s × claimedCount`. Each block: **+5 defense** and **+1 scrap / 3 min**. A guarding companion can be **posted** to a block (display/flavor; their defense contribution is unchanged). Posting clears if the companion travels or is dismissed.

### Training (requires Gym / Range)
Five tiers each. Cost scrap/$: 10/15, 15/25, 20/35, 25/50, 30/70. Time: 60/90/120/150/180s. **Fitness: +2 max stamina per tier. Marksmanship: +2 ranged-only accuracy per tier** (does not affect melee).

### Crafting (tab 3)
Bandage (2 Cloth Strips, 15s) · Molotov (Bottle + Cloth + Scrap, 25s) · Improvised Flamethrower (Bottle + Tape + 2 Scrap, 40s) · Scrap Plate Armor (3 Scrap + Tape, 30s). One craft at a time, separate from the build queue.

---

## 7. Companions

- **Encounter:** 6% per move in non-Safehouse sectors when no fight occurred; armed chance from the world setting. Recruiting consumes a Canned Food or Bandage if you have one (a gift). 32-name pool.
- **Roster cap 5. Exactly one may travel** (assist in combat); the rest **guard** (Safehouse defense, passive repair, quest posts). Setting one to travel demotes the previous traveler.
- **Combat role (traveler only):** assists after each of your attacks (60% chance); when armed, 25% chance to take a zombie's hit for you. Earns `zombieLevel × 3` XP per kill.
- **Growth:** start 40 HP, level cap 10, 30 XP per level, per level **+8 max HP, +1 damage, +1 defense**. Reaching level 10 sets a persistent flag (Battle-Hardened) even if that companion later leaves.
- **Gear:** one weapon + one armor slot, given/taken from the Roster tab (dropdown + button); dismissing returns gear.
- **Healing:** manual "heal" button on every card (any mode); **auto-heal** (default ON, toggle in Roster header) every 15s heals anyone below 60% HP using Medkit → Bandage → Painkillers → Canned Food. Traveler can also be healed in combat and from Inventory.

---

## 8. Economy and quests

- **Vendor reputation** per vendor sector, cap 10; each point = **3% off buying and +3% selling** (max 30%). Reputation is earned only from that vendor's quests.
- **Quests:** on arriving at a vendor sector, 35% chance of a job if none is offered/active; 5-minute cooldown after completion/decline. Accept/decline; one per vendor.
  - **Fetch:** qty `3 + floor(level/3)` of a common supply item; XP `qty×12×(1+0.05×level)`; cash `8×level + 6×qty`; rep +2.
  - **Bounty:** kill `2 + floor(level/5)` zombies of level ≥ `min(5, max(1, floor(level/4)+1))` (counts anywhere); XP `count×minLevel×14`; cash `10×level + 8×count`; rep +3.
  - **25%** chance on turn-in of a quest-only premium item.
- **Sell values:** fixed for valuables; weapons ≈ damage×1.2; armor ≈ defense×2.5. Scrap-down converts gear to Scrap Metal.

---

## 9. Achievements (29)

Each grants a permanent attribute bonus applied in every derived-stat calculation: First Blood, Exterminator, Zombie Slayer (kills) · Apocalypse Veteran (100 kills, +2 STR) · Scout, Explorer, Pathfinder (sectors) · Survivor (lv 5), Wasteland Legend (lv 10, +2 END), Nine Lives · Close Call, Critical Thinker, Ghost, Entrepreneur · Home Improvement, Renaissance Survivor, Made a Friend · Fortress (barricade 5), Compound Builder (8 blocks), Iron Body (fitness max), Dead Eye (marksmanship max) · Peak Condition (lv 25), Battle-Hardened, Quest Runner (5 quests), Trusted Trader (max vendor rep) · **Living Legend** and **Patient Zero** (+1 to all attributes) · Trust No One (defeat a turned companion, +1 PER) · Turncoat (make a double agent, +1 LCK).

Defined by the `ACHIEVEMENTS` array (with `check(s)`) and the `ACHIEVEMENT_ATTR_BONUS` map. Add to both.

---

## 10. Hosting and mobile

- Hosted as a static site (GitHub Pages) from `index.html`; works offline once loaded only if cached by the browser (no service worker yet).
- `<meta name="viewport">` is required for phone play and is checked by the regression suite. The layout is responsive by CSS only and has **not** been visually verified on a real phone.
- On a normal website the autosave lives in `localStorage`: clearing browser data erases it, and each device/browser has its own. Storage errors (quota, private mode) are swallowed so the game never breaks.

## 11. Testing (see `tests/README.md`)

Harness lessons that cost time before:
- Load saves through the `creationLoadInput` file input; capture saves by mocking `URL.createObjectURL` and clicking `btnSave`.
- To fast-forward timers, override `window.Date.now`, **then wait ≥1200 ms of real time** — the 1s render interval is what notices.
- Queues now persist, so a save containing an expired queue **does** complete on load. Offline credit is tested by loading a save into a session whose clock is spoofed ahead (`savedAt` is set just before load). Still prefer testing by starting the action, then saving/loading.
- Never assert on randomized data (a vendor's random stock, encounter rolls); verify formulas generically or fix the seed/position.
- Guard the "someone else's tile" case: the player's own world-map tile has no click handler.
- `smoketest`-style playthroughs and combat tests can flake on RNG; rerun before treating as a regression.
- Test bugs and game bugs look alike. Distinguish them before changing the game.


## Alpha (Phase 1: emergence)
- Emerges once, when the first claimed block completes (or on the first tick after loading a save that already has one). State: `s.alpha = { name, quietMs, intel, leak, detectMs, sabotageMs, agentMs }` or `null`; saved as `alpha`, sanitized and clamped on load.
- Name: `The <ADJ> <TITLE>` from `ALPHA_ADJECTIVES` x `ALPHA_TITLES`, seeded by `hash(7,7,seed)`.
- Quiet period `ALPHA_QUIET_MS` = 10 min of play time (tick gaps capped at 5s, so time away does not count).
- Escalation = 1 + (claimed >= 4) + (claimed >= 8). Active Alpha: attack chance x`ALPHA_ATTACK_CHANCE_MULT` (1.25), level + `ALPHA_LEVEL_BONUS[esc]` ([_,1,1,2]), horde size unchanged, repelled salvage x`ALPHA_SCRAP_MULT` (1.5). Flavor lines per escalation in `ALPHA_FLAVOR`.

## Alpha (Phase 2: turned recruits and double agents)
All timers are play time (accumulated in `tickAlpha`, paused during combat), stored on `s.alpha` so they survive save/load.
- **Turning:** only recruits made after emergence. Hidden `c.turned` set at recruit with `TURNED_CHANCE[esc]` = 10/15/20%. Existing roster members are never turned retroactively. **Partial tell:** 50% (`TURNED_TELL_CHANCE`) of turned recruits log one of `TURNED_TELLS` on joining; loyal recruits never do.
- **Detection:** every 3 min (`TRAITOR_DETECT_MS`), each hidden traitor rolls `min(50%, 4% + 3% x effective PER)` (7% at PER 1, 34% at PER 10). Success sets `c.suspicious`, logs "Something's off about <name>", shows SUSPICIOUS + Confront/Interrogate. No false positives: only turned companions can become suspicious.
- **Sabotage:** while the Alpha is active, every 5 min each turned companion has 25% to sabotage. Guard: 50/50 steal 10% scrap (min 1) or -5..10 integrity (always integrity if no scrap). Traveler: `c.hesitating` -> in the next fight they neither assist nor take hits ("hangs back"). After the 3rd sabotage they defect (leave with gear, leak +1). Every event names them.
- **Confront (suspect):** 70% hostile fight, 30% flee (gear kept by them, leak +1). **Dismiss (suspect):** same as flee. Dismissing an undetected traitor is a normal dismiss (no tell). **Suspects refuse to hand gear back** (card shows "refuses"; `takeGearFromCompanionId` enforces it); undetected traitors hand it back normally.
- **Traitor fight:** companion leaves the roster at once; enemy level `clamp(compLevel + esc, 1, 10)`, HP = their max HP, distance 3, speed 2. Win: their gear back, XP `level x 15`, `traitorsDefeated++` (not a zombie kill: no kill count, loot or fragments). Flee or death: they escape with gear, leak +1.
- **Interrogate (suspect):** success `min(70%, 25% + 5% x compLevel)` -> **double agent** (`c.doubleAgent`, flags cleared, `doubleAgentsTurned++`); failure -> traitor fight (no flee outcome). Only one double agent at a time.
- **Double agent:** while guarding, Alpha attacks are -1 level (`DOUBLE_AGENT_LEVEL_REDUCTION`, min 1). Every 5 min: +1 `s.alpha.intel` (spent in Phase 3), then 10% flip-back: leaves with gear, leak +2. **Release** (dismiss) is safe: gear back, no leak.
- **Leaks:** `s.alpha.leak` (cap 5) adds to the next Alpha-directed attack's level, then resets to 0.
- **Load validation:** no Alpha -> all spy flags cleared; at most one double agent; turned beats double agent; sabotage clamped 0..2; counters non-negative ints.
- Tests: `tests/alpha2_test.js` (66 checks).

## Audio (all procedural Web Audio; no asset files)
- **Engine:** one AudioContext created on the first user gesture; master (with soft limiter) -> sfx / music / ambience buses. Prefs `settings.audio` = master 0.6, sfx 0.7, music 0.35, ambience 0.5, muted, uiSounds; sanitized on load; older saves keep the session's prefs. Headless (no AudioContext) = silent no-op. Background tab suspends the context.
- **Phase A, SFX:** 20 effects (`SFX_DEFS`) wired to combat, damage, death, flee, progression, construction, crafting, aid, trade, Safehouse/Alpha events. 12-voice cap, ±8% pitch / ±10% gain variation (melodic stings exempt), 40ms same-sound dedupe.
- **Phase B, music:** mood from situation, never level: `haven` (Safehouse, 60bpm), `haven_alpha` (+ low pulse while the Alpha is active), `outskirts` (danger 1-2, 72), `hostile` (3-5, 84), `deadzone` (6+, 96), `combat` (120), `boss` (Patient Zero and traitor fights, 108), `fallen` (death: one fading tone, then silence), none on the creation screen. `render()` sets the target mood; a 25ms timer schedules 8th-note steps 120ms ahead on the audio clock (stall > 0.5s resyncs instead of bursting). Crossfade 2s, 0.5s into combat/boss. Key root (A1-E2), scale (aeolian/phrygian/harmonic minor/dorian) and 8-step motifs seeded from the world seed; per-session variation via random ornaments.
- **Phase B, ambience:** looped wind (bandpass noise), level 0.012 at the Safehouse, else `min(0.09, 0.02 + 0.008 x danger)`; Safehouse crackle; distant groans from danger 3 (12% / 22% at 6+ per 0.8-2.4s event window).
- Tests: `audio_test.js` (65), `music_test.js` (42), `browser_smoke_audio.js` (real Chromium, optional).

## Item art
- Embedded WebP, 256x256, generated by `tools/build_art.py` from `art-src/` + `tools/art_manifest.json` into `<script id="zp-art">` (`window.ZP_ART.items`, keyed by CATALOG name). Never hand-edit that block.
- At startup the game builds one stylesheet (`#zp-item-art`) with a class per image; cards carry only the class, so the 1s re-render never re-parses image data. Names not in CATALOG or not a base64 image data URI are ignored.
- `withItemArt(name, html)` adds a thumbnail to inventory, shop buy/sell, crafting (the output item) and equipment-slot cards; an item with no art renders unchanged.
- Budget: the whole game file under 3 MB (`art_test.js`). Batch 1 took it from 246 KB to 431 KB.
- Tests: `tests/art_test.js` (15).


## Player portrait
- **Add portrait** (creation screen and Survivor tab) lets the player pick their own PNG, JPEG, WebP or GIF. The browser centre-crops it to 3:4 (biased slightly toward the top, where heads are) and re-encodes it at 300x400 WebP (JPEG where WebP encoding is unavailable), about 40-70 KB. The original file is never stored.
- Shown in the Survivor tab (96x128), the stats panel (24x32 thumbnail) and the death screen (greyscale). Without one, the generated drawn face is used, as before. CHANGE / REMOVE in both places; REROLL LOOK hides while a picture is set.
- Saved as `portrait` (data URL or null) in save files and autosave. On load it must be a base64 WebP/JPEG/PNG data URL under 200,000 characters, or it is dropped (older saves have none). SVG and anything else are refused.
- Refused with a reason: non-image files, files over 15 MB, images under 60x80, undecodable files.
- Rendered through one generated stylesheet (`#zp-player-portrait`), so the 1s re-render carries only a class name.
- Player art is never embedded in index.html; each player adds their own.

## Title banner and sharing art
- The new-character screen opens with a 900x500 WebP banner (`ZP_ART.scenes.title`, built by `tools/build_art.py` from the `scenes` entry in the manifest). The crop sits below the source art's AI lettering; the title is real text. If the art is missing, the banner stays hidden.
- Link previews (Discord, Slack, texts): Open Graph and Twitter tags in index.html point at `og-image.jpg` (1200x630) in the repo root, an absolute URL on GitHub Pages. The game itself does not need the file.
- GitHub repo banner: `docs/social-preview.jpg` (1280x640), also the README header. Upload it once in the repo's Settings, Social preview.
- Both banners render from `tools/banner.html` with `node tools/build_banners.js`.
- Popup screens (`.overlay`) centre their card with `margin: auto` and scroll from the top when the card is taller than the screen. The old `align-items: center` made the top of the new-character card unreachable on phones.

## Combat face-off (Combat visuals Phase 1: art only)
- When the zombie in a fight has art, the combat card shows your portrait (or drawn face) VS the zombie's portrait in place of the crosshair. Distance, speed, level, HP and all actions are unchanged.
- Original zombie types (no stats), chosen per fight from where it started and the zombie's level, never from HP or distance:

| Area type | Types |
|---|---|
| Safehouse, Residential | Shambling Resident, Dead Jogger |
| Commercial | Office Drone, Lost Courier |
| Industrial | Site Worker, Lost Courier |
| Military | Riot Husk, Fallen Guardsman |
| Wasteland, or any zombie level 8+ | Feral, Bloater |
| More zombies queued | The Horde (the last one shows its own type) |
| Patient Zero | Patient Zero |
| Traitor | the traitor's own face (needs no art) |

- If a type has no art, its pool partner's art is used; a horde without horde art shows the zombie in front of you; with neither, combat looks exactly as before. Art: `enemies` in `tools/art_manifest.json`, 300x400 WebP in `ZP_ART.enemies`, one generated stylesheet (`#zp-enemy-art`).

## Character model (Phase A)
- **ADD CHARACTER MODEL** on the Survivor tab (next to EQUIPMENT SLOTS): any PNG, JPEG, WebP or GIF. The whole picture is fitted, not cropped, into 2:3 at 400x600 with see-through padding, so a tall full-body figure keeps its head and feet. Saved as WebP, which keeps PNG transparency; browsers that can't encode WebP fall back to JPEG without transparency. Usually 30-100 KB.
- With a model, the Survivor tab shows it in the middle with six slots around it: head, torso and hands on the left; weapon, pants and feet on the right. Each slot shows the item's art, its name and its stats. On phones under 520px the body sits on top with the slots two by two below. Without a model, the plain slot list stays.
- Saved as `bodyModel` (data URL or null), separately from `portrait`. On load it must be a base64 WebP/JPEG/PNG data URL under 400,000 characters, or it is dropped. CHANGE MODEL / REMOVE. Rendered through the `#zp-player-portrait` stylesheet (`.pp-body`).
- Phase B (not built): true equip/unequip layers on one original mannequin; see the roadmap.

## Tabs: Survivor and Squad
- Tab bar (keys 1-8): Field, **Survivor**, Crafting, Safehouse, Shop, **Squad**, Achievements, World Map.
- **Survivor** (was Inventory + Character): survivor record (portrait, name, level, attributes), equipment (slot list, or the character model with slots around it), the inventory with its category filters, and a collapsed AUDIO SETTINGS section.
- Tap a gear slot to filter the inventory to items that fit it (WEAPON = weapons, not throwables). A "showing HEAD gear / show all" chip appears; tapping the slot again, a category, or "show all" clears it. Filled armor slots have an **unequip** button; the weapon slot has none.
- **Squad** (was the roster on the Character tab): companions, auto-heal toggle, gear dropdowns, posts and suspects.
- Layout only: no save or gameplay change.

## Status header
- The top panel (on every tab) holds your face (72x96 desktop, 52x69 phone; portrait or drawn face; title-colour border at level 25), name, LV (title beside it at the cap; kills and turns in its tooltip), cash, scrap, the quest chip, HP/STAM/XP bars, the five attributes, and a compact gear line ("Pistol (Ammo 20) · DMG 30 · DEF 1 · GEAR 0/5", then WITH: companion and GUARDS: lines when they apply).
- Attributes show their effective value (green when gear or achievements add to it); the tooltip gives the description and the base value. With unspent points, each attribute gets a + button (disabled at 10) and "+N points to spend" shows, so points can be spent from any tab.
- Height: phone 171px (190px with points to spend), desktop about 125px; it was 196px. The header record only rebuilds when something in it changes.
- The Survivor tab keeps a one-line record (level, kills, turns, title progress) and the ADD/CHANGE PORTRAIT buttons above the gear.

## Header while scrolling
- Desktop (640px and wider): the status header is sticky, pinned at the top while the page scrolls.
- Phone: the header scrolls away normally; once it is off screen a 45px bar slides in at the top with your face and HP, STAM and XP (numbers inside). It hides again when the header comes back.

## Companion portraits
- 12 portrait slots from the Art Prompt Pack: men C1, C3, C6, C8, C9, C10, C12; women C2, C4, C5, C7, C11. Each NPC name carries a gender (14 women's names, 18 men's).
- A companion's slot = that gender's list[portraitSeed mod length], fixed for life: a slot without art shows the drawn face until its picture arrives, so faces never swap as art lands.
- Shown on the encounter card, roster cards (48x64) and the traitor face-off. Stored 240x320 WebP in `ZP_ART.companions`; one stylesheet (`#zp-companion-art`).
- Combat card: a **YOU** HP bar sits above Z-HP (the fight screen covers the header). At 25% HP or less it glows red.

## Scrap gear (crafted)
| Item | Slot | Stats | Recipe | Time | Level |
|---|---|---|---|---|---|
| Site Helmet | Head | 5 DEF, +5 HP, +1 PER | 2 Scrap Metal, 1 Duct Tape, 1 Cloth Strips | 30s | 2 |
| Scavenger Gas Mask | Head | 2 DEF, +2 END | 2 Empty Bottle, 2 Cloth Strips, 1 Duct Tape | 30s | 2 |
| Tire Pauldron | Torso | 10 DEF, +12 HP, −1 AGI | 4 Scrap Metal, 2 Duct Tape | 45s | 3 |
| Plate Bracers | Hands | 3 DEF, +1 STR | 2 Scrap Metal, 1 Duct Tape | 25s | 1 |
| Chain-Knuckle Gloves | Hands | 1 DEF, +1 STR, +1 AGI | 1 Work Gloves, 1 Scrap Metal | 20s | 1 |
| Scrap Shin Guards | Pants | 4 DEF, +6 HP | 2 Scrap Metal, 1 Duct Tape, 1 Cloth Strips | 30s | 1 |
- Recipes can carry `minLevel`; locked recipes show "Requires level N" and cannot start. Recipe cards show the slot and stats of what they make.
- Effective attributes never drop below 1 (gear penalties included); negative bonuses print as "−1 AGI".
- The gas mask has no gas to resist yet; a hook for Combat Phase 2 (e.g. Bloater gas).

## Room art (Safehouse tab)
- Room cards show a 72px thumbnail when the room has art (`ZP_ART.rooms`, 224x224 WebP, keyed by room id); unbuilt rooms show it greyed. Rooms without art render as before.
- All 7 rooms have art (Armory and Workshop cropped from the 9-card sheet; the other five single images).
- Spare cards from that sheet (Generator, Kitchen, Dorm, Comms, Storage) are kept in art-src/rooms/room-sheet-9.jpg as ideas for future rooms.

## Alpha portraits
- 12 portraits keyed by title (the last word of the Alpha's name). Shown on the Alpha Emergence screen (150x200), on the Safehouse ALPHA ACTIVE card (60x80), and in the face-off when an Alpha pack attacks the Safehouse (in place of the zombie type). Ordinary attacks still show zombie art; an unknown title shows no portrait.
- Stored 300x400 WebP in `ZP_ART.alphas`; one stylesheet (`#zp-alpha-art`). Matron's background station sign is blurred; the Bishop's scrap-plate mitre keeps its characters (designer's call: no state or real identifiers).

## Alpha Phase 3: the lair fight
- **Intel:** double agents (+1 per 5 min, as before) and, new, a 35% chance of +1 when you repel an Alpha pack at the Safehouse yourself.
- **Locate lair:** 3 intel (Alpha card button). The lair is fixed by world seed and Alpha count, 6-9 steps out; marked on both maps ("A") with a LAIR chip in the header.
- **Weaken:** 1 intel each, -10% Alpha HP, up to 3 (-30%).
- **Fight:** stepping into the lair starts it: the guard pack (a horde), then the Alpha (level shows ALPHA; boss music; face-off shows its portrait).

| Escalation | Guard pack | Alpha HP | Hits like | Speed | Distance |
|---|---|---|---|---|---|
| 1 | 2 x lvl 5 | 260 | lvl 7 | 5 | 8 |
| 2 | 3 x lvl 6 | 340 | lvl 8 | 5 | 8 |
| 3 | 4 x lvl 7 | 420 | lvl 10 | 6 | 8 |

- **Win:** +400 XP, +$300, +40 Scrap Metal, Pack Breaker (+1 END). Raids and recruit-turning stop; hidden spies come clean; the double agent stays on as an ordinary companion (+100 XP).
- **Death:** +1 leak, weakening lost, lair stays known. **Flee:** weakening lost, lair stays known.
- **Successor:** after 60 min of play (with at least one block held) a new Alpha with a different title emerges; +15% HP per Alpha killed, cap +45%.
- Balance (simulated, fire/advance only, no healing, 40-60 fights each): L10 mid gear vs escalation 1: 68% win; vs escalation 2: 3%; L18 full gear vs escalation 3: 28% solo, 97% with a companion. Escalation 3's hit level was raised 9 -> 10 after the first simulation (solo was 68%).
- Saves: `alpha.lair`, `alpha.weaken`, `alphaKills`, `alphaRespawnMs`, `lastAlphaName`, all clamped on load.

## Vendor job markers
- Minimap and world map mark vendors with jobs: amber "!" = job on offer, white "?" = job taken, green "?" = ready to hand in (fetch items in your pack, or bounty kills done). Your own cell shows "@" only; the shop panel shows the job there.
- The minimap tooltip and the world map sector panel name the job; both legends explain the markers.

## Factions (Phase 1)
- **Setting:** Factions Few / Normal / Many at creation. Few = Authority + Union; Normal adds the Rust Jackals; Many adds The Bloom. Saves from before factions load as Normal, all undiscovered.
- **Factions:** Continuity Authority (government remnant, Civil-Defense Bunker, President Adelaide Voss, start 0); Salvage Union (traders, Union Depot, Harlan Teague, +10); Rust Jackals (raiders, Tire Yard Fort, Kade "Gravel" Marrow, -30); The Bloom (secular cult that studies the infected, Greenhouse Clinic, Dr. Isolde Marsh, -20). Rivals: Authority vs Jackals, Union vs Bloom.
- **HQ sites:** derived from the world seed (never stored): each faction its own compass direction, 8-15 steps out (16 if nudged off a landmark or Patient Zero). Territory = Manhattan radius 2. Alpha lairs step off HQs.
- **Standing:** -100..+100. Hostile <= -60 (no trade or jobs; gifts still accepted), Wary -59..-20 (prices +25%, fetch jobs only), Neutral -19..19, Friendly 20..59 (prices -10%, first exclusive, zombie danger -1 in territory, min 1), Allied 60+ (prices -20%, second exclusive).
- **Changes:** faction job +8..12; every $50 spent at the HQ +1 (max +5 per hour); gift $25 = +1 (max 5 per hour); completing a claim inside their territory -15. Any gain costs the rival half as much. Hourly windows and the Bloom fragment restock are saved as time remaining.
- **HQ:** a danger-0 vendor sector with the faction panel (leader, standing bar, perks, gift button), faction stock, and jobs (60% chance per visit). Faction bounties count kills within 4 blocks of the HQ and pay standing instead of vendor reputation or bonus items.
- **Exclusives:** Authority: Reinforced Combat Vest $360 (Friendly), Precision Rifle $650 (Allied). Union: Trauma Kit $90 (Friendly), +15% sell prices (Allied). Jackals: always buy loot at +30%; Shotgun $145 (Friendly), 5 Molotovs $120 (Allied). Bloom: Painkiller and Energy Drink 5-packs (Friendly), Research Fragment $200 once per hour (Allied; only while the cure quest needs it).
- **Discovery:** entering their territory, or a 10% rumour on entering any ordinary vendor's sector. Discovered HQs show as a coloured H on both maps (even unvisited) with outlined territory.
- **Squad tab:** FACTIONS panel: discovered factions (leader, HQ, standing, agenda, unlocks, rival, jobs done) plus one "unknown faction" card per undiscovered one.
- **Test hook:** `window.__zpFactions`. Suite: `tests/factions_test.js`.

