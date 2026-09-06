/* ============================================================================
   3. Client: input, camera rig, movement, interaction targeting, entities
   ========================================================================== */
const G={
  phase:'boot',
  settings:Object.assign({},DEFAULT_SETTINGS),
  client:Object.assign({},CLIENT_DEFAULTS),
  M:null, server:null, net:null,
  me:null, meId:'p0',
  time:0, frames:0, fps:0, fpsAcc:0,
  isTouch:false, modalOpen:null, paused:false,
};
const CLIENT={
  ents:new Map(), bodies:[], view:{},
  pos:{x:-14,z:-8}, yaw:0, pitch:0, vel:{x:0,z:0},
  inVent:false, ventId:null, ventTravel:0, ventFrom:null, ventTo:null,
  bob:0, stepPhase:0, shake:0, kick:0, handAnim:0, handTarget:0,
  useTarget:null, reportTarget:null, killTarget:null, ventTarget:null, doorTarget:null,
  camPos:null, smoothYaw:0, smoothPitch:0,
  focusStation:null, adminOpen:false, vitalsOpen:false, camsOpen:false, camIdx:0,
  dead:false, ejected:null, scanT:0,
};

/* ---------- input ---------- */
const INPUT={
  keys:Object.keys?{down:{},pressed:{}}:{down:{},pressed:{}},
  mouse:{dx:0,dy:0,locked:false,lmb:false,rmb:false,lmbPressed:false},
  joy:{active:false,id:-1,ox:0,oy:0,x:0,y:0,mag:0},
  look:{active:false,id:-1,lx:0,ly:0,dx:0,dy:0},
  anyKey:false,
};
const KEYMAP={
  KeyW:'fwd',KeyS:'back',KeyA:'left',KeyD:'right',ArrowUp:'fwd',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right',
  KeyE:'use',KeyR:'report',KeyQ:'kill',KeyV:'vent',KeyB:'sabotage',KeyM:'map',KeyF:'view',
  Tab:'tasks',Escape:'pause',KeyC:'chat',Digit1:'q1',Digit2:'q2',Digit3:'q3',Digit4:'q4',Digit5:'q5',
  Digit6:'q6',Digit7:'q7',Digit8:'q8',Digit9:'q9',Space:'use',Enter:'chat',ShiftLeft:'run',
};
function bindInput(canvas){
  addEventListener('keydown',e=>{
    const a=KEYMAP[e.code];
    if(a){ if(!INPUT.keys.down[a]) INPUT.keys.pressed[a]=true; INPUT.keys.down[a]=true; }
    if(e.code==='Tab'||e.code==='Space'||(e.code.startsWith('Arrow'))) e.preventDefault();
    INPUT.anyKey=true;
    if(e.code==='Escape') UI.onEscape();
  });
  addEventListener('keyup',e=>{ const a=KEYMAP[e.code]; if(a) INPUT.keys.down[a]=false; });
  addEventListener('blur',()=>{ INPUT.keys.down={}; INPUT.mouse.down={}; });
  canvas.addEventListener('mousedown',e=>{
    if(G.phase!=='playing'||UI.blocksInput()) return;
    if(!INPUT.mouse.locked&&!G.isTouch){ requestLock(); return; }
    if(e.button===0){ INPUT.mouse.lmb=true; INPUT.mouse.lmbPressed=true; }
    if(e.button===2){ INPUT.mouse.rmb=true; }
  });
  addEventListener('mouseup',e=>{ if(e.button===0)INPUT.mouse.lmb=false; if(e.button===2)INPUT.mouse.rmb=false; });
  addEventListener('contextmenu',e=>{ if(G.phase==='playing') e.preventDefault(); });
  addEventListener('mousemove',e=>{
    if(INPUT.mouse.locked){ INPUT.mouse.dx+=e.movementX||0; INPUT.mouse.dy+=e.movementY||0; }
  });
  document.addEventListener('pointerlockchange',()=>{
    INPUT.mouse.locked=(document.pointerLockElement===canvas);
    document.body.classList.toggle('locked',INPUT.mouse.locked);
    if(!INPUT.mouse.locked&&G.phase==='playing'&&!UI.blocksInput()&&!G.isTouch) UI.openSettings('pause');
  });
  document.addEventListener('pointerlockerror',()=>{ console.warn('pointer lock denied'); });
  bindTouch(canvas);
}
function requestLock(){
  const c=document.getElementById('gl');
  if(G.isTouch) return;
  const p=c.requestPointerLock&&c.requestPointerLock();
  if(p&&p.catch) p.catch(()=>{});
}
function exitLock(){ if(document.pointerLockElement) document.exitPointerLock(); }

