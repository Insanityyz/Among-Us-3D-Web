/* ============================================================================
   2. Materials, the ship, props, doors, vents and the crewmate model
   ========================================================================== */
const MAT={};
function initMaterials(scene){
  RENDER.tex={
    panel:texPanels(), floor:texFloor(), ceil:texCeil(), grate:texGrate(),
    hazard:texHazard(), hull:texHull(), planet:texPlanet(),
    dot:texDot('rgba(0,0,0,.66)','rgba(0,0,0,.30)'), glow:texDot('rgba(255,255,255,.85)','rgba(255,255,255,.25)'),
    star:texStar(), blood:texBlood(),
  };
  MAT.wall=new THREE.MeshStandardMaterial({map:RENDER.tex.panel,vertexColors:true,roughness:.78,metalness:.34,envMapIntensity:.55});
  MAT.floor=new THREE.MeshStandardMaterial({map:RENDER.tex.floor,vertexColors:true,roughness:.86,metalness:.18,envMapIntensity:.35});
  MAT.ceil=new THREE.MeshStandardMaterial({map:RENDER.tex.ceil,vertexColors:true,roughness:.92,metalness:.12,side:THREE.DoubleSide,envMapIntensity:.2});
  MAT.trim=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,fog:false});
  MAT.hull=new THREE.MeshStandardMaterial({map:RENDER.tex.hull,color:0x8f9aab,roughness:.72,metalness:.42,envMapIntensity:.6});
  MAT.metal=new THREE.MeshStandardMaterial({color:0x59636f,roughness:.5,metalness:.72,envMapIntensity:.9});
  MAT.metalDark=new THREE.MeshStandardMaterial({color:0x2b323d,roughness:.62,metalness:.6,envMapIntensity:.7});
  MAT.rubber=new THREE.MeshStandardMaterial({color:0x1b1f26,roughness:.95,metalness:.05});
  MAT.glass=new THREE.MeshStandardMaterial({color:0x9fd8ff,roughness:.06,metalness:0,transparent:true,opacity:.16,side:THREE.DoubleSide,envMapIntensity:1.4});
  MAT.glowWhite=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,fog:false});
  MAT.glowRed=new THREE.MeshBasicMaterial({color:0xff3b30,toneMapped:false,fog:false});
  MAT.glowCyan=new THREE.MeshBasicMaterial({color:0x7ff6ff,toneMapped:false,fog:false});
  MAT.glowBlue=new THREE.MeshBasicMaterial({color:0x4d9dff,toneMapped:false,fog:false});
  MAT.emerg=new THREE.MeshBasicMaterial({color:0x220000,toneMapped:false,fog:false});
  MAT.blood=new THREE.MeshBasicMaterial({map:RENDER.tex.blood,transparent:true,depthWrite:false,fog:false,opacity:.95,toneMapped:false});
  MAT.blob=new THREE.MeshBasicMaterial({map:RENDER.tex.dot,transparent:true,depthWrite:false,fog:false,opacity:.6,toneMapped:false});
  MAT.nameTag=(tex)=>new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false,depthTest:true});
  scene.environment=RENDER.envTex;
  scene.environmentIntensity=0.55;
}

function flipFaces(g){
  const p=g.attributes.position.array, n=g.attributes.normal?g.attributes.normal.array:null;
  for(let i=0;i<p.length;i+=9){
    for(let k=0;k<3;k++){ const t=p[i+k]; p[i+k]=p[i+3+k]; p[i+3+k]=t; }
    if(n) for(let k=0;k<3;k++){ n[i+k]=-n[i+k]; n[i+3+k]=-n[i+3+k]; n[i+6+k]=-n[i+6+k]; }
  }
  g.attributes.position.needsUpdate=true; if(n) g.attributes.normal.needsUpdate=true;
  return g;
}
function floorGeo(poly,y,tile){
  const pts=poly.map(p=>[p[0],-p[1]]);
  const g=new THREE.ShapeGeometry(polyShape(pts),1);
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position, uv=[];
  for(let i=0;i<p.count;i++) uv.push(p.getX(i)/tile,p.getZ(i)/tile);
  const ng=g.index?g.toNonIndexed():g;
  ng.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(y) ng.translate(0,y,0);
  return ng;
}
let _m4=null,_q=null,_v3=null,_e=null,_fwd=null,_right=null,_flashCol=null;
function boxAt(list,w,h,d,x,y,z,rotY,color,uvTile){
  const g=panelBox(w,h,d,uvTile||2);
  _q.setFromAxisAngle(new THREE.Vector3(0,1,0),rotY||0);
  _m4.compose(new THREE.Vector3(x,y,z),_q,new THREE.Vector3(1,1,1));
  xform(g,_m4);
  if(color!==undefined) setColor(g,color);
  list.push(g);
  return g;
}
function shade(hex,f){ const c=new THREE.Color(hex); c.multiplyScalar(f); return c.getHex(); }
function mixHex(a,b,t){ const c=new THREE.Color(a).lerp(new THREE.Color(b),t); return c.getHex(); }

/* ============================================================================
   Ship construction
   ========================================================================== */
const SHIP={group:null,doors:[],vents:[],stations:[],lights:{},screens:{},colliders:[],roomMeshes:{},signs:[],decor:[]};

