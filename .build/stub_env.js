/* Offline smoke test: stubs THREE + DOM, runs boot() and a scripted match.
   Not part of the shipped build. */
const fs=require('fs'),path=require('path'),os=require('os');
const DIR=__dirname;
const PARTS=['30_logic.js','40_three.js','41_ship.js','50_player.js','60_server.js','65_audio_fx.js',
  '70_tasks.js','80_meeting.js','90_ui.js','95_game.js','99_main.js'];

/* ---------------------------------------------------------------- THREE stub */
let ids=0;
class V2{constructor(x=0,y=0){this.x=x;this.y=y;this.isVector2=true;}
  set(x,y){this.x=x;this.y=y;return this;} setScalar(s){return this.set(s,s);}
  copy(v){this.x=v.x;this.y=v.y;return this;} clone(){return new V2(this.x,this.y);}
  add(v){this.x+=v.x;this.y+=v.y;return this;} sub(v){this.x-=v.x;this.y-=v.y;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;return this;} length(){return Math.hypot(this.x,this.y);}
  normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);} setLength(l){return this.normalize().multiplyScalar(l);}}
class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;this.isVector3=true;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} setScalar(s){return this.set(s,s,s);}
  setX(x){this.x=x;return this;} setY(y){this.y=y;return this;} setZ(z){this.z=z;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} clone(){return new V3(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
  multiply(v){this.x*=v.x;this.y*=v.y;this.z*=v.z;return this;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  divideScalar(s){return this.multiplyScalar(1/(s||1));}
  length(){return Math.hypot(this.x,this.y,this.z);} lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);}
  setLength(l){return this.normalize().multiplyScalar(l);}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  cross(v){const x=this.y*v.z-this.z*v.y,y=this.z*v.x-this.x*v.z,z=this.x*v.y-this.y*v.x;return this.set(x,y,z);}
  lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;}
  min(v){this.x=Math.min(this.x,v.x);this.y=Math.min(this.y,v.y);this.z=Math.min(this.z,v.z);return this;}
  max(v){this.x=Math.max(this.x,v.x);this.y=Math.max(this.y,v.y);this.z=Math.max(this.z,v.z);return this;}
  clamp(a,b){return this.max(a).min(b);}
  applyMatrix4(m){const e=m.elements,x=this.x,y=this.y,z=this.z,w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]||1);
    this.x=(e[0]*x+e[4]*y+e[8]*z+e[12])*w;this.y=(e[1]*x+e[5]*y+e[9]*z+e[13])*w;this.z=(e[2]*x+e[6]*y+e[10]*z+e[14])*w;return this;}
  applyQuaternion(q){const x=this.x,y=this.y,z=this.z,qx=q.x,qy=q.y,qz=q.z,qw=q.w;
    const ix=qw*x+qy*z-qz*y,iy=qw*y+qz*x-qx*z,iz=qw*z+qx*y-qy*x,iw=-qx*x-qy*y-qz*z;
    return this.set(ix*qw+iw*-qx+iy*-qz-iz*-qy,iy*qw+iw*-qy+iz*-qx-ix*-qz,iz*qw+iw*-qz+ix*-qy-iy*-qx);}
  applyEuler(e){return this;}
  setFromMatrixPosition(m){const e=m.elements;return this.set(e[12],e[13],e[14]);}
  setFromSpherical(s){return this;}
  getWorldPosition(t){return t.copy(this);}
  toArray(a=[],o=0){a[o]=this.x;a[o+1]=this.y;a[o+2]=this.z;return a;}
  equals(v){return v.x===this.x&&v.y===this.y&&v.z===this.z;}}
class Euler{constructor(x=0,y=0,z=0,o='XYZ'){this.x=x;this.y=y;this.z=z;this.order=o;this.isEuler=true;}
  set(x,y,z,o){this.x=x;this.y=y;this.z=z;if(o)this.order=o;return this;}
  copy(e){this.x=e.x;this.y=e.y;this.z=e.z;this.order=e.order;return this;}
  clone(){return new Euler(this.x,this.y,this.z,this.order);}}
class Quat{constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;this.isQuaternion=true;}
  set(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;return this;}
  copy(q){return this.set(q.x,q.y,q.z,q.w);} clone(){return new Quat(this.x,this.y,this.z,this.w);}
  identity(){return this.set(0,0,0,1);}
  setFromAxisAngle(a,ang){const h=ang/2,s=Math.sin(h);return this.set(a.x*s,a.y*s,a.z*s,Math.cos(h));}
  setFromEuler(e){const c1=Math.cos(e.x/2),c2=Math.cos(e.y/2),c3=Math.cos(e.z/2),s1=Math.sin(e.x/2),s2=Math.sin(e.y/2),s3=Math.sin(e.z/2);
    return this.set(s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3);}
  setFromRotationMatrix(m){return this;}
  multiply(q){return this.multiplyQuaternions(this,q);}
  multiplyQuaternions(a,b){const qax=a.x,qay=a.y,qaz=a.z,qaw=a.w,qbx=b.x,qby=b.y,qbz=b.z,qbw=b.w;
    return this.set(qax*qbw+qaw*qbx+qay*qbz-qaz*qby,qay*qbw+qaw*qby+qaz*qbx-qax*qbz,
      qaz*qbw+qaw*qbz+qax*qby-qay*qbx,qaw*qbw-qax*qbx-qay*qby-qaz*qbz);}
  slerp(q,t){this.x+=(q.x-this.x)*t;this.y+=(q.y-this.y)*t;this.z+=(q.z-this.z)*t;this.w+=(q.w-this.w)*t;return this;}
  invert(){return this.conjugate();} conjugate(){this.x*=-1;this.y*=-1;this.z*=-1;return this;}}
