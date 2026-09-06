/* ============================================================= MAP BUILDER
   Converts the Skeld tile topology into 3D walls/floor + collision + consoles,
   vents, doors, and the emergency button. Returns a `World` object.          */

const WALL_H = 3.0;
const WALL_T = 0.34;

function mergeGeoms(geoms){
  let posCount=0, idxCount=0;
  geoms.forEach(g=>{ posCount+=g.attributes.position.count; idxCount+=(g.index?g.index.count:g.attributes.position.count); });
  const pos=new Float32Array(posCount*3), nor=new Float32Array(posCount*3), uv=new Float32Array(posCount*2);
  const idx=new Uint32Array(idxCount); let vOff=0, iOff=0;
  geoms.forEach(g=>{
    const p=g.attributes.position, n=g.attributes.normal, u=g.attributes.uv, gi=g.index;
    pos.set(p.array, vOff*3); nor.set(n.array, vOff*3); if(u) uv.set(u.array, vOff*2);
    if(gi){ for(let i=0;i<gi.count;i++) idx[iOff++]=gi.getX(i)+vOff; }
    else { for(let i=0;i<p.count;i++) idx[iOff++]=i+vOff; }
    vOff+=p.count;
  });
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv,2));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  return geo;
}
const UNIT_BOX = new THREE.BoxGeometry(1,1,1);

function makeRoomLabel(text){
  const c=makeCanvas(512,128), g=c.getContext('2d');
  g.font='900 84px "Trebuchet MS",Arial,sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.lineWidth=14; g.strokeStyle='rgba(0,0,0,0.6)'; g.strokeText(text,256,64);
  g.fillStyle='#dff2ff'; g.fillText(text,256,64);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t, transparent:true, depthWrite:false, opacity:0.9}));
  s.scale.set(6,1.5,1); s.renderOrder=20;
  return s;
}

const WORLD = {   // populated by buildMap
  group:null, originX:0, originZ:0, minX:0,maxX:0,minZ:0,maxZ:0,
  walk:null, walkW:0, walkH:0, walkX0:0, walkZ0:0,
  collision:[],      // {x0,x1,z0,z1} world-space rects
  doors:[],          // {mesh, x,z, axis, span, closed, group, openY, closedY}
  vents:[],          // {name,x,z,net,mesh}
  consoles:[],       // {task,room,x,z,mesh,screen,label}
  spawn:null, emergency:null,
};

// world coordinate from tile coordinate
function wtx(x){ return (x - WORLD.originX) * TILE; }
function wtz(z){ return (z - WORLD.originZ) * TILE; }
function tileCenter(x,z){ return {x: wtx(x), z: wtz(z)}; }

