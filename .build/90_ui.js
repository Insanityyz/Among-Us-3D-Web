/* ============================================================================
   8. UI: menus, HUD, settings, ship map, in-world screens, sabotage map
   ========================================================================== */
const UI={
  toasts:[],blackout:0,dmg:0,screen:null,settingsTab:'controls',mapMode:null,
  init(){
    const $=id=>document.getElementById(id);
    // menu buttons
    $('btnLocal').onclick=()=>{ AUDIO.click(); Game.quickStart(false); };
    $('btnFreeplay').onclick=()=>{ AUDIO.click(); Game.quickStart(true); };
    $('btnLobby').onclick=()=>{ AUDIO.click(); UI.showScreen('lobby'); UI.buildLobby(); };
    $('btnLobbyBack').onclick=()=>{ AUDIO.click(); UI.showScreen('menu'); };
    $('btnHow').onclick=$('btnHelp').onclick=()=>{ AUDIO.click(); UI.openSettings('help'); };
    $('btnSettingsMenu').onclick=()=>{ AUDIO.click(); UI.openSettings('graphics'); };
    $('btnRandomize').onclick=()=>{ AUDIO.click(); Profile.randomize(); UI.buildMenu(); };
    $('btnOnline').onclick=()=>{ UI.toast('Online play is scaffolded but disabled in this build'); };
    $('btnStart').onclick=()=>{ AUDIO.click(); Game.startFromLobby(); };
    $('btnResetSettings').onclick=()=>{ AUDIO.click(); G.settings=Object.assign({},DEFAULT_SETTINGS); UI.buildLobby(); };
    $('btnAgain').onclick=()=>{ AUDIO.click(); Game.quickStart(G.settings.freeplay); };
    $('btnMenuFromResult').onclick=()=>{ AUDIO.click(); Game.toMenu(); };
    $('btnSetClose').onclick=$('btnSetDone').onclick=()=>{ AUDIO.click(); UI.closeSettings(); };
    $('btnQuitMatch').onclick=()=>{ AUDIO.click(); Game.toMenu(); };
    $('taskClose').onclick=()=>{ TASKUI.close(); if(G.phase==='playing') requestLock(); };
    // hud buttons
    $('btnMap').onclick=()=>UI.toggleMap();
    $('btnTaskList').onclick=()=>UI.toggleTaskList();
    $('btnSettings').onclick=()=>UI.openSettings('controls');
    $('abUse').onclick=()=>Actions.use();
    $('abReport').onclick=()=>Actions.report();
    $('abKill').onclick=()=>Actions.kill();
    $('abVent').onclick=()=>Actions.vent();
    $('abSab').onclick=()=>Actions.sabotage();
    // meeting
    $('btnVote').onclick=()=>MEET.cast(MEET.myVote);
    $('btnSkip').onclick=()=>{ MEET.myVote='skip'; MEET.cast('skip'); };
    $('chatSend').onclick=()=>sendChat(document.getElementById('chatField').value);
    $('chatField').addEventListener('keydown',e=>{ if(e.key==='Enter'){ sendChat(e.target.value); e.target.blur(); } e.stopPropagation(); });
    // map overlay click closes
    $('mapOv').addEventListener('click',e=>{ if(e.target.id==='mapOv') UI.toggleMap(false); });
    $('eject').addEventListener('click',()=>EJECT.skip());
    $('role').addEventListener('click',()=>Game.finishRoleReveal());
    // touch hold for task panels
    $('taskBody').addEventListener('pointerdown',()=>{ TASKUI.touchHold=true; });
    addEventListener('pointerup',()=>{ TASKUI.touchHold=false; });
    // window blur -> pause
    addEventListener('blur',()=>{ if(G.phase==='playing'&&INPUT.mouse.locked) exitLock(); });
    document.addEventListener('visibilitychange',()=>{ if(document.hidden&&G.phase==='playing') G.paused=true; });
  },
  showScreen(name){
    ['boot','menu','lobby','role','meeting','eject','result','settings'].forEach(s=>{
      const el=document.getElementById(s);
      if(el) el.classList.toggle('hidden',s!==name);
    });
    if(name==='menu'||name==='lobby'){ document.getElementById('hud').style.display='none'; }
    else document.getElementById('hud').style.display='';
    this.screen=name;
  },
  blocksInput(){
    return G.phase!=='playing'||!!G.modalOpen||!!MEET.active||EJECT.active||
      document.getElementById('settings').classList.contains('hidden')===false||
      document.getElementById('mapOv').classList.contains('on');
  },
  blocksMovement(){
    return !!G.modalOpen||document.getElementById('mapOv').classList.contains('on')||
      !document.getElementById('settings').classList.contains('hidden');
  },
  toast(msg,kind,ms){
    const box=document.getElementById('toasts');
    const el=mk(`<div class="toast ${kind||''}">${esc(msg)}</div>`);
    box.appendChild(el);
    setTimeout(()=>{ el.style.transition='opacity .4s, transform .4s'; el.style.opacity='0'; el.style.transform='translateY(-10px)';
      setTimeout(()=>el.remove(),420); },ms||2400);
    while(box.children.length>5) box.removeChild(box.firstChild);
  },
  damageFlash(v){
    const d=document.getElementById('dmg');
    d.style.transition='opacity .08s'; d.style.opacity=String(v);
    setTimeout(()=>{ d.style.transition='opacity .55s'; d.style.opacity='0'; },90);
  },
  fadeBlack(inDur,outDur){
    const b=document.getElementById('blackout');
    b.style.transition=`opacity ${inDur}s`; b.classList.add('on');
    setTimeout(()=>{ b.style.transition=`opacity ${outDur||0.6}s`; b.classList.remove('on'); },inDur*1000+180);
  },
  closeAllPanels(){ TASKUI.close(true); UI.toggleMap(false); document.getElementById('taskList').classList.remove('on'); },
  onEscape(){
    if(G.modalOpen){ TASKUI.close(); if(G.phase==='playing') requestLock(); return; }
    if(document.getElementById('mapOv').classList.contains('on')){ UI.toggleMap(false); return; }
    if(MEET.active||EJECT.active) return;
    if(G.phase==='playing'){
      const s=document.getElementById('settings');
      if(s.classList.contains('hidden')) UI.openSettings('controls'); else UI.closeSettings();
    } else if(G.phase==='menu'||G.phase==='lobby'){ UI.showScreen('menu'); }
  },
  toggleTaskList(force){
    const el=document.getElementById('taskList');
    const on=force===undefined?!el.classList.contains('on'):force;
    el.classList.toggle('on',on);
    if(on) UI.renderTaskList();
    AUDIO.click();
  },
  renderTaskList(){
    const el=document.getElementById('taskList');
    const me=G.me; if(!me){ el.innerHTML=''; return; }
    const imp=me.role==='impostor';
    let html=`<h4>${imp?'Fake Tasks':'Your Tasks'}</h4>`;
    if(imp) html+=`<div class="note" style="font-size:11px;margin-bottom:6px">You cannot complete tasks — stand at consoles to blend in.</div>`;
    let lastCat='';
    for(const t of me.tasks){
      if(t.cat!==lastCat){ lastCat=t.cat; html+=`<div class="sub">${t.cat} task${t.visual?' · visual':''}</div>`; }
      const st=t.stages[Math.min(t.stage,t.stages.length-1)];
      const room=(G.M.stById[st.station]||{}).roomName||'';
      html+=`<div class="ti ${t.done?'done':''}"><span class="box"></span><span>${esc(t.name)}</span><span class="loc">${esc(room)}${t.stages.length>1?` ${Math.min(t.stage+1,t.stages.length)}/${t.stages.length}`:''}</span></div>`;
    }
    el.innerHTML=html;
  },
  toggleMap(force,mode){
    const el=document.getElementById('mapOv');
    const on=force===undefined?!el.classList.contains('on'):force;
    el.classList.toggle('on',on);
    UI.mapMode=on?(mode||'map'):null;
    document.getElementById('sabLayer').innerHTML='';
    document.getElementById('sabLayer').style.pointerEvents=on&&UI.mapMode==='sabotage'?'auto':'none';
    document.getElementById('mapHint').textContent=UI.mapMode==='sabotage'?'Choose a system to sabotage':'Press M to close';
    if(on){ UI.drawMapOverlay(); AUDIO.click(); }
    else if(G.phase==='playing'&&!UI.blocksInput()) requestLock();
  },
  drawMapOverlay(){
    const cv=document.getElementById('mapCanvas');
    const g=cv.getContext('2d');
    const W=cv.width,H=cv.height;
    g.clearRect(0,0,W,H);
    drawShipMap(g,W,H,{
      you:UI.mapMode==='admin'?null:{x:CLIENT.pos.x,z:CLIENT.pos.z,yaw:CLIENT.yaw},
      dots:UI.mapMode==='admin'?adminDots():[],
      vents:!!(G.me&&G.me.role==='impostor'&&!G.me.alive===false&&G.me.role==='impostor'),
      doors:true,
      sabs:G.server?activeSabMarkers():[],
      labels:true,
    });
    if(UI.mapMode==='sabotage') UI.buildSabIcons();
  },
  buildSabIcons(){
    const layer=document.getElementById('sabLayer');
    const frame=layer.parentElement.querySelector('canvas');
    layer.innerHTML='';
    const S=G.server?G.server.state:null;
    const busy=!!(S&&S.sab);
    const opts=[
      {type:'reactor',x:-45.5,z:0,icon:'i-bolt',label:'Reactor'},
      {type:'o2',x:6,z:-10,icon:'i-o2',label:'O2'},
      {type:'lights',x:-32.6,z:7,icon:'i-bolt',label:'Lights'},
      {type:'comms',x:8,z:7.5,icon:'i-net',label:'Comms'},
    ];
    const doorIcons=[];
    for(const d of G.M.doors){ if(d.auto) doorIcons.push(d); }
    const roomSeen={};
    for(const d of doorIcons){
      if(roomSeen[d.roomId]) continue; roomSeen[d.roomId]=1;
      const r=G.M.byId[d.roomId];
      const el=mk(`<div class="sabIcon door" title="Close ${esc(r.name)} doors"><svg><use href="#i-door"/></svg></div>`);
      const p=worldToCanvas(r.bb.cx,r.bb.cz,frame.width,frame.height);
      el.style.left=p.x+'px'; el.style.top=p.y+'px';
      el.style.pointerEvents='auto';
      el.onclick=()=>{ G.net.send({t:'sabotage',id:G.meId,type:'doors',room:d.roomId}); UI.toggleMap(false); };
      layer.appendChild(el);
    }
    for(const o of opts){
      const el=mk(`<div class="sabIcon ${busy?'':''}" title="${o.label}"><svg><use href="#${o.icon}"/></svg></div>`);
      const p=worldToCanvas(o.x,o.z,frame.width,frame.height);
      el.style.left=p.x+'px'; el.style.top=p.y+'px';
      el.style.pointerEvents='auto';
      if(busy){ el.style.filter='grayscale(1) brightness(.5)'; el.style.animation='none'; }
      el.onclick=()=>{
        if(busy){ UI.toast('A sabotage is already running','warn'); return; }
        G.net.send({t:'sabotage',id:G.meId,type:o.type});
        UI.toggleMap(false);
      };
      layer.appendChild(el);
    }
  },
  /* ---------- settings ---------- */
  openSettings(tab){
    UI.settingsTab=tab||'controls';
    document.getElementById('settings').classList.remove('hidden');
    document.getElementById('setTitle').textContent=G.phase==='playing'?'Paused':'Settings';
    document.getElementById('btnQuitMatch').style.display=G.phase==='playing'?'':'none';
    UI.buildSettings();
    exitLock();
    AUDIO.click();
  },
  closeSettings(){
    document.getElementById('settings').classList.add('hidden');
    if(G.phase==='playing'&&!G.isTouch) requestLock();
    Profile.save();
  },
  buildSettings(){
    const tabs=document.getElementById('setTabs');
    tabs.innerHTML='';
    [['controls','Controls'],['graphics','Graphics'],['audio','Audio'],['help','How to Play']].forEach(([id,label])=>{
      const c=mk(`<button class="chip ${UI.settingsTab===id?'on':''}">${label}</button>`);
      c.onclick=()=>{ UI.settingsTab=id; UI.buildSettings(); AUDIO.click(); };
      tabs.appendChild(c);
    });
    const body=document.getElementById('setBody');
    const c=G.client;
    if(UI.settingsTab==='controls'){
      body.innerHTML=`<div class="helpGrid">
        <div class="grp"><h4>Movement</h4><div class="klist">
          <div class="krow">Move<b>W A S D</b></div>
          <div class="krow">Look<b>Mouse</b></div>
          <div class="krow">Lock / release cursor<b>Click / Esc</b></div>
        </div></div>
        <div class="grp"><h4>Actions</h4><div class="klist">
          <div class="krow">Use / interact<b>E · LMB</b></div>
          <div class="krow">Report body<b>R</b></div>
          <div class="krow">Kill (impostor)<b>Q</b></div>
          <div class="krow">Vent (impostor)<b>V</b></div>
          <div class="krow">Sabotage map (impostor)<b>B</b></div>
        </div></div>
        <div class="grp"><h4>Interface</h4><div class="klist">
          <div class="krow">Ship map<b>M</b></div>
          <div class="krow">Task list<b>Tab</b></div>
          <div class="krow">First / third person<b>F</b></div>
          <div class="krow">Pause &amp; settings<b>Esc</b></div>
          <div class="krow">Quick chat in meetings<b>1 … 9</b></div>
        </div></div>
        <div class="grp"><h4>Feel</h4>
          ${optSlider('Mouse sensitivity','sensitivity',0.2,3,0.05,c.sensitivity,v=>{c.sensitivity=v;})}
          ${optToggle('Invert look Y','invertY',c.invertY,v=>{c.invertY=v;})}
          ${optToggle('Head bob','headBob',c.headBob,v=>{c.headBob=v;})}
          ${optToggle('Screen shake','screenShake',c.screenShake,v=>{c.screenShake=v;})}
          ${optToggle('Third person view','thirdPerson',c.thirdPerson,v=>{c.thirdPerson=v;})}
        </div></div>`;
      wireOpts(body);
    } else if(UI.settingsTab==='graphics'){
      body.innerHTML=`<div class="helpGrid">
        <div class="grp"><h4>Display</h4>
          ${optSlider('Field of view','fov',60,100,1,c.fov,v=>{c.fov=v;RENDER.camera.fov=v;})}
          ${optChips('Quality','quality',['low','medium','high'],c.quality,v=>{c.quality=v;Game.applyQuality();})}
          ${optToggle('Bloom &amp; glare','bloom',c.bloom,v=>{c.bloom=v;RENDER.bloomOn=v;})}
          ${optToggle('Show FPS','showFps',c.showFps,v=>{c.showFps=v;})}
        </div>
        <div class="grp"><h4>About this build</h4>
          <div class="note">Rendered with <b>Three.js</b> on <b>${RENDER.isWebGL2?'WebGL 2':'WebGL 1 (fallback)'}</b>.
          Every mesh, texture, sound and screen in this game is generated procedurally at runtime — there are no
          downloaded art assets. The ship is ${G.M?G.M.rooms.length:0} rooms, ${G.M?G.M.walls.length:0} wall segments,
          ${VENTS.length} vents and ${STATION_DEFS.length} consoles.<br><br>
          <b>Online play</b> is wired up but switched off: see <code>NET.ENABLED</code> in the source. The same
          authoritative <code>Server</code> class runs the match, so swapping the loopback transport for a WebSocket
          relay is all that is required.</div>
        </div></div>`;
      wireOpts(body);
    } else if(UI.settingsTab==='audio'){
      body.innerHTML=`<div class="helpGrid"><div class="grp"><h4>Volume</h4>
          ${optSlider('Master','masterVol',0,1,0.05,c.masterVol,v=>{c.masterVol=v;AUDIO.setVolumes();})}
          ${optSlider('Effects','sfxVol',0,1,0.05,c.sfxVol,v=>{c.sfxVol=v;AUDIO.setVolumes();})}
          ${optSlider('Ambience','musicVol',0,1,0.05,c.musicVol,v=>{c.musicVol=v;AUDIO.setVolumes();})}
          <button class="btn sm blue mt" id="btnAudioTest">Test sound</button>
        </div>
        <div class="grp"><h4>Tips</h4><div class="note">Audio starts muted until you click or press a key (browser policy).
        Footsteps, vents, kills, alarms and the eject sequence are all synthesised live.</div></div></div>`;
      wireOpts(body);
      const t=document.getElementById('btnAudioTest');
      if(t) t.onclick=()=>{ AUDIO.init(); AUDIO.taskDone(); };
    } else {
      body.innerHTML=`<div class="helpGrid">
        <div class="grp"><h4>Crewmates</h4><div class="note">
          Finish <b>every task</b> or eject <b>every impostor</b>. Tasks are the coloured consoles around the ship —
          walk up to one and press <b>E</b>. Your task list (<b>Tab</b>) shows where each one is.
          Watch the top bar: it fills as the crew completes work.<br><br>
          Find a body? Press <b>R</b> to report it, or hit the red button in the Cafeteria to call a meeting.
          Dead crewmates become ghosts: they can still finish their own tasks, but nobody can see or hear them.</div></div>
        <div class="grp"><h4>Impostors</h4><div class="note">
          <b>Q</b> kills whoever is in range when your cooldown is ready. <b>V</b> drops you into the vent network —
          arrows show which vents are linked. <b>B</b> opens the sabotage map: cut the lights, break comms, seal doors,
          or start a critical meltdown (Reactor / O2) that wins the game if the crew cannot repair it in time.<br><br>
          Your tasks are fake. Stand at consoles anyway so nobody notices.</div></div>
        <div class="grp"><h4>Meetings</h4><div class="note">
          Discussion first, then voting. Pick a player and press <b>VOTE</b>, or skip. Ties eject nobody.
          With <b>Confirm Ejects</b> on you are told whether they were an impostor.
          Use the quick-chat buttons or type your own message.</div></div>
        <div class="grp"><h4>The Skeld systems</h4><div class="note">
          <b>Admin</b> table shows which room everyone is in. <b>MedBay vitals</b> show who is still alive.
          <b>Security cameras</b> watch four hallways. All three go dark if Communications is sabotaged.
          Reactor meltdown needs two people at once; Oxygen needs the same six-digit code entered at O2 and Admin.</div></div>
      </div>`;
    }
  },
  /* ---------- menu / lobby ---------- */
  buildMenu(){
    const sw=document.getElementById('swatches');
    sw.innerHTML='';
    COLORS.forEach((c,i)=>{
      const el=mk(`<div class="sw ${Profile.color===i?'sel':''}" style="background:linear-gradient(180deg,${lighten(c.css,1.25)},${c.css})" title="${c.name}"></div>`);
      el.onclick=()=>{ Profile.color=i; AUDIO.blip(600+i*14,.05,'triangle',.08); UI.buildMenu(); Profile.save(); };
      sw.appendChild(el);
    });
    const vc=document.getElementById('visorChips'); vc.innerHTML='';
    VISORS.forEach((v,i)=>{
      const el=mk(`<button class="chip ${Profile.visor===i?'on':''}" style="${Profile.visor===i?'':`box-shadow:inset 0 0 0 2px ${'#'+v.hex.toString(16).padStart(6,'0')}`}">${v.name}</button>`);
      el.onclick=()=>{ Profile.visor=i; AUDIO.click(); UI.buildMenu(); Profile.save(); };
      vc.appendChild(el);
    });
    const vw=document.getElementById('viewChips'); vw.innerHTML='';
    [['First','0'],['Third','1']].forEach(([label,v])=>{
      const el=mk(`<button class="chip ${(G.client.thirdPerson?1:0)==+v?'on':''}">${label}</button>`);
      el.onclick=()=>{ G.client.thirdPerson=!!+v; AUDIO.click(); UI.buildMenu(); Profile.save(); };
      vw.appendChild(el);
    });
    document.getElementById('nameInput').value=Profile.name;
  },
  buildLobby(){
    const s=G.settings;
    const set=(k,v,fmt)=>{ const el=document.getElementById('v-'+k); if(el) el.textContent=fmt?fmt(v):v; };
    set('maxPlayers',s.maxPlayers); set('botCount',s.botCount); set('impostors',s.impostors);
    set('crewVision',s.crewVision.toFixed(2).replace(/0$/,'')); set('impostorVision',s.impostorVision.toFixed(2).replace(/0$/,''));
    set('playerSpeed',s.playerSpeed.toFixed(2).replace(/0$/,'')); set('killCooldown',s.killCooldown+'s');
    set('sabCooldown',s.sabCooldown+'s'); set('emergCooldown',s.emergCooldown+'s'); set('emergencies',s.emergencies);
    set('discussion',s.discussion+'s'); set('voting',s.voting+'s');
    set('commonTasks',s.commonTasks); set('longTasks',s.longTasks); set('shortTasks',s.shortTasks);
    document.querySelectorAll('#lobby .stepper button').forEach(b=>{
      b.onclick=()=>{
        const k=b.dataset.s, d=parseFloat(b.dataset.d);
        AUDIO.click();
        if(k==='maxPlayers') s.maxPlayers=clamp(s.maxPlayers+d,4,15);
        if(k==='botCount') s.botCount=clamp(s.botCount+d,0,s.maxPlayers-1);
        if(k==='impostors') s.impostors=clamp(s.impostors+d,1,3);
        if(k==='crewVision') s.crewVision=clamp(s.crewVision+d,0.25,3);
        if(k==='impostorVision') s.impostorVision=clamp(s.impostorVision+d,0.25,3);
        if(k==='playerSpeed') s.playerSpeed=clamp(s.playerSpeed+d,0.5,3);
        if(k==='killCooldown') s.killCooldown=clamp(s.killCooldown+d,10,60);
        if(k==='sabCooldown') s.sabCooldown=clamp(s.sabCooldown+d,10,60);
        if(k==='emergCooldown') s.emergCooldown=clamp(s.emergCooldown+d,0,60);
        if(k==='emergencies') s.emergencies=clamp(s.emergencies+d,0,9);
        if(k==='discussion') s.discussion=clamp(s.discussion+d,0,120);
        if(k==='voting') s.voting=clamp(s.voting+d,0,300);
        if(k==='commonTasks') s.commonTasks=clamp(s.commonTasks+d,0,3);
        if(k==='longTasks') s.longTasks=clamp(s.longTasks+d,0,5);
        if(k==='shortTasks') s.shortTasks=clamp(s.shortTasks+d,0,8);
        if(s.botCount>s.maxPlayers-1) s.botCount=s.maxPlayers-1;
        if(s.impostors>Math.max(1,Math.floor((s.botCount+1)/4))) s.impostors=Math.max(1,Math.floor((s.botCount+1)/4));
        UI.buildLobby(); Profile.save();
      };
    });
    // chips
    const chipSet=(elId,val,opts,apply)=>{
      const el=document.getElementById(elId); el.innerHTML='';
      opts.forEach(o=>{
        const c=mk(`<button class="chip ${o.v===val?'on':''}">${o.label}</button>`);
        c.onclick=()=>{ AUDIO.click(); apply(o.v); UI.buildLobby(); Profile.save(); };
        el.appendChild(c);
      });
    };
    chipSet('optMap','skeld',[{v:'skeld',label:'The Skeld'}],v=>G.settings.map=v);
    chipSet('optKillDist',s.killDistance,KILL_DIST_NAME.map((n,i)=>({v:i,label:n})),v=>s.killDistance=v);
    chipSet('optTaskBar',s.taskBar,[{v:'always',label:'Always'},{v:'meetings',label:'Meetings'},{v:'never',label:'Never'}],v=>s.taskBar=v);
    const tog=(id,key)=>{ const el=document.getElementById(id); el.classList.toggle('on',!!s[key]);
      el.onclick=()=>{ s[key]=!s[key]; el.classList.toggle('on',s[key]); AUDIO.click(); Profile.save(); }; };
    tog('t-anonVotes','anonVotes'); tog('t-confirmEjects','confirmEjects');
    tog('t-visualTasks','visualTasks');
    // slots — show the exact crew that will spawn
    const slots=document.getElementById('lobbySlots'); slots.innerHTML='';
    const roster=(typeof Game!=='undefined'&&Game.ensureRoster)?Game.ensureRoster():[{name:Profile.name,color:Profile.color}];
    roster.forEach((r,i)=>{
      const c=COLORS[r.color]||COLORS[0];
      slots.appendChild(mk(`<div class="slot ${i===0?'you':''}"><span class="dot" style="background:${c.css}"></span>
        <div style="min-width:0"><div class="nm">${esc(r.name)}</div><div class="tag">${i===0?'You · Host':'CPU'}</div></div></div>`));
    });
    for(let i=roster.length;i<s.maxPlayers;i++) slots.appendChild(mk(`<div class="slot empty"><span class="dot" style="background:#2b3550"></span><div><div class="nm">Empty</div><div class="tag">Waiting</div></div></div>`));
  },
  /* ---------- HUD ---------- */
  updateHUD(dt){
    const me=G.me; if(!me) return;
    const S=G.server?G.server.state:null;
    // task bar
    const tb=document.getElementById('taskbarFill');
    const mode=G.settings.taskBar;
    const showBar=mode==='always'||(mode==='meetings'&&MEET.active)||(me.role==='impostor'&&false);
    document.getElementById('taskbarWrap').style.opacity=(mode==='never')?0.25:1;
    if(S){
      const pct=S.taskTotal?S.taskDone/S.taskTotal:0;
      tb.style.width=(pct*100).toFixed(1)+'%';
      tb.parentElement.querySelector('.tb-label').textContent=me.role==='impostor'?'Tasks (fake)':`Tasks ${Math.round(pct*100)}%`;
    }
    // room label
    const room=G.M.roomAt(CLIENT.pos.x,CLIENT.pos.z);
    const rl=document.getElementById('roomLabel');
    const nm=CLIENT.inVent?'Ventilation':(room?room.name:'Space');
    if(rl.textContent!==nm) rl.textContent=nm;
    // role chip
    const chip=document.getElementById('roleChip'), ctxt=document.getElementById('roleChipTxt');
    const cls=!me.alive?'ghost':(me.role==='impostor'?'impo':'crew');
    chip.className=cls; ctxt.textContent=!me.alive?'Ghost':(me.role==='impostor'?'Impostor':'Crewmate');
    // prompt + buttons
    updateActions(dt);
    // sabotage banner
    const banner=document.getElementById('sabBanner');
    if(S&&S.sab){
      banner.classList.add('on');
      const def=SAB_TYPES[S.sab.type];
      const roomName=(S.sab.type==='doors'&&S.sab.room&&G.M.byId[S.sab.room])?(' — '+G.M.byId[S.sab.room].name):'';
      document.getElementById('sabText').textContent=def?(def.name+roomName):'Sabotage';
      const clk=document.getElementById('sabClock');
      if(S.sab.timer>0){ clk.textContent=Math.ceil(S.sab.timer)+'s'; clk.style.display=''; }
      else { clk.textContent=S.sab.type==='doors'?'DOORS':'FIX IT'; clk.style.display=''; }
    } else banner.classList.remove('on');
    // fps
    document.getElementById('fps').style.display=G.client.showFps?'':'none';
    if(G.client.showFps) document.getElementById('fps').textContent=`${Math.round(G.fps)} FPS · ${RENDER.drawCalls||0} draws`;
    // task list refresh (cheap, only when open)
    if(document.getElementById('taskList').classList.contains('on')&&G.frames%20===0) UI.renderTaskList();
  },
  /* ---------- results ---------- */
  showResult(evt){
    G.phase='result';
    document.getElementById('result').classList.remove('hidden');
    const crew=evt.winner==='crewmate';
    const t=document.getElementById('resTitle');
    t.className='rt '+(crew?'crew':'impo');
    t.textContent=crew?'Crewmates Win':'Impostors Win';
    document.getElementById('resSub').textContent=evt.reason||'';
    const me=G.me;
    const myTasks=me?me.tasks.filter(t=>t.done).length:0;
    const stats=[
      ['Tasks done',`${G.server?G.server.state.taskDone:0}/${G.server?G.server.state.taskTotal:0}`],
      ['Your tasks',`${myTasks}/${me?me.tasks.length:0}`],
      ['Kills',String(evt.players.reduce((a,p)=>a+(p.role==='impostor'?p.kills:0),0))],
      ['Match time',fmtTime(G.server?G.server.state.time:0)],
    ];
    document.getElementById('resStats').innerHTML=stats.map(([k,v])=>`<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    document.getElementById('resPlayers').innerHTML=evt.players.map(p=>
      `<div class="pp"><span class="dot" style="width:14px;height:17px;border-radius:7px 7px 4px 4px;background:${cssOf(p.color)};display:inline-block"></span>
       ${esc(p.name)} <span class="r ${p.role==='impostor'?'i':''}">${p.role==='impostor'?'Impostor':'Crewmate'}</span>
       ${p.alive?'':'<span style="opacity:.6">✝</span>'}</div>`).join('');
    AUDIO.win(crew);
    const won=me?((me.role==='impostor')===!crew):false;
    UI.toast(won?'Victory':'Defeat',won?'good':'bad',3000);
  },
  /* ---------- role reveal ---------- */
  roleReveal(role,partners){
    G.phase='role';
    const el=document.getElementById('role');
    el.classList.remove('hidden');
    const imp=role==='impostor';
    const t=document.getElementById('roleTitle');
    t.className='big '+(imp?'impo':'crew');
    t.textContent=imp?'Impostor':'Crewmate';
    document.getElementById('roleSub').textContent=imp
      ? 'Sabotage the ship and eliminate the crew — do not get caught'
      : 'Complete every task, or find the impostors and eject them';
    const box=document.getElementById('rolePartners');
    box.innerHTML='';
    if(imp&&partners&&partners.length>1){
      box.appendChild(mk(`<div class="smallcaps" style="width:100%;text-align:center;margin-bottom:4px">Your fellow impostors</div>`));
      partners.filter(p=>p.id!==G.meId).forEach(p=>{
        box.appendChild(mk(`<div class="p"><span style="width:15px;height:19px;border-radius:8px 8px 5px 5px;background:${cssOf(p.color)};display:inline-block"></span>${esc(p.name)}</div>`));
      });
    } else if(imp){
      box.appendChild(mk(`<div class="p">You are the only impostor</div>`));
    }
    AUDIO.blip(imp?120:440,0.5,imp?'sawtooth':'triangle',0.14,imp?70:660);
  },
};
function fmtTime(s){ const m=Math.floor(s/60),ss=Math.floor(s%60); return m+':'+String(ss).padStart(2,'0'); }
function lighten(css,f){
  const n=parseInt(css.slice(1),16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  r=Math.min(255,Math.round(r*f)); g=Math.min(255,Math.round(g*f)); b=Math.min(255,Math.round(b*f));
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
/* ---------- settings widget helpers ---------- */
function optSlider(label,key,min,max,step,val,onchange){
  return `<div class="opt"><div class="lbl">${label}</div>
    <input type="range" data-opt="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
    <div class="val" data-val="${key}">${(+val).toFixed(step<1?2:0)}</div></div>`;
}
function optToggle(label,key,val,onchange){
  return `<div class="opt"><div class="lbl">${label}</div><button class="tog ${val?'on':''}" data-tog="${key}"><i></i></button></div>`;
}
function optChips(label,key,opts,val){
  return `<div class="opt"><div class="lbl">${label}</div><div class="chips" data-chips="${key}">${
    opts.map(o=>`<button class="chip ${o===val?'on':''}" data-v="${o}">${o}</button>`).join('')}</div></div>`;
}
function wireOpts(root){
  root.querySelectorAll('input[type=range][data-opt]').forEach(inp=>{
    const key=inp.dataset.opt;
    inp.oninput=()=>{
      const v=parseFloat(inp.value);
      G.client[key]=v;
      const out=root.querySelector(`[data-val="${key}"]`);
      if(out) out.textContent=v.toFixed(inp.step<1?2:0);
      if(key==='sensitivity'){} if(key==='fov') RENDER.camera.fov=v;
      if(key==='masterVol'||key==='sfxVol'||key==='musicVol') AUDIO.setVolumes();
      Profile.save();
    };
  });
  root.querySelectorAll('[data-tog]').forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.tog;
      G.client[k]=!G.client[k];
      b.classList.toggle('on',G.client[k]);
      if(k==='bloom') RENDER.bloomOn=G.client[k];
      if(k==='thirdPerson') CAM.mode=CAM.mode;
      AUDIO.click(); Profile.save();
    };
  });
  root.querySelectorAll('[data-chips]').forEach(box=>{
    const k=box.dataset.chips;
    box.querySelectorAll('.chip').forEach(c=>{
      c.onclick=()=>{
        const v=c.dataset.v;
        G.client[k]=v==='true'?true:v==='false'?false:(isNaN(+v)?v:+v);
        box.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x===c));
        if(k==='quality') Game.applyQuality();
        AUDIO.click(); Profile.save();
      };
    });
  });
}
/* ---------- action buttons ---------- */
function setBtn(el,show,cooldown,total,label){
  el.classList.toggle('show',!!show);
  const cd=el.querySelector('.cd'), cdt=el.querySelector('.cdt');
  if(cooldown>0){
    el.classList.add('cooling');
    cd.style.setProperty('--cd',(360*clamp(cooldown/Math.max(0.001,total),0,1))+'deg');
    cdt.textContent=Math.ceil(cooldown)+'s';
  } else el.classList.remove('cooling');
  if(label!==undefined){ const c=el.querySelector('.cap'); if(c&&label) c.textContent=label; }
}
function updateActions(dt){
  const me=G.me,S=G.server?G.server.state:null;
  if(!me||!S){ return; }
  const imp=me.role==='impostor'&&me.alive;
  const C=CLIENT;
  // USE
  const useBtn=document.getElementById('abUse');
  const doorPrompt=C.doorTarget;
  let useLabel='';
  if(C.useTarget) useLabel=C.useTarget.label||'Use';
  else if(doorPrompt) useLabel='Open door';
  setBtn(useBtn,!!(C.useTarget||doorPrompt)||C.inVent,0,1,C.inVent?'Exit vent':useLabel);
  if(C.inVent) useBtn.querySelector('.key').textContent='V'; else useBtn.querySelector('.key').textContent='E';
  // REPORT
  setBtn(document.getElementById('abReport'),!!C.reportTarget,0,1);
  // KILL
  const kb=document.getElementById('abKill');
  setBtn(kb,imp&&!!C.killTarget&&!C.inVent,me.killCd,G.settings.killCooldown);
  if(C.killTarget) kb.querySelector('.cap').textContent='Kill';
  // VENT
  setBtn(document.getElementById('abVent'),imp&&(!!C.ventTarget||C.inVent),0,1,C.inVent?'Exit':'Vent');
  // SABOTAGE
  const sabBusy=!!S.sab;
  setBtn(document.getElementById('abSab'),imp&&!C.inVent,me.sabCd,G.settings.sabCooldown);
  document.getElementById('abSab').style.filter=sabBusy?'grayscale(.8) brightness(.6)':'';
  // prompt
  const pr=document.getElementById('prompt');
  // desktop shows the key, touch shows the on-screen button name
  const key=(k,label)=>G.isTouch?`<b>${label}</b>`:`<b>${k}</b>`;
  let txt='';
  if(C.inVent){
    const links=ventLinks(C.ventId);
    txt=`In the vent — ${key('V','EXIT VENT')} to leave${links.length?` · ${links.length} tunnel${links.length>1?'s':''} available`:''}`;
  } else if(C.reportTarget) txt=`${key('R','REPORT')} — Report body`;
  else if(imp&&C.killTarget) txt=`${key('Q','KILL')} — Kill ${esc((S.players.find(p=>p.id===C.killTarget.id)||{}).name||'')}`;
  else if(C.useTarget) txt=`${key('E','USE')} — ${esc(C.useTarget.label||'Use')}`;
  else if(doorPrompt) txt=`${key('E','USE')} — Open door`;
  pr.innerHTML=txt; pr.classList.toggle('on',!!txt);
  document.getElementById('cross').style.opacity=txt?0.9:0.4;
}

/* ============================================================================
   Ship map rendering (shared by the M-key overlay, Admin table and sabotage)
   ========================================================================== */
const MAPVIEW={x1:-53,z1:-23,x2:35,z2:21};
function mapTransform(W,H,pad){
  pad=pad||26;
  const sx=(W-pad*2)/(MAPVIEW.x2-MAPVIEW.x1), sy=(H-pad*2)/(MAPVIEW.z2-MAPVIEW.z1);
  const s=Math.min(sx,sy);
  const ox=(W-(MAPVIEW.x2-MAPVIEW.x1)*s)/2-MAPVIEW.x1*s;
  const oy=(H-(MAPVIEW.z2-MAPVIEW.z1)*s)/2-MAPVIEW.z1*s;
  return {s,ox,oy};
}
function worldToCanvas(x,z,W,H){ const t=mapTransform(W,H); return {x:x*t.s+t.ox,y:z*t.s+t.oy}; }
function drawShipMap(g,W,H,opt){
  opt=opt||{};
  const M=G.M; if(!M) return;
  const t=mapTransform(W,H,opt.pad||22);
  const P=(x,z)=>[x*t.s+t.ox,z*t.s+t.oy];
  g.save();
  // backdrop grid
  g.fillStyle='#070c15'; g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(90,140,200,.07)'; g.lineWidth=1;
  for(let x=MAPVIEW.x1;x<=MAPVIEW.x2;x+=4){ const p=P(x,MAPVIEW.z1),q=P(x,MAPVIEW.z2); g.beginPath(); g.moveTo(p[0],p[1]); g.lineTo(q[0],q[1]); g.stroke(); }
  for(let z=MAPVIEW.z1;z<=MAPVIEW.z2;z+=4){ const p=P(MAPVIEW.x1,z),q=P(MAPVIEW.x2,z); g.beginPath(); g.moveTo(p[0],p[1]); g.lineTo(q[0],q[1]); g.stroke(); }
  // rooms
  for(const r of M.rooms){
    g.beginPath();
    r.poly.forEach((p,i)=>{ const q=P(p[0],p[1]); i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]); });
    g.closePath();
    const acc='#'+new THREE.Color(r.accent).getHexString();
    g.fillStyle=r.corridor?'rgba(120,150,190,.10)':hexA(acc,0.16);
    g.fill();
    g.lineWidth=r.corridor?1.4:2.2;
    g.strokeStyle=r.corridor?'rgba(140,175,215,.35)':hexA(acc,0.85);
    g.stroke();
  }
  // doors
  if(opt.doors){
    for(const d of M.doors){
      if(d.win) continue;
      const a=P(d.x1,d.z1),b=P(d.x2,d.z2);
      const closed=G.server&&G.server.state.doors[d.id];
      g.lineWidth=4.5; g.strokeStyle=closed?'#ff5a4a':'rgba(180,220,255,.45)';
      g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
    }
  }
  // vents
  if(opt.vents){
    for(const v of M.vents){
      const p=P(v.x,v.z);
      g.fillStyle='rgba(90,255,160,.85)';
      g.fillRect(p[0]-4,p[1]-4,8,8);
      g.strokeStyle='rgba(10,20,14,.9)'; g.lineWidth=1.4; g.strokeRect(p[0]-4,p[1]-4,8,8);
    }
  }
  // labels
  if(opt.labels){
    g.font=`700 ${Math.max(8,11)}px "Baloo 2",sans-serif`;
    g.textAlign='center'; g.textBaseline='middle';
    for(const r of M.rooms){
      if(r.corridor&&Math.max(r.bb.w,r.bb.h)<12) continue;
      const p=P(r.bb.cx,r.bb.cz);
      g.fillStyle='rgba(6,10,18,.75)';
      const w=g.measureText(r.name.toUpperCase()).width+8;
      g.fillRect(p[0]-w/2,p[1]-7,w,14);
      g.fillStyle=r.corridor?'rgba(190,215,245,.6)':'#eaf3ff';
      g.fillText(r.name.toUpperCase(),p[0],p[1]);
    }
  }
  // dots (admin table)
  if(opt.dots) for(const d of opt.dots){
    const p=P(d.x,d.z);
    g.beginPath(); g.arc(p[0],p[1],5.5,0,TAU);
    g.fillStyle=d.color; g.fill();
    g.lineWidth=1.6; g.strokeStyle='rgba(255,255,255,.85)'; g.stroke();
  }
  // you
  if(opt.you){
    const p=P(opt.you.x,opt.you.z);
    const fx=-Math.sin(opt.you.yaw), fz=-Math.cos(opt.you.yaw);
    // view cone
    const len=5.4*t.s, spread=0.62;
    const ang=Math.atan2(fz,fx);
    const grd=g.createRadialGradient(p[0],p[1],0,p[0],p[1],len);
    grd.addColorStop(0,'rgba(120,230,255,.30)'); grd.addColorStop(1,'rgba(120,230,255,0)');
    g.fillStyle=grd;
    g.beginPath(); g.moveTo(p[0],p[1]);
    g.arc(p[0],p[1],len,ang-spread,ang+spread); g.closePath(); g.fill();
    g.beginPath(); g.arc(p[0],p[1],6.5,0,TAU);
    g.fillStyle=opt.youColor||'#ffffff'; g.fill();
    g.lineWidth=2; g.strokeStyle='#0a1020'; g.stroke();
    g.beginPath(); g.moveTo(p[0]+fx*11,p[1]+fz*11); g.lineTo(p[0]-fz*5,p[1]+fx*5); g.lineTo(p[0]+fz*5,p[1]-fx*5); g.closePath();
    g.fillStyle=opt.youColor||'#ffffff'; g.fill();
  }
  // sabotage markers
  if(opt.sabs) for(const s of opt.sabs){
    const p=P(s.x,s.z);
    const pulse=0.6+0.4*Math.sin(G.time*7);
    g.beginPath(); g.arc(p[0],p[1],13,0,TAU);
    g.fillStyle=`rgba(255,60,50,${0.22+0.3*pulse})`; g.fill();
    g.lineWidth=2.6; g.strokeStyle=`rgba(255,90,70,${0.7+0.3*pulse})`; g.stroke();
    g.fillStyle='#fff'; g.font='900 13px sans-serif'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText('!',p[0],p[1]+1);
  }
  g.restore();
}
function hexA(hex,a){
  const n=parseInt(hex.slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function activeSabMarkers(){
  const S=G.server?G.server.state:null;
  if(!S||!S.sab) return [];
  const out=[];
  const t=S.sab.type;
  if(t==='reactor'){ out.push({x:-45.5,z:0}); }
  else if(t==='o2'){ out.push({x:6,z:-10},{x:-13,z:-2}); }
  else if(t==='lights'){ out.push({x:-32.6,z:7}); }
  else if(t==='comms'){ out.push({x:8,z:7.5}); }
  else if(t==='doors'){ for(const d of G.M.doors) if(d.auto&&S.doors[d.id]) out.push({x:d.cx,z:d.cz}); }
  return out;
}
function adminDots(){
  const S=G.server?G.server.state:null;
  if(!S) return [];
  const out=[];
  for(const p of S.players){
    if(!p.alive||p.vent) continue;
    const r=G.M.roomAt(p.x,p.z);
    if(!r) continue;
    // admin only tells you WHICH room — jitter inside the room bounds
    const seed=(p.id.charCodeAt(1)*7+S.tick*0.0)%1;
    const jx=(hash01(p.id+S.tick*0.02)-0.5)*r.bb.w*0.55;
    const jz=(hash01(p.id+'z'+S.tick*0.02)-0.5)*r.bb.h*0.55;
    out.push({x:r.bb.cx+jx,z:r.bb.cz+jz,color:cssOf(p.color)});
  }
  return out;
}
function hash01(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return ((h>>>0)%10000)/10000;
}

/* ============================================================================
   In-world screens: Admin table, Vitals, Security cameras
   ========================================================================== */
const SCREENS={
  admin:null,vitals:null,camRT:null,camMat:null,camLabel:null,camTex:null,camCanvas:null,
  init(){
    // ADMIN
    const ast=SHIP.stations.find(s=>s.kind==='admintable');
    if(ast&&ast.group.userData.adminScreen){
      this.adminCanvas=cnv(512,300);
      this.adminTex=new THREE.CanvasTexture(this.adminCanvas);
      this.adminTex.colorSpace=THREE.SRGBColorSpace;
      ast.group.userData.adminScreen.material=new THREE.MeshBasicMaterial({map:this.adminTex,toneMapped:false,fog:false});
    }
    // VITALS
    const vs=SHIP.stations.find(s=>s.kind==='vitals');
    if(vs&&vs.group.userData.vitalsScreen){
      this.vitalsCanvas=cnv(512,300);
      this.vitalsTex=new THREE.CanvasTexture(this.vitalsCanvas);
      this.vitalsTex.colorSpace=THREE.SRGBColorSpace;
      vs.group.userData.vitalsScreen.material=new THREE.MeshBasicMaterial({map:this.vitalsTex,toneMapped:false,fog:false});
    }
    // CAMERAS: real 3D render target shown on the Security monitors
    const cs=SHIP.stations.find(s=>s.kind==='cams');
    if(cs&&cs.group.userData.monitors){
      this.camRT=new THREE.WebGLRenderTarget(420,260,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
      this.camRT.texture.colorSpace=THREE.NoColorSpace;
      this.camMat=new THREE.ShaderMaterial({
        uniforms:{tCam:{value:this.camRT.texture},time:{value:0},noise:{value:0.0},label:{value:0}},
        vertexShader:`varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader:`uniform sampler2D tCam;uniform float time,noise;varying vec2 vU;
          float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
          void main(){
            vec2 uv=vU;
            uv.x+=(h(vec2(floor(uv.y*90.0),floor(time*7.0)))-0.5)*0.012*noise;
            vec3 c=texture2D(tCam,uv).rgb;
            float l=dot(c,vec3(0.299,0.587,0.114));
            l*=0.85+0.15*sin(uv.y*360.0+time*6.0);
            vec3 tint=mix(vec3(l),vec3(l*0.86,l*1.0,l*0.9),0.6);
            tint+= (h(uv*vec2(320.0,200.0)+time)-0.5)*0.10*noise;
            float vig=smoothstep(1.05,0.25,distance(uv,vec2(0.5)));
            tint*=vig;
            gl_FragColor=vec4(tint,1.0);
          }`,
        toneMapped:false,fog:false,
      });
      cs.group.userData.monitors.forEach(m=>{ m.material=this.camMat; });
      this.camLabelCanvas=cnv(256,48);
      this.camLabelTex=new THREE.CanvasTexture(this.camLabelCanvas);
      this.camLabelTex.colorSpace=THREE.SRGBColorSpace;
      const lab=new THREE.Mesh(planeGeo(0.9,0.17,1),new THREE.MeshBasicMaterial({map:this.camLabelTex,transparent:true,toneMapped:false,fog:false}));
      lab.position.set(0,1.66,0.16); cs.group.add(lab);
      this.camLabelMesh=lab;
      this.camGroup=cs.group;
    }
    // also give the security room wall monitors the same feed
    const sec=SHIP.decor.find(d=>d.name==='decor_security');
    if(sec){ sec.traverse(o=>{ if(o.isMesh&&o.material&&o.material.map&&o.material.map===TEX.cache['screen_cams']) o.material=this.camMat||o.material; }); }
  },
  drawAdmin(){
    if(!this.adminCanvas) return;
    const g=this.adminCanvas.getContext('2d'),W=512,H=300;
    drawShipMap(g,W,H,{dots:adminDots(),doors:true,labels:true,pad:14});
    g.fillStyle='rgba(6,12,22,.85)'; g.fillRect(0,0,W,26);
    g.fillStyle='#7fd4ff'; g.font='700 15px monospace'; g.fillText('ADMIN — CREW LOCATION',10,18);
    const S=G.server&&G.server.state;
    if(S&&S.sab&&S.sab.type==='comms'){ g.fillStyle='rgba(10,14,22,.8)'; g.fillRect(0,0,W,H);
      g.fillStyle='#ff5a4a'; g.font='900 26px monospace'; g.textAlign='center'; g.fillText('NO SIGNAL',W/2,H/2); g.textAlign='left'; }
    this.adminTex.needsUpdate=true;
  },
  drawVitals(){
    if(!this.vitalsCanvas) return;
    const g=this.vitalsCanvas.getContext('2d'),W=512,H=300;
    g.fillStyle='#06121c'; g.fillRect(0,0,W,H);
    g.fillStyle='rgba(90,240,160,.14)'; g.fillRect(0,0,W,26);
    g.fillStyle='#7ce0a8'; g.font='700 15px monospace'; g.fillText('VITALS — MEDBAY',10,18);
    const S=G.server&&G.server.state;
    if(!S){ this.vitalsTex.needsUpdate=true; return; }
    const ps=S.players.slice(0,10);
    ps.forEach((p,i)=>{
      const x=12+(i%5)*98, y=36+Math.floor(i/5)*128;
      g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(x,y,90,118);
      g.fillStyle=cssOf(p.color); g.fillRect(x+4,y+4,82,86);
      g.strokeStyle='rgba(0,0,0,.4)'; g.lineWidth=2; g.strokeRect(x+4,y+4,82,86);
      // heartbeat
      g.strokeStyle=p.alive?'#0f2a1a':'#3a1414'; g.lineWidth=2;
      g.beginPath();
      for(let k=0;k<=82;k++){
        const v=p.alive?Math.sin((k+G.time*90+i*23)*0.24)*(k%21<3?16:5):0;
        g.lineTo(x+4+k,y+48+v);
      }
      g.stroke();
      g.fillStyle=p.alive?'#7ce0a8':'#ff6a5c';
      g.font='700 12px monospace';
      g.fillText(p.alive?'OK':'DEAD',x+6,y+108);
      g.fillStyle='rgba(255,255,255,.75)';
      g.font='700 10px monospace';
      g.fillText(p.name.slice(0,11).toUpperCase(),x+34,y+108);
    });
    if(S.sab&&S.sab.type==='comms'){ g.fillStyle='rgba(6,10,18,.86)'; g.fillRect(0,0,W,H);
      g.fillStyle='#ff5a4a'; g.font='900 26px monospace'; g.textAlign='center'; g.fillText('SIGNAL LOST',W/2,H/2); g.textAlign='left'; }
    this.vitalsTex.needsUpdate=true;
  },
  camCamera:null,camIdx:0,camActive:false,
  setCam(i){
    this.camIdx=((i%CAMS.length)+CAMS.length)%CAMS.length;
    if(this.camLabelCanvas){
      const g=this.camLabelCanvas.getContext('2d');
      g.clearRect(0,0,256,48);
      g.fillStyle='rgba(4,10,18,.9)'; g.fillRect(0,0,256,48);
      g.fillStyle='#9fe8c0'; g.font='900 22px monospace';
      g.fillText(`CAM ${this.camIdx+1} · ${CAMS[this.camIdx].name.toUpperCase()}`,8,30);
      g.fillStyle='#ff4030'; g.beginPath(); g.arc(238,16,6,0,7); g.fill();
      this.camLabelTex.needsUpdate=true;
    }
    AUDIO.blip(560+this.camIdx*70,.05,'square',.07);
  },
  renderCam(renderer,scene){
    if(!this.camRT||!this.camActive) return;
    if(!this.camCamera){ this.camCamera=new THREE.PerspectiveCamera(80,420/260,0.08,120); }
    const c=CAMS[this.camIdx];
    this.camCamera.position.set(c.x,2.42,c.z);
    this.camCamera.rotation.set(0,0,0);
    this.camCamera.rotateY(THREE.MathUtils.degToRad(c.yaw));
    this.camCamera.rotateX(-0.16);
    this.camCamera.fov=c.fov; this.camCamera.updateProjectionMatrix();
    const prev=renderer.getRenderTarget();
    renderer.setRenderTarget(this.camRT);
    renderer.clear();
    renderer.render(scene,this.camCamera);
    renderer.setRenderTarget(prev);
    if(this.camMat){
      this.camMat.uniforms.time.value=G.time;
      const sab=G.server&&G.server.state.sab;
      this.camMat.uniforms.noise.value=(sab&&sab.type==='comms')?3.2:(sab&&sab.type==='lights'?1.5:0.55);
    }
  },
  commsDown(){ const S=G.server&&G.server.state; return !!(S&&S.sab&&S.sab.type==='comms'); },
};

