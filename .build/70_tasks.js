/* ============================================================================
   6. Task & system panels — every Skeld task as an interactive minigame
   ========================================================================== */
const WIRE_COLORS=['#e0342c','#3d7bff','#f2c94c','#ec5fa8'];
const TASKUI={
  cur:null,kind:null,ctx:null,openAt:0,
  isOpen(){ return !!this.cur; },
  open(kind,ctx){
    const modal=document.getElementById('modal');
    this.close(true);
    this.kind=kind; this.ctx=ctx||{};
    const builder=PANELS[kind];
    document.getElementById('taskTitle').textContent=(ctx&&ctx.title)|| (builder&&builder.title) || 'Task';
    document.getElementById('taskStage').textContent=(ctx&&ctx.stageText)||'';
    document.getElementById('taskFoot').textContent=(ctx&&ctx.foot)||'';
    document.getElementById('taskLoc').textContent=(ctx&&ctx.loc)||'';
    const body=document.getElementById('taskBody');
    body.innerHTML='';
    modal.classList.add('on');
    G.modalOpen=kind;
    exitLock();
    AUDIO.use();
    let inst=null;
    try{ inst=builder?builder(body,Object.assign({},ctx,{kind})):null; }
    catch(e){
      console.error('panel error',kind,e);
      if(typeof errLog==='function') errLog('panel:'+kind,e);
      this.panelError(body,'This console hit a firmware error.',(e&&e.message)||String(e));
      inst=null;
    }
    if(inst&&body.childElementCount===0){
      if(typeof errLog==='function') errLog('panel-empty:'+kind,new Error('builder returned but produced no elements'));
      this.panelError(body,'This console produced no interface.','empty panel');
    }
    this.cur=inst||{};
    this.openAt=G.time;
    if(ctx&&ctx.onOpen) ctx.onOpen();
  },
  /* The task window is a light "clipboard", so the old pale failure note was invisible on
     it and players just saw a white blank. Fail loud, in ink, with a way out. */
  panelError(body,head,detail){
    body.innerHTML='';
    const card=document.createElement('div');
    card.style.cssText='max-width:520px;text-align:center;color:#7d1a12;font-weight:800;font-size:14.5px;'+
      'line-height:1.55;background:#f8dcd7;border:2px solid #c51111;border-radius:12px;padding:18px 22px';
    const safe=String(detail||'').replace(/[<>&]/g,'').slice(0,180);
    card.innerHTML='<div>'+head+'</div>'+
      '<div style="font-weight:600;font-size:12px;opacity:.85;margin-top:6px">'+safe+'</div>'+
      '<div style="font-size:11px;opacity:.7;margin-top:6px">If this repeats, press F9 and copy the report.</div>';
    const btn=document.createElement('button');
    btn.textContent='CLOSE';
    btn.style.cssText='margin-top:12px;background:#c51111;color:#fff;font-weight:900;border-radius:8px;'+
      'padding:8px 20px;letter-spacing:.12em;cursor:pointer';
    btn.onclick=()=>this.close();
    card.appendChild(btn);
    body.appendChild(card);
  },
  close(silent){
    if(!this.cur) { document.getElementById('modal').classList.remove('on'); G.modalOpen=null; return; }
    if(this.cur.destroy) { try{this.cur.destroy();}catch(e){} }
    if(this.ctx&&this.ctx.onClose) { try{this.ctx.onClose();}catch(e){} }
    this.cur=null; this.kind=null; this.ctx=null;
    document.getElementById('modal').classList.remove('on');
    document.getElementById('taskBody').innerHTML='';
    G.modalOpen=null;
    if(!silent) AUDIO.click();
  },
  update(dt){
    if(this.cur&&this.cur.update) this.cur.update(dt);
    if(this.cur&&this.cur.hold!==undefined){
      const want=holdInput();
      const prev=this.cur.holdAmt||0;
      this.cur.holdAmt=clamp(prev+(want?dt:this.cur.noDrain?0:-dt*1.7),0,1);
      if(this.cur.holdAmt>=1&&!this.cur.done){ this.cur.done=true; this.cur.onDone&&this.cur.onDone(); }
      if(this.cur.render) this.cur.render(this.cur.holdAmt);
    }
  },
};
function holdInput(){
  return !!(INPUT.keys.down.use||INPUT.mouse.lmb||(G.isTouch&&TASKUI.touchHold));
}
document.addEventListener('DOMContentLoaded',()=>{});

