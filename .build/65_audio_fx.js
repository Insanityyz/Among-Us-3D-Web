/* ============================================================================
   5. Audio (100% procedural — no external assets) + particle FX
   ========================================================================== */
const AUDIO={
  ctx:null,master:null,sfx:null,music:null,ready:false,amb:null,
  init(){
    if(this.ctx) return;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain(); this.master.gain.value=G.client.masterVol;
    this.master.connect(this.ctx.destination);
    this.sfx=this.ctx.createGain(); this.sfx.gain.value=G.client.sfxVol; this.sfx.connect(this.master);
    this.music=this.ctx.createGain(); this.music.gain.value=G.client.musicVol; this.music.connect(this.master);
    this.ready=true;
    this.startAmbience();
  },
  resume(){ if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume(); },
  setVolumes(){
    if(!this.ready) return;
    this.master.gain.value=G.client.masterVol;
    this.sfx.gain.value=G.client.sfxVol;
    this.music.gain.value=G.client.musicVol;
  },
  now(){ return this.ctx.currentTime; },
  tone(freq,dur,type,vol,slideTo,delay,dest){
    if(!this.ready) return;
    const t=this.now()+(delay||0);
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type||'sine'; o.frequency.setValueAtTime(freq,t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),t+dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol===undefined?0.2:vol),t+Math.min(0.02,dur*0.3));
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(dest||this.sfx);
    o.start(t); o.stop(t+dur+0.05);
    return {o,g};
  },
  noise(dur,vol,filterType,f0,f1,q,delay,dest){
    if(!this.ready) return;
    const t=this.now()+(delay||0);
    const len=Math.max(1,Math.floor(this.ctx.sampleRate*dur));
    const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    const src=this.ctx.createBufferSource(); src.buffer=buf;
    const f=this.ctx.createBiquadFilter(); f.type=filterType||'lowpass';
    f.frequency.setValueAtTime(f0||900,t);
    if(f1) f.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+dur);
    f.Q.value=q||1;
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(vol===undefined?0.25:vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(f); f.connect(g); g.connect(dest||this.sfx);
    src.start(t); src.stop(t+dur+0.02);
  },
  pan(node,amount){
    if(!this.ready||!node) return node;
    try{ const p=this.ctx.createStereoPanner(); p.pan.value=clamp(amount,-1,1); node.connect(p); return p; }
    catch(e){ return node; }
  },
  /* --- named cues --- */
  blip(f,d,type,v){ this.tone(f||660,d||0.06,type||'sine',v===undefined?0.12:v); },
  click(){ this.tone(880,0.035,'square',0.05); this.noise(0.03,0.05,'highpass',2200); },
  hover(){ this.tone(1320,0.02,'sine',0.025); },
  use(){ this.tone(520,0.07,'triangle',0.09); this.tone(780,0.06,'triangle',0.05,undefined,0.04); },
  deny(){ this.tone(180,0.16,'square',0.1,120); },
  step(power){
    if(!this.ready) return;
    const v=0.045+0.05*(power||1);
    this.noise(0.075,v,'bandpass',320+Math.random()*160,180,1.4);
    this.tone(90+Math.random()*20,0.05,'sine',v*0.5,60);
  },
  taskStage(){ this.tone(720,0.09,'triangle',0.11); this.tone(1080,0.11,'triangle',0.08,undefined,0.07); },
  taskDone(){
    [660,880,1320].forEach((f,i)=>this.tone(f,0.16,'triangle',0.11,undefined,i*0.075));
    this.noise(0.25,0.05,'highpass',3000,6000,1);
  },
  kill(){
    this.noise(0.34,0.42,'lowpass',1500,180,1.2);
    this.tone(150,0.4,'sawtooth',0.24,42);
    this.tone(76,0.55,'sine',0.3,38,0.02);
    this.noise(0.12,0.2,'highpass',2600,1200,1,0.01);
  },
  report(){
    for(let i=0;i<2;i++){ this.tone(1180,0.1,'square',0.13,undefined,i*0.14); this.tone(1560,0.09,'square',0.07,undefined,i*0.14+0.02); }
  },
  meeting(){
    // alarm siren
    for(let i=0;i<3;i++){
      this.tone(420,0.5,'sawtooth',0.13,900,i*0.52);
      this.tone(210,0.5,'square',0.07,450,i*0.52);
    }
    this.noise(1.5,0.05,'bandpass',700,1400,2);
  },
  vent(){
    this.noise(0.3,0.3,'bandpass',400,2600,3);
    this.tone(140,0.2,'square',0.09,70);
    this.noise(0.22,0.16,'highpass',1800,600,1,0.1);
  },
  door(shut){
    this.noise(0.24,0.22,'lowpass',900,200,1);
    this.tone(shut?110:150,0.2,'square',0.09,shut?70:110);
  },
  sabotage(type){
    const base=type==='reactor'?180:type==='o2'?220:160;
    for(let i=0;i<4;i++){
      this.tone(base,0.22,'sawtooth',0.11,base*1.5,i*0.26);
      this.tone(base*2,0.2,'square',0.05,base*2.6,i*0.26);
    }
    this.noise(1.0,0.06,'bandpass',500,900,3);
  },
  eject(){
    this.noise(1.5,0.2,'bandpass',300,2600,1.2);
    [520,440,370,290,220].forEach((f,i)=>this.tone(f,0.5,'triangle',0.09,undefined,i*0.22));
  },
  win(crew){
    const seq=crew?[523,659,784,1046]:[440,415,392,311,262];
    seq.forEach((f,i)=>{ this.tone(f,0.42,'triangle',0.13,undefined,i*0.15); this.tone(f/2,0.5,'sine',0.09,undefined,i*0.15); });
    this.noise(0.6,0.04,'highpass',4000,2000,1,0.1);
  },
  tick(){ this.tone(1500,0.03,'square',0.05); },
  sabFixed(){ [880,1170].forEach((f,i)=>this.tone(f,0.14,'triangle',0.1,undefined,i*0.09)); },
  vote(){ this.tone(600,0.05,'square',0.07); this.tone(900,0.05,'square',0.05,undefined,0.05); },
  startAmbience(){
    if(!this.ready||this.amb) return;
    const ctx=this.ctx;
    const g=ctx.createGain(); g.gain.value=0.0; g.connect(this.music);
    // deep ship drone
    const o1=ctx.createOscillator(),o2=ctx.createOscillator(),o3=ctx.createOscillator();
    o1.type='sawtooth'; o1.frequency.value=42;
    o2.type='sine'; o2.frequency.value=63.5;
    o3.type='triangle'; o3.frequency.value=84.7;
    const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=180; f.Q.value=3;
    const lfo=ctx.createOscillator(),lg=ctx.createGain();
    lfo.frequency.value=0.06; lg.gain.value=40; lfo.connect(lg); lg.connect(f.frequency);
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g);
    o1.start(); o2.start(); o3.start(); lfo.start();
    // air hiss
    const len=ctx.sampleRate*2, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*0.4;
    const ns=ctx.createBufferSource(); ns.buffer=buf; ns.loop=true;
    const nf=ctx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=1400; nf.Q.value=0.6;
    const ng=ctx.createGain(); ng.gain.value=0.12;
    ns.connect(nf); nf.connect(ng); ng.connect(g); ns.start();
    g.gain.linearRampToValueAtTime(0.16,ctx.currentTime+3);
    this.amb={g,nodes:[o1,o2,o3,lfo,ns]};
  },
  ambienceLevel(v){
    if(!this.amb) return;
    this.amb.g.gain.setTargetAtTime(v,this.ctx.currentTime,0.6);
  },
};
AUDIO_SAB=(type)=>{ AUDIO.sabotage(type); };