/* ---------- touch ---------- */
function detectTouch(){
  const coarse=matchMedia('(pointer: coarse)').matches;
  const touchy=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  G.isTouch=coarse&&touchy;
  document.body.classList.toggle('touch',G.isTouch);
  document.getElementById('touch').classList.toggle('on',G.isTouch);
}
function bindTouch(canvas){
  const stickZone=document.getElementById('stickZone'), stick=document.getElementById('stick'), knob=stick.querySelector('i');
  const lookZone=document.getElementById('lookZone');
  const R=58;
  function uiBlocked(){ return UI.blocksInput(); }
  stickZone.addEventListener('touchstart',e=>{
    if(uiBlocked()) return;
    const t=e.changedTouches[0];
    INPUT.joy.active=true; INPUT.joy.id=t.identifier;
    const r=stick.getBoundingClientRect();
    INPUT.joy.ox=r.left+r.width/2; INPUT.joy.oy=r.top+r.height/2;
    e.preventDefault();
  },{passive:false});
  stickZone.addEventListener('touchmove',e=>{
    for(const t of e.changedTouches){
      if(t.identifier!==INPUT.joy.id) continue;
      let dx=t.clientX-INPUT.joy.ox, dy=t.clientY-INPUT.joy.oy;
      const m=Math.hypot(dx,dy);
      if(m>R){ dx=dx/m*R; dy=dy/m*R; }
      INPUT.joy.x=dx/R; INPUT.joy.y=dy/R; INPUT.joy.mag=Math.min(1,m/R);
      knob.style.transform=`translate(${dx}px,${dy}px)`;
    }
    e.preventDefault();
  },{passive:false});
  function endJoy(e){
    for(const t of e.changedTouches) if(t.identifier===INPUT.joy.id){
      INPUT.joy.active=false; INPUT.joy.id=-1; INPUT.joy.x=INPUT.joy.y=INPUT.joy.mag=0;
      knob.style.transform='translate(0,0)';
    }
  }
  stickZone.addEventListener('touchend',endJoy); stickZone.addEventListener('touchcancel',endJoy);
  lookZone.addEventListener('touchstart',e=>{
    if(uiBlocked()) return;
    const t=e.changedTouches[0];
    INPUT.look.active=true; INPUT.look.id=t.identifier; INPUT.look.lx=t.clientX; INPUT.look.ly=t.clientY;
    e.preventDefault();
  },{passive:false});
  lookZone.addEventListener('touchmove',e=>{
    for(const t of e.changedTouches){
      if(t.identifier!==INPUT.look.id) continue;
      INPUT.look.dx+=t.clientX-INPUT.look.lx; INPUT.look.dy+=t.clientY-INPUT.look.ly;
      INPUT.look.lx=t.clientX; INPUT.look.ly=t.clientY;
    }
    e.preventDefault();
  },{passive:false});
  function endLook(e){ for(const t of e.changedTouches) if(t.identifier===INPUT.look.id){ INPUT.look.active=false; INPUT.look.id=-1; } }
  lookZone.addEventListener('touchend',endLook); lookZone.addEventListener('touchcancel',endLook);
  // touch extra buttons
  document.getElementById('tBtnMap').addEventListener('click',()=>UI.toggleMap());
  document.getElementById('tBtnTask').addEventListener('click',()=>UI.toggleTaskList());
  document.getElementById('tBtnView').addEventListener('click',()=>{ G.client.thirdPerson=!G.client.thirdPerson; AUDIO.blip(520,.06); });
}