function buildShip(scene,M){
  const g=new THREE.Group(); g.name='ship';
  const H=M.map.wallH, T=M.map.wallT;
  const floorL=[],wallL=[],ceilL=[],trimL=[],hullL=[];

  /* ---- floors ---- */
  for(const r of M.rooms){
    const base=r.corridor?0x3a4250:0x4b5462;
    const fg=floorGeo(r.poly,0.002,3);
    tintGeo(fg,mixHex(base,r.accent,r.corridor?0.05:0.13),1);
    floorL.push(fg);
    // ceiling
    const cg=floorGeo(r.poly,H-0.06,4); flipFaces(cg);
    tintGeo(cg,0x1c222c,1); ceilL.push(cg);
    // roof (exterior)
    const rg=floorGeo(r.poly,H+0.34,5);
    setColor(rg,0x9aa5b5); hullL.push(rg);
    const rb=floorGeo(r.poly,H+0.02,5); flipFaces(rb); setColor(rb,0x2a3140); hullL.push(rb);
    // roof rim
    for(let i=0;i<r.poly.length;i++){
      const A=r.poly[i],B=r.poly[(i+1)%r.poly.length];
      const len=Math.hypot(B[0]-A[0],B[1]-A[1]); if(len<0.4) continue;
      const ang=Math.atan2(B[1]-A[1],B[0]-A[0]);
      boxAt(hullL,len,0.34,0.42,(A[0]+B[0])/2,H+0.17,(A[1]+B[1])/2,-ang,0x6d7787,3);
    }
  }

  /* ---- walls ---- */
  for(const w of M.walls){
    const room=M.byId[w.room];
    const acc=room?room.accent:0x5b6b86;
    const hgt=(w.y1===undefined?H:w.y1)-(w.y0||0);
    const cy=((w.y0||0)+(w.y1===undefined?H:w.y1))/2;
    const tint=mixHex(0xa8b2c2,acc,0.10);
    boxAt(wallL,w.hx*2,hgt,T*2,w.cx,cy,w.cz,-w.a,tint,2.6);
    // top cap rail
    if((w.y1===undefined?H:w.y1)>H-0.2){
      boxAt(wallL,w.hx*2,0.1,T*2+0.09,w.cx,H-0.05,w.cz,-w.a,shade(acc,0.55),3);
    }
    // baseboard + accent LED on the room-facing side
    const inward=room?Math.atan2(room.bb.cz-w.cz,room.bb.cx-w.cx):-w.a+Math.PI/2;
    const ox=Math.cos(inward)*(T+0.02), oz=Math.sin(inward)*(T+0.02);
    boxAt(wallL,w.hx*2,0.16,T*2+0.06,w.cx,0.08,w.cz,-w.a,0x232a35,3);
    if(w.hx>0.7&&hgt>0.5){
      boxAt(trimL,w.hx*2-0.24,0.055,0.055,w.cx+ox,0.21,w.cz+oz,-w.a,mixHex(acc,0xffffff,0.35),1);
    }
  }

  /* ---- ceilings: light fixtures + accent cove ---- */
  const lightFixtures=[];
  for(const r of M.rooms){
    const b=r.bb;
    const long=Math.max(b.w,b.h);
    const horiz=b.w>=b.h;
    const n=r.corridor?Math.max(1,Math.round(long/9)):Math.max(1,Math.min(3,Math.round(long/7)));
    for(let i=0;i<n;i++){
      const t=(i+0.5)/n;
      const fx=horiz?b.x1+t*b.w:b.cx, fz=horiz?b.cz:b.z1+t*b.h;
      const len=Math.min((horiz?b.w:b.h)*0.55,4.6);
      // housing
      boxAt(wallL,len+0.24,0.14,0.5,fx,H-0.13,fz,horiz?0:Math.PI/2,0x2f3745,3);
      // tube
      boxAt(trimL,len,0.07,0.3,fx,H-0.2,fz,horiz?0:Math.PI/2,mixHex(0xfff4e0,r.accent,0.22),1);
      lightFixtures.push({x:fx,z:fz,room:r.id,y:H-0.3,accent:r.accent,size:Math.max(b.w,b.h)});
    }
    // corner cove glow
    if(!r.corridor&&b.w>4){
      boxAt(trimL,b.w*0.5,0.04,0.04,b.cx,0.06,b.z1+0.3,0,mixHex(r.accent,0xffffff,0.2),1);
    }
  }

  /* ---- room signs ---- */
  for(const r of M.rooms){
    if(r.corridor) continue;
    const b=r.bb;
    // hang the sign on the longest wall, inside, high up
    let best=null;
    for(const w of M.walls){
      if(w.room!==r.id||w.hx<1.6) continue;
      const inward=Math.atan2(b.cz-w.cz,b.cx-w.cx);
      const d=Math.hypot(b.cx-w.cx,b.cz-w.cz);
      if(!best||w.hx>best.w.hx) best={w,inward,d};
    }
    if(!best) continue;
    const w=best.w;
    const len=Math.min(w.hx*1.5,4.2);
    const geo=planeGeo(len,len*0.25,1);
    const mat=new THREE.MeshBasicMaterial({map:texSign(r.name,'#'+new THREE.Color(r.accent).getHexString()),transparent:true,toneMapped:false,fog:false,side:THREE.DoubleSide});
    const sign=new THREE.Mesh(geo,mat);
    const off=T+0.06;
    sign.position.set(w.cx+Math.cos(best.inward)*off,2.52,w.cz+Math.sin(best.inward)*off);
    sign.rotation.y=-w.a+Math.PI/2*(Math.sin(best.inward-w.a)>0?1:-1);
    sign.rotation.y=best.inward-Math.PI/2;
    g.add(sign); SHIP.signs.push(sign);
  }

  /* ---- windows ---- */
  for(const wn of M.windows){
    const cx=(wn.x1+wn.x2)/2, cz=(wn.z1+wn.z2)/2, hgt=wn.y1-wn.y0;
    const glass=new THREE.Mesh(planeGeo(wn.len-0.1,hgt-0.1,1),MAT.glass);
    glass.rotation.y=-wn.a+Math.PI/2;
    glass.position.set(cx,(wn.y0+wn.y1)/2,cz);
    g.add(glass);
    // mullions
    const nb=Math.max(1,Math.round(wn.len/2.2));
    for(let i=0;i<=nb;i++){
      const t=i/nb;
      const x=lerp(wn.x1,wn.x2,t), z=lerp(wn.z1,wn.z2,t);
      boxAt(hullL,0.12,hgt+0.16,T+0.16,x,(wn.y0+wn.y1)/2,z,-wn.a,0x39414f,2);
    }
    boxAt(hullL,wn.len+0.2,0.18,T+0.2,cx,wn.y0-0.06,cz,-wn.a,0x39414f,2);
    boxAt(hullL,wn.len+0.2,0.18,T+0.2,cx,wn.y1+0.06,cz,-wn.a,0x39414f,2);
    // ledge light
    const lg=panelBox(wn.len-0.3,0.05,0.05,1); setColor(lg,0x9fd8ff);
    _q.setFromAxisAngle(new THREE.Vector3(0,1,0),-wn.a);
    _m4.compose(new THREE.Vector3(cx,wn.y0-0.16,cz),_q,new THREE.Vector3(1,1,1));
    xform(lg,_m4); trimL.push(lg);
  }

  /* ---- merge all baked batches (after windows + doors have added to them) ---- */
  const meshFloor=new THREE.Mesh(mergeGeos(floorL),MAT.floor); meshFloor.name='floors';
  const meshWall=new THREE.Mesh(mergeGeos(wallL),MAT.wall); meshWall.name='walls';
  const meshCeil=new THREE.Mesh(mergeGeos(ceilL),MAT.ceil); meshCeil.name='ceilings';
  const meshTrim=new THREE.Mesh(mergeGeos(trimL),MAT.trim); meshTrim.name='trim'; meshTrim.frustumCulled=false;
  const meshHull=new THREE.Mesh(mergeGeos(hullL),MAT.hull); meshHull.name='hull';
  g.add(meshFloor,meshWall,meshCeil,meshTrim,meshHull);
  SHIP.meshes={floor:meshFloor,wall:meshWall,ceil:meshCeil,trim:meshTrim,hull:meshHull};

  /* ---- lights ---- */
  SHIP.lights.normal=[]; SHIP.lights.emerg=[];
  const hemi=new THREE.HemisphereLight(0x6f88b8,0x141a24,0.42); g.add(hemi); SHIP.lights.hemi=hemi;
  const amb=new THREE.AmbientLight(0x2a3752,0.5); g.add(amb); SHIP.lights.amb=amb;
  for(const f of lightFixtures){
    const room=M.byId[f.room];
    const isCorr=!!room.corridor;
    const col=mixHex(0xfff1dc,f.accent,isCorr?0.1:0.22);
    const pl=new THREE.PointLight(col,isCorr?7:13,f.size*(isCorr?1.5:1.9),1.85);
    pl.position.set(f.x,f.y,f.z);
    pl.userData={base:isCorr?7:13,room:f.room,corr:isCorr};
    g.add(pl); SHIP.lights.normal.push(pl);
  }
  for(const r of M.rooms){
    if(r.corridor) continue;
    const el=new THREE.PointLight(0xff2a18,0,Math.max(r.bb.w,r.bb.h)*1.5,2);
    el.position.set(r.bb.cx,H-0.5,r.bb.cz);
    g.add(el); SHIP.lights.emerg.push(el);
  }

  /* ---- doors ---- */
  for(const d of M.doors){
    if(d.win) continue; // windows are built above
    const grp=new THREE.Group();
    const a=Math.atan2(d.z2-d.z1,d.x2-d.x1);
    const w=d.w, hgt=2.34;
    // frame (baked into the wall batch)
    boxAt(wallL,w+0.5,0.22,T*2+0.2,d.cx,hgt+0.11,d.cz,-a,0x39414f,2.4);
    boxAt(wallL,0.24,hgt,T*2+0.16,d.cx-Math.cos(a)*(w/2+0.12),hgt/2,d.cz-Math.sin(a)*(w/2+0.12),-a,0x39414f,2.4);
    boxAt(wallL,0.24,hgt,T*2+0.16,d.cx+Math.cos(a)*(w/2+0.12),hgt/2,d.cz+Math.sin(a)*(w/2+0.12),-a,0x39414f,2.4);
    // two sliding leaves
    const leaves=[];
    for(let s=0;s<2;s++){
      const leaf=new THREE.Group();
      const lg=panelBox(w/2+0.04,hgt,0.16,2); setColor(lg,0x8d97a6);
      const lm=new THREE.Mesh(lg,MAT.wall); lm.position.x=(s?1:-1)*(w/4);
      leaf.add(lm);
      const stripe=new THREE.Mesh(planeGeo(w/2-0.06,0.2,0.5),new THREE.MeshBasicMaterial({map:RENDER.tex.hazard,toneMapped:false,fog:false}));
      stripe.position.set((s?1:-1)*(w/4),hgt/2-0.24,0.085); leaf.add(stripe);
      const stripe2=stripe.clone(); stripe2.position.z=-0.085; stripe2.rotation.y=Math.PI; leaf.add(stripe2);
      const led=new THREE.Mesh(planeGeo(w/2-0.1,0.05,1),new THREE.MeshBasicMaterial({color:0x5ef08b,toneMapped:false,fog:false}));
      led.position.set((s?1:-1)*(w/4),-hgt/2+0.12,0.09); leaf.add(led);
      leaf.position.set(d.cx,hgt/2,d.cz);
      leaf.rotation.y=-a;
      grp.add(leaf); leaves.push({obj:leaf,led,dir:s?1:-1,x:leaf.position.x});
    }
    g.add(grp);
    SHIP.doors.push({def:d,group:grp,leaves,open:0,target:0,w,a,hgt});
  }

  /* ---- vents ---- */
  for(const v of M.vents){
    const grp=new THREE.Group(); grp.position.set(v.x,0,v.z);
    const frame=new THREE.Mesh(panelBox(1.06,0.14,1.06,1.4),MAT.metalDark);
    setColor(frame.geometry,0x39414f); frame.position.y=0.03; grp.add(frame);
    const grate=new THREE.Mesh(planeGeo(0.92,0.92,0.92),new THREE.MeshStandardMaterial({map:RENDER.tex.grate,roughness:.7,metalness:.5,fog:true}));
    grate.rotation.x=-Math.PI/2; grate.position.y=0.105; grp.add(grate);
    const ring=new THREE.Mesh(planeGeo(1.16,1.16,1.16),new THREE.MeshBasicMaterial({color:0x2aff8c,transparent:true,opacity:0,toneMapped:false,fog:false,blending:THREE.AdditiveBlending,depthWrite:false}));
    ring.rotation.x=-Math.PI/2; ring.position.y=0.12; grp.add(ring);
    g.add(grp);
    SHIP.vents.push({def:v,group:grp,ring,ringMat:ring.material});
  }

  /* ---- stations / consoles ---- */
  for(const s of M.stations){
    const room=M.byId[s.room]||{accent:0x5b6b86};
    const obj=buildConsole(s,room);
    g.add(obj);
    SHIP.stations.push(Object.assign({},s,{group:obj,meshes:obj.userData.pick||[],roomAccent:room.accent,glow:obj.userData.glow||null}));
  }

  /* ---- per-room decor ---- */
  for(const r of M.rooms){
    const d=buildDecor(r,M);
    if(d){ g.add(d); SHIP.decor.push(d); }
  }

  /* ---- exterior details ---- */
  const ext=new THREE.Group();
  // engine bells on the west side
  for(const zz of [-16,16]){
    const nac=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.35,5.0,16),MAT.hull);
    nac.rotation.z=Math.PI/2; nac.position.set(-40.4,1.5,zz); ext.add(nac);
    const bell=new THREE.Mesh(new THREE.CylinderGeometry(1.35,2.15,2.4,20,1,true),new THREE.MeshStandardMaterial({color:0x6d7787,roughness:.55,metalness:.7,side:THREE.DoubleSide}));
    bell.rotation.z=Math.PI/2; bell.position.set(-44.0,1.5,zz); ext.add(bell);
    const glow=new THREE.Mesh(new THREE.CircleGeometry(1.9,20),new THREE.MeshBasicMaterial({color:0x8fd8ff,toneMapped:false,fog:false,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));
    glow.rotation.y=-Math.PI/2; glow.position.set(-45.2,1.5,zz); ext.add(glow);
    const gl2=new THREE.Mesh(new THREE.CircleGeometry(3.2,20),new THREE.MeshBasicMaterial({color:0x2a6fd0,toneMapped:false,fog:false,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false}));
    gl2.rotation.y=-Math.PI/2; gl2.position.set(-45.9,1.5,zz); ext.add(gl2);
    SHIP.engineGlow=(SHIP.engineGlow||[]); SHIP.engineGlow.push(glow,gl2);
  }
  // comms dish
  const dish=new THREE.Mesh(new THREE.SphereGeometry(1.6,20,12,0,TAU,0,Math.PI*0.42),new THREE.MeshStandardMaterial({color:0xc3ccd9,roughness:.5,metalness:.5,side:THREE.DoubleSide}));
  dish.position.set(8,H+1.6,12.4); dish.rotation.x=Math.PI*0.86; ext.add(dish);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,1.8,8),MAT.metal);
  mast.position.set(8,H+0.8,12.4); ext.add(mast);
  // antenna array on nav
  for(let i=0;i<3;i++){
    const an=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.09,2.4+i*0.5,6),MAT.metal);
    an.position.set(30.4,H+1.2+i*0.2,-4+i*4); an.rotation.z=0.2; ext.add(an);
  }
  g.add(ext);

  scene.add(g);
  SHIP.group=g;
  SHIP.M=M;
  // colliders (2D)
  SHIP.colliders=M.walls.map(w=>({cx:w.cx,cz:w.cz,a:w.a,hx:w.hx,hz:w.hz}));
  return g;
}

