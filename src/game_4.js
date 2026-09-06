/* ============================================================= GAME CORE */
const Game = window.Game = {
  state:'lobby',           // lobby | role | playing | meeting | eject | gameover
  settings:{ playerCount:7, impostors:1, taskCount:5, emergency:3, confirmEjects:true, vision:3.2, myColor:0 },
  progress:{ totalTasks:0, doneTasks:0 },
  players:[],              // all players (0 = local)
  local:null,
  map:null,
  time:0,
  roleTimer:null,
  sabotage:{ active:null, timerStart:0, timerLen:0, fixType:null },
  meeting:{ active:false, timer:0, votes:{}, counts:{}, ejected:null, skipVotes:0, reportBody:null, round:0 },
  killCooldown:0,
  ventCooldown:0,
  taskModalOpen:false,
  lastRoomName:'',
  cache:{ dist:{} },
};

/* ------------------------------------------------ task catalog & assignment */
const TASK_CATALOG = [
  {type:'swipeCard',       name:'Swipe Card', steps:[{task:'swipeCard', room:'Admin'}]},
  {type:'fixWiring',       name:'Fix Wiring', steps:[{task:'fixWiring', room:null}]},
  {type:'uploadData',      name:'Upload Data', steps:[{task:'downloadData', room:null}, {task:'uploadData', room:'Admin'}]},
  {type:'calibrate',       name:'Calibrate Distributor', steps:[{task:'calibrate', room:'Electrical'}]},
  {type:'clearAsteroids',  name:'Clear Asteroids', steps:[{task:'clearAsteroids', room:'Weapons'}]},
  {type:'primeShields',    name:'Prime Shields', steps:[{task:'primeShields', room:'Shields'}]},
  {type:'submitScan',      name:'Submit Scan', steps:[{task:'submitScan', room:'MedBay'}]},
  {type:'emptyGarbage',    name:'Empty Garbage', steps:[{task:'emptyGarbage', room:'Cafeteria'}, {task:'emptyGarbage', room:'Storage'}]},
  {type:'emptyChute',      name:'Empty Chute', steps:[{task:'emptyChute', room:'O2'}, {task:'emptyChute', room:'Storage'}]},
  {type:'fuelEngines',     name:'Fuel Engines', steps:[{task:'fuelEngines', room:'Storage'}, {task:'alignEngine', room:'Upper Engine'}, {task:'alignEngine', room:'Lower Engine'}]},
  {type:'startReactor',    name:'Start Reactor', steps:[{task:'startReactor', room:'Reactor'}]},
  {type:'unlockManifolds', name:'Unlock Manifolds', steps:[{task:'unlockManifolds', room:'Reactor'}]},
  {type:'chartCourse',     name:'Chart Course', steps:[{task:'chartCourse', room:'Navigation'}]},
  {type:'cleanO2Filter',   name:'Clean O2 Filter', steps:[{task:'cleanO2Filter', room:'O2'}]},
  {type:'stabilize',       name:'Stabilize Steering', steps:[{task:'stabilize', room:'Navigation'}]},
  {type:'cleanVent',       name:'Clean Vent', steps:[{task:'cleanVent', room:null}]},
  {type:'divertPower',     name:'Divert Power', steps:[{task:'divertPower', room:'Electrical'}]},
  {type:'alignEngine',     name:'Align Engine Output', steps:[{task:'alignEngine', room:null}]},
];
function consoleFor(task, room){
  return WORLD.consoles.find(c=> c.task===task && (!room || c.room===room));
}
function buildTaskTemplate(tpl){
  const steps = tpl.steps.map(st=>{
    let room=st.room;
    if(room===null){
      room = pick(WORLD.consoles.filter(c=>c.task===st.task).map(c=>c.room)) || 'Cafeteria';
    }
    const console = consoleFor(st.task, room);
    return {task:st.task, room, console, done:false};
  });
  return {type:tpl.type, name:tpl.name, steps, done:false};
}

