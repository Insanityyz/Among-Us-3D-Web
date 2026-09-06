# Among Us 3D — Web

A single-file, browser-based tribute to **Among Us 3D**, built with **Three.js / WebGL2**.
It recreates the classic Among Us gameplay in full 3D: tasks, impostors, vents,
sabotages, emergency meetings, voting and ejection — all in one self-contained
`index.html` (embedded CSS + JavaScript, Three.js vendored inline).

## Play

Open **`index.html`** in a modern desktop browser (Chrome, Edge, Firefox, Safari).
No server or install required. The file is fully self-contained.

Live controls:

- **WASD / arrows** — move
- **Mouse** — look (click the scene once to lock the pointer; `Esc` to release)
- **E** — interact (do task, vent, report, fix sabotage, open panels)
- **Space / K** — kill (Impostor, when the kill button is ready)
- **V** — vent (Impostor, near a vent)
- **M** — Admin map toggle
- **C** — Security cameras
- **F** — toggle first-person / third-person camera
- **Esc** — close overlays / release pointer

Touch devices: left pad moves, right pad looks, the ✓/✕ buttons act.
Touch controls only appear on touch-screen devices.

## Implemented Among Us features

- Crewmate vs Impostor teams, randomly assigned roles
- 14-room Skeld-style ship with collidable walls, doors, vents, consoles
- 18+ interactive task minigames (Swipe Card, Fix Wiring, Calibrate Distributor,
  Clear Asteroids, Prime Shields, Submit Scan, Start Reactor, Unlock Manifolds,
  Chart Course, Clean O2 Filter, Upload/Download Data, Empty Garbage/Chute,
  Fuel Engines, Divert Power, Stabilize, Clean Vent, Align Engine …)
- Multi-stage tasks (Download → Upload, Cafeteria → Storage, Fuel → Engines …)
- Impostor kill cooldown, kill-by-click, and kill button
- Vent networks (teleport between linked vents)
- Sabotages: Lights, Reactor, O2, Communications, and Door locks
- Emergency meetings, reporting bodies, voting/skip, ejection with confirm-ejects
- Ghosts (translucent, pass through walls, still complete tasks)
- Admin map (live player dots) and Security cameras
- Task progress bar, room labels, and all win conditions

## Online-ready

Game logic sits in a deterministic module and an `ONLINE` flag (currently `false`)
with a stubbed `Net` interface, so a server-authoritative multiplayer layer can be
wired in later without rewriting the simulation.

## Building from source

Source is kept readable under `src/`:

```
src/
  mapdata.js     Skeld topology (rooms / corridors / vents / consoles)
  game_1.js      config, colors, utils, audio, input
  game_2.js      renderer, scene, textures, crewmate model
  game_3.js      3D map builder, collision, pathfinding, doors
  game_4.js      game core, task catalog, task minigames
  game_5.js      controls, interactions, sabotage, AI bots, loop
  game_6.js      meetings/voting, minimap, security cams, lobby, boot
  style.css      embedded UI styling
  build.mjs      bundles everything into index.html (inlines Three.js)
  test_shim.mjs  Node harness that drives the game loop for validation
```

Rebuild the deliverable after editing `src/`:

```bash
npm install three     # (only if you don't already have it installed)
node src/build.mjs
```

The build inlines `three.min.js` (looked up in `node_modules/three/`,
`/tmp/node_modules/three`, or `vendor/three/`) plus all sources into `index.html`.

## Validation

```bash
node --check src/game_1.js src/game_2.js  # etc. for each src file
node src/test_shim.mjs                     # runs a full simulated game
```