/* ---------- collision ---------- */
function collide(x,z,r){
  const list=SHIP.colliderCache||SHIP.colliders;
  let px=x,pz=z;
  for(let it=0;it<4;it++){
    let hit=false;
    for(let i=0;i<list.length;i++){
      const b=list[i];
      const dx=px-b.cx, dz=pz-b.cz;
      const rr=b.rad+r;
      if(dx*dx+dz*dz>rr*rr) continue;
      const p=circleVsOBB(px,pz,r,b);
      if(p){ px+=p.x; pz+=p.z; hit=true; }
    }
    if(!hit) break;
  }
  return {x:px,z:pz};
}
function refreshColliders(){
  const base=SHIP.colliders;
  for(const b of base) if(b.rad===undefined) b.rad=Math.hypot(b.hx,b.hz);
  const doorBoxes=[];
  for(const d of SHIP.doors){
    if(!d.def.closed) continue;
    doorBoxes.push({cx:d.def.cx,cz:d.def.cz,a:d.a,hx:d.w/2,hz:0.24,rad:Math.hypot(d.w/2,0.24)});
  }
  SHIP.colliderCache=base.concat(doorBoxes);
  SHIP.losExtra=G.M.doorSegs();
}

/* ---------- entities (other players & bodies) ---------- */
function ensureEnt(p){
  let e=CLIENT.ents.get(p.id);
  if(e) return e;
  const col=COLORS[p.color]?COLORS[p.color].hex:0xC61111;
  const vis=VISORS[p.visor||0]?VISORS[p.visor||0].hex:0x8AD5F0;
  const grp=makeCrewmate({color:col,visor:vis,detail:p.isBot?14:18});
  const tag=makeNameTag(p.name,COLORS[p.color]?COLORS[p.color].css:'#c61111');
  tag.position.y=1.42; grp.add(tag);
  RENDER.scene.add(grp);
  e={id:p.id,name:p.name,color:col,css:COLORS[p.color]?COLORS[p.color].css:'#c61111',
     group:grp,tag,x:p.x,z:p.z,tx:p.x,tz:p.z,yaw:p.yaw||0,tyaw:p.yaw||0,
     alive:true,ghost:false,walk:0,speed:0,inVent:false,role:'crewmate',isBot:p.isBot,
     lastSeen:0,visible:true};
  CLIENT.ents.set(p.id,e);
  return e;
}
function removeEnt(id){
  const e=CLIENT.ents.get(id); if(!e) return;
  RENDER.scene.remove(e.group);
  e.group.traverse(o=>{ if(o.geometry&&o.geometry.dispose&&!o.userData.shared) o.geometry.dispose(); });
  CLIENT.ents.delete(id);
}
function spawnBodyVisual(b){
  const col=COLORS[b.color]?COLORS[b.color].hex:0xC61111;
  const vis=VISORS[b.visor||0]?VISORS[b.visor||0].hex:0x8AD5F0;
  const grp=makeBody(col,vis);
  grp.position.set(b.x,0,b.z);
  grp.rotation.y=Math.random()*TAU;
  RENDER.scene.add(grp);
  const o={id:b.id,group:grp,x:b.x,z:b.z,color:b.color,reported:false};
  CLIENT.bodies.push(o);
  return o;
}
function clearBodies(){ for(const b of CLIENT.bodies) RENDER.scene.remove(b.group); CLIENT.bodies.length=0; }

/* ---------- camera + movement ---------- */