/* ---------- console builder ---------- */
function screenMat(kind){
  const key='sm_'+kind;
  if(TEX.cache[key]) return TEX.cache[key];
  const t=texScreen(kind);
  const m=new THREE.MeshBasicMaterial({map:t,toneMapped:false,fog:false});
  TEX.cache[key]=m; return m;
}
function buildConsole(s,room){
  const grp=new THREE.Group();
  const pick=[];
  const accent=room.accent||0x5b6b86;
  const special=['emergency','admintable','cams','scan','vitals'];
  if(special.indexOf(s.kind)<0){
    // wall console
    const body=new THREE.Mesh(panelBox(1.0,1.22,0.24,1.6),MAT.metalDark); setColor(body.geometry,0x4a5462);
    body.position.y=1.02; grp.add(body); pick.push(body);
    const top=new THREE.Mesh(panelBox(1.08,0.09,0.42,1),MAT.metal); setColor(top.geometry,0x6b7686);
    top.position.set(0,1.66,0.06); grp.add(top);
    const ledge=new THREE.Mesh(panelBox(1.04,0.1,0.34,1),MAT.metal); setColor(ledge.geometry,0x5c6675);
    ledge.position.set(0,0.78,0.12); grp.add(ledge);
    const scr=new THREE.Mesh(planeGeo(0.74,0.55,1),screenMat(s.kind));
    scr.position.set(0,1.24,0.135); grp.add(scr);
    // bezel
    const bez=new THREE.Mesh(planeGeo(0.86,0.67,1),new THREE.MeshBasicMaterial({color:0x0b1120,toneMapped:false,fog:false}));
    bez.position.set(0,1.24,0.131); grp.add(bez);
    // buttons
    for(let i=0;i<3;i++){
      const b=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.05,0.05,10),new THREE.MeshBasicMaterial({color:[0x5ef08b,0xffcc4d,0xff5a5a][i],toneMapped:false,fog:false}));
      b.rotation.x=Math.PI/2; b.position.set(-0.24+i*0.24,0.9,0.16); grp.add(b);
    }
    // accent bar
    const bar=new THREE.Mesh(planeGeo(0.94,0.045,1),new THREE.MeshBasicMaterial({color:mixHex(accent,0xffffff,0.3),toneMapped:false,fog:false}));
    bar.position.set(0,1.6,0.13); grp.add(bar);
    grp.userData.glow=bar.material;
    grp.userData.screen=scr;
  } else {
    const body=new THREE.Mesh(panelBox(0.9,0.9,0.2,1.6),MAT.metalDark); setColor(body.geometry,0x4a5462);
    body.position.y=1.0; grp.add(body); pick.push(body);
    const scr=new THREE.Mesh(planeGeo(0.66,0.5,1),screenMat(s.kind));
    scr.position.set(0,1.16,0.11); grp.add(scr);
    grp.userData.screen=scr;
  }
  // special builds
  if(s.kind==='emergency'){
    grp.clear();
    const table=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.62,0.86,26),MAT.metal); setColor(table.geometry,0x77808f);
    table.position.y=0.43; grp.add(table); pick.push(table);
    const trim=new THREE.Mesh(new THREE.TorusGeometry(1.52,0.06,8,30),new THREE.MeshBasicMaterial({color:mixHex(accent,0xffffff,.35),toneMapped:false,fog:false}));
    trim.rotation.x=Math.PI/2; trim.position.y=0.84; grp.add(trim);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.56,0.16,20),MAT.metalDark); base.position.y=0.94; grp.add(base);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(0.34,22,16,0,TAU,0,Math.PI*0.55),
      new THREE.MeshStandardMaterial({color:0xd81f14,roughness:.22,metalness:.1,emissive:0x8f0d06,emissiveIntensity:1.6,envMapIntensity:1.2}));
    dome.position.y=1.02; grp.add(dome); pick.push(dome);
    const halo=new THREE.Mesh(new THREE.RingGeometry(0.55,0.9,28),new THREE.MeshBasicMaterial({color:0xff3b30,transparent:true,opacity:.22,toneMapped:false,fog:false,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    halo.rotation.x=-Math.PI/2; halo.position.y=0.87; grp.add(halo);
    grp.userData.dome=dome; grp.userData.halo=halo;
    grp.userData.glow=dome.material;
    const glass=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.72,20,1,true),MAT.glass);
    glass.position.y=1.3; grp.add(glass);
  }
  if(s.kind==='admintable'){
    grp.clear();
    const table=new THREE.Mesh(panelBox(3.0,0.14,1.5,1.6),MAT.metal); setColor(table.geometry,0x7d8797);
    table.position.y=0.92; grp.add(table); pick.push(table);
    for(const dx of [-1.3,1.3]) for(const dz of [-0.6,0.6]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,0.9,8),MAT.metalDark);
      leg.position.set(dx,0.45,dz); grp.add(leg);
    }
    const scr=new THREE.Mesh(planeGeo(2.5,1.2,1),screenMat('admintable'));
    scr.rotation.x=-Math.PI/2; scr.position.y=1.0; grp.add(scr);
    grp.userData.screen=scr; grp.userData.adminScreen=scr;
    const rim=new THREE.Mesh(planeGeo(2.7,1.4,1),new THREE.MeshBasicMaterial({color:0x101828,toneMapped:false,fog:false}));
    rim.rotation.x=-Math.PI/2; rim.position.y=0.995; grp.add(rim);
  }
  if(s.kind==='cams'){
    grp.clear();
    const desk=new THREE.Mesh(panelBox(2.8,0.9,0.9,1.6),MAT.metalDark); setColor(desk.geometry,0x49525f);
    desk.position.y=0.45; grp.add(desk); pick.push(desk);
    const mon=[];
    for(let i=0;i<3;i++){
      const m=new THREE.Mesh(planeGeo(0.78,0.56,1),screenMat('cams'));
      m.position.set(-0.85+i*0.85,1.24,0.16); m.rotation.y=(i-1)*-0.16; grp.add(m); mon.push(m);
      const b=new THREE.Mesh(planeGeo(0.86,0.64,1),new THREE.MeshBasicMaterial({color:0x0a0f1a,toneMapped:false,fog:false}));
      b.position.set(-0.85+i*0.85,1.24,0.155); b.rotation.y=(i-1)*-0.16; grp.add(b);
    }
    grp.userData.monitors=mon;
    const chair=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.4,0.5,12),MAT.metalDark);
    chair.position.set(0,0.25,1.1); grp.add(chair);
  }
  if(s.kind==='vitals'){
    grp.clear();
    const body=new THREE.Mesh(panelBox(1.7,1.2,0.22,1.6),MAT.metalDark); setColor(body.geometry,0x4a5462);
    body.position.y=1.2; grp.add(body); pick.push(body);
    const scr=new THREE.Mesh(planeGeo(1.44,0.94,1),screenMat('vitals'));
    scr.position.set(0,1.24,0.13); grp.add(scr);
    grp.userData.screen=scr; grp.userData.vitalsScreen=scr;
  }
  if(s.kind==='scan'){
    grp.clear();
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(0.86,0.94,0.14,26),MAT.metal); setColor(pad.geometry,0x8b95a5);
    pad.position.y=0.07; grp.add(pad); pick.push(pad);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.8,0.05,8,32),new THREE.MeshBasicMaterial({color:0x5ef08b,toneMapped:false,fog:false}));
    ring.rotation.x=Math.PI/2; ring.position.y=0.16; grp.add(ring);
    grp.userData.ring=ring;
    const arm=new THREE.Mesh(new THREE.TorusGeometry(1.0,0.09,8,24,Math.PI),MAT.metal); setColor(arm.geometry,0x6d7787);
    arm.position.set(0,1.1,0); arm.rotation.z=0; grp.add(arm);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.82,0.82,0.06,24,1,true),
      new THREE.MeshBasicMaterial({color:0x9dffc4,transparent:true,opacity:0,toneMapped:false,fog:false,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    beam.position.y=0.6; grp.add(beam); grp.userData.beam=beam;
    const post=new THREE.Mesh(panelBox(0.5,1.1,0.24,1.4),MAT.metalDark); setColor(post.geometry,0x4a5462);
    post.position.set(0,0.6,-1.25); grp.add(post);
    const scr=new THREE.Mesh(planeGeo(0.4,0.34,1),screenMat('scan'));
    scr.position.set(0,0.92,-1.12); grp.add(scr); grp.userData.screen=scr;
  }
  grp.position.set(s.x,0,s.z);
  grp.rotation.y=THREE.MathUtils.degToRad(s.rot);
  grp.userData.pick=pick.length?pick:[grp.children[0]].filter(Boolean);
  grp.userData.stationId=s.id;
  grp.userData.baseY=0;
  return grp;
}