/* ---------- particle FX ---------- */
const FX={
  max:900, points:null, geo:null, mat:null,
  data:null, cursor:0, timers:[],
  init(scene){
    const N=this.max;
    this.data=new Array(N);
    for(let i=0;i<N;i++) this.data[i]={life:0,max:1,x:0,y:-99,z:0,vx:0,vy:0,vz:0,size:1,r:1,g:1,b:1,grav:0,drag:0.98,add:true};
    const pos=new Float32Array(N*3),col=new Float32Array(N*3),siz=new Float32Array(N);
    this.geo=new THREE.BufferGeometry();
    this.geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    this.geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    this.geo.setAttribute('asize',new THREE.Float32BufferAttribute(siz,1));
    this.mat=new THREE.ShaderMaterial({
      uniforms:{map:{value:RENDER.tex.glow},px:{value:1}},
      vertexShader:`attribute float asize;varying vec3 vC;uniform float px;
        void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mv;gl_PointSize=asize*px*(260.0/max(0.001,-mv.z));}`,
      fragmentShader:`uniform sampler2D map;varying vec3 vC;
        void main(){vec4 t=texture2D(map,gl_PointCoord);if(t.a<0.02)discard;gl_FragColor=vec4(vC*t.a*1.6,t.a);}`,
      transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,fog:false,
    });
    this.points=new THREE.Points(this.geo,this.mat);
    this.points.frustumCulled=false;
    scene.add(this.points);
  },
  spawn(n,opt){
    for(let i=0;i<n;i++){
      const p=this.data[this.cursor]; this.cursor=(this.cursor+1)%this.max;
      const s=opt.spread||0.4;
      p.x=opt.x+(Math.random()-0.5)*s; p.y=opt.y+(Math.random()-0.5)*s*0.6; p.z=opt.z+(Math.random()-0.5)*s;
      const sp=opt.speed||1.4, ang=Math.random()*TAU, up=opt.up===undefined?1.1:opt.up;
      p.vx=Math.cos(ang)*sp*(0.3+Math.random()); p.vz=Math.sin(ang)*sp*(0.3+Math.random());
      p.vy=(opt.vy!==undefined?opt.vy:(Math.random()*up))+ (opt.dirY||0);
      p.max=p.life=(opt.life||0.7)*(0.6+Math.random()*0.8);
      p.size=(opt.size||0.09)*(0.6+Math.random()*0.9);
      const c=new THREE.Color(opt.color===undefined?0xffffff:opt.color);
      const v=0.75+Math.random()*0.5;
      p.r=c.r*v; p.g=c.g*v; p.b=c.b*v;
      p.grav=opt.grav===undefined?-3.2:opt.grav; p.drag=opt.drag===undefined?0.965:opt.drag;
      if(opt.vel){ p.vx=opt.vel.x*(0.6+Math.random()*0.8); p.vy=opt.vel.y; p.vz=opt.vel.z*(0.6+Math.random()*0.8); }
    }
  },
  burst(x,y,z,color,n,opt){ this.spawn(n||18,Object.assign({x,y,z,color},opt||{})); },
  timer(t,fn){ this.timers.push({t,left:t,fn,done:false}); },
  update(dt){
    const pos=this.geo.attributes.position.array, col=this.geo.attributes.color.array, siz=this.geo.attributes.asize.array;
    for(let i=0;i<this.max;i++){
      const p=this.data[i];
      if(p.life<=0){ siz[i]=0; pos[i*3+1]=-999; continue; }
      p.life-=dt;
      p.vy+=p.grav*dt;
      p.vx*=p.drag; p.vz*=p.drag;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
      if(p.y<0.02&&p.grav<0){ p.y=0.02; p.vy*=-0.28; p.vx*=0.7; p.vz*=0.7; }
      const f=Math.max(0,p.life/p.max);
      pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
      col[i*3]=p.r*f; col[i*3+1]=p.g*f; col[i*3+2]=p.b*f;
      siz[i]=p.size*(0.35+f*0.9);
    }
    this.geo.attributes.position.needsUpdate=true;
    this.geo.attributes.color.needsUpdate=true;
    this.geo.attributes.asize.needsUpdate=true;
    this.mat.uniforms.px.value=RENDER.pixelRatio||1;
    for(let i=this.timers.length-1;i>=0;i--){
      const t=this.timers[i]; t.left-=dt;
      if(t.fn) t.fn(dt,1-Math.max(0,t.left)/t.t);
      if(t.left<=0) this.timers.splice(i,1);
    }
  },
};

