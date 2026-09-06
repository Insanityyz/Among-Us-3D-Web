/* ============================================================================
   4. Networking transport + authoritative game server + bot AI
   ----------------------------------------------------------------------------
   NET is the only thing that changes between local and online play:
     • local  → LoopbackTransport (server lives in this tab)
     • online → WsTransport (server lives on a relay; same message shapes)
   ========================================================================== */
let SERVER=null;

const NET={
  ENABLED:false,                 // <-- flip to true to play online
  URL:'wss://your-relay.example.com/amongus3d',
  ROOM:'', mode:'local',
  transport:null, listeners:[], latency:0,
  on(fn){ this.listeners.push(fn); },
  emitLocal(evt){ for(const fn of this.listeners) fn(evt); },
  send(msg){ if(this.transport) this.transport.send(msg); },
  connectLocal(server){ this.mode='local'; this.transport=new LoopbackTransport(server); },
  async connectOnline(room,name,appearance){
    if(!NET.ENABLED) throw new Error('Online play is not enabled in this build.');
    this.mode='online'; this.transport=new WsTransport(this.URL,room,name,appearance);
    await this.transport.open();
  },
  disconnect(){ if(this.transport&&this.transport.close) this.transport.close(); this.transport=null; },
};
class LoopbackTransport{
  constructor(server){ this.server=server; this.q=[]; }
  send(msg){ this.server.handle(msg); }
  close(){}
}
class WsTransport{
  constructor(url,room,name,appearance){ this.url=url; this.room=room; this.name=name; this.appearance=appearance; this.ws=null; }
  open(){
    return new Promise((res,rej)=>{
      try{ this.ws=new WebSocket(this.url); }catch(e){ rej(e); return; }
      this.ws.onopen=()=>{ this.send({t:'hello',room:this.room,name:this.name,appearance:this.appearance}); res(); };
      this.ws.onmessage=(e)=>{ let m; try{ m=JSON.parse(e.data); }catch(_){ return; } NET.emitLocal(m); };
      this.ws.onerror=(e)=>rej(e);
      this.ws.onclose=()=>NET.emitLocal({t:'net:closed'});
    });
  }
  send(msg){ if(this.ws&&this.ws.readyState===1) this.ws.send(JSON.stringify(msg)); }
  close(){ if(this.ws) this.ws.close(); }
}

/* ============================================================================
   Server
   ========================================================================== */
class Server{
  constructor(M,settings,roster,seed){
    this.M=M; this.settings=Object.assign({},settings);
    this.rng=makeRng(seed||(Date.now()&0x7fffffff));
    this.events=[];
    this.state={
      phase:'idle', time:0, tick:0, seed:seed||0,
      players:[], bodies:[], sab:null, doors:{}, meeting:null,
      taskDone:0, taskTotal:0, winner:null, reason:'',
      emergUsed:0, log:[], nextBodyId:1,
    };
    for(const d of M.doors) this.state.doors[d.id]=false;
    for(const r of roster){
      this.state.players.push({
        id:r.id,name:r.name,color:r.color,visor:r.visor||0,isBot:!!r.isBot,isHost:!!r.isHost,
        role:'crewmate',alive:true,x:0,z:0,yaw:0,vent:false,ventId:null,room:'cafeteria',
        tasks:[],kills:0,diedBy:null,ejected:false,vote:null,voted:false,
        emergencies:settings.emergencies,sus:{},witnessed:[],
        ai:{mode:'idle',t:0,path:null,dest:null,station:null,task:null,target:null,chat:0,think:0,fakeTaskT:0,
            stuck:0,nudge:0,lx:undefined,lz:undefined,ghost:false,workKind:'task'},
        killCd:0,emergCd:0,sabCd:0,busy:0,
      });
    }
  }
  emit(e){ this.events.push(e); NET.emitLocal(e); }
  p(id){ return this.state.players.find(p=>p.id===id); }
  alive(){ return this.state.players.filter(p=>p.alive); }
  aliveImps(){ return this.state.players.filter(p=>p.alive&&p.role==='impostor'); }
  aliveCrew(){ return this.state.players.filter(p=>p.alive&&p.role!=='impostor'); }
  ghosts(){ return this.state.players.filter(p=>!p.alive); }

