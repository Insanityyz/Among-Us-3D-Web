/* ============================================================================
   1. THREE.js bootstrap, renderer, procedural textures, post-processing
   ========================================================================== */
let THREE=null;
const THREE_CDNS=[
  'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js',
  'https://unpkg.com/three@0.161.0/build/three.module.js',
  'https://cdn.skypack.dev/three@0.161.0',
];
async function loadThree(onProgress){
  for(let i=0;i<THREE_CDNS.length;i++){
    try{
      onProgress&&onProgress(8+i*4,'Fetching renderer '+(i+1)+'/'+THREE_CDNS.length+'…');
      const mod=await import(/* @vite-ignore */ THREE_CDNS[i]);
      if(mod&&mod.Scene) return mod;
    }catch(err){ console.warn('[boot] CDN failed:',THREE_CDNS[i],err&&err.message); }
  }
  throw new Error('Could not load Three.js from any CDN. Check your network connection.');
}

/* Module-scoped math temporaries: created once THREE has loaded (see boot) */
function initMathGlobals(){
  _m4=new THREE.Matrix4(); _q=new THREE.Quaternion(); _v3=new THREE.Vector3(); _e=new THREE.Euler();
  _fwd=new THREE.Vector3(); _right=new THREE.Vector3(); _flashCol=new THREE.Color();
}

