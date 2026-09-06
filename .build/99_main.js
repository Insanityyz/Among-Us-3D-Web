/* ============================================================================
   10. Boot sequence + main loop
   ========================================================================== */
const LOOP={last:0,acc:0,screenAcc:0,fpsAcc:0,fpsN:0,ready:false};

function onResize(){
  const w=innerWidth,h=innerHeight;
  RENDER.w=w; RENDER.h=h;
  const r=RENDER.renderer;
  if(!r) return;
  r.setPixelRatio(RENDER.pixelRatio||1);
  r.setSize(w,h,false);
  RENDER.camera.aspect=w/Math.max(1,h);
  RENDER.camera.updateProjectionMatrix();
  if(RENDER.post) RENDER.post.setSize(w,h,RENDER.pixelRatio||1);
  if(RENDER.starMat&&RENDER.starMat.uniforms.px) RENDER.starMat.uniforms.px.value=RENDER.pixelRatio||1;
}

/* ---------- menu backdrop crew ---------- */
function buildMenuCrew(){
  const grp=new THREE.Group(); grp.name='menuCrew';
  const room=G.M.byId.cafeteria;
  const cx=room.bb.cx, cz=room.bb.cz;
  const n=6;
  for(let i=0;i<n;i++){
    const a=(i/n)*TAU+0.4;
    const c=makeCrewmate({color:COLORS[(i*3+2)%COLORS.length].hex,visor:VISORS[i%VISORS.length].hex,detail:22});
    c.position.set(cx+Math.cos(a)*1.9,0,cz+Math.sin(a)*1.9);
    c.rotation.y=Math.PI/2-a;   // face the table (model carries its own PI offset now)
    c.userData.baseA=a; c.userData.i=i;
    grp.add(c);
  }
  RENDER.scene.add(grp);
  Game.menuCrew=grp;
  return grp;
}
function updateMenuCrew(dt){
  const grp=Game.menuCrew;
  if(!grp||!grp.visible) return;
  const room=G.M.byId.cafeteria;
  const cx=room.bb.cx, cz=room.bb.cz;
  for(const c of grp.children){
    const i=c.userData.i, a=c.userData.baseA+G.time*0.09;
    const r=1.85+Math.sin(G.time*0.7+i)*0.14;
    c.position.set(cx+Math.cos(a)*r,Math.abs(Math.sin(G.time*2.2+i*1.7))*0.05,cz+Math.sin(a)*r);
    c.rotation.y=-a+Math.PI*0.5;
    const legs=c.userData.legs;
    if(legs){ const sw=Math.sin(G.time*4.4+i)*0.4; legs[0].rotation.x=sw; legs[1].rotation.x=-sw; }
  }
}

/* ---------- input intents ---------- */
function pollActions(){
  const pr=INPUT.keys.pressed;
  const any=Object.keys(pr).some(k=>pr[k]);
  if(!any) return;
  const blocked=UI.blocksInput();
  const meeting=G.phase==='meeting'&&MEET.active;
  if(meeting){
    if(pr.chat){ const f=document.getElementById('chatField'); if(f){ f.focus(); } }
    for(let i=1;i<=9;i++){
      if(pr['q'+i]){ const line=QUICK_CHAT[i-1]; if(line&&G.me&&G.me.alive) sendChat(line); }
    }
    if(pr.use&&!MEET.myVote){ /* nothing */ }
  } else if(!blocked){
    if(pr.use) Actions.use();
    if(pr.report) Actions.report();
    if(pr.kill) Actions.kill();
    if(pr.vent) Actions.vent();
    if(pr.sabotage) Actions.sabotage();
    if(pr.map) UI.toggleMap();
    if(pr.tasks) UI.toggleTaskList();
    if(pr.view){
      G.client.thirdPerson=!G.client.thirdPerson;
      Profile.save();
      UI.toast(G.client.thirdPerson?'Third person':'First person',null,1100);
    }
    if(pr.chat){ UI.toast('Chat is only available during meetings','warn',1300); }
  } else {
    if(pr.map&&G.phase==='playing') UI.toggleMap();
    if(pr.tasks&&G.phase==='playing') UI.toggleTaskList();
  }
  if(pr.lmb) {}
  INPUT.keys.pressed={};
}