  /* ---------------- setup ---------------- */
  start(){
    const S=this.state, set=this.settings;
    const spawns=this.M.spawns;
    S.players.forEach((p,i)=>{
      const s=spawns[i%spawns.length];
      p.x=s.x; p.z=s.z; p.yaw=Math.PI; p.alive=true; p.ejected=false; p.vote=null; p.voted=false;
      p.kills=0; p.diedBy=null; p.vent=false; p.ventId=null; p.killCd=0; p.emergCd=set.emergCooldown;
      p.sabCd=set.sabCooldown*0.5; p.emergencies=set.emergencies; p.sus={}; p.witnessed=[];
      p.tasks=makeTaskSet(this.M,set,this.rng);
      p.busy=0;
      const ai=p.ai; ai.mode='idle'; ai.t=0.4+this.rng()*1.6; ai.path=null; ai.task=null; ai.station=null; ai.think=this.rng()*2;
    });
    if(set.freeplay){ S.players.forEach(p=>p.role='crewmate'); }
    else assignRoles(S.players,set.impostors,this.rng);
    S.bodies.length=0; S.sab=null; S.meeting=null; S.winner=null; S.reason=''; S.emergUsed=0; S.time=0;
    for(const d of this.M.doors) S.doors[d.id]=false;
    this.recountTasks();
    S.phase='playing';
    for(const p of S.players) this.emit({t:'role',id:p.id,role:p.role,partners:S.players.filter(q=>q.role==='impostor').map(q=>({id:q.id,name:q.name,color:q.color})),tasks:p.tasks});
    this.emit({t:'start',players:S.players.map(p=>({id:p.id,name:p.name,color:p.color,visor:p.visor,isBot:p.isBot,role:p.role,x:p.x,z:p.z,yaw:p.yaw})),settings:set,taskTotal:S.taskTotal});
  }
  recountTasks(){
    const S=this.state;
    let done=0,total=0;
    for(const p of S.players){
      if(p.role==='impostor') continue;              // impostor tasks are fake
      for(const t of p.tasks){ total+=t.stages.length; done+=Math.min(t.stage,t.stages.length); }
    }
    S.taskDone=done; S.taskTotal=total;
    this.emit({t:'taskbar',done,total});
  }

  /* ---------------- intents ---------------- */
  handle(msg){
    const S=this.state;
    switch(msg.t){
      case 'move':{
        const p=this.p(msg.id); if(!p) return;
        p.x=msg.x; p.z=msg.z; p.yaw=msg.yaw; p.vent=!!msg.vent; p.ventId=msg.ventId||null; p.room=msg.room||p.room;
        return;
      }
      case 'use': return this.onUse(msg.id,msg.station);
      case 'taskStage': return this.onTaskStage(msg.id,msg.taskIdx);
      case 'kill': return this.onKill(msg.id,msg.target);
      case 'report': return this.onReport(msg.id,msg.body);
      case 'emergency': return this.onEmergency(msg.id);
      case 'vent': return this.onVent(msg.id,msg.action,msg.to);
      case 'sabotage': return this.onSabotage(msg.id,msg.type,msg.room);
      case 'fixSab': return this.onFixSab(msg.id,msg.type,msg.part,msg.data);
      case 'door': return this.onDoor(msg.id,msg.door);
      case 'vote': return this.onVote(msg.id,msg.target);
      case 'chat': return this.onChat(msg.id,msg.text);
      case 'leave': return this.onLeave(msg.id);
    }
  }
  stationUsable(id,st){
    const S=this.state, p=this.p(id);
    if(!p||!st) return false;
    if(S.phase!=='playing') return false;
    const ghost=!p.alive;
    const commsDown=S.sab&&S.sab.type==='comms';
    if(st.kind==='emergency') return !ghost&&p.emergencies>0&&p.emergCd<=0&&!this.criticalSab();
    if(st.kind==='admintable') return !ghost&&!commsDown;
    if(st.kind==='vitals') return !ghost&&!commsDown;
    if(st.kind==='cams') return !ghost&&!commsDown;
    if(st.kind==='lights') return !ghost&&S.sab&&S.sab.type==='lights';
    if(st.kind==='comms') return !ghost&&commsDown;
    if(st.kind==='o2panel') return !ghost&&S.sab&&S.sab.type==='o2';
    if(st.kind==='reactor'&&(S.sab&&S.sab.type==='reactor')) return !ghost;
    // task station
    for(let i=0;i<p.tasks.length;i++){
      const task=p.tasks[i];
      if(task.done) continue;
      const stage=task.stages[task.stage];
      if(stage&&stage.station===st.id) return true;
    }
    return false;
  }
  currentTaskIndex(p){ for(let i=0;i<p.tasks.length;i++) if(!p.tasks[i].done) return i; return -1; }
  taskAtStation(p,stId){
    for(let i=0;i<p.tasks.length;i++){
      const task=p.tasks[i]; if(task.done) continue;
      const stage=task.stages[task.stage];
      if(stage&&stage.station===stId) return {task,idx:i};
    }
    return null;
  }
  canKill(id){
    const S=this.state,p=this.p(id);
    if(!p||!p.alive||p.role!=='impostor'||S.phase!=='playing') return false;
    if(p.vent) return false;
    return p.killCd<=0 && !this.meetingActive();
  }
  meetingActive(){ return this.state.phase==='meeting'||this.state.phase==='eject'; }
  criticalSab(){ const s=this.state.sab; return s&&(s.type==='reactor'||s.type==='o2'); }

