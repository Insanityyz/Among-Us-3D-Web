import { readFileSync, writeFileSync, existsSync } from 'fs';
const R='src/', OUT='index.html';
// Resolve Three.js from a few locations so the repo is rebuildable (index.html is
// already self-contained; this is only needed for re-building).
const candidates = [
  '/tmp/node_modules/three/build/three.min.js',
  'node_modules/three/build/three.min.js',
  '../node_modules/three/build/three.min.js',
  'vendor/three/three.min.js',
];
const threePath = candidates.find(p=>existsSync(p));
if(!threePath){ console.error('Could not find three.min.js (npm i three, or vendor it at vendor/three/three.min.js)'); process.exit(1); }
const three = readFileSync(threePath,'utf8');
console.log('using three from', threePath);
const css   = readFileSync(R+'style.css','utf8');
const js = [
  R+'mapdata.js',
  R+'game_1.js',
  R+'game_2.js',
  R+'game_3.js',
  R+'game_4.js',
  R+'game_5.js',
  R+'game_6.js',
].map(f=>readFileSync(f,'utf8')).join('\n\n/* ---- */\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05090c">
<title>Among Us 3D — Web</title>
<style>
${css}
</style>
</head>
<body>
<canvas id="game"></canvas>

<!-- overlay hub -->
<div id="hud">
  <div id="topbar">
    <div class="chip"><div class="k">Player</div><div class="v" id="chipName">—</div></div>
    <div class="chip"><div class="k">Role</div><div class="v" id="chipRole">—</div></div>
    <div class="chip"><div class="k">Tasks</div><div class="v" id="taskPct">0/0</div></div>
    <div class="chip" id="killChip"><div class="k">Kill</div><div class="v" id="killCd">—</div></div>
  </div>
  <div class="taskbarwrap">
    <div class="taskbar"><div class="fill" id="taskBarFill"></div></div>
  </div>
  <div id="roomLabel"></div>
  <div id="crosshair"></div>

  <div id="minimap">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span class="smallcap">Admin Map</span><span class="mmClose muted" style="cursor:pointer">✕</span>
    </div>
    <svg id="mmSvg"></svg>
  </div>

  <div id="toast"></div>
  <div id="prompt"></div>
  <div id="cooldown">
    <svg viewBox="0 0 70 70">
      <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="6"/>
      <circle class="cdRing" cx="35" cy="35" r="28" fill="none" stroke="#ff5b5b" stroke-width="6"
        stroke-dasharray="176" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 35 35)"/>
    </svg>
    <div class="cdNum" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:#ff8f6a">0</div>
  </div>

  <div id="bottom">
    <div id="taskList">
      <h3>Tasks <span id="tlCount" class="muted" style="float:right"></span></h3>
      <div id="taskItems"></div>
    </div>
    <div id="actions">
      <button class="btn ghost small hidden" id="useBtn">Use</button>
      <button class="btn danger small hidden" id="killBtn">Kill</button>
    </div>
  </div>
</div>

<!-- touch -->
<div id="touch">
  <div id="joystick"><div id="joyKnob"></div></div>
  <div id="lookpad"><div id="lookKnob"></div></div>
  <div id="touchBtns">
    <div class="tbtn" data-act="use">✓</div>
    <div class="tbtn" data-act="kill">✕</div>
  </div>
</div>

<!-- lobby -->
<div id="lobby" class="overlay">
  <div class="card">
    <h1>AMONG US 3D</h1>
    <div class="tagline">A Three.js / WebGL2 tribute to Among Us 3D</div>
    <div class="section">Set Up Your Crew</div>
    <div class="field"><label class="smallcap">Your Name</label><input type="text" id="inName" maxlength="12"></div>
    <div id="lobbyColor"></div>
    <div class="row">
      <div class="field"><label class="smallcap">Players</label><input type="number" id="inPlayers" min="4" max="10" value="7"></div>
      <div class="field"><label class="smallcap">Impostors</label><input type="number" id="inImpostors" min="1" max="3" value="1"></div>
    </div>
    <div class="row">
      <div class="field"><label class="smallcap">Tasks / Player</label><input type="number" id="inTasks" min="3" max="10" value="5"></div>
      <div class="field"><label class="smallcap">Emergency Meetings</label><input type="number" id="inEmergency" min="0" max="5" value="3"></div>
    </div>
    <div class="toggleline"><input type="checkbox" id="inEjects" checked><label for="inEjects">Confirm Ejects</label></div>
    <div class="center"><button class="btn primary" id="startBtn">Play</button></div>
    <div class="muted center" style="margin-top:12px">
      Controls: <b>WASD</b> move · <b>Mouse</b> look (click to lock) · <b>E</b> interact · <b>Space/K</b> kill (Impostor) · <b>V</b> vent (Impostor) · <b>M</b> admin · <b>C</b> cams · <b>F</b> first-person · <b>Esc</b> release/fullscreen.
      On touch: left pad moves, right pad looks, buttons act.
    </div>
  </div>
</div>

<!-- role reveal -->
<div id="roleModal" class="hidden">
  <div class="rolecard">
    <div class="smallcap" style="text-align:center">You are</div>
    <div class="big"></div>
    <div class="roleD"></div>
  </div>
</div>

<!-- meeting -->
<div id="meeting">
  <div id="meetingCard">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="smallcap" id="meetingTitle">A body was reported</div>
      <div style="font-size:28px;font-weight:900;color:#ff5b5b" id="mTimer">25</div>
    </div>
    <div class="muted" id="meetingSub">Discuss, then vote.</div>
    <div id="voteList" style="margin-top:12px"></div>
    <div class="section" style="margin-top:16px">Votes</div>
    <div class="voteAvatars"></div>
    <div class="center"><button class="btn ghost small" id="skipBtn">Skip (auto-close votes)</button></div>
    <div id="ejectCard" style="margin-top:8px"></div>
  </div>
</div>

<!-- security -->
<div id="security">
  <div id="securityCard">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span class="smallcap" style="color:#7fd0ff">● SECURITY FEED</span>
      <button class="btn ghost small" id="secClose">✕ Close</button>
    </div>
    <canvas id="securityScreen"></canvas>
    <div class="recDot">● REC</div>
  </div>
</div>

<!-- game over -->
<div id="endOverlay" class="overlay hidden">
  <div class="card" style="text-align:center">
    <h1 id="endTitle">VICTORY</h1>
    <div id="endSub"></div>
    <div class="center"><button class="btn primary" id="endPlay">Back to Lobby</button></div>
  </div>
</div>

<script>
${three}
</script>
<script>
${js}
</script>
</body>
</html>`;
writeFileSync(OUT, html);
console.log('wrote', OUT, html.length, 'bytes');
