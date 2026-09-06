/* ============================================================================
   AMONG US 3D — WEB
   A Three.js (WebGL2) recreation of Among Us 3D played like classic Among Us.
   Everything runs in a single index.html (Three.js is inlined).
   ----------------------------------------------------------------------------
   ONLINE-READY NOTE: game logic lives in a deterministic `Game` module that
   could be lifted into a server-authoritative Net layer. A stubbed `Net`
   interface is present (offline / single-player bots) and `ONLINE` is OFF.
   ========================================================================== */
'use strict';

const ONLINE = false;                 // toggle when the server layer is wired up
const MAP_ID = 'skeld';
const TILE = 3;                       // world units per map tile

/* ------------------------------------------------------------------ colors */
const COLORS = [
  { id:'red',    hex:0xC51111, css:'#C51111' },
  { id:'blue',   hex:0x132ED1, css:'#132ED1' },
  { id:'green',  hex:0x117F2D, css:'#117F2D' },
  { id:'pink',   hex:0xED54BA, css:'#ED54BA' },
  { id:'orange', hex:0xEF7D0D, css:'#EF7D0D' },
  { id:'yellow', hex:0xF5F557, css:'#F5F557' },
  { id:'black',  hex:0x3F474E, css:'#3F474E' },
  { id:'white',  hex:0xD6E0F0, css:'#D6E0F0' },
  { id:'purple', hex:0x6B2FBB, css:'#6B2FBB' },
  { id:'brown',  hex:0x71491E, css:'#71491E' },
  { id:'cyan',   hex:0x38FEDC, css:'#38FEDC' },
  { id:'lime',   hex:0x50EF39, css:'#50EF39' },
];
const colorByHex = h => COLORS.find(c => c.hex === h);
const colorByIndex = i => COLORS[((i % COLORS.length) + COLORS.length) % COLORS.length];

/* ------------------------------------------------------------------ utils */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const rand  = (a,b)=>a+Math.random()*(b-a);
const randi = (a,b)=>Math.floor(rand(a,b+1));
const pick  = arr => arr[(Math.random()*arr.length)|0];
const shuffle = arr => { for(let i=arr.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; };
const dist2d = (a,b)=>Math.hypot(a.x-b.x, a.z-b.z);
const easeOut = t=>1-Math.pow(1-t,3);
const V3 = (x,y,z)=>new THREE.Vector3(x,y,z);
const now = ()=>performance.now()/1000;

/* ------------------------------------------------------------------ audio */
const AudioSys = {
  ctx:null, master:null, music:null, started:false,
  init(){
    if(this.ctx) return;
    try{
      const AC = window.AudioContext||window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startMusic();
      this.started = true;
    }catch(e){}
  },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },
  now(){ return this.ctx? this.ctx.currentTime : 0; },
  tone(freq, dur, opts={}){
    if(!this.ctx) return;
    const { type='square', vol=0.2, slide=0, when=0, attack=0.01 } = opts;
    const t = this.now()+when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide), t+dur);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+attack);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t+dur+0.02);
  },
  noise(dur, vol=0.25, when=0){
    if(!this.ctx) return;
    const t=this.now()+when;
    const len=Math.max(1,(this.ctx.sampleRate*dur)|0);
    const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource(); src.buffer=buf;
    const g=this.ctx.createGain(); g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=2200;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  kill(){ if(this.ctx){this.ctx.close(); this.ctx=null; this.started=false; this._stopMusic();} },
  _startMusic(){
    // ambient dark space hum
    const t=this.now();
    const o=this.ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=48;
    const g=this.ctx.createGain(); g.gain.value=0.05;
    const lfo=this.ctx.createOscillator(); lfo.frequency.value=0.07;
    const lg=this.ctx.createGain(); lg.gain.value=4;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t);
    this.music={o,lfo};
  },
  _stopMusic(){ if(this.music){try{this.music.o.stop();this.music.lfo.stop();}catch(e){} this.music=null;} }
};
const Sfx = {
  tick(){ AudioSys.tone(880,0.04,{vol:0.05}); },
  click(){ AudioSys.tone(660,0.05,{type:'square',vol:0.12}); },
  ui(){ AudioSys.tone(520,0.06,{vol:0.1}); AudioSys.tone(780,0.05,{vol:0.08,when:0.03}); },
  start(){ AudioSys.tone(440,0.2,{vol:0.2}); AudioSys.tone(660,0.2,{vol:0.2,when:0.12}); AudioSys.tone(880,0.35,{vol:0.22,when:0.24}); },
  step(){ AudioSys.tone(rand(150,180),0.05,{type:'triangle',vol:0.05}); },
  kill(){ AudioSys.tone(180,0.5,{type:'sawtooth',vol:0.3,slide:-120}); AudioSys.noise(0.35,0.3); AudioSys.tone(90,0.4,{vol:0.3,when:0.05}); },
  sabotage(){ AudioSys.tone(300,0.8,{type:'sawtooth',vol:0.22,slide:-180}); AudioSys.noise(0.5,0.2); },
  fix(){ AudioSys.tone(980,0.08,{vol:0.15}); AudioSys.tone(1320,0.1,{vol:0.15,when:0.06}); },
  task(){ AudioSys.tone(620,0.08,{vol:0.16}); AudioSys.tone(920,0.12,{vol:0.16,when:0.07}); },
  taskDone(){ AudioSys.tone(660,0.1,{vol:0.16}); AudioSys.tone(880,0.1,{vol:0.16,when:0.08}); AudioSys.tone(1100,0.22,{vol:0.18,when:0.16}); },
  vent(){ AudioSys.tone(240,0.25,{type:'sine',vol:0.18,slide:120}); AudioSys.noise(0.18,0.12); },
  alert(){ AudioSys.tone(220,0.4,{type:'sawtooth',vol:0.28,slide:120}); AudioSys.tone(220,0.4,{type:'sawtooth',vol:0.22,when:0.3}); },
  meeting(){ AudioSys.tone(520,0.12,{vol:0.2}); AudioSys.tone(520,0.12,{vol:0.2,when:0.18}); AudioSys.tone(660,0.2,{vol:0.22,when:0.36}); },
  report(){ AudioSys.tone(700,0.5,{type:'sine',vol:0.2,slide:240}); AudioSys.noise(0.2,0.1); },
  vote(){ AudioSys.tone(500,0.09,{vol:0.14}); },
  ejection(){ AudioSys.tone(120,0.9,{type:'triangle',vol:0.3,slide:-60}); AudioSys.noise(0.6,0.2); },
  win(){ AudioSys.tone(523,0.22,{vol:0.22}); AudioSys.tone(659,0.22,{vol:0.22,when:0.15}); AudioSys.tone(784,0.22,{vol:0.22,when:0.3}); AudioSys.tone(1046,0.5,{vol:0.24,when:0.45}); },
  lose(){ AudioSys.tone(392,0.3,{vol:0.24}); AudioSys.tone(330,0.3,{vol:0.24,when:0.25}); AudioSys.tone(262,0.7,{vol:0.26,when:0.5}); },
  ejectConfirm(){ AudioSys.tone(784,0.14,{vol:0.2}); AudioSys.tone(988,0.2,{vol:0.2,when:0.1}); },
};

