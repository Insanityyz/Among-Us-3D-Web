/* ============================================================= CONTROLS & WORLD SYSTEMS */
const cam = { yaw:0, pitch:-0.28, dist:6.2, first:false, sens:0.0022 };
Game.cam = cam;
Game.bodies = [];
Game.fixStations = {};
Game.doorTimer = 0;
let pointerLocked = false;
let CURRENT_INTERACTION = null;

function isActive(){ return Game.state==='playing' && !Game.taskModalOpen && !Game.meeting.active; }

/* ----------------------------------------- movement */
function movementInput(){
  let mx=0,mz=0; const k=Input.keys;
  if(k['KeyW']||k['ArrowUp'])mz+=1;
  if(k['KeyS']||k['ArrowDown'])mz-=1;
  if(k['KeyA']||k['ArrowLeft'])mx-=1;
  if(k['KeyD']||k['ArrowRight'])mx+=1;
  if(Input.touch.active){ mx+=Input.touch.joy.x; mz-=Input.touch.joy.y; }
  return {mx,mz};
}
function angLerp(a,b,t){ let d=b-a; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; return a+d*t; }
function updatePlayer(p,mx,mz,dt){
  const f2={x:-Math.sin(cam.yaw), z:-Math.cos(cam.yaw)};
  const r ={x: Math.cos(cam.yaw), z:-Math.sin(cam.yaw)};
  let vx=f2.x*mz + r.x*mx, vz=f2.z*mz + r.z*mx;
  const len=Math.hypot(vx,vz);
  p.moving = len>0.001;
  if(p.moving){
    vx/=len; vz/=len;
    const sp = p.isGhost? 4.8 : p.speed;
    let nx=p.x+vx*sp*dt, nz=p.z+vz*sp*dt;
    if(!p.isGhost){ const res=resolveCollision(nx,nz,0.6); nx=res.x; nz=res.z; }
    p.x=nx; p.z=nz;
    p.yaw = p.vyaw = angLerp(p.vyaw, Math.atan2(-vx,-vz), 0.22);
    p.walkPhase += dt*sp*2.2;
  }
  p.mesh.position.set(p.x, p.isGhost? (0.5+Math.sin(Game.time*3+p.id)*0.08):0, p.z);
  p.mesh.rotation.y = p.yaw;
  if(p.mesh.userData.legs && !p.isGhost){
    const sw = p.moving? 0.5*Math.abs(Math.sin(p.walkPhase*4)) : 0;
    p.mesh.userData.legs[0].position.z=sw; p.mesh.userData.legs[1].position.z=-sw;
  }
}
function roomAtPos(p){ return MAP.roomAt(Math.round(p.x/TILE+WORLD.originX), Math.round(p.z/TILE+WORLD.originZ)); }
function showRoom(name){
  const l=$('#roomLabel'); if(!l) return;
  if(name && name!==Game.lastRoomName){ l.textContent=name; l.classList.add('show'); Game.lastRoomName=name; }
  else if(!name) l.classList.remove('show');
}

/* ----------------------------------------- fix stations / sabotage */
function buildFixStations(){
  const defs={ lights:{x:15,z:29}, reactor:{x:37,z:29}, o2:{x:37,z:4}, comLights:{x:5,z:6} };
  const mk=(type, tx, tz)=>{
    const {x,z}=tileCenter(tx,tz);
    const grp=new THREE.Group();
    const pnl=box(1.2,1.4,0.3, mat(0x1b2a36,{rough:0.4,emissive:0x2a5b73,emissiveIntensity:0.4}),0,0.7,0);
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.6,0.85,24), new THREE.MeshBasicMaterial({color:0xff5b5b,transparent:true,opacity:0,depthWrite:false}));
    ring.rotation.x=-Math.PI/2; ring.position.y=0.06;
    grp.add(pnl); grp.add(ring); grp.position.set(x,0,z);
    WORLD.group.add(grp);
    Game.fixStations[type]={x,z,mesh:grp,ring};
  };
  mk('lights',15,29); mk('reactor',37,29); mk('o2',37,4); mk('comms',5,6);
}
function typeLabel(t){ return {lights:'Fix Lights',reactor:'Fix Reactor',o2:'Stop O2',comms:'Fix Comms'}[t]||String(t); }

