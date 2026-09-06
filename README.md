# IMPOSTOR 3D

A **3D social-deduction party game** built for the browser, made as a loving homage to
*Among Us 3D* (the VR edition of Among Us) — played here as a normal desktop game with
keyboard + mouse, with touch controls that appear only on phones and tablets.

Everything ships as **one file**: [`index.html`](index.html) — HTML, CSS and ~315 KB of
JavaScript, no bundler, no build step at runtime, no assets to download.
Three.js (r161, ES module) is streamed from a CDN with two automatic fallbacks, and the
renderer runs on **WebGL2** with a custom post-processing chain.

> Unofficial fan-made tribute. Not affiliated with, endorsed by, or connected to InnerSloth.
> All art, code, map geometry, audio and text in this repository are original work; only the
> *idea* of crewmates/impostors is borrowed.

---

## Play it

Serve the folder and open it (any static server works):

```bash
python3 -m http.server 8000 --bind 0.0.0.0
# → http://localhost:8000/index.html
```

Opening `index.html` straight from disk also works in most browsers, but a local server is
the reliable path (module scripts + `localStorage` are happiest over `http://`).
An internet connection is required the first time so Three.js can be fetched from the CDN.

**Main menu →** `Play` drops you into a 10-player match with 9 CPU crewmates,
`Free Play` gives you a ship with no impostors, `Lobby` opens every match setting.

---

## Controls

### Desktop (keyboard + mouse)

| Action | Key |
| --- | --- |
| Move | `W A S D` / arrow keys |
| Look | Mouse (click the ship once to capture the pointer) |
| Use console / task / exit vent | `E` or `Space` |
| Report a body | `R` |
| Kill *(impostor)* | `Q` |
| Vent / leave vent *(impostor)* | `V` |
| Sabotage map *(impostor)* | `B` |
| Ship map | `M` |
| Task list | `Tab` |
| First / third person | `F` |
| Pause & settings | `Esc` |
| Chat *(in meetings)* | `C` or `Enter`, then type |
| Quick-chat lines *(in meetings)* | `1` … `9` |

### Touch (only appears on touch devices)

* Left thumb zone — floating joystick.
* Right side — drag anywhere to look.
* Bottom-right — the same Use / Report / Kill / Vent / Sabotage buttons as desktop, resized
  for thumbs and with the keyboard hints hidden.
* Top-left — map, task list, view toggle.
* Task minigames accept **hold-to-complete** gestures (press and hold inside the panel).

The touch layer is created by feature detection (`pointer: coarse` + `maxTouchPoints`), so a
desktop machine with a touchscreen still gets the mouse/keyboard UI.

---

## What is implemented

**Roles & win conditions** — Crewmates and Impostors (1–3), full win-condition set:
all tasks complete, all impostors ejected, too few crewmates left, and both critical
sabotages timing out. Dead players become ghosts: invisible to the living, able to walk
through walls, and still able to finish their own tasks for the crew task bar.

**Tasks** — 19 task types across 63 consoles, with the real Skeld behaviours:
common tasks (Swipe Card, Fix Wiring at three locations), multi-stage long tasks
(Align Engine Output, Fuel Engines, Empty Chute, Empty Garbage, Divert Power, Upload Data),
short tasks, and **visual tasks** (Submit Scan, Prime Shields, Clear Asteroids, Empty Chute/Garbage)
that other players can watch. Every minigame is an interactive panel, not a progress bar:
drag-to-connect wiring, swipe-card speed check, Simon-style reactor sequence, manifold
number order, distributor rotor, chart-course steering, asteroid turret, hex shield grid,
sample inspection, med-bay scan, leaf-filter cleaning, light switches, hold-to-fuel, and more.
Impostors get a fake task list and cannot complete anything.

**Sabotage** — Reactor Meltdown and Oxygen Depleted (critical, 45 s timers, two-console
repairs: two handprint scanners for the reactor, a 6-digit code entered at both O2 and Admin),
Lights Out (crew vision collapses, emergency lighting, impostors see normally),
Comms Sabotaged (Admin table, Vitals and Security cameras all go to static until repaired),
and **per-room door sabotage** — pick a room on the sabotage map and only that room's doors
slam shut for 12 s, exactly like the real ship. Doors can also be opened by hand.