/* ---------- canvas helpers ---------- */
function cnv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function rr(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
function noiseFill(g,w,h,amt,alpha){
  const img=g.getImageData(0,0,w,h), d=img.data;
  for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*amt; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
  g.putImageData(img,0,0);
  if(alpha!==undefined){ g.globalAlpha=alpha; }
}
function hashNoise(g,w,h,scale,alpha){
  g.save(); g.globalAlpha=alpha;
  for(let y=0;y<h;y+=scale) for(let x=0;x<w;x+=scale){
    const v=Math.random();
    g.fillStyle='rgba('+(v>0.5?255:0)+','+(v>0.5?255:0)+','+(v>0.5?255:0)+','+(0.02+v*0.05)+')';
    g.fillRect(x,y,scale,scale);
  }
  g.restore();
}

/* ---------- texture library ---------- */
const TEX={cache:{}};
function mkTex(canvas,repeat,linear){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  if(!linear) t.colorSpace=THREE.SRGBColorSpace;
  if(repeat) t.repeat.set(repeat[0],repeat[1]);
  t.anisotropy=RENDER.maxAniso;
  t.needsUpdate=true;
  return t;
}
/* brushed metal wall panels with seams + rivets */
function texPanels(){
  const S=512,c=cnv(S,S),g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,S,S);
  grd.addColorStop(0,'#8d97a8'); grd.addColorStop(.45,'#7b8698'); grd.addColorStop(1,'#6b7688');
  g.fillStyle=grd; g.fillRect(0,0,S,S);
  // large panels 2x2
  for(let py=0;py<2;py++)for(let px=0;px<2;px++){
    const x=px*256,y=py*256;
    g.save();
    const l=g.createLinearGradient(x,y,x+256,y+256);
    l.addColorStop(0,'rgba(255,255,255,.10)'); l.addColorStop(.5,'rgba(255,255,255,.02)'); l.addColorStop(1,'rgba(0,0,0,.10)');
    g.fillStyle=l; g.fillRect(x+6,y+6,244,244);
    // inner bevel
    g.strokeStyle='rgba(0,0,0,.35)'; g.lineWidth=3; g.strokeRect(x+6,y+6,244,244);
    g.strokeStyle='rgba(255,255,255,.13)'; g.lineWidth=1.5; g.strokeRect(x+9,y+9,238,238);
    // rivets
    g.fillStyle='rgba(255,255,255,.22)';
    for(const [rx,ry] of [[18,18],[238,18],[18,238],[238,238]]){ g.beginPath(); g.arc(x+rx,y+ry,4.5,0,7); g.fill(); }
    g.fillStyle='rgba(0,0,0,.25)';
    for(const [rx,ry] of [[18,18],[238,18],[18,238],[238,238]]){ g.beginPath(); g.arc(x+rx+1,y+ry+1,2.4,0,7); g.fill(); }
    // panel detail lines
    g.strokeStyle='rgba(0,0,0,.16)'; g.lineWidth=2;
    g.beginPath(); g.moveTo(x+40,y+128); g.lineTo(x+216,y+128); g.stroke();
    g.restore();
  }
  // seams between panels
  g.fillStyle='rgba(20,26,36,.85)';
  g.fillRect(0,252,S,8); g.fillRect(252,0,8,S);
  g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(0,250,S,2); g.fillRect(250,0,2,S);
  // grime
  hashNoise(g,S,S,4,.5);
  for(let i=0;i<26;i++){
    g.fillStyle='rgba(30,36,48,'+(0.02+Math.random()*0.05)+')';
    const x=Math.random()*S,y=Math.random()*S,r=10+Math.random()*70;
    g.beginPath(); g.ellipse(x,y,r,r*(0.4+Math.random()*0.7),Math.random()*3,0,7); g.fill();
  }
  // scratches
  g.strokeStyle='rgba(255,255,255,.06)';
  for(let i=0;i<40;i++){ g.lineWidth=Math.random()*1.6; g.beginPath();
    const x=Math.random()*S,y=Math.random()*S; g.moveTo(x,y); g.lineTo(x+(Math.random()-.5)*90,y+(Math.random()-.5)*22); g.stroke(); }
  return mkTex(c);
}
/* floor deck plates */
function texFloor(){
  const S=512,c=cnv(S,S),g=c.getContext('2d');
  g.fillStyle='#4a5261'; g.fillRect(0,0,S,S);
  for(let py=0;py<4;py++)for(let px=0;px<4;px++){
    const x=px*128,y=py*128;
    const l=g.createLinearGradient(x,y,x+128,y+128);
    l.addColorStop(0,'#5b6474'); l.addColorStop(.5,'#4d5665'); l.addColorStop(1,'#414a58');
    g.fillStyle=l; g.fillRect(x+3,y+3,122,122);
    g.strokeStyle='rgba(0,0,0,.4)'; g.lineWidth=3; g.strokeRect(x+2,y+2,124,124);
    // diamond tread
    g.strokeStyle='rgba(255,255,255,.05)'; g.lineWidth=2;
    for(let i=-128;i<128;i+=16){ g.beginPath(); g.moveTo(x+i,y); g.lineTo(x+i+128,y+128); g.stroke(); }
    g.save(); g.beginPath(); g.rect(x+3,y+3,122,122); g.clip();
    g.strokeStyle='rgba(0,0,0,.05)';
    for(let i=-128;i<128;i+=16){ g.beginPath(); g.moveTo(x+i+128,y); g.lineTo(x+i,y+128); g.stroke(); }
    g.restore();
  }
  hashNoise(g,S,S,3,.55);
  for(let i=0;i<40;i++){ g.fillStyle='rgba(20,24,32,'+(0.03+Math.random()*0.07)+')';
    g.beginPath(); g.ellipse(Math.random()*S,Math.random()*S,8+Math.random()*40,6+Math.random()*26,Math.random()*3,0,7); g.fill(); }
  return mkTex(c);
}
/* ceiling */
function texCeil(){
  const S=256,c=cnv(S,S),g=c.getContext('2d');
  g.fillStyle='#2b3240'; g.fillRect(0,0,S,S);
  g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=4;
  for(let i=0;i<=S;i+=64){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,S); g.stroke(); g.beginPath(); g.moveTo(0,i); g.lineTo(S,i); g.stroke(); }
  g.strokeStyle='rgba(255,255,255,.05)'; g.lineWidth=1;
  for(let i=2;i<=S;i+=64){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,S); g.stroke(); }
  hashNoise(g,S,S,4,.4);
  return mkTex(c);
}
/* vent grate */
function texGrate(){
  const S=128,c=cnv(S,S),g=c.getContext('2d');
  g.fillStyle='#141a24'; g.fillRect(0,0,S,S);
  for(let y=8;y<S;y+=16){ g.fillStyle='#4b5666'; g.fillRect(4,y,S-8,9);
    g.fillStyle='rgba(255,255,255,.14)'; g.fillRect(4,y,S-8,2); }
  g.strokeStyle='#0a0e15'; g.lineWidth=5; g.strokeRect(2,2,S-4,S-4);
  return mkTex(c);
}
/* hazard stripes */
function texHazard(){
  const S=128,c=cnv(S,S),g=c.getContext('2d');
  g.fillStyle='#1b1f28'; g.fillRect(0,0,S,S);
  g.save(); g.translate(S/2,S/2); g.rotate(Math.PI/4); g.translate(-S,-S);
  for(let i=0;i<8;i++){ g.fillStyle=i%2?'#e8b21c':'#20242c'; g.fillRect(0,i*S/4,S*2,S/4); }
  g.restore();
  hashNoise(g,S,S,4,.35);
  return mkTex(c);
}
/* soft round sprite (blob shadow / glow) */
function texDot(inner,alpha){
  const S=128,c=cnv(S,S),g=c.getContext('2d');
  const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  gr.addColorStop(0,inner||'rgba(0,0,0,.62)'); gr.addColorStop(.55,alpha||'rgba(0,0,0,.32)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr; g.fillRect(0,0,S,S);
  const t=mkTex(c,null,false); t.colorSpace=THREE.SRGBColorSpace; return t;
}
function texStar(){
  const S=64,c=cnv(S,S),g=c.getContext('2d');
  const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.75)');
  gr.addColorStop(.6,'rgba(190,215,255,.14)'); gr.addColorStop(1,'rgba(150,180,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,S,S);
  const t=mkTex(c,null,false); t.colorSpace=THREE.SRGBColorSpace; return t;
}
function texBlood(){
  const S=256,c=cnv(S,S),g=c.getContext('2d');
  g.clearRect(0,0,S,S);
  for(let i=0;i<22;i++){
    const x=S/2+(Math.random()-.5)*S*0.55,y=S/2+(Math.random()-.5)*S*0.55,r=6+Math.random()*34;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,'rgba(150,10,14,.95)'); gr.addColorStop(.6,'rgba(110,6,10,.8)'); gr.addColorStop(1,'rgba(90,4,8,0)');
    g.fillStyle=gr; g.beginPath(); g.ellipse(x,y,r,r*(.6+Math.random()*.6),Math.random()*3,0,7); g.fill();
  }
  const gr2=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S*0.32);
  gr2.addColorStop(0,'rgba(168,14,18,.98)'); gr2.addColorStop(1,'rgba(120,8,12,.75)');
  g.fillStyle=gr2; g.beginPath(); g.ellipse(S/2,S/2,S*.28,S*.22,0,0,7); g.fill();
  const t=mkTex(c,null,false); t.colorSpace=THREE.SRGBColorSpace; return t;
}
/* console screen art — parameterised so every station kind looks unique */
const SCREEN_STYLE={
  download:{layout:'bars',hue:'#4ea3ff',title:'DATA TRANSFER'},
  upload:{layout:'bars',hue:'#5ef08b',title:'UPLOAD'},
  wiring:{layout:'wires',hue:'#ffcc4d',title:'WIRING'},
  card:{layout:'slot',hue:'#ffcc4d',title:'CARD READER'},
  accept:{layout:'lever',hue:'#5ef08b',title:'POWER'},
  breakers:{layout:'switch',hue:'#ffcc4d',title:'BREAKERS'},
  distributor:{layout:'dial',hue:'#4ea3ff',title:'DISTRIBUTOR'},
  chart:{layout:'radar',hue:'#4dd8ff',title:'NAVIGATION'},
  steering:{layout:'cross',hue:'#4dd8ff',title:'STEERING'},
  asteroids:{layout:'scope',hue:'#ff7043',title:'WEAPONS'},
  shields:{layout:'hex',hue:'#b388ff',title:'SHIELDS'},
  scan:{layout:'body',hue:'#5ef08b',title:'MEDBAY SCAN'},
  sample:{layout:'vials',hue:'#5ef08b',title:'SPECIMEN'},
  vitals:{layout:'vitals',hue:'#5ef08b',title:'VITALS'},
  admintable:{layout:'map',hue:'#4ea3ff',title:'ADMIN'},
  cams:{layout:'cams',hue:'#9fb4dd',title:'SECURITY'},
  reactor:{layout:'hand',hue:'#ff5a3c',title:'REACTOR'},
  manifolds:{layout:'keys',hue:'#4ea3ff',title:'MANIFOLDS'},
  engine:{layout:'engine',hue:'#7fa7ff',title:'ENGINE OUTPUT'},
  fuelengine:{layout:'fuel',hue:'#7fa7ff',title:'FUEL'},
  fuelcan:{layout:'fuel',hue:'#ffcc4d',title:'FUEL RESERVE'},
  garbage:{layout:'chute',hue:'#cfd8dc',title:'DISPOSAL'},
  garbagechute:{layout:'chute',hue:'#cfd8dc',title:'DISPOSAL'},
  chute:{layout:'chute',hue:'#cfd8dc',title:'CHUTE'},
  chutebin:{layout:'chute',hue:'#cfd8dc',title:'CHUTE'},
  filter:{layout:'filter',hue:'#7ce38b',title:'O2 FILTER'},
  lights:{layout:'switch',hue:'#ffcc4d',title:'LIGHTING'},
  comms:{layout:'fader',hue:'#ffb74d',title:'COMMS'},
  o2panel:{layout:'keys',hue:'#7ce38b',title:'O2'},
  emergency:{layout:'button',hue:'#ff3b30',title:'EMERGENCY'},
  ventclean:{layout:'vent',hue:'#5ef08b',title:'VENT'},
};
function texScreen(kind){
  const key='screen_'+kind;
  if(TEX.cache[key]) return TEX.cache[key];
  const st=SCREEN_STYLE[kind]||{layout:'bars',hue:'#4ea3ff',title:'SYSTEM'};
  const W=256,H=192,c=cnv(W,H),g=c.getContext('2d');
  g.fillStyle='#060d18'; g.fillRect(0,0,W,H);
  const gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'rgba(255,255,255,.07)'); gr.addColorStop(1,'rgba(0,0,0,.35)');
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(120,180,255,.10)'; g.lineWidth=1;
  for(let x=0;x<W;x+=16){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
  for(let y=0;y<H;y+=16){ g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  // title bar
  g.fillStyle='rgba(255,255,255,.10)'; g.fillRect(0,0,W,22);
  g.fillStyle=st.hue; g.font='bold 12px monospace'; g.fillText(st.title,8,15);
  g.fillStyle=st.hue; g.beginPath(); g.arc(W-12,11,4,0,7); g.fill();
  g.strokeStyle=st.hue; g.globalAlpha=.6; g.lineWidth=2; g.strokeRect(6,28,W-12,H-38); g.globalAlpha=1;
  const L=st.layout;
  g.fillStyle=st.hue;
  function bar(x,y,w,h,p){ g.fillStyle='rgba(255,255,255,.09)'; g.fillRect(x,y,w,h);
    g.fillStyle=st.hue; g.fillRect(x,y,w*p,h); }
  if(L==='bars'){ for(let i=0;i<5;i++) bar(20,42+i*26,W-40,15,0.2+Math.random()*0.75);
    g.font='bold 10px monospace'; g.fillStyle='#9fd4ff'; g.fillText('■■■■■■□□□□ 62%',20,H-18); }
  else if(L==='wires'){ const cols=['#e33','#39f','#fc3','#5ef08b'];
    for(let i=0;i<4;i++){ g.fillStyle=cols[i]; rr(g,16,40+i*30,26,18,4); g.fill(); rr(g,W-42,40+((i*3+1)%4)*30,26,18,4); g.fill();
      g.strokeStyle=cols[i]; g.lineWidth=5; g.beginPath(); g.moveTo(42,49+i*30);
      g.bezierCurveTo(W/2,49+i*30,W/2,49+((i*3+1)%4)*30,W-42,49+((i*3+1)%4)*30); g.stroke(); } }
  else if(L==='slot'){ g.fillStyle='rgba(255,255,255,.1)'; rr(g,24,84,W-48,20,6); g.fill();
    g.fillStyle='#dfe7f5'; rr(g,34,52,74,44,6); g.fill(); g.fillStyle='#2b3c5c'; g.font='bold 9px monospace'; g.fillText('ID CARD',44,78);
    g.fillStyle=st.hue; g.font='bold 11px monospace'; g.fillText('SWIPE →',W-96,140); }
  else if(L==='lever'||L==='switch'){ for(let i=0;i<6;i++){ const on=i<3;
      g.fillStyle='rgba(255,255,255,.12)'; rr(g,22+i*36,50,24,90,6); g.fill();
      g.fillStyle=on?st.hue:'#6b7a95'; rr(g,25+i*36,on?54:100,18,36,5); g.fill(); } }
  else if(L==='fader'){ for(let i=0;i<2;i++){ g.fillStyle='rgba(255,255,255,.1)'; g.fillRect(70+i*70,44,16,110);
      g.fillStyle=st.hue; rr(g,58+i*70,44+i*40,40,20,5); g.fill(); } }
  else if(L==='dial'){ g.strokeStyle='rgba(255,255,255,.18)'; g.lineWidth=10; g.beginPath(); g.arc(W/2,106,52,Math.PI,0); g.stroke();
    g.strokeStyle=st.hue; g.lineWidth=10; g.beginPath(); g.arc(W/2,106,52,Math.PI,Math.PI*1.6); g.stroke();
    g.fillStyle=st.hue; g.beginPath(); g.arc(W/2+40,80,7,0,7); g.fill(); }
  else if(L==='radar'){ g.strokeStyle='rgba(120,220,255,.35)'; g.lineWidth=2;
    for(let i=1;i<=3;i++){ g.beginPath(); g.arc(W/2,110,i*30,0,7); g.stroke(); }
    g.beginPath(); g.moveTo(W/2-96,110); g.lineTo(W/2+96,110); g.moveTo(W/2,40); g.lineTo(W/2,170); g.stroke();
    g.strokeStyle=st.hue; g.lineWidth=3; g.beginPath(); g.moveTo(W/2-60,140);
    g.quadraticCurveTo(W/2,60,W/2+66,96); g.stroke();
    g.fillStyle=st.hue; g.beginPath(); g.arc(W/2+66,96,6,0,7); g.fill(); }
  else if(L==='cross'){ g.strokeStyle='rgba(255,255,255,.2)'; g.lineWidth=2; g.strokeRect(40,44,W-80,110);
    g.strokeStyle=st.hue; g.lineWidth=3; g.beginPath(); g.arc(W/2,99,20,0,7); g.stroke();
    g.beginPath(); g.moveTo(W/2-30,99); g.lineTo(W/2+30,99); g.moveTo(W/2,69); g.lineTo(W/2,129); g.stroke(); }
  else if(L==='scope'){ g.fillStyle='#04080f'; g.fillRect(20,40,W-40,110);
    for(let i=0;i<9;i++){ g.fillStyle='#8d7a5e'; g.beginPath();
      g.arc(30+Math.random()*(W-60),50+Math.random()*90,3+Math.random()*7,0,7); g.fill(); }
    g.strokeStyle=st.hue; g.lineWidth=2; g.beginPath(); g.arc(W/2,95,26,0,7); g.stroke();
    g.beginPath(); g.moveTo(W/2-34,95); g.lineTo(W/2+34,95); g.moveTo(W/2,61); g.lineTo(W/2,129); g.stroke(); }
  else if(L==='hex'){ for(let r=0;r<3;r++)for(let q=0;q<5;q++){
      const x=36+q*38+(r%2?19:0), y=58+r*32;
      g.beginPath(); for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3;
        g.lineTo(x+Math.cos(a)*17,y+Math.sin(a)*17); } g.closePath();
      g.fillStyle=(q+r*2)%3===0?st.hue:'rgba(255,255,255,.10)'; g.fill(); } }
  else if(L==='body'){ g.strokeStyle=st.hue; g.lineWidth=3;
    g.beginPath(); g.arc(W/2,64,14,0,7); g.stroke();
    g.beginPath(); g.moveTo(W/2,78); g.lineTo(W/2,124); g.moveTo(W/2,92); g.lineTo(W/2-22,108);
    g.moveTo(W/2,92); g.lineTo(W/2+22,108); g.moveTo(W/2,124); g.lineTo(W/2-16,158);
    g.moveTo(W/2,124); g.lineTo(W/2+16,158); g.stroke();
    for(let i=0;i<5;i++){ g.fillStyle='rgba(94,240,139,'+(0.15+i*0.1)+')'; g.fillRect(30,50+i*22,W-60,3); } }
  else if(L==='vials'){ for(let i=0;i<5;i++){ const x=32+i*40;
      g.fillStyle='rgba(200,230,255,.16)'; rr(g,x,52,26,96,7); g.fill();
      g.fillStyle=i===2?'#ff5f52':'#7fd4ff'; rr(g,x+3,86,20,59,5); g.fill(); } }
  else if(L==='vitals'){ for(let i=0;i<10;i++){ const x=18+(i%5)*46, y=44+Math.floor(i/5)*62;
      g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(x,y,38,50);
      g.fillStyle=['#c61111','#132ed2','#117f2d','#ed54ba','#ef7d0e','#f5f557','#38fedc','#50ef39','#6b2fbc','#d6e0f0'][i];
      g.fillRect(x+3,y+3,32,44);
      g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=2; g.beginPath(); g.moveTo(x+3,y+26); g.lineTo(x+35,y+26); g.stroke();
      g.strokeStyle='#5ef08b'; g.lineWidth=1.6; g.beginPath();
      for(let k=0;k<=32;k++) g.lineTo(x+3+k,y+26-Math.sin(k*0.7+i)*7); g.stroke(); } }
  else if(L==='map'){ g.fillStyle='rgba(10,20,36,.9)'; g.fillRect(16,34,W-32,H-48);
    g.fillStyle='rgba(120,180,255,.28)';
    g.fillRect(30,48,60,34); g.fillRect(100,60,50,40); g.fillRect(160,44,56,30); g.fillRect(60,104,80,44); g.fillRect(150,96,60,36);
    g.fillStyle='#c61111'; g.beginPath(); g.arc(64,70,4,0,7); g.fill();
    g.fillStyle='#132ed2'; g.beginPath(); g.arc(128,86,4,0,7); g.fill(); }
  else if(L==='cams'){ for(let i=0;i<4;i++){ const x=20+(i%2)*108,y=36+Math.floor(i/2)*60;
      g.fillStyle='rgba(180,200,230,.14)'; g.fillRect(x,y,100,52);
      g.strokeStyle='rgba(255,255,255,.25)'; g.strokeRect(x,y,100,52);
      g.fillStyle='#9fb4dd'; g.font='bold 8px monospace'; g.fillText('CAM '+(i+1),x+4,y+10);
      for(let k=0;k<4;k++){ g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(x,y+12+k*10,100,2); } } }
  else if(L==='hand'){ g.fillStyle='rgba(255,90,60,.16)'; g.beginPath(); g.arc(W/2,104,52,0,7); g.fill();
    g.strokeStyle=st.hue; g.lineWidth=4; g.beginPath(); g.arc(W/2,104,52,0,7); g.stroke();
    g.fillStyle=st.hue; g.globalAlpha=.85;
    g.beginPath(); g.ellipse(W/2,116,26,30,0,0,7); g.fill();
    for(let i=0;i<4;i++){ rr(g,W/2-24+i*13,66,10,34,5); g.fill(); }
    rr(g,W/2-40,96,14,26,6); g.fill(); g.globalAlpha=1;
    g.fillStyle='#fff'; g.font='bold 11px monospace'; g.fillText('PLACE HAND',W/2-38,H-16); }
  else if(L==='keys'){ for(let i=0;i<10;i++){ const x=24+(i%5)*42,y=44+Math.floor(i/5)*52;
      g.fillStyle=i<3?st.hue:'rgba(255,255,255,.14)'; rr(g,x,y,34,42,6); g.fill();
      g.fillStyle='#04080f'; g.font='bold 14px monospace'; g.fillText(String(i+1),x+12,y+27); } }
  else if(L==='engine'){ g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(24,50,W-48,100);
    g.strokeStyle='rgba(255,255,255,.35)'; g.setLineDash([6,6]); g.beginPath(); g.moveTo(24,100); g.lineTo(W-24,100); g.stroke(); g.setLineDash([]);
    g.fillStyle=st.hue; rr(g,34,110,W-68,26,6); g.fill();
    g.fillStyle='#fff'; g.font='bold 10px monospace'; g.fillText('ALIGN OUTPUT',W/2-40,H-16); }
  else if(L==='fuel'){ g.fillStyle='rgba(255,255,255,.1)'; rr(g,60,44,W-120,110,10); g.fill();
    g.fillStyle=st.hue; rr(g,66,100,W-132,48,8); g.fill();
    g.fillStyle='#04080f'; g.font='bold 12px monospace'; g.fillText('47%',W/2-14,130); }
  else if(L==='chute'){ g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(W/2-34,40,68,116);
    g.strokeStyle=st.hue; g.lineWidth=3; g.strokeRect(W/2-34,40,68,116);
    g.fillStyle='#8d7a5e'; for(let i=0;i<5;i++) g.fillRect(W/2-26,52+i*20,52,12);
    g.fillStyle=st.hue; g.font='bold 11px monospace'; g.fillText('▼ OPEN ▼',W/2-30,H-14); }
  else if(L==='filter'){ g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(24,44,W-48,104);
    for(let i=0;i<7;i++){ g.fillStyle='#6fa84a'; g.beginPath();
      g.ellipse(40+i*28,60+((i*37)%80),12,8,i,0,7); g.fill(); }
    g.strokeStyle=st.hue; g.lineWidth=3; g.strokeRect(24,44,W-48,104); }
  else if(L==='button'){ g.fillStyle='rgba(255,59,48,.2)'; g.beginPath(); g.arc(W/2,100,56,0,7); g.fill();
    g.fillStyle='#c51111'; g.beginPath(); g.arc(W/2,100,44,0,7); g.fill();
    g.fillStyle='#ff6b60'; g.beginPath(); g.arc(W/2,88,34,0,7); g.fill();
    g.fillStyle='#fff'; g.font='bold 11px monospace'; g.fillText('PRESS',W/2-18,H-14); }
  else if(L==='vent'){ g.fillStyle='rgba(255,255,255,.08)'; g.fillRect(28,48,W-56,96);
    for(let y=52;y<140;y+=12){ g.fillStyle='#4b5666'; g.fillRect(32,y,W-64,7); }
    g.fillStyle='#8d7a5e'; g.beginPath(); g.ellipse(W/2-30,120,20,12,.4,0,7); g.fill(); }
  else { for(let i=0;i<4;i++) bar(20,44+i*28,W-40,16,0.3+Math.random()*0.6); }
  // scanlines + glass
  g.globalAlpha=.14; g.fillStyle='#000';
  for(let y=0;y<H;y+=3) g.fillRect(0,y,W,1);
  g.globalAlpha=1;
  const gl=g.createLinearGradient(0,0,W*0.7,H);
  gl.addColorStop(0,'rgba(255,255,255,.10)'); gl.addColorStop(.4,'rgba(255,255,255,0)');
  g.fillStyle=gl; g.fillRect(0,0,W,H);
  const t=mkTex(c); TEX.cache[key]=t; return t;
}
/* glowing room sign */
function texSign(text,accentCss){
  const key='sign_'+text;
  if(TEX.cache[key]) return TEX.cache[key];
  const W=512,H=128,c=cnv(W,H),g=c.getContext('2d');
  g.fillStyle='rgba(8,12,20,.92)'; rr(g,4,18,W-8,H-40,14); g.fill();
  g.strokeStyle=accentCss||'#8fb4dd'; g.lineWidth=4; rr(g,4,18,W-8,H-40,14); g.stroke();
  g.fillStyle='rgba(255,255,255,.06)'; rr(g,10,24,W-20,30,10); g.fill();
  g.font='900 54px "Baloo 2", "Trebuchet MS", sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.shadowColor=accentCss||'#8fb4dd'; g.shadowBlur=26;
  g.fillStyle='#ffffff'; g.fillText(text.toUpperCase(),W/2,H/2-2);
  g.shadowBlur=0; g.textAlign='left';
  const t=mkTex(c); TEX.cache[key]=t; return t;
}
/* hull / roof plating */
function texHull(){
  const S=256,c=cnv(S,S),g=c.getContext('2d');
  g.fillStyle='#39414f'; g.fillRect(0,0,S,S);
  for(let i=0;i<4;i++){ g.strokeStyle='rgba(0,0,0,.45)'; g.lineWidth=3;
    g.beginPath(); g.moveTo(0,i*64+2); g.lineTo(S,i*64+2); g.stroke(); }
  g.strokeStyle='rgba(255,255,255,.06)'; g.lineWidth=1;
  for(let i=0;i<4;i++){ g.beginPath(); g.moveTo(0,i*64+5); g.lineTo(S,i*64+5); g.stroke(); }
  hashNoise(g,S,S,5,.5);
  for(let i=0;i<10;i++){ g.fillStyle='rgba(120,90,60,'+(0.03+Math.random()*0.05)+')';
    g.beginPath(); g.ellipse(Math.random()*S,Math.random()*S,10+Math.random()*40,6+Math.random()*20,Math.random()*3,0,7); g.fill(); }
  return mkTex(c);
}
/* planet surface bands */
function texPlanet(){
  const W=512,H=256,c=cnv(W,H),g=c.getContext('2d');
  const base=g.createLinearGradient(0,0,0,H);
  base.addColorStop(0,'#2b4a7a'); base.addColorStop(.35,'#3f6ea8'); base.addColorStop(.6,'#7fa8c9'); base.addColorStop(1,'#cfe0ea');
  g.fillStyle=base; g.fillRect(0,0,W,H);
  for(let i=0;i<60;i++){
    g.fillStyle='rgba(255,255,255,'+(0.02+Math.random()*0.07)+')';
    const y=Math.random()*H,h=4+Math.random()*22;
    g.beginPath(); g.ellipse(Math.random()*W,y,60+Math.random()*220,h,0,0,7); g.fill();
  }
  for(let i=0;i<26;i++){
    g.fillStyle='rgba(20,40,70,'+(0.04+Math.random()*0.1)+')';
    g.beginPath(); g.ellipse(Math.random()*W,Math.random()*H,20+Math.random()*90,8+Math.random()*30,0,0,7); g.fill();
  }
  hashNoise(g,W,H,3,.3);
  return mkTex(c);
}