function startSabotage(type){
  if(type==='doors'){ closeRandomDoors(8); Game.doorTimer=8; Game.sabotage.active={type:'doors', isEmergency:false}; Sfx.sabotage(); updateSabotageUI(); return; }
  if(Game.sabotage.active && Game.sabotage.active.type!=='doors') return;
  Game.sabotage.active={type, timerStart:now(), timerLen: (type==='reactor'||type==='o2')?35:0, isEmergency:(type==='reactor'||type==='o2')};
  Sfx.sabotage();
  if(type==='reactor')Sfx.alert();
  updateSabotageUI();
  toast({lights:'Lights sabotaged',reactor:'☢ Reactor meltdown!',o2:'🫁 Oxygen dropping!',comms:'Comms sabotaged',doors:'Doors locked'}[type],'warn');
}
function clearSabotage(){
  if(!Game.sabotage.active) return;
  const s=Game.sabotage.active;
  Game.sabotage.active=null;
  if(s.type==='doors') openAllDoors();
  updateSabotageUI();
  Sfx.fix();
}
function updateSabotageUI(){
  const bb=$('#sabotageBanner'); if(bb) bb.remove();
  const s=Game.sabotage.active; if(!s){ const st=$('#sabTimer'); if(st) st.textContent=''; return; }
  const b=el('div'); b.id='sabotageBanner';
  if(s.type==='lights'){ b.style.background='linear-gradient(180deg,#2a4a3f,#152a24)'; }
  else if(s.type==='comms'){ b.style.background='linear-gradient(180deg,#3a3a2a,#22180e)'; }
  else if(s.type==='reactor'){ b.style.background='linear-gradient(180deg,#6a1a1a,#2a0d0d)'; }
  else if(s.type==='o2'){ b.style.background='linear-gradient(180deg,#2a3a5a,#0d1a2a)'; }
  else b.style.background='linear-gradient(180deg,#3a2a2a,#1a0d0d)';
  document.body.appendChild(b);
  updateSabotageBannerText();
}
function updateSabotageBannerText(){
  const s=Game.sabotage.active; const b=$('#sabotageBanner'); if(!s||!b) return;
  if(s.isEmergency){
    const left=Math.max(0,s.timerLen-(now()-s.timerStart));
    b.textContent=(s.type==='reactor'?'☢ REACTOR MELTDOWN — ':'🫁 LOW OXYGEN — ')+Math.ceil(left)+'s';
  } else b.textContent={lights:'🔦 LIGHTS OUT',comms:'📡 COMMS DISRUPTED',doors:'🚪 DOORS LOCKED'}[s.type]||'';
  const st=$('#sabTimer'); if(st) st.textContent = s.isEmergency? Math.ceil(Math.max(0,s.timerLen-(now()-s.timerStart)))+'s' : '';
}
function canVote(){ return !(Game.sabotage.active && Game.sabotage.active.isEmergency); }
function flagsForSabotage(x,z){
  const s=Game.sabotage.active; if(!s||s.type==='doors') return null;
  const st=Game.fixStations[s.type]; if(!st) return null;
  if(dist2d({x,z},{x:st.x,z:st.z})<2.6) return {type:'fixSabotage', label:typeLabel(s.type), x:st.x, z:st.z};
  return null;
}
function updateSabotage(dt){
  const s=Game.sabotage.active; if(!s) return;
  updateSabotageBannerText();
  const v=$('#visionDark');
  if(v) v.style.opacity = (s.type==='lights' && !Game.local.isGhost) ? 0.72 : 0;
  if(s.isEmergency && (now()-s.timerStart)>=s.timerLen){ endGame('imp','sabotage'); clearSabotage(); }
}
function visionFactor(){ return (Game.sabotage.active && Game.sabotage.active.type==='lights' && !Game.local.isGhost)?0.35:1; }
function closeRandomDoors(count){ shuffle(WORLD.doors.filter(d=>!d.closed)).slice(0,count).forEach(d=>closeDoor(d)); }
function openAllDoors(){ WORLD.doors.forEach(d=>openDoor(d)); }