/* ------------------------------------------------------------------ input */
const Input = {
  keys:{}, mouse:{x:0,y:0,dx:0,dy:0,down:false}, touch:{active:false, joy:{x:0,y:0}, look:{x:0,y:0}},
  fpsLook:false,
  init(){
    window.addEventListener('keydown',e=>{
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      this.keys[e.code]=true; this.keys[e.key]=true;
      if(this.keys[' ']) e.preventDefault();
    });
    window.addEventListener('keyup',e=>{ this.keys[e.code]=false; this.keys[e.key]=false; });
    window.addEventListener('blur',()=>{ this.keys={}; });
    window.addEventListener('mousemove',e=>{
      this.mouse.dx += e.movementX||0; this.mouse.dy += e.movementY||0;
      this.mouse.x=e.clientX; this.mouse.y=e.clientY;
    });
    window.addEventListener('mousedown',e=>{ this.mouse.down=true; this._down(e.clientX,e.clientY); });
    window.addEventListener('mouseup',()=>{ this.mouse.down=false; });
    // touch
    const patch = () => {
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints>0;
      const isCoarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
      Input.touch.active = isTouch || isCoarse;
      const el = document.getElementById('touch');
      if(el) el.classList.toggle('on', Input.touch.active);
    };
    patch();
    window.addEventListener('resize', patch);
    this._bindTouch();
    window.addEventListener('contextmenu',e=>e.preventDefault());
  },
  _bindTouch(){
    const bind = (padId, knobId, out) => {
      const pad=document.getElementById(padId), knob=document.getElementById(knobId);
      if(!pad) return;
      let id=null;
      const set=(x,y)=>{
        const r=pad.getBoundingClientRect();
        const cx=r.left+r.width/2, cy=r.top+r.height/2;
        let dx=x-cx, dy=y-cy, max=r.width/2-20;
        const len=Math.hypot(dx,dy); if(len>max){dx*=max/len;dy*=max/len;}
        knob.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        out.x=dx/max; out.y=dy/max;
      };
      pad.addEventListener('touchstart',e=>{e.preventDefault(); id=e.changedTouches[0].identifier; set(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
      pad.addEventListener('touchmove',e=>{e.preventDefault(); for(const t of e.changedTouches) if(t.identifier===id) set(t.clientX,t.clientY);},{passive:false});
      const end=e=>{ if(id===null) return; const ks=document.querySelectorAll('.tbtn.active'); };
      pad.addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===id){out.x=0;out.y=0;knob.style.transform='translate(-50%,-50%)'; id=null;} }},{passive:false});
      pad.addEventListener('touchcancel',()=>{out.x=0;out.y=0;knob.style.transform='translate(-50%,-50%)';id=null;});
    };
    bind('joystick','joyKnob',Input.touch.joy);
    bind('lookpad','lookKnob',Input.touch.look);
    // buttons
    document.querySelectorAll('.tbtn[data-act]').forEach(b=>{
      const act=b.dataset.act;
      b.addEventListener('touchstart',e=>{e.preventDefault(); b.classList.add('active'); Input._tap(act);},{passive:false});
      b.addEventListener('touchend',e=>{e.preventDefault(); b.classList.remove('active');},{passive:false});
    });
  },
  _down(px,py){
    // for pointer lock / click handling in gameplay
    if(window.Game) Game.onPointerDown && Game.onPointerDown(px,py);
  },
  _tap(act){ if(window.Game) Game.onTouchAction && Game.onTouchAction(act); },
  key(n){ const k=(typeof n==='string')? n : n; return !!this.keys[k]; }
};

/* ------------------------------------------------------------------ misc DOM helpers */
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; };
function toast(msg, type='', dur=2400){
  const t=$('#toast'); if(!t) return;
  const n=el('div','notif '+(type||''),msg); t.appendChild(n);
  setTimeout(()=>{ n.style.transition='opacity .3s'; n.style.opacity='0'; setTimeout(()=>n.remove(),350); }, dur);
}