/* ---------- DOM helpers ---------- */
function mk(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }
function svgEl(tag,attrs){
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const k in attrs) e.setAttribute(k,attrs[k]);
  return e;
}
function holdPanel(opts){
  // generic "hold to complete" panel with a circular gauge
  const dur=opts.dur||2.2, col=opts.color||'#5ef08b';
  const host=mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;padding:6px">
      <svg width="190" height="190" viewBox="0 0 190 190" style="overflow:visible">
        <circle cx="95" cy="95" r="78" fill="#0d1729" stroke="#33456b" stroke-width="8"/>
        <circle class="g" cx="95" cy="95" r="78" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="490" stroke-dashoffset="490" transform="rotate(-90 95 95)" style="filter:drop-shadow(0 0 10px ${col})"/>
        <text class="pct" x="95" y="103" text-anchor="middle" fill="#e8f4ff" font-size="30" font-weight="900" font-family="monospace">0%</text>
      </svg>
      <div style="font-size:13px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#22314f">${opts.label||'Hold to complete'}</div>
      <div style="font-size:11px;letter-spacing:.1em;color:#5b6b88">HOLD <b style="color:#22314f">${G.isTouch?'THE PANEL':'E / LEFT MOUSE'}</b></div>
    </div>`);
  const g=host.querySelector('.g'), pct=host.querySelector('.pct');
  const inst={
    hold:0,holdAmt:0,noDrain:!!opts.noDrain,done:false,
    onDone(){ AUDIO.taskDone(); opts.onDone&&opts.onDone(); TASKUI.close(); },
    render(a){ g.setAttribute('stroke-dashoffset',String(490*(1-a))); pct.textContent=Math.round(a*100)+'%'; },
    destroy(){ host.remove(); },
  };
  // touch hold on the panel itself
  host.style.touchAction='none';
  host.addEventListener('pointerdown',()=>{ TASKUI.touchHold=true; });
  addEventListener('pointerup',()=>{ TASKUI.touchHold=false; });
  addEventListener('pointercancel',()=>{ TASKUI.touchHold=false; });
  return inst;
}

/* ---------- the panels ---------- */
const PANELS={};

/* --- Fix Wiring --- */
PANELS.wiring=function(host,ctx){
  const n=4;
  const right=[0,1,2,3].sort(()=>Math.random()-0.5);
  host.appendChild(mk(`<div class="wires" style="height:260px">
      <svg id="wireSvg"></svg>
      <div class="wcol l">${[0,1,2,3].map(i=>`<div class="wnode" data-side="l" data-c="${i}" style="background:${WIRE_COLORS[i]}"><span class="pin"></span></div>`).join('')}</div>
      <div class="wcol r">${right.map(i=>`<div class="wnode" data-side="r" data-c="${i}" style="background:${WIRE_COLORS[i]}"><span class="pin"></span></div>`).join('')}</div>
    </div>`));
  const wrap=host.firstChild, svg=wrap.querySelector('#wireSvg');
  const done=new Set();
  let drag=null,dragPath=null;
  function pinPos(node){
    const p=node.querySelector('.pin').getBoundingClientRect(), w=wrap.getBoundingClientRect();
    return {x:p.left-w.left+p.width/2,y:p.top-w.top+p.height/2};
  }
  function draw(a,b,color,temp){
    const p=svgEl('path',{d:`M${a.x},${a.y} C${a.x+(b.x-a.x)*0.55},${a.y} ${b.x-(b.x-a.x)*0.55},${b.y} ${b.x},${b.y}`,stroke:color,opacity:temp?0.7:1});
    svg.appendChild(p); return p;
  }
  wrap.addEventListener('pointerdown',e=>{
    const node=e.target.closest('.wnode'); if(!node||node.dataset.side!=='l'||node.classList.contains('done')) return;
    wrap.setPointerCapture(e.pointerId);
    drag={node,c:+node.dataset.c,from:pinPos(node)};
    dragPath=draw(drag.from,drag.from,WIRE_COLORS[drag.c],true);
    AUDIO.blip(420,.04,'square',.06);
  });
  wrap.addEventListener('pointermove',e=>{
    if(!drag) return;
    const w=wrap.getBoundingClientRect();
    dragPath.setAttribute('d',`M${drag.from.x},${drag.from.y} C${drag.from.x+(e.clientX-w.left-drag.from.x)*0.55},${drag.from.y} ${drag.from.x+(e.clientX-w.left-drag.from.x)*0.45},${e.clientY-w.top} ${e.clientX-w.left},${e.clientY-w.top}`);
    const over=document.elementFromPoint(e.clientX,e.clientY);
    wrap.querySelectorAll('.wnode.r').forEach(x=>x.style.outline='');
    if(over&&over.closest&&over.closest('.wnode.r')) over.closest('.wnode.r').style.outline='3px solid #fff';
  });
  function end(e){
    if(!drag) return;
    wrap.querySelectorAll('.wnode.r').forEach(x=>x.style.outline='');
    const el=document.elementFromPoint(e.clientX,e.clientY);
    const node=el&&el.closest?el.closest('.wnode.r'):null;
    dragPath.remove(); dragPath=null;
    if(node&&+node.dataset.c===drag.c&&!node.classList.contains('done')){
      const a=pinPos(drag.node),b=pinPos(node);
      draw(a,b,WIRE_COLORS[drag.c]);
      drag.node.classList.add('done'); node.classList.add('done');
      done.add(drag.c);
      AUDIO.blip(720,.07,'triangle',.1);
      if(done.size===n){ AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),260); }
    } else if(node){ AUDIO.deny(); }
    drag=null;
  }
  wrap.addEventListener('pointerup',end);
  wrap.addEventListener('pointercancel',()=>{ if(dragPath)dragPath.remove(); drag=null; });
  return {destroy(){ host.innerHTML=''; }};
};

/* --- Swipe Card --- */
PANELS.card=function(host,ctx){
  host.appendChild(mk(`<div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px">
      <div id="swipeTrack"><div id="swipeSlot"></div><div id="swipeCard">CREW ID</div></div>
      <div id="swipeMsg" class="sw-wait">Swipe your card</div>
      <div style="font-size:11px;color:#5b6b88;letter-spacing:.1em">Drag the card through the reader at a steady speed</div>
    </div>`));
  const track=host.querySelector('#swipeTrack'), card=host.querySelector('#swipeCard'), msg=host.querySelector('#swipeMsg');
  let dragging=false,startX=0,startT=0,x=14,max=0;
  const W=()=>track.clientWidth-88-14;
  function setX(v){ x=clamp(v,14,14+W()); card.style.left=x+'px'; }
  card.addEventListener('pointerdown',e=>{
    dragging=true; startX=e.clientX; startT=performance.now(); card.setPointerCapture(e.pointerId);
    msg.className='sw-wait'; msg.textContent='Swiping…'; card.style.cursor='grabbing';
  });
  card.addEventListener('pointermove',e=>{ if(dragging) setX(14+(e.clientX-startX)); });
  function up(){
    if(!dragging) return; dragging=false; card.style.cursor='grab';
    const dt=(performance.now()-startT)/1000, travelled=x-14;
    const finished=travelled>=W()-4;
    if(!finished){ msg.className='sw-bad'; msg.textContent='Bad read — try again'; setX(14); AUDIO.deny(); return; }
    const speed=travelled/Math.max(0.001,dt);
    if(speed>900){ msg.className='sw-bad'; msg.textContent='Too fast'; setX(14); AUDIO.deny(); }
    else if(speed<230){ msg.className='sw-bad'; msg.textContent='Too slow'; setX(14); AUDIO.deny(); }
    else {
      msg.className='sw-ok'; msg.textContent='Accepted';
      card.style.background='linear-gradient(135deg,#8dffb4,#2fb362)';
      AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),420);
    }
  }
  card.addEventListener('pointerup',up); card.addEventListener('pointercancel',up);
  return {destroy(){ host.innerHTML=''; }};
};

/* --- Download / Upload data --- */
PANELS.transfer=function(host,ctx){
  const up=ctx.upload;
  const dur=up?7.2:5.4;
  const file=up?'crew_log_'+(100+Math.floor(Math.random()*800))+'.dat':'telemetry_'+(10+Math.floor(Math.random()*80))+'.pkg';
  host.appendChild(mk(`<div style="width:100%;max-width:520px;padding:14px">
      <div class="tscreen" style="padding:16px">
        <div style="font-family:monospace;font-size:12px;color:#8fd3ff;letter-spacing:.1em">${up?'UPLOADING':'DOWNLOADING'}</div>
        <div style="font-family:monospace;font-size:11px;color:#5b7fa8;margin-top:4px">${file}</div>
        <div class="tbar" style="margin-top:16px"><i class="fill"></i></div>
        <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:11px;color:#8fd3ff;margin-top:8px">
          <span class="pct">0%</span><span class="rate">0.0 KB/s</span></div>
        <div class="log" style="font-family:monospace;font-size:10px;color:#3f6a99;margin-top:14px;height:66px;overflow:hidden"></div>
      </div></div>`));
  const fill=host.querySelector('.fill'),pct=host.querySelector('.pct'),rate=host.querySelector('.rate'),log=host.querySelector('.log');
  let t=0,lt=0;
  const lines=['> handshake ok','> mounting /dev/skeld0','> verifying checksum','> block 0x1f40 ok','> compressing stream','> syncing with admin','> packet loss 0.0%','> writing to buffer'];
  return {
    update(dt){
      t+=dt;
      const p=clamp(t/dur,0,1);
      fill.style.width=(p*100)+'%';
      pct.textContent=Math.round(p*100)+'%';
      rate.textContent=(38+Math.sin(t*7)*9+p*22).toFixed(1)+' KB/s';
      if(t-lt>0.55){ lt=t; const d=document.createElement('div'); d.textContent=lines[(lines.length*Math.random())|0]; log.appendChild(d); while(log.children.length>5) log.removeChild(log.firstChild); }
      if(p>=1&&!this.done){ this.done=true; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),280); }
    },
    destroy(){ host.innerHTML=''; },
  };
};
PANELS.download=PANELS.transfer;
PANELS.upload=function(host,ctx){ ctx.upload=true; return PANELS.transfer(host,ctx); };

/* --- Divert Power: breakers --- */
PANELS.breakers=function(host,ctx){
  const n=6, on=[];
  host.appendChild(mk(`<div style="width:100%;max-width:460px;padding:16px">
    <div class="tscreen" style="padding:16px"><div style="font-family:monospace;font-size:11px;color:#8fd3ff;letter-spacing:.14em">MAIN BREAKERS — SWITCH ALL ON</div>
    <div class="row" style="display:flex;gap:14px;justify-content:center;margin-top:18px"></div>
    <div class="stat" style="margin-top:16px;text-align:center;font-family:monospace;font-size:12px;color:#ff8f7a">POWER: OFFLINE</div></div></div>`));
  const row=host.querySelector('.row'), stat=host.querySelector('.stat');
  for(let i=0;i<n;i++){
    on.push(false);
    const b=mk(`<button style="width:44px;height:96px;border-radius:9px;background:#16233c;box-shadow:inset 0 0 0 3px #3a4c74;position:relative">
      <i style="position:absolute;left:5px;right:5px;height:38px;border-radius:6px;background:#6b7a95;bottom:5px;transition:.16s;display:block"></i></button>`);
    b.addEventListener('click',()=>{
      on[i]=!on[i];
      const k=b.querySelector('i');
      k.style.bottom=on[i]?'53px':'5px';
      k.style.background=on[i]?'linear-gradient(180deg,#8dffb4,#2fb362)':'#6b7a95';
      AUDIO.blip(on[i]?760:420,.05,'square',.07);
      if(on.every(Boolean)){ stat.textContent='POWER: DIVERTED'; stat.style.color='#8dffb4'; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),300); }
    });
    row.appendChild(b);
  }
  return {destroy(){host.innerHTML='';}};
};

/* --- Accept Diverted Power (lever) --- */
PANELS.accept=function(host,ctx){
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px">
    <div style="width:74px;height:210px;border-radius:12px;background:#16233c;box-shadow:inset 0 0 0 3px #3a4c74;position:relative">
      <div class="lev" style="position:absolute;left:6px;right:6px;height:46px;border-radius:9px;bottom:6px;background:linear-gradient(180deg,#c3ccd9,#7d8797);box-shadow:0 4px 10px rgba(0,0,0,.5)"></div>
      <div class="lamp" style="position:absolute;left:50%;top:-26px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:#3a2020;box-shadow:inset 0 0 0 2px #6b4040"></div>
    </div>
    <div style="font-size:12px;font-weight:900;letter-spacing:.14em;color:#22314f">HOLD TO ENGAGE</div></div>`));
  const lev=host.querySelector('.lev'), lamp=host.querySelector('.lamp');
  const inst=holdPanel({dur:1.5,label:'Accepting power',color:'#5ef08b',onDone:()=>ctx.complete&&ctx.complete()});
  const outer=inst.render;
  inst.render=(a)=>{ outer(a); lev.style.bottom=(6+a*158)+'px'; if(a>0.98){ lamp.style.background='#5ef08b'; lamp.style.boxShadow='0 0 18px #5ef08b'; } };
  host.appendChild(mk('<div style="height:8px"></div>'));
  return inst;
};