class M4{constructor(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];this.isMatrix4=true;}
  identity(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];return this;}
  copy(m){this.elements=m.elements.slice();return this;} clone(){return new M4().copy(this);}
  set(...a){this.elements=a.slice();return this;}
  compose(p,q,s){const e=this.elements,x=q.x,y=q.y,z=q.z,w=q.w;
    const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
    const sx=s.x,sy=s.y,sz=s.z;
    e[0]=(1-(yy+zz))*sx;e[1]=(xy+wz)*sx;e[2]=(xz-wy)*sx;e[3]=0;
    e[4]=(xy-wz)*sy;e[5]=(1-(xx+zz))*sy;e[6]=(yz+wx)*sy;e[7]=0;
    e[8]=(xz+wy)*sz;e[9]=(yz-wx)*sz;e[10]=(1-(xx+yy))*sz;e[11]=0;
    e[12]=p.x;e[13]=p.y;e[14]=p.z;e[15]=1;return this;}
  makeTranslation(x,y,z){return this.identity().set(1,0,0,x,0,1,0,y,0,0,1,z,0,0,0,1);}
  makeScale(x,y,z){return this.set(x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1);}
  makeRotationX(t){const c=Math.cos(t),s=Math.sin(t);return this.set(1,0,0,0,0,c,-s,0,0,s,c,0,0,0,0,1);}
  makeRotationY(t){const c=Math.cos(t),s=Math.sin(t);return this.set(c,0,s,0,0,1,0,0,-s,0,c,0,0,0,0,1);}
  makeRotationZ(t){const c=Math.cos(t),s=Math.sin(t);return this.set(c,-s,0,0,s,c,0,0,0,0,1,0,0,0,0,1);}
  setPosition(x,y,z){const e=this.elements;if(x.isVector3){e[12]=x.x;e[13]=x.y;e[14]=x.z;}else{e[12]=x;e[13]=y;e[14]=z;}return this;}
  multiply(m){return this.multiplyMatrices(this,m);}
  premultiply(m){return this.multiplyMatrices(m,this);}
  multiplyMatrices(a,b){const ae=a.elements,be=b.elements,te=new Array(16);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=ae[k*4+i]*be[j*4+k];te[j*4+i]=s;}
    this.elements=te;return this;}
  invert(){return this;}
  lookAt(eye,target,up){return this;}
  decompose(p,q,s){p.copy(this.elements.length?new V3(this.elements[12],this.elements[13],this.elements[14]):new V3());return this;}}