/* ---------- geometry helpers (custom box with world-scaled UVs) ---------- */
function panelBox(w,h,d,tile){
  tile=tile||2;
  const hw=w/2,hh=h/2,hd=d/2;
  const faces=[
    {n:[1,0,0], v:[[hw,-hh,-hd],[hw,-hh,hd],[hw,hh,hd],[hw,hh,-hd]], uv:[d,h]},
    {n:[-1,0,0],v:[[-hw,-hh,hd],[-hw,-hh,-hd],[-hw,hh,-hd],[-hw,hh,hd]], uv:[d,h]},
    {n:[0,1,0], v:[[-hw,hh,-hd],[-hw,hh,hd],[hw,hh,hd],[hw,hh,-hd]],   uv:[w,d]},
    {n:[0,-1,0],v:[[-hw,-hh,hd],[-hw,-hh,-hd],[hw,-hh,-hd],[hw,-hh,hd]],uv:[w,d]},
    {n:[0,0,1], v:[[-hw,-hh,hd],[hw,-hh,hd],[hw,hh,hd],[-hw,hh,hd]],   uv:[w,h]},
    {n:[0,0,-1],v:[[hw,-hh,-hd],[-hw,-hh,-hd],[-hw,hh,-hd],[hw,hh,-hd]],uv:[w,h]},
  ];
  const pos=[],nor=[],uv=[];
  for(const f of faces){
    const su=f.uv[0]/tile, sv=f.uv[1]/tile;
    const q=[f.v[0],f.v[1],f.v[2],f.v[0],f.v[2],f.v[3]];
    const uvs=[[0,0],[su,0],[su,sv],[0,0],[su,sv],[0,sv]];
    for(let i=0;i<6;i++){ pos.push(q[i][0],q[i][1],q[i][2]); nor.push(f.n[0],f.n[1],f.n[2]); uv.push(uvs[i][0],uvs[i][1]); }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return g;
}
function planeGeo(w,h,tile){
  tile=tile||1;
  const g=new THREE.BufferGeometry();
  const hw=w/2,hh=h/2, su=w/tile, sv=h/tile;
  g.setAttribute('position',new THREE.Float32BufferAttribute([-hw,-hh,0,hw,-hh,0,hw,hh,0,-hw,-hh,0,hw,hh,0,-hw,hh,0],3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,su,0,su,sv,0,0,su,sv,0,sv],2));
  return g;
}
function setColor(geo,hex){
  const c=new THREE.Color(hex), n=geo.attributes.position.count, arr=new Float32Array(n*3);
  for(let i=0;i<n;i++){ arr[i*3]=c.r; arr[i*3+1]=c.g; arr[i*3+2]=c.b; }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(arr,3));
  return geo;
}
function tintGeo(geo,hex,amount){
  const c=new THREE.Color(hex), n=geo.attributes.position.count;
  const arr=geo.attributes.color?geo.attributes.color.array:new Float32Array(n*3).fill(1);
  for(let i=0;i<n;i++){
    arr[i*3]=lerp(arr[i*3],c.r,amount); arr[i*3+1]=lerp(arr[i*3+1],c.g,amount); arr[i*3+2]=lerp(arr[i*3+2],c.b,amount);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(arr,3));
  return geo;
}
function xform(geo,m){ geo.applyMatrix4(m); return geo; }
function mergeGeos(list){
  const geos=[]; let total=0;
  for(const g of list){ const n=g.index?g.toNonIndexed():g; geos.push(n); total+=n.attributes.position.count; }
  const pos=new Float32Array(total*3),nor=new Float32Array(total*3),uv=new Float32Array(total*2),col=new Float32Array(total*3);
  let o=0;
  for(const g of geos){
    const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv,c=g.attributes.color,cnt=p.count;
    // a source attribute with the wrong vertex count would read undefined -> NaN into the
    // merged buffer and the batch disappears on real GPUs, so validate and sanitise instead
    const uOk=!!u&&u.count===cnt, cOk=!!c&&c.count===cnt, nOk=!!n&&n.count===cnt;
    if(u&&!uOk) console.error('[ship] geometry uv count mismatch: '+u.count+' vs '+cnt);
    if(c&&!cOk) console.error('[ship] geometry color count mismatch: '+c.count+' vs '+cnt);
    if(n&&!nOk) console.error('[ship] geometry normal count mismatch: '+n.count+' vs '+cnt);
    for(let i=0;i<cnt;i++){
      const k=(o+i)*3, k2=(o+i)*2;
      pos[k]=p.getX(i); pos[k+1]=p.getY(i); pos[k+2]=p.getZ(i);
      if(nOk){ nor[k]=n.getX(i); nor[k+1]=n.getY(i); nor[k+2]=n.getZ(i); }
      if(uOk){ uv[k2]=u.getX(i); uv[k2+1]=u.getY(i); }
      if(cOk){ col[k]=c.getX(i); col[k+1]=c.getY(i); col[k+2]=c.getZ(i); } else { col[k]=col[k+1]=col[k+2]=1; }
    }
    o+=cnt;
  }
  for(const g of list) if(g.dispose) g.dispose();
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  out.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  out.computeBoundingSphere();
  return out;
}
function polyShape(poly){
  const s=new THREE.Shape();
  s.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) s.lineTo(poly[i][0],poly[i][1]);
  s.closePath();
  return s;
}
/* floor geometry from a polygon, with world-scaled UVs, laid on XZ */
function polyFloor(poly,y,tile){
  const shape=polyShape(poly);
  const g=new THREE.ShapeGeometry(shape,1);
  // ShapeGeometry is in XY with uv = raw coords; rotate to XZ
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position, uv=[];
  for(let i=0;i<p.count;i++) uv.push(p.getX(i)/tile,-p.getZ(i)/tile);
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(y) g.translate(0,y,0);
  const n=g.index?g.toNonIndexed():g;
  return n;
}