/* --- Align Engine Output --- */
PANELS.engine=function(host,ctx){
  host.appendChild(mk(`<div style="width:100%;max-width:420px;padding:14px"><div class="tscreen" style="padding:16px">
    <div style="font-family:monospace;font-size:11px;color:#8fd3ff;letter-spacing:.12em">ALIGN ENGINE OUTPUT</div>
    <div class="track" style="position:relative;height:170px;margin-top:14px;background:rgba(255,255,255,.05);border-radius:10px">
      <div class="target" style="position:absolute;left:0;right:0;height:3px;background:repeating-linear-gradient(90deg,#8fd3ff 0 8px,transparent 8px 16px)"></div>
      <div class="blk" style="position:absolute;left:8px;right:8px;height:34px;border-radius:8px;background:linear-gradient(180deg,#7fa7ff,#2f5bd0);box-shadow:0 0 18px rgba(79,140,255,.6);cursor:grab"></div>
    </div>
    <div class="st" style="text-align:center;font-family:monospace;font-size:11px;color:#ff8f7a;margin-top:10px">MISALIGNED</div>
    </div></div>`));
  const track=host.querySelector('.track'),blk=host.querySelector('.blk'),tgt=host.querySelector('.target'),st=host.querySelector('.st');
  const ty=20+Math.random()*(track.clientHeight-70);
  tgt.style.top=(ty+16)+'px';
  let y=track.clientHeight-46,drag=false,off=0,lock=0;
  function place(){ blk.style.top=y+'px'; }
  place();
  blk.addEventListener('pointerdown',e=>{drag=true;off=e.clientY-y;blk.setPointerCapture(e.pointerId);blk.style.cursor='grabbing';});
  blk.addEventListener('pointermove',e=>{ if(drag){ y=clamp(e.clientY-off,0,track.clientHeight-34); place(); } });
  addEventListener('pointerup',()=>{drag=false;blk.style.cursor='grab';});
  return {
    update(dt){
      if(Math.abs((y+17)-(ty+17))<7){ lock+=dt; st.textContent='ALIGNED'; st.style.color='#8dffb4';
        if(lock>0.45&&!this.done){ this.done=true; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),240); } }
      else { lock=0; st.textContent='MISALIGNED'; st.style.color='#ff8f7a'; }
    },
    destroy(){host.innerHTML='';},
  };
};