class Color{constructor(c){this.isColor=true;this.r=1;this.g=1;this.b=1;if(c!==undefined)this.set(c);}
  set(c){
    if(c===undefined||c===null){this.r=this.g=this.b=1;return this;}
    if(c.isColor){this.r=c.r;this.g=c.g;this.b=c.b;return this;}
    if(typeof c==='number'){this.r=((c>>16)&255)/255;this.g=((c>>8)&255)/255;this.b=(c&255)/255;return this;}
    if(typeof c==='string'){
      let s=c.replace('#','');
      if(s.length===3)s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
      const n=parseInt(s,16)||0;return this.set(n);
    }
    if(Array.isArray(c)){this.r=c[0];this.g=c[1];this.b=c[2];}
    return this;}
  setHex(h){return this.set(h);} setRGB(r,g,b){this.r=r;this.g=g;this.b=b;return this;}
  setStyle(s){return this.set(s);} setHSL(h,s,l){
    const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
    const f=(t)=>{t=((t%1)+1)%1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    this.r=f(h+1/3);this.g=f(h);this.b=f(h-1/3);return this;}
  getHex(){return (Math.round(this.r*255)<<16)^(Math.round(this.g*255)<<8)^Math.round(this.b*255);}
  getHexString(){return this.getHex().toString(16).padStart(6,'0');}
  copy(c){return this.set(c);} clone(){return new Color().copy(this);}
  lerp(c,t){this.r+=(c.r-this.r)*t;this.g+=(c.g-this.g)*t;this.b+=(c.b-this.b)*t;return this;}
  multiplyScalar(s){this.r*=s;this.g*=s;this.b*=s;return this;}
  add(c){this.r+=c.r;this.g+=c.g;this.b+=c.b;return this;}
  offsetHSL(h,s,l){return this;} convertSRGBToLinear(){return this;} equals(c){return c.r===this.r&&c.g===this.g&&c.b===this.b;}}
class Attr{constructor(array,itemSize){
    this.array=array instanceof Float32Array?array:new Float32Array(array||[]);
    this.itemSize=itemSize||1;this.count=this.array.length/this.itemSize;this.needsUpdate=false;this.normalized=false;}
  getX(i){return this.array[i*this.itemSize];} getY(i){return this.array[i*this.itemSize+1]||0;} getZ(i){return this.array[i*this.itemSize+2]||0;}
  setX(i,v){this.array[i*this.itemSize]=v;return this;} setY(i,v){this.array[i*this.itemSize+1]=v;return this;} setZ(i,v){this.array[i*this.itemSize+2]=v;return this;}
  setXY(i,x,y){return this.setX(i,x).setY(i,y);} setXYZ(i,x,y,z){return this.setX(i,x).setY(i,y).setZ(i,z);}
  copy(src){this.array=new Float32Array(src.array);this.count=src.count;return this;}
  clone(){return new Attr(this.array.slice(),this.itemSize);} dispose(){}}
class BG{constructor(){this.attributes={};this.index=null;this.parameters={};this.groups=[];
    this.boundingSphere=null;this.boundingBox=null;this.uuid='geo'+(++ids);this.type='BufferGeometry';}
  setAttribute(n,a){this.attributes[n]=a;return this;} getAttribute(n){return this.attributes[n];}
  hasAttribute(n){return !!this.attributes[n];} deleteAttribute(n){delete this.attributes[n];return this;}
  setIndex(a){this.index=(a&&a.isBufferAttribute)?a:new Attr(a,1);return this;}
  translate(x,y,z){const p=this.attributes.position;if(p)for(let i=0;i<p.count;i++){p.array[i*3]+=x;p.array[i*3+1]+=y;p.array[i*3+2]+=z;}return this;}
  scale(x,y,z){const p=this.attributes.position;if(p)for(let i=0;i<p.count;i++){p.array[i*3]*=x;p.array[i*3+1]*=y;p.array[i*3+2]*=z;}return this;}
  rotateX(a){return this._rot('x',a);} rotateY(a){return this._rot('y',a);} rotateZ(a){return this._rot('z',a);}
  _rot(ax,a){const p=this.attributes.position,n=this.attributes.normal;if(!p)return this;
    const c=Math.cos(a),s=Math.sin(a);
    for(const at of [p,n]){ if(!at) continue;
      for(let i=0;i<at.count;i++){const x=at.array[i*3],y=at.array[i*3+1],z=at.array[i*3+2];
        if(ax==='x'){at.array[i*3+1]=y*c-z*s;at.array[i*3+2]=y*s+z*c;}
        else if(ax==='y'){at.array[i*3]=x*c+z*s;at.array[i*3+2]=-x*s+z*c;}
        else{at.array[i*3]=x*c-y*s;at.array[i*3+1]=x*s+y*c;}}}
    return this;}
  applyMatrix4(m){const p=this.attributes.position;if(p)for(let i=0;i<p.count;i++){
      const v=new V3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(m);p.setXYZ(i,v.x,v.y,v.z);} return this;}
  computeBoundingSphere(){this.boundingSphere={radius:1,center:new V3()};return this;}
  computeBoundingBox(){this.boundingBox={min:new V3(-1,-1,-1),max:new V3(1,1,1)};return this;}
  computeVertexNormals(){if(!this.attributes.normal)this.setAttribute('normal',new Attr(new Float32Array(this.attributes.position.array.length),3));return this;}
  toNonIndexed(){return this;} addGroup(a,b,c){this.groups.push({start:a,count:b,materialIndex:c});return this;}
  center(){return this;} dispose(){} clone(){return this;} copy(){return this;}}
function dummyGeo(params,px,py,pz){
  const g=new BG(); g.parameters=Object.assign({},params);
  const hx=(px||1)/2,hy=(py||1)/2,hz=(pz||1)/2;
  const v=[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],
           [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]];
  const pos=[],nor=[],uv=[];
  v.forEach((p,i)=>{pos.push(p[0],p[1],p[2]);nor.push(0,0,i<6?-1:1);uv.push((i%3)/2,Math.floor(i/3)/3);});
  g.setAttribute('position',new Attr(pos,3));g.setAttribute('normal',new Attr(nor,3));g.setAttribute('uv',new Attr(uv,2));
  g.computeBoundingSphere();
  return g;
}
function geoCtor(name,px,py,pz){
  return function(...args){ return dummyGeo(Object.assign({[name]:args},args&&typeof args[0]==='object'?{}:{radius:args[0]}),
    typeof args[0]==='number'?args[0]*2:px, typeof args[1]==='number'?args[1]:py, typeof args[2]==='number'?args[2]:pz); };
}
class O3{constructor(){this.id=++ids;this.uuid='o'+this.id;this.name='';this.type='Object3D';
    this.parent=null;this.children=[];this.position=new V3();this.rotation=new Euler();this.quaternion=new Quat();
    this.scale=new V3(1,1,1);this.up=new V3(0,1,0);this.userData={};this.visible=true;
    this.matrix=new M4();this.matrixWorld=new M4();this.matrixAutoUpdate=true;this.renderOrder=0;
    this.frustumCulled=true;this.castShadow=false;this.receiveShadow=false;this.layers={set(){},enable(){},test(){return true;}};}
  add(...o){for(const c of o){if(!c)continue;if(Array.isArray(c)){this.add(...c);continue;}c.parent=this;this.children.push(c);}return this;}
  remove(...o){for(const c of o){const i=this.children.indexOf(c);if(i>=0){this.children.splice(i,1);c.parent=null;}}return this;}
  removeFromParent(){if(this.parent)this.parent.remove(this);return this;}
  clear(){this.children.length=0;return this;}
  traverse(cb){cb(this);for(const c of this.children)c.traverse(cb);}
  traverseVisible(cb){if(!this.visible)return;cb(this);for(const c of this.children)c.traverseVisible(cb);}
  getObjectByName(n){let r=null;this.traverse(o=>{if(o.name===n&&!r)r=o;});return r;}
  lookAt(x,y,z){const t=x.isVector3?x:new V3(x,y,z);
    const dx=t.x-this.position.x,dz=t.z-this.position.z;
    this.rotation.y=Math.atan2(dx,dz);
    this.rotation.x=-Math.atan2(t.y-this.position.y,Math.hypot(dx,dz));return this;}
  rotateX(a){this.rotation.x+=a;return this;} rotateY(a){this.rotation.y+=a;return this;} rotateZ(a){this.rotation.z+=a;return this;}
  getWorldPosition(t){return t.copy(this.position);}
  getWorldDirection(t){return t.set(0,0,-1);}
  updateMatrix(){return this;} updateMatrixWorld(){return this;} updateWorldMatrix(){return this;}
  clone(){const c=new this.constructor();c.position.copy(this.position);c.rotation.copy(this.rotation);c.scale.copy(this.scale);c.visible=this.visible;return c;}
  copy(o){return this;}}