**Vents** — 14 vents in 6 interconnected networks, with the real Skeld topology
(Cafeteria↔Admin↔Hallway, Navigation↔Weapons, Navigation↔Shields, Electrical↔Security↔MedBay,
both Engines↔Reactor). Impostors get an in-vent view, a tunnel picker showing linked vents,
and a vent puff other players can see.

**Meetings** — Dead-body reports and the emergency button (limited uses, cooldown, blocked
during critical sabotages), discussion timer → voting timer → tally → ejection.
Anonymous votes, confirm-ejects, skip handling, ties, ghost chat (dead players only hear each
other), quick-chat and free text, CPU players accusing each other based on what they actually
witnessed through line-of-sight.

**Ejection** — a full 3D cutscene: the ship disappears, the ejected crewmate tumbles away into
space under its own lighting rig while the camera drifts after it, then the
"…was/was not An Impostor. N Impostors remain." card. Click to skip.

**Ship systems you can watch** — Admin map table with live player dots, Vitals monitor with
per-colour life signs, four Security CCTV cameras rendered from real in-world viewpoints into
a grayscale, noisy, scanlined feed, plus a hand-drawn ship map overlay used by the `M` key,
the Admin table and the impostor sabotage screen.

**Presentation** — procedural textures for every surface (no image files), merged geometry
batches, per-room point lights with baked vertex-colour ambient occlusion, blob shadows,
PMREM studio reflections, fog-based vision cones, and a custom post chain:
ACES tone-mapping, sRGB encode, two-mip separable bloom, vignette, chromatic aberration,
film grain, sabotage pulse and hit flashes. All audio is synthesised at runtime
(WebAudio) — footsteps, vents, doors, kill stings, meeting alarms, ejection, win fanfares.

**CPU crewmates** — a full bot AI: pathfinds the room graph, opens doors, walks to its own
task list, works for a realistic duration, wanders between chores, and — for impostor bots —
stalks isolated targets, kills out of line-of-sight, vents away afterwards and sabotages to
create alibis. Bots vote using suspicion scores built from what they genuinely saw.

**Settings** — lobby: map, max players, bots, impostors, crew/impostor vision, player speed,
kill cooldown & distance, sabotage cooldown, emergency cooldown & count, discussion/voting time,
anonymous votes, confirm ejects, common/long/short task counts, visual tasks, task-bar update
mode. In-game: sensitivity, invert-Y, FOV, head bob, screen shake, first/third person,
quality (low/medium/high), bloom, FPS counter, master/SFX/music volume.
Your name, colour, visor and preferences persist in `localStorage`.

---

## Online multiplayer: built for it, switched off

Networking is a single seam — `NET` — and the whole game already talks through it:

```js
const NET = {
  ENABLED: false,                 // ← the only switch
  URL: 'wss://your-relay.example.com/amongus3d',
  ...
};
```

* **Local play (default)** uses `LoopbackTransport`: the authoritative `Server` object lives in
  the same tab, client intents go in through `NET.send()`, state events come back through
  `NET.on()`. Nothing is trusted from the client — movement, kills, tasks, votes, sabotages and
  win conditions are all resolved server-side.
* **Online play** uses `WsTransport`, the same message shapes over a WebSocket. Flipping
  `NET.ENABLED` to `true` and pointing `NET.URL` at a relay that broadcasts messages to a room
  is all the client needs; the relay itself (rooms, auth, heartbeat, reconnection,
  host migration) is deliberately **not** included in this build, which is why online mode is
  disabled rather than half-working.