/* --- Calibrate Distributor --- */
PANELS.distributor=function(host,ctx){
  const S=260;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:10px">
    <canvas id="distCanvas" width="${S}" height="${S}"></canvas>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">Stage 1 / 3 — click when the node enters the slot</div></div>`));
  const cv=host.querySelector('#distCanvas'),g=cv.getContext('2d'),st=host.querySelector('.st');
  let ang=Math.random()*TAU,stage=0,target=Math.random()*TAU,fail=0;
  const speed=2.1;
  function draw(){
    g.clearRect(0,0,S,S);
    g.strokeStyle='#22314f'; g.lineWidth=16; g.beginPath(); g.arc(S/2,S/2,92,0,TAU); g.stroke();
    g.strokeStyle='#0f1a2c'; g.lineWidth=16; g.beginPath(); g.arc(S/2,S/2,92,target-0.28,target+0.28); g.stroke();
    g.strokeStyle='#4ea3ff'; g.lineWidth=16; g.beginPath(); g.arc(S/2,S/2,92,target-0.24,target+0.24); g.stroke();
    for(let i=0;i<stage;i++){ g.fillStyle='#5ef08b'; g.beginPath(); g.arc(S/2-30+i*30,S-18,7,0,7); g.fill(); }
    g.fillStyle='#ffe27a'; g.shadowColor='#ffcc4d'; g.shadowBlur=18;
    g.beginPath(); g.arc(S/2+Math.cos(ang)*92,S/2+Math.sin(ang)*92,15,0,7); g.fill(); g.shadowBlur=0;
    g.fillStyle='#22314f'; g.font='900 13px monospace'; g.textAlign='center';
    g.fillText('CALIBRATE',S/2,S/2-4); g.fillText('DISTRIBUTOR',S/2,S/2+14);
  }
  function hit(){
    let d=Math.abs(((ang-target+Math.PI*3)%TAU)-Math.PI);
    if(d<0.3){ stage++; target=Math.random()*TAU; AUDIO.blip(760+stage*120,.08,'triangle',.1);
      st.textContent='Stage '+Math.min(3,stage+1)+' / 3';
      if(stage>=3){ st.textContent='CALIBRATED'; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),260); } }
    else { stage=0; fail=1; AUDIO.deny(); st.textContent='Recalibrating…'; setTimeout(()=>{st.textContent='Stage 1 / 3';},700); }
  }
  cv.addEventListener('pointerdown',hit);
  return {
    update(dt){ if(stage<3){ ang+=dt*speed*(1+stage*0.22); if(ang>TAU)ang-=TAU; } draw(); },
    destroy(){ host.innerHTML=''; },
  };
};

/* --- Chart Course --- */
PANELS.chart=function(host,ctx){
  const W=460,H=250;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
    <canvas id="navCanvas" width="${W}" height="${H}" style="cursor:grab"></canvas>
    <div class="st" style="font-family:monospace;font-size:11px;color:#22314f">Drag the ship through both waypoints</div></div>`));
  const cv=host.querySelector('#navCanvas'),g=cv.getContext('2d'),st=host.querySelector('.st');
  const pts=[{x:44,y:H-44},{x:W*0.42,y:H*0.34},{x:W*0.66,y:H*0.66},{x:W-52,y:48}];
  let ship={x:pts[0].x,y:pts[0].y},next=1,drag=false,trail=[],done=false;
  function draw(){
    g.clearRect(0,0,W,H);
    g.fillStyle='#08131f'; g.fillRect(0,0,W,H);
    g.strokeStyle='rgba(120,190,255,.14)'; g.lineWidth=1;
    for(let x=0;x<W;x+=24){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
    for(let y=0;y<H;y+=24){ g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
    g.strokeStyle='rgba(140,220,255,.4)'; g.setLineDash([6,7]); g.lineWidth=2; g.beginPath();
    pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.stroke(); g.setLineDash([]);
    pts.forEach((p,i)=>{
      if(i===0||i===pts.length-1) return;
      g.fillStyle=i<next?'#5ef08b':'#ffcc4d';
      g.beginPath(); g.arc(p.x,p.y,11,0,7); g.fill();
      g.strokeStyle='rgba(255,255,255,.55)'; g.lineWidth=2; g.stroke();
    });
    g.strokeStyle='rgba(120,220,255,.75)'; g.lineWidth=3; g.beginPath();
    trail.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y)); g.stroke();
    g.save(); g.translate(ship.x,ship.y);
    const a=trail.length>1?Math.atan2(ship.y-trail[trail.length-2].y,ship.x-trail[trail.length-2].x):0;
    g.rotate(a);
    g.fillStyle='#e8f2ff'; g.beginPath(); g.moveTo(14,0); g.lineTo(-9,-8); g.lineTo(-5,0); g.lineTo(-9,8); g.closePath(); g.fill();
    g.fillStyle='#4ea3ff'; g.beginPath(); g.arc(1,0,4,0,7); g.fill();
    g.restore();
    g.strokeStyle='#5ef08b'; g.lineWidth=2; g.beginPath(); g.arc(pts[pts.length-1].x,pts[pts.length-1].y,15,0,7); g.stroke();
  }
  function pos(e){ const r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}; }
  cv.addEventListener('pointerdown',e=>{ const p=pos(e);
    if(Math.hypot(p.x-ship.x,p.y-ship.y)<46){ drag=true; cv.setPointerCapture(e.pointerId); cv.style.cursor='grabbing'; } });
  cv.addEventListener('pointermove',e=>{
    if(!drag||done) return;
    const p=pos(e); ship.x=clamp(p.x,10,W-10); ship.y=clamp(p.y,10,H-10);
    trail.push({x:ship.x,y:ship.y}); if(trail.length>170) trail.shift();
    if(next<pts.length-1&&Math.hypot(ship.x-pts[next].x,ship.y-pts[next].y)<22){
      next++; AUDIO.blip(880,.07,'triangle',.1);
      st.textContent=next>=pts.length-1?'Now head to the destination':'Waypoint reached';
    }
    if(next>=pts.length-1&&Math.hypot(ship.x-pts[pts.length-1].x,ship.y-pts[pts.length-1].y)<24){
      done=true; drag=false; st.textContent='COURSE CHARTED'; st.style.color='#189b48';
      AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),280);
    }
  });
  addEventListener('pointerup',()=>{ drag=false; cv.style.cursor='grabbing'==='x'?'':'grab'; });
  return {update(){draw();},destroy(){host.innerHTML='';}};
};

/* --- Stabilize Steering --- */
PANELS.steering=function(host,ctx){
  const W=420,H=250;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
    <canvas id="navCanvas" width="${W}" height="${H}" style="cursor:crosshair"></canvas>
    <div class="st" style="font-family:monospace;font-size:11px;color:#22314f">Click when the reticle is inside the circle</div></div>`));
  const cv=host.querySelector('#navCanvas'),g=cv.getContext('2d'),st=host.querySelector('.st');
  let t=Math.random()*TAU,rx=W/2,ry=H/2,done=false;
  function draw(){
    g.clearRect(0,0,W,H);
    g.fillStyle='#08131f'; g.fillRect(0,0,W,H);
    g.strokeStyle='rgba(120,190,255,.16)'; g.lineWidth=1;
    for(let x=0;x<W;x+=20){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
    for(let y=0;y<H;y+=20){ g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
    g.strokeStyle='#5ef08b'; g.lineWidth=3; g.beginPath(); g.arc(W/2,H/2,30,0,7); g.stroke();
    g.fillStyle='rgba(94,240,139,.12)'; g.fill();
    g.strokeStyle=done?'#5ef08b':'#ff8f7a'; g.lineWidth=2;
    g.beginPath(); g.arc(rx,ry,20,0,7); g.stroke();
    g.beginPath(); g.moveTo(rx-28,ry); g.lineTo(rx-8,ry); g.moveTo(rx+8,ry); g.lineTo(rx+28,ry);
    g.moveTo(rx,ry-28); g.lineTo(rx,ry-8); g.moveTo(rx,ry+8); g.lineTo(rx,ry+28); g.stroke();
  }
  cv.addEventListener('pointerdown',()=>{
    if(done) return;
    if(Math.hypot(rx-W/2,ry-H/2)<30){ done=true; st.textContent='STEERING STABILIZED'; st.style.color='#189b48'; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),280); }
    else { AUDIO.deny(); st.textContent='Off centre — try again'; setTimeout(()=>st.textContent='Click when the reticle is inside the circle',800); }
  });
  return {
    update(dt){ if(!done){ t+=dt*1.35; rx=W/2+Math.cos(t)*88+Math.sin(t*2.3)*36; ry=H/2+Math.sin(t*1.2)*66+Math.cos(t*1.9)*26; } draw(); },
    destroy(){host.innerHTML='';},
  };
};