/* ============================================================================
   Renderer / scene / post-processing
   ========================================================================== */
const RENDER={
  renderer:null,scene:null,camera:null,clock:null,post:null,maxAniso:4,
  quality:'high',w:1,h:1,envRT:null,
};
const VS_QUAD='varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';

function initRenderer(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,stencil:false,powerPreference:'high-performance'});
  RENDER.renderer=renderer;
  RENDER.isWebGL2=!!renderer.capabilities.isWebGL2;
  RENDER.maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  renderer.outputColorSpace=THREE.LinearSRGBColorSpace; // we tone-map + encode in our own composite
  renderer.toneMapping=THREE.NoToneMapping;
  renderer.shadowMap.enabled=false;
  renderer.autoClear=true;
  renderer.setClearColor(0x02040a,1);
  // a shader that fails to compile renders as nothing and only logs deep inside three.js, so
  // surface it: the diagnostics panel shows it and the watchdog can react to it.
  RENDER.shaderErrors=[];
  if(renderer.debug&&'onShaderError' in renderer.debug){
    renderer.debug.onShaderError=(gl,program,vLog,fLog)=>{
      const msg=String((fLog&&String(fLog).trim())||(vLog&&String(vLog).trim())||'unknown shader error').slice(0,900);
      RENDER.shaderErrors.push(msg);
      console.error('[render] shader compile failed:\n'+msg);
    };
  }

  const scene=new THREE.Scene();
  RENDER.scene=scene;
  scene.fog=new THREE.FogExp2(0x05080f,0.016);
  const camera=new THREE.PerspectiveCamera(78,1,0.06,5200);
  camera.position.set(0,1.5,6);
  RENDER.camera=camera;
  RENDER.clock=new THREE.Clock();
  return renderer;
}