  onUse(id,stId){
    const p=this.p(id); if(!p) return;
    const st=this.M.stById[stId]; if(!st) return;
    if(!this.stationUsable(id,st)) { this.emit({t:'deny',id,msg:'You cannot use that right now'}); return; }
    this.emit({t:'use',id,station:stId});
  }
  onTaskStage(id,taskIdx){
    const S=this.state,p=this.p(id); if(!p) return;
    const task=p.tasks[taskIdx]; if(!task||task.done) return;
    const stage=task.stages[task.stage]; if(!stage) return;
    const st=this.M.stById[stage.station];
    const d=Math.hypot(st.x-p.x,st.z-p.z);
    if(d>2.6&&!p.isBot) { this.emit({t:'deny',id,msg:'Too far from the console'}); return; }
    task.stage++;
    if(task.stage>=task.stages.length) task.done=true;
    if(p.role!=='impostor'){ this.recountTasks(); }
    this.emit({t:'taskProgress',id,taskIdx,stage:task.stage,done:task.done,total:p.tasks.length});
    if(p.role!=='impostor'&&S.taskTotal&&S.taskDone>=S.taskTotal) this.endGame('crewmate','All tasks completed');
  }
  onKill(id,targetId){
    const S=this.state,p=this.p(id),v=this.p(targetId);
    if(!this.canKill(id)||!v||!v.alive||v.role==='impostor') return;
    const range=KILL_DIST[this.settings.killDistance]+0.5;
    if(Math.hypot(v.x-p.x,v.z-p.z)>range) return;
    v.alive=false; v.diedBy=id; v.vent=false; v.ventId=null;
    p.kills++; p.killCd=this.settings.killCooldown;
    const body={id:'b'+(S.nextBodyId++),x:v.x,z:v.z,color:v.color,visor:v.visor,victim:v.id,killer:id,room:v.room};
    S.bodies.push(body);
    this.witnessEvent('kill',p,v);
    this.emit({t:'kill',killer:id,victim:v.id,body});
    this.emit({t:'bodies',bodies:S.bodies});
    this.checkKillWin();
  }
  witnessEvent(kind,actor,victim){
    for(const q of this.state.players){
      if(!q.alive||q.isBot===false||q.id===actor.id) continue;
      const d=Math.hypot(q.x-actor.x,q.z-actor.z);
      if(d>13) continue;
      if(!this.M.losClear(q.x,q.z,actor.x,actor.z,SHIP_DOORSEGS())) continue;
      q.sus[actor.id]=(q.sus[actor.id]||0)+(kind==='kill'?100:kind==='vent'?70:20);
      q.witnessed.push({kind,actor:actor.id,victim:victim?victim.id:null,t:this.state.time});
    }
  }
  onReport(id,bodyId){
    const S=this.state,p=this.p(id);
    if(!p||!p.alive||S.phase!=='playing') return;
    const b=S.bodies.find(x=>x.id===bodyId);
    if(!b) return;
    if(Math.hypot(b.x-p.x,b.z-p.z)>2.6) return;
    this.startMeeting(id,'body',b);
  }
  onEmergency(id){
    const S=this.state,p=this.p(id);
    if(!p||!p.alive||S.phase!=='playing') return;
    if(this.criticalSab()){ this.emit({t:'deny',id,msg:'Cannot call a meeting during a critical sabotage'}); return; }
    if(p.emergencies<=0){ this.emit({t:'deny',id,msg:'No emergency meetings left'}); return; }
    if(p.emergCd>0){ this.emit({t:'deny',id,msg:'Emergency button on cooldown'}); return; }
    const btn=this.M.stations.find(s=>s.kind==='emergency');
    if(btn&&Math.hypot(btn.x-p.x,btn.z-p.z)>2.8){ this.emit({t:'deny',id,msg:'Get closer to the button'}); return; }
    p.emergencies--; S.emergUsed++;
    this.startMeeting(id,'emergency',null);
  }
  onVent(id,action,to){
    const S=this.state,p=this.p(id);
    if(!p||!p.alive||p.role!=='impostor'||S.phase!=='playing') return;
    if(action==='enter'){
      if(p.vent) return;
      const v=this.M.vents.find(v=>Math.hypot(v.x-p.x,v.z-p.z)<1.9);
      if(!v) return;
      p.vent=true; p.ventId=v.id; p.x=v.x; p.z=v.z;
      this.witnessEvent('vent',p,null);
      this.emit({t:'vent',id,action:'enter',vent:v.id,x:v.x,z:v.z});
    } else if(action==='move'){
      if(!p.vent) return;
      const links=ventLinks(p.ventId);
      if(links.indexOf(to)<0) return;
      const v=ventById(to); if(!v) return;
      p.ventId=to; p.x=v.x; p.z=v.z; p.room=v.room;
      this.emit({t:'vent',id,action:'move',vent:to,x:v.x,z:v.z});
    } else if(action==='exit'){
      if(!p.vent) return;
      p.vent=false; p.ventId=null;
      this.emit({t:'vent',id,action:'exit'});
    }
  }
  onSabotage(id,type,room){
    const S=this.state,p=this.p(id);
    if(!p||!p.alive||p.role!=='impostor'||S.phase!=='playing') return;
    if(p.vent) return;
    if(p.sabCd>0){ this.emit({t:'deny',id,msg:'Sabotage on cooldown'}); return; }
    if(S.sab){ this.emit({t:'deny',id,msg:'A sabotage is already active'}); return; }
    this.startSabotage(type,p.id,room);
  }
  doorRooms(){
    const out=[];
    for(const d of this.M.doors) if(d.auto&&out.indexOf(d.room)<0) out.push(d.room);
    return out;
  }
  startSabotage(type,byId,room){
    const S=this.state, def=SAB_TYPES[type]; if(!def) return;
    const sab={type,by:byId,timer:def.timer||0,parts:{},data:{},t:0};
    if(type==='reactor'){ sab.parts={a:false,b:false}; sab.armed=0; }
    if(type==='o2'){
      let code=''; for(let i=0;i<6;i++) code+=String(Math.floor(this.rng()*10));
      sab.data={code}; sab.parts={o2:false,admin:false};
    }
    if(type==='lights'){ sab.data={fixed:false}; }
    if(type==='comms'){ sab.parts={sliders:false,pattern:false}; sab.data={pattern:[]};
      for(let i=0;i<4;i++) sab.data.pattern.push(Math.floor(this.rng()*9)); }
    if(type==='doors'){
      // like the real ship: one room's doors slam shut, the rest stay open
      const rooms=this.doorRooms();
      let target=(room&&rooms.indexOf(room)>=0)?room:rooms[Math.floor(this.rng()*rooms.length)];
      let n=0;
      for(const d of this.M.doors) if(d.auto&&d.room===target){ S.doors[d.id]=true; n++; }
      if(!n) for(const d of this.M.doors) if(d.auto){ S.doors[d.id]=true; n++; }
      sab.timer=12; sab.room=target; sab.data={auto:true,room:target,count:n};
    }
    S.sab=sab;
    for(const p of S.players) if(p.role==='impostor') p.sabCd=this.settings.sabCooldown;
    this.emit({t:'sab',sab,doors:S.doors});
    AUDIO_SAB&&AUDIO_SAB(type);
  }
  onFixSab(id,type,part,data){
    const S=this.state,p=this.p(id),sab=S.sab;
    if(!p||!sab||sab.type!==type) return;
    if(type==='lights'){
      this.endSabotage('lights');
    } else if(type==='comms'){
      if(part==='sliders') sab.parts.sliders=true;
      if(part==='pattern') sab.parts.pattern=true;
      this.emit({t:'sabUpdate',sab});
      if(sab.parts.sliders&&sab.parts.pattern) this.endSabotage('comms');
    } else if(type==='reactor'){
      sab.parts[part]=true; sab.armed=sab.armed||0;
      this.emit({t:'sabUpdate',sab});
      if(sab.parts.a&&sab.parts.b) this.endSabotage('reactor');
      else { sab.armTimer=10; }
    } else if(type==='o2'){
      if(data&&data===sab.data.code) sab.parts[part]=true;
      else { this.emit({t:'deny',id,msg:'Wrong code'}); return; }
      this.emit({t:'sabUpdate',sab});
      if(sab.parts.o2&&sab.parts.admin) this.endSabotage('o2');
    }
  }
  endSabotage(type){
    const S=this.state;
    if(!S.sab||S.sab.type!==type) return;
    S.sab=null;
    if(type==='doors') for(const d of this.M.doors) if(d.auto) S.doors[d.id]=false;
    this.emit({t:'sabEnd',type,doors:S.doors});
  }
  onDoor(id,doorId){
    const S=this.state,p=this.p(id);
    if(!p||!p.alive) return;
    const d=this.M.doorById[doorId]; if(!d) return;
    if(Math.hypot(d.cx-p.x,d.cz-p.z)>2.2) return;
    if(!S.doors[doorId]) return;
    S.doors[doorId]=false;
    if(S.sab&&S.sab.type==='doors'){
      let any=false; for(const dd of this.M.doors) if(dd.auto&&S.doors[dd.id]) any=true;
      if(!any) this.endSabotage('doors');
    }
    this.emit({t:'doors',doors:S.doors});
  }
  onChat(id,text){
    const S=this.state,p=this.p(id); if(!p) return;
    if(!S.meeting) return;
    text=String(text||'').slice(0,140);
    if(!text) return;
    this.emit({t:'chat',id,name:p.name,color:p.color,text,alive:p.alive,phase:S.meeting.phase});
  }
  onVote(id,target){
    const S=this.state,p=this.p(id),m=S.meeting;
    if(!m||m.phase!=='vote'||!p||!p.alive||p.voted) return;
    p.voted=true; p.vote=target;
    this.emit({t:'vote',id,target,count:this.votesIn()});
    if(this.allVoted()) this.finishMeeting();
  }
  onLeave(id){
    const p=this.p(id); if(!p) return;
    p.alive=false; p.left=true;
    this.emit({t:'left',id});
    this.checkKillWin();
  }
  votesIn(){ return this.state.players.filter(p=>p.alive&&p.voted).length; }
  allVoted(){ const a=this.alive(); return a.length&&a.every(p=>p.voted); }