class Group extends O3{constructor(){super();this.type='Group';this.isGroup=true;}}
class Scene extends O3{constructor(){super();this.type='Scene';this.isScene=true;this.fog=null;this.background=null;this.environment=null;this.backgroundBlurriness=0;}}
class Mesh extends O3{constructor(g,m){super();this.type='Mesh';this.isMesh=true;this.geometry=g||new BG();this.material=m||{};}}
class Points extends O3{constructor(g,m){super();this.type='Points';this.isPoints=true;this.geometry=g||new BG();this.material=m||{};}}
class Sprite extends O3{constructor(m){super();this.type='Sprite';this.isSprite=true;this.material=m||{};this.center=new V2(.5,.5);}}
class Line extends O3{constructor(g,m){super();this.type='Line';this.isLine=true;this.geometry=g||new BG();this.material=m||{};}}
class Camera extends O3{constructor(){super();this.isCamera=true;this.fov=75;this.aspect=1;this.near=.1;this.far=2000;
    this.projectionMatrix=new M4();this.projectionMatrixInverse=new M4();this.matrixWorldInverse=new M4();this.zoom=1;
    this.left=-1;this.right=1;this.top=1;this.bottom=-1;this.filmOffset=0;}
  updateProjectionMatrix(){return this;}
  getWorldDirection(t){const y=this.rotation.y,x=this.rotation.x;return t.set(-Math.sin(y)*Math.cos(x),Math.sin(x),-Math.cos(y)*Math.cos(x)).normalize();}}
