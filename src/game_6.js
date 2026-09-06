/* ============================================================= MEETINGS / UI / MAPS / CAMERAS / BOOT */

// override isActive to also freeze during security-cam view
function isActive(){ return Game.state==='playing' && !Game.taskModalOpen && !Game.meeting.active && !Game._secOpen; }

/* ----------------------------------------------- MEETING + VOTING */
const Meeting = {
  reset(reportPlayer){
    this.reportPlayer=reportPlayer; this.timer=25;
    this.votes = Game.meeting.votes = {};
    this.phase='discuss'; this.doneVoting=false; this.ejected=null; this._lockScheduled=false;
    Game.meeting.round=(Game.meeting.round||0)+1;
  },
  update(dt){
    this.timer-=dt;
    const tl=$('#mTimer'); if(tl) tl.textContent=Math.ceil(Math.max(0,this.timer));
    if(this.timer<=0 && !this.doneVoting) this.lockVotes();
  },
  cast(id,who){
    this.votes[who]=id; Sfx.vote();
    renderMeetingVotes();
    if(who===Game.local.id && !this.doneVoting && !this._lockScheduled){
      this._lockScheduled=true;
      setTimeout(()=>{ if(!this.doneVoting && Game.state==='meeting') this.lockVotes(); }, 2600);
    }
  },
  lockVotes(){
    if(this.doneVoting) return;
    this.doneVoting=true;
    // bots resolve any uncast votes
    Game.players.forEach(p=>{ if(p.isDead) return; if(this.votes[p.id]===undefined) this.votes[p.id]=botVote(p); });
    const counts={}; let skip=0;
    Object.values(this.votes).forEach(v=>{ if(v==='skip') skip++; else counts[v]=(counts[v]||0)+1; });
    let max=0, maxId=null, tie=false;
    Object.entries(counts).forEach(([id,c])=>{ if(c>max){max=c;maxId=Number(id);tie=false;} else if(c===max) tie=true; });
    let ejected=null;
    if(!tie && maxId!=null && max>skip) ejected=Game.players.find(p=>p.id===maxId);
    this.ejected=ejected;
    const tl=$('#mTimer'); if(tl) tl.textContent='RESULTS';
    renderMeetingVotes();
    disableVoting();
    if(ejected){ showEjectCard(ejected); setTimeout(()=>{ hideEjectCard(); this.finish(); }, 2600); }
    else { setTimeout(()=>this.finish(), 1500); }
  },
  finish(){
    const e=this.ejected;
    if(e){
      if(!e.isDead){ e.isDead=true; e.isGhost=true; convertToGhost(e); Sfx.ejection(); }
    }
    hideMeeting();
    endMeetingRound();
  }
};
function disableVoting(){ document.querySelectorAll('#meetingCard .pname').forEach(p=>{ p.style.pointerEvents='none'; p.style.opacity=.55; }); const sk=$('#skipBtn'); if(sk) sk.style.pointerEvents='none'; }
function botVote(p){
  const living=Game.players.filter(o=>!o.isDead && o!==p);
  if(!living.length) return 'skip';
  if(p.isImpostor){ const crews=living.filter(o=>!o.isImpostor); return crews.length? String(pick(crews).id):'skip'; }
  const imps=living.filter(o=>o.isImpostor);
  if(Math.random()<0.35 && imps.length) return String(pick(imps).id);
  return String(pick(living).id);
}