/* --- post processing chain (bright -> blur x2 mips -> composite) --- */
class Post{
  constructor(renderer){
    this.r=renderer;
    this.quadScene=new THREE.Scene();
    this.quadCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),null);
    this.quad.frustumCulled=false;
    this.quadScene.add(this.quad);
    const mk=(w,h,samples)=>{
      const rt=new THREE.WebGLRenderTarget(Math.max(2,w|0),Math.max(2,h|0),{
        minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
        type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,
      });
      if(samples&&renderer.capabilities.isWebGL2) rt.samples=samples;
      rt.texture.generateMipmaps=false;
      return rt;
    };
    this.mk=mk;
    // 8-bit probe targets: cheap read-back so the game can tell whether it is actually
    // drawing something instead of silently showing a black viewport.
    this.mkByte=(w,h)=>{
      const rt=new THREE.WebGLRenderTarget(w,h,{
        minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
        type:THREE.UnsignedByteType,depthBuffer:false,stencilBuffer:false,
      });
      rt.texture.generateMipmaps=false;
      return rt;
    };
    this.probeScene=this.mkByte(8,8);
    this.probeFinal=this.mkByte(8,8);
    this.bufA=new Uint8Array(8*8*4);
    this.bufB=new Uint8Array(8*8*4);
    this.brightMat=new THREE.ShaderMaterial({
      uniforms:{tDiffuse:{value:null},threshold:{value:0.72},knee:{value:0.35}},
      vertexShader:VS_QUAD,
      fragmentShader:`uniform sampler2D tDiffuse;uniform float threshold;uniform float knee;varying vec2 vUv;
        void main(){vec4 c=texture2D(tDiffuse,vUv);float l=max(c.r,max(c.g,c.b));
        float s=clamp((l-threshold+knee)/(2.0*knee+0.0001),0.0,1.0);
        gl_FragColor=vec4(c.rgb*s*s,1.0);}`,
      depthTest:false,depthWrite:false,
    });
    this.blurMat=new THREE.ShaderMaterial({
      uniforms:{tDiffuse:{value:null},dir:{value:new THREE.Vector2(1,0)},texel:{value:new THREE.Vector2()}},
      vertexShader:VS_QUAD,
      fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 dir;uniform vec2 texel;varying vec2 vUv;
        void main(){float w0=0.227027,w1=0.1945946,w2=0.1216216,w3=0.054054,w4=0.016216;
        vec3 s=texture2D(tDiffuse,vUv).rgb*w0;
        vec2 o1=dir*texel*1.5,o2=dir*texel*3.0,o3=dir*texel*4.5,o4=dir*texel*6.2;
        s+=(texture2D(tDiffuse,vUv+o1).rgb+texture2D(tDiffuse,vUv-o1).rgb)*w1;
        s+=(texture2D(tDiffuse,vUv+o2).rgb+texture2D(tDiffuse,vUv-o2).rgb)*w2;
        s+=(texture2D(tDiffuse,vUv+o3).rgb+texture2D(tDiffuse,vUv-o3).rgb)*w3;
        s+=(texture2D(tDiffuse,vUv+o4).rgb+texture2D(tDiffuse,vUv-o4).rgb)*w4;
        gl_FragColor=vec4(s,1.0);}`,
      depthTest:false,depthWrite:false,
    });
    this.compMat=new THREE.ShaderMaterial({
      uniforms:{
        tScene:{value:null},tBloomA:{value:null},tBloomB:{value:null},
        res:{value:new THREE.Vector2()},time:{value:0},bloom:{value:0.85},
        vig:{value:0.62},grain:{value:0.045},aberr:{value:0.0016},
        flash:{value:0},tint:{value:new THREE.Vector3(1,1,1)},dark:{value:0},sat:{value:1.06},
        exposure:{value:1.22},scan:{value:0},
      },
      vertexShader:VS_QUAD,
      fragmentShader:`
        uniform sampler2D tScene,tBloomA,tBloomB;uniform vec2 res;uniform float time,bloom,vig,grain,aberr,flash,dark,sat,exposure,scan;
        uniform vec3 tint;varying vec2 vUv;
        vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
        vec3 toSRGB(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0001)),vec3(0.41666))-0.055,step(vec3(0.0031308),c));}
        void main(){
          vec2 uv=vUv;vec2 d=uv-0.5;float r2=dot(d,d);
          float ab=aberr*(0.35+r2*2.4);
          vec3 col;
          col.r=texture2D(tScene,uv+d*ab).r;
          col.g=texture2D(tScene,uv).g;
          col.b=texture2D(tScene,uv-d*ab).b;
          vec3 bl=texture2D(tBloomA,uv).rgb+texture2D(tBloomB,uv).rgb*0.7;
          col+=bl*bloom;
          col*=exposure;
          col=aces(col);
          float l=dot(col,vec3(0.2126,0.7152,0.0722));
          col=mix(vec3(l),col,sat);
          col*=tint;
          col*=1.0-vig*smoothstep(0.12,0.92,r2*1.75);
          col*=(1.0-dark);
          if(scan>0.001){ col*=1.0-scan*(0.35+0.65*step(0.5,fract(uv.y*res.y*0.5))); }
          float n=fract(sin(dot(uv*res+vec2(time*57.3,time*31.7),vec2(12.9898,78.233)))*43758.5453);
          col+=(n-0.5)*grain;
          col+=flash;
          gl_FragColor=vec4(toSRGB(max(col,vec3(0.0))),1.0);
        }`,
      depthTest:false,depthWrite:false,
    });
    this.resize(1,1);
  }
  setSize(w,h,pixelRatio){
    this.w=w; this.h=h;
    const samples=RENDER.quality==='high'?(RENDER.isWebGL2?4:0):(RENDER.quality==='medium'?(RENDER.isWebGL2?2:0):0);
    if(this.rtScene){ this.rtScene.dispose(); this.rtA.dispose(); this.rtB.dispose(); this.rtC.dispose(); this.rtD.dispose(); }
    this.rtScene=this.mk(w*pixelRatio,h*pixelRatio,samples);
    this.rtA=this.mk(w*pixelRatio/2,h*pixelRatio/2,0);
    this.rtB=this.mk(w*pixelRatio/2,h*pixelRatio/2,0);
    this.rtC=this.mk(w*pixelRatio/4,h*pixelRatio/4,0);
    this.rtD=this.mk(w*pixelRatio/4,h*pixelRatio/4,0);
    this.compMat.uniforms.res.value.set(w*pixelRatio,h*pixelRatio);
  }
  resize(w,h){ this.setSize(w,h,RENDER.pixelRatio||1); }
  pass(mat,target){ this.quad.material=mat; this.r.setRenderTarget(target||null); this.r.render(this.quadScene,this.quadCam); }
  render(scene,camera){
    const u=this.compMat.uniforms;
    this.r.setRenderTarget(this.rtScene);
    this.r.clear();
    this.r.render(scene,camera);
    if(RENDER.bloomOn){
      this.brightMat.uniforms.tDiffuse.value=this.rtScene.texture;
      this.pass(this.brightMat,this.rtA);
      const t1=this.rtA.texture.image?{w:this.rtA.width,h:this.rtA.height}:{w:this.rtA.width,h:this.rtA.height};
      this.blurMat.uniforms.tDiffuse.value=this.rtA.texture;
      this.blurMat.uniforms.texel.value.set(1/this.rtA.width,1/this.rtA.height);
      this.blurMat.uniforms.dir.value.set(1,0); this.pass(this.blurMat,this.rtB);
      this.blurMat.uniforms.tDiffuse.value=this.rtB.texture;
      this.blurMat.uniforms.dir.value.set(0,1); this.pass(this.blurMat,this.rtA);
      // second mip
      this.brightMat.uniforms.tDiffuse.value=this.rtA.texture;
      this.pass(this.brightMat,this.rtC);
      this.blurMat.uniforms.tDiffuse.value=this.rtC.texture;
      this.blurMat.uniforms.texel.value.set(1/this.rtC.width,1/this.rtC.height);
      this.blurMat.uniforms.dir.value.set(1,0); this.pass(this.blurMat,this.rtD);
      this.blurMat.uniforms.tDiffuse.value=this.rtD.texture;
      this.blurMat.uniforms.dir.value.set(0,1); this.pass(this.blurMat,this.rtC);
      u.tBloomA.value=this.rtA.texture; u.tBloomB.value=this.rtC.texture;
      u.bloom.value=RENDER.quality==='low'?0.55:0.9;
    } else { u.bloom.value=0.0; }
    u.tScene.value=this.rtScene.texture;
    u.time.value=performance.now()/1000;
    this.pass(this.compMat,null);
    this.r.setRenderTarget(null);
  }
  /* Down-sample the raw scene pass and the final composite into 8-bit targets and read them
     back, so we can measure what the player is actually seeing. Returns null when read-back is
     unavailable (headless stubs, exotic drivers). */
  measure(){
    if(!this.rtScene||typeof this.r.readRenderTargetPixels!=='function') return null;
    const gl=this.r.getContext&&this.r.getContext();
    if(!gl||typeof gl.readPixels!=='function') return null;
    const bu=this.blurMat.uniforms;
    const keep={td:bu.tDiffuse.value,tex:bu.texel.value.clone(),dir:bu.dir.value.clone()};
    try{
      bu.tDiffuse.value=this.rtScene.texture;
      bu.texel.value.set(0,0); bu.dir.value.set(0,0);   // blur with zero offsets == a plain copy
      this.pass(this.blurMat,this.probeScene);
      this.pass(this.compMat,this.probeFinal);
      this.r.readRenderTargetPixels(this.probeScene,0,0,8,8,this.bufA);
      this.r.readRenderTargetPixels(this.probeFinal,0,0,8,8,this.bufB);
    }catch(e){
      return null;
    }finally{
      bu.tDiffuse.value=keep.td; bu.texel.value.copy(keep.tex); bu.dir.value.copy(keep.dir);
      this.r.setRenderTarget(null);
    }
    const lum=(a)=>{
      let sum=0,mx=0;
      for(let i=0;i<a.length;i+=4){
        const v=0.2126*a[i]+0.7152*a[i+1]+0.0722*a[i+2];
        sum+=v; if(v>mx) mx=v;
      }
      const n=a.length/4;
      return {mean:+(sum/n/255).toFixed(4),max:+(mx/255).toFixed(4)};
    };
    return {scene:lum(this.bufA),final:lum(this.bufB)};
  }
}

/* Safe mode skips the post chain and lets three tone-map + encode straight to the canvas.
   Used by the diagnostics panel and by the black-frame watchdog. */
function setSafeMode(on){
  const r=RENDER.renderer; if(!r) return;
  RENDER.safeMode=!!on;
  if(RENDER.safeMode){
    r.outputColorSpace=THREE.SRGBColorSpace;
    r.toneMapping=THREE.ACESFilmicToneMapping;
    r.toneMappingExposure=1.3;
  }else{
    r.outputColorSpace=THREE.LinearSRGBColorSpace; // our composite tone-maps + encodes
    r.toneMapping=THREE.NoToneMapping;
  }
  try{ if(RENDER.scene&&r.compile) r.compile(RENDER.scene,RENDER.camera); }catch(e){}
}

/* ---------- studio environment for reflections ---------- */
function buildEnvMap(renderer){
  const pmrem=new THREE.PMREMGenerator(renderer);
  const s=new THREE.Scene();
  const geo=new THREE.SphereGeometry(20,16,12);
  const m=new THREE.MeshBasicMaterial({color:0x0b1220,side:THREE.BackSide});
  s.add(new THREE.Mesh(geo,m));
  function panel(col,x,y,z,w,h,intensity){
    const g=new THREE.PlaneGeometry(w,h);
    const mm=new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(intensity),side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(g,mm);
    mesh.position.set(x,y,z); mesh.lookAt(0,0,0); s.add(mesh);
  }
  panel(0xffffff,0,14,0,16,16,2.4);
  panel(0x88bbff,-14,4,6,10,8,1.1);
  panel(0xff9a6a,14,3,-6,9,7,0.85);
  panel(0x38fedc,0,2,-16,14,5,0.5);
  panel(0x223044,0,-12,0,20,20,0.35);
  const rt=pmrem.fromScene(s,0.03);
  pmrem.dispose();
  s.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
  return rt.texture;
}

/* ---------- space: stars, nebula, planet, sun ---------- */
function buildSpace(scene){
  const grp=new THREE.Group(); grp.name='space';
  // nebula skybox
  const skyMat=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{time:{value:0}},
    vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vP;uniform float time;
      float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
      float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        float a=mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                    mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);
        return a;}
      float fbm(vec3 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*n3(p);p*=2.05;a*=0.5;}return s;}
      void main(){
        vec3 d=normalize(vP);
        float f=fbm(d*2.6+vec3(0.0,time*0.004,0.0));
        float f2=fbm(d*5.2+vec3(11.3,0.0,4.7));
        vec3 c=vec3(0.012,0.018,0.042);
        c+=vec3(0.20,0.10,0.42)*pow(max(f-0.42,0.0),1.5)*1.5;
        c+=vec3(0.05,0.22,0.42)*pow(max(f2-0.52,0.0),1.7)*1.4;
        c+=vec3(0.34,0.10,0.16)*pow(max(fbm(d*1.6+vec3(3.1,7.7,2.2))-0.55,0.0),1.6)*1.2;
        float band=pow(max(1.0-abs(d.y*1.25),0.0),3.0);
        c+=vec3(0.05,0.07,0.14)*band;
        gl_FragColor=vec4(c,1.0);
      }`,
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(2600,32,24),skyMat);
  sky.frustumCulled=false; grp.add(sky);
  // stars
  const N=5200, pos=new Float32Array(N*3), col=new Float32Array(N*3), siz=new Float32Array(N);
  const palette=[[1,1,1],[0.72,0.82,1],[1,0.9,0.76],[0.86,0.92,1],[1,0.78,0.72],[0.78,1,0.96]];
  for(let i=0;i<N;i++){
    const u=Math.random()*2-1, th=Math.random()*TAU, r=1500+Math.random()*900;
    const s=Math.sqrt(1-u*u);
    pos[i*3]=Math.cos(th)*s*r; pos[i*3+1]=u*r*0.8; pos[i*3+2]=Math.sin(th)*s*r;
    const c=palette[(Math.random()*palette.length)|0], b=0.35+Math.pow(Math.random(),2.2)*0.9;
    col[i*3]=c[0]*b; col[i*3+1]=c[1]*b; col[i*3+2]=c[2]*b;
    siz[i]=(Math.random()<0.06?5.5:2.2)*(0.6+Math.random()*0.9);
  }
  const sg=new THREE.BufferGeometry();
  sg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  sg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  sg.setAttribute('asize',new THREE.Float32BufferAttribute(siz,1));
  const starMat=new THREE.ShaderMaterial({
    uniforms:{time:{value:0},map:{value:RENDER.tex.star},px:{value:1}},
    vertexShader:`attribute float asize;varying vec3 vC;varying float vT;uniform float time,px;
      void main(){vC=color;vT=0.72+0.28*sin(time*1.7+asize*22.0+position.x*0.01);
      vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
      gl_PointSize=asize*px;}`,
    fragmentShader:`uniform sampler2D map;varying vec3 vC;varying float vT;
      void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC*vT*1.6,t.a);}`,
    transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,fog:false,
  });
  const stars=new THREE.Points(sg,starMat); stars.frustumCulled=false; grp.add(stars);
  // sun
  const sunMat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,
    uniforms:{c:{value:new THREE.Color(0xfff2d0)}},
    vertexShader:`varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 vU;uniform vec3 c;void main(){
      float d=distance(vU,vec2(0.5));float core=smoothstep(0.5,0.0,d);
      float g=pow(max(core,0.0),3.0);float halo=pow(max(core,0.0),12.0);
      gl_FragColor=vec4(c*(g*0.55+halo*3.2),g*0.5+halo);}`,
  });
  const sun=new THREE.Mesh(new THREE.PlaneGeometry(900,900),sunMat);
  sun.position.set(-1500,560,-2200); grp.add(sun);
  RENDER.sun=sun;
  // distant planet
  const pg=new THREE.SphereGeometry(300,48,36);
  const pm=new THREE.MeshStandardMaterial({map:RENDER.tex.planet,roughness:0.95,metalness:0,fog:false});
  const planet=new THREE.Mesh(pg,pm);
  planet.position.set(1250,-420,-1900); grp.add(planet);
  const atmo=new THREE.Mesh(new THREE.SphereGeometry(318,48,36),new THREE.ShaderMaterial({
    transparent:true,side:THREE.BackSide,depthWrite:false,fog:false,blending:THREE.AdditiveBlending,
    uniforms:{c:{value:new THREE.Color(0x63b4ff)}},
    vertexShader:`varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);
      vec4 mv=modelViewMatrix*vec4(position,1.0);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vN;varying vec3 vV;uniform vec3 c;void main(){
      float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.6);gl_FragColor=vec4(c*f*1.5,f*0.85);}`,
  }));
  atmo.position.copy(planet.position); grp.add(atmo);
  RENDER.planet=planet; RENDER.atmo=atmo; RENDER.skyMat=skyMat; RENDER.starMat=starMat;
  scene.add(grp);
  return grp;
}
