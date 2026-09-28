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
- **Autosave:** attempted every 15s through `window.storage` (only exists in the Claude artifact environment). Manual save/load is a `.json` download/upload.
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

## 9. Achievements (27)

Each grants a permanent attribute bonus applied in every derived-stat calculation: First Blood, Exterminator, Zombie Slayer (kills) · Apocalypse Veteran (100 kills, +2 STR) · Scout, Explorer, Pathfinder (sectors) · Survivor (lv 5), Wasteland Legend (lv 10, +2 END), Nine Lives · Close Call, Critical Thinker, Ghost, Entrepreneur · Home Improvement, Renaissance Survivor, Made a Friend · Fortress (barricade 5), Compound Builder (8 blocks), Iron Body (fitness max), Dead Eye (marksmanship max) · Peak Condition (lv 25), Battle-Hardened, Quest Runner (5 quests), Trusted Trader (max vendor rep) · **Living Legend** and **Patient Zero** (+1 to all attributes).

Defined by the `ACHIEVEMENTS` array (with `check(s)`) and the `ACHIEVEMENT_ATTR_BONUS` map. Add to both.

---

## 10. Hosting and mobile

- Hosted as a static site (GitHub Pages) from `index.html`; works offline once loaded only if cached by the browser (no service worker yet).
- `<meta name="viewport">` is required for phone play and is checked by the regression suite. The layout is responsive by CSS only and has **not** been visually verified on a real phone.
- `window.storage` (autosave) only exists inside the Claude artifact environment. On a normal website there is **no automatic save** yet — the player must use SAVE GAME / LOAD GAME (`.json`). See ROADMAP D3.

## 11. Testing (see `tests/README.md`)

Harness lessons that cost time before:
- Load saves through the `creationLoadInput` file input; capture saves by mocking `URL.createObjectURL` and clicking `btnSave`.
- To fast-forward timers, override `window.Date.now`, **then wait ≥1200 ms of real time** — the 1s render interval is what notices.
- Queues now persist, so a save containing an expired queue **does** complete on load. Offline credit is tested by loading a save into a session whose clock is spoofed ahead (`savedAt` is set just before load). Still prefer testing by starting the action, then saving/loading.
- Never assert on randomized data (a vendor's random stock, encounter rolls); verify formulas generically or fix the seed/position.
- Guard the "someone else's tile" case: the player's own world-map tile has no click handler.
- `smoketest`-style playthroughs and combat tests can flake on RNG; rerun before treating as a regression.
- Test bugs and game bugs look alike. Distinguish them before changing the game.