class PerspectiveCamera extends Camera{constructor(fov,aspect,near,far){super();this.type='PerspectiveCamera';this.fov=fov||75;this.aspect=aspect||1;this.near=near||.1;this.far=far||2000;this.isPerspectiveCamera=true;}}
class OrthographicCamera extends Camera{constructor(l,r,t,b,n,f){super();this.type='OrthographicCamera';this.left=l;this.right=r;this.top=t;this.bottom=b;this.near=n;this.far=f;this.isOrthographicCamera=true;}}
class Light extends O3{constructor(color,intensity){super();this.color=new Color(color===undefined?0xffffff:color);this.intensity=intensity===undefined?1:intensity;this.isLight=true;}}
class PointLight extends Light{constructor(c,i,d,dec){super(c,i);this.type='PointLight';this.distance=d||0;this.decay=dec===undefined?2:dec;}}
class SpotLight extends Light{constructor(c,i,d,a,p,dec){super(c,i);this.type='SpotLight';this.distance=d||0;this.angle=a||0;this.penumbra=p||0;this.decay=dec===undefined?2:dec;this.target=new O3();}}
class DirectionalLight extends Light{constructor(c,i){super(c,i);this.type='DirectionalLight';this.target=new O3();}}
class HemisphereLight extends Light{constructor(c,g,i){super(c,i);this.type='HemisphereLight';this.groundColor=new Color(g===undefined?0x222222:g);}}
class AmbientLight extends Light{constructor(c,i){super(c,i);this.type='AmbientLight';}}
/* permissive proxy factory for materials / textures / misc */
function permissive(base,label){
  const store=Object.assign({},base);
  const fn=function(){return permissive({},label+'()');};
  return new Proxy(fn,{
    get(t,k){
      if(k===Symbol.toPrimitive)return()=>0;
      if(k==='then'||k===Symbol.iterator||k===Symbol.asyncIterator)return undefined;
      if(k==='valueOf')return()=>0;
      if(k==='toString')return()=>label;
      if(k in store)return store[k];
      const v=permissive({},label+'.'+String(k));
      store[k]=v;return v;
    },
    set(t,k,v){store[k]=v;return true;},
    apply(t,a,args){return permissive({},label+'()');},
    construct(t,args){return permissive({},'new '+label);},
    has(t,k){return true;},
  });
}
function mat(label,params){
  const o=Object.assign({color:new Color(0xffffff),opacity:1,transparent:false,side:0,
    depthWrite:true,depthTest:true,toneMapped:true,fog:true,emissive:new Color(0),emissiveIntensity:1,
    visible:true,needsUpdate:false,uniforms:{},isMaterial:true,dispose(){},clone(){return this;},copy(){return this;}},params||{});
  ['color','emissive','groundColor','specular','attenuationColor'].forEach(k=>{
    if(k in o&&!(o[k]&&o[k].isColor)) o[k]=new Color(o[k]);
  });
  return permissive(o,label);
}
class Shape{constructor(){this.curves=[];}
  moveTo(){return this;} lineTo(){return this;} quadraticCurveTo(){return this;} bezierCurveTo(){return this;}
  absarc(){return this;} arc(){return this;} closePath(){return this;} splineThru(){return this;}
  getPoints(){return [];}}
class FogExp2{constructor(c,d){this.color=new Color(c);this.density=d||0;this.isFogExp2=true;}}
class Clock{constructor(){this.t=0;} getDelta(){this.t+=0.016;return 0.016;} getElapsedTime(){return this.t;} start(){} stop(){}}
const rendererStub=()=>permissive({
  capabilities:{isWebGL2:true,getMaxAnisotropy:()=>8,isWebGL1:false},
  info:{render:{calls:12,triangles:3400,frame:1},memory:{geometries:10,textures:5},autoReset:true,reset(){}},
  shadowMap:{enabled:false,type:0},outputColorSpace:'srgb',toneMapping:0,autoClear:true,
  localClippingEnabled:false,useLegacyLights:false,sortObjects:true,
  setPixelRatio(){},setSize(){},setClearColor(){},setRenderTarget(){},render(){},clear(){},clearDepth(){},
  getDrawingBufferSize(v){return v.set(1280,720);},getRenderTarget(){return null;},compile(){},dispose(){},
  getContext(){return {};},setScissor(){},setScissorTest(){},setViewport(){},
}, 'renderer');
class WebGLRenderTarget{constructor(w,h,o){this.width=w;this.height=h;this.options=o||{};
    this.texture=permissive({isTexture:true,colorSpace:'srgb',needsUpdate:false},'rtTex');
    this.samples=0;this.depthBuffer=true;this.stencilBuffer=false;this.scissorTest=false;}
  setSize(w,h){this.width=w;this.height=h;} dispose(){}}
class WebGLRenderer{constructor(p){return rendererStub();}}
class PMREMGenerator{constructor(){} fromScene(){return {texture:permissive({},'envTex')};} fromEquirectangular(){return {texture:permissive({},'envTex')};} dispose(){}}
class CanvasTexture{constructor(c){return permissive({image:c,isTexture:true,colorSpace:'srgb',needsUpdate:false,
    wrapping:1000,repeat:new V2(1,1),offset:new V2(),anisotropy:1,magFilter:1006,minFilter:1006,
    generateMipmaps:false,dispose(){},clone(){return this;}},'canvasTex');}}
class Texture{constructor(){return permissive({isTexture:true},'tex');}}
const MathUtils={degToRad:d=>d*Math.PI/180,radToDeg:r=>r*180/Math.PI,clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),
  lerp:(a,b,t)=>a+(b-a)*t,euclideanModulo:(n,m)=>((n%m)+m)%m,randFloat:(a,b)=>a+Math.random()*(b-a),
  randInt:(a,b)=>Math.floor(a+Math.random()*(b-a+1)),mapLinear:(x,a,b,c,d)=>c+(x-a)*(d-c)/(b-a),
  damp:(a,b,l,dt)=>MathUtils.lerp(a,b,1-Math.exp(-l*dt)),generateUUID:()=>'u'+(++ids)};