Protocol (client → server): `move`, `use`, `taskStage`, `kill`, `vent`, `report`, `emergency`,
`sabotage`, `fixSab`, `door`, `vote`, `chat`, `leave`.
Server → client: `role`, `start`, `taskbar`, `taskProgress`, `deny`, `use`, `kill`, `bodies`, `vent`,
`sab`, `sabUpdate`, `sabEnd`, `sabTimeout`, `doors`, `meeting`, `meetingTimer`, `votePhase`,
`vote`, `voteResult`, `eject`, `resume`, `gameover`, `chat`, `left`.

---

## Repository layout

The shipped artefact is `index.html`. It is generated by concatenating readable source parts:

```
index.html              the whole game (single file, committed)
.build/
  00_head.html          <head>, meta, favicon
  10.css                all styling
  20_body.html          DOM skeleton + SVG icon symbols
  30_logic.js           pure game logic: map data, geometry, rooms, doors, vents, tasks, settings
  40_three.js           Three.js bootstrap, procedural textures, renderer, post-processing chain
  41_ship.js            ship construction, materials, consoles, décor, crewmate factory
  50_player.js          input, pointer lock, touch, collision, camera rig, interaction targeting
  60_server.js          NET transports, authoritative Server, bot AI
  65_audio_fx.js        WebAudio synth, particle FX, scripted visual tasks, screen flashes
  70_tasks.js           task modal manager + all 32 minigame panels
  80_meeting.js         meetings, voting, chat, 3D ejection cutscene, camera director
  90_ui.js              menus, HUD, settings, ship map, in-world Admin/Vitals/Security screens
  95_game.js            match flow, client event handling, entity sync, lighting/vision, actions
  99_main.js            boot sequence + main loop
  assemble.js           concatenates the parts into ../index.html and syntax-checks the result
  stub_env.js           headless Three.js + DOM stubs (tests only)
  smoke.js              boots the game and drives a scripted match (tests only)
  soak.js               plays whole matches to completion, all win conditions (tests only)
  test_logic.js         pure-logic assertions on the map/task/vent data (tests only)
  probe.js, probe2.js   map / nav-graph / window geometry inspectors (tests only)
  probe3.js             room bounding-box + spawn inspector (tests only)
```

### Rebuild

```bash
cd .build && node assemble.js      # regenerates ../index.html and runs node --check on it
```

### Test (no browser, no network needed)

```bash
cd .build
node test_logic.js 30_logic.js     # map/task/vent logic assertions
node smoke.js                      # boot + panels + sabotages + meetings + kills + ghosts + UI
node soak.js                       # 7 full matches to a winner, varied settings
node probe.js                      # nav-graph, reachability and window/door geometry report
```

Current status of those suites: **all logic checks pass**, the smoke test completes with
**no runtime errors** (boot, 32 minigame panels, every sabotage type and repair, emergency and
reported meetings, voting, ejection, kill → body → report, ghost mode, map/settings/lobby
screens, all three quality levels), and the soak test finishes **every match** across all four
win conditions with no stalls.

---

## Technical notes

* **One draw-call budget, no shadow maps.** Real-time shadows are replaced by blob shadows,
  vertex-colour AO and emissive trim, which keeps a 60 fps budget on integrated GPUs.
  Wall and floor batches are merged at build time; the ship is one static set of meshes.
* **Vision is fog.** `crewVision` / `impostorVision` map to exponential fog density, and a
  Lights sabotage tightens it dramatically for crew while impostors keep a clear view — the
  same trick the original game uses, expressed in 3D.
* **Colour management is manual.** The renderer outputs linear-sRGB with no tone mapping and
  the composite pass does ACES + sRGB itself, so bloom, vignette, grain and flashes happen in
  the right space.
* **Wall suppression.** Rooms are authored as polygons; shared edges become walls, door openings
  and windows automatically. Nav-graph nodes are placed at opening midpoints, and any node whose
  midpoint would land inside solid geometry is discarded in favour of a walkable one — that keeps
  CPU crewmates from pathing into walls. Bots additionally carry a stuck watchdog that slides
  around an obstacle and, as a last resort, steps through it.
* **Deterministic-ish simulation.** The server owns a seeded RNG, so tasks, roles, sabotage codes
  and bot decisions are reproducible from a seed.