/* --- Clear Asteroids --- */
PANELS.asteroids=function(host,ctx){
  const W=560,H=280,NEED=20;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:100%">
    <div id="astroField" style="width:${W}px;max-width:100%;height:${H}px"></div>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">0 / ${NEED} destroyed</div></div>`));
  const field=host.querySelector('#astroField'),st=host.querySelector('.st');
  let rocks=[],count=0,spawnT=0,done=false;
  function add(){
    const el=document.createElement('div'); el.className='ast';
    const y=8+Math.random()*(H-40), s=0.7+Math.random()*0.9;
    el.style.top=y+'px'; el.style.left=(W+30)+'px';
    el.style.width=el.style.height=(16+Math.random()*18)+'px';
    field.appendChild(el);
    const r={el,x:W+30,y,vx:-(70+Math.random()*130)*s,vy:(Math.random()-0.5)*22,rot:Math.random()*360,vr:(Math.random()-.5)*220};
    el.addEventListener('pointerdown',e=>{
      if(r.dead||done) return;
      r.dead=true; el.classList.add('boom');
      count++; st.textContent=count+' / '+NEED+' destroyed';
      AUDIO.noise(0.12,0.13,'highpass',1600,400,1); AUDIO.tone(220+Math.random()*120,0.07,'square',0.05,90);
      if(G.settings.visualTasks) VISUAL.turretFire();
      setTimeout(()=>el.remove(),300);
      if(count>=NEED&&!done){ done=true; st.textContent='FIELD CLEARED'; st.style.color='#189b48'; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),320); }
    });
    rocks.push(r);
  }
  return {
    update(dt){
      if(done) return;
      spawnT-=dt;
      if(spawnT<=0&&rocks.filter(r=>!r.dead).length<7){ spawnT=0.32+Math.random()*0.4; add(); }
      for(const r of rocks){
        if(r.dead) continue;
        r.x+=r.vx*dt; r.y+=r.vy*dt; r.rot+=r.vr*dt;
        r.el.style.left=r.x+'px'; r.el.style.top=r.y+'px'; r.el.style.transform='rotate('+r.rot+'deg)';
        if(r.x<-40){ r.dead=true; r.el.remove(); }
      }
      rocks=rocks.filter(r=>!r.dead||r.el.isConnected);
    },
    destroy(){ host.innerHTML=''; },
  };
};

/* --- Prime Shields --- */
PANELS.shields=function(host,ctx){
  const N=14;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:12px">
    <div class="hexes"></div>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">0 / ${N} primed</div></div>`));
  const wrap=host.querySelector('.hexes'),st=host.querySelector('.st');
  let lit=0;
  for(let i=0;i<N;i++){
    const h=mk(`<div class="hex"></div>`);
    h.addEventListener('click',()=>{
      if(h.classList.contains('lit')) return;
      h.classList.add('lit'); lit++;
      AUDIO.blip(560+lit*40,.06,'triangle',.09);
      st.textContent=lit+' / '+N+' primed';
      if(lit>=N){ st.textContent='SHIELDS PRIMED'; st.style.color='#189b48'; AUDIO.taskDone();
        if(G.settings.visualTasks) VISUAL.shieldsUp();
        setTimeout(()=>ctx.complete&&ctx.complete(),300); }
    });
    wrap.appendChild(h);
  }
  return {destroy(){host.innerHTML='';}};
};