function showMeeting(title){
  const m=$('#meeting'); m.classList.add('on');
  $('#meetingTitle').textContent=title;
  $('#mTimer').textContent='25';
  $('#meetingSub').textContent='Discuss, then vote. Wait for the timer or vote to skip.';
  const list=$('#voteList'); list.innerHTML='';
  // order: report source highlight
  const players=Game.players.slice();
  players.forEach(p=>{
    const row=el('div','pname'+(p.isDead?' voted':''),`<span class="dot" style="background:${p.css};${p.isImpostor&&Game.local.isImpostor?'outline:2px solid #ff5b5b':''}"></span><span>${p.isDead?'💀 ':''}${p.name}</span><span class="voteCount" style="margin-left:auto"></span>`);
    row.dataset.id=p.id;
    row.addEventListener('click',()=>{ if(Game.meeting.doneVoting||p.isDead) return; if(p===Game.local){ toast("You can't vote for yourself",'warn'); return; } Meeting.cast(String(p.id), Game.local.id); });
    list.appendChild(row);
  });
  const skip=el('div','pname',`<span class="dot" style="background:transparent"></span><span>Skip Vote</span><span class="voteCount" style="margin-left:auto"></span>`);
  skip.id='skipRow';
  skip.addEventListener('click',()=>{ if(Game.meeting.doneVoting) return; Meeting.cast('skip',Game.local.id); });
  list.appendChild(skip);
  enableVoting();
  $('.voteAvatars').innerHTML='';
}
function enableVoting(){
  document.querySelectorAll('#meetingCard .pname').forEach(p=>{ p.style.pointerEvents='auto'; p.style.opacity='1'; });
  const sk=$('#skipBtn'); if(sk) sk.style.pointerEvents='auto'; if(sk) sk.style.opacity='1';
}
function renderMeetingVotes(){
  const counts={}; let skip=0;
  Object.values(Game.meeting.votes).forEach(v=>{ if(v==='skip') skip++; else counts[v]=(counts[v]||0)+1; });
  document.querySelectorAll('#voteList .pname').forEach(row=>{
    const id=row.dataset.id;
    const n= id==='skip'? skip : (counts[id]||0);
    const vc=row.querySelector('.voteCount'); if(vc) vc.textContent=n? '×'+n : '';
    const vA=$('.voteAvatars');
  });
  // avatar tray
  const vA=$('.voteAvatars'); if(vA){ vA.innerHTML='';
    Object.entries(counts).forEach(([id,n])=>{ const p=Game.players.find(x=>x.id===Number(id)); if(p){ const d=el('span','dot'); d.style.cssText=`width:16px;height:16px;border-radius:50%;background:${p.css};box-shadow:0 0 0 2px rgba(255,255,255,.2)`; d.title=n+' votes'; vA.appendChild(d); } });
    if(skip){ const d=el('span','dot'); d.style.cssText='width:16px;height:16px;border-radius:50%;background:#556;box-shadow:0 0 0 2px rgba(255,255,255,.2)'; d.title=skip+' skips'; vA.appendChild(d); }
  }
}
function showEjectCard(p){
  const c=$('#ejectCard'); c.classList.add('show');
  c.innerHTML = `<div class="eject">${p.name} was ejected.</div>`;
  if(Game.settings.confirmEjects){ const role=p.isImpostor?'IMPOSTOR':'CREWMATE'; c.innerHTML += `<div class="muted" style="text-align:center">They were ${p.isImpostor?'<span style="color:#ff5b5b">an Impostor</span>':'<span style="color:#5be78b">a Crewmate</span>'}.</div>`; }
  Sfx.ejectConfirm();
}
function hideEjectCard(){ const c=$('#ejectCard'); c.classList.remove('show'); c.innerHTML=''; }
function hideMeeting(){ const m=$('#meeting'); m.classList.remove('on'); Game.meeting.active=false; }
function showEjectCandidates(){ }
function endMeetingRound(){
  Game.bodies.forEach(b=>scene.remove(b.mesh)); Game.bodies=[];
  const alive=Game.players.filter(p=>!p.isDead);
  alive.forEach((p,i)=>{
    const s=tileCenter(MAP.spawn.x+((i%5)-2), MAP.spawn.z+(((i/5)|0)-1));
    p.x=s.x; p.z=s.z; p.mesh.position.set(p.x,0,p.z);
  });
  Game.players.forEach(p=>{ if(p.isImpostor && !p.isDead) p.killCooldown=14; });
  Game.state='playing'; showHud(); recountTasks();
  openAllDoors();
  updateInteraction();
  checkWin();
}