function buildMap(scene){
  const tiles = MAP.tileSet();
  const keys = [...tiles].map(k=>k.split(',').map(Number));
  let mnx=Infinity,mxx=-Infinity,mnz=Infinity,mxz=-Infinity;
  keys.forEach(([x,z])=>{ mnx=Math.min(mnx,x); mxx=Math.max(mxx,x); mnz=Math.min(mnz,z); mxz=Math.max(mxz,z); });
  WORLD.originX=(mnx+mxx+1)/2; WORLD.originZ=(mnz+mxz+1)/2;
  WORLD.minX=mnx; WORLD.maxX=mxx; WORLD.minZ=mnz; WORLD.maxZ=mxz;

  const group = new THREE.Group();
  WORLD.group = group;

  // ---- floor ----
  const floorW = (mxx-mnx+1)*TILE, floorD=(mxz-mnz+1)*TILE;
  const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
  const floorTex2 = TEX.floor.clone(); floorTex2.repeat.set(floorW/6, floorD/6); floorTex2.needsUpdate=true;
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({map:floorTex2, roughness:0.85, metalness:0.04, side:THREE.DoubleSide}));
  floor.rotation.x = -Math.PI/2;
  floor.position.set(0,0,0);
  floor.receiveShadow = true;
  group.add(floor);

  // subtle ceiling-glow plane far above (keeps scene from feeling empty)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(floorW*1.4,floorD*1.4),
    new THREE.MeshBasicMaterial({color:0x0a1822, side:THREE.DoubleSide}));
  glow.rotation.x = Math.PI/2; glow.position.y = 60; group.add(glow);

  // ---- walls ----
  const wallGeoms = [];
  const collision = [];
  const addWallBox=(cx,cz,w,d,h,y)=>{
    const g=UNIT_BOX.clone();
    g.scale(w,h,d);
    g.translate(cx, y + h/2, cz);
    wallGeoms.push(g);
  };
  const inTiles=(x,z)=>tiles.has(x+','+z);
  const half = TILE/2;
  const wallMat = new THREE.MeshStandardMaterial({color:0x3b4653, roughness:0.72, metalness:0.08, side:THREE.DoubleSide});
  // iterate tile edges; for each edge that borders non-walkable, add a wall
  const tileAdd = (x,z)=>{
    // east edge (x+0.5): a thin slab spanning z
    if(!inTiles(x+1,z)) addWallBox(wtx(x)+half, wtz(z), WALL_T, TILE, WALL_H, 0);
    // west edge
    if(!inTiles(x-1,z)) addWallBox(wtx(x)-half, wtz(z), WALL_T, TILE, WALL_H, 0);
    // south edge (z+1): a thin slab spanning x
    if(!inTiles(x,z+1)) addWallBox(wtx(x), wtz(z)+half, TILE, WALL_T, WALL_H, 0);
    // north edge
    if(!inTiles(x,z-1)) addWallBox(wtx(x), wtz(z)-half, TILE, WALL_T, WALL_H, 0);
  };
  keys.forEach(([x,z])=>tileAdd(x,z));

  // merge wall geometry (two materials: split by parity for subtle variance)
  const wallsGeo = mergeGeoms(wallGeoms);
  const walls = new THREE.Mesh(wallsGeo, wallMat);
  walls.castShadow = true; walls.receiveShadow = true;
  group.add(walls);

  // ---- collision rects from wall boxes ----
  // rebuilt after doors are placed; for now walls use a conservative tile-based collision
  // build collision as set of blocked tiles (for A*) plus wall rects (for player circle)
  const blocked = new Set();
  keys.forEach(([x,z])=>{
    if(!inTiles(x+1,z)){ blocked.add((x+1)+','+z); }
    if(!inTiles(x-1,z)){ blocked.add((x-1)+','+z); }
    if(!inTiles(x,z+1)){ blocked.add(x+','+(z+1)); }
    if(!inTiles(x,z-1)){ blocked.add(x+','+(z-1)); }
  });
  // Convert blocked tile set into collision rects (merge horizontally per row)
  const byRow = {};
  blocked.forEach(k=>{ const [x,z]=k.split(',').map(Number); (byRow[z]=byRow[z]||[]).push(x); });
  Object.entries(byRow).forEach(([z, xs])=>{
    xs.sort((a,b)=>a-b);
    let s=xs[0], p=xs[0];
    for(let i=1;i<=xs.length;i++){
      if(xs[i]===p+1){ p=xs[i]; continue; }
      // rect from (s-.. ) tile boundary: tile x occupies [wtx(x)-half, wtx(x)+half]
      // blocked tiles are the (non-walkable) ones; we add a rect covering them
      const rect={ x0: wtx(s)-half, x1: wtx(p)+half, z0: wtz(z)-half, z1: wtz(z)+half };
      collision.push(rect);
      s=xs[i]; p=xs[i];
    }
  });

  // ---- walk grid (for bot A*) ----
  let wx0=Infinity,wz0=Infinity,wx1=-Infinity,wz1=-Infinity;
  keys.forEach(([x,z])=>{ wx0=Math.min(wx0,x); wz0=Math.min(wz0,z); wx1=Math.max(wx1,x); wz1=Math.max(wz1,z); });
  WORLD.walkX0=wx0; WORLD.walkZ0=wz0; WORLD.walkW=wx1-wx0+1; WORLD.walkH=wz1-wz0+1;
  const walk = [];
  for(let i=0;i<WORLD.walkH;i++){ const row=[]; for(let j=0;j<WORLD.walkW;j++) row.push(tiles.has((wx0+j)+','+(wz0+i))); walk.push(row); }
  WORLD.walk=walk;

  // ---- colliders exposed ----
  WORLD.collision = collision;

  // ---- room labels ----
  MAP.rooms.forEach(r=>{
    const cx=wtx((r.x0+r.x1)/2), cz=wtz((r.z0+r.z1)/2);
    const label=makeRoomLabel(r.name.toUpperCase());
    label.position.set(cx, WALL_H+0.4, cz);
    group.add(label);
    r._label=label;
  });

  // ---- vents ----
  const ventGeo = new THREE.PlaneGeometry(1.4,1.4* (TILE/3));
  MAP.vents.forEach(v=>{
    const {x,z}=tileCenter(v.x,v.z);
    const m=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.12,1.5),
      new THREE.MeshStandardMaterial({map:TEX.vent, roughness:0.6, metalness:0.3}));
    m.position.set(x,0.08,z); m.receiveShadow=true;
    group.add(m);
    const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.85,1.1,24),
      new THREE.MeshBasicMaterial({color:0x1b6f8c, transparent:true, opacity:0.5, side:THREE.DoubleSide}));
    glowRing.rotation.x=-Math.PI/2; glowRing.position.set(x,0.06,z); group.add(glowRing);
    WORLD.vents.push({name:v.name, x, z, net:v.net, mesh:m, ring:glowRing});
  });

  // ---- emergency button ----
  const e=tileCenter(MAP.emergency.x, MAP.emergency.z);
  const bgroup=new THREE.Group();
  const base=box(0.7,0.3,0.7, mat(0x2b3743,{rough:0.5}), 0,0.15,0); bgroup.add(base);
  const btn=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.24,0.18,20), new THREE.MeshStandardMaterial({color:0xd82424, emissive:0x8a0f0f, emissiveIntensity:0.6, roughness:0.4}));
  btn.position.y=0.44; bgroup.add(btn);
  const flashRing=new THREE.Mesh(new THREE.RingGeometry(0.35,0.5,24), new THREE.MeshBasicMaterial({color:0xff5b5b, transparent:true, opacity:0.5, side:THREE.DoubleSide}));
  flashRing.rotation.x=-Math.PI/2; flashRing.position.y=0.03; bgroup.add(flashRing);
  bgroup.position.set(e.x,0,e.z); bgroup.traverse(o=>{ if(o.isMesh)o.castShadow=true; });
  group.add(bgroup);
  WORLD.emergency={x:e.x, z:e.z, ring:flashRing, btn};

  // ---- admin table + big map ----
  const a=tileCenter(16,19);
  const table=box(2.6,0.5,1.8, mat(0x33414d,{rough:0.55}), a.x,0.25,a.z); group.add(table);
  const tableTop=box(2.8,0.12,2.0, mat(0x1b2631,{rough:0.4}), a.x,0.55,a.z); group.add(tableTop);
  const screen=box(2.0,0.9,0.06, mat(0x0a1620,{emissive:0x2a6f8c, emissiveIntensity:0.5, roughness:0.3}), a.x, 1.3, a.z);
  group.add(screen);

  // ---- task consoles ----
  MAP.consoles.forEach(c=>{
    const {x,z}=tileCenter(c.x,c.z);
    const grp=new THREE.Group();
    const desk=box(0.9,0.9,0.5, mat(0x27333e,{rough:0.6}), 0,0.45,0); grp.add(desk);
    const screenMat=new THREE.MeshStandardMaterial({map:taskPanelTex(taskColor(c.task)), roughness:0.35, emissive:0x123a4d, emissiveIntensity:0.35});
    const scr=new THREE.Mesh(new THREE.PlaneGeometry(0.78,0.58), screenMat);
    scr.position.set(0,0.62,-0.27); scr.rotation.x=0.15; grp.add(scr);
    const light=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.06,0.5), new THREE.MeshBasicMaterial({color:0x6fd6ff}));
    light.position.y=0.92; grp.add(light);
    grp.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    grp.position.set(x,0,z);
    group.add(grp);
    WORLD.consoles.push({task:c.task, room:c.room, x, z, mesh:grp, screen:scr, label:c.room});
  });

  // ---- doors ----
  MAP.corridors.forEach(([x0,z0,x1,z1])=>{
    const horizontal = (x1-x0) >= (z1-z0); // travel along x -> barrier spans z
    const cx=(x0+x1)/2, cz=(z0+z1)/2;
    const wx=wtx(cx), wz=wtz(cz);
    const span=(horizontal? (z1-z0+1):(x1-x0+1))*TILE;
    const drift=(horizontal? TILE: TILE)*0.5; // door sits mid-corridor along travel
    const doorMesh = horizontal? box(0.16,WALL_H,span, mat(0x28404d,{rough:0.35,metal:0.4}), wx, WALL_H/2, wz)
                               : box(span,WALL_H,0.16, mat(0x28404d,{rough:0.35,metal:0.4}), wx, WALL_H/2, wz);
    doorMesh.castShadow=true;
    group.add(doorMesh);
    const door={ mesh:doorMesh, x:wx, z:wz, axis:horizontal?'z':'x', span, closed:false, openY:WALL_H/2 };
    WORLD.doors.push(door);
  });
  setWorldDoorsOpen(true);

  WORLD.spawn={x:wtx(MAP.spawn.x), z:wtz(MAP.spawn.z)};

  scene.add(group);
  return WORLD;
}