const THREE={
  Vector2:V2,Vector3:V3,Euler,Quaternion:Quat,Matrix4:M4,Color,MathUtils,
  BufferGeometry:BG,Float32BufferAttribute:Attr,BufferAttribute:Attr,Uint16BufferAttribute:Attr,Uint32BufferAttribute:Attr,
  Object3D:O3,Group,Scene,Mesh,Points,Sprite,Line,LineSegments:Line,
  PerspectiveCamera,OrthographicCamera,Camera,
  Light,PointLight,SpotLight,DirectionalLight,HemisphereLight,AmbientLight,RectAreaLight:Light,
  FogExp2,Fog:FogExp2,Clock,Shape,Path:Shape,Curve:Shape,
  WebGLRenderer,WebGLRenderTarget,PMREMGenerator,CanvasTexture,Texture,DataTexture:Texture,
  BoxGeometry:geoCtor('Box',1,1,1),SphereGeometry:geoCtor('Sphere',1,1,1),CylinderGeometry:geoCtor('Cyl',1,1,1),
  CircleGeometry:geoCtor('Circle',1,1,1),PlaneGeometry:geoCtor('Plane',1,1,0.01),TorusGeometry:geoCtor('Torus',1,1,1),
  CapsuleGeometry:geoCtor('Capsule',1,1,1),ConeGeometry:geoCtor('Cone',1,1,1),RingGeometry:geoCtor('Ring',1,1,0.01),
  IcosahedronGeometry:geoCtor('Ico',1,1,1),LatheGeometry:geoCtor('Lathe',1,1,1),DodecahedronGeometry:geoCtor('Dod',1,1,1),
  TetrahedronGeometry:geoCtor('Tet',1,1,1),TubeGeometry:geoCtor('Tube',1,1,1),TorusKnotGeometry:geoCtor('Knot',1,1,1),
  ShapeGeometry:function(s,c){return dummyGeo({shape:s},1,1,0.01);},
  ExtrudeGeometry:function(s,o){return dummyGeo({shape:s},1,1,0.2);},
  EdgesGeometry:function(g){return dummyGeo({},1,1,1);},
  MeshBasicMaterial:function(p){return mat('basic',p);},
  MeshStandardMaterial:function(p){return mat('std',p);},
  MeshPhysicalMaterial:function(p){return mat('phys',p);},
  MeshLambertMaterial:function(p){return mat('lambert',p);},
  MeshPhongMaterial:function(p){return mat('phong',p);},
  MeshDepthMaterial:function(p){return mat('depth',p);},
  ShaderMaterial:function(p){return mat('shader',p);},
  RawShaderMaterial:function(p){return mat('rawshader',p);},
  SpriteMaterial:function(p){return mat('sprite',p);},
  PointsMaterial:function(p){return mat('points',p);},
  LineBasicMaterial:function(p){return mat('line',p);},
  LineDashedMaterial:function(p){return mat('linedash',p);},
  AdditiveBlending:2,NormalBlending:1,SubtractiveBlending:3,MultiplyBlending:4,NoBlending:0,
  DoubleSide:2,BackSide:1,FrontSide:0,
  SRGBColorSpace:'srgb',LinearSRGBColorSpace:'srgb-linear',NoColorSpace:'',
  LinearFilter:1006,NearestFilter:1003,LinearMipmapLinearFilter:1008,
  RepeatWrapping:1000,ClampToEdgeWrapping:1001,MirroredRepeatWrapping:1002,
  HalfFloatType:1016,UnsignedByteType:1009,FloatType:1015,RGBAFormat:1023,
  NoToneMapping:0,LinearToneMapping:1,ReinhardToneMapping:2,CineonToneMapping:3,ACESFilmicToneMapping:4,
  PCFSoftShadowMap:2,BasicShadowMap:0,
  Raycaster:function(){return permissive({},'raycaster');},
  Box3:function(){return permissive({min:new V3(),max:new V3(),setFromObject(){return this;},containsPoint(){return false;}},'box3');},
  Sphere:function(){return permissive({},'sphere');},
  Plane:function(){return permissive({},'plane');},
  Frustum:function(){return permissive({},'frustum');},
  Spherical:function(){return permissive({},'spherical');},
  CatmullRomCurve3:function(){return permissive({getPointAt(){return new V3();},getPoints(){return [];},closed:false},'curve');},
  Layers:function(){return {set(){},enable(){},disable(){},test(){return true;}};},
  AnimationMixer:function(){return permissive({},'mixer');},
  REVISION:'161-stub',
};

/* ------------------------------------------------------------------ DOM stub */
const CTX_METHODS=['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo','ellipse','rect','roundRect',
  'fill','stroke','clip','fillRect','strokeRect','clearRect','fillText','strokeText','translate','rotate','scale',
  'setTransform','transform','resetTransform','drawImage','setLineDash','quadraticCurveTo','bezierCurveTo'];
