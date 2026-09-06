/* ---------------------------------------------------------------- renderer */
const canvas      = document.getElementById('game');
const renderer    = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.Fog(0x05070b, 60, 150);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.1, 400);

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------ lighting */
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x0a141c, 0.55);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x40586b, 0.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.05);
sun.position.set(40, 70, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
const sc = 120;
sun.shadow.camera.left=-sc; sun.shadow.camera.right=sc;
sun.shadow.camera.top=sc; sun.shadow.camera.bottom=-sc;
sun.shadow.bias = -0.0004;
scene.add(sun);

/* ------------------------------------------------------------ textures (procedural, no external assets) */
function makeCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function texFromCanvas(c, repX=1, repY=1){
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repX,repY);
  t.anisotropy=renderer.capabilities.getMaxAnisotropy();
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function floorTex(){
  const c=makeCanvas(128,128), g=c.getContext('2d');
  g.fillStyle='#8fa0ad'; g.fillRect(0,0,128,128);
  for(let i=0;i<900;i++){ g.fillStyle=`rgba(${randi(120,160)},${randi(130,170)},${randi(140,180)},.25)`; g.fillRect(randi(0,128),randi(0,128),1.6,1.6); }
  // grid seams
  g.strokeStyle='rgba(60,80,95,.5)'; g.lineWidth=2; g.strokeRect(1,1,126,126);
  // corner rivets
  g.fillStyle='rgba(50,70,85,.8)';
  [[8,8],[120,8],[8,120],[120,120]].forEach(p=>{ g.beginPath(); g.arc(p[0],p[1],3.4,0,7); g.fill(); });
  return texFromCanvas(c, 1,1);
}
function wallTex(base='#39424e', line='#232a33'){
  const c=makeCanvas(128,128), g=c.getContext('2d');
  g.fillStyle=base; g.fillRect(0,0,128,128);
  g.fillStyle='rgba(255,255,255,.03)';
  for(let i=0;i<60;i++) g.fillRect(randi(0,128),randi(0,128),randi(2,5),randi(2,5));
  g.fillStyle=line; g.fillRect(0,0,128,6); g.fillRect(0,0,6,128);
  g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(6,6,116,3);
  return texFromCanvas(c, 1,1);
}
function ventTex(){
  const c=makeCanvas(96,96), g=c.getContext('2d');
  g.fillStyle='#2a323b'; g.fillRect(0,0,96,96);
  g.strokeStyle='#0c1116'; g.lineWidth=4; g.strokeRect(4,4,88,88);
  g.fillStyle='#0e1419';
  for(let i=0;i<5;i++) g.fillRect(16,16+i*14,64,7);
  g.fillStyle='rgba(255,255,255,.08)';
  for(let i=0;i<5;i++) g.fillRect(16,15+i*14,64,2);
  return texFromCanvas(c,1,1);
}
function taskPanelTex(color='#7fd0ff'){
  const c=makeCanvas(64,64), g=c.getContext('2d');
  g.fillStyle='#101a22'; g.fillRect(0,0,64,64);
  g.strokeStyle='#2b3c48'; g.lineWidth=3; g.strokeRect(4,4,56,56);
  g.fillStyle=color;
  g.fillRect(10,10,44,26); g.fillRect(10,42,44,10);
  g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(10,10,44,8);
  return texFromCanvas(c,1,1);
}

const TEX = {
  floor: floorTex(),
  wallA: wallTex('#3a4553','#242c36'),
  wallB: wallTex('#44505e','#2a333d'),
  wallC: wallTex('#323b47','#1f262e'),
  vent: ventTex(),
};

/* materials (shared, cached) */
const MAT = {};
function mat(color, opts={}){
  const key = color+'|'+(opts.rough??0.7)+'|'+(opts.emissive||0)+'|'+(opts.emissiveIntensity||0);
  if(MAT[key]) return MAT[key];
  const m = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough??0.65, metalness: opts.metal??0.05,
    flatShading: !!opts.flat,
  });
  if(opts.emissive){ m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity??1; }
  if(opts.map) m.map = opts.map;
  MAT[key]=m; return m;
}

/* ------------------------------------------------------------ Crewmate factory
   A bean-shaped crewmate: body capsule, visor, backpack, two legs, arm stubs.  */
