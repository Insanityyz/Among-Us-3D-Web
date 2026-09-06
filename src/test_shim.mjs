import { readFileSync } from 'fs';
// ---- generic 3D vector ----
class Vec3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  clone(){return new Vec3(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  applyMatrix4(){return this;} lerp(){return this;} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
}
class Euler{constructor(){this.x=0;this.y=0;this.z=0;this.order='XYZ';}
  set(x,y,z,o){this.x=x;this.y=y;this.z=z;if(o)this.order=o;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}}
class Node3D{constructor(){this.children=[];this.userData={};this.position=new Vec3();this.rotation=new Euler();this.scale=new Vec3(1,1,1);
  this.castShadow=false;this.receiveShadow=false;this.renderOrder=0;this.name='';this.parent=null;this.material=null;this.geometry=null;}
  add(...o){o.forEach(c=>{c.parent=this;this.children.push(c);});return this;}
  remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1);return this;}
  traverse(cb){cb(this);this.children.forEach(c=>c.traverse&&c.traverse(cb));}
  getObjectByName(){return null;} clone(){return new Node3D();} updateMatrixWorld(){} updateProjectionMatrix(){}
  lookAt(){} matrixWorld={}; }
class Group extends Node3D{}
class Mesh extends Node3D{constructor(g,m){super();this.geometry=g;this.material=m;this.isMesh=true;}}
class Sprite extends Node3D{constructor(m){super();this.material=m;this.isMesh=true;}}
class Scene extends Node3D{constructor(){super();this.background=null;this.fog=null;}}
class Camera extends Node3D{constructor(){super();this.aspect=1;this.fov=1;this.near=0.1;this.far=100;}
  updateMatrixWorld(){} updateProjectionMatrix(){} lookAt(){} }
class Color{constructor(c){this.r=1;this.g=1;this.b=1;this.set(c);}
  set(c){if(c!=null){if(typeof c==='string'){this._hex=c;}else{this._hex=c;}}return this;}
  clone(){return new Color(this._hex);} getHexString(){return 'c51111';} toArray(){return [1,1,1];} }
function FakeAttr(n,items=3){return {count:n,itemSize:items,array:new Float32Array(n*items),getX:i=>i,setX(){},setXYZ(){},needsUpdate:false};}
class Geometry{constructor(){this.attributes={position:FakeAttr(24,3),normal:FakeAttr(24,3),uv:FakeAttr(24,2)};this.index={count:36,getX:i=>i%24};}
  clone(){return new Geometry();} applyMatrix4(){return this;} setAttribute(k,v){this.attributes[k]=v;return this;}
  setIndex(i){this.index={count:(i&&i.count)||24,getX:j=>j%24};return this;}
  toNonIndexed(){return new Geometry();}
  scale(){return this;} translate(){return this;} rotateX(){return this;} rotateY(){return this;} rotateZ(){return this;}
  computeVertexNormals(){return this;} dispose(){} }
class BufferAttribute{constructor(a,n){this.array=a;this.itemSize=n;this.count=a.length;}}
class BufferGeometry{constructor(){this.attributes={position:FakeAttr(24),normal:FakeAttr(24),uv:FakeAttr(24)};this.index={count:36,getX:i=>i%24};}
  setAttribute(k,v){this.attributes[k]=v;return this;} setIndex(i){this.index=i;return this;} }
class Material{constructor(o={}){Object.assign(this,o);this.color=new Color(o.color);if(o.emissive)this.emissive=new Color(o.emissive);this.map=o.map||null;this.opacity=o.opacity!=null?o.opacity:1;this.emissiveIntensity=o.emissiveIntensity||1;this.transparent=!!o.transparent;this.depthWrite=o.depthWrite!==false;this.flatShading=!!o.flatShading;}
  clone(){return new Material(this);} }
class Light extends Node3D{constructor(){super();this.shadow={mapSize:{set(){}},camera:{}};}}
class Texture{constructor(){this.repeat={set(){}};this.wrapS=0;this.wrapT=0;this.anisotropy=1;this.colorSpace='';this.needsUpdate=false;}
  clone(){return new Texture();} }
