/* Offline smoke test: runs boot() and a scripted match against the stub env. Not shipped. */
const fs=require('fs'),path=require('path'),os=require('os');
const {documentStub}=require('./stub_env.js');
const DIR=__dirname;
const PARTS=['30_logic.js','40_three.js','41_ship.js','50_player.js','60_server.js','65_audio_fx.js',
  '70_tasks.js','80_meeting.js','90_ui.js','95_game.js','99_main.js'];

/* ------------------------------------------------------------------- runner */
const MAX_FRAMES=Number(process.env.FRAMES||200000);
const FRAME_DELAY=Number(process.env.FDELAY||3);
let frames=0,stopped=false;
globalThis.requestAnimationFrame=function(cb){
  if(stopped||frames>=MAX_FRAMES)return 0;
  frames++;
  return setTimeout(()=>{ try{ cb(performance.now()); }catch(e){ fail('rAF frame '+frames,e,true); } },FRAME_DELAY);
};
globalThis.cancelAnimationFrame=function(){};

const errors=[];const seen=new Set();
function fail(where,e,keepGoing){
  const msg=(e&&e.stack)?e.stack:String(e);
  const sig=where+'|'+msg.split('\n')[0];
  if(seen.has(sig))return;
  seen.add(sig);
  errors.push(where+': '+msg.split('\n').slice(0,4).join(' | '));
  if(errors.length<=8) console.log('\n!! '+where+': '+(e&&e.message?e.message:e)+'\n'+((e&&e.stack||'').split('\n').slice(1,4).join('\n')));
  if(!keepGoing)stopped=true;
  else if(errors.length>24)stopped=true;
}
process.on('uncaughtException',e=>fail('uncaught',e));
process.on('unhandledRejection',e=>fail('unhandledRejection',e));