/* ---------- scripted visual-task / event FX ---------- */
const VISUAL={
  scanTarget:null, scanT:0, shieldT:0, turretT:0, reactorPulse:0,
  scanStart(){ this.scanT=10.5; const st=SHIP.stations.find(s=>s.kind==='scan'); this.scanStation=st; },
  scanStop(){ this.scanT=0; },
  shieldsUp(){ this.shieldT=3.2; },
  turretFire(){
    this.turretT=0.12;
    if(SHIP.turretMuzzle){
      const p=new THREE.Vector3(); SHIP.turretMuzzle.getWorldPosition(p);
      FX.burst(p.x,p.y,p.z,0xffb03c,7,{life:0.25,size:0.1,speed:2.4,grav:-1});
    }
    AUDIO.tone(180,0.07,'square',0.05,90);
  },
  trash(x,z,y){
    for(let i=0;i<26;i++) FX.spawn(1,{x:x+(Math.random()-0.5)*0.6,y:y||1.2,z:z+(Math.random()-0.5)*0.6,
      color:[0x8d7a5e,0x6d7f6a,0xcfd8dc,0xa8915a][i%4],life:2.4,size:0.13,speed:1.1,up:0.4,grav:-4.4,drag:0.995});
  },
  ventPuff(x,z){ FX.burst(x,0.16,z,0x9fe8c0,16,{life:0.5,size:0.1,speed:1.5,grav:0.6,up:0.8}); },
  blood(x,z){ FX.burst(x,0.5,z,0xb01018,26,{life:0.9,size:0.11,speed:2.6,grav:-6,up:1.6}); },
  killFx(x,z,yaw){
    this.blood(x,z);
    CLIENT.shake=Math.min(1.4,CLIENT.shake+1.0);
    UI.damageFlash(0.85);
    POST_FLASH(0.35,0xff2a18);
  },
  emergency(){ this.emergT=2.0; },
  update(dt){
    if(this.scanT>0){
      this.scanT-=dt;
      const st=this.scanStation;
      if(st&&st.group&&st.group.userData.beam){
        const beam=st.group.userData.beam;
        beam.material.opacity=0.24+0.14*Math.sin(G.time*9);
        beam.position.y=0.25+((10.5-this.scanT)%2.0)/2.0*1.5;
        beam.visible=true;
        if(st.group.userData.ring) st.group.userData.ring.material.color.setHSL(0.36,0.9,0.55+0.2*Math.sin(G.time*8));
      }
      if(this.scanT<=0&&st&&st.group&&st.group.userData.beam){ st.group.userData.beam.visible=false; st.group.userData.beam.material.opacity=0; }
    }
    if(this.shieldT>0){
      this.shieldT-=dt;
      if(!this.shieldMesh){
        const g=new THREE.IcosahedronGeometry(1,1);
        const m=new THREE.MeshBasicMaterial({color:0x9d7bff,transparent:true,opacity:0.16,wireframe:true,toneMapped:false,fog:false,blending:THREE.AdditiveBlending,depthWrite:false});
        this.shieldMesh=new THREE.Mesh(g,m); RENDER.scene.add(this.shieldMesh);
      }
      this.shieldMesh.visible=true;
      this.shieldMesh.position.set(18.5,3.2,4.5);
      this.shieldMesh.scale.setScalar(6.4+Math.sin(G.time*3)*0.25);
      this.shieldMesh.rotation.y+=dt*0.6; this.shieldMesh.rotation.x+=dt*0.2;
      this.shieldMesh.material.opacity=0.05+0.2*Math.max(0,this.shieldT/3.2);
      if(this.shieldT<=0) this.shieldMesh.visible=false;
    }
    if(this.turretT>0){ this.turretT-=dt; if(SHIP.turretMuzzle) SHIP.turretMuzzle.scale.setScalar(1+this.turretT*8); }
    else if(SHIP.turretMuzzle&&SHIP.turretMuzzle.scale.x!==1) SHIP.turretMuzzle.scale.setScalar(1);
    if(this.emergT>0){
      this.emergT-=dt;
      const st=SHIP.stations.find(s=>s.kind==='emergency');
      if(st&&st.group.userData.halo){
        st.group.userData.halo.material.opacity=0.18+0.4*Math.abs(Math.sin(this.emergT*9));
        st.group.userData.halo.scale.setScalar(1+0.12*Math.sin(this.emergT*9));
      }
    }
    // reactor core pulse
    if(SHIP.reactorCore){
      const sab=G.server&&G.server.state.sab&&G.server.state.sab.type==='reactor';
      const target=sab?0xff2a18:0xff6a3c;
      SHIP.reactorCore.material.color.lerp(new THREE.Color(target),dt*3);
      SHIP.reactorCore.material.opacity=0.42+0.16*Math.sin(G.time*(sab?11:2.2));
    }
    if(SHIP.engineGlow) for(const m of SHIP.engineGlow) m.material.opacity=(m.geometry.parameters.radius>2.5?0.24:0.85)+0.08*Math.sin(G.time*3+m.id);
  },
};
let _flashT=0;
function POST_FLASH(amount,colorHex){ _flashT=Math.max(_flashT,amount); if(colorHex!==undefined) _flashCol.set(colorHex); }
function updatePostFlash(dt,u){
  _flashT=Math.max(0,_flashT-dt*2.2);
  u.flash.value=_flashT*0.5;
  u.tint.value.set(lerp(1,_flashCol.r,_flashT),lerp(1,_flashCol.g,_flashT),lerp(1,_flashCol.b,_flashT));
}