class Raycaster{constructor(){}setFromCamera(){}intersectObjects(){return [];}}
const THREE={
  Group,Mesh,Sprite,Scene,Color,Vector3:Vec3,PerspectiveCamera:Camera,Raycaster,
  CanvasTexture:Texture,Texture,
  BufferGeometry,BufferAttribute,
  MeshStandardMaterial:class extends Material{},MeshBasicMaterial:class extends Material{},
  SpriteMaterial:class extends Material{},
  HemisphereLight:Light,AmbientLight:Light,DirectionalLight:Light,
  BoxGeometry:Geometry,PlaneGeometry:Geometry,SphereGeometry:Geometry,CapsuleGeometry:Geometry,
  CylinderGeometry:Geometry,RingGeometry:Geometry,
  Fog:class{constructor(){} },
  WebGLRenderer:class{constructor(o){this.domElement=(o&&o.canvas)||newEl('canvas');this.domElement.addEventListener=()=>{};this.domElement.requestPointerLock=()=>{};this.shadowMap={enabled:false};this.capabilities={getMaxAnisotropy:()=>1};this.outputColorSpace='';this.toneMapping=0;this.toneMappingExposure=1;this.viewport=this.setViewport=this.scissor=this.setScissor=this.setScissorTest=()=>{};}
    setSize(){ } setPixelRatio(){} render(){} },
  SRGBColorSpace:'srgb',ACESFilmicToneMapping:1,PCFSoftShadowMap:1,RepeatWrapping:1000,DoubleSide:2,
  Plane:class{}, Matrix4:class{},
  PCFShadowMap:1,
};
// ---- DOM ----
const ctxStub=new Proxy({}, {get:(t,prop)=>{
  if(prop==='canvas')return null;
  return (...args)=>{ if(prop==='createLinearGradient')return {addColorStop(){}}; if(prop==='getImageData')return {data:[]}; if(prop==='measureText')return {width:10}; return undefined; };
}, set:()=>true});
function newEl(tag){
  if(tag==='canvas'){
    const c={width:128,height:128,clientWidth:128,clientHeight:128,getContext:()=>ctxStub,toDataURL:()=>'data:',style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(){},removeEventListener(){},off:0};
    return c;
  }
  const e={
    tagName:(tag||'div').toUpperCase(),children:[],dataset:{},parentNode:null,
    style:{cssText:'',display:'',opacity:'',left:'',top:'',transform:'',backgroundColor:'',position:'',cursor:'',width:'',height:''},
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x));},remove(...c){c.forEach(x=>this._s.delete(x));},toggle(c,f){if(f===undefined)f=!this._s.has(c);f?this._s.add(c):this._s.delete(c);return f;},contains(c){return this._s.has(c);}},
    className:'',
    _innerHTML:'',textContent:'',
    value:'',checked:false,id:tag,clientWidth:0,clientHeight:380,offsetWidth:0,offsetHeight:0,
    addEventListener(){},removeEventListener(){},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},removeAttribute(k){delete this[k];},
    remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children.splice(i,1);}},
    focus(){},blur(){},reset(){},
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};},
    querySelector(){return newEl('div');},
    querySelectorAll(){return [];},
    appendChild(c){c.parentNode=this;this.children.push(c);return c;},
    insertBefore(c,ref){c.parentNode=this;this.children.push(c);return c;},
    click(){},
  };
  Object.defineProperty(e,'innerHTML',{get(){return this._innerHTML;},set(v){this._innerHTML=v;this.children=[];}});
  return e;
}
const elMap={};
function getEl(id){ if(!elMap[id]) elMap[id]=newEl(id); return elMap[id]; }
function qs(sel){ 
  if(sel[0]==='#') return getEl(sel.slice(1));
  if(sel==='.voteAvatars') return getEl('vv');
  if(sel==='.cdRing') return getEl('cdRing');
  if(sel==='#meetingCard .pname') return getEl('pname');
  if(sel==='.rolecard') return getEl('rolecard');
  if(sel==='.rolecard .big') return getEl('roleBig');
  if(sel==='.rolecard .roleD') return getEl('roleD');
  if(sel==='.rolecard .btn') return getEl('roleBtn');
  if(sel==='.rooms') return getEl('rooms');
  if(sel==='.pnts') return getEl('pnts');
  if(sel==='.mmClose') return getEl('mmClose');
  return newEl('div');
}
function qsa(sel){ return []; }
const document={
  getElementById:getEl,
  querySelector:qs,
  querySelectorAll:qsa,
  createElement:newEl,
  body:newEl('body'),
  addEventListener(){},removeEventListener(){},
  pointerLockElement:null,
  exitPointerLock(){},
  activeElement:newEl('input'),
};
const win={
  addEventListener(){},removeEventListener(){},
  innerWidth:1280,innerHeight:800,devicePixelRatio:1,
  matchMedia:()=>({matches:false}),
  localStorage:{getItem:()=>'0',setItem(){},},
  requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  AudioContext:undefined,webkitAudioContext:undefined,
  location:{reload(){}},
};
global.window=win; global.document=document; global.THREE=THREE;
global.requestAnimationFrame=win.requestAnimationFrame; global.cancelAnimationFrame=win.cancelAnimationFrame;
global.performance={now:()=>Date.now()/1000};
Object.defineProperty(global,'navigator',{value:{maxTouchPoints:0},configurable:true});
global.location=win.location;
global.localStorage=win.localStorage;
if(!global.Element) global.Element=function(){};
if(!global.HTMLElement) global.HTMLElement=newEl('div');