/* ----------------------------------------- kill / death */
function nearestOtherPlayer(p,maxDist){
  let best=null,bd=maxDist;
  Game.players.forEach(o=>{
    if(o===p||o.isDead) return;
    if(p.isImpostor && o.isImpostor) return; // impostors never target teammates
    const d=dist2d(p,o); if(d<bd){ bd=d; best=o; }
  });
  return best;
}
function spawnBody(victim){
  const m=buildCrewmate(victim.color);
  m.scale.set(.92,.6,.92); m.rotation.z=Math.PI/2;
  m.position.set(victim.x,0.08,victim.z);
  scene.add(m);
  Game.bodies.push({player:victim,x:victim.x,z:victim.z,mesh:m,reported:false});
}
function convertToGhost(p){
  const g=buildGhost(p.color); g.position.copy(p.mesh.position); g.rotation.y=p.mesh.rotation.y;
  g.userData.updateName(p.name, 0x9fd8ff);
  scene.remove(p.mesh); p.mesh=g; scene.add(g);
  if(p.isLocal){ camera.position.y=1.2; }
}
function killImpostor(imp,target){
  if(!imp.isImpostor||imp.isDead) return;
  if(imp.killCooldown>0) return;
  if(!target||target.isDead||target.isImpostor) return;
  if(dist2d(imp,target)>2.6) return;
  spawnBody(target);
  target.isDead=true; target.isGhost=true; target.deadBy=imp;
  convertToGhost(target);
  imp.killCooldown=25;
  if(imp.isLocal){ Game.killCooldown=25; toast('You killed '+target.name,'warn'); }
  // update bots' report logic: if bot nearby saw it, they'll report
  checkWin();
}

/* ----------------------------------------- meetings entry */
function callEmergency(){
  if(!canVote()){ toast('Cannot meet during critical sabotage','warn'); return; }
  if(Game.settings.emergency<=0){ toast('No emergency meetings left','warn'); return; }
  Game.settings.emergency--;
  startMeeting(null,'Emergency meeting');
}
function reportBody(body){
  if(!canVote()) return;
  if(body.reported) return;
  body.reported=true;
  startMeeting(body.player,'A dead body was reported');
}
function startMeeting(reportPlayer,title){
  if(Game.state==='meeting') return;
  Game.state='meeting';
  GamingSleep(0);
  Meeting.reset(reportPlayer); Meeting.title=title;
  openAllDoors();
  if(Game.sabotage.active) Game.sabotage.active=null;
  updateSabotageUI();
  hideHud();
  showMeeting(title);
  Sfx.meeting();
}
function GamingSleep(){ }

/* ----------------------------------------- win */
function checkWin(){
  const aliveCrew=Game.players.filter(p=>!p.isDead&&!p.isImpostor).length;
  const aliveImp=Game.players.filter(p=>!p.isDead&&p.isImpostor).length;
  if(aliveImp===0) return endGame('crew','eject');
  if(aliveCrew<=aliveImp) return endGame('imp','parity');
  if(crewTaskTotal()>0 && crewTaskDone()>=crewTaskTotal()) return endGame('crew','tasks');
}
function endGame(winner,reason){
  if(Game.state==='gameover') return;
  Game.state='gameover';
  if(winner==='crew') Sfx.win(); else Sfx.lose();
  const o=$('#endOverlay'); if(!o) return;
  o.classList.remove('hidden');
  const t=$('#endTitle'), s=$('#endSub');
  if(winner==='crew'){ t.textContent='VICTORY'; t.style.color='#5be78b'; s.textContent='The Crew defeated the Impostors!'; }
  else { t.textContent='DEFEAT'; t.style.color='#ff5b5b'; s.textContent='The Impostors won!'; }
  recountTasks();
}