/* --- Submit Scan (visual task: stand on the MedBay scanner) --- */
PANELS.scan=function(host,ctx){
  const inst=holdPanel({dur:10,label:'Submitting scan',color:'#5ef08b',
    onDone(){ VISUAL.scanStop(); ctx.complete&&ctx.complete(); }});
  const _destroy=inst.destroy;
  inst.destroy=function(){ VISUAL.scanStop(); host.innerHTML=''; };
  // start the 3D scanner beam as soon as the panel opens
  inst.onOpen=function(){ if(G.settings.visualTasks) VISUAL.scanStart(); };
  ctx.onOpen=function(){ if(G.settings.visualTasks) VISUAL.scanStart(); };
  return inst;
};

/* --- Inspect Sample --- */
PANELS.sample=function(host,ctx){
  const WAIT=20;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:14px">
    <div class="vials"></div>
    <div class="tbar" style="width:300px"><i class="fill"></i></div>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">Press START to begin the culture</div>
    <button class="tbtn start" style="min-width:180px">START</button></div>`));
  const wrap=host.querySelector('.vials'),fill=host.querySelector('.fill'),st=host.querySelector('.st'),btn=host.querySelector('.start');
  let phase='idle',t=0,bad=2,els=[];
  function build(){
    wrap.innerHTML=''; els=[];
    for(let i=0;i<5;i++){
      const v=mk(`<div class="vial"><i style="height:0%"></i></div>`);
      v.addEventListener('click',()=>{
        if(phase!=='pick') return;
        if(i===bad){ st.textContent='ANOMALY IDENTIFIED'; st.style.color='#189b48'; AUDIO.taskDone(); phase='done'; setTimeout(()=>ctx.complete&&ctx.complete(),320); }
        else { st.textContent='Wrong sample — restarting culture'; st.style.color='#c51111'; AUDIO.deny(); phase='idle'; t=0; btn.disabled=false; btn.textContent='START'; }
      });
      wrap.appendChild(v); els.push(v);
    }
  }
  build();
  btn.addEventListener('click',()=>{
    if(phase!=='idle') return;
    phase='grow'; t=0; btn.disabled=true; btn.textContent='CULTURE GROWING';
    bad=Math.floor(Math.random()*5);
    st.textContent='Wait for the culture to settle…';
    AUDIO.blip(520,.1,'triangle',.1);
  });
  return {
    update(dt){
      if(phase==='grow'){
        t+=dt; const p=clamp(t/WAIT,0,1);
        fill.style.width=(p*100)+'%';
        els.forEach((v,i)=>{ v.querySelector('i').style.height=(p*72)+'%'; v.querySelector('i').style.background=i===bad&&p>0.85?'#ff5f52':'#7fd4ff'; });
        if(p>=1){ phase='pick'; st.textContent='Select the anomalous sample'; st.style.color='#22314f'; btn.textContent='INSPECTING'; AUDIO.blip(880,.12,'triangle',.1); }
      }
    },
    destroy(){host.innerHTML='';},
  };
};

/* --- Start Reactor (simon says) --- */
PANELS.simon=function(host,ctx){
  const ROUNDS=5;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:12px">
    <div class="simon"></div>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">Round 1 / ${ROUNDS} — watch the sequence</div></div>`));
  const grid=host.querySelector('.simon'),st=host.querySelector('.st');
  const btns=[];
  for(let i=0;i<9;i++){ const b=document.createElement('button'); b.dataset.i=i; grid.appendChild(b); btns.push(b); }
  let seq=[],idx=0,phase='show',t=0,round=0,showIdx=0;
  function flash(i,ms){ btns[i].classList.add('lit'); AUDIO.blip(320+i*60,0.11,'triangle',0.11); setTimeout(()=>btns[i].classList.remove('lit'),ms||260); }
  function newRound(){
    round++; seq.push(Math.floor(Math.random()*9));
    phase='show'; t=0; showIdx=0; st.textContent='Round '+round+' / '+ROUNDS+' — watch the sequence';
    btns.forEach(b=>b.style.pointerEvents='none');
  }
  newRound();
  grid.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button'); if(!b||phase!=='input') return;
    const i=+b.dataset.i; flash(i,150);
    if(i===seq[idx]){
      idx++;
      if(idx>=seq.length){
        if(round>=ROUNDS){ phase='done'; st.textContent='REACTOR ONLINE'; st.style.color='#189b48'; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),320); }
        else { phase='wait'; setTimeout(newRound,420); }
      }
    } else {
      phase='fail'; btns.forEach(x=>x.classList.add('err')); AUDIO.deny();
      st.textContent='Wrong sequence — restarting';
      setTimeout(()=>{ btns.forEach(x=>x.classList.remove('err')); seq=[]; round=0; idx=0; newRound(); },800);
    }
  });
  return {
    update(dt){
      if(phase==='show'){
        t+=dt;
        if(t>0.62){ t=0; if(showIdx<seq.length){ flash(seq[showIdx],330); showIdx++; }
          else { phase='input'; idx=0; st.textContent='Round '+round+' / '+ROUNDS+' — repeat the sequence'; btns.forEach(b=>b.style.pointerEvents='auto'); } }
      }
    },
    destroy(){host.innerHTML='';},
  };
};
PANELS.reactor=PANELS.simon;

/* --- Unlock Manifolds --- */
PANELS.manifolds=function(host,ctx){
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:12px">
    <div class="keys"></div>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">Press the numbers in order: 1 → 10</div></div>`));
  const grid=host.querySelector('.keys'),st=host.querySelector('.st');
  const order=[1,2,3,4,5,6,7,8,9,10].sort(()=>Math.random()-0.5);
  let next=1;
  const btns=order.map(n=>{
    const b=document.createElement('button'); b.textContent=n;
    b.addEventListener('click',()=>{
      if(n===next){ b.classList.add('hit'); AUDIO.blip(440+next*52,.06,'square',.08); next++;
        st.textContent=next>10?'MANIFOLDS UNLOCKED':'Next: '+next;
        if(next>10){ st.style.color='#189b48'; AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),280); } }
      else { AUDIO.deny(); b.classList.add('err'); setTimeout(()=>b.classList.remove('err'),260);
        grid.querySelectorAll('button').forEach(x=>x.classList.remove('hit')); next=1; st.textContent='Reset — start from 1'; }
    });
    grid.appendChild(b); return b;
  });
  return {destroy(){host.innerHTML='';}};
};