const CREW_SCALE = 0.92;
function buildCrewmate(hex){
  const g = new THREE.Group();
  const col = new THREE.Color(hex);
  const bodyMat = new THREE.MeshStandardMaterial({color:col, roughness:0.6, metalness:0.02});
  const visorMat = new THREE.MeshStandardMaterial({color:0x9fd8ff, roughness:0.12, metalness:0.35,
    emissive:0x1c5b80, emissiveIntensity:0.5});
  const darkMat = new THREE.MeshStandardMaterial({color:0x2a323b, roughness:0.5});
  const shadowMat = darkMat;

  // torso (capsule)
  const torsoGeo = new THREE.CapsuleGeometry(0.42, 0.58, 6, 16);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.y = 0.72; torso.castShadow = true; torso.name='body';
  g.add(torso);

  // head merging with torso: add a top sphere for the rounded crown
  const headGeo = new THREE.SphereGeometry(0.42, 18, 16);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.12; head.scale.set(1,0.9,1); head.castShadow=true;
  g.add(head);

  // visor (flattened sphere on the front, -Z forward)
  const visorGeo = new THREE.SphereGeometry(0.16, 20, 16);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0,1.12,-0.34); visor.scale.set(2.0,1.05,0.85);
  g.add(visor);

  // backpack
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.5,0.26), bodyMat);
  pack.position.set(0,1.02,0.44); pack.rotation.x=-0.08; pack.castShadow=true;
  g.add(pack);

  // legs
  const legGeo = new THREE.BoxGeometry(0.17,0.32,0.2);
  const legs=[];
  const makeLeg=(x)=>{ const l=new THREE.Mesh(legGeo, darkMat); l.position.set(x,0.16,0); l.castShadow=true; return l; };
  const legL=makeLeg(-0.19), legR=makeLeg(0.19);
  legs.push(legL,legR); g.add(legL,legR);

  // arm nubs
  const armGeo = new THREE.SphereGeometry(0.13,12,10);
  const armL=new THREE.Mesh(armGeo,bodyMat); armL.position.set(-0.44,0.9,0); armL.scale.set(1.1,0.9,1.1);
  const armR=new THREE.Mesh(armGeo,bodyMat); armR.position.set(0.44,0.9,0); armR.scale.set(1.1,0.9,1.1);
  g.add(armL,armR);

  // name tag sprite
  const nameEl = document.createElement('canvas'); nameEl.width=256; nameEl.height=64;
  const nameCtx = nameEl.getContext('2d');
  const nameTex = new THREE.CanvasTexture(nameEl);
  const nameMat = new THREE.SpriteMaterial({map:nameTex, transparent:true, depthWrite:false});
  const nameSpr = new THREE.Sprite(nameMat);
  nameSpr.scale.set(1.6,0.4,1); nameSpr.position.y=1.95; nameSpr.renderOrder=10;
  nameSpr.userData.update = (text, colHex)=>{
    nameCtx.clearRect(0,0,256,64);
    nameCtx.font='900 34px "Trebuchet MS",Arial,sans-serif';
    nameCtx.textAlign='center'; nameCtx.textBaseline='middle';
    nameCtx.lineWidth=6; nameCtx.strokeStyle='rgba(0,0,0,0.75)';
    nameCtx.strokeText(text,128,32);
    nameCtx.fillStyle='#'+new THREE.Color(colHex).getHexString().padStart(6,'0');
    nameCtx.fillText(text,128,32);
    nameTex.needsUpdate=true;
  };
  g.add(nameSpr);

  g.userData = {
    body:g, legs, visor, visorMat, bodyMat, torso, head, nameSpr,
    updateName(text, col){ nameSpr.userData.update(text, col); },
  };
  g.scale.set(CREW_SCALE,CREW_SCALE,CREW_SCALE);
  return g;
}

/* ghost crewmate (translucent, floating) */
function buildGhost(hex){
  const g = buildCrewmate(hex);
  g.traverse(o=>{ if(o.isMesh){ o.material = o.material.clone(); o.material.transparent=true; o.material.opacity=0.32; o.material.depthWrite=false; if(o.material.map) o.material.map=null; } });
  return g;
}

/* ------------------------------------------------------------ simple lit cube helper */
function box(w,h,d, m, x,y,z){
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m);
  b.position.set(x,y,z);
  return b;
}