/* ---------- world animation (doors, vents, consoles, decor) ---------- */
function updateWorldAnim(dt){
  const t=G.time;
  // doors
  for(const d of SHIP.doors){
    const k=1-Math.pow(0.0008,dt);
    d.open=lerp(d.open,d.target,k);
    const off=d.open*(d.w*0.52);
    for(const lf of d.leaves){
      lf.obj.position.x=lf.x+lf.dir*off;
      if(lf.led&&lf.led.material) lf.led.material.color.setHex(d.open>0.5?0x5ef08b:0xff5a5a);
    }
  }
  // vent rings
  const imp=G.me&&G.me.role==='impostor'&&G.me.alive;
  for(const v of SHIP.vents){
    const isTarget=imp&&!CLIENT.inVent&&CLIENT.ventTarget===v;
    const linked=CLIENT.inVent&&ventLinks(CLIENT.ventId).indexOf(v.def.id)>=0;
    const goal=(isTarget||linked)?(0.42+Math.sin(t*5.2)*0.22):0;
    v.ringMat.opacity=lerp(v.ringMat.opacity,goal,1-Math.pow(0.001,dt));
    if(goal>0.02){ v.ring.scale.setScalar(1+Math.sin(t*3.1)*0.05); }
  }
  // console glow pulse for the station you can use
  for(const s of SHIP.stations){
    if(!s.glow) continue;
    const on=(CLIENT.useTarget===s);
    const base=s.glow.userData.baseCol||(s.glow.userData.baseCol=s.glow.color.getHex());
    const pulse=on?(0.55+Math.sin(t*7)*0.45):0;
    const c=new THREE.Color(base);
    if(pulse>0) c.lerp(new THREE.Color(0xffffff),pulse*0.75);
    s.glow.color.copy(c);
  }
  // decor (reactor core + engine glow are animated by VISUAL.update)
  if(SHIP.reactorCore) SHIP.reactorCore.rotation.y+=dt*((SERVER&&SERVER.state.sab&&SERVER.state.sab.type==='reactor')?2.4:0.5);
  if(SHIP.navWheel) SHIP.navWheel.rotation.z-=dt*0.6;
  if(SHIP.o2Tree){ SHIP.o2Tree.rotation.y+=dt*0.25; }
  if(SHIP.turret){
    const sab=SERVER&&SERVER.state.sab&&SERVER.state.sab.type==='o2';
    SHIP.turret.rotation.y=Math.sin(t*(sab?1.6:0.35))*0.7;
  }
  // emergency lights flicker
  if(SERVER&&SERVER.state.sab&&SERVER.state.sab.type==='lights'){
    for(const l of SHIP.lights.emerg) l.intensity=Math.max(l.intensity,(0.6+Math.random()*1.9));
  }
  // space
  if(RENDER.skyMat) RENDER.skyMat.uniforms.time.value=t;
  if(RENDER.starMat) RENDER.starMat.uniforms.time.value=t;
}

/* ---------- in-world screens ---------- */
function updateScreens(dt){
  const S=SERVER?SERVER.state:null;
  const commsDown=!!(S&&S.sab&&S.sab.type==='comms');
  SCREENS.commsDown=commsDown;
  if(!S) return;
  LOOP.screenAcc+=dt;
  const fast=LOOP.screenAcc>0.09;
  if(!fast) return;
  LOOP.screenAcc=0;
  // admin table
  const ast=SHIP.stations.find(s=>s.kind==='admintable');
  const nearAdmin=ast?Math.hypot(ast.x-CLIENT.pos.x,ast.z-CLIENT.pos.z)<7:false;
  if((CLIENT.adminOpen||nearAdmin)&&SCREENS.adminTex){
    SCREENS.drawAdmin(S);
    SCREENS.adminTex.needsUpdate=true;
  }
  // vitals
  const vs=SHIP.stations.find(s=>s.kind==='vitals');
  const nearVit=vs?Math.hypot(vs.x-CLIENT.pos.x,vs.z-CLIENT.pos.z)<7:false;
  if((CLIENT.vitalsOpen||nearVit)&&SCREENS.vitalsTex){
    SCREENS.drawVitals(S);
    SCREENS.vitalsTex.needsUpdate=true;
  }
  // security monitors (always live unless comms are down)
  if(SCREENS.camActive||CLIENT.camsOpen||nearCams()){
    SCREENS.renderCam(RENDER.renderer,RENDER.scene);
  }
}
function nearCams(){
  const cs=SHIP.stations.find(s=>s.kind==='cams');
  return cs?Math.hypot(cs.x-CLIENT.pos.x,cs.z-CLIENT.pos.z)<8:false;
}