/* ---------- per-room set dressing ---------- */
function buildDecor(room,M){
  const b=room.bb, g=new THREE.Group(); g.name='decor_'+room.id;
  const A=room.accent;
  function pipe(x1,z1,x2,z2,y,r,col){
    const len=Math.hypot(x2-x1,z2-z1);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8),MAT.metal);
    if(col!==undefined) setColor(m.geometry,col);
    m.rotation.z=Math.PI/2; m.rotation.y=-Math.atan2(z2-z1,x2-x1);
    m.position.set((x1+x2)/2,y,(z1+z2)/2); g.add(m); return m;
  }
  function crate(x,z,s,col){
    const c=new THREE.Mesh(panelBox(s,s*0.9,s,1.2),MAT.wall); setColor(c.geometry,col||0x8a7a5c);
    c.position.set(x,s*0.45,z); g.add(c);
    const e=new THREE.Mesh(panelBox(s*1.02,0.06,s*1.02,1),MAT.metalDark); setColor(e.geometry,0x4a5462);
    e.position.set(x,s*0.88,z); g.add(e);
    return c;
  }
  switch(room.id){
    case 'cafeteria':{
      for(const [x,z] of [[-18.6,-18.2],[-9.4,-18.2],[-18.6,-9.8],[-9.4,-9.8]]){
        const t=new THREE.Mesh(new THREE.CylinderGeometry(1.02,1.02,0.1,20),MAT.metal); setColor(t.geometry,0x8b95a5);
        t.position.set(x,0.78,z); g.add(t);
        const p=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.26,0.76,12),MAT.metalDark); p.position.set(x,0.38,z); g.add(p);
        const rim=new THREE.Mesh(new THREE.TorusGeometry(1.02,0.035,6,24),new THREE.MeshBasicMaterial({color:mixHex(A,0xffffff,.4),toneMapped:false,fog:false}));
        rim.rotation.x=Math.PI/2; rim.position.set(x,0.83,z); g.add(rim);
        for(let i=0;i<4;i++){
          const a=i/4*TAU+0.6;
          const ch=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.44,10),MAT.metalDark); setColor(ch.geometry,0x59636f);
          ch.position.set(x+Math.cos(a)*1.5,0.22,z+Math.sin(a)*1.5); g.add(ch);
        }
      }
      // food trays + cups
      for(let i=0;i<7;i++){
        const x=-19+Math.random()*10,z=-19+Math.random()*10;
        const tr=new THREE.Mesh(panelBox(0.4,0.03,0.3,1),MAT.metal); setColor(tr.geometry,[0xc9d3e2,0xd9b46a,0x9fc4d9][i%3]);
        tr.position.set(x,0.85,z); tr.rotation.y=Math.random()*3; g.add(tr);
      }
      pipe(b.x1+1,b.z1+0.6,b.x2-1,b.z1+0.6,M.map.wallH-0.4,0.11,0x6d7787);
      break;
    }
    case 'reactor':{
      const core=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,3.0,26,1,true),
        new THREE.MeshStandardMaterial({color:0x6d7787,roughness:.5,metalness:.7,side:THREE.DoubleSide}));
      core.position.set(-45.5,1.5,0); g.add(core);
      const inner=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,2.7,24),
        new THREE.MeshBasicMaterial({color:0xff6a3c,toneMapped:false,fog:false,transparent:true,opacity:.55}));
      inner.position.set(-45.5,1.5,0); g.add(inner);
      SHIP.reactorCore=inner;
      for(let i=0;i<4;i++){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(2.62,0.09,8,30),new THREE.MeshBasicMaterial({color:0xffb03c,toneMapped:false,fog:false}));
        ring.rotation.x=Math.PI/2; ring.position.set(-45.5,0.6+i*0.65,0); g.add(ring);
      }
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,0.24,26),MAT.metalDark); cap.position.set(-45.5,3.05,0); g.add(cap);
      pipe(-45.5,0,-41.4,0,2.6,0.2,0x7d8797);
      pipe(-48,0,-48,-7,0.5,0.16,0x6d7787);
      for(let i=0;i<3;i++) crate(-49.2+i*1.2,7.4,0.9,0x7d6a4e);
      break;
    }
    case 'upper_engine': case 'lower_engine':{
      const zc=room.id==='upper_engine'?-16:16;
      const nac=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.9,3.4,20),MAT.metal); setColor(nac.geometry,0x7d8797);
      nac.rotation.z=Math.PI/2; nac.position.set(-31.6,1.5,zc); g.add(nac);
      const glow=new THREE.Mesh(new THREE.CircleGeometry(1.05,20),new THREE.MeshBasicMaterial({color:0x7fd0ff,toneMapped:false,fog:false,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
      glow.rotation.y=Math.PI/2; glow.position.set(-30.0,1.5,zc); g.add(glow);
      const halo=new THREE.Mesh(new THREE.CircleGeometry(1.9,20),new THREE.MeshBasicMaterial({color:0x2f7fd0,transparent:true,opacity:.3,toneMapped:false,fog:false,blending:THREE.AdditiveBlending,depthWrite:false}));
      halo.rotation.y=Math.PI/2; halo.position.set(-29.7,1.5,zc); g.add(halo);
      SHIP.engineGlow=(SHIP.engineGlow||[]); SHIP.engineGlow.push(glow,halo);
      pipe(-37,-16,-31,-16,2.7,0.13,0x6d7787);
      for(let i=0;i<2;i++){
        const t=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.9,10),MAT.metalDark); setColor(t.geometry,0xc9a227);
        t.position.set(-35+i*1.2,0.45,zc+2.2); g.add(t);
      }
      break;
    }
    case 'electrical':{
      for(let i=0;i<3;i++){
        const cab=new THREE.Mesh(panelBox(1.1,1.9,0.5,1.4),MAT.metalDark); setColor(cab.geometry,0x4d5765);
        cab.position.set(-36+i*1.4,0.95,10.5); g.add(cab);
        for(let k=0;k<4;k++){
          const led=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.03,8),new THREE.MeshBasicMaterial({color:[0x5ef08b,0xffcc4d,0xff5a5a,0x4ea3ff][k],toneMapped:false,fog:false}));
          led.rotation.x=Math.PI/2; led.position.set(-36+i*1.4-0.3+k*0.2,1.5,10.24); g.add(led);
        }
      }
      // cable bundles
      for(let i=0;i<6;i++){
        const y=2.2+Math.random()*0.6;
        pipe(-37.2,y-2.2+0.2,-28.4,y-2.2+0.2,0,0.05,[0x8d4b4b,0x4b6b8d,0x6b8d4b,0x8d7a4b][i%4]);
        const c=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,8.8,6),new THREE.MeshStandardMaterial({color:[0xa85a5a,0x5a7aa8,0x7aa85a,0xa8915a][i%4],roughness:.9}));
        c.rotation.z=Math.PI/2; c.position.set(-32.8,2.1+i*0.11,4.6+ (i%3)*1.6); g.add(c);
      }
      break;
    }
    case 'medbay':{
      const bed=new THREE.Mesh(panelBox(0.9,0.16,2.0,1.2),MAT.metal); setColor(bed.geometry,0xc3ccd9);
      bed.position.set(-26.4,0.62,-13.6); g.add(bed);
      const bl=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,0.6,8),MAT.metalDark); bl.position.set(-26.4,0.3,-13.6); g.add(bl);
      const pil=new THREE.Mesh(panelBox(0.6,0.12,0.36,1),MAT.rubber); setColor(pil.geometry,0xdfe7f5); pil.position.set(-26.4,0.75,-14.4); g.add(pil);
      for(let i=0;i<3;i++){
        const cb=new THREE.Mesh(panelBox(0.7,1.1,0.4,1.2),MAT.metalDark); setColor(cb.geometry,0x59636f);
        cb.position.set(-31.2+i*0.9,0.55,-10.8); g.add(cb);
        const led=new THREE.Mesh(planeGeo(0.5,0.06,1),new THREE.MeshBasicMaterial({color:0x5ef08b,toneMapped:false,fog:false}));
        led.position.set(-31.2+i*0.9,0.95,-10.59); g.add(led);
      }
      break;
    }
    case 'security':{
      for(let i=0;i<3;i++){
        const m=new THREE.Mesh(planeGeo(0.62,0.44,1),screenMat('cams'));
        m.position.set(-36.4+i*0.72,2.0,-7.6); m.rotation.x=0.12; g.add(m);
      }
      const shelf=new THREE.Mesh(panelBox(2.4,0.1,0.5,1),MAT.metalDark); shelf.position.set(-35.7,1.7,-7.6); g.add(shelf);
      break;
    }
    case 'storage':{
      const spots=[[-17.6,4.2,1.1],[-16.2,4.4,0.9],[-17.4,13.8,1.2],[-15.8,14.2,0.8],[-8.2,14.4,1.0],[-8.4,3.6,1.1]];
      spots.forEach(([x,z,s],i)=>crate(x,z,s,[0x8a7a5c,0x6d7f6a,0x7d6a7f][i%3]));
      // chute
      const ch=new THREE.Mesh(panelBox(1.8,2.2,1.2,1.4),MAT.metalDark); setColor(ch.geometry,0x59636f);
      ch.position.set(-9.6,1.1,14.6); g.add(ch);
      const maw=new THREE.Mesh(planeGeo(1.3,1.2,1),new THREE.MeshBasicMaterial({color:0x080c14,toneMapped:false,fog:false}));
      maw.position.set(-9.6,1.1,13.98); g.add(maw);
      // fuel canisters
      for(let i=0;i<3;i++){
        const t=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.8,12),new THREE.MeshStandardMaterial({color:0xc9a227,roughness:.55,metalness:.3}));
        t.position.set(-18.1,0.4,6.6+i*0.8); g.add(t);
      }
      break;
    }
    case 'weapons':{
      const turr=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.7,0.5,14),MAT.metal); setColor(turr.geometry,0x77808f);
      turr.position.set(4.4,0.9,-15.9); g.add(turr);
      const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.13,2.0,10),MAT.metalDark);
      bar.rotation.x=Math.PI/2.4; bar.position.set(4.4,1.4,-16.6); g.add(bar);
      const tip=new THREE.MeshBasicMaterial({color:0xff9a3c,toneMapped:false,fog:false});
      const muzz=new THREE.Mesh(new THREE.SphereGeometry(0.14,10,8),tip);
      muzz.position.set(4.4,1.85,-17.4); g.add(muzz);
      SHIP.turretMuzzle=muzz; SHIP.turret=bar;
      break;
    }
    case 'o2':{
      const pot=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.55,0.6,14),MAT.metalDark); setColor(pot.geometry,0x6d5a45);
      pot.position.set(7.6,-9.2,0.3); g.add(pot);
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.16,1.1,8),new THREE.MeshStandardMaterial({color:0x6b4a2c,roughness:.95}));
      trunk.position.set(7.6,-8.6,0.85); g.add(trunk);
      for(let i=0;i<7;i++){
        const lf=new THREE.Mesh(new THREE.SphereGeometry(0.34+Math.random()*0.2,8,6),new THREE.MeshStandardMaterial({color:i%2?0x3f8f3a:0x57b04a,roughness:.9}));
        lf.position.set(7.6+(Math.random()-.5)*1.1,-8.6,1.5+Math.random()*0.7); lf.scale.y=0.7; g.add(lf);
      }
      SHIP.o2Tree=g;
      // tanks
      for(let i=0;i<3;i++){
        const t=new THREE.Mesh(new THREE.CapsuleGeometry(0.28,0.7,6,12),new THREE.MeshStandardMaterial({color:0x4ea3ff,roughness:.4,metalness:.5}));
        t.position.set(3.2+i*0.7,0.65,-12.2); g.add(t);
      }
      break;
    }
    case 'navigation':{
      const desk=new THREE.Mesh(panelBox(4.4,0.16,1.1,1.4),MAT.metal); setColor(desk.geometry,0x77808f);
      desk.position.set(28.4,0.94,0); desk.rotation.y=Math.PI/2; g.add(desk);
      for(let i=0;i<3;i++){
        const m=new THREE.Mesh(planeGeo(1.0,0.6,1),screenMat(i===1?'radar':'chart'));
        m.position.set(28.9,1.5,-1.5+i*1.5); m.rotation.y=-Math.PI/2; g.add(m);
      }
      const wheel=new THREE.Mesh(new THREE.TorusGeometry(0.42,0.055,8,22),MAT.metalDark); setColor(wheel.geometry,0x9aa5b5);
      wheel.position.set(28.0,1.25,0); wheel.rotation.y=Math.PI/2; g.add(wheel);
      SHIP.navWheel=wheel;
      break;
    }
    case 'shields':{
      for(let r=0;r<3;r++)for(let q=0;q<4;q++){
        const x=16.2+q*1.5+(r%2?0.75:0), z=2.2+r*1.5;
        const shape=new THREE.Shape();
        for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; shape.lineTo(Math.cos(a)*0.6,Math.sin(a)*0.6); }
        const hg=new THREE.ExtrudeGeometry(shape,{depth:0.14,bevelEnabled:false,curveSegments:1});
        hg.rotateY(Math.PI/2);
        const hm=new THREE.Mesh(hg,new THREE.MeshStandardMaterial({color:0x4a5462,roughness:.55,metalness:.55}));
        hm.position.set(21.2,0.9+r*0.05,z); hm.position.x=x; hm.rotation.y=0;
        hm.position.set(x,1.1,z); g.add(hm);
      }
      break;
    }
    case 'communications':{
      for(let i=0;i<4;i++){
        const f=new THREE.Mesh(planeGeo(0.5,0.9,1),new THREE.MeshBasicMaterial({color:0x1a2436,toneMapped:false,fog:false}));
        f.position.set(5.2+i*0.7,1.3,10.3); f.rotation.x=Math.PI; g.add(f);
      }
      break;
    }
    case 'admin':{
      for(let i=0;i<4;i++){
        const ch=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.3,0.46,10),MAT.metalDark); setColor(ch.geometry,0x59636f);
        ch.position.set(-14.6+i*1.1,0.23,0.4); g.add(ch);
      }
      break;
    }
  }
  if(room.corridor){
    // ceiling pipes + conduit strips
    const horiz=b.w>b.h;
    const n=Math.max(1,Math.round((horiz?b.w:b.h)/6));
    for(let i=0;i<n;i++){
      const t=(i+0.5)/n;
      if(horiz){
        const x=b.x1+t*b.w;
        pipe(x,b.z1+0.3,x,b.z2-0.3,M.map.wallH-0.34,0.075,0x6d7787);
      } else {
        const z=b.z1+t*b.h;
        pipe(b.x1+0.3,z,b.x2-0.3,z,M.map.wallH-0.34,0.075,0x6d7787);
      }
    }
  }
  return g.children.length?g:null;
}