  /* ---------------- meetings ---------------- */
  startMeeting(callerId,reason,body){
    const S=this.state;
    if(S.phase!=='playing') return;
    S.meeting={caller:callerId,reason,body:body?body.id:null,discussion:this.settings.discussion,
               voting:this.settings.voting,phase:'discuss',t:0,resultTimer:0};
    S.phase='meeting';
    if(body){ S.bodies=S.bodies.filter(b=>b.id!==body.id); }
    if(S.sab) this.endSabotage(S.sab.type);
    for(const k in S.doors) S.doors[k]=false;
    const spawns=this.M.spawns;
    let i=0;
    for(const p of S.players){
      p.vent=false; p.ventId=null; p.vote=null; p.voted=false; p.busy=0;
      const s=spawns[i%spawns.length]; i++;
      p.x=s.x; p.z=s.z; p.yaw=Math.PI+(i%2?0.2:-0.2);
      p.killCd=Math.max(8,this.settings.killCooldown*0.55);
      p.emergCd=this.settings.emergCooldown;
      p.sabCd=Math.max(6,this.settings.sabCooldown*0.6);
      if(p.ai){ p.ai.mode='idle'; p.ai.path=null; p.ai.t=0; }
    }
    const caller=this.p(callerId);
    this.emit({t:'meeting',meeting:S.meeting,caller:{id:callerId,name:caller.name,color:caller.color},
      body:body?{victim:body.victim,color:body.color,name:(this.p(body.victim)||{}).name}:null,
      players:S.players.map(p=>({id:p.id,name:p.name,color:p.color,alive:p.alive})),bodies:S.bodies});
  }
  finishMeeting(){
    const S=this.state,m=S.meeting; if(!m) return;
    const tally={};
    let skip=0;
    for(const p of this.alive()){
      if(p.vote===null||p.vote==='skip') skip++;
      else tally[p.vote]=(tally[p.vote]||0)+1;
    }
    let best=null,bestN=0,tie=false;
    for(const k in tally){ if(tally[k]>bestN){ bestN=tally[k]; best=k; tie=false; } else if(tally[k]===bestN) tie=true; }
    if(tie||skip>bestN) best=null;
    m.result={ejected:best,votes:tally,skip,tie};
    m.phase='result'; m.resultTimer=3.4;
    this.emit({t:'voteResult',result:m.result,votes:S.players.map(p=>({id:p.id,vote:p.vote})),anon:this.settings.anonVotes});
  }
  applyEjection(){
    const S=this.state,m=S.meeting; if(!m||!m.result) return;
    const id=m.result.ejected;
    let ejected=null;
    if(id){
      const p=this.p(id);
      if(p){ p.alive=false; p.ejected=true; ejected={id:p.id,name:p.name,color:p.color,role:p.role,impostorsLeft:this.aliveImps().length}; }
    }
    S.meeting=null;
    S.phase='playing';
    for(const p of S.players) p.voted=false;
    this.emit({t:'eject',ejected,confirm:this.settings.confirmEjects,impostorsLeft:this.aliveImps().length});
    if(ejected){
      if(this.aliveImps().length===0) return this.endGame('crewmate','All impostors were ejected');
      this.checkKillWin();
    } else {
      this.emit({t:'resume'});
    }
  }
  checkKillWin(){
    const S=this.state;
    if(S.phase==='over') return;
    const imps=this.aliveImps().length, crew=this.aliveCrew().length;
    if(imps===0) return this.endGame('crewmate','All impostors were ejected');
    if(imps>=crew) return this.endGame('impostor',imps>=crew?'Not enough crewmates remain':'');
  }
  endGame(winner,reason){
    const S=this.state;
    if(S.phase==='over') return;
    S.phase='over'; S.winner=winner; S.reason=reason;
    this.emit({t:'gameover',winner,reason,players:S.players.map(p=>({id:p.id,name:p.name,color:p.color,role:p.role,alive:p.alive,kills:p.kills,ejected:p.ejected,tasks:p.tasks})),taskDone:S.taskDone,taskTotal:S.taskTotal});
  }

