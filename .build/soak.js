/* Offline soak test: plays whole matches to completion against the stub env. Not shipped. */
const fs=require('fs'),path=require('path'),os=require('os');
const {documentStub}=require('./stub_env.js');
const DIR=__dirname;
const PARTS=['30_logic.js','40_three.js','41_ship.js','50_player.js','60_server.js','65_audio_fx.js',
  '70_tasks.js','80_meeting.js','90_ui.js','95_game.js','99_main.js'];

const errors=[];const seen=new Set();
function fail(where,e){
  const msg=(e&&e.stack)?e.stack:String(e);
  const sig=where+'|'+msg.split('\n')[0];
  if(seen.has(sig))return;
  seen.add(sig);
  errors.push(where+': '+msg.split('\n').slice(0,4).join(' | '));
  if(errors.length<=10)console.log('\n!! '+where+': '+(e&&e.message?e.message:e)+'\n'+((e&&e.stack||'').split('\n').slice(1,4).join('\n')));
}
process.on('uncaughtException',e=>fail('uncaught',e));
process.on('unhandledRejection',e=>fail('unhandledRejection',e));

let frames=0,stopped=false;
const MAX_FRAMES=Number(process.env.FRAMES||400000);
globalThis.requestAnimationFrame=function(cb){
  if(stopped||frames>=MAX_FRAMES)return 0;
  frames++;
  return setTimeout(()=>{ try{ cb(performance.now()); }catch(e){ fail('rAF frame '+frames,e); } },2);
};
globalThis.cancelAnimationFrame=function(){};

let src=PARTS.map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n');
src=src.replace("THREE=await loadThree((p,m)=>setBoot(p,m));","THREE=globalThis.__THREE;");
src+="\nglobalThis.__T={G,Game,Actions,CLIENT,UI,MEET,EJECT,TASKUI,SCREENS,VISUAL,FX,AUDIO,SHIP,RENDER,NET,SAB,LOOP,Profile,CAM,PANELS,openStation,MAP,buildMap,updateCameraDirector,DEFAULT_SETTINGS,get SERVER(){return SERVER;}};\n";
const tmp=path.join(os.tmpdir(),'soak_'+Date.now()+'.mjs');
fs.writeFileSync(tmp,src,'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const VARIANTS=[
  {name:'classic 10p/2imp',set:{}},
  {name:'1 impostor',set:{impostors:1,botCount:7}},
  {name:'3 impostors, long kill cd',set:{impostors:3,botCount:11,killCooldown:45}},
  {name:'short timers, anon votes',set:{discussion:5,voting:8,anonVotes:true,confirmEjects:false,taskBar:'always'}},
  {name:'no visual tasks, fast crew',set:{visualTasks:false,playerSpeed:1.75,crewVision:1.5,impostorVision:2}},
  {name:'task heavy (3/3/6)',set:{commonTasks:3,longTasks:3,shortTasks:6,emergencies:3}},
  {name:'freeplay (no impostors)',set:{freeplay:true,botCount:5}},
];