/* ---------- ambient audio ---------- */
function updateAmbience(dt){
  if(G.phase==='playing'){
    const crit=SERVER&&SERVER.state.sab&&(SERVER.state.sab.type==='reactor'||SERVER.state.sab.type==='o2');
    AUDIO.ambienceLevel(crit?0.42:(CLIENT.inVent?0.06:0.16));
  } else AUDIO.ambienceLevel(G.phase==='menu'?0.1:0);
}

/* ---------- main frame ---------- */
function frame(now){
  requestAnimationFrame(frame);
  // the render loop is the heartbeat of the whole game: an exception anywhere must not be
  // able to stop it, or the match freezes with no explanation. Capture and carry on.
  try{ frameBody(now); }
  catch(e){ errLog('frame',e); }
}
function frameBody(now){
  if(!LOOP.ready) return;
  let dt=(now-LOOP.last)/1000;
  LOOP.last=now;
  if(!isFinite(dt)||dt<=0) dt=0.016;
  dt=Math.min(dt,0.05);
  G.time+=dt;
  // fps
  LOOP.fpsAcc+=dt; LOOP.fpsN++;
  if(LOOP.fpsAcc>0.5){ G.fps=Math.round(LOOP.fpsN/LOOP.fpsAcc); LOOP.fpsAcc=0; LOOP.fpsN=0; }

  // --- simulation ---
  if(SERVER&&(G.phase==='playing'||G.phase==='meeting')) SERVER.tick(dt);

  // --- local player ---
  if(G.phase==='playing'){
    updateLocalPlayer(dt);
    findTargets();
    pollActions();
    updateEntities(dt);
    updateAmbience(dt);
    UI.updateHUD(dt);
  } else if(G.phase==='role'){
    Game.update(dt);
    pollActions();
  } else if(G.phase==='menu'){
    pollActions();
    updateMenuCrew(dt);
  } else if(G.phase==='meeting'||G.phase==='vote'){
    pollActions();
    MEET.update(dt);
    updateEntities(dt);
  } else if(G.phase==='eject'){
    pollActions();
  } else if(G.phase==='result'){
    pollActions();
  }
  INPUT.mouse.lmbPressed=false;

  // --- camera ---
  if(CAM.mode!=='player'&&CAM.mode!=='eject') updateCameraDirector(dt);

  // --- world visuals ---
  updateWorldAnim(dt);
  updateLighting(dt);
  VISUAL.update(dt);
  FX.update(dt);
  updatePostFlash(dt,RENDER.post.compMat.uniforms);
  TASKUI.update(dt);
  EJECT.update(dt);
  updateScreens(dt);
  if(G.client.thirdPerson&&G.phase==='playing') showSelf(true);

  // --- render ---
  if(RENDER.safeMode){
    // bypass the post chain entirely: straight to the canvas with three's own tone mapping
    RENDER.renderer.setRenderTarget(null);
    RENDER.renderer.render(RENDER.scene,RENDER.camera);
  } else {
    RENDER.post.render(RENDER.scene,RENDER.camera);
  }
  RENDER.drawCalls=RENDER.renderer.info.render.calls;
  if(typeof DIAG!=='undefined') DIAG.tick(dt);
}

/* ============================================================================
   Boot
   ========================================================================== */