/* ----------------------------------------- start / lobby */
function clearPlayers(){
  (Game.players||[]).forEach(p=>scene.remove(p.mesh));
  (Game.bodies||[]).forEach(b=>scene.remove(b.mesh));
  Game.players=[]; Game.bodies=[]; Game.local=null; nameIdx=0;
  Object.keys(Game.fixStations).forEach(k=>{ const st=Game.fixStations[k]; if(st) WORLD.group.remove(st.mesh); });
  Game.fixStations={};
}
function startGame(){
  finishRole();
  clearPlayers();
  buildFixStations();
  const total=Game.settings.playerCount;
  const impCount=Math.max(1,Game.settings.impostors);
  const roles=[]; for(let i=0;i<total;i++) roles.push(i<impCount?'imp':'crew'); shuffle(roles);
  const usedColors=new Set([Game.settings.myColor]);
  const rem=shuffle([...Array(COLORS.length).keys()].filter(i=>i!==Game.settings.myColor));
  let ri=0;
  for(let i=0;i<total;i++){
    const ci = i===0 ? Game.settings.myColor : rem[ri++ % rem.length];
    const p=makePlayer(ci, roles[i]==='imp', i===0, i===0?'You':'');
    Game.players.push(p);
  }
  spawnPlayers();
  recountTasks();
  showRole();
}
function showRole(){
  const local=Game.local; const m=$('#roleModal');
  m.classList.remove('hidden'); m.classList.add('on');
  const card=m.querySelector('.rolecard');
  card.classList.toggle('imp',local.isImpostor);
  card.classList.toggle('crew',!local.isImpostor);
  m.querySelector('.rolecard .big').textContent = local.isImpostor?'IMPOSTOR':'CREWMATE';
  m.querySelector('.rolecard .roleD').innerHTML = local.isImpostor?
    `<div class="muted" style="margin:8px 0">Kill Crewmates, vent through the ship, and sabotage. Blend in.</div>
     <div class="muted">Teammates: ${Game.players.filter(p=>p.isImpostor&&p!==local).map(p=>p.name).join(', ')||'You are the only impostor'}</div>`
    : `<div class="muted" style="margin:8px 0">Complete tasks while watching for the Impostor.</div>
       <div class="muted">Your tasks: ${local.tasks.length} (${local.tasks.map(t=>t.name).join(', ')})</div>`;
  let btn=$('.rolecard .btn'); if(btn) btn.remove();
  btn=el('button','btn primary','START'); btn.style.marginTop='16px';
  btn.addEventListener('click',()=>{ m.classList.add('hidden'); m.classList.remove('on'); beginPlay(); });
  card.appendChild(btn);
}
function finishRole(){ }
function beginPlay(){
  Game.state='role';
  Game.roleTimer=now();
  const cd=$('#countdownOverlay'); if(cd) cd.remove();
  const ov=el('div','overlay'); ov.id='countdownOverlay';
  ov.innerHTML=`<div class="card" style="text-align:center;max-width:420px"><div style="font-size:76px;font-weight:900" id="cdNum">3</div><div class="muted">Get ready…</div></div>`;
  document.body.appendChild(ov);
  const step=()=>{
    const t=3-Math.floor(now()-Game.roleTimer);
    const n=$('#cdNum'); if(n) n.textContent=Math.max(0,t);
    if(t<=0){ ov.remove(); Game.state='playing'; showHud(); toast('Match begins — good luck!','good'); }
    else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ----------------------------------------- interactions */
function pendingTaskConsole(p){
  let best=null,bd=2.4;
  for(const c of WORLD.consoles){
    const d=dist2d(p,{x:c.x,z:c.z});
    if(d<bd){
      const task=p.tasks.find(t=>!t.done && t.steps.some(s=>!s.done && s.console && s.console.mesh===c.mesh));
      if(task){ const step=task.steps.find(s=>!s.done && s.console && s.console.mesh===c.mesh); best={console:c,task,step}; bd=d; }
    }
  }
  return best;
}
function updateInteraction(){
  if(Game.state!=='playing'||Game.taskModalOpen){ CURRENT_INTERACTION=null; setPrompt(null); return; }
  const p=Game.local; let found=null;

  // ghost: task consoles only
  if(p.isGhost){
    const best=pendingTaskConsole(p);
    if(best) found={type:'task',label:best.task.name,console:best.console,task:best.task,step:best.step,action:'doTask'};
    CURRENT_INTERACTION=found;
    const btn=$('#useBtn'); if(found){ btn.textContent=found.label; btn.classList.remove('hidden'); } else btn.classList.add('hidden');
    $('#killBtn').classList.add('hidden');
    setPrompt(found?found.label:null);
    return;
  }

  // living: gather all candidate interactions
  const sab=flagsForSabotage(p.x,p.z);
  const best=pendingTaskConsole(p);
  const em=WORLD.emergency; const emNear=!!(em && dist2d(p,{x:em.x,z:em.z})<2.2 && canVote());
  const body=Game.bodies.find(b=>!b.reported && dist2d(p,{x:b.x,z:b.z})<2.4);
  const vent = (!p.isImpostor)? null : WORLD.vents.find(v=>dist2d(p,{x:v.x,z:v.z})<2.0 && !p.isDead);
  const a=tileCenter(16,19); const adminNear=dist2d(p,{x:a.x,z:a.z})<3.0;
  const sce=tileCenter(7,18); const camsNear=dist2d(p,{x:sce.x,z:sce.z})<2.6;

  // priority: sabotage fix > emergency > report > task > vent > admin > cams
  if(sab) found={type:'fixSabotage',label:sab.label,action:'fixSabotage'};
  else if(emNear) found={type:'emergency',label:'Emergency Meeting',action:'emergency'};
  else if(body) found={type:'body',label:'Report Body',body,action:'report'};
  else if(best && !p.isImpostor) found={type:'task',label:best.task.name,console:best.console,task:best.task,step:best.step,action:'doTask'};
  else if(vent) found={type:'vent',label:'Vent',vent,action:'vent'};
  else if(adminNear) found={type:'admin',label:'Open Admin Map',action:'admin'};
  else if(camsNear) found={type:'cams',label:'Security Cameras',action:'cams'};

  CURRENT_INTERACTION=found;
  const killable = (p.isImpostor && !p.isDead && p.killCooldown<=0) ? nearestOtherPlayer(p,2.6) : null;
  const btn=$('#useBtn');
  if(found){ btn.textContent=found.label; btn.classList.remove('hidden'); } else btn.classList.add('hidden');
  const kbtn=$('#killBtn');
  kbtn.classList.toggle('hidden',!killable);
  kbtn.dataset.target = killable? String(killable.id) : '';
  setPrompt( found? found.label : (killable? 'Kill '+killable.name : '') );
}
function setPrompt(text){ const pr=$('#prompt'); if(!pr) return; pr.style.display=text?'block':'none'; pr.textContent=text||''; }
Game.doAction=function(){
  const it=CURRENT_INTERACTION; if(!it) return;
  switch(it.action){
    case 'doTask': TASK_MODAL.open(it.task,it.step); break;
    case 'vent': useVent(it.vent); break;
    case 'emergency': callEmergency(); break;
    case 'report': reportBody(it.body); break;
    case 'fixSabotage': fixSabotage(); break;
    case 'admin': openAdminMap(); break;
    case 'cams': openCams(); break;
  }
  CURRENT_INTERACTION=null;
};
function useVent(vent){
  if(Game.local.ventCooldown>0) return;
  const opts=WORLD.vents.filter(v=>v.net===vent.net && v!==vent);
  if(!opts.length){ toast('No linked vents','warn'); return; }
  const target=opts[0];
  Sfx.vent();
  Game.local.x=target.x; Game.local.z=target.z; Game.local.ventCooldown=2;
  toast('Vented to '+target.name,'good');
}
function fixSabotage(){
  if(!Game.sabotage.active) return;
  clearSabotage();
  toast('Sabotage resolved','good');
}
function openAdminMap(){ Game._adminOpen=true; $('#minimap').classList.add('on'); toast('Admin map'); }
function openCams(){ Game._secOpen=true; $('#security').classList.add('on'); }
function closeCams(){ Game._secOpen=false; $('#security').classList.remove('on'); }

/* pointer lock */
function requestLock(){
  try{ renderer.domElement.requestPointerLock = renderer.domElement.requestPointerLock||renderer.domElement.mozRequestPointerLock; renderer.domElement.requestPointerLock(); }catch(e){}
}
function bindPointerLock(){
  document.addEventListener('pointerlockchange',()=>{ pointerLocked = document.pointerLockElement===renderer.domElement; });
  renderer.domElement.addEventListener('click',()=>{ if(Game.state==='playing' && !Game.taskModalOpen && inputMode==='mouse' && !pointerLocked) requestLock(); });
}
Game.onPointerDown=function(px,py){
  if(Game.state!=='playing'||Game.taskModalOpen||!pointerLocked) return;
  killAtScreen(px,py);
};
Game.onTouchAction=function(act){
  if(Game.state!=='playing') return;
  if(act==='kill'){ const id=parseInt(($('#killBtn').dataset.target||'-1'),10); const t=Game.players.find(p=>p.id===id); if(t) killImpostor(Game.local,t); }
  else if(act==='use') Game.doAction && Game.doAction();
};
function killAtScreen(px,py){
  if(!(Game.local.isImpostor&&!Game.local.isDead&&Game.local.killCooldown<=0)) return;
  const n=new THREE.Vector3(px,py,0.5).unproject(camera);
  const dir=n.sub(camera.position).normalize();
  const ray=new THREE.Raycaster(camera.position,dir);
  const targets=Game.players.filter(o=>o!==Game.local&&!o.isDead&&!o.isImpostor).map(o=>o.mesh.userData.body);
  const hits=ray.intersectObjects(targets,true);
  if(hits.length){ const obj=hits[0].object; let t=null; let o=obj; while(o){ if(o.userData.__pl){t=o.userData.__pl;break;} o=o.parent; } if(t) killImpostor(Game.local,t); }
}

/* ----------------------------------------- game loop */
let last=now(); let inputMode='mouse'; let frame=0;
function loop(){
  requestAnimationFrame(loop);
  const t=now(); const dt=Math.min(0.05, t-last); last=t;
  Game.time=t; frame++;
  inputMode = Input.touch.active?'touch':'mouse';

  if(isActive()){
    cam.yaw   -= Input.mouse.dx*cam.sens;
    cam.pitch -= Input.mouse.dy*cam.sens;
    cam.pitch  = clamp(cam.pitch,-1.15,1.15);
    if(Input.touch.active){ cam.yaw -= Input.touch.look.x*dt*2.8; cam.pitch -= Input.touch.look.y*dt*2.8; }
    Input.mouse.dx=0; Input.mouse.dy=0;
    updateInteraction();
    const {mx,mz}=movementInput();
    updatePlayer(Game.local,mx,mz,dt);
    if(Game.local.killCooldown>0) Game.local.killCooldown-=dt;
    if(Game.local.ventCooldown>0) Game.local.ventCooldown-=dt;
  }

  Game.players.forEach(p=>{ if(p!==Game.local) updateBot(p,dt); });

  if(Game.state==='playing'){
    updateSabotage(dt);
    updateCooldown();
    const room=roomAtPos(Game.local); showRoom(room?room.name:null);
    updateTaskArrow();
    checkWin();
  }
  if(Game.state==='meeting') Meeting.update(dt);

  updateWorldDoors(dt);
  updateMinimap();
  updateCamera();
  updateHUD();
  renderer.render(scene,camera);
  if(Game._secOpen) renderSecurity();
}
Game.loop=loop;
function updateWorldDoors(dt){
  if(Game.sabotage.active && Game.sabotage.active.type==='doors'){
    Game.doorTimer-=dt;
    if(Game.doorTimer<=0){ openAllDoors(); Game.sabotage.active=null; updateSabotageUI(); }
  }
}
function updateCamera(){
  if(!Game.local) return;
  const head=new THREE.Vector3(Game.local.x, Game.local.isGhost?1.2:1.3, Game.local.z);
  camera.rotation.order='YXZ';
  if(cam.first && !Game.local.isGhost){
    camera.position.copy(head); camera.rotation.set(cam.pitch,cam.yaw,0); camera.updateMatrixWorld();
  } else {
    const f=new THREE.Vector3(-Math.sin(cam.yaw)*Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw)*Math.cos(cam.pitch));
    const pos=head.clone().addScaledVector(f,-cam.dist); pos.y+=1.0; pos.y=Math.max(pos.y,0.9);
    camera.position.copy(pos); camera.lookAt(head);
  }
}

/* ----------------------------------------- AI BOTS */
function updateBot(p,dt){
  if(p.isDead) return;
  const ai=p.ai; if(!ai) return;
  if(Game.state==='playing'){
    if(p.isImpostor) updateImpostorBot(p,dt); else updateCrewBot(p,dt);
  }
}
function moveBotAlong(p,dt){
  const ai=p.ai;
  if(ai.path && ai.path.length){
    const wp=ai.path[ai.pathIdx];
    if(!wp){ ai.path=null; return false; }
    const dx=wp.x-p.x, dz=wp.z-p.z, d=Math.hypot(dx,dz);
    if(d<0.5){ ai.pathIdx++; if(ai.pathIdx>=ai.path.length){ ai.path=null; return false; } return true; }
    const vx=dx/d, vz=dz/d, sp=p.isGhost?4.8:3.2;
    let nx=p.x+vx*sp*dt, nz=p.z+vz*sp*dt;
    const res=resolveCollision(nx,nz,0.55); nx=res.x; nz=res.z;
    p.x=nx; p.z=nz;
    p.yaw=Math.atan2(-vx,-vz); p.moving=true; p.walkPhase+=dt*sp*2.2;
    p.mesh.position.set(p.x,0,p.z); p.mesh.rotation.y=p.yaw;
    return true;
  }
  return false;
}
function stopBot(p){ const ai=p.ai; ai.path=null; p.moving=false; if(p.mesh.userData.legs){p.mesh.userData.legs[0].position.z=0;p.mesh.userData.legs[1].position.z=0;} }
function updateCrewBot(p,dt){
  const ai=p.ai;
  if(ai.mode==='idle'){
    const sab=Game.sabotage.active;
    if(sab && sab.type!=='doors'){
      const st=Game.fixStations[sab.type];
      if(st){ ai.mode='fix'; ai.type=sab.type; ai.waitT=rand(1.5,3); ai.path=findPath(p.x,p.z,st.x,st.z); ai.pathIdx=0; return; }
    }
    const task=p.tasks.find(t=>!t.done);
    if(task){
      const step=task.steps.find(s=>!s.done && s.console);
      if(step && step.console){ ai.mode='todo'; ai.task=task; ai.path=findPath(p.x,p.z,step.console.x,step.console.z); ai.pathIdx=0; }
      else { task.done=true; recountTasks(); ai.mode='idle'; }
    } else { ai.mode='wander'; ai.waitT=rand(1,3); ai.path=findPath(p.x,p.z,WorldRandX(),WorldRandZ()); ai.pathIdx=0; }
  } else if(ai.mode==='todo'){
    if(moveBotAlong(p,dt)) return;
    ai.mode='work'; ai.taskT=rand(1.6,3.2); stopBot(p);
  } else if(ai.mode==='work'){
    ai.taskT-=dt; p.moving=false;
    if(ai.taskT<=0){
      const task=ai.task; const step=task.steps.find(s=>!s.done&&s.console);
      if(step){ step.done=true; if(task.steps.every(s=>s.done)){ task.done=true; Sfx.taskDone(); } }
      recountTasks(); ai.mode='idle';
    }
  } else if(ai.mode==='fix'){
    if(moveBotAlong(p,dt)) return;
    ai.waitT-=dt; p.moving=false;
    if(ai.waitT<=0){
      if(Game.sabotage.active && Game.sabotage.active.type===ai.type) clearSabotage();
      ai.mode='idle';
    }
  } else if(ai.mode==='wander'){
    if(moveBotAlong(p,dt)) return;
    if(Math.random()<0.03){ ai.path=findPath(p.x,p.z,WorldRandX(),WorldRandZ()); ai.pathIdx=0; }
  }
}
function updateImpostorBot(p,dt){
  const ai=p.ai;
  if(p.killCooldown>0) p.killCooldown-=dt;
  if(Game.sabotage.active===null && Math.random()<0.0015){ startSabotage(pick(['lights','lights','reactor','o2','comms'])); }
  if(ai.mode==='idle'){
    const crews=Game.players.filter(o=>!o.isDead&&!o.isImpostor);
    if(!crews.length){ ai.mode='idle'; return; }
    const victim=pick(crews);
    ai.mode='hunt'; ai.target=victim;
    ai.repathT=0;
    ai.path=findPath(p.x,p.z,victim.x,victim.z); ai.pathIdx=0;
  } else if(ai.mode==='hunt'){
    if(!ai.target || ai.target.isDead){ ai.mode='idle'; return; }
    if(Math.random()<0.01){ ai.path=findPath(p.x,p.z,ai.target.x,ai.target.z); ai.pathIdx=0; }
    if(moveBotAlong(p,dt)) {
      // if we see the target, approach directly
      return;
    }
    const d=dist2d(p,ai.target);
    if(d<2.4 && p.killCooldown<=0){ killImpostor(p,ai.target); p.killCooldown=25; ai.mode='idle'; }
  }
}
function WorldRandX(){ return rand(wtx(WORLD.minX),wtx(WORLD.maxX)); }
function WorldRandZ(){ return rand(wtz(WORLD.minZ),wtz(WORLD.maxZ)); }

/* ----------------------------------------- HUD */
function hideHud(){ const h=$('#hud'); if(h) h.classList.remove('on'); $('#roomLabel').classList.remove('show'); }
function showHud(){ const h=$('#hud'); if(h) h.classList.add('on'); }
function updateHUD(){
  const fill=$('#taskBarFill'); if(fill) fill.style.width=(Game.progress.totalTasks?(Game.progress.doneTasks/Game.progress.totalTasks)*100:0)+'%';
  const pct=$('#taskPct'); if(pct) pct.textContent=Game.progress.doneTasks+'/'+Game.progress.totalTasks;
  const nc=$('#chipName'); if(nc&&Game.local){ nc.textContent=Game.local.name; nc.style.color=Game.local.css; }
  const rc=$('#chipRole'); if(rc&&Game.local){ rc.textContent=Game.local.isImpostor?'IMPOSTOR':'CREWMATE'; rc.style.color=Game.local.isImpostor?'#ff6b6b':'#5be78b'; }
  const kcEl=$('#killChip'); if(kcEl) kcEl.style.display = (Game.local && Game.local.isImpostor && !Game.local.isDead)? '':'none';
  if(Game.local && Game.local.isImpostor){ const km=$('#killCd'); if(km){ const kc=Math.max(0,Game.local.killCooldown); km.textContent=kc<=0?'READY':Math.ceil(kc)+'s'; km.style.color=kc<=0?'#5be78b':'#ff8f6a'; } }
  const ch=$('#crosshair'); if(ch) ch.style.display = cam.first? 'block':'none';
  const tl=$('#taskItems'); if(tl && Game.local){
    tl.innerHTML='';
    Game.local.tasks.slice(0,6).forEach(t=>{
      const n=t.steps.filter(s=>s.done).length;
      const row=el('div','taskitem'+(t.done?' done':''),
        `<span class="ico">${t.done?'✔':'•'}</span><span>${t.done?t.name+' ✔':t.name}${!t.done?` <span style="font-size:10px;color:#7fb8cc">${n}/${t.steps.length}</span>`:''}</span>`);
      tl.appendChild(row);
    });
  }
}
function updateCooldown(){
  const cd=$('#cooldown');
  if(Game.local && Game.local.isImpostor && !Game.local.isDead){
    cd.style.display='block';
    const r=clamp(Game.local.killCooldown/25,0,1);
    const ring=document.querySelector('#cooldown .cdRing');
    if(ring) ring.style.strokeDashoffset = 176*(1-r);
    const nm=$('#cdNum'); if(nm) nm.textContent=Math.ceil(Math.max(0,Game.local.killCooldown));
  } else cd.style.display='none';
}
function updateTaskArrow(){
  // find nearest incomplete step console and point the 'nextTask' marker (simple: sparkle via room label)
}
Game.killCooldown=0;