function ctx2d(canvas){
  const store={canvas,fillStyle:'#000',strokeStyle:'#000',lineWidth:1,font:'10px sans-serif',globalAlpha:1,
    textAlign:'left',textBaseline:'alphabetic',lineJoin:'miter',lineCap:'butt',shadowBlur:0,shadowColor:'transparent',
    globalCompositeOperation:'source-over',imageSmoothingEnabled:true,filter:'none',letterSpacing:'0px',
    measureText:t=>({width:String(t).length*6,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2}),
    getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(4,(w|0)*(h|0)*4)),width:w|0,height:h|0}),
    putImageData(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(Math.max(4,(w|0)*(h|0)*4)),width:w|0,height:h|0}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
    createConicGradient:()=>({addColorStop(){}}),createPattern:()=>({setTransform(){}}),
    isPointInPath:()=>false};
  return new Proxy(function(){},{
    get(t,k){
      if(k===Symbol.toPrimitive)return()=>0;
      if(k==='then'||k===Symbol.iterator)return undefined;
      if(k in store)return store[k];
      if(CTX_METHODS.indexOf(k)>=0||(typeof k==='string'&&/^[a-z]/.test(k)))return store[k]=function(){return undefined;};
      return undefined;
    },
    set(t,k,v){store[k]=v;return true;},
  });
}
function makeClassList(el){
  const set=new Set();
  return {
    _set:set,
    add(...c){c.forEach(x=>set.add(x));}, remove(...c){c.forEach(x=>set.delete(x));},
    contains(c){return set.has(c);},
    toggle(c,f){const on=f===undefined?!set.has(c):!!f;if(on)set.add(c);else set.delete(c);return on;},
    replace(a,b){if(set.has(a)){set.delete(a);set.add(b);}},
    get value(){return [...set].join(' ');},
  };
}
let elCount=0;
function makeEl(tag,id){
  const el={
    tagName:String(tag||'div').toUpperCase(),nodeName:String(tag||'div').toUpperCase(),nodeType:1,
    id:id||'',className:'',_children:[],parentNode:null,ownerDocument:null,
    style:new Proxy({setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];},getPropertyValue(k){return this[k]||'';},
      getPropertyValuePriority(){return '';},cssText:'',length:0,item(i){return '';},contains(){return false;}},
      {get:(t,k)=>k in t?t[k]:'',set:(t,k,v)=>{t[k]=v;return true;}}),
    dataset:{},value:'',textContent:'',title:'',disabled:false,checked:false,width:300,height:150,
    scrollTop:0,scrollHeight:100,scrollLeft:0,scrollWidth:100,clientWidth:300,clientHeight:150,
    offsetWidth:300,offsetHeight:150,innerHTML:'',outerHTML:'',hidden:false,tabIndex:0,
    _listeners:{},_attrs:{},isConnected:true,
  };
  // a real element in the document reports its box; the render diagnostics rely on this
  el.getBoundingClientRect=function(){
    const w=el.clientWidth||0,h=el.clientHeight||0;
    return {x:0,y:0,left:0,top:0,right:w,bottom:h,width:w,height:h};
  };
  el.classList=makeClassList(el);
  Object.defineProperty(el,'children',{get(){return el._children;}});
  Object.defineProperty(el,'childNodes',{get(){return el._children;}});
  Object.defineProperty(el,'firstChild',{get(){return el._children[0]||null;}});
  Object.defineProperty(el,'firstElementChild',{get(){return el._children[0]||makeEl('div');}});
  Object.defineProperty(el,'lastChild',{get(){return el._children[el._children.length-1]||null;}});
  Object.defineProperty(el,'parentElement',{get(){return el.parentNode||(el._fakeParent=el._fakeParent||makeEl('div'));}});
  Object.defineProperty(el,'nextSibling',{get(){return null;}});
  el.appendChild=function(c){if(!c)return c;c.parentNode=el;el._children.push(c);return c;};
  el.append=function(...cs){cs.forEach(c=>el.appendChild(c));};
  el.prepend=function(...cs){cs.forEach(c=>{c.parentNode=el;el._children.unshift(c);});};
  el.insertBefore=function(c){return el.appendChild(c);};
  el.removeChild=function(c){const i=el._children.indexOf(c);if(i>=0)el._children.splice(i,1);return c;};
  el.remove=function(){if(el.parentNode)el.parentNode.removeChild(el);};
  el.replaceChildren=function(...cs){el._children.length=0;cs.forEach(c=>el.appendChild(c));};
  el.addEventListener=function(t,f){(el._listeners[t]=el._listeners[t]||[]).push(f);};
  el.removeEventListener=function(){};
  el.dispatchEvent=function(e){const l=el._listeners[e.type]||[];l.forEach(f=>f(e));return true;};
  el.setAttribute=function(k,v){el._attrs[k]=v;if(k==='id')el.id=v;};
  el.getAttribute=function(k){return el._attrs[k]!==undefined?el._attrs[k]:null;};
  el.removeAttribute=function(k){delete el._attrs[k];};
  el.hasAttribute=function(k){return k in el._attrs;};
  el.querySelector=function(sel){
    sel=String(sel||'');
    if(/^#([\w-]+)/.test(sel))return byId(sel.slice(1));
    if(/canvas/i.test(sel))return byId('mapCanvas');
    return makeEl('div');
  };
  el.querySelectorAll=function(sel){
    sel=String(sel||'');
    if(/canvas/i.test(sel))return [byId('mapCanvas')];
    return [];
  };
  el.getElementsByTagName=function(){return [];};
  el.getElementsByClassName=function(){return [];};
  el.closest=function(){return null;};
  el.matches=function(){return false;};
  el.focus=function(){};el.blur=function(){};el.click=function(){el.dispatchEvent({type:'click',target:el});};
  el.scrollIntoView=function(){};el.setSelectionRange=function(){};
  el.getBoundingClientRect=function(){return {left:0,top:0,right:300,bottom:150,width:300,height:150,x:0,y:0};};
  el.getContext=function(type){
    if(type==='2d')return el._ctx||(el._ctx=ctx2d(el));
    return permissive({},'glctx');
  };
  el.requestPointerLock=function(){return Promise.resolve();};
  el.toDataURL=function(){return 'data:,';};
  el.captureStream=function(){return {};};
  el.animate=function(){return {finished:Promise.resolve(),cancel(){},finish(){}};};
  el.uid=++elCount;
  return el;
}
const elements=new Map();
function byId(id){
  if(!elements.has(id)){const e=makeEl('div',id);elements.set(id,e);}
  return elements.get(id);
}
/* ids that must pre-exist with particular tags, mirroring 20_body.html */
['gl','mapCanvas','chatField','bootFill','bootMsg','fps','timerBar'].forEach(id=>{
  const e=byId(id);
  if(id==='gl'){ // <canvas id="gl"> is the WebGL target: full viewport, in the document
    e.tagName='CANVAS'; e.nodeName='CANVAS';
    e.clientWidth=1280; e.clientHeight=720; e.width=1280; e.height=720;
  }
  if(id==='mapCanvas'){e.tagName='CANVAS';e.width=920;e.height=560;}
});
const documentStub={
  _listeners:{},
  getElementById:byId,
  createElement:(t)=>makeEl(t),
  createElementNS:(ns,t)=>makeEl(t),
  createTextNode:(t)=>({nodeType:3,textContent:t}),
  createDocumentFragment:()=>makeEl('fragment'),
  querySelector:(s)=>{const m=/^#([\w-]+)/.exec(s);if(m)return byId(m[1]);return makeEl('div');},
  querySelectorAll:(s)=>[],
  addEventListener:(t,f)=>{(documentStub._listeners[t]=documentStub._listeners[t]||[]).push(f);},
  removeEventListener:()=>{},
  dispatchEvent:(e)=>true,
  body:makeEl('body'),
  documentElement:makeEl('html'),
  head:makeEl('head'),
  hidden:false,visibilityState:'visible',
  pointerLockElement:null,
  exitPointerLock(){documentStub.pointerLockElement=null;},
  fullscreenElement:null,
  elementFromPoint:()=>null,
  activeElement:null,
};
documentStub.body.appendChild=documentStub.body.appendChild;

/* --------------------------------------------------------------- globals set */
const store={};
globalThis.localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},
  removeItem:k=>{delete store[k];},clear:()=>{for(const k in store)delete store[k];},key:i=>Object.keys(store)[i]||null,
  get length(){return Object.keys(store).length;}};
