# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asteroids clone in plain HTML5 Canvas + vanilla JS (ES6+). No dependencies, bundler, linter, or test suite. The README and UI text are in Spanish; keep new user-facing strings and comments in Spanish for consistency.

## Running

Open `index.html` in a browser, or serve locally:

```bash
npx serve .   # http://localhost:3000
```

## Architecture

All game logic lives in `game.js` (single script, `'use strict'`, globals — no modules). `index.html` only provides the 800×600 `#canvas` (`W`/`H` constants in `game.js` must match it).

- **Loop**: `loop(ts)` → `update(dt)` → `draw()` via `requestAnimationFrame`. `dt` is in seconds and clamped to 0.05.
- **State machine**: global `state` is `'playing' | 'dead' | 'gameover'`. `update()` branches on it; `'dead'` is a 2s respawn timer (`deadTimer`) during which asteroids/particles keep moving, `'gameover'` waits for Space to call `initGame()`.
- **Entities** (`Bullet`, `Asteroid`, `Ship`, `Particle`) each have `update(dt)`/`draw()` and a `dead` flag; dead entities are removed by array `.filter` in `update()`. Collisions are circle-based using `radius` and `dist()` (ship vs asteroid uses `a.radius * 0.82`).
- **World is toroidal**: positions use `wrap()` at the edges (particles are not wrapped).
- **Input**: `keys` (held) and `justPressed` (edge-triggered, consumed by `pressed(code)`). Use `pressed()` for one-shot actions like firing; read `keys[...]` for continuous ones.
- **Asteroid sizes** are 1–3, indexed into `RADII`, `SPEEDS`, `POINTS` arrays (index 0 unused). `split()` spawns two of `size - 1`. Levels spawn `3 + level` size-3 asteroids away from screen center (`SAFE_DIST`); `nextLevel()` resets the ship and clears bullets.

Note: the README mentions power-ups and "estrella fugaz" asteroids, but these are not implemented in `game.js`.
