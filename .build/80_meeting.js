/* ============================================================================
   7. Meetings, voting, chat and the ejection sequence
   ========================================================================== */
const MEET={
  active:false,data:null,phase:'discuss',left:0,myVote:undefined,voted:0,total:0,
  voteChips:{},skips:0,ended:false,
  start(evt){
    this.active=true; this.data=evt; this.phase='discuss'; this.left=G.settings.discussion;
    this.myVote=undefined; this.voted=0; this.voteChips={}; this.skips=0; this.ended=false;
    const scr=document.getElementById('meeting');
    scr.classList.remove('hidden');
    document.getElementById('meetTitle').textContent=evt.meeting.reason==='emergency'?'Emergency Meeting':'Dead Body Reported';
    const who=document.getElementById('meetWho');
    if(evt.meeting.reason==='emergency') who.innerHTML=`<b style="color:${cssOf(evt.caller.color)}">${esc(evt.caller.name)}</b> called this meeting`;
    else who.innerHTML=`<b style="color:${cssOf(evt.caller.color)}">${esc(evt.caller.name)}</b> reported <b style="color:${cssOf(evt.body.color)}">${esc(evt.body.name||'a body')}</b>`;
    buildChat(); buildVoteCards(evt.players);
    document.getElementById('btnVote').disabled=true;
    document.getElementById('btnSkip').disabled=true;
    setVoteHint(G.me&&G.me.alive?'Discussion — voting opens shortly':'You are a ghost — you cannot vote');
    // cinematic: hide ceilings so we can look down into the cafeteria
    if(SHIP.meshes){ SHIP.meshes.ceil.visible=false; SHIP.meshes.hull.visible=false; }
    CAM.mode='meeting'; CAM.t=0;
    AUDIO.meeting();
    addChatMsg(null,'— '+(evt.meeting.reason==='emergency'?'Emergency meeting called':'Body reported')+' —',true);
    UI.closeAllPanels();
    exitLock();
    setTimeout(()=>botChatter(),900);
  },
  votePhase(){
    this.phase='vote'; this.left=G.settings.voting;
    document.getElementById('meetTitle').textContent='Who is the Impostor?';
    const can=G.me&&G.me.alive;
    document.getElementById('btnVote').disabled=!can;
    document.getElementById('btnSkip').disabled=!can;
    setVoteHint(can?'Select a player, then press VOTE':'You are a ghost — you cannot vote');
    AUDIO.blip(660,.14,'triangle',.12);
  },
  onVote(evt){
    this.voted=evt.count;
    const p=this.data.players.find(x=>x.id===evt.id);
    if(!p) return;
    if(evt.target===null||evt.target==='skip'){ this.skips++; addSkipChip(G.settings.anonVotes?null:p); }
    else addVoteChip(evt.target,G.settings.anonVotes?null:p);
    setVoteHint(`${this.voted} / ${this.total} have voted`);
    AUDIO.vote();
  },
  result(evt){
    this.phase='result';
    const r=evt.result;
    // reveal votes on cards
    document.querySelectorAll('.pcard').forEach(c=>{
      const id=c.dataset.id;
      const n=r.votes[id]||0;
      c.querySelector('.st').textContent=n?`${n} vote${n>1?'s':''}`:(c.classList.contains('dead')?'DEAD':'no votes');
      if(r.ejected===id) c.classList.add('sel');
    });
    setVoteHint(r.ejected?(r.tie?'Tie — nobody was ejected':''):'');
    if(!r.ejected) setVoteHint('No one was ejected (tie / skipped)');
    AUDIO.blip(r.ejected?300:180,.4,'triangle',.12,120);
  },
  finish(){
    this.active=false;
    document.getElementById('meeting').classList.add('hidden');
    if(SHIP.meshes){ SHIP.meshes.ceil.visible=true; SHIP.meshes.hull.visible=true; }
    CAM.mode='player';
  },
  update(dt){
    if(!this.active) return;
    if(this.phase==='discuss'||this.phase==='vote'){
      this.left=Math.max(0,this.left-dt);
      const bar=document.querySelector('#timerBar i');
      const max=this.phase==='discuss'?G.settings.discussion:G.settings.voting;
      bar.style.width=(this.left/Math.max(1,max)*100)+'%';
      bar.style.background=this.left<10?'linear-gradient(90deg,#ff5a5a,#c51111)':'linear-gradient(90deg,#ffcc4d,#ef7d0e)';
      if(this.left<6&&Math.floor(this.left)!==this._lastTick){ this._lastTick=Math.floor(this.left); AUDIO.tick(); }
    }
  },
  select(id){
    if(this.phase!=='vote'||!(G.me&&G.me.alive)) return;
    this.myVote=(this.myVote===id)?undefined:id;
    document.querySelectorAll('.pcard').forEach(c=>c.classList.toggle('sel',c.dataset.id===this.myVote));
    AUDIO.click();
    document.getElementById('btnVote').disabled=!this.myVote;
  },
  cast(target){
    if(this.phase!=='vote'||!(G.me&&G.me.alive)||G.me.voted) return;
    G.net.send({t:'vote',id:G.meId,target});
    G.me.voted=true;
    document.getElementById('btnVote').disabled=true;
    document.getElementById('btnSkip').disabled=true;
    setVoteHint('Vote locked in — waiting for the others…');
    AUDIO.blip(880,.1,'triangle',.1);
  },
};
function cssOf(colorIdx){ const c=COLORS[colorIdx]; return c?c.css:'#c61111'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function setVoteHint(t){ document.getElementById('voteCount').textContent=t; }

function buildVoteCards(players){
  const grid=document.getElementById('voteGrid');
  grid.innerHTML='';
  MEET.total=players.filter(p=>p.alive).length;
  for(const p of players){
    const card=mk(`<div class="pcard ${p.alive?'':'dead'}" data-id="${p.id}">
        <div class="av"></div>
        <div style="min-width:0">
          <div class="nm">${esc(p.name)}${p.id===G.meId?' <span style="color:#7ce0ff;font-size:10px">(YOU)</span>':''}</div>
          <div class="st">${p.alive?'Alive':'Dead'}</div>
        </div>
        <div class="votes"></div>
        ${p.alive?'':'<div class="skull">✝</div>'}
      </div>`);
    card.querySelector('.av').appendChild(miniCrewmate(p.color));
    if(p.alive) card.addEventListener('click',()=>MEET.select(p.id));
    grid.appendChild(card);
  }
  const skip=mk(`<div class="pcard" data-id="skip" style="justify-content:center">
      <div style="font-size:15px;font-weight:900;letter-spacing:.12em;color:#c9d8f5">SKIP VOTE</div>
      <div class="votes skipvotes" style="margin-left:12px"></div></div>`);
  skip.addEventListener('click',()=>{ MEET.myVote='skip';
    document.querySelectorAll('.pcard').forEach(c=>c.classList.toggle('sel',c.dataset.id==='skip'));
    document.getElementById('btnVote').disabled=false; AUDIO.click(); });
  grid.appendChild(skip);
}
function miniCrewmate(colorIdx){
  const c=cssOf(colorIdx);
  const d=document.createElement('div');
  d.style.cssText=`width:38px;height:44px;position:relative`;
  d.innerHTML=`<div style="position:absolute;left:5px;top:2px;width:28px;height:36px;border-radius:14px 14px 10px 10px;background:${c};box-shadow:inset 0 -6px 0 rgba(0,0,0,.28)"></div>
    <div style="position:absolute;left:0;top:12px;width:9px;height:18px;border-radius:5px 0 0 5px;background:${c};filter:brightness(.74)"></div>
    <div style="position:absolute;left:14px;top:9px;width:19px;height:12px;border-radius:7px;background:linear-gradient(160deg,#dff3ff,#7fc4e8);box-shadow:inset 0 -2px 0 rgba(0,0,0,.2)"></div>
    <div style="position:absolute;left:9px;bottom:0;width:9px;height:8px;border-radius:0 0 4px 4px;background:${c};filter:brightness(.7)"></div>
    <div style="position:absolute;left:21px;bottom:0;width:9px;height:8px;border-radius:0 0 4px 4px;background:${c};filter:brightness(.7)"></div>`;
  return d;
}
function addVoteChip(targetId,voter){
  const card=document.querySelector(`.pcard[data-id="${targetId}"]`);
  if(!card) return;
  const box=card.querySelector('.votes');
  const i=document.createElement('i');
  i.style.background=voter?cssOf(voter.color):'linear-gradient(180deg,#cfd8dc,#7d8797)';
  box.appendChild(i);
}
function addSkipChip(voter){
  const box=document.querySelector('.pcard[data-id="skip"] .skipvotes');
  if(!box) return;
  const i=document.createElement('i');
  i.style.background=voter?cssOf(voter.color):'linear-gradient(180deg,#cfd8dc,#7d8797)';
  box.appendChild(i);
}
function buildChat(){
  const log=document.getElementById('chatLog');
  log.innerHTML='';
  const qc=document.getElementById('quickChat');
  qc.innerHTML='';
  QUICK_CHAT.forEach(q=>{
    const b=document.createElement('button'); b.textContent=q;
    b.addEventListener('click',()=>sendChat(q));
    qc.appendChild(b);
  });
}
function sendChat(text){
  text=String(text||'').trim();
  if(!text) return;
  if(!MEET.active){ UI.toast('Chat is only available during meetings'); return; }
  G.net.send({t:'chat',id:G.meId,text});
  document.getElementById('chatField').value='';
}
function addChatMsg(p,text,sys){
  const log=document.getElementById('chatLog');
  const dead=p&&!p.alive;
  // dead players only hear other dead players
  if(G.me&&!G.me.alive&&!dead&&!sys) { /* ghosts see ghost chat only */ }
  else if(G.me&&G.me.alive&&dead&&!sys) return;
  const el=mk(`<div class="cmsg ${sys?'sys':''} ${dead?'dead':''}">
      ${sys||!p?'':`<span class="cdot" style="background:${cssOf(p.color)}"></span>`}
      <div><span class="cnm" style="color:${sys?'#9fb4dd':cssOf(p.color)}">${sys?'':esc(p&&p.name)+(dead?' 💀':'')}${!sys&&p&&p.id===G.meId?' (you)':''}</span>
      <span class="ctx">${esc(text)}</span></div></div>`);
  log.appendChild(el);
  log.scrollTop=log.scrollHeight;
  while(log.children.length>80) log.removeChild(log.firstChild);
}
function botChatter(){
  if(!MEET.active||!G.server) return;
  const S=G.server.state;
  const talkers=S.players.filter(p=>p.isBot&&p.alive&&(G.me?G.me.alive:true));
  if(!talkers.length) return;
  const n=1+Math.floor(Math.random()*Math.min(3,talkers.length));
  for(let i=0;i<n;i++){
    const b=talkers[Math.floor(Math.random()*talkers.length)];
    const w=b.witnessed&&b.witnessed.length?b.witnessed[b.witnessed.length-1]:null;
    let line;
    if(w&&Math.random()<0.8){
      const actor=S.players.find(p=>p.id===w.actor);
      line=w.kind==='kill'?`I saw ${actor?actor.name:'someone'} kill!`
           :w.kind==='vent'?`They vented — I saw it`:QUICK_CHAT[Math.floor(Math.random()*QUICK_CHAT.length)];
    } else line=QUICK_CHAT[Math.floor(Math.random()*QUICK_CHAT.length)];
    setTimeout(()=>{ if(MEET.active) addChatMsg({id:b.id,name:b.name,color:b.color,alive:b.alive},line); },400+i*900+Math.random()*700);
  }
}

/* ---------- ejection sequence (full 3D) ---------- */
const EJECT={
  active:false,t:0,dur:9,body:null,light:null,camRig:null,data:null,
  start(evt){
    this.active=true; this.t=0; this.data=evt;
    const e=evt.ejected;
    const txt=document.getElementById('ejectTxt'), sub=document.getElementById('ejectSub');
    document.getElementById('eject').classList.remove('hidden');
    if(!e){
      txt.innerHTML='No one was ejected.';
      sub.textContent='(Tie vote / skipped)';
      this.dur=4.2; this.noBody=true;
    } else {
      this.noBody=false;
      txt.innerHTML=`<span class="n" style="color:${cssOf(e.color)}">${esc(e.name)}</span> was ejected.`;
      sub.textContent='';
      this.dur=9;
      // spawn the tumbling crewmate out in space
      const grp=makeCrewmate({color:COLORS[e.color]?COLORS[e.color].hex:0xc61111,visor:VISORS[(G.server&&G.server.state.players.find(p=>p.id===e.id)||{}).visor||0]?VISORS[(G.server.state.players.find(p=>p.id===e.id)||{}).visor||0].hex:0x8AD5F0,detail:22});
      if(grp.userData) grp.userData.tag&&grp.remove(grp.userData.tag);
      grp.traverse(o=>{ if(o.isSprite) grp.remove(o); });
      RENDER.scene.add(grp);
      this.body=grp;
      this.vx=(Math.random()-0.5)*0.5; this.vy=0.35; this.vz=-1.15;
      this.rx=(Math.random()-0.5)*1.6; this.ry=(Math.random()-0.5)*2.2; this.rz=(Math.random()-0.5)*1.4;
      // dedicated space lighting
      if(!this.light){
        this.light=new THREE.DirectionalLight(0xfff2e0,2.4);
        this.light.position.set(-3,4,5);
        RENDER.scene.add(this.light);
        this.fill=new THREE.HemisphereLight(0x4d6ea8,0x0a0d16,0.7);
        RENDER.scene.add(this.fill);
      }
      this.light.visible=true; this.fill.visible=true;
    }
    if(SHIP.group) SHIP.group.visible=false;
    if(SHIP.meshes){}
    CAM.mode='eject'; CAM.t=0;
    AUDIO.eject();
    UI.fadeBlack(0.5,0.35);
  },
  update(dt){
    if(!this.active) return;
    this.t+=dt;
    const cam=RENDER.camera;
    if(!this.noBody&&this.body){
      const b=this.body;
      b.position.x+=this.vx*dt; b.position.y+=this.vy*dt; b.position.z+=this.vz*dt;
      b.rotation.x+=this.rx*dt; b.rotation.y+=this.ry*dt; b.rotation.z+=this.rz*dt;
      // camera sits just behind/below, drifting with it
      const t=this.t;
      const ease=Math.min(1,t/1.6);
      cam.position.set(b.position.x+2.6*ease+Math.sin(t*0.25)*0.22, b.position.y-1.0*ease+Math.cos(t*0.2)*0.16, b.position.z+5.4*ease);
      cam.lookAt(b.position.x,b.position.y+0.2,b.position.z);
      cam.rotateZ(Math.sin(t*0.35)*0.02);
      if(t>4.6&&t<7.4){
        const sub=document.getElementById('ejectSub');
        const d=this.data;
        let s='';
        if(d.confirm) s=(d.ejected.role==='impostor'?'They were An Impostor.':'They were not An Impostor.');
        else s='Their role remains a mystery.';
        s+=` ${d.impostorsLeft} Impostor${d.impostorsLeft===1?'':'s'} remain${d.impostorsLeft===1?'s':''}.`;
        if(sub.textContent!==s) sub.textContent=s;
      }
    } else {
      cam.position.set(120,40,240); cam.lookAt(0,0,0);
    }
    if(this.t>this.dur){ this.end(); }
  },
  end(){
    this.active=false;
    document.getElementById('eject').classList.add('hidden');
    document.getElementById('ejectSub').textContent='';
    if(this.body){ RENDER.scene.remove(this.body); this.body=null; }
    if(this.light){ this.light.visible=false; this.fill.visible=false; }
    if(SHIP.group) SHIP.group.visible=true;
    CAM.mode='player';
    UI.fadeBlack(0.4,0.5);
    MEET.finish();
    if(typeof afterEject==='function') afterEject();
  },
  skip(){ if(this.active&&this.t>1.2) this.end(); },
};

/* ---------- camera director ---------- */
const CAM={mode:'player',t:0,menuAngle:0};
function updateCameraDirector(dt){
  if(CAM.mode==='meeting'){
    CAM.t+=dt;
    const a=CAM.t*0.16, r=12.4;
    RENDER.camera.position.set(-14+Math.cos(a)*r,6.4+Math.sin(CAM.t*0.3)*0.35,-14+Math.sin(a)*r);
    RENDER.camera.lookAt(-14,0.85,-14);
    RENDER.camera.fov=lerp(RENDER.camera.fov,58,1-Math.pow(0.01,dt));
    RENDER.camera.updateProjectionMatrix();
  } else if(CAM.mode==='menu'){
    // dollhouse orbit: ceilings are hidden, so we look straight down into the cafeteria
    CAM.t+=dt; CAM.menuAngle+=dt*0.11;
    const cx=-14, cz=-14, r=10.6;
    RENDER.camera.position.set(cx+Math.cos(CAM.menuAngle)*r,8.9+Math.sin(CAM.t*0.4)*0.35,cz+Math.sin(CAM.menuAngle)*r);
    RENDER.camera.lookAt(cx+Math.cos(CAM.menuAngle)*0.7,0.35,cz+Math.sin(CAM.menuAngle)*0.7);
    RENDER.camera.rotateZ(Math.sin(CAM.t*0.23)*0.012);
    RENDER.camera.fov=lerp(RENDER.camera.fov,52,1-Math.pow(0.01,dt));
    RENDER.camera.updateProjectionMatrix();
  } else if(CAM.mode==='role'){
    CAM.t+=dt;
    const a=CAM.t*0.5;
    RENDER.camera.position.set(Math.cos(a)*2.5,1.35+Math.sin(CAM.t*0.9)*0.06,Math.sin(a)*2.5);
    RENDER.camera.lookAt(0,0.72,0);
    RENDER.camera.fov=lerp(RENDER.camera.fov,44,1-Math.pow(0.01,dt));
    RENDER.camera.updateProjectionMatrix();
  }
}