function updateLocalPlayer(dt){
  const me=G.me; if(!me) return;
  const C=CLIENT;
  const spd=(C.dead?5.2:3.42)*G.settings.playerSpeed*(C.inVent?1.35:1)*(INPUT.keys.down.run?1.0:1);
  // look
  let dx=INPUT.mouse.dx, dy=INPUT.mouse.dy;
  INPUT.mouse.dx=0; INPUT.mouse.dy=0;
  if(G.isTouch){ dx+=INPUT.look.dx*1.35; dy+=INPUT.look.dy*1.35; INPUT.look.dx=0; INPUT.look.dy=0; }
  const sens=0.0022*G.client.sensitivity;
  C.yaw-=dx*sens;
  C.pitch-=dy*sens*(G.client.invertY?-1:1);
  C.pitch=clamp(C.pitch,-1.36,1.36);
  if(C.yaw>Math.PI)C.yaw-=TAU; if(C.yaw<-Math.PI)C.yaw+=TAU;
  // movement input
  let mx=0,mz=0;
  if(INPUT.keys.down.fwd) mz+=1;
  if(INPUT.keys.down.back) mz-=1;
  if(INPUT.keys.down.left) mx-=1;
  if(INPUT.keys.down.right) mx+=1;
  if(G.isTouch&&INPUT.joy.active){ mx+=INPUT.joy.x; mz+=-INPUT.joy.y; }
  const m=Math.hypot(mx,mz);
  if(m>1){ mx/=m; mz/=m; }
  const blocked=UI.blocksMovement();
  if(blocked){ mx=0; mz=0; }
  const sy=Math.sin(C.yaw), cy=Math.cos(C.yaw);
  // camera forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw)
  const dirX=(-sy*mz + cy*mx);
  const dirZ=(-cy*mz - sy*mx);
  let nx=C.pos.x+dirX*spd*dt, nz=C.pos.z+dirZ*spd*dt;
  const moving=Math.hypot(dirX,dirZ)>0.02&&!blocked;
  if(!C.dead){
    const res=collide(nx,nz,0.34);
    nx=res.x; nz=res.z;
  }
  // keep inside the ship (ghosts may roam, but clamp far)
  const bb={x1:-53,z1:-24,x2:35,z2:21};
  if(!C.dead){ nx=clamp(nx,bb.x1,bb.x2); nz=clamp(nz,bb.z1,bb.z2); }
  else { nx=clamp(nx,-70,55); nz=clamp(nz,-45,40); }
  const realSpd=dt>0?Math.hypot(nx-C.pos.x,nz-C.pos.z)/dt:0;
  C.pos.x=nx; C.pos.z=nz;
  C.speed=realSpd;
  // head bob + footsteps
  if(moving&&G.client.headBob){
    C.bob+=dt*realSpd*2.6;
    C.stepPhase+=dt*realSpd*1.35;
    if(C.stepPhase>1){ C.stepPhase-=1; if(!C.inVent) AUDIO.step(realSpd/spd); }
  } else { C.stepPhase=0; C.bob+=dt*0.6; }
  // report to server
  G.net.send({t:'move',id:G.meId,x:C.pos.x,z:C.pos.z,yaw:C.yaw,vent:C.inVent,ventId:C.ventId,room:(G.M.roomAt(C.pos.x,C.pos.z)||{id:null}).id});
  updateCamera(dt,realSpd,moving);
}
function updateCamera(dt,spd,moving){
  const C=CLIENT;
  const cam=RENDER.camera;
  const bobY=G.client.headBob&&moving?Math.sin(C.bob*2.1)*0.035*Math.min(1,spd/3):0;
  const bobX=G.client.headBob&&moving?Math.cos(C.bob*1.05)*0.022*Math.min(1,spd/3):0;
  let eyeY=C.inVent?0.42:(C.dead?1.35:0.94);
  const shake=G.client.screenShake?C.shake:0;
  const sx=(Math.random()-0.5)*shake*0.25, sy=(Math.random()-0.5)*shake*0.25;
  C.shake=Math.max(0,C.shake-dt*3.2);
  if(G.client.thirdPerson&&!C.inVent){
    const dist=3.3, height=1.45;
    const dirX=Math.sin(C.yaw)*Math.cos(C.pitch), dirZ=Math.cos(C.yaw)*Math.cos(C.pitch);
    const dirY=Math.sin(C.pitch);
    let tx=C.pos.x-dirX*dist, ty=eyeY+height*0.55-dirY*dist*0.7, tz=C.pos.z-dirZ*dist;
    // pull in when a wall is behind us
    const steps=10; let best=1;
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const px=lerp(C.pos.x,tx,t), pz=lerp(C.pos.z,tz,t);
      if(!G.M.losClear(C.pos.x,C.pos.z,px,pz,SHIP.losExtra)){ best=Math.max(0.25,(i-1)/steps); break; }
    }
    tx=lerp(C.pos.x,tx,best); tz=lerp(C.pos.z,tz,best); ty=lerp(eyeY+0.2,ty,best);
    cam.position.set(tx+bobX*0.4,ty+bobY*0.4+sy,tz);
    cam.lookAt(C.pos.x,eyeY+0.12,C.pos.z);
    cam.rotation.z+=sx*0.05;
    showSelf(true);
  } else {
    cam.position.set(C.pos.x+bobX+sx*0.1,eyeY+bobY+sy,C.pos.z);
    cam.rotation.set(0,0,0);
    cam.rotateY(C.yaw);
    cam.rotateX(C.pitch);
    cam.rotateZ(sx*0.03+(moving?Math.sin(C.bob*1.05)*0.006:0));
    showSelf(false);
  }
  // FOV kick
  const targetFov=G.client.fov+(moving?1.6:0)+C.kick*7;
  cam.fov=lerp(cam.fov,targetFov,1-Math.pow(0.001,dt));
  cam.updateProjectionMatrix();
  C.kick=Math.max(0,C.kick-dt*3.4);
  // hands follow camera
  if(HANDS.group){
    HANDS.group.visible=!G.client.thirdPerson&&!C.inVent&&!UI.blocksInput();
    const t=performance.now()/1000;
    const sway=Math.sin(t*1.6)*0.006+(moving?Math.sin(C.bob*2.1)*0.012:0);
    HANDS.group.position.set(0.20+bobX*0.6+sway,-0.20+bobY*0.7-0.02,-0.34);
    HANDS.group.rotation.set(0.16+sway*1.4,-0.22+sway,-0.10);
    HANDS.anim=lerp(HANDS.anim,HANDS.target,1-Math.pow(0.0005,dt));
    HANDS.target=Math.max(0,HANDS.target-dt*4);
    const a=HANDS.anim;
    HANDS.group.position.z+= -a*0.22;
    HANDS.group.position.y+= a*0.06;
    HANDS.group.rotation.x-= a*0.5;
    HANDS.left.visible=a>0.02;
    if(HANDS.left.visible){
      HANDS.left.position.set(-0.20-bobX*0.6,-0.22+bobY*0.5,-0.32-a*0.2);
      HANDS.left.rotation.set(0.2,-0.1+ a*0.2,0.12);
    }
  }
}
function showSelf(on){
  const e=CLIENT.ents.get(G.meId);
  if(e) e.group.visible=on&&!CLIENT.inVent;
}
const HANDS={group:null,left:null,right:null,anim:0,target:0};
function buildHands(colorHex){
  if(HANDS.group){ RENDER.camera.remove(HANDS.group); }
  const grp=new THREE.Group();
  const r=makeHand(colorHex); grp.add(r);
  const l=makeHand(colorHex); l.visible=false; grp.add(l);
  grp.position.set(0.2,-0.2,-0.34);
  RENDER.camera.add(grp);
  HANDS.group=grp; HANDS.right=r; HANDS.left=l;
}
function punchHand(){ HANDS.target=1; AUDIO.blip(220,.05,'square',.05); }