async function boot(){
  const $=id=>document.getElementById(id);
  const setBoot=(pct,msg)=>{
    const f=$('bootFill'); if(f) f.style.width=Math.round(pct)+'%';
    if(msg){ const m=$('bootMsg'); if(m) m.textContent=msg; }
  };
  const yieldFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  try{
    setBoot(4,'Waking the renderer…');
    THREE=await loadThree((p,m)=>setBoot(p,m));
    initMathGlobals();
    setBoot(24,'Charting the ship…');
    await yieldFrame();
    G.M=buildMap(MAP);
    G.net=NET;
    refreshColliders();

    // canvas + renderer.
    // #gl in the markup IS the canvas we draw into. Never append a second canvas inside it:
    // children of a <canvas> are fallback content that browsers do not display, which shows up
    // as a permanently black viewport while the whole HUD keeps working.
    const canvas=$('gl');
    if(!canvas||canvas.tagName!=='CANVAS') throw new Error('#gl must be a <canvas> element');
    if(canvas.parentNode&&canvas.parentNode.tagName==='CANVAS') throw new Error('renderer canvas is nested inside another canvas');
    RENDER.canvas=canvas;
    const renderer=initRenderer(canvas);
    RENDER.post=new Post(renderer);
    RENDER.pixelRatio=Math.min(2,devicePixelRatio||1);
    RENDER.bloomOn=true;
    setBoot(34,'Mixing paints…');
    await yieldFrame();

    setBoot(42,'Polishing reflections…');
    await yieldFrame();
    RENDER.envTex=buildEnvMap(renderer);
    initMaterials(RENDER.scene);
    setBoot(56,'Opening the void…');
    await yieldFrame();
    buildSpace(RENDER.scene);
    setBoot(66,'Riveting the hull…');
    await yieldFrame();
    buildShip(RENDER.scene,G.M);
    refreshColliders();
    setBoot(80,'Wiring consoles…');
    await yieldFrame();
    FX.init(RENDER.scene);
    SCREENS.init();
    setBoot(88,'Calibrating HUD…');
    await yieldFrame();
    detectTouch();
    bindInput(canvas);
    UI.init();
    UI.buildSabIcons();
    Profile.load();
    Game.applyQuality();
    onResize();
    buildMenuCrew();
    setBoot(96,'Crew boarding…');
    await yieldFrame();

    addEventListener('resize',onResize);
    addEventListener('orientationchange',()=>setTimeout(onResize,220));
    // audio needs a gesture
    const kick=()=>{ AUDIO.init(); AUDIO.resume(); AUDIO.setVolumes(G.client.masterVol,G.client.sfxVol,G.client.musicVol);
      removeEventListener('pointerdown',kick); removeEventListener('keydown',kick); };
    addEventListener('pointerdown',kick,{once:false});
    addEventListener('keydown',kick,{once:false});
    addEventListener('beforeunload',()=>{ try{ G.net.send({t:'leave',id:G.meId}); }catch(e){} });

    // tell the player what we ended up running on
    const bi=$('buildInfo');
    if(bi) bi.innerHTML='Three.js r'+(THREE.REVISION||'?')+' &middot; '+(RENDER.isWebGL2?'WebGL2':'WebGL1')+
      ' &middot; '+(G.isTouch?'touch':'keyboard + mouse');

    // make sure the picture is really on screen — a silent black viewport is the worst failure mode
    if(typeof DIAG!=='undefined') DIAG.verifyCanvas();

    G.phase='menu';
    LOOP.last=performance.now();
    LOOP.ready=true;
    requestAnimationFrame(frame);
    Game.toMenu();
    setBoot(100,'Ready');
    setTimeout(()=>{ $('boot').classList.add('hidden'); },260);
    if(G.isTouch) UI.toast('Touch controls enabled — drag the right side to look',null,4200);
  }catch(err){
    console.error(err);
    const m=$('bootMsg');
    if(m){
      m.innerHTML='<b style="color:#ff6b6b">Boot failed.</b><br>'+
        String(err&&err.message?err.message:err)+'<br><br>'+
        '<span style="opacity:.75">This build streams Three.js from a CDN — check the network connection and reload.</span>';
    }
    const f=$('bootFill'); if(f) f.style.background='#c51111';
    const sp=document.querySelector('#boot .spinner'); if(sp) sp.style.display='none';
  }
}
boot();