// ------- load game source -------
const src = ['mapdata.js','game_1.js','game_2.js','game_3.js','game_4.js','game_5.js','game_6.js']
  .map(f=>readFileSync('src/'+f,'utf8')).join('\n');
const test = `
;globalThis.__RESULT = (function(){
  try{
    const g=Game;
    g.settings.playerCount=6; g.settings.impostors=1; g.settings.taskCount=4;
    buildMap(scene);
    startGame();
    const local=g.local;
    const crew=g.players.filter(p=>!p.isImpostor);
    const r1={totalTasks:g.progress.totalTasks, localTasks:local.tasks.length, crewPlayers:crew.length, impPlayers:g.players.filter(p=>p.isImpostor).length};
    // simulate movement + interaction
    for(let i=0;i<3;i++){ updatePlayer(local, 1, 0, 0.016); updateInteraction(); }
    // run beginPlay + a few loop frames
    beginPlay();
    Game._cdStep && 0;
    // force to playing
    g.state='playing';
    for(let i=0;i<5;i++){ loop(); }
    // test sabotage
    startSabotage('lights');
    for(let i=0;i<3;i++) loop();
    clearSabotage();
    // test kill + ghost + body
    const imp=Game.players.find(p=>p.isImpostor);
    const crewTarget=Game.players.find(p=>!p.isImpostor && p!==local);
    imp.killCooldown=0;
    imp.x=crewTarget.x; imp.z=crewTarget.z;   // stand next to target
    killImpostor(imp, crewTarget);
    const kills={bodies:Game.bodies.length, ghost:crewTarget.isGhost, targetDead:crewTarget.isDead};
    // complete a task step via modal path
    const locTask=local.tasks[0]; const st0=locTask.steps[0];
    st0.done=true; markTaskStep(local, locTask);
    const after={doneTasks:Game.progress.doneTasks,totalTasks:Game.progress.totalTasks};
    // test vent usability (bot impostor standing at a vent network)
    const v=WORLD.vents[0];
    const ventTest={"netCount":WORLD.vents.filter(x=>x.net===v.net).length};
    // test a meeting
    startMeeting(null,'test');
    Meeting.cast(String(crew[1].id), local.id);
    Meeting.lockVotes();
    return {r1, kills, after, ventTest};
  }catch(e){ return {ERROR:e.message, stack:(e.stack||'').split('\\n').slice(0,6)}; }
})();
`;
const full = src + test;
try{ (0,eval)(full); }catch(e){ console.log('EVAL ERROR', e.message, e.stack.split('\n').slice(0,6)); process.exit(1); }
console.log(JSON.stringify(globalThis.__RESULT,null,2));