/* ---------- interaction targeting ---------- */
const USE_RANGE=2.05, REPORT_RANGE=2.0, VENT_RANGE=1.7;
function dirOf(rotDeg){ const r=THREE.MathUtils.degToRad(rotDeg); return {x:Math.sin(r),z:Math.cos(r)}; }
function angleTo(x,z){
  const dx=x-CLIENT.pos.x, dz=z-CLIENT.pos.z;
  const fx=-Math.sin(CLIENT.yaw), fz=-Math.cos(CLIENT.yaw);
  const d=Math.hypot(dx,dz)||1;
  return Math.acos(clamp((dx/d*fx+dz/d*fz),-1,1));
}
function findTargets(){
  const C=CLIENT, me=G.me;
  C.useTarget=null; C.reportTarget=null; C.killTarget=null; C.ventTarget=null; C.doorTarget=null;
  if(!me||G.phase!=='playing') return;
  const px=C.pos.x,pz=C.pos.z;
  const impostor=me.role==='impostor'&&!C.dead;
  // bodies
  if(!C.dead){
    let best=null,bestD=1e9;
    for(const b of CLIENT.bodies){
      const d=Math.hypot(b.x-px,b.z-pz);
      if(d<REPORT_RANGE&&d<bestD&&angleTo(b.x,b.z)<1.5){ best=b; bestD=d; }
    }
    C.reportTarget=best;
  }
  // vents
  if(impostor&&!C.inVent){
    let best=null,bestD=1e9;
    for(const v of SHIP.vents){
      const d=Math.hypot(v.def.x-px,v.def.z-pz);
      if(d<VENT_RANGE&&d<bestD){ best=v; bestD=d; }
    }
    C.ventTarget=best;
  }
  // kill
  if(impostor&&!C.inVent&&SERVER.canKill(G.meId)){
    const range=KILL_DIST[G.settings.killDistance];
    let best=null,bestD=1e9;
    for(const p of SERVER.state.players){
      if(p.id===G.meId||!p.alive||p.role==='impostor') continue;
      const d=Math.hypot(p.x-px,p.z-pz);
      if(d<range+0.45&&d<bestD&&G.M.losClear(px,pz,p.x,p.z,SHIP.losExtra)){ best=p; bestD=d; }
    }
    C.killTarget=best;
  }
  // doors (only closed ones can be opened)
  if(!C.dead){
    for(const d of SHIP.doors){
      if(!d.def.closed) continue;
      const dd=Math.hypot(d.def.cx-px,d.def.cz-pz);
      if(dd<1.8&&angleTo(d.def.cx,d.def.cz)<1.4){ C.doorTarget=d; break; }
    }
  }
  // stations
  if(!C.inVent){
    let best=null,bestScore=1e9;
    for(const s of SHIP.stations){
      const d=Math.hypot(s.x-px,s.z-pz);
      if(d>USE_RANGE) continue;
      const a=s.kind==='emergency'||s.kind==='admintable'||s.kind==='cams'?angleTo(s.x,s.z):angleTo(s.x+dirOf(s.rot).x*0.5,s.z+dirOf(s.rot).z*0.5);
      const score=d*1.0+a*1.35;
      if(a>1.45&&d>1.2) continue;
      if(score<bestScore){ bestScore=score; best=s; }
    }
    if(best&&!SERVER.stationUsable(G.meId,best)){
      // keep the closest usable one instead
      let alt=null,altD=1e9;
      for(const s of SHIP.stations){
        const d=Math.hypot(s.x-px,s.z-pz);
        if(d>USE_RANGE||!SERVER.stationUsable(G.meId,s)) continue;
        if(d<altD){ altD=d; alt=s; }
      }
      best=alt;
    }
    C.useTarget=best;
  }
}