function taskColor(task){
  switch(task){
    case 'swipeCard': return '#7fd0ff';
    case 'fixWiring': return '#ffd36a';
    case 'uploadData': case 'downloadData': return '#7fe0c0';
    case 'calibrate': return '#ff9ad6';
    case 'clearAsteroids': return '#ffb36a';
    case 'primeShields': return '#ff6a6a';
    case 'submitScan': return '#9ad0ff';
    case 'emptyChute': case 'emptyGarbage': return '#8ad0a0';
    case 'fuelEngines': return '#ffd36a';
    case 'startReactor': return '#ff8f6a';
    case 'unlockManifolds': return '#b08fff';
    case 'chartCourse': return '#7fe0ff';
    case 'cleanO2Filter': return '#a0e0ff';
    case 'stabilize': return '#c0b0ff';
    case 'cleanVent': return '#9fffd0';
    case 'divertPower': return '#ffe87f';
    case 'alignEngine': return '#ffb0b0';
    default: return '#7fd0ff';
  }
}

// toggle all doors (0=open,1=closed). Used for door sabotage / reset.
function setWorldDoorsOpen(open){
  WORLD.doors.forEach(d=>{
    d.closed = !open;
    d.mesh.position.y = open ? (WALL_H+0.4) : WALL_H/2; // retract above the wall when open
  });
}
function closeDoor(d){ d.closed=true; d.mesh.position.y = WALL_H/2; }
function openDoor(d){ d.closed=false; d.mesh.position.y = WALL_H+0.2; }