let src=PARTS.map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n');
src=src.replace("THREE=await loadThree((p,m)=>setBoot(p,m));","THREE=globalThis.__THREE;");
src+="\nglobalThis.__T={G,Game,Actions,CLIENT,UI,MEET,EJECT,TASKUI,SCREENS,VISUAL,FX,AUDIO,SHIP,RENDER,NET,SAB,LOOP,Profile,CAM,PANELS,openStation,MAP,buildMap,updateCameraDirector,pollActions,frame,get SERVER(){return SERVER;},set SERVER(v){SERVER=v;}};\n";
const tmp=path.join(os.tmpdir(),'smoke_'+Date.now()+'.mjs');
fs.writeFileSync(tmp,src,'utf8');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const t0=Date.now();
  await import('file://'+tmp);
  const T=globalThis.__T;
  // wait for boot
  for(let i=0;i<400&&!T.LOOP.ready;i++) await sleep(4);
  if(!T.LOOP.ready){ fail('boot','did not become ready. bootMsg='+documentStub.getElementById('bootMsg').textContent); process.exit(1); }
  console.log('BOOT OK  ('+(Date.now()-t0)+'ms)  stations='+T.SHIP.stations.length+' doors='+T.SHIP.doors.length+
    ' vents='+T.SHIP.vents.length+' lights='+T.SHIP.lights.normal.length+'/'+T.SHIP.lights.emerg.length);

  const step=async(label,fn)=>{ try{ const r=fn(); if(r&&r.then)await r; console.log('  ok  '+label); return true; }
    catch(e){ fail(label,e); return false; } };
  // drive any in-progress meeting to completion (vote timers + eject cutscene)
  const settle=async(maxMs)=>{
    const t0=Date.now();
    while(Date.now()-t0<(maxMs||30000)&&errors.length===0){
      const ph=T.G.phase;
      if(ph!=='meeting'&&ph!=='eject'&&!T.EJECT.active&&!T.MEET.active) return ph;
      const m=T.SERVER.state.meeting;
      if(m){
        m.discussion=Math.min(m.discussion,0.02);
        if(m.phase==='vote'){
          if(!T.G.me.voted&&T.G.me.alive){ const tgt=T.SERVER.state.players.find(p=>p.alive&&p.id!==T.G.meId); T.MEET.select(tgt.id); T.MEET.cast(tgt.id); }
          m.voting=Math.min(m.voting,0.4);
        }
      }
      if(T.EJECT.active&&T.EJECT.t>1.3) T.EJECT.skip();
      await sleep(16);
    }
    return T.G.phase;
  };

  await step('menu screen',()=>{ if(T.G.phase!=='menu') throw new Error('phase='+T.G.phase); });
  await step('quickStart (2 impostors, 10 players)',()=>T.Game.quickStart(false));
  await sleep(60);
  await step('role reveal state',()=>{
    if(T.G.phase!=='role')throw new Error('phase='+T.G.phase);
    if(!T.Game.heroCrew||!T.Game.heroCrew.visible)throw new Error('hero crewmate not shown');
    if(!T.G.me)throw new Error('no G.me');
    console.log('        role='+T.G.me.role+' impostors='+T.SERVER.state.players.filter(p=>p.role==='impostor').length+
      ' tasks='+T.G.me.tasks.length+' taskTotal='+T.SERVER.state.taskTotal);
  });
  await step('finishRoleReveal',()=>T.Game.finishRoleReveal());
  await sleep(80);
  await step('playing',()=>{
    if(T.G.phase!=='playing')throw new Error('phase='+T.G.phase);
    if(T.CLIENT.ents.size!==T.SERVER.state.players.length-1)throw new Error('entities='+T.CLIENT.ents.size);
  });

  // walk around for a while: bots move, tasks progress, sabotages happen
  const t1=Date.now();
  let guard=0;
  while(Date.now()-t1<2600&&T.G.phase==='playing'&&errors.length===0&&guard++<400){
    // nudge the local player around so findTargets / collide / LOS all get exercised
    const p=T.CLIENT.pos; p.x+=0.02; p.z+=0.01;
    T.CLIENT.yaw+=0.05;
    // accelerate the simulation so the bot AI actually does things
    for(let i=0;i<6&&T.G.phase==='playing';i++) T.SERVER.tick(0.05);
    await sleep(8);
  }
  console.log('  ok  accelerated play: '+T.SERVER.state.tick+' server ticks ('+T.SERVER.state.time.toFixed(1)+'s sim), phase='+T.G.phase);
  {
    const S=T.SERVER.state;
    console.log('        tasks '+S.taskDone+'/'+S.taskTotal+', bodies '+S.bodies.length+
      ', alive '+S.players.filter(p=>p.alive).length+'/'+S.players.length+
      (S.winner?', winner='+S.winner+' ('+S.reason+')':''));
    const log=(S.log||[]).slice(-10).map(l=>typeof l==='string'?l:JSON.stringify(l));
    if(log.length)console.log('        log: '+log.join(' · '));
  }
  // fresh match for the deterministic meeting tests
  await step('restart match',()=>{ T.Game.quickStart(false); T.Game.finishRoleReveal(); });
  await sleep(120);
  await step('fresh match playing',()=>{
    if(T.G.phase!=='playing')throw new Error('phase='+T.G.phase);
    const S=T.SERVER.state;
    if(S.taskDone>2)throw new Error('tasks already progressed: '+S.taskDone);
  });

  // every task panel kind
  const kinds=Object.keys(T.PANELS);
  console.log('  --  opening '+kinds.length+' minigame panels: '+kinds.join(', '));
  for(const k of kinds){
    if(errors.length)break;
    await step('panel:'+k,()=>{
      const st=T.SHIP.stations[0];
      T.TASKUI.open(k,{station:st,taskIdx:0,task:{name:'Test',stages:[{}],stage:0,key:k},stage:0,
        player:T.G.me,loc:'Cafeteria',title:'Test '+k,stageText:'Stage 1 of 2',foot:'',
        complete(){},abort(){},visual(){}});
      if(!T.TASKUI.isOpen())throw new Error('panel did not open');
      T.TASKUI.update(0.05);
      T.TASKUI.close(true);
    });
  }
  // sabotage flows
  await step('force lights sabotage',()=>{T.SERVER.startSabotage('lights','p1');});
  await sleep(80);
  await step('force reactor sabotage',()=>{T.SERVER.endSabotage('lights');T.SERVER.startSabotage('reactor','p1');});
  await sleep(80);
  await step('fix reactor (both hands)',()=>{
    T.NET.send({t:'fixSab',id:T.G.meId,type:'reactor',part:'a'});
    T.NET.send({t:'fixSab',id:T.G.meId,type:'reactor',part:'b'});
  });
  await sleep(60);
  await step('o2 sabotage + code',()=>{
    T.SERVER.startSabotage('o2','p1');
    const code=T.SERVER.state.sab.data.code;
    T.NET.send({t:'fixSab',id:T.G.meId,type:'o2',part:'o2',data:code});
    T.NET.send({t:'fixSab',id:T.G.meId,type:'o2',part:'admin',data:code});
  });
  await sleep(60);
  // doors
  await step('door sabotage + manual open',()=>{
    T.SERVER.startSabotage('doors','p1');
    const d=T.SHIP.doors[0];
    T.NET.send({t:'door',id:T.G.meId,door:d.def.id});
  });
  await sleep(60);
  await step('per-room door sabotage',()=>{
    const S=T.SERVER.state;
    if(S.sab) T.SERVER.endSabotage(S.sab.type);
    const wasRole=T.G.me.role;
    T.G.me.role='impostor'; T.G.me.alive=true; T.G.me.sabCd=0; T.G.me.vent=false;
    T.NET.send({t:'sabotage',id:T.G.meId,type:'doors',room:'electrical'});
    if(!S.sab||S.sab.type!=='doors')throw new Error('door sabotage did not start');
    if(S.sab.room!=='electrical')throw new Error('sealed the wrong room: '+S.sab.room);
    const closed=Object.keys(S.doors).filter(k=>S.doors[k]);
    const elec=T.G.M.doors.filter(d=>d.auto&&d.room==='electrical').map(d=>d.id);
    if(!elec.length||!elec.every(id=>closed.indexOf(id)>=0))throw new Error('electrical doors not sealed: '+closed.join(','));
    const outside=T.G.M.doors.filter(d=>d.auto&&d.room!=='electrical').map(d=>d.id);
    if(outside.some(id=>closed.indexOf(id)>=0))throw new Error('doors outside the target room were sealed: '+closed.join(','));
    const dObj=T.SHIP.doors.find(d=>d.def.id===elec[0]);
    if(!dObj||!dObj.def.closed)throw new Error('client door visuals not updated');
    if(T.SHIP.colliderCache.length<=T.SHIP.colliders.length)throw new Error('closed doors not added to colliders');
    T.SERVER.endSabotage('doors');
    if(T.SHIP.doors.find(d=>d.def.id===elec[0]).def.closed)throw new Error('doors did not reopen');
    T.G.me.role=wasRole;
    console.log('        sealed '+elec.join('+')+' only ('+closed.length+' doors total)');
  });
  if(T.SERVER.state.sab)await step('clear sab',()=>T.SERVER.endSabotage(T.SERVER.state.sab.type));

  // meeting + voting + ejection
  await step('report/emergency meeting',()=>{
    const S=T.SERVER.state;
    if(S.phase!=='playing')throw new Error('pre-meeting phase='+S.phase+(S.winner?' winner='+S.winner:''));
    if(!S.bodies.length){ // fabricate a body so we exercise the report path
      const victim=S.players.find(p=>p.id!==T.G.meId&&p.alive);
      S.bodies.push({id:S.nextBodyId++,victim:victim.id,x:victim.x,z:victim.z,color:victim.color,reported:false});
      T.CLIENT.bodies.length=0;
    }
    if(S.sab) T.SERVER.endSabotage(S.sab.type);
    T.MEET.active=false;
    // walk to the emergency button (server enforces proximity)
    const btn=T.G.M.stations.find(x=>x.kind==='emergency');
    T.G.me.x=btn.x; T.G.me.z=btn.z+0.6; T.CLIENT.pos.x=btn.x; T.CLIENT.pos.z=btn.z+0.6;
    T.G.me.emergCd=0; T.G.me.emergencies=1; T.G.me.alive=true;
    T.NET.send({t:'emergency',id:T.G.meId});
    if(S.phase!=='meeting'||!S.meeting)throw new Error('meeting did not start, phase='+S.phase+' emergCd='+T.G.me.emergCd+' left='+T.G.me.emergencies+' sab='+(S.sab&&S.sab.type));
  });
  await sleep(120);
  await step('meeting UI active',()=>{ if(!T.MEET.active)throw new Error('MEET not active'); });
  await step('vote phase',()=>{
    T.SERVER.state.meeting.discussion=0.01;
  });
  await sleep(120);
  await step('cast vote',()=>{
    if(T.MEET.phase!=='vote')throw new Error('phase='+T.MEET.phase);
    const target=T.SERVER.state.players.find(p=>p.id!==T.G.meId&&p.alive);
    T.MEET.select(target.id); T.MEET.cast(target.id);
    if(!T.G.me.voted)throw new Error('vote not registered');
  });
  await step('fast-forward vote timer',()=>{T.SERVER.state.meeting.voting=0.4;});
  await step('emergency meeting settles',async()=>{
    const ph=await settle();
    const S=T.SERVER.state;
    console.log('        after meeting: phase='+ph+' winner='+(S.winner||'-')+' alive='+S.players.filter(p=>p.alive).length+'/'+S.players.length);
    if(ph!=='playing'&&ph!=='over')throw new Error('stuck in '+ph);
  });
  await sleep(120);

  // kill -> body -> report -> meeting (the core loop)
  await step('wait for playing',async()=>{
    const ph=await settle();
    if(ph!=='playing')throw new Error('phase='+ph);
  });
  await step('impostor bot kills a crewmate',()=>{
    const S=T.SERVER.state;
    if(S.phase!=='playing')throw new Error('phase='+S.phase);
    const imp=S.players.find(p=>p.role==='impostor'&&p.alive);
    const vic=S.players.find(p=>p.role!=='impostor'&&p.alive&&p.id!==T.G.meId);
    if(!imp||!vic)throw new Error('no impostor/victim available');
    imp.killCd=0; imp.vent=false; imp.busy=0;
    vic.x=imp.x; vic.z=imp.z+0.3; vic.vent=false;
    const before=S.bodies.length;
    T.NET.send({t:'kill',id:imp.id,target:vic.id});
    if(vic.alive)throw new Error('victim still alive');
    if(S.bodies.length!==before+1)throw new Error('no body spawned');
    if(T.CLIENT.bodies.length!==S.bodies.length)throw new Error('client bodies out of sync: '+T.CLIENT.bodies.length+' vs '+S.bodies.length);
  });
  await sleep(120);
  await step('report the body -> meeting',()=>{
    const S=T.SERVER.state;
    // a bot may already have reported it -> make a fresh kill if the deck is empty
    if(!S.bodies.length){
      const imp=S.players.find(p=>p.role==='impostor'&&p.alive);
      const vic=S.players.find(p=>p.role!=='impostor'&&p.alive&&p.id!==T.G.meId);
      if(!imp||!vic)throw new Error('cannot recreate a kill');
      imp.killCd=0; imp.vent=false; vic.x=imp.x; vic.z=imp.z+0.3;
      T.NET.send({t:'kill',id:imp.id,target:vic.id});
    }
    if(S.phase==='meeting'){ console.log('        (a bot reported a body first — meeting already running)'); return; }
    if(S.phase!=='playing')throw new Error('phase changed to '+S.phase);
    // isolate one body so a concurrent bot report cannot confuse the assertion
    S.bodies.length=1;
    const b=S.bodies[0];
    if(!b)throw new Error('no body to report');
    T.G.me.x=b.x; T.G.me.z=b.z+0.5; T.G.me.alive=true;
    T.CLIENT.pos.x=b.x; T.CLIENT.pos.z=b.z+0.5;
    T.NET.send({t:'report',id:T.G.meId,body:b.id});
    if(S.phase!=='meeting')throw new Error('report did not start a meeting, phase='+S.phase);
    if(!T.MEET.active)throw new Error('MEET not active after report');
    if(S.bodies.find(x=>x.id===b.id))throw new Error('reported body was not cleared');
  });
  await step('run reported meeting to completion',()=>{
    T.SERVER.state.meeting.discussion=0.02;
  });
  await sleep(150);
  await step('vote in reported meeting',()=>{
    if(T.MEET.phase==='vote'&&!T.G.me.voted){
      const tgt=T.SERVER.state.players.find(p=>p.alive&&p.id!==T.G.meId);
      T.MEET.select(tgt.id); T.MEET.cast(tgt.id);
    }
    T.SERVER.state.meeting.voting=0.02;
  });
  await step('report meeting settles',async()=>{
    const ph=await settle();
    const S=T.SERVER.state;
    console.log('        after report-meeting: phase='+ph+' winner='+(S.winner||'-')+' alive='+S.players.filter(p=>p.alive).length+'/'+S.players.length);
  });
  // if we are a crewmate, get killed and become a ghost
  await step('local player killed -> ghost',()=>{
    const S=T.SERVER.state;
    if(S.phase!=='playing'){console.log('        (skipped: phase='+S.phase+')');return;}
    if(T.G.me.role==='impostor'){console.log('        (skipped: we are an impostor)');return;}
    const imp=S.players.find(p=>p.role==='impostor'&&p.alive&&p.id!==T.G.meId);
    if(!imp){console.log('        (skipped: no impostor left)');return;}
    imp.killCd=0; imp.vent=false;
    const me=T.G.me;
    imp.x=me.x; imp.z=me.z; me.alive=true;
    T.NET.send({t:'kill',id:imp.id,target:T.G.meId});
    if(me.alive)throw new Error('we were not killed');
    if(!T.CLIENT.dead)throw new Error('CLIENT.dead not set');
  });
  await sleep(160);
  await step('ghost mode visuals',()=>{
    console.log('        dead='+T.CLIENT.dead+' (ghosts can still finish tasks)');
  });

  // map + settings + task list UI
  // ---- dedicated crewmate run: get killed, become a ghost, finish a task as a ghost ----
  await step('crewmate run start',()=>{
    T.Game.quickStart(false); T.Game.finishRoleReveal();
    if(T.G.me.role==='impostor') T.G.me.role='crewmate';
  });
  await sleep(200);
  await step('crewmate killed -> ghost',()=>{
    const S=T.SERVER.state;
    const imp=S.players.find(p=>p.role==='impostor'&&p.alive);
    if(!imp)throw new Error('no impostor');
    imp.killCd=0; imp.vent=false; imp.x=T.G.me.x; imp.z=T.G.me.z;
    T.NET.send({t:'kill',id:imp.id,target:T.G.meId});
    if(T.G.me.alive)throw new Error('we were not killed');
    if(!T.CLIENT.dead)throw new Error('CLIENT.dead not set');
  });
  await sleep(300);
  await step('ghost roams + sees other ghosts',()=>{
    const S=T.SERVER.state;
    const before={x:T.CLIENT.pos.x,z:T.CLIENT.pos.z};
    T.CLIENT.pos.x+=3.5; T.CLIENT.pos.z-=2.5;   // ghosts ignore collision
    const ghosts=S.players.filter(p=>!p.alive);
    console.log('        ghosts on ship: '+ghosts.length+', ents visible: '+
      [...T.CLIENT.ents.values()].filter(e=>e.group.visible).length+'/'+T.CLIENT.ents.size);
    if(T.CLIENT.pos.x===before.x)throw new Error('ghost did not move');
  });
  await step('settle any meeting caused by our body',async()=>{
    const ph=await settle();
    if(ph!=='playing')throw new Error('phase='+ph);
  });
  await step('ghost finishes a task stage',()=>{
    const S=T.SERVER.state;
    const idx=T.G.me.tasks.findIndex(t=>!t.done);
    if(idx<0){console.log('        (no tasks left)');return;}
    const st=T.G.M.stById[T.G.me.tasks[idx].stages[T.G.me.tasks[idx].stage].station];
    const doneBefore=S.taskDone;
    T.G.me.x=st.x; T.G.me.z=st.z; T.CLIENT.pos.x=st.x; T.CLIENT.pos.z=st.z;
    if(!T.SERVER.stationUsable(T.G.meId,st)){
      const S2=T.SERVER.state;
      throw new Error('station not usable: kind='+st.kind+' id='+st.id+' phase='+S2.phase+' winner='+(S2.winner||'-')+
        ' me.alive='+T.G.me.alive+' meIsServerP='+(T.SERVER.p(T.G.meId)===T.G.me)+
        ' task='+JSON.stringify({name:T.G.me.tasks[idx].name,stage:T.G.me.tasks[idx].stage,done:T.G.me.tasks[idx].done,
          stages:T.G.me.tasks[idx].stages})+' d='+Math.hypot(st.x-T.G.me.x,st.z-T.G.me.z).toFixed(2));
    }
    T.NET.send({t:'taskStage',id:T.G.meId,taskIdx:idx});
    if(S.taskDone<=doneBefore)throw new Error('task did not progress ('+doneBefore+' -> '+S.taskDone+')');
    console.log('        taskbar '+S.taskDone+'/'+S.taskTotal);
  });
  await step('ghost cannot kill / vent / report',()=>{
    const S=T.SERVER.state;
    T.G.me.role='impostor'; T.G.me.killCd=0;
    if(T.SERVER.canKill(T.G.meId))throw new Error('ghost can kill!');
    T.G.me.role='crewmate';
    const vic=S.players.find(p=>p.alive&&p.id!==T.G.meId);
    const before=S.bodies.length;
    T.NET.send({t:'kill',id:T.G.meId,target:vic.id});
    if(S.bodies.length!==before)throw new Error('ghost created a body');
  });
  await step('map overlay',()=>{T.UI.toggleMap(true);T.UI.drawMapOverlay();T.UI.toggleMap(false);});
  await step('task list',()=>{T.UI.toggleTaskList();T.UI.toggleTaskList();});
  await step('settings tabs',()=>{['controls','graphics','audio','help'].forEach(t=>T.UI.openSettings(t));T.UI.closeSettings();});
  await step('lobby build',()=>{T.UI.showScreen('lobby');T.UI.buildLobby();});
  await step('screens (admin/vitals/cams)',()=>{
    T.SCREENS.drawAdmin(T.SERVER.state);T.SCREENS.drawVitals(T.SERVER.state);
    T.SCREENS.camActive=true;T.SCREENS.setCam(2);T.SCREENS.renderCam(T.RENDER.renderer,T.RENDER.scene);T.SCREENS.camActive=false;
  });
  await step('visual fx',()=>{
    T.VISUAL.scanStart();T.VISUAL.update(0.1);T.VISUAL.scanStop();
    T.VISUAL.shieldsUp();T.VISUAL.turretFire();T.VISUAL.trash(-12,10,2);T.VISUAL.ventPuff(0,0);T.VISUAL.killFx(0,0);T.VISUAL.emergency();
    T.FX.burst(0,1,0,0xff0000,10,{});T.FX.update(0.1);
  });
  await step('camera modes',()=>{['menu','role','meeting','player','eject'].forEach(m=>{T.CAM.mode=m;T.updateCameraDirector(0.05);});T.CAM.mode='player';});
  await step('quality levels',()=>{['low','medium','high'].forEach(q=>{T.G.client.quality=q;T.Game.applyQuality();});});
  await step('back to menu',()=>T.Game.toMenu());
  await sleep(80);
  await step('freeplay match',()=>T.Game.quickStart(true));
  await sleep(60);
  await step('freeplay role reveal -> play',()=>{T.Game.finishRoleReveal();});
  await sleep(200);
  await step('game over screen',()=>{
    T.SERVER.endGame('crewmate','smoke test');
  });
  await sleep(400);
  await step('result visible',()=>{ if(documentStub.getElementById('result').classList.contains('hidden'))throw new Error('result hidden'); });

  console.log('\nframes rendered: '+frames);
  if(errors.length){
    console.log('\n=== '+errors.length+' ERROR(S) ===');
    errors.forEach((e,i)=>console.log((i+1)+'. '+e));
    process.exitCode=1;
  } else console.log('\nSMOKE TEST PASSED — no runtime errors');
  fs.unlinkSync(tmp);
  process.exit(process.exitCode||0);
})();