/* ---------- profile persistence ---------- */
const Profile={
  name:'Player',color:0,visor:0,
  load(){
    try{
      const raw=localStorage.getItem('au3d_profile');
      if(raw){ const o=JSON.parse(raw); this.name=o.name||this.name; this.color=o.color||0; this.visor=o.visor||0; }
      const c=localStorage.getItem('au3d_client');
      if(c) Object.assign(G.client,JSON.parse(c));
      const s=localStorage.getItem('au3d_settings');
      if(s) Object.assign(G.settings,JSON.parse(s));
    }catch(e){}
    if(!this.name||this.name==='Player') this.name=BOT_NAMES[(Math.random()*BOT_NAMES.length)|0];
  },
  save(){
    try{
      localStorage.setItem('au3d_profile',JSON.stringify({name:this.name,color:this.color,visor:this.visor}));
      localStorage.setItem('au3d_client',JSON.stringify(G.client));
      localStorage.setItem('au3d_settings',JSON.stringify(G.settings));
    }catch(e){}
  },
  randomize(){
    this.name=BOT_NAMES[(Math.random()*BOT_NAMES.length)|0]+(Math.random()<0.4?String((Math.random()*90+10)|0):'');
    this.color=(Math.random()*COLORS.length)|0;
    this.visor=(Math.random()*VISORS.length)|0;
    this.save();
  },
};