/* ============================================================================
   Crewmate
   ========================================================================== */
const BODY_PROFILE=[[0,0],[0.235,0.012],[0.295,0.06],[0.325,0.17],[0.34,0.34],[0.345,0.52],[0.335,0.68],
                    [0.315,0.82],[0.285,0.93],[0.24,1.01],[0.18,1.055],[0.1,1.075],[0,1.08]];
function crewBodyGeo(detail){
  const pts=BODY_PROFILE.map(p=>new THREE.Vector2(p[0],p[1]));
  const g=new THREE.LatheGeometry(pts,detail||20);
  g.scale(1,1,0.86);
  return g;
}
function roundedRectShape(w,h,r){
  const s=new THREE.Shape();
  s.moveTo(-w/2+r,-h/2);
  s.lineTo(w/2-r,-h/2); s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
  s.lineTo(w/2,h/2-r); s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);
  s.lineTo(-w/2+r,h/2); s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
  s.lineTo(-w/2,-h/2+r); s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  return s;
}
function makeCrewmate(opts){
  opts=opts||{};
  const color=opts.color===undefined?0xC61111:opts.color;
  const visor=opts.visor===undefined?0x8AD5F0:opts.visor;
  const detail=opts.detail||20;
  const grp=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color,roughness:opts.rough||0.52,metalness:0.02,envMapIntensity:0.8});
  const darkMat=new THREE.MeshStandardMaterial({color:shade(color,0.74),roughness:0.6,metalness:0.03,envMapIntensity:0.7});
  const body=new THREE.Mesh(crewBodyGeo(detail),bodyMat);
  grp.add(body);
  // backpack
  const bpShape=roundedRectShape(0.42,0.5,0.16);
  const bp=new THREE.Mesh(new THREE.ExtrudeGeometry(bpShape,{depth:0.2,bevelEnabled:true,bevelSize:0.05,bevelThickness:0.05,bevelSegments:3,curveSegments:8}),darkMat);
  bp.position.set(0,0.44,-0.30); bp.rotation.y=Math.PI;
  grp.add(bp);
  // visor
  const vShape=roundedRectShape(0.40,0.235,0.105);
  const vGeo=new THREE.ExtrudeGeometry(vShape,{depth:0.15,bevelEnabled:true,bevelSize:0.035,bevelThickness:0.035,bevelSegments:3,curveSegments:12});
  const vMat=new THREE.MeshStandardMaterial({color:visor,roughness:0.09,metalness:0.42,envMapIntensity:1.6});
  const vis=new THREE.Mesh(vGeo,vMat);
  vis.position.set(0.028,0.845,0.145);
  grp.add(vis);
  // visor rim
  const rimShape=roundedRectShape(0.45,0.285,0.12);
  const rim=new THREE.Mesh(new THREE.ExtrudeGeometry(rimShape,{depth:0.05,bevelEnabled:false,curveSegments:10}),
    new THREE.MeshStandardMaterial({color:shade(color,0.82),roughness:0.45,metalness:0.25}));
  rim.position.set(0.028,0.845,0.135); grp.add(rim);
  // visor highlight
  const hl=new THREE.Mesh(planeGeo(0.16,0.055,1),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,toneMapped:false,fog:false,depthWrite:false}));
  hl.position.set(-0.06,0.905,0.30); hl.rotation.z=-0.22; grp.add(hl);
  // legs
  const legs=[];
  for(const sx of [-1,1]){
    const pivot=new THREE.Group(); pivot.position.set(sx*0.145,0.2,0.01);
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(0.105,0.12,5,12),darkMat);
    leg.position.y=-0.1; leg.scale.set(1,1,1.15);
    pivot.add(leg); grp.add(pivot); legs.push(pivot);
  }
  // blob shadow
  const sh=new THREE.Mesh(planeGeo(1.0,1.0,1),MAT.blob.clone());
  sh.rotation.x=-Math.PI/2; sh.position.y=0.012; grp.add(sh);
  grp.userData={bodyMat,darkMat,vMat,legs,shadow:sh,shadowMat:sh.material,visor:vis,hl};
  return grp;
}
function setGhostly(crew,on){
  const u=crew.userData;
  [u.bodyMat,u.darkMat,u.vMat].forEach(m=>{
    m.transparent=on; m.opacity=on?0.42:1; m.depthWrite=!on;
    if(on){ m.emissive=new THREE.Color(0x2a6fa8); m.emissiveIntensity=0.35; }
    else { m.emissive=new THREE.Color(0x000000); m.emissiveIntensity=0; }
    m.needsUpdate=true;
  });
  u.shadowMat.opacity=on?0.16:0.6;
}
/* dead body: lower half + bone + blood */
function makeBody(colorHex,visorHex){
  const grp=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:colorHex,roughness:.6,metalness:.02});
  const pts=[[0,0],[0.25,0.01],[0.31,0.07],[0.335,0.18],[0.34,0.3],[0.33,0.42],[0.2,0.47],[0,0.48]]
    .map(p=>new THREE.Vector2(p[0],p[1]));
  const half=new THREE.Mesh(new THREE.LatheGeometry(pts,18),mat);
  half.scale.set(1,1,0.86);
  half.rotation.z=Math.PI/2*0.92; half.rotation.y=0.4;
  half.position.y=0.2;
  grp.add(half);
  const boneMat=new THREE.MeshStandardMaterial({color:0xf2ead8,roughness:.5,metalness:.05});
  const bone=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.055,0.52,8),boneMat);
  shaft.position.y=0.26; bone.add(shaft);
  for(const s of [-1,1]){
    const k=new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8),boneMat);
    k.position.set(s*0.07,0.53,0); bone.add(k);
    const k2=new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8),boneMat);
    k2.position.set(s*0.06,0.5,-0.06); bone.add(k2);
  }
  bone.position.set(0.05,0.28,0); bone.rotation.z=-0.5; bone.rotation.x=0.25;
  grp.add(bone);
  const blood=new THREE.Mesh(planeGeo(1.9,1.9,1),MAT.blood);
  blood.rotation.x=-Math.PI/2; blood.rotation.z=Math.random()*3; blood.position.y=0.014;
  grp.add(blood);
  grp.userData={bone,half};
  return grp;
}
/* first-person hand */
function makeHand(colorHex){
  const grp=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:colorHex,roughness:.5,metalness:.02,envMapIntensity:.9});
  const palm=new THREE.Mesh(new THREE.SphereGeometry(0.085,16,12),mat);
  palm.scale.set(1,0.78,1.16); grp.add(palm);
  for(let i=0;i<3;i++){
    const f=new THREE.Mesh(new THREE.CapsuleGeometry(0.028,0.075,4,8),mat);
    f.position.set(-0.045+i*0.045,0.01,0.115); f.rotation.x=Math.PI/2-0.25; grp.add(f);
  }
  const thumb=new THREE.Mesh(new THREE.CapsuleGeometry(0.03,0.06,4,8),mat);
  thumb.position.set(0.085,0.0,0.055); thumb.rotation.z=-0.7; thumb.rotation.x=0.4; grp.add(thumb);
  const cuff=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.085,0.09,14),new THREE.MeshStandardMaterial({color:shade(colorHex,0.78),roughness:.6}));
  cuff.rotation.x=Math.PI/2-0.2; cuff.position.set(0,-0.01,-0.1); grp.add(cuff);
  grp.userData={mat};
  return grp;
}
/* name tag sprite */
function makeNameTag(name,colorCss){
  const W=256,H=64,c=cnv(W,H),g=c.getContext('2d');
  g.clearRect(0,0,W,H);
  g.font='900 34px "Baloo 2","Trebuchet MS",sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.lineWidth=8; g.strokeStyle='rgba(4,7,14,.9)'; g.strokeText(name,W/2,H/2);
  g.fillStyle='#ffffff'; g.fillText(name,W/2,H/2);
  g.fillStyle=colorCss; g.beginPath(); g.arc(W/2-g.measureText(name).width/2-18,H/2,7,0,7); g.fill();
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:false}));
  s.scale.set(1.5,0.375,1);
  return s;
}
