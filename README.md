# Zombie Pandemic: Protocols

A browser-based zombie survival RPG in a single self-contained HTML file. No installs, no accounts, no external assets.

**Play:** https://skulldrag34.github.io/zombie-pandemic-protocols/

Explore an endless wasteland, scavenge, fight, recruit survivors, and build up a Safehouse compound. Danger scales with how far you travel from home, not with your level. Find the source of the outbreak and cure it.

## Playing on phone or computer

- Works in any modern browser. On Android (Chrome): menu → **Add to Home screen** for an app-style shortcut.
- **Autosave (per device).** The game saves to this browser every 15 seconds and whenever you switch away or close the tab. The title screen offers **CONTINUE THIS SURVIVOR**. Clearing browser data erases it, and each device/browser keeps its own save.
- **Moving between devices.** Use **SAVE GAME** to download a `.json` file and **LOAD GAME** on the other device. Keep the file in a cloud drive.
- Time away counts: crafting and construction keep running while you're gone, and stamina, Garden and outpost income are credited for up to 8 hours.

## Controls

Arrow keys / N S E W move · F scavenge · H use aid item · R rest · 1–8 switch tabs. Every action also has an on-screen button.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The entire game |
| `docs/GAME_DESIGN.md` | Systems, formulas and constants as implemented |
| `docs/ROADMAP.md` | Status, open issues and plans |
| `tests/` | Headless JSDOM test suites (`cd tests && npm install && npm test`) |

## Originality

All code, names, text and visuals are original. Inspired by the survival-RPG genre generally; no assets, art, text or UI from any existing game are used.