/* --- Clean O2 Filter (drag leaves) --- */
PANELS.filter=function(host,ctx){
  const N=9;
  host.appendChild(mk(`<div class="dragArea" style="height:250px">
      <div class="binTarget">DISPOSAL</div></div>`));
  const area=host.firstChild, bin=area.querySelector('.binTarget');
  let left=N;
  const leaves=[];
  for(let i=0;i<N;i++){
    const l=mk(`<div class="leaf"></div>`);
    l.style.left=(14+Math.random()*(area.clientWidth-120))+'px';
    l.style.top=(14+Math.random()*(area.clientHeight-90))+'px';
    l.style.transform='rotate('+(Math.random()*360)+'deg)';
    area.appendChild(l); leaves.push(l);
    let drag=false,ox=0,oy=0;
    l.addEventListener('pointerdown',e=>{ drag=true; l.setPointerCapture(e.pointerId);
      const r=l.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; l.style.zIndex=5; l.style.cursor='grabbing'; });
    l.addEventListener('pointermove',e=>{ if(!drag) return;
      const r=area.getBoundingClientRect();
      l.style.left=clamp(e.clientX-r.left-ox,0,r.width-30)+'px';
      l.style.top=clamp(e.clientY-r.top-oy,0,r.height-22)+'px';
      const br=bin.getBoundingClientRect();
      const lr=l.getBoundingClientRect();
      if(lr.left+lr.width/2>br.left&&lr.right-lr.width/2<br.right&&lr.top+lr.height/2>br.top&&lr.bottom-lr.height/2<br.bottom){
        drag=false; l.remove(); left--;
        AUDIO.noise(0.1,0.08,'bandpass',900,300,1);
        if(left<=0){ AUDIO.taskDone(); setTimeout(()=>ctx.complete&&ctx.complete(),240); }
      }
    });
    addEventListener('pointerup',()=>{drag=false;l.style.cursor='grab';});
  }
  return {destroy(){host.innerHTML='';}};
};

/* --- Fix Lights --- */
PANELS.lights=function(host,ctx){
  const n=5,on=[];
  host.appendChild(mk(`<div style="width:100%;max-width:420px;padding:16px"><div class="tscreen" style="padding:18px">
    <div style="font-family:monospace;font-size:11px;color:#ffcc4d;letter-spacing:.14em">LIGHTING ARRAY — RESTORE POWER</div>
    <div class="row" style="display:flex;gap:16px;justify-content:center;margin-top:20px"></div>
    <div class="st" style="text-align:center;font-family:monospace;font-size:12px;color:#ff8f7a;margin-top:18px">0 / ${n} ONLINE</div></div></div>`));
  const row=host.querySelector('.row'),st=host.querySelector('.st');
  for(let i=0;i<n;i++){
    on.push(false);
    const b=mk(`<button style="width:46px;height:100px;border-radius:9px;background:#16233c;box-shadow:inset 0 0 0 3px #3a4c74;position:relative">
      <i style="position:absolute;left:6px;right:6px;height:40px;border-radius:7px;background:#6b7a95;bottom:6px;transition:.16s;display:block"></i></button>`);
    b.addEventListener('click',()=>{
      on[i]=!on[i]; const k=b.querySelector('i');
      k.style.bottom=on[i]?'54px':'6px';
      k.style.background=on[i]?'linear-gradient(180deg,#fff3b0,#e0a020)':'#6b7a95';
      AUDIO.blip(on[i]?820:380,.05,'square',.07);
      st.textContent=on.filter(Boolean).length+' / '+n+' ONLINE';
      if(on.every(Boolean)){ st.textContent='LIGHTS RESTORED'; st.style.color='#8dffb4'; AUDIO.sabFixed(); setTimeout(()=>ctx.complete&&ctx.complete(),300); }
    });
    row.appendChild(b);
  }
  return {destroy(){host.innerHTML='';}};
};