/* player circle vs world collision rects */
function resolveCollision(px,pz,radius){
  for(const r of WORLD.collision){
    const cx=clamp(px,r.x0,r.x1), cz=clamp(pz,r.z0,r.z1);
    const dx=px-cx, dz=pz-cz; const d2=dx*dx+dz*dz;
    if(d2 < radius*radius){
      const d=Math.sqrt(d2)||0.0001;
      const push = (radius-d);
      if(d2>0){ px += (dx/d)*push; pz += (dz/d)*push; }
      else {
        // center inside rect: push out along smallest axis
        const left=px-r.x0, right=r.x1-px, up=pz-r.z0, down=r.z1-pz;
        const m=Math.min(left,right,up,down);
        if(m===left) px=r.x0-radius; else if(m===right) px=r.x1+radius;
        else if(m===up) pz=r.z0-radius; else pz=r.z1+radius;
      }
    }
  }
  // closed doors as collision
  for(const d of WORLD.doors){
    if(!d.closed) continue;
    const half=0.1, r = d.axis==='z' ? {x0:d.x-half,x1:d.x+half,z0:d.z-d.span/2,z1:d.z+d.span/2}
                                      : {x0:d.x-d.span/2,x1:d.x+d.span/2,z0:d.z-half,z1:d.z+half};
    const cx=clamp(px,r.x0,r.x1), cz=clamp(pz,r.z0,r.z1);
    const dx=px-cx, dz=pz-cz; const d2=dx*dx+dz*dz;
    if(d2<radius*radius){
      const dd=Math.sqrt(d2)||0.0001; const push=(radius-dd);
      if(d2>0){ px+=(dx/dd)*push; pz+=(dz/dd)*push; }
      else { const left=px-r.x0,right=r.x1-px,up=pz-r.z0,down=r.z1-pz; const m=Math.min(left,right,up,down);
        if(m===left)px=r.x0-radius; else if(m===right)px=r.x1+radius; else if(m===up)pz=r.z0-radius; else pz=r.z1+radius; }
    }
  }
  return {x:px,z:pz};
}