// assign tasks to a crewmate (returns array of task objects)
function assignTasks(count){
  const tpls = shuffle(TASK_CATALOG.slice());
  const chosen=tpls.slice(0, count);
  return chosen.map(buildTaskTemplate);
}
function tasksForPlayer(){
  return assignTasks(Game.settings.taskCount);
}
// fake task list for impostors
function fakeTasks(){
  const tpls = shuffle(TASK_CATALOG.slice()).slice(0,Game.settings.taskCount);
  return tpls.map(buildTaskTemplate);
}

/* ------------------------------------------------ players */
const NAMES = ['You','Red','Blue','Green','Pink','Orange','Yellow','Black','White','Purple','Brown','Cyan','Lime','Stella','Bit','Pixel','Nova','Echo','Pixel','Nyx'];
let nameIdx=0;
function makePlayer(colorIndex, isImpostor, isLocal, name){
  const col = colorByIndex(colorIndex).hex;
  const mesh = buildCrewmate(col);
  const p = {
    id: Game.players.length+1,
    name: name || NAMES[Math.min(nameIdx++, NAMES.length-1)],
    colorIndex, color:col, css: colorByIndex(colorIndex).css,
    isImpostor, isGhost:false, isDead:false, isLocal,
    mesh, x:0,z:0, yaw:0, speed:3.4,
    vyaw:0, vx:0, vz:0, walkPhase:0, moving:false,
    tasks: isImpostor? fakeTasks() : tasksForPlayer(),
    killCooldown: isImpostor? 12 : 0,
    ventCooldown: 0,
    deadBy:null,
    // ai state
    ai: isLocal? null : {mode:'idle', target:null, path:null, pathIdx:0, waitT:0, taskT:0, thinkT:0},
    reportSeen: 0,
  };
  if(p.isLocal){
    p.name = name || 'You';
    Game.local = p;
  }
  mesh.userData.updateName(p.name, col);
  mesh.userData.__pl = p;
  scene.add(mesh);
  return p;
}

function spawnPlayers(){
  Game.players.forEach(p=>{
    const s = tileCenter(MAP.spawn.x + randi(-1,1), MAP.spawn.z + randi(-2,2));
    p.x=s.x; p.z=s.z; p.yaw=rand(0,Math.PI*2);
    p.mesh.position.set(p.x,0,p.z); p.mesh.rotation.y=p.yaw;
  });
}

// recompute total tasks & done, update task bar (crew tasks only)
function recountTasks(){
  let total=0, done=0;
  Game.players.forEach(p=>{
    if(p.isImpostor) return;
    p.tasks.forEach(t=>{ total++; if(t.done) done++; });
  });
  Game.progress.totalTasks=total; Game.progress.doneTasks=done;
  const frac = total? done/total : 0;
  const fill=$('#taskBarFill'); if(fill) fill.style.width=(frac*100)+'%';
  const lbl=$('#taskPct'); if(lbl) lbl.textContent=done+'/'+total;
  return frac;
}
function markTaskStep(p, task){
  // find first undone step
  const step = task.steps.find(s=>!s.done);
  if(!step){ task.done=true; }
  recountTasks();
  if(parseFloat((Game.progress.doneTasks))>=Game.progress.totalTasks && Game.progress.totalTasks>0){
    return endGame('crew','tasks');
  }
  if(task.done){ Sfx.taskDone(); }
  else Sfx.task();
}