/* ----------------------------------------------- ADMIN MINIMAP */
let mmBuilt=false, mmPlayers=null;
function buildMinimap(){
  const svg=$('#mmSvg'); if(!svg) return;
  const pad=4; const w=170,h=170;
  svg.setAttribute('width',w); svg.setAttribute('height',h); svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.innerHTML='';
  const sx=w/(WORLD.maxX-WORLD.minX+1), sz=h/(WORLD.maxZ-WORLD.minZ+1);
  const tx=x=>(x-WORLD.minX)*sx, tz=z=>(z-WORLD.minZ)*sz;
  const R=el('g','rooms'); svg.appendChild(R);
  MAP.rooms.forEach(r=>{
    const rect=el('rect'); rect.setAttribute('x',tx(r.x0)); rect.setAttribute('y',tz(r.z0));
    rect.setAttribute('width',(r.x1-r.x0+1)*sx); rect.setAttribute('height',(r.z1-r.z0+1)*sz);
    rect.setAttribute('rx',3); rect.setAttribute('fill','#123236'); rect.setAttribute('stroke','#2b6a7a'); rect.setAttribute('stroke-width',1);
    R.appendChild(rect);
  });
  const P=el('g','pnts'); svg.appendChild(P);
  mmBuilt=true;
  window._mapScale=sx;
}
function updateMinimap(){
  const elm=$('#minimap'); if(!elm || !elm.classList.contains('on')) return;
  const svg=$('#mmSvg'); if(!svg) return;
  if(!mmBuilt) buildMinimap();
  const sx=window._mapScale, sy=sx;
  const tx=x=>(x/TILE+WORLD.originX-WORLD.minX)*sx, tz=z=>(z/TILE+WORLD.originZ-WORLD.minZ)*sy;
  const P=svg.querySelector('.pnts'); if(!P){return;}
  let html='';
  Game.players.forEach(p=>{
    if(p.isGhost) return;
    const active=p===Game.local;
    const r= active?4:2.6;
    html+=`<circle cx="${tx(p.x)}" cy="${tz(p.z)}" r="${r}" fill="${p.css}" ${active?'stroke="#fff" stroke-width="1.5"':''}/>`;
  });
  // sabotage markers
  const s=Game.sabotage.active;
  if(s && s.type!=='doors'){ const st=Game.fixStations[s.type]; if(st){ html+=`<circle cx="${tx(st.x)}" cy="${tz(st.z)}" r="4" fill="#ff5b5b"><animate attributeName="opacity" values="1;0;1" dur="0.7s" repeatCount="indefinite"/></circle>`; } }
  P.innerHTML=html;
}

/* ----------------------------------------------- SECURITY CAMERAS */
let secRenderer=null, secCameras=[], secIndex=0, secCtx=null, secCanvas=null;
function initSecurity(){
  secCanvas=$('#securityScreen'); if(!secCanvas) return;
  secRenderer=new THREE.WebGLRenderer({canvas:secCanvas, antialias:true, alpha:false});
  secRenderer.setSize(720, 420);        // fixed buffer; CSS scales it on screen
  secRenderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  secRenderer.shadowMap.enabled=false;
  secRenderer.outputColorSpace=THREE.SRGBColorSpace;
  // 4 cameras
  const defs=[ {x:14,z:7,y:2.4,yaw:Math.PI}, {x:16,z:18,y:2.4,yaw:0}, {x:7,z:18,y:2.4,yaw:Math.PI/2}, {x:36,z:6,y:2.4,yaw:-Math.PI/2} ];
  secCameras=defs.map(d=>{ const c=new THREE.PerspectiveCamera(60, 1.4, 0.1, 200);
    c.position.set(wtx(d.x), d.y, wtz(d.z)); c.rotation.set(-0.15, d.yaw, 0); return c; });
}
function renderSecurity(){
  if(!secRenderer) return;
  const w=secRenderer.domElement.width, h=secRenderer.domElement.height;
  // 2x2 grid, animate camera switch every 3s
  const t=Math.floor(now()/3)%secCameras.length;
  const cam=secCameras[t];
  secRenderer.setViewport(0,0,w,h); secRenderer.setScissor(0,0,w,h); secRenderer.setScissorTest(false);
  secRenderer.render(scene, cam);
}
function cycleCams(){ /* handled per 3s swap */ }