/* A* pathfinding over the tile walk-grid (returns array of world waypoint vec2 or null) */
function worldToTile(x,z){ return {tx:Math.round(x/TILE + WORLD.originX), tz:Math.round(z/TILE + WORLD.originZ)}; }
function tileToWorld(tx,tz){ return {x:wtx(tx), z:wtz(tz)}; }
function inWalk(tx,tz){
  const X=tx-WORLD.walkX0, Z=tz-WORLD.walkZ0;
  return X>=0 && Z>=0 && X<WORLD.walkW && Z<WORLD.walkH && WORLD.walk[Z][X];
}
function findPath(sx,sz,ex,ez){
  const s=worldToTile(sx,sz), e=worldToTile(ex,ez);
  if(!inWalk(s.tx,s.tz) || !inWalk(e.tx,e.tz)) return null;
  const W=WORLD.walkW, H=WORLD.walkH;
  const idx=(tx,tz)=>(tz-WORLD.walkZ0)*W+(tx-WORLD.walkX0);
  const open=[{x:s.tx,z:s.tz,g:0,h:Math.abs(s.tx-e.tx)+Math.abs(s.tz-e.tz),p:-1}];
  const came={}; came[idx(s.tx,s.tz)]=-1;
  const gCost={}; gCost[idx(s.tx,s.tz)]=0;
  const closed=new Set();
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  let found=false, goalIdx=idx(e.tx,e.tz);
  while(open.length){
    // pick lowest f
    let bi=0; for(let i=1;i<open.length;i++) if(open[i].g+open[i].h < open[bi].g+open[bi].h) bi=i;
    const cur=open.splice(bi,1)[0];
    const ci=idx(cur.x,cur.z);
    if(ci===goalIdx){ found=true; break; }
    if(closed.has(ci)) continue;
    closed.add(ci);
    for(const [dx,dz] of dirs){
      const nx=cur.x+dx, nz=cur.z+dz;
      if(!inWalk(nx,nz)) continue;
      let blocked=false;
      if(dx!==0 && dz!==0){ if(!inWalk(cur.x+dx,cur.z) || !inWalk(cur.x,cur.z+dz)) blocked=true; }
      if(blocked) continue;
      const ni=idx(nx,nz);
      const cost=gCost[ci] + (dx&&dz?1.414:1);
      if(gCost[ni]===undefined || cost<gCost[ni]){
        gCost[ni]=cost; came[ni]=ci;
        open.push({x:nx,z:nz,g:cost,h:Math.abs(nx-e.tx)+Math.abs(nz-e.tz),p:ci});
      }
    }
  }
  if(!found) return null;
  const path=[]; let ci=goalIdx;
  while(ci!==-1){ const X=ci%W, Z=(ci/W)|0; path.push({x:WORLD.walkX0+X+0.5, z:WORLD.walkZ0+Z+0.5}); ci=came[ci]; }
  path.reverse();
  // convert tile to world (center of tile)
  return path.map(t=>tileToWorld(t.x,t.z));
}