const _winListeners={};
globalThis.addEventListener=(t,f)=>{(_winListeners[t]=_winListeners[t]||[]).push(f);};
globalThis.removeEventListener=(t,f)=>{const l=_winListeners[t]||[];const i=l.indexOf(f);if(i>=0)l.splice(i,1);};
globalThis.dispatchEvent=(e)=>{(_winListeners[e.type]||[]).forEach(f=>f(e));return true;};
globalThis.__fire=(t,e)=>{(_winListeners[t]||[]).forEach(f=>f(Object.assign({type:t},e||{})));};
globalThis.document=documentStub;
globalThis.window=globalThis;
globalThis.navigator={maxTouchPoints:0,userAgent:'node-smoke',platform:'linux',language:'en-US'};
globalThis.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
globalThis.devicePixelRatio=1;
globalThis.innerWidth=1280;globalThis.innerHeight=720;
globalThis.screen={width:1280,height:720};
globalThis.performance=globalThis.performance||{now:()=>Date.now()};
globalThis.requestAnimationFrame=null; /* set below with frame cap */
globalThis.AudioContext=function(){return permissive({currentTime:0,sampleRate:48000,state:'running',
  destination:{},resume(){return Promise.resolve();},close(){return Promise.resolve();}},'audioctx');};
globalThis.webkitAudioContext=globalThis.AudioContext;
globalThis.HTMLCanvasElement=function(){};
globalThis.Image=function(){return permissive({},'image');};
globalThis.WebSocket=function(){throw new Error('no sockets in smoke test');};
globalThis.__THREE=THREE;


module.exports={THREE,documentStub,byId,makeEl,elements,ctx2d,permissive};
