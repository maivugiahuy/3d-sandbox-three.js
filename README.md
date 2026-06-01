# 3D Sandbox

Garry's Mod-inspired 3D physics sandbox built with [Three.js](https://threejs.org/) + [Rapier](https://rapier.rs/). First-person controls, spawnable props, a gravity gun with multiple interaction modes, and a fully configurable environment. No build step — vanilla ES modules served over HTTP.

## Run

```
npm install
npm start
```

Opens on `http://localhost:3000`. Click to enter pointer lock. Uses `npx serve .` — directory listing must stay enabled so asset folders auto-scan.

## Controls

### Movement
| Key | Action |
|-----|--------|
| `WASD` | Move |
| `Mouse` | Look |
| `Space` | Jump (coyote time + buffer) |
| `Shift` | Sprint |
| `Esc` | Release cursor |

### General
| Key | Action |
|-----|--------|
| `Scroll` | Cycle gravity-gun mode (when not holding) |
| `Q` (hold) | Open spawn menu — scroll to pick, release to spawn |
| `V` | Toggle fly mode (Space up · Ctrl down · no gravity/collision) |
| `Z` | Undo last action |
| `Alt` (in menu) | Unlock cursor to drag sliders |

### Gravity-gun modes (scroll to cycle)
| Mode | M1 | M2 |
|------|----|----|
| **Freeze** | Grab | Toggle freeze |
| **Shoot** | Grab | Launch at high speed |
| **Translate** | Select — Alt+drag X/Y/Z to reposition | — |
| **Rotate** | Select — Alt+drag X/Y/Z to rotate | — |
| **Scale** | Select — Alt+drag X/Y/Z to scale per-axis | — |
| **Paint** | Select — pick color or texture | — |
| **Sun** | Elevation + azimuth sliders | — |
| **Animate** | Select — preset (spin/bob/orbit) or record keyframes | — |

## Configuration

All game constants live in [`config.json`](config.json), loaded once at startup. Sections:

- `player` — movement, capsule, slope angles, jump timing, FOV
- `physics` — gravity
- `gravityGun` — spring, hold distance, sensitivities, scale limits
- `environment` — sky, fog, shadows
- `water` — pool geometry, position, bounds

Changing values requires a page reload.

## Assets

Asset folders **auto-scan** via the dev server's directory listing — no manifest files.

- `assets/maps/` — `.glb`/`.gltf` maps. Populates the map dropdown on the start overlay. A built-in **physic_test** map (ramps, stairs, platforms, half-pipe, bridge, drop tower) is always available.
- `assets/models/` — `.glb`/`.gltf` spawnable props. Appended to the spawn menu under "Models".
- `assets/textures/` — paint-mode textures. PNGs get alpha support.

Drop files in or out, then reload.

## Architecture

Entry point: `index.html` → `src/main.js`. Modules (imports flow downward):

```
main.js
├── config.js     fetches config.json (top-level await)
├── scene.js      Three.js scene, camera, renderer, sky, water, controls
├── physics.js    Rapier world, player capsule, character controller, fly mode
├── props.js      prop registry, spawn fns, model loading, colliders, buoyancy, ground snap
├── gravitygun.js mode system, grab/shoot/freeze, gizmos, animations, undo, HUD
├── spawnmenu.js  Q-hold spawn menu (primitives + scanned models)
└── configmenu.js Alt-drag slider panels (transform/paint/sun/animate)
```

Dependencies (`three`, `@dimforge/rapier3d-compat`) load via import map in `index.html`. No bundler.

## License

ISC