/* ----------------------------------------------- VISION DARK */
function ensureVision(){ const v=$('#visionDark'); if(v) return; const d=document.createElement('div'); d.id='visionDark'; d.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:28;background:radial-gradient(ellipse at center,transparent 18%,rgba(0,0,0,.9) 70%);opacity:0;transition:opacity .4s'; document.body.appendChild(d); }

/* ----------------------------------------------- KEY HANDLERS */
function bindKeys(){
  window.addEventListener('keydown',e=>{
    if(Game.state==='lobby'||Game.state==='role') return;
    const code=e.code;
    if(code==='KeyE' && !Game.taskModalOpen && Game.state==='playing' && !Game._secOpen){ e.preventDefault(); Game.doAction && Game.doAction(); }
    if(code==='Space'){ e.preventDefault(); if(Game.state==='playing' && !Game.taskModalOpen && Game.local && Game.local.isImpostor){ const id=($('#killBtn').dataset.target||'-1'); const t=Game.players.find(p=>p.id===parseInt(id,10)); if(t) killImpostor(Game.local,t); } if(Game.state==='playing'){} }
    if(code==='KeyF'){ cam.first=!cam.first; }
    if(code==='KeyM' && Game.state==='playing'){ const m=$('#minimap'); if(m) m.classList.toggle('on'); Game._adminOpen=m&&m.classList.contains('on'); }
    if(code==='KeyC' && Game.state==='playing' && !Game._secOpen){ openCams(); }
    if(code==='Escape'){ if(Game._secOpen) closeCams(); if(Game.taskModalOpen) TASK_MODAL.close(); if(document.pointerLockElement) document.exitPointerLock(); }
    if(code==='KeyV' && Game.state==='playing' && Game.local && Game.local.isImpostor && !Game._secOpen){
      const vent=WORLD.vents.find(v=>dist2d(Game.local,{x:v.x,z:v.z})<3.0);
      if(vent) useVent(vent);
    }
  });
  // close buttons
  $('#secClose').addEventListener('click',closeCams);
  $('#minimap .mmClose') && $('#minimap .mmClose').addEventListener('click',()=>{ $('#minimap').classList.remove('on'); });
  $('#endPlay').addEventListener('click',()=>{ location.reload(); });
}

/* ----------------------------------------------- LOBBY */
function renderLobby(){
  const sw=$('#lobbyColor'); if(sw){ sw.innerHTML=''; sw.innerHTML='<div class="section">Your Color</div><div class="swatches" id="lobbySwatches"></div>'; const ws=$('#lobbySwatches'); COLORS.forEach((c,i)=>{ const s=el('div','swatch'+(i===Game.settings.myColor?' selected':'')); s.style.background=c.css; s.addEventListener('click',()=>{ Game.settings.myColor=i; localStorage.setItem('au3d_color',i); renderLobby(); }); ws.appendChild(s); }); }
  $('#inName').value = localStorage.getItem('au3d_name')||'You';
  $('#inPlayers').value=Game.settings.playerCount;
  $('#inImpostors').value=Game.settings.impostors;
  $('#inTasks').value=Game.settings.taskCount;
  $('#inEmergency').value=Game.settings.emergency;
  $('#inEjects').checked=Game.settings.confirmEjects;
}
function readLobby(){
  Game.settings.playerCount=clamp(parseInt($('#inPlayers').value)||7,4,10);
  Game.settings.impostors=clamp(parseInt($('#inImpostors').value)||1,1,3);
  Game.settings.taskCount=clamp(parseInt($('#inTasks').value)||5,3,10);
  Game.settings.emergency=clamp(parseInt($('#inEmergency').value)||3,0,5);
  Game.settings.confirmEjects=$('#inEjects').checked;
  localStorage.setItem('au3d_name',$('#inName').value||'You');
  Game.settings.myColor=parseInt(localStorage.getItem('au3d_color')||'0',10);
}
function showLobby(){
  const lo=$('#lobby'); lo.classList.remove('hidden');
  Game.state='lobby';
  renderLobby();
}
function startFromLobby(){
  readLobby();
  $('#lobby').classList.add('hidden');
  AudioSys.init(); AudioSys.resume(); AudioSys.start();
  // use chosen color for local
  startGame();
}

/* ----------------------------------------------- BOOT */
function init(){
  Input.init();
  ensureVision();
  buildMap(scene);
  initSecurity();
  bindKeys();
  bindPointerLock();
  // lobby wiring
  $('#startBtn').addEventListener('click',startFromLobby);
  $('#inPlayers').addEventListener('input',readLobby);
  $('#inImpostors').addEventListener('input',readLobby);
  // start loop
  showLobby();
  Game.loop();
}
window.addEventListener('load',init);