/* --- Fix Comms (sliders + light pattern) --- */
PANELS.comms=function(host,ctx){
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:460px;padding:10px">
    <div class="stageA" style="display:flex;gap:26px;align-items:flex-end">
      ${[0,1].map(i=>`<div class="fader" data-i="${i}" style="width:52px;height:190px;border-radius:10px;background:#16233c;box-shadow:inset 0 0 0 3px #3a4c74;position:relative">
        <div class="knob" style="position:absolute;left:3px;right:3px;height:34px;border-radius:8px;bottom:6px;background:linear-gradient(180deg,#c3ccd9,#7d8797);cursor:grab"></div></div>`).join('')}
      <div class="lamp" style="width:34px;height:34px;border-radius:50%;background:#3a2020;box-shadow:inset 0 0 0 3px #6b4040;margin-bottom:70px"></div>
    </div>
    <div class="st" style="font-family:monospace;font-size:12px;color:#22314f">Slide both faders to the top</div>
    <div class="stageB" style="display:none;flex-direction:column;align-items:center;gap:10px">
      <div class="pad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"></div>
      <div class="st2" style="font-family:monospace;font-size:12px;color:#22314f">Repeat the blinking pattern</div>
    </div></div>`));
  const A=host.querySelector('.stageA'),B=host.querySelector('.stageB'),st=host.querySelector('.st'),lamp=host.querySelector('.lamp');
  const sab=G.server&&G.server.state.sab;
  const pattern=(sab&&sab.data&&sab.data.pattern)||[0,4,8,2];
  let up=[false,false],phase='sliders';
  A.querySelectorAll('.fader').forEach(f=>{
    const knob=f.querySelector('.knob'),i=+f.dataset.i;
    let drag=false,oy=0,y=6;
    knob.addEventListener('pointerdown',e=>{drag=true;oy=e.clientY-y;knob.setPointerCapture(e.pointerId);});
    knob.addEventListener('pointermove',e=>{ if(!drag)return; y=clamp(e.clientY-oy,6,150); knob.style.bottom=y+'px';
      up[i]=y>142; if(up.every(Boolean)) done1(); });
    addEventListener('pointerup',()=>{drag=false; if(!up[i]){ y=6; knob.style.bottom='6px'; } });
  });
  function done1(){
    if(phase!=='sliders') return;
    phase='pattern'; lamp.style.background='#5ef08b'; lamp.style.boxShadow='0 0 22px #5ef08b';
    AUDIO.blip(880,.12,'triangle',.1);
    st.textContent='Faders set — now match the pattern';
    setTimeout(()=>{ A.style.display='none'; B.style.display='flex'; buildPad(); },520);
  }
  let idx=0,showing=false;
  function buildPad(){
    const pad=B.querySelector('.pad'); pad.innerHTML='';
    for(let i=0;i<9;i++){
      const b=document.createElement('button');
      b.style.cssText='width:56px;height:56px;border-radius:12px;background:#22314f;box-shadow:inset 0 0 0 2px #3d5480';
      b.dataset.i=i;
      b.addEventListener('click',()=>{
        if(showing||phase!=='pattern') return;
        b.style.background='#4ea3ff';
        AUDIO.blip(420+i*50,.07,'triangle',.09);
        setTimeout(()=>{ if(phase==='pattern') b.style.background='#22314f'; },170);
        if(+b.dataset.i===pattern[idx]){ idx++;
          if(idx>=pattern.length){ phase='done'; st.textContent='COMMUNICATIONS RESTORED'; AUDIO.sabFixed(); setTimeout(()=>ctx.complete&&ctx.complete(),320); } }
        else { idx=0; AUDIO.deny(); B.querySelector('.st2').textContent='Wrong pattern — watch again'; showSeq(); }
      });
      pad.appendChild(b);
    }
    showSeq();
  }
  function showSeq(){
    showing=true; idx=0;
    const pad=B.querySelector('.pad');
    pattern.forEach((p,k)=>setTimeout(()=>{
      const b=pad.children[p]; if(!b) return;
      b.style.background='#8ff7ff'; AUDIO.blip(420+p*50,.1,'triangle',.09);
      setTimeout(()=>{ b.style.background='#22314f'; },280);
      if(k===pattern.length-1) setTimeout(()=>{ showing=false; B.querySelector('.st2').textContent='Repeat the blinking pattern'; },420);
    },600+k*520));
  }
  return {destroy(){host.innerHTML='';}};
};

/* --- O2 keypad (sabotage) --- */
PANELS.o2panel=function(host,ctx){
  const sab=G.server&&G.server.state.sab;
  const code=(sab&&sab.data&&sab.data.code)||'000000';
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:10px">
    <div style="font-family:monospace;font-size:12px;letter-spacing:.14em;color:#22314f">ENTER THE O2 CODE ON THIS PANEL</div>
    <div class="disp" style="font-family:monospace;font-size:34px;letter-spacing:.34em;background:#0d1b2e;color:#7ce38b;padding:10px 22px;border-radius:10px;box-shadow:inset 0 0 0 3px #33456b">------</div>
    <div style="font-family:monospace;font-size:12px;color:#5b6b88">CODE SHOWN ON THE SABOTAGED PANEL: <b style="color:#22314f">${code}</b></div>
    <div class="keys" style="max-width:300px"></div></div>`));
  const disp=host.querySelector('.disp'),grid=host.querySelector('.keys');
  let entry='';
  for(let i=1;i<=10;i++){
    const n=i===10?0:i, b=document.createElement('button'); b.textContent=n;
    b.addEventListener('click',()=>{
      if(entry.length>=6) return;
      entry+=String(n); disp.textContent=entry.padEnd(6,'-');
      AUDIO.blip(520+n*40,.05,'square',.08);
      if(entry.length===6){
        if(entry===code){ disp.style.color='#5ef08b'; AUDIO.sabFixed(); setTimeout(()=>ctx.complete&&ctx.complete(entry),300); }
        else { disp.style.color='#ff5f52'; AUDIO.deny(); setTimeout(()=>{ entry=''; disp.textContent='------'; disp.style.color='#7ce38b'; },650); }
      }
    });
    grid.appendChild(b);
  }
  const clr=mk(`<button class="tbtn" style="width:100%;max-width:300px">CLEAR</button>`);
  clr.addEventListener('click',()=>{ entry=''; disp.textContent='------'; });
  host.firstChild.appendChild(clr);
  return {destroy(){host.innerHTML='';}};
};

/* --- Reactor sabotage: handprint (hold) --- */
PANELS.reactorSab=function(host,ctx){
  return holdPanel({dur:1.4,label:'Hold hand on scanner',color:'#ff5a3c',
    onDone(){ AUDIO.sabFixed(); ctx.complete&&ctx.complete(); }});
};

/* --- Fuel / garbage / chute / vent clean: hold panels --- */
PANELS.fuelcan=function(host,ctx){ return holdPanel({dur:2.6,label:'Filling canister',color:'#ffcc4d',onDone:()=>ctx.complete&&ctx.complete()}); };
PANELS.fuelengine=function(host,ctx){ return holdPanel({dur:3.0,label:'Fuelling engine',color:'#7fa7ff',onDone:()=>ctx.complete&&ctx.complete()}); };
PANELS.garbage=function(host,ctx){ return holdPanel({dur:2.4,label:'Pulling lever — dumping',color:'#cfd8dc',onDone:()=>{ ctx.visual&&ctx.visual(); ctx.complete&&ctx.complete(); }}); };
PANELS.garbagechute=PANELS.garbage;
PANELS.chute=PANELS.garbage;
PANELS.chutebin=PANELS.garbage;
PANELS.ventclean=function(host,ctx){ return holdPanel({dur:2.2,label:'Scrubbing the vent',color:'#5ef08b',onDone:()=>ctx.complete&&ctx.complete()}); };
PANELS.scanHold=PANELS.scan;

/* --- Emergency button confirm --- */
PANELS.emergency=function(host,ctx){
  const me=G.me, left=me?me.emergencies:0;
  host.appendChild(mk(`<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:14px;text-align:center">
    <div style="width:130px;height:130px;border-radius:50%;background:radial-gradient(circle at 50% 34%,#ff8b80,#c51111 62%,#7d0b0b);
      box-shadow:0 12px 0 #5c0707,0 0 60px rgba(255,59,48,.5)"></div>
    <div style="font-size:17px;font-weight:900;letter-spacing:.1em;color:#16233c">CALL AN EMERGENCY MEETING?</div>
    <div style="font-size:12.5px;color:#4a5c80">${left} meeting${left===1?'':'s'} remaining &middot; everyone will be taken to the cafeteria</div>
    <div style="display:flex;gap:12px">
      <button class="tbtn red confirm" style="padding:.8em 1.6em">CALL MEETING</button>
      <button class="tbtn cancel" style="padding:.8em 1.6em">CANCEL</button>
    </div></div>`));
  host.querySelector('.confirm').addEventListener('click',()=>{ AUDIO.report(); TASKUI.close(); ctx.complete&&ctx.complete(); });
  host.querySelector('.cancel').addEventListener('click',()=>TASKUI.close());
  return {destroy(){host.innerHTML='';}};
};
