/* ============================================================================
   9. Game flow, client-side event handling, entity sync, actions
   ========================================================================== */
const Game={
  booted:false,heroCrew:null,menuCrew:null,heroLight:null,
  roster:[],
  toMenu(){
    G.phase='menu';
    this.roster=null;
    MEET.active=false; EJECT.active=false;
    document.getElementById('meeting').classList.add('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('eject').classList.add('hidden');
    UI.closeAllPanels();
    UI.showScreen('menu');
    UI.buildMenu();
    // menu backdrop = dollhouse view, so lift the roof off
    if(SHIP.meshes){ SHIP.meshes.ceil.visible=false; SHIP.meshes.hull.visible=false; }
    if(SHIP.group) SHIP.group.visible=true;
    if(this.menuCrew) this.menuCrew.visible=true;
    if(this.heroCrew) this.heroCrew.visible=false;
    CAM.mode='menu';
    CLIENT.ents.forEach((e,id)=>removeEnt(id));
    clearBodies();
    if(G.server) G.server.state.phase='idle';
    G.me=null;
    setLighting(1,0,false);
    RENDER.post.compMat.uniforms.dark.value=0;
    exitLock();
  },
  quickStart(freeplay){
    G.settings.freeplay=!!freeplay;
    G.settings.botCount=freeplay?Math.max(3,G.settings.botCount):G.settings.botCount;
    if(freeplay) G.settings.impostors=0;
    this.startMatch();
  },
  startFromLobby(){ this.startMatch(); },
  buildRoster(){
    const s=G.settings;
    const n=clamp(s.botCount,0,Math.max(0,(s.maxPlayers||10)-1));
    const roster=[];
    roster.push({id:'p0',name:Profile.name||'Player',color:Profile.color,visor:Profile.visor,isBot:false,isHost:true});
    const used=[Profile.color];
    // rotate the name pool from a random offset so crews vary between matches but stay stable in the lobby
    const off=(Math.random()*BOT_NAMES.length)|0;
    for(let i=0;i<n;i++){
      let col=(Profile.color+1+i*3+((Math.random()*3)|0))%COLORS.length;
      let guard=0;
      while(used.indexOf(col)>=0&&guard++<COLORS.length) col=(col+1)%COLORS.length;
      used.push(col);
      roster.push({id:'p'+(i+1),name:BOT_NAMES[(off+i)%BOT_NAMES.length],color:col,
        visor:(Math.random()*VISORS.length)|0,isBot:true});
    }
    return roster;
  },
  /* the lobby preview and the match must describe the very same crew */
  ensureRoster(){
    const want=1+clamp(G.settings.botCount,0,Math.max(0,(G.settings.maxPlayers||10)-1));
    if(!this.roster||this.roster.length!==want||this.roster[0].color!==Profile.color||this.roster[0].name!==Profile.name){
      this.roster=this.buildRoster();
    }
    return this.roster;
  },
  startMatch(){
    const roster=this.ensureRoster();
    G.settings.maxPlayers=Math.max(G.settings.maxPlayers,roster.length);
    if(G.settings.impostors>Math.max(1,Math.floor(roster.length/4))) G.settings.impostors=Math.max(1,Math.floor(roster.length/4));
    if(G.settings.freeplay) G.settings.impostors=0;
    // reset world
    CLIENT.ents.forEach((e,id)=>removeEnt(id));
    CLIENT.ents.clear(); clearBodies();
    CLIENT.dead=false; CLIENT.inVent=false; CLIENT.ventId=null;
    CLIENT.bodies.length=0;
    for(const d of G.M.doors) d.closed=false;
    for(const dm of SHIP.doors) dm.target=0;
    refreshColliders();
    VISUAL.scanT=0; VISUAL.shieldT=0;
    if(this.menuCrew) this.menuCrew.visible=false;
    if(SHIP.group) SHIP.group.visible=true;
    if(SHIP.meshes){ SHIP.meshes.ceil.visible=true; SHIP.meshes.hull.visible=true; }
    // authoritative server
    SERVER=new Server(G.M,G.settings,roster,(Date.now()&0x7fffffff));
    G.server=SERVER;
    NET.connectLocal(SERVER);
    _serverColliders=null;
    G.me=SERVER.p(G.meId);
    G.pendingResume=null; G.pendingOver=null;
    SERVER.start();
    G.me=SERVER.p(G.meId);
    // place client at spawn
    CLIENT.pos.x=G.me.x; CLIENT.pos.z=G.me.z; CLIENT.yaw=G.me.yaw; CLIENT.pitch=0;
    G.phase='role';
    UI.showScreen(null);
    ['boot','menu','lobby','meeting','eject','result','settings'].forEach(s=>document.getElementById(s).classList.add('hidden'));
    document.getElementById('hud').style.display='';
    this.beginRoleReveal();
  },
  beginRoleReveal(){
    const me=G.me;
    if(!me){ G.phase='playing'; return; }
    // hero crewmate + stage lighting
    if(!this.heroCrew){
      this.heroCrew=makeCrewmate({color:0xc61111,visor:0x8AD5F0,detail:26});
      RENDER.scene.add(this.heroCrew);
      this.heroLight=new THREE.SpotLight(0xffffff,60,26,0.7,0.5,1.4);
      this.heroLight.position.set(2.4,5.2,3.2);
      this.heroLight.target=this.heroCrew;
      RENDER.scene.add(this.heroLight);
      const rim=new THREE.PointLight(0x4d7dff,14,12,2); rim.position.set(-2.4,1.6,-2.6);
      RENDER.scene.add(rim); this.heroRim=rim;
      this.heroStage=1;
    }
    this.heroCrew.visible=true;
    this.heroCrew.position.set(0,0,0);
    this.heroCrew.rotation.set(0,0,0);
    this.heroCrew.scale.setScalar(1.25);
    setHeroColor(COLORS[me.color].hex,VISORS[me.visor||0].hex);
    this.heroLight.visible=true; if(this.heroRim)this.heroRim.visible=true;
    if(SHIP.group) SHIP.group.visible=false;
    CAM.mode='role'; CAM.t=0;
    const partners=G.server.state.players.filter(p=>p.role==='impostor').map(p=>({id:p.id,name:p.name,color:p.color}));
    UI.roleReveal(me.role,partners);
    this.roleT=0;
    INPUT.anyKey=false;
    AUDIO.init(); AUDIO.resume();
  },
  finishRoleReveal(){
    if(G.phase!=='role') return;
    G.phase='playing';
    INPUT.keys.pressed={}; INPUT.anyKey=false; INPUT.mouse.lmbPressed=false;
    document.getElementById('role').classList.add('hidden');
    if(this.heroCrew) this.heroCrew.visible=false;
    if(this.heroLight) this.heroLight.visible=false;
    if(this.heroRim) this.heroRim.visible=false;
    if(SHIP.group) SHIP.group.visible=true;
    CAM.mode='player';
    buildHands(COLORS[G.me.color].hex);
    // spawn entity views
    for(const p of G.server.state.players){ if(p.id!==G.meId) ensureEnt(p); }
    for(const b of G.server.state.bodies) spawnBodyVisual(b);
    UI.renderTaskList();
    UI.toast(G.me.role==='impostor'?'You are an Impostor — good luck':'Complete your tasks and find the impostors',
      G.me.role==='impostor'?'bad':'good',3200);
    if(!G.isTouch) requestLock();
    UI.fadeBlack(0.35,0.8);
    AUDIO.ambienceLevel(0.16);
  },
  applyQuality(){
    const q=G.client.quality;
    RENDER.quality=q;
    RENDER.pixelRatio=q==='high'?Math.min(2,devicePixelRatio||1):q==='medium'?Math.min(1.5,devicePixelRatio||1):Math.min(1,devicePixelRatio||1)*0.8;
    RENDER.bloomOn=!!G.client.bloom;
    if(RENDER.post) RENDER.post.setSize(innerWidth,innerHeight,RENDER.pixelRatio);
    // light budget
    const lights=SHIP.lights;
    if(lights&&lights.normal){
      lights.normal.forEach(l=>{
        const keep=q==='low'?(!l.userData.corr&&(l.userData.base>9)):true;
        l.visible=keep;
        l.intensity=q==='low'?l.userData.base*0.8:l.userData.base;
      });
      lights.amb.intensity=q==='low'?0.85:q==='medium'?0.62:0.5;
      lights.hemi.intensity=q==='low'?0.6:0.42;
    }
    if(RENDER.post){
      const u=RENDER.post.compMat.uniforms;
      u.grain.value=q==='low'?0.06:0.045;
      u.aberr.value=q==='high'?0.0018:q==='medium'?0.0012:0.0006;
    }
  },
  endMatch(){
    G.phase='result';
    UI.closeAllPanels();
    exitLock();
  },
  update(dt){
    if(G.phase==='role'){
      this.roleT+=dt;
      if(this.heroCrew){
        this.heroCrew.rotation.y=Math.sin(this.roleT*0.7)*0.5+this.roleT*0.12;
        this.heroCrew.position.y=Math.sin(this.roleT*1.4)*0.035;
      }
      if(this.roleT>0.9&&INPUT.anyKey) this.finishRoleReveal();
    }
  },
};
/* called by EJECT.end() — replay anything the server sent during the cutscene */
/* Last-resort recovery: put the client back into a playable state no matter what broke.
   The server keeps its own state and re-synchronises us with its next event. */
function forceResumePlay(reason){
  try{
    if(typeof EJECT!=='undefined'&&EJECT.active){ try{ EJECT.active=false; }catch(e){} }
    G.pendingResume=null; G.pendingOver=null;
    if(SHIP.meshes){ SHIP.meshes.ceil.visible=true; SHIP.meshes.hull.visible=true; }
    if(typeof MEET!=='undefined'&&MEET.active){ try{ MEET.finish(); }catch(e){} }
    const mEl=document.getElementById('meeting'); if(mEl) mEl.classList.add('hidden');
    const eEl=document.getElementById('eject'); if(eEl) eEl.classList.add('hidden');
    G.phase='playing';
    CAM.mode='player';
    UI.toast('Recovered from: '+reason,null,3200);
    if(!G.isTouch&&G.me&&G.me.alive&&typeof requestLock==='function') requestLock();
  }catch(e){ errLog('forceResumePlay',e); }
}
function afterEject(){
  if(G.pendingOver){ const e=G.pendingOver; G.pendingOver=null; G.pendingResume=null;
    Game.endMatch(); setTimeout(()=>UI.showResult(e),260); return; }
  if(G.pendingResume){ G.pendingResume=null;
    G.phase='playing';
    if(SHIP.meshes){ SHIP.meshes.ceil.visible=true; SHIP.meshes.hull.visible=true; }
    CAM.mode='player';
    if(!G.isTouch&&G.me&&G.me.alive) requestLock();
    UI.toast('Back to work','good',1400);
  }
}

function setHeroColor(colorHex,visorHex){
  const c=Game.heroCrew; if(!c) return;
  c.userData.bodyMat.color.set(colorHex);
  c.userData.darkMat.color.set(shade(colorHex,0.74));
  c.userData.vMat.color.set(visorHex);
}

/* ---------- player actions ---------- */
const Actions={
  use(){
    if(UI.blocksInput()) return;
    const C=CLIENT;
    if(C.inVent){ this.ventExit(); return; }
    if(C.doorTarget){ G.net.send({t:'door',id:G.meId,door:C.doorTarget.def.id}); AUDIO.door(false); punchHand(); return; }
    const st=C.useTarget;
    if(!st) { punchHand(); AUDIO.blip(300,.04,'sine',.04); return; }
    punchHand();
    openStation(st);
  },
  report(){
    if(UI.blocksInput()) return;
    const b=CLIENT.reportTarget;
    if(!b){ return; }
    AUDIO.report();
    G.net.send({t:'report',id:G.meId,body:b.id});
  },
  kill(){
    if(UI.blocksInput()) return;
    const v=CLIENT.killTarget;
    if(!v||!SERVER.canKill(G.meId)) { AUDIO.deny(); return; }
    G.net.send({t:'kill',id:G.meId,target:v.id});
    punchHand();
  },
  vent(){
    if(UI.blocksInput()) return;
    const me=G.me;
    if(!me||me.role!=='impostor'||!me.alive) return;
    if(CLIENT.inVent) this.ventExit();
    else if(CLIENT.ventTarget){
      G.net.send({t:'vent',id:G.meId,action:'enter'});
      AUDIO.vent(); VISUAL.ventPuff(CLIENT.ventTarget.def.x,CLIENT.ventTarget.def.z);
      CLIENT.inVent=true; CLIENT.ventId=CLIENT.ventTarget.def.id;
      UI.buildVentPanel();
    } else AUDIO.deny();
  },
  ventExit(){
    if(!CLIENT.inVent) return;
    G.net.send({t:'vent',id:G.meId,action:'exit'});
    AUDIO.vent();
    const v=ventById(CLIENT.ventId);
    if(v) VISUAL.ventPuff(v.x,v.z);
    CLIENT.inVent=false; CLIENT.ventId=null;
    UI.hideVentPanel();
  },
  ventTo(id){
    if(!CLIENT.inVent) return;
    const links=ventLinks(CLIENT.ventId);
    if(links.indexOf(id)<0) return;
    G.net.send({t:'vent',id:G.meId,action:'move',to:id});
    CLIENT.ventId=id;
    const v=ventById(id);
    if(v){ CLIENT.pos.x=v.x; CLIENT.pos.z=v.z; }
    AUDIO.vent();
    UI.buildVentPanel();
  },
  sabotage(){
    if(UI.blocksInput()) return;
    const me=G.me;
    if(!me||me.role!=='impostor'||!me.alive) return;
    UI.toggleMap(true,'sabotage');
  },
};
function openStation(st){
  const me=G.me, S=SERVER.state;
  if(!SERVER.stationUsable(G.meId,st)){ AUDIO.deny(); UI.toast('Nothing to do here','warn',1400); return; }
  const kind=st.kind;
  // system consoles (not tasks)
  if(kind==='admintable'){ CLIENT.adminOpen=true; SCREENS.camActive=false; UI.toast('Admin map online',null,1200); return; }
  if(kind==='vitals'){ CLIENT.vitalsOpen=true; UI.toast('Vitals online',null,1200); return; }
  if(kind==='cams'){ CLIENT.camsOpen=true; SCREENS.camActive=true; SCREENS.setCam(0); UI.toast('Security cameras online · 1-4 to switch',null,1800); return; }
  if(kind==='emergency'){
    TASKUI.open('emergency',{title:'Emergency Button',complete(){
      G.net.send({t:'emergency',id:G.meId});
    }});
    return;
  }
  if(kind==='lights'){
    TASKUI.open('lights',{title:'Fix Lights',loc:st.roomName,complete(){
      G.net.send({t:'fixSab',id:G.meId,type:'lights'});
    }});
    return;
  }
  if(kind==='comms'){
    TASKUI.open('comms',{title:'Repair Communications',loc:st.roomName,complete(){
      G.net.send({t:'fixSab',id:G.meId,type:'comms',part:'sliders'});
      G.net.send({t:'fixSab',id:G.meId,type:'comms',part:'pattern'});
    }});
    return;
  }
  if(kind==='o2panel'){
    const part=st.id==='s_o2_sab'?'o2':'admin';
    TASKUI.open('o2panel',{title:'Oxygen Console',loc:st.roomName,complete(code){
      G.net.send({t:'fixSab',id:G.meId,type:'o2',part,data:code});
    }});
    return;
  }
  if(kind==='reactor'&&S.sab&&S.sab.type==='reactor'){
    const part=st.id==='s_reac_a'?'a':'b';
    TASKUI.open('reactorSab',{title:'Reactor — Hand Scanner',loc:st.roomName,complete(){
      G.net.send({t:'fixSab',id:G.meId,type:'reactor',part});
    }});
    return;
  }
  // tasks
  const hit=SERVER.taskAtStation(me,st.id);
  if(!hit){ AUDIO.deny(); UI.toast(me.role==='impostor'?'Impostors cannot complete tasks':'Nothing to do at this console','warn',1600); return; }
  const task=hit.task, idx=hit.idx;
  const stageNo=task.stage+1, stageTot=task.stages.length;
  const panelKind=PANEL_FOR[task.key]||kind;
  const ctx={
    title:task.name,
    stageText:stageTot>1?`Stage ${stageNo} of ${stageTot}`:'',
    loc:st.roomName,
    foot:task.visual?'Visual task — other players can see this':'',
    task,idx,station:st,
    complete(extra){
      G.net.send({t:'taskStage',id:G.meId,taskIdx:idx});
      TASKUI.close(true);
      const t=me.tasks[idx];
      if(t){
        if(t.done){ UI.toast(`${t.name} complete`,'good',1800); }
        else {
          const nx=t.stages[t.stage];
          const nst=G.M.stById[nx.station];
          UI.toast(`${t.name} — stage ${t.stage+1}/${t.stages.length} · next: ${nst?nst.roomName:''}`,'good',2600);
        }
      }
      if(!G.isTouch) requestLock();
    },
    visual(){
      if(!G.settings.visualTasks) return;
      if(task.key==='garbage') VISUAL.trash(-12,10,2.0);
      if(task.key==='chute') VISUAL.trash(-11,15,1.6);
    },
  };
  if(panelKind==='transfer') ctx.upload=(task.key==='upload_data'&&task.stage===1);
  TASKUI.open(panelKind,ctx);
}
const PANEL_FOR={
  wiring:'wiring',swipe_card:'card',upload_data:'transfer',divert_power:'divert_stage',
  align_engine:'engine',calibrate:'distributor',chart_course:'chart',steering:'steering',
  asteroids:'asteroids',shields:'shields',scan:'scan',sample:'sample',reactor:'simon',
  manifolds:'manifolds',fuel:'fuel',garbage:'garbage',chute:'chute',o2filter:'filter',clean_vent:'ventclean',
};
/* station kind -> panel, resolved per stage */
function panelForTask(task){
  const st=G.M.stById[task.stages[task.stage].station];
  return st?st.kind:'download';
}

/* ============================================================================
   Client-side reaction to server events
   ========================================================================== */
NET.on(function(evt){
  // a throwing event handler used to strand the client mid-meeting with no feedback
  try{ onServerEvent(evt); }
  catch(e){ errLog('net:'+(evt&&evt.t),e); }
});
function onServerEvent(evt){
  const S=SERVER?SERVER.state:null;
  switch(evt.t){
    case 'start':{
      G.taskTotal=evt.taskTotal;
      break;
    }
    case 'role':{
      if(evt.id!==G.meId) break;
      break;
    }
    case 'taskbar':{
      break;
    }
    case 'taskProgress':{
      if(evt.id===G.meId){ UI.renderTaskList(); AUDIO.taskStage(); }
      break;
    }
    case 'deny':{
      if(evt.id===G.meId){ AUDIO.deny(); UI.toast(evt.msg,'warn',1600); }
      break;
    }
    case 'kill':{
      const killer=evt.killer, victim=evt.victim, body=evt.body;
      const e=CLIENT.ents.get(victim);
      if(e){ e.deathT=0.75; }
      if(killer===G.meId){
        VISUAL.killFx(body.x,body.z);
        AUDIO.kill();
        UI.toast('Target eliminated','bad',1500);
      } else {
        const d=dist2(CLIENT.pos.x,CLIENT.pos.z,body.x,body.z);
        if(d<22){ AUDIO.kill(); if(d<8){ CLIENT.shake=Math.min(1.2,CLIENT.shake+0.5); UI.damageFlash(0.25); } }
      }
      if(victim===G.meId){
        CLIENT.dead=true;
        UI.damageFlash(1);
        POST_FLASH(0.9,0xff2a18);
        CLIENT.shake=1.4;
        AUDIO.kill();
        const k=S.players.find(p=>p.id===killer);
        UI.toast(`You were killed by ${k?k.name:'an impostor'}`,'bad',4200);
        setTimeout(()=>{
          UI.toast('You are a ghost — finish your tasks to help the crew','warn',5200);
          G.client.thirdPerson=false;
        },1400);
      }
      break;
    }
    case 'bodies':{
      syncBodies(evt.bodies);
      break;
    }
    case 'vent':{
      const e=CLIENT.ents.get(evt.id);
      if(evt.action==='enter'){ if(e){ e.inVent=true; } if(evt.id!==G.meId) VISUAL.ventPuff(evt.x,evt.z);
        if(dist2(CLIENT.pos.x,CLIENT.pos.z,evt.x,evt.z)<14) AUDIO.vent(); }
      if(evt.action==='exit'){ if(e){ e.inVent=false; } if(evt.id!==G.meId) VISUAL.ventPuff(evt.x,evt.z); }
      if(evt.action==='move'&&e){ e.x=evt.x; e.z=evt.z; e.tx=evt.x; e.tz=evt.z; }
      break;
    }
    case 'sab':{
      applySabVisuals(evt.sab);
      if(evt.doors) applyDoors(evt.doors);
      break;
    }
    case 'sabUpdate':{
      break;
    }
    case 'sabEnd':{
      applySabVisuals(null);
      if(evt.doors) applyDoors(evt.doors);
      AUDIO.sabFixed();
      UI.toast('Sabotage repaired','good',1800);
      break;
    }
    case 'sabTimeout':{
      UI.toast('The crew failed to respond in time','bad',4000);
      break;
    }
    case 'doors':{
      applyDoors(evt.doors);
      break;
    }
    case 'meeting':{
      G.phase='meeting';
      CLIENT.inVent=false; CLIENT.ventId=null; UI.hideVentPanel();
      CLIENT.adminOpen=CLIENT.vitalsOpen=CLIENT.camsOpen=false; SCREENS.camActive=false;
      UI.closeAllPanels();
      MEET.start(evt);
      syncBodies(evt.bodies||[]);
      break;
    }
    case 'votePhase':{ MEET.votePhase(); break; }
    case 'meetingTimer':{ break; }
    case 'vote':{ MEET.onVote(evt); break; }
    case 'voteResult':{ MEET.result(evt); break; }
    case 'eject':{
      G.phase='eject';
      MEET.active=false;
      document.getElementById('meeting').classList.add('hidden');
      try{ EJECT.start(evt); }
      catch(e){
        errLog('EJECT.start',e);
        forceResumePlay('the ejection cutscene failed to start');
      }
      break;
    }
    case 'resume':{
      if(EJECT.active){ G.pendingResume=evt; break; }
      G.phase='playing';
      MEET.finish();
      if(SHIP.meshes){ SHIP.meshes.ceil.visible=true; SHIP.meshes.hull.visible=true; }
      CAM.mode='player';
      if(!G.isTouch&&G.me&&G.me.alive) requestLock();
      UI.toast('Back to work','good',1400);
      break;
    }
    case 'gameover':{
      if(EJECT.active){ G.pendingOver=evt; break; }
      Game.endMatch();
      setTimeout(()=>UI.showResult(evt),200);
      break;
    }
    case 'chat':{
      addChatMsg({id:evt.id,name:evt.name,color:evt.color,alive:evt.alive},evt.text);
      break;
    }
    case 'left':{
      const e=CLIENT.ents.get(evt.id);
      if(e) removeEnt(evt.id);
      break;
    }
  }
}
function syncBodies(list){
  const have=new Set(CLIENT.bodies.map(b=>b.id));
  const want=new Set(list.map(b=>b.id));
  for(const b of CLIENT.bodies.slice()) if(!want.has(b.id)){ RENDER.scene.remove(b.group); CLIENT.bodies.splice(CLIENT.bodies.indexOf(b),1); }
  for(const b of list) if(!have.has(b.id)) spawnBodyVisual(b);
}
function applyDoors(doors){
  let changed=false;
  for(const d of SHIP.doors){
    const closed=!!doors[d.def.id];
    if(d.def.closed!==closed){ d.def.closed=closed; d.target=closed?1:0; changed=true;
      if(dist2(CLIENT.pos.x,CLIENT.pos.z,d.def.cx,d.def.cz)<20) AUDIO.door(closed); }
  }
  if(changed) refreshColliders();
  _serverColliders=null;
  for(const d of G.M.doors) d.closed=!!doors[d.id];
}
function applySabVisuals(sab){
  const type=sab?sab.type:null;
  SAB.active=type;
  SAB.data=sab||null;
  if(type==='lights'){ AUDIO.sabotage('lights'); UI.toast('Lights sabotaged — repair them in Electrical','bad',3200); }
  else if(type==='reactor'){ AUDIO.sabotage('reactor'); UI.toast('REACTOR MELTDOWN — two crewmates must hold both scanners','bad',5000); }
  else if(type==='o2'){ AUDIO.sabotage('o2'); UI.toast('OXYGEN DEPLETED — enter the code at O2 and Admin','bad',5000); }
  else if(type==='comms'){ AUDIO.sabotage('comms'); UI.toast('Communications sabotaged — admin, vitals and cams are offline','bad',3200); }
  else if(type==='doors'){
    AUDIO.sabotage('doors');
    const rn=(sab.room&&G.M.byId[sab.room])?G.M.byId[sab.room].name:'';
    UI.toast(rn?rn+' doors sealed':'Doors sealed','warn',2200);
  }
  if(!type){}
}
const SAB={active:null,data:null,t:0};

/* ---------- lighting / vision ---------- */
let _lightState={n:1,e:0,dark:0};
function setLighting(normal,emerg,dark){ _lightState={n:normal,e:emerg,dark}; }
function updateLighting(dt){
  const S=SERVER?SERVER.state:null;
  const me=G.me;
  const lightsOut=!!(S&&S.sab&&S.sab.type==='lights');
  const vision=!me?1:(me.role==='impostor'?G.settings.impostorVision:G.settings.crewVision)*(me.alive?1:1.6);
  const targetN=lightsOut?0.05:1;
  const targetE=lightsOut?1.0:0;
  const k=1-Math.pow(0.0025,dt);
  const boost=RENDER.lightBoost||1;   // diagnostics / watchdog can crank this to prove lighting is the problem
  for(const l of SHIP.lights.normal) l.intensity=lerp(l.intensity,l.userData.base*(G.client.quality==='low'?0.8:1)*targetN*boost,k);
  for(const l of SHIP.lights.emerg) l.intensity=lerp(l.intensity,(lightsOut?2.6:0)*targetE*boost,k);
  SHIP.lights.amb.intensity=lerp(SHIP.lights.amb.intensity,(lightsOut?0.12:(G.client.quality==='low'?1.05:0.78))*boost,k);
  SHIP.lights.hemi.intensity=lerp(SHIP.lights.hemi.intensity,(lightsOut?0.14:0.6)*boost,k);
  // fog = vision
  const baseFog=0.0185;
  const fog=lightsOut?(me&&me.role==='impostor'?0.05:0.115):baseFog/clamp(vision,0.25,3);
  const fogTarget=RENDER.fogOff?0:(G.phase==='playing'?fog:0.006);
  RENDER.scene.fog.density=lerp(RENDER.scene.fog.density,fogTarget,1-Math.pow(0.02,dt));
  const u=RENDER.post.compMat.uniforms;
  const dark=lightsOut?(me&&me.role==='impostor'?0.16:(me&&me.alive?0.52:0.2)):0;
  u.dark.value=lerp(u.dark.value,dark,1-Math.pow(0.02,dt));
  u.vig.value=lerp(u.vig.value,lightsOut?1.2:0.62,1-Math.pow(0.05,dt));
  u.sat.value=lerp(u.sat.value,lightsOut?0.8:1.06,1-Math.pow(0.05,dt));
  const tint=lightsOut?[0.86,0.55,0.5]:[1,1,1];
  u.tint.value.set(lerp(u.tint.value.x,tint[0],k),lerp(u.tint.value.y,tint[1],k),lerp(u.tint.value.z,tint[2],k));
  // emergency strobe on critical sabotages
  const crit=S&&S.sab&&(S.sab.type==='reactor'||S.sab.type==='o2');
  if(crit){
    const pulse=Math.max(0,Math.sin(G.time*4.2));
    for(const l of SHIP.lights.emerg) l.intensity=Math.max(l.intensity,pulse*2.2);
    POST_FLASH(Math.max(0,pulse*0.06),0xff2a18);
  }
}

/* ---------- entity sync + animation ---------- */
function updateEntities(dt){
  const S=SERVER?SERVER.state:null;
  if(!S) return;
  const meGhost=CLIENT.dead;
  for(const p of S.players){
    if(p.id===G.meId){
      // keep the server copy in sync with the local simulation
      p.x=CLIENT.pos.x; p.z=CLIENT.pos.z; p.yaw=CLIENT.yaw; p.room=(G.M.roomAt(p.x,p.z)||{id:p.room}).id;
      p.vent=CLIENT.inVent; p.ventId=CLIENT.ventId;
      continue;
    }
    const e=ensureEnt(p);
    e.role=p.role; e.alive=p.alive; e.inVent=!!p.vent;
    e.tx=p.x; e.tz=p.z; e.tyaw=p.yaw;
    // smoothing
    const k=1-Math.pow(0.0009,dt);
    const px=e.x,pz=e.z;
    e.x=lerp(e.x,p.x,p.vent?1:k);
    e.z=lerp(e.z,p.z,p.vent?1:k);
    let dy=p.yaw-e.yaw;
    while(dy>Math.PI)dy-=TAU; while(dy<-Math.PI)dy+=TAU;
    e.yaw+=dy*Math.min(1,dt*13);
    const moved=Math.hypot(e.x-px,e.z-pz)/Math.max(dt,0.0001);
    e.speed=moved;
    // walk cycle
    e.walk+=dt*clamp(moved,0,6)*2.1;
    const legs=e.group.userData.legs;
    if(legs){
      const sw=Math.sin(e.walk*2.2)*clamp(moved/4.2,0,1)*0.62;
      legs[0].rotation.x=sw; legs[1].rotation.x=-sw;
      e.group.position.y=Math.abs(Math.sin(e.walk*2.2))*clamp(moved/5,0,1)*0.045;
    }
    e.group.position.x=e.x; e.group.position.z=e.z;
    // crewmates face where they walk
    e.group.rotation.y=e.yaw;
    // visibility rules: ghosts are invisible to the living; venting players are hidden
    const isGhost=!p.alive;
    let vis=!p.vent;
    if(isGhost&&!meGhost) vis=false;
    if(p.id===G.meId&&!G.client.thirdPerson) vis=false;
    e.group.visible=vis;
    // nametag
    if(e.tag){
      const d=Math.hypot(e.x-CLIENT.pos.x,e.z-CLIENT.pos.z);
      e.tag.visible=vis&&d<17&&G.phase==='playing';
      if(e.tag.visible){
        e.tag.material.opacity=clamp((17-d)/5,0.15,1)*(isGhost?0.55:1);
      }
    }
    // death animation
    if(e.deathT>0){
      e.deathT-=dt;
      const t=1-clamp(e.deathT/0.75,0,1);
      e.group.rotation.z=t*1.4;
      e.group.position.y=-t*0.35;
      e.group.scale.setScalar(1-t*0.12);
      if(e.deathT<=0){ e.group.visible=false; }
    } else if(!p.alive&&e.group.scale.x!==1){
      e.group.rotation.z=0; e.group.scale.setScalar(1); e.group.position.y=0;
      if(isGhost){ setGhostly(e.group,true); }
    }
    if(!p.alive&&isGhost&&meGhost&&!e._ghosted){ setGhostly(e.group,true); e._ghosted=true; }
  }
  // remove entities that no longer exist
  CLIENT.ents.forEach((e,id)=>{ if(!S.players.find(p=>p.id===id)) removeEnt(id); });
  // bodies bob slightly / fade in
  for(const b of CLIENT.bodies){
    if(b.spawn===undefined) b.spawn=0;
    if(b.spawn<1){ b.spawn=Math.min(1,b.spawn+dt*3); b.group.scale.setScalar(0.6+0.4*b.spawn); }
    if(b.group.userData.bone) b.group.userData.bone.rotation.z=-0.5+Math.sin(G.time*0.8+b.x)*0.02;
  }
}

/* ---------- vent overlay ---------- */
UI.buildVentPanel=function(){
  let el=document.getElementById('ventPanel');
  if(!el){
    el=mk(`<div id="ventPanel" class="pe" style="position:absolute;left:50%;bottom:130px;transform:translateX(-50%);
      display:flex;gap:10px;align-items:center;background:rgba(6,14,10,.86);border-radius:16px;padding:10px 14px;
      box-shadow:inset 0 0 0 2px rgba(94,240,139,.4),0 12px 30px rgba(0,0,0,.6)"></div>`);
    document.getElementById('hud').appendChild(el);
  }
  const v=ventById(CLIENT.ventId);
  const links=ventLinks(CLIENT.ventId);
  el.innerHTML=`<div style="font-size:11px;letter-spacing:.2em;color:#9fe8c0;text-transform:uppercase;font-weight:900">In vent · ${v?(G.M.byId[v.room]||{name:'Hall'}).name:''}</div>`;
  links.forEach(id=>{
    const t=ventById(id);
    const room=(G.M.byId[t.room]||{name:'Hallway'}).name;
    const b=mk(`<button class="btn sm green">${esc(room)}</button>`);
    b.onclick=()=>Actions.ventTo(id);
    el.appendChild(b);
  });
  const ex=mk(`<button class="btn sm ghost">Exit vent (V)</button>`);
  ex.onclick=()=>Actions.ventExit();
  el.appendChild(ex);
  el.style.display='flex';
};
UI.hideVentPanel=function(){ const el=document.getElementById('ventPanel'); if(el) el.style.display='none'; };