/* ------------------------------------------------ task minigame UI */
const TASK_MODAL = {
  open(task, step){
    if(Game.taskModalOpen) return;
    Game.taskModalOpen=true;
    const m=el('div','overlay taskmodal');
    m.id='taskModal';
    m.innerHTML = `<div class="card" style="max-width:460px">
        <div class="smallcap" style="text-align:center;color:#8fd7ec">${task.name}</div>
        <div id="taskBody" style="margin-top:12px"></div>
        <div class="center" style="margin-top:14px"><button class="btn ghost small" id="taskCancel">Cancel (walk away)</button></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click',(e)=>{ if(e.target.id==='taskCancel'){ TASK_MODAL.close(); } });
    const body=m.querySelector('#taskBody');
    this._body=body; this._task=task; this._step=step; this._modal=m;
    const fn = TASKS[task.type];
    const ctl = fn ? fn(body, task, step) : TASKS._hold(body, task, step);
    this._ctl = ctl;
    Sfx.ui();
  },
  close(suppress){
    if(Game.taskModalOpen){ const m=$('#taskModal'); if(m) m.remove(); Game.taskModalOpen=false; if(this._ctl && this._ctl.dispose) this._ctl.dispose(); this._body=null; this._task=null; this._step=null; this._ctl=null; if(!suppress) Sfx.tick(); }
  },
  complete(){
    const task=this._task, step=this._step;
    if(task && step){ step.done=true; markTaskStep(Game.local, task); }
    TASK_MODAL.close(true);
    toast('Task completed','good');
  }
};

// --- mini-task implementations; each returns optional {dispose} ---
const TASKS = {
  swipeCard(body){
    body.innerHTML = `<div class="smallcap" style="text-align:center">Swipe your card through the reader</div>
      <div style="position:relative;height:150px;background:#0a1620;border-radius:10px;border:2px solid #2b5a6e;overflow:hidden;margin-top:8px">
        <div id="card" style="position:absolute;top:64px;left:50px;width:44px;height:70px;background:linear-gradient(180deg,#4fd6ff,#1996e0);border-radius:5px;border:2px solid #0e3a4d;box-shadow:0 3px 8px rgba(0,0,0,.6)"></div>
        <div style="position:absolute;left:50%;top:0;bottom:0;width:6px;background:#23506a;margin-left:-3px"></div>
      </div>
      <div class="muted center" style="margin-top:8px">Drag the card into the slot, pause briefly, then push through.</div>`;
    const card=body.querySelector('#card');
    let dragging=false; let done=false;
    const readerX=body.offsetWidth/2;
    const move=(x)=>{ card.style.left=clamp(x-22, 20, body.offsetWidth-64)+'px'; };
    const start=()=>{ dragging=true; };
    const onMove=(e)=>{ if(dragging && !done){ const x=(e.touches?e.touches[0].clientX:e.clientX); move(x - body.getBoundingClientRect().left); } };
    const end=()=>{ dragging=false; };
    card.addEventListener('mousedown',start); window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',end);
    card.addEventListener('touchstart',e=>{e.preventDefault();dragging=true;},{passive:false});
    window.addEventListener('touchmove',e=>{onMove(e);},{passive:false});
    window.addEventListener('touchend',end);
    const check=()=>{ if(!done){ const l=parseFloat(card.style.left)||50; const cx=body.offsetWidth/2-22; if(Math.abs(l-cx)<26){ done=true; card.style.background='linear-gradient(180deg,#8affc0,#2fd26a)'; TASK_MODAL.complete(); } } };
    const ival=setInterval(check,120);
    return {dispose(){ clearInterval(ival); window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',end); window.removeEventListener('touchmove',onMove); window.removeEventListener('touchend',end); }};
  },

  fixWiring(body){
    const cols=['#e5484d','#f5b93b','#4fd6ff','#7dff6b','#c86bff'];
    const pickC=()=>cols[randi(0,cols.length-1)];
    const a=pickC(), b=pickC(), c=pickC();
    body.innerHTML=`<div class="smallcap" style="text-align:center">Connect the matching wires</div>`;
    const wrap=el('div'); wrap.style.cssText='display:flex;gap:12px;margin-top:12px;justify-content:center';
    const mk=(color,side)=>{
      const d=el('div'); d.style.cssText=`width:34px;height:110px;border-radius:8px;background:${color};position:relative`;
      return d;
    };
    // left terminals (random order), right terminals (random order)
    const lc=[a,b,c], rc=shuffle([a,b,c].slice());
    const col=el('div'); col.style.cssText='display:flex;flex-direction:column;gap:16px';
    const rcol=el('div'); rcol.style.cssText='display:flex;flex-direction:column;gap:16px';
    const wires=[];
    lc.forEach((c,i)=>{ const d=mk(c); col.appendChild(d); wires.push({el:d,color:c,matched:false,side:'l'}); });
    rc.forEach((c,i)=>{ const d=mk(c); rcol.appendChild(d); wires.push({el:d,color:c,matched:false,side:'r'}); });
    const mid=el('div'); mid.style.cssText='flex:1;height:6px;background:#23506a;align-self:center;border-radius:3px';
    wrap.appendChild(col); wrap.appendChild(mid); wrap.appendChild(rcol);
    body.appendChild(wrap);
    let selL=null;
    const click=(w)=>{
      if(w.matched) return;
      if(w.side==='l'){ selL=w; w.el.style.outline='3px solid #fff'; }
      else { if(!selL){ return; } if(selL.color===w.color){ selL.matched=true; w.matched=true; selL.el.style.outline=''; el.style?0:0; selL.el.style.filter='brightness(1.2)'; w.el.style.filter='brightness(1.2)'; selL.el.style.opacity=.5; w.el.style.opacity=.5; selL=null; } else { selL.el.style.outline=''; selL=null; } }
      if(wires.filter(x=>x.matched).length===6) TASK_MODAL.complete();
    };
    wires.forEach(w=>w.el.addEventListener('click',()=>click(w)));
    return {};
  },

  uploadData(body, task, step){
    body.innerHTML=`<div class="smallcap" style="text-align:center">${ task.name }</div>
      <div style="margin-top:14px;text-align:center">
        <div id="upBarBg" style="width:80%;height:26px;background:#0a1620;border:2px solid #2b5a6e;border-radius:8px;margin:0 auto;overflow:hidden">
          <div id="upBar" style="height:100%;width:0;background:linear-gradient(90deg,#7fe0c0,#2fd26a)"></div>
        </div>
        <div id="upTxt" class="muted" style="margin-top:8px">Hold to download…</div>
      </div>`;
    const bar=body.querySelector('#upBar'), txt=body.querySelector('#upTxt');
    let prog=0, done=false, raf=null;
    const stepfn=()=>{ if(done) return; prog+=0.018; bar.style.width=(prog*100)+'%'; if(prog>=1){ done=true; txt.textContent='Complete!'; TASK_MODAL.complete(); } else raf=requestAnimationFrame(stepfn); };
    const start=()=>{ if(!done && !raf) raf=requestAnimationFrame(stepfn); };
    const stop=()=>{ if(raf){ cancelAnimationFrame(raf); raf=null; prog=Math.max(0,prog-0.02); } };
    body.addEventListener('mousedown',start); window.addEventListener('mouseup',stop);
    return {dispose(){ body.removeEventListener('mousedown',start); window.removeEventListener('mouseup',stop); if(raf)cancelAnimationFrame(raf); }};
  },

  calibrate(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Align the distributor</div>
      <div id="calWrap" style="position:relative;width:130px;height:130px;margin:14px auto"></div>
      <div class="muted center">Click each dial when it lines up</div>`;
    const wrap=body.querySelector('#calWrap');
    const n=3, spokes=[], done=[false,false,false];
    for(let i=0;i<n;i++){
      const s=el('div'); s.style.cssText=`position:absolute;left:50%;top:50%;width:8px;height:110px;background:#4fd6ff;transform-origin:bottom center;border-radius:4px`;
      s.dataset.finished='0';
      wrap.appendChild(s);
      spokes.push({el:s,angle:rand(0,360),speed:rand(60,120)*(Math.random()<.5?-1:1)});
    }
    const spin=()=>{ spokes.forEach((sp,i)=>{ if(done[i]){ return; } sp.angle+=sp.speed*0.016; sp.el.style.transform=`translate(-50%,-100%) rotate(${sp.angle}deg)`; }); requestAnimationFrame(spin); };
    spin();
    spokes.forEach((sp,i)=>{ sp.el.addEventListener('click',()=>{ const norm=((sp.angle%360)+360)%360; const ok=norm<18||norm>342; if(ok){ done[i]=true; sp.el.style.background='#7dff6b'; sp.el.style.filter='brightness(1.2)'; if(done.every(Boolean)) TASK_MODAL.complete(); } else { sp.el.style.background='#e5484d'; setTimeout(()=>sp.el.style.background='#4fd6ff',150); } }); });
    return {};
  },

  primeShields(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Tap every shield plate</div><div id="shGrid" style="display:grid;grid-template-columns:repeat(3,52px);gap:10px;justify-content:center;margin-top:12px"></div>`;
    const grid=body.querySelector('#shGrid');
    let n=6, done=0;
    for(let i=0;i<n;i++){
      const p=el('div'); p.style.cssText='width:52px;height:52px;border-radius:8px;background:#e5484d;border:2px solid #7a2026;cursor:pointer;box-shadow:0 3px 0 #7a2026';
      p.addEventListener('click',()=>{ if(p.dataset.on) return; p.dataset.on=1; p.style.background='#7dff6b'; p.style.borderColor='#2d7a3a'; p.style.boxShadow='0 3px 0 #2d7a3a'; done++; if(done===n) TASK_MODAL.complete(); });
      grid.appendChild(p);
    }
    return {};
  },

  clearAsteroids(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Shoot 20 asteroids</div>
      <div id="astSpace" style="position:relative;height:190px;background:radial-gradient(circle at 50% 40%,#1a2a40,#070c16);border-radius:10px;border:2px solid #2b5a6e;overflow:hidden;margin-top:8px"></div>
      <div id="astCount" class="muted center" style="margin-top:6px">0 / 20</div>`;
    const space=body.querySelector('#astSpace'); let cnt=0, raf=null;
    const spawn=()=>{ const a=el('div'); a.style.cssText='position:absolute;background:radial-gradient(circle,#c69b6a,#7c5a34);border-radius:50%'; a.style.width=a.style.height=(12+Math.random()*16)+'px'; a.style.left='-20px'; a.style.top=(Math.random()*170)+'px'; a.style.boxShadow='0 0 8px rgba(0,0,0,.6)'; a.dataset.x=-20; a.dataset.y=a.style.top; const sp=rand(1.5,3.5); a.dataset.sp=sp; a.addEventListener('click',()=>{ a.remove(); cnt++; body.querySelector('#astCount').textContent=cnt+' / 20'; if(cnt>=20) TASK_MODAL.complete(); }); space.appendChild(a); };
    const loop=()=>{ [...space.children].forEach(a=>{ a.dataset.x=parseFloat(a.dataset.x)+a.dataset.sp; a.style.left=a.dataset.x+'px'; if(a.dataset.x>space.clientWidth+20) a.remove(); }); if(space.children.length<6 && Math.random()<0.5) spawn(); raf=requestAnimationFrame(loop); };
    loop();
    return {dispose(){ if(raf) cancelAnimationFrame(raf); }};
  },

  submitScan(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Step into the scanner</div>
      <div style="margin:14px auto;width:120px;height:180px;border:2px solid #4fd6ff;border-radius:12px;position:relative;overflow:hidden">
        <div id="scanRow" style="position:absolute;left:0;right:0;top:0;height:10px;background:#4fd6ff;box-shadow:0 0 16px #4fd6ff;transition:top 2.5s linear"></div>
        <div id="bean" style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);width:48px;height:64px;background:#132ED1;border-radius:30px"></div>
      </div>
      <div class="muted center">Scanning…</div>`;
    const row=body.querySelector('#scanRow');
    requestAnimationFrame(()=>{ row.style.top='calc(100% - 10px)'; });
    setTimeout(()=>TASK_MODAL.complete(),2600);
    return {};
  },

  startReactor(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Press the lights in order</div>
      <div id="seq" style="display:flex;gap:10px;justify-content:center;margin-top:12px"></div>
      <div class="muted center" id="seqStat" style="margin-top:8px">Watch the pattern…</div>`;
    const seq=body.querySelector('#seq');
    const target=[0,1,2,3,4]; shuffle(target);
    const btns=[]; let idx=0;
    const flash=()=>{ let i=0; const iv=setInterval(()=>{ btns[i].style.filter='brightness(2)'; setTimeout(()=>btns[i].style.filter='',160); i++; if(i>=target.length) clearInterval(iv); },280); };
    for(let i=0;i<5;i++){ const b=el('div'); b.style.cssText='width:40px;height:40px;border-radius:8px;background:#ff8f6a;border:2px solid #a5442a;cursor:pointer'; b.addEventListener('click',()=>{ if(target[idx]===i){ b.style.background='#7dff6b'; idx++; if(idx>=target.length){ body.querySelector('#seqStat').textContent='Complete!'; TASK_MODAL.complete(); } } else { idx=0; btns.forEach(x=>x.style.background='#ff8f6a'); body.querySelector('#seqStat').textContent='Missed — start over'; } }); seq.appendChild(b); btns.push(b); }
    setTimeout(flash,500);
    return {};
  },

  unlockManifolds(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Enter code 1-10 in order</div>
      <div id="lock" style="display:grid;grid-template-columns:repeat(5,44px);gap:8px;justify-content:center;margin-top:12px"></div>
      <div class="muted center">Press 1,2,3…10</div>`;
    const lock=body.querySelector('#lock');
    let need=1;
    const nums=[1,2,3,4,5,6,7,8,9,10];
    for(let i=0;i<10;i++){ const b=el('div'); b.textContent=nums[i]; b.style.cssText='height:44px;display:flex;align-items:center;justify-content:center;background:#0a1620;border:2px solid #2b5a6e;border-radius:8px;cursor:pointer;font-weight:800;color:#b08fff'; b.addEventListener('click',()=>{ if(nums[i]===need){ b.style.background='#7dff6b'; b.style.borderColor='#2d7a3a'; need++; if(need>10){ body.querySelector('.muted').textContent='Complete!'; TASK_MODAL.complete(); } } else { need=1; lock.querySelectorAll('div').forEach(x=>{x.style.background='#0a1620';x.style.borderColor='#2b5a6e';}); } }); lock.appendChild(b); }
    return {};
  },

  chartCourse(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Drag the ship along the dotted course</div>
      <div id="navSpace" style="position:relative;height:180px;background:#0a1620;border-radius:10px;border:2px solid #2b5a6e;overflow:hidden;margin-top:8px"></div>`;
    const space=body.querySelector('#navSpace');
    // dotted path
    const pts=[[20,150],[70,120],[120,60],[180,90]]; 
    pts.forEach((p,i)=>{ const d=el('div'); d.style.cssText='position:absolute;width:6px;height:6px;border-radius:50%;background:#4fd6ff;left:'+p[0]+'px;top:'+p[1]+'px'; space.appendChild(d); });
    const ship=el('div'); ship.style.cssText='position:absolute;width:34px;height:34px;background:#4fd6ff;border-radius:50%;left:10px;top:140px;box-shadow:0 0 16px #4fd6ff'; space.appendChild(ship);
    let seg=0, prog=0, started=false;
    const goal=[180,90];
    const aim=()=>{ const sx=parseFloat(ship.style.left)||10, sy=parseFloat(ship.style.top)||140; const dx=goal[0]-sx, dy=goal[1]-sy; const d=Math.hypot(dx,dy); if(d<10){ TASK_MODAL.complete(); return; } const sp=2.4; ship.style.left=(sx+dx/d*sp)+'px'; ship.style.top=(sy+dy/d*sp)+'px'; };
    ship.addEventListener('pointerdown',()=>{ started=true; });
    const iv=setInterval(()=>{ if(started) aim(); },16);
    return {dispose(){ clearInterval(iv); }};
  },

  cleanO2Filter(body){
    body.innerHTML=`<div class="smallcap" style="text-align:center">Drag the leaves out</div>
      <div id="o2" style="position:relative;height:150px;background:#0a1620;border-radius:10px;border:2px solid #2b5a6e;overflow:hidden;margin-top:8px">
        <div id="grate" style="position:absolute;inset:15px 30px;border:2px solid #23506a;border-radius:8px"></div>
      </div>`;
    const grate=body.querySelector('#grate');
    let leaves=0;
    for(let i=0;i<4;i++){ const l=el('div'); l.style.cssText='position:absolute;width:22px;height:16px;background:#7dff6b;border-radius:4px;left:'+randi(20,150)+'px;top:'+randi(20,100)+'px;cursor:grab'; const ox=parseInt(l.style.left), oy=parseInt(l.style.top);
      l.addEventListener('pointerdown',e=>{ const move=e2=>{ l.style.left=(e2.clientX-body.getBoundingClientRect().left-10)+'px'; l.style.top=(e2.clientY-body.getBoundingClientRect().top-8)+'px'; }; const up=()=>{ window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); if(parseInt(l.style.left)<10||parseInt(l.style.top)<10){ l.remove(); leaves++; if(leaves===4) TASK_MODAL.complete(); } }; window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); });
      grate.appendChild(l); }
    return {};
  },

  // generic hold / press style tasks (fuel, garbage, chute, stabilize, vent, divert, align)
  _hold(body, task, step){
    body.innerHTML=`<div class="smallcap" style="text-align:center">${task.name}</div>
      <div style="margin:16px auto;width:100%;text-align:center">
        <div id="holdBarBg" style="width:80%;height:24px;background:#0a1620;border:2px solid #2b5a6e;border-radius:8px;margin:0 auto;overflow:hidden">
          <div id="holdBar" style="height:100%;width:0;background:linear-gradient(90deg,#ffd36a,#ff8f6a)"></div>
        </div>
        <div class="muted" style="margin-top:8px">Hold to complete</div>
      </div>`;
    const bar=body.querySelector('#holdBar'); let prog=0, raf=null, done=false;
    const stepfn=()=>{ prog+=0.04; bar.style.width=(prog*100)+'%'; if(prog>=1){ done=true; TASK_MODAL.complete(); } else raf=requestAnimationFrame(stepfn); };
    const start=()=>{ if(!done&&!raf) raf=requestAnimationFrame(stepfn); };
    const stop=()=>{ if(raf){ cancelAnimationFrame(raf); raf=null; prog=Math.max(0,prog-0.04); bar.style.width=(prog*100)+'%'; } };
    body.addEventListener('mousedown',start); window.addEventListener('mouseup',stop);
    return {dispose(){ body.removeEventListener('mousedown',start); window.removeEventListener('mouseup',stop); if(raf)cancelAnimationFrame(raf); }};
  },

  // emptyChute/emptyGarbage/stabilize/cleanVent/divertPower/alignEngine route through _hold
};
TASKS.emptyGarbage=TASKS._hold; TASKS.emptyChute=TASKS._hold; TASKS.fuelEngines=TASKS._hold;
TASKS.stabilize=TASKS._hold; TASKS.cleanVent=TASKS._hold; TASKS.divertPower=TASKS._hold; TASKS.alignEngine=TASKS._hold;

// count total tasks for the crew (all non-impostor living/ghost players)
function crewTaskTotal(){ let n=0; Game.players.forEach(p=>{ if(!p.isImpostor) n+=p.tasks.length; }); return n; }
function crewTaskDone(){ let n=0; Game.players.forEach(p=>{ if(!p.isImpostor) n+=p.tasks.filter(t=>t.done).length; }); return n; }