  /* ---------------- tick ---------------- */
  tick(dt){
    const S=this.state;
    if(S.phase==='idle'||S.phase==='over') return;
    S.time+=dt; S.tick++;
    if(S.phase==='playing'){
      for(const p of S.players){
        p.killCd=Math.max(0,p.killCd-dt);
        p.emergCd=Math.max(0,p.emergCd-dt);
        p.sabCd=Math.max(0,p.sabCd-dt);
        p.busy=Math.max(0,p.busy-dt);
      }
      if(S.sab){
        S.sab.t+=dt;
        if(S.sab.armTimer){ S.sab.armTimer-=dt; if(S.sab.armTimer<=0){ S.sab.parts.a=false; S.sab.parts.b=false; S.sab.armTimer=0; this.emit({t:'sabUpdate',sab:S.sab}); } }
        if(S.sab.timer>0){
          S.sab.timer-=dt;
          if(S.sab.type==='doors'&&S.sab.timer<=0){ this.endSabotage('doors'); }
          else if(S.sab.timer<=0&&S.sab.type!=='doors'){
            const t=S.sab.type;
            this.emit({t:'sabTimeout',type:t});
            S.sab=null;
            this.endGame('impostor',(SAB_TYPES[t]||{}).name+' was not repaired');
          }
        }
      }
      this.updateBots(dt);
    } else if(S.phase==='meeting'){
      const m=S.meeting;
      if(!m) return;
      m.t+=dt;
      if(m.phase==='discuss'){
        m.discussion-=dt;
        if(m.discussion<=0){ m.phase='vote'; m.voting=this.settings.voting; this.emit({t:'votePhase'}); }
        this.emit({t:'meetingTimer',phase:m.phase,left:Math.max(0,m.discussion)});
      } else if(m.phase==='vote'){
        m.voting-=dt;
        this.emit({t:'meetingTimer',phase:m.phase,left:Math.max(0,m.voting),voted:this.votesIn(),total:this.alive().length});
        this.botVotes(dt);
        if(m.voting<=0) this.finishMeeting();
      } else if(m.phase==='result'){
        m.resultTimer-=dt;
        if(m.resultTimer<=0) this.applyEjection();
      }
    }
  }
  /* ---------------- bots ---------------- */
  usePos(st){ const d=dirOf(st.rot); return {x:st.x+d.x*0.62,z:st.z+d.z*0.62}; }
  botPathTo(bot,x,z){
    bot.ai.stuck=0; bot.ai.nudge=0; bot.ai.lx=bot.x; bot.ai.lz=bot.z;
    const from=this.M.roomAt(bot.x,bot.z), to=this.M.roomAt(x,z);
    let path=null;
    if(from&&to&&from.id!==to.id) path=this.M.findPath(from.id,to.id);
    if(path&&path.length){
      bot.ai.path=path.slice(1).map(n=>({x:n.x,z:n.z,door:n.door}));
      bot.ai.path.push({x,z});
    } else bot.ai.path=[{x,z}];
    bot.ai.dest={x,z};
  }
  botNearestStep(bot){
    const ai=bot.ai;
    if(!ai.path||!ai.path.length) return null;
    return ai.path[0];
  }
  updateBots(dt){
    const S=this.state;
    for(const p of S.players){
      if(!p.isBot) continue;
      if(!p.alive){
        // ghost bots quietly finish whatever tasks they still owe the crew
        if(p.role==='impostor'||p.tasks.every(t=>t.done)) continue;
        p.ai.ghost=true;
      }
      const ai=p.ai;
      ai.think-=dt;
      // ---- react to critical sabotage first
      if(S.sab&&(S.sab.type==='reactor'||S.sab.type==='o2')&&p.role!=='impostor'){
        if(ai.mode!=='fixSab'||ai.think<=0){
          ai.think=2;
          const need=S.sab.type==='reactor'
            ? (S.sab.parts.a?this.M.stations.filter(s=>s.kind==='reactor')[1]:this.M.stations.filter(s=>s.kind==='reactor')[0])
            : (S.sab.parts.o2?this.M.stById['s_ad_card']:this.M.stById['s_o2_sab']);
          if(need){
            const st=S.sab.type==='o2'?(S.sab.parts.o2?this.M.stById['s_ad_card']:this.M.stById['s_o2_sab']):need;
            const pos=this.usePos(st);
            ai.mode='fixSab'; ai.station=st.id;
            this.botPathTo(p,pos.x,pos.z);
          }
        }
      }
      // ---- state machine
      switch(ai.mode){
        case 'idle':{
          ai.t-=dt;
          if(ai.t<=0){
            if(p.role==='impostor'&&this.rng()<0.55) this.botPickKillPlan(p);
            else this.botPickTask(p);
          }
          break;
        }
        case 'gotoTask': case 'gotoFix': case 'fixSab': case 'stalk': case 'wander':{
          const step=this.botNearestStep(p);
          if(!step){ ai.mode='idle'; ai.t=0.3+this.rng()*1.2; break; }
          const d=Math.hypot(step.x-p.x,step.z-p.z);
          // stuck watchdog: slide around an obstacle, then step through it as a last resort
          if(ai.lx===undefined){ ai.lx=p.x; ai.lz=p.z; }
          const moved=Math.hypot(p.x-ai.lx,p.z-ai.lz);
          ai.lx=p.x; ai.lz=p.z;
          if(moved<dt*0.55) ai.stuck+=dt; else ai.stuck=0;
          if(ai.stuck>0.7){
            ai.stuck=0; ai.nudge++;
            if(ai.nudge>=4){
              p.x=step.x; p.z=step.z; ai.nudge=0;
              p.room=(this.M.roomAt(p.x,p.z)||{id:p.room}).id;
            } else {
              const L=d||1, side=(ai.nudge%2?1:-1);
              this.botStep(p,p.x+(step.x-p.x)/L*0.5-(step.z-p.z)/L*0.9*side,
                             p.z+(step.z-p.z)/L*0.5+(step.x-p.x)/L*0.9*side,dt*2.4);
            }
            break;
          }
          if(d<0.42){ ai.path.shift(); ai.nudge=0; if(!ai.path.length) this.botArrived(p); }
          else this.botStep(p,step.x,step.z,dt);
          break;
        }
        case 'work':{
          ai.t-=dt;
          const st=this.M.stById[ai.station];
          if(st){ const pos=this.usePos(st); this.botStep(p,pos.x,pos.z,dt*0.5); p.yaw=Math.atan2(st.x-p.x,st.z-p.z)+Math.PI; }
          if(ai.t<=0) this.botFinishWork(p);
          break;
        }
        case 'kill':{
          const v=this.p(ai.target);
          if(!v||!v.alive||p.killCd>0){ ai.mode='idle'; ai.t=0.5; break; }
          const d=Math.hypot(v.x-p.x,v.z-p.z);
          if(d<1.05){
            this.onKill(p.id,v.id);
            ai.mode='idle'; ai.t=1.2+this.rng()*2;
            if(this.rng()<0.6){
              const nv=this.M.vents.find(vv=>Math.hypot(vv.x-p.x,vv.z-p.z)<2.2);
              if(nv) this.onVent(p.id,'enter');
            }
          } else if(d>16||!this.M.losClear(p.x,p.z,v.x,v.z,SHIP_DOORSEGS())){
            this.botPathTo(p,v.x,v.z); ai.mode='stalk';
          } else this.botStep(p,v.x,v.z,dt);
          break;
        }
        case 'ghost': break;
      }
      // ---- report a body if we stumble on one
      if(p.alive&&this.rng()<dt*2.2){
        for(const b of S.bodies){
          if(Math.hypot(b.x-p.x,b.z-p.z)<1.5&&this.M.losClear(p.x,p.z,b.x,b.z,SHIP_DOORSEGS())){
            this.onReport(p.id,b.id); return;
          }
        }
      }
      // ---- occasionally call an emergency meeting
      if(p.alive&&p.role!=='impostor'&&p.emergencies>0&&p.emergCd<=0&&S.time>45&&this.rng()<dt*0.004){
        const btn=this.M.stations.find(s=>s.kind==='emergency');
        if(btn&&Math.hypot(btn.x-p.x,btn.z-p.z)<2.6) this.onEmergency(p.id);
      }
    }
  }
  botStep(p,tx,tz,dt){
    const spd=(p.alive?3.1:3.9)*this.settings.playerSpeed;
    let dx=tx-p.x, dz=tz-p.z;
    const d=Math.hypot(dx,dz)||1; dx/=d; dz/=d;
    // separation
    let sx=0,sz=0;
    for(const q of this.state.players){
      if(q===p||!q.alive||q.vent) continue;
      const ddx=p.x-q.x, ddz=p.z-q.z, dd=Math.hypot(ddx,ddz);
      if(dd<0.85&&dd>0.001){ sx+=ddx/dd*(0.85-dd); sz+=ddz/dd*(0.85-dd); }
    }
    let nx=p.x+dx*spd*dt+sx*dt*2.4, nz=p.z+dz*spd*dt+sz*dt*2.4;
    if(p.alive){ const res=collideServer(this.M,nx,nz,0.33); nx=res.x; nz=res.z; }
    p.x=nx; p.z=nz;
    p.yaw=Math.atan2(dx,dz)+Math.PI;
    p.room=(this.M.roomAt(p.x,p.z)||{id:p.room}).id;
  }
  botArrived(p){
    const ai=p.ai, S=this.state;
    if(ai.mode==='fixSab'){
      const st=this.M.stById[ai.station];
      if(st&&S.sab){
        if(S.sab.type==='reactor'){
          const which=st.id==='s_reac_a'?'a':'b';
          ai.t=0.9; ai.mode='work'; ai.workKind='reactor';
        } else if(S.sab.type==='o2'){
          ai.t=1.4; ai.mode='work'; ai.workKind='o2';
        }
      } else { ai.mode='idle'; ai.t=0.5; }
      return;
    }
    if(ai.mode==='stalk'){
      const v=this.p(ai.target);
      if(v&&v.alive&&p.killCd<=0&&this.botSafeToKill(p,v)){ ai.mode='kill'; }
      else { ai.mode='idle'; ai.t=0.6+this.rng()*1.5; }
      return;
    }
    // arrived at a task station
    ai.mode='work';
    ai.t=(p.role==='impostor'?1.2:1.6)+this.rng()*3.4;
    ai.workKind='task';
  }
  botFinishWork(p){
    const ai=p.ai,S=this.state;
    if(ai.workKind==='reactor'&&S.sab&&S.sab.type==='reactor'){
      const st=this.M.stById[ai.station];
      this.onFixSab(p.id,'reactor',st.id==='s_reac_a'?'a':'b');
      ai.mode='idle'; ai.t=0.4+this.rng(); return;
    }
    if(ai.workKind==='o2'&&S.sab&&S.sab.type==='o2'){
      const st=this.M.stById[ai.station];
      const part=st.id==='s_o2_sab'?'o2':'admin';
      if(!S.sab.parts[part]) this.onFixSab(p.id,'o2',part,S.sab.data.code);
      ai.mode='idle'; ai.t=0.4+this.rng(); return;
    }
    if(p.role==='impostor'){ ai.mode='idle'; ai.t=0.3+this.rng()*1.4; return; }
    const hit=this.taskAtStation(p,ai.station);
    if(hit) this.onTaskStage(p.id,hit.idx);
    ai.mode='idle'; ai.t=0.2+this.rng()*0.9;
  }
  botPickTask(p){
    const ai=p.ai;
    // find the first unfinished task
    let target=null;
    for(let i=0;i<p.tasks.length;i++){
      const t=p.tasks[i]; if(t.done) continue;
      const st=this.M.stById[t.stages[t.stage].station];
      if(st){ target={st,idx:i,task:t}; break; }
    }
    if(p.role==='impostor'&&this.rng()<0.5){
      // fake a task somewhere random
      const cands=this.M.stations.filter(s=>['download','wiring','card','accept','engine','scan'].indexOf(s.kind)>=0);
      const st=cands[Math.floor(this.rng()*cands.length)];
      if(st){ const pos=this.usePos(st); ai.mode='gotoTask'; ai.station=st.id; ai.taskIdx=-1; this.botPathTo(p,pos.x,pos.z); return; }
    }
    if(target){
      const pos=this.usePos(target.st);
      ai.mode='gotoTask'; ai.station=target.st.id; ai.taskIdx=target.idx;
      this.botPathTo(p,pos.x,pos.z);
    } else this.botWander(p);
  }
  botWander(p){
    const rooms=this.M.rooms.filter(r=>!r.corridor||this.rng()<0.3);
    const r=rooms[Math.floor(this.rng()*rooms.length)];
    const x=r.bb.cx+(this.rng()-0.5)*r.bb.w*0.5, z=r.bb.cz+(this.rng()-0.5)*r.bb.h*0.5;
    p.ai.mode='wander'; p.ai.station=null;
    this.botPathTo(p,x,z);
  }
  botPickKillPlan(p){
    const S=this.state;
    if(p.killCd>0||this.criticalSab()) { this.botPickTask(p); return; }
    const targets=this.aliveCrew();
    if(!targets.length){ this.botWander(p); return; }
    // prefer isolated targets
    let best=null,bestScore=-1e9;
    for(const v of targets){
      const d=Math.hypot(v.x-p.x,v.z-p.z);
      let witnesses=0;
      for(const q of S.players){
        if(q===v||q===p||!q.alive||q.role==='impostor') continue;
        const dq=Math.hypot(q.x-v.x,q.z-v.z);
        if(dq<11&&this.M.losClear(q.x,q.z,v.x,v.z,SHIP_DOORSEGS())) witnesses++;
      }
      const score=-d*0.35-witnesses*22+this.rng()*8;
      if(score>bestScore){ bestScore=score; best=v; }
    }
    if(best&&bestScore>-40){ p.ai.target=best.id; p.ai.mode='stalk'; this.botPathTo(p,best.x,best.z); }
    else this.botPickTask(p);
    // sometimes sabotage to create chaos
    if(this.rng()<0.28&&!S.sab&&p.sabCd<=0){
      const opts=['lights','comms','doors','reactor','o2'];
      const t=opts[Math.floor(this.rng()*opts.length)];
      if(t==='reactor'||t==='o2'){ if(this.aliveCrew().length>2) this.startSabotage(t,p.id); }
      else if(t==='doors'){
        const rooms=this.doorRooms();
        const busy=rooms.filter(r=>this.aliveCrew().some(c=>c.room===r));
        const pick=(busy.length&&this.rng()<0.75)?busy[Math.floor(this.rng()*busy.length)]
                                                 :rooms[Math.floor(this.rng()*rooms.length)];
        this.startSabotage('doors',p.id,pick);
      }
      else this.startSabotage(t,p.id);
    }
  }
  botSafeToKill(p,v){
    const S=this.state;
    for(const q of S.players){
      if(q===v||q===p||!q.alive||q.role==='impostor') continue;
      const d=Math.hypot(q.x-v.x,q.z-v.z);
      if(d<10&&this.M.losClear(q.x,q.z,v.x,v.z,SHIP_DOORSEGS())) return false;
    }
    return true;
  }
  botVotes(dt){
    const S=this.state,m=S.meeting; if(!m||m.phase!=='vote') return;
    for(const p of this.alive()){
      if(!p.isBot||p.voted) continue;
      if(p.ai.voteAt===undefined||p.ai.voteAt===null) p.ai.voteAt=1+this.rng()*(Math.max(3,this.settings.voting*0.6));
      p.ai.voteAt-=dt;
      if(p.ai.voteAt<=0){
        p.ai.voteAt=null;
        let target=null;
        // suspicion driven
        const sus=Object.keys(p.sus).map(k=>({id:k,v:p.sus[k]})).sort((a,b)=>b.v-a.v);
        const others=this.alive().filter(q=>q.id!==p.id);
        if(p.role==='impostor'){
          const crew=others.filter(q=>q.role!=='impostor');
          if(this.rng()<0.72&&crew.length) target=crew[Math.floor(this.rng()*crew.length)].id;
          else target=this.rng()<0.25?'skip':(crew.length?crew[Math.floor(this.rng()*crew.length)].id:'skip');
        } else if(sus.length&&sus[0].v>30&&this.rng()<0.85){
          target=sus[0].id;
        } else if(this.rng()<0.16){
          target='skip';
        } else if(others.length){
          target=others[Math.floor(this.rng()*others.length)].id;
        }
        this.onVote(p.id,target);
      }
    }
  }
}
/* server-side collision (uses the same wall data, no THREE needed) */
let _serverColliders=null,_serverKey=null;
function collideServer(M,x,z,r){
  if(!_serverColliders||_serverKey!==M.doors.map(d=>d.closed?1:0).join('')){
    _serverKey=M.doors.map(d=>d.closed?1:0).join('');
    _serverColliders=M.walls.map(w=>({cx:w.cx,cz:w.cz,a:w.a,hx:w.hx,hz:w.hz,rad:Math.hypot(w.hx,w.hz)}));
    for(const d of M.doors) if(d.closed) _serverColliders.push({cx:d.cx,cz:d.cz,a:Math.atan2(d.z2-d.z1,d.x2-d.x1),hx:d.w/2,hz:0.24,rad:Math.hypot(d.w/2,0.24)});
  }
  let px=x,pz=z;
  for(let it=0;it<3;it++){
    let hit=false;
    for(const b of _serverColliders){
      const dx=px-b.cx,dz=pz-b.cz,rr=b.rad+r;
      if(dx*dx+dz*dz>rr*rr) continue;
      const p=circleVsOBB(px,pz,r,b);
      if(p){ px+=p.x; pz+=p.z; hit=true; }
    }
    if(!hit) break;
  }
  return {x:px,z:pz};
}
function SHIP_DOORSEGS(){ return (G.M&&G.M.doorSegs)?G.M.doorSegs():null; }
let AUDIO_SAB=null;