(async()=>{
  const t0=Date.now();
  await import('file://'+tmp);
  const T=globalThis.__T;
  for(let i=0;i<500&&!T.LOOP.ready;i++) await sleep(4);
  if(!T.LOOP.ready){ console.log('BOOT FAILED: '+documentStub.getElementById('bootMsg').textContent); process.exit(1); }
  console.log('BOOT OK ('+(Date.now()-t0)+'ms)\n');

  const totals={crewmate:0,impostor:0,unfinished:0};
  const reasons={};
  let n=Number(process.env.MATCHES||VARIANTS.length);
  for(let mi=0;mi<n;mi++){
    const V=VARIANTS[mi%VARIANTS.length];
    T.G.settings=Object.assign({},T.DEFAULT_SETTINGS,V.set);
    T.Game.quickStart(!!V.set.freeplay);
    T.Game.finishRoleReveal();
    const S=T.SERVER.state;
    let ticks=0,meetings=0,ejections=0,kills=0,sabs=0,lastPhase='';
    const tStart=Date.now();
    while(S.phase!=='over'&&ticks<60000&&(Date.now()-tStart)<25000){
      // advance simulation quickly; let the client render every so often
      for(let k=0;k<40&&S.phase!=='over';k++){ T.SERVER.tick(0.1); ticks++; }
      // auto-play the human seat so task-win conditions can actually be reached
      if(S.phase==='playing'&&T.G.me&&T.G.me.alive!==undefined&&ticks%120===0){
        const me=T.G.me;
        const idx=me.tasks.findIndex(t=>!t.done);
        if(idx>=0){
          const stage=me.tasks[idx].stages[me.tasks[idx].stage];
          const st=T.G.M.stById[stage.station];
          if(st){ me.x=st.x; me.z=st.z; T.CLIENT.pos.x=st.x; T.CLIENT.pos.z=st.z;
            T.NET.send({t:'taskStage',id:T.G.meId,taskIdx:idx}); }
        } else if(me.role==='impostor'&&S.bodies.length===0){
          // impostor seat: kill someone so the match can also end by depletion
          const vic=S.players.find(p=>p.alive&&p.id!==T.G.meId&&p.role!=='impostor');
          if(vic){ me.killCd=0; vic.x=me.x; vic.z=me.z; T.NET.send({t:'kill',id:T.G.meId,target:vic.id}); }
        }
      }
      if(S.meeting&&S.meeting.phase==='vote'&&ticks%200===0)meetings++;
      await sleep(0);
      if(frames%97===0){ /* exercise client paths while the match runs */
        try{
          if(T.TASKUI.isOpen())T.TASKUI.update(0.05);
          if(T.G.phase==='playing'){ T.CLIENT.pos.x+=0.03; T.CLIENT.yaw+=0.07; }
          if(Math.random()<0.06)T.UI.drawMapOverlay();
          if(Math.random()<0.04)T.SCREENS.drawAdmin(S);
          if(Math.random()<0.04)T.SCREENS.drawVitals(S);
          if(T.EJECT.active&&T.EJECT.t>0.8)T.EJECT.skip();
        }catch(e){ fail('client-during-soak',e); }
      }
    }
    const stats=S.players.reduce((a,p)=>{a.kills+=p.kills;if(!p.alive)a.dead++;if(p.ejected)a.ejected++;return a;},{kills:0,dead:0,ejected:0});
    const dur=S.time.toFixed(0);
    if(S.phase==='over'){ totals[S.winner]=(totals[S.winner]||0)+1; reasons[S.reason]=(reasons[S.reason]||0)+1; }
    else totals.unfinished++;
    console.log((S.phase==='over'?'  ✔':'  ✖')+' '+V.name.padEnd(30)+
      ' winner='+String(S.winner||'none').padEnd(9)+' reason="'+(S.reason||'-')+'"'+
      ' sim='+dur+'s ticks='+ticks+' tasks='+S.taskDone+'/'+S.taskTotal+
      ' kills='+stats.kills+' dead='+stats.dead+' ejected='+stats.ejected+
      ' imps='+S.players.filter(p=>p.role==='impostor').length);
    // back to a clean state
    T.Game.toMenu();
    await sleep(20);
    if(errors.length>6)break;
  }

  console.log('\nwinners: '+JSON.stringify(totals));
  console.log('reasons: '+JSON.stringify(reasons,null,0));
  console.log('frames rendered: '+frames);
  if(errors.length){
    console.log('\n=== '+errors.length+' ERROR(S) ===');
    errors.forEach((e,i)=>console.log((i+1)+'. '+e));
    process.exitCode=1;
  } else console.log('\nSOAK TEST PASSED — '+n+' matches, no runtime errors');
  fs.unlinkSync(tmp);
  process.exit(process.exitCode||0);
})();
