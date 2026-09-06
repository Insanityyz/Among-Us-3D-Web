/* ============================================================================
   AMONG US 3D — WEB EDITION
   An original, fan-made first-person 3D social-deduction game built with
   Three.js (WebGL2), made as a tribute to the "3D/VR" style of the genre.
   Everything lives in this one file: CSS, markup and game code.
   ----------------------------------------------------------------------------
   ONLINE PLAY: fully scaffolded but disabled — see `NET` near the bottom.
   Flip NET.ENABLED to true and point NET.URL at a relay to go live. All
   gameplay flows through one authoritative `Server` object, so the local
   loopback transport can be swapped for WebSockets without touching rules.
   ========================================================================== */

// ======================= PURE LOGIC BEGIN =================================
// (No DOM and no THREE references in this block — it is unit-testable alone.)

const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
function dist2(ax,az,bx,bz){ const dx=ax-bx,dz=az-bz; return Math.hypot(dx,dz); }
function makeRng(seed){
  let s=(seed>>>0)||1;
  return function(){ s^=s<<13; s>>>=0; s^=s>>17; s^=s<<5; s>>>=0; return s/4294967296; };
}

/* ---------- palette ---------- */
const COLORS=[
  {id:'red',    name:'Red',    hex:0xC61111, css:'#c61111'},
  {id:'blue',   name:'Blue',   hex:0x132ED2, css:'#132ed2'},
  {id:'green',  name:'Green',  hex:0x117F2D, css:'#117f2d'},
  {id:'pink',   name:'Pink',   hex:0xED54BA, css:'#ed54ba'},
  {id:'orange', name:'Orange', hex:0xEF7D0E, css:'#ef7d0e'},
  {id:'yellow', name:'Yellow', hex:0xF5F557, css:'#f5f557'},
  {id:'black',  name:'Black',  hex:0x3F474E, css:'#3f474e'},
  {id:'white',  name:'White',  hex:0xD6E0F0, css:'#d6e0f0'},
  {id:'purple', name:'Purple', hex:0x6B2FBC, css:'#6b2fbc'},
  {id:'brown',  name:'Brown',  hex:0x71491E, css:'#71491e'},
  {id:'cyan',   name:'Cyan',   hex:0x38FEDC, css:'#38fedc'},
  {id:'lime',   name:'Lime',   hex:0x50EF39, css:'#50ef39'},
  {id:'maroon', name:'Maroon', hex:0x711515, css:'#711515'},
  {id:'rose',   name:'Rose',   hex:0xEC7578, css:'#ec7578'},
  {id:'banana', name:'Banana', hex:0xFFFEBe, css:'#fffebe'},
  {id:'grey',   name:'Grey',   hex:0x8C959F, css:'#8c959f'},
  {id:'tan',    name:'Tan',    hex:0xD68D54, css:'#d68d54'},
  {id:'coral',  name:'Coral',  hex:0xD76464, css:'#d76464'},
];
const VISORS=[
  {id:'glass',name:'Glass',hex:0x8AD5F0},{id:'mirror',name:'Mirror',hex:0xC7E9FF},
  {id:'onyx',name:'Onyx',hex:0x2A3444},{id:'gold',name:'Gold',hex:0xF2C14E},
  {id:'ruby',name:'Ruby',hex:0xE8607A},{id:'jade',name:'Jade',hex:0x7CE0A0},
];
const BOT_NAMES=['Ace','Nova','Bean','Pixel','Echo','Moss','Ziggy','Rhea','Koda','Juno','Bolt','Sable','Trix','Wisp','Otis','Nyx','Rook','Plum'];
const QUICK_CHAT=[
  'Where?','Who was it?','I saw them vent','That was a self-report','I was doing tasks',
  'Red is sus','Blue is sus','Green is sus','I can prove it','Skip the vote',
  'Throw them out','Trust me on this','My mistake','Nice work','Follow me'
];
const KILL_DIST=[0.95,1.75,2.9];
const KILL_DIST_NAME=['Short','Medium','Long'];

/* ---------- geometry helpers ---------- */
function rect(x1,z1,x2,z2){ return [[x1,z1],[x2,z1],[x2,z2],[x1,z2]]; }
function oct(cx,cz,rx,rz,cut){
  return [[cx-rx+cut,cz-rz],[cx+rx-cut,cz-rz],[cx+rx,cz-rz+cut],[cx+rx,cz+rz-cut],
          [cx+rx-cut,cz+rz],[cx-rx+cut,cz+rz],[cx-rx,cz+rz-cut],[cx-rx,cz-rz+cut]];
}
function navPoly(x1,z1,x2,z2,px,py){
  return [[x1,z1],[x2,z1],[x2+px,z1+py],[x2+px,z2-py],[x2,z2],[x1,z2]];
}
function bbox(poly){
  let x1=1e9,z1=1e9,x2=-1e9,z2=-1e9;
  for(const p of poly){ if(p[0]<x1)x1=p[0]; if(p[0]>x2)x2=p[0]; if(p[1]<z1)z1=p[1]; if(p[1]>z2)z2=p[1]; }
  return {x1,z1,x2,z2,cx:(x1+x2)/2,cz:(z1+z2)/2,w:x2-x1,h:z2-z1};
}
function pointInPoly(x,z,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],zi=poly[i][1],xj=poly[j][0],zj=poly[j][1];
    if(((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside;
  }
  return inside;
}
function segSeg(p1,p2,p3,p4){
  const d=(p2[0]-p1[0])*(p4[1]-p3[1])-(p2[1]-p1[1])*(p4[0]-p3[0]);
  if(Math.abs(d)<1e-9) return null;
  const t=((p3[0]-p1[0])*(p4[1]-p3[1])-(p3[1]-p1[1])*(p4[0]-p3[0]))/d;
  const u=((p3[0]-p1[0])*(p2[1]-p1[1])-(p3[1]-p1[1])*(p2[0]-p1[0]))/d;
  if(t>=0&&t<=1&&u>=0&&u<=1) return [p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])];
  return null;
}
/* circle (x,z,r) vs oriented box -> push-out displacement or null */
function circleVsOBB(px,pz,r,b){
  const ca=Math.cos(-b.a), sa=Math.sin(-b.a);
  const dx=px-b.cx, dz=pz-b.cz;
  const lx=dx*ca-dz*sa, lz=dx*sa+dz*ca;
  const qx=clamp(lx,-b.hx,b.hx), qz=clamp(lz,-b.hz,b.hz);
  const ox=lx-qx, oz=lz-qz;
  const cc=Math.cos(b.a), ss=Math.sin(b.a);
  const d2=ox*ox+oz*oz;
  if(d2>r*r) return null;
  let wx,wz,depth;
  if(d2>1e-8){
    const d=Math.sqrt(d2); depth=r-d;
    const nlx=ox/d*depth, nlz=oz/d*depth;
    wx=nlx*cc-nlz*ss; wz=nlx*ss+nlz*cc;
  } else {
    const px2=b.hx-Math.abs(lx), pz2=b.hz-Math.abs(lz);
    if(px2<pz2){ const nlx=(lx>=0?1:-1)*(px2+r); wx=nlx*cc; wz=nlx*ss; depth=px2+r; }
    else { const nlz=(lz>=0?1:-1)*(pz2+r); wx=-nlz*ss; wz=nlz*cc; depth=pz2+r; }
  }
  return {x:wx,z:wz,depth};
}

/* ============================================================================
   THE SKELD — map authoring.
   Rooms and corridors are non-overlapping polygons. Wherever two polygons
   touch, the wall between them is opened automatically; `doors` narrow such
   an opening to doorway width and add a sliding door.
   ========================================================================== */
const MAP={
  id:'skeld', name:'The Skeld', wallH:3.15, wallT:0.34,
  rooms:[
    {id:'reactor',       name:'Reactor',        accent:0xff5a3c, poly:[[-50,-6.5],[-47.5,-9],[-43.5,-9],[-41,-6.5],[-41,6.5],[-43.5,9],[-47.5,9],[-50,6.5]]},
    {id:'upper_engine',  name:'Upper Engine',   accent:0x7fa7ff, poly:rect(-37.6,-19,-30,-13)},
    {id:'security',      name:'Security',       accent:0x4de3ff, poly:rect(-37.6,-8,-33,-2)},
    {id:'lower_engine',  name:'Lower Engine',   accent:0x7fa7ff, poly:rect(-37.6,13,-30,19)},
    {id:'electrical',    name:'Electrical',     accent:0xffd23f, poly:rect(-37.6,3,-27.6,11)},
    {id:'medbay',        name:'MedBay',         accent:0x5ef08b, poly:rect(-32,-16,-25,-10)},
    {id:'cafeteria',     name:'Cafeteria',      accent:0x8fb4ff, poly:oct(-14,-14,8,7,2.5)},
    {id:'admin',         name:'Admin',          accent:0x90a4ae, poly:rect(-17,-6,-9,2)},
    {id:'storage',       name:'Storage',        accent:0xcfd8dc, poly:rect(-19,2,-6,16)},
    {id:'weapons',       name:'Weapons',        accent:0xff7043, poly:rect(-2,-21,8,-15)},
    {id:'o2',            name:'O2',             accent:0x7ce38b, poly:rect(2,-13,10,-7)},
    {id:'navigation',    name:'Navigation',     accent:0x4dd8ff, poly:navPoly(24,-12,28,12,3.5,6)},
    {id:'shields',       name:'Shields',        accent:0xb388ff, poly:rect(15,1,22,8)},
    {id:'communications',name:'Communications', accent:0xffb74d, poly:rect(4,4,12,11)},
    {id:'west_hall',     name:'West Hallway',   accent:0x5b6b86, poly:rect(-41,-19,-37.6,19), corridor:true},
    {id:'caf_med',       name:'Hallway',        accent:0x5b6b86, poly:rect(-25,-15,-22,-11.6), corridor:true},
    {id:'med_elec',      name:'Hallway',        accent:0x5b6b86, poly:rect(-31,-10,-27.6,3), corridor:true},
    {id:'caf_weap',      name:'Hallway',        accent:0x5b6b86, poly:rect(-6,-18,-2,-15), corridor:true},
    {id:'weap_o2',       name:'Hallway',        accent:0x5b6b86, poly:rect(4,-15,7.4,-13), corridor:true},
    {id:'hallway',       name:'Hallway',        accent:0x5b6b86, poly:rect(10,-11.7,24,-8.3), corridor:true},
    {id:'shield_hall',   name:'Hallway',        accent:0x5b6b86, poly:rect(16.3,-8.3,19.7,1), corridor:true},
    {id:'comms_e',       name:'Hallway',        accent:0x5b6b86, poly:rect(12,4.5,15,7.9), corridor:true},
    {id:'storage_comms', name:'Hallway',        accent:0x5b6b86, poly:rect(-6,4.7,4,8.1), corridor:true},
    {id:'elec_storage',  name:'Hallway',        accent:0x5b6b86, poly:rect(-27.6,4.7,-19,8.1), corridor:true},
    {id:'caf_admin',     name:'Hallway',        accent:0x5b6b86, poly:rect(-15.7,-7,-12.3,-6), corridor:true},
  ],
  doors:[
    {id:'d_caf_w',  room:'cafeteria',   side:'W', a:-15,   b:-11.6, auto:true},
    {id:'d_caf_e',  room:'cafeteria',   side:'E', a:-18,   b:-15,   auto:true},
    {id:'d_caf_s',  room:'cafeteria',   side:'S', a:-15.7, b:-12.3, auto:true},
    {id:'d_med_e',  room:'medbay',      side:'E', a:-15,   b:-11.6, auto:true},
    {id:'d_med_s',  room:'medbay',      side:'S', a:-31,   b:-27.6, auto:true},
    {id:'d_elec_n', room:'electrical',  side:'N', a:-31,   b:-27.6, auto:true},
    {id:'d_elec_e', room:'electrical',  side:'E', a:5.2,   b:7.6,   auto:true},
    {id:'d_sec_w',  room:'security',    side:'W', a:-6,    b:-3,    auto:true},
    {id:'d_ue_w',   room:'upper_engine',side:'W', a:-17.5, b:-14.5, auto:true},
    {id:'d_le_w',   room:'lower_engine',side:'W', a:14.5,  b:17.5,  auto:true},
    {id:'d_reac_n', room:'reactor',     side:'E', a:-5.5,  b:-2.5,  auto:false},
    {id:'d_reac_s', room:'reactor',     side:'E', a:2.5,   b:5.5,   auto:false},
    {id:'d_stor_n', room:'storage',     side:'N', a:-15.5, b:-12.5, auto:true},
    {id:'d_stor_e', room:'storage',     side:'E', a:5.2,   b:7.6,   auto:true},
    {id:'d_nav_w',  room:'navigation',  side:'W', a:-11.7, b:-8.3,  auto:false},
    // observation windows (open the wall visually, still solid to walk through)
    {id:'w_caf',  room:'cafeteria',  side:'N', a:-18.6, b:-12.4, win:true, y0:1.05, y1:2.45},
    {id:'w_nav',  room:'navigation', side:'E', a:-4.2,  b:4.2,   win:true, y0:0.85, y1:2.5},
    {id:'w_weap', room:'weapons',    side:'N', a:1.0,   b:5.0,   win:true, y0:1.15, y1:2.35},
    {id:'w_stor', room:'storage',    side:'S', a:-13.0, b:-9.0,  win:true, y0:1.15, y1:2.35},
  ],
};

/* ---------- vents (14 vents, 6 networks — as on the real Skeld) ---------- */
const VENTS=[
  {id:'v_caf',    room:'cafeteria',    x:-18.4,z:-18.2,net:'A'},
  {id:'v_admin',  room:'admin',        x:-10.2,z:0.6,  net:'A'},
  {id:'v_hall',   room:'hallway',      x:20.5, z:-10,  net:'A'},
  {id:'v_med',    room:'medbay',       x:-31.1,z:-14.9,net:'B'},
  {id:'v_elec',   room:'electrical',   x:-36.6,z:9.8,  net:'B'},
  {id:'v_sec',    room:'security',     x:-36.6,z:-3.1, net:'B'},
  {id:'v_ue',     room:'upper_engine', x:-33.2,z:-17.8,net:'C'},
  {id:'v_reac_n', room:'reactor',      x:-47.6,z:-6.2, net:'C'},
  {id:'v_le',     room:'lower_engine', x:-33.2,z:17.8, net:'D'},
  {id:'v_reac_s', room:'reactor',      x:-47.6,z:6.2,  net:'D'},
  {id:'v_weap',   room:'weapons',      x:6.4,  z:-19.6,net:'E'},
  {id:'v_nav_n',  room:'navigation',   x:27.4, z:-10.4,net:'E'},
  {id:'v_shield', room:'shields',      x:20.6, z:6.6,  net:'F'},
  {id:'v_nav_s',  room:'navigation',   x:27.4, z:10.4, net:'F'},
];
const VENT_NET={A:['v_caf','v_admin','v_hall'],B:['v_med','v_elec','v_sec'],
                C:['v_ue','v_reac_n'],D:['v_le','v_reac_s'],
                E:['v_weap','v_nav_n'],F:['v_shield','v_nav_s']};

/* ---------- security cameras ---------- */
const CAMS=[
  {id:'cam0',name:'MedBay',    x:-23.4,z:-13.3,yaw:270,fov:80},
  {id:'cam1',name:'Admin',     x:-14.0,z:-5.2, yaw:180,fov:82},
  {id:'cam2',name:'West Hall', x:-39.3,z:1.0,  yaw:180,fov:82},
  {id:'cam3',name:'O2 Hall',   x:11.4, z:-10.0,yaw:270,fov:88},
];

/* ---------- stations -------------------------------------------------------
   side N/S/E/W of the room's bounding box (or 'C' for a centre prop with `at`)
   t = 0..1 position along that side. rot = direction the user faces (deg).   */
function _sp(room,side,t,inset){
  const b=room.bb; inset=(inset===undefined)?0.62:inset;
  if(side==='N') return {x:b.x1+t*b.w, z:b.z1+inset, rot:0};
  if(side==='S') return {x:b.x1+t*b.w, z:b.z2-inset, rot:180};
  if(side==='W') return {x:b.x1+inset, z:b.z1+t*b.h, rot:90};
  return {x:b.x2-inset, z:b.z1+t*b.h, rot:270};
}
const STATION_DEFS=[
  {id:'s_reac_a', room:'reactor',      side:'W', t:0.28, kind:'reactor',      label:'Start Reactor'},
  {id:'s_reac_b', room:'reactor',      side:'W', t:0.72, kind:'reactor',      label:'Start Reactor'},
  {id:'s_reac_m', room:'reactor',      side:'N', t:0.50, kind:'manifolds',    label:'Unlock Manifolds'},
  {id:'s_sec_cam',room:'security',     side:'N', t:0.50, kind:'cams',         label:'Security Cams'},
  {id:'s_sec_acc',room:'security',     side:'E', t:0.28, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_sec_wir',room:'security',     side:'E', t:0.72, kind:'wiring',       label:'Fix Wiring'},
  {id:'s_ue_eng', room:'upper_engine', side:'N', t:0.35, kind:'engine',       label:'Align Engine Output'},
  {id:'s_ue_acc', room:'upper_engine', side:'N', t:0.75, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_ue_fuel',room:'upper_engine', side:'E', t:0.50, kind:'fuelengine',   label:'Fuel Engines'},
  {id:'s_le_eng', room:'lower_engine', side:'S', t:0.35, kind:'engine',       label:'Align Engine Output'},
  {id:'s_le_acc', room:'lower_engine', side:'S', t:0.75, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_le_fuel',room:'lower_engine', side:'E', t:0.50, kind:'fuelengine',   label:'Fuel Engines'},
  {id:'s_el_brk', room:'electrical',   side:'N', t:0.22, kind:'breakers',     label:'Divert Power'},
  {id:'s_el_dis', room:'electrical',   side:'N', t:0.55, kind:'distributor',  label:'Calibrate Distributor'},
  {id:'s_el_lit', room:'electrical',   side:'N', t:0.85, kind:'lights',       label:'Fix Lights'},
  {id:'s_el_wir', room:'electrical',   side:'S', t:0.22, kind:'wiring',       label:'Fix Wiring'},
  {id:'s_el_dl',  room:'electrical',   side:'S', t:0.60, kind:'download',     label:'Download Data'},
  {id:'s_mb_scan',room:'medbay',       side:'N', t:0.32, kind:'scan',         label:'Submit Scan'},
  {id:'s_mb_sam', room:'medbay',       side:'N', t:0.72, kind:'sample',       label:'Inspect Sample'},
  {id:'s_mb_vit', room:'medbay',       side:'S', t:0.30, kind:'vitals',       label:'Vitals'},
  {id:'s_cf_dl',  room:'cafeteria',    side:'N', t:0.22, kind:'download',     label:'Download Data'},
  {id:'s_cf_gar', room:'cafeteria',    side:'E', t:0.72, kind:'garbage',      label:'Empty Garbage'},
  {id:'s_cf_wir', room:'cafeteria',    side:'N', t:0.78, kind:'wiring',       label:'Fix Wiring'},
  {id:'s_cf_btn', room:'cafeteria',    side:'C', t:0.50, kind:'emergency',    label:'Emergency Button', at:[-14,-14]},
  {id:'s_ad_card',room:'admin',        side:'W', t:0.30, kind:'card',         label:'Swipe Card'},
  {id:'s_ad_up',  room:'admin',        side:'E', t:0.30, kind:'upload',       label:'Upload Data'},
  {id:'s_ad_tab', room:'admin',        side:'C', t:0.50, kind:'admintable',   label:'Admin Map', at:[-13,-1.6]},
  {id:'s_ad_wir', room:'admin',        side:'E', t:0.72, kind:'wiring',       label:'Fix Wiring'},
  {id:'s_st_wir', room:'storage',      side:'N', t:0.18, kind:'wiring',       label:'Fix Wiring'},
  {id:'s_st_fuel',room:'storage',      side:'W', t:0.28, kind:'fuelcan',      label:'Fuel Engines'},
  {id:'s_st_gar', room:'storage',      side:'W', t:0.62, kind:'garbagechute', label:'Empty Garbage'},
  {id:'s_st_chu', room:'storage',      side:'S', t:0.30, kind:'chutebin',     label:'Empty Chute'},
  {id:'s_wp_ast', room:'weapons',      side:'N', t:0.42, kind:'asteroids',    label:'Clear Asteroids'},
  {id:'s_wp_dl',  room:'weapons',      side:'N', t:0.78, kind:'download',     label:'Download Data'},
  {id:'s_wp_acc', room:'weapons',      side:'E', t:0.50, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_o2_fil', room:'o2',           side:'N', t:0.30, kind:'filter',       label:'Clean O2 Filter'},
  {id:'s_o2_chu', room:'o2',           side:'W', t:0.40, kind:'chute',        label:'Empty Chute'},
  {id:'s_o2_acc', room:'o2',           side:'E', t:0.40, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_o2_sab', room:'o2',           side:'S', t:0.50, kind:'o2panel',      label:'O2 Console'},
  {id:'s_nv_cht', room:'navigation',   side:'N', t:0.35, kind:'chart',        label:'Chart Course'},
  {id:'s_nv_str', room:'navigation',   side:'E', t:0.30, kind:'steering',     label:'Stabilize Steering'},
  {id:'s_nv_dl',  room:'navigation',   side:'S', t:0.30, kind:'download',     label:'Download Data'},
  {id:'s_nv_wir', room:'navigation',   side:'S', t:0.42, kind:'wiring',       label:'Fix Wiring'},
  {id:'s_nv_acc', room:'navigation',   side:'E', t:0.70, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_sh_pri', room:'shields',      side:'N', t:0.40, kind:'shields',      label:'Prime Shields'},
  {id:'s_sh_acc', room:'shields',      side:'E', t:0.50, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_cm_dl',  room:'communications',side:'N',t:0.30, kind:'download',     label:'Download Data'},
  {id:'s_cm_acc', room:'communications',side:'E',t:0.35, kind:'accept',       label:'Accept Diverted Power'},
  {id:'s_cm_sab', room:'communications',side:'S',t:0.50, kind:'comms',        label:'Communications'},
];

/* ---------- task catalogue ---------- */
const TASK_DEFS={
  wiring:       {name:'Fix Wiring',          cat:'common', gen:'wiring'},
  swipe_card:   {name:'Swipe Card',          cat:'common', stages:[['admin','card']]},
  upload_data:  {name:'Upload Data',         cat:'short',  gen:'upload'},
  divert_power: {name:'Divert Power',        cat:'short',  gen:'divert'},
  align_engine: {name:'Align Engine Output', cat:'long',   stages:[['upper_engine','engine'],['lower_engine','engine']]},
  calibrate:    {name:'Calibrate Distributor',cat:'short', stages:[['electrical','distributor']]},
  chart_course: {name:'Chart Course',        cat:'short',  stages:[['navigation','chart']]},
  steering:     {name:'Stabilize Steering',  cat:'short',  stages:[['navigation','steering']]},
  asteroids:    {name:'Clear Asteroids',     cat:'long',   visual:true, stages:[['weapons','asteroids']]},
  shields:      {name:'Prime Shields',       cat:'short',  visual:true, stages:[['shields','shields']]},
  scan:         {name:'Submit Scan',         cat:'long',   visual:true, stages:[['medbay','scan']]},
  sample:       {name:'Inspect Sample',      cat:'long',   stages:[['medbay','sample']]},
  reactor:      {name:'Start Reactor',       cat:'long',   stages:[['reactor','reactor']]},
  manifolds:    {name:'Unlock Manifolds',    cat:'short',  stages:[['reactor','manifolds']]},
  fuel:         {name:'Fuel Engines',        cat:'long',   stages:[['storage','fuelcan'],['upper_engine','fuelengine'],['storage','fuelcan'],['lower_engine','fuelengine']]},
  garbage:      {name:'Empty Garbage',       cat:'long',   visual:true, stages:[['cafeteria','garbage'],['storage','garbagechute']]},
  chute:        {name:'Empty Chute',         cat:'long',   visual:true, stages:[['o2','chute'],['storage','chutebin']]},
  o2filter:     {name:'Clean O2 Filter',     cat:'short',  stages:[['o2','filter']]},
  clean_vent:   {name:'Clean Vent',          cat:'short',  gen:'vent'},
};
const WIRING_ORDER=['electrical','storage','admin','navigation','cafeteria','security'];
const UPLOAD_SOURCES=['cafeteria','communications','electrical','navigation','weapons'];
const DIVERT_TARGETS=['communications','lower_engine','navigation','o2','security','shields','upper_engine','weapons'];

const DEFAULT_SETTINGS={
  map:'skeld', maxPlayers:10, botCount:9, impostors:2,
  crewVision:1, impostorVision:1.5, playerSpeed:1.25,
  killCooldown:25, killDistance:1, sabCooldown:25,
  emergCooldown:15, emergencies:1, discussion:20, voting:90,
  anonVotes:false, confirmEjects:true,
  commonTasks:1, longTasks:1, shortTasks:2, visualTasks:true, taskBar:'meetings',
  freeplay:false,
};
const CLIENT_DEFAULTS={
  sensitivity:1.0, invertY:false, fov:78, thirdPerson:false, screenShake:true,
  masterVol:0.8, sfxVol:0.9, musicVol:0.45, showFps:false, quality:'high', bloom:true,
  headBob:true, shadows:true,
};

/* ============================================================================
   buildMap — turns the authored data into walls, doors, openings, nav graph
   ========================================================================== */
function buildMap(map){
  const rooms=map.rooms.map(r=>{ const o=Object.assign({},r); o.bb=bbox(o.poly); return o; });
  const byId={}; rooms.forEach(r=>byId[r.id]=r);
  const polys=rooms.map(r=>({room:r,poly:r.poly}));

  const stations=[];
  for(const s of STATION_DEFS){
    const room=byId[s.room]; if(!room) continue;
    const st=Object.assign({},s);
    if(s.side==='C'){ st.x=s.at[0]; st.z=s.at[1]; st.rot=0; }
    else { const p=_sp(room,s.side,s.t); st.x=p.x; st.z=p.z; st.rot=p.rot; }
    st.roomName=room.name;
    stations.push(st);
  }
  for(const v of VENTS){
    const st={id:'sv_'+v.id, room:v.room, kind:'ventclean', label:'Clean Vent', x:v.x, z:v.z, rot:0,
              vent:v.id, roomName:(byId[v.room]||{name:'Hallway'}).name};
    stations.push(st);
  }
  const stById={}; stations.forEach(s=>stById[s.id]=s);

  /* ---- doors -> world segments ---- */
  const doors=[];
  for(const d of map.doors){
    const room=byId[d.room]; if(!room) continue;
    const b=room.bb, dd=Object.assign({},d);
    if(d.side==='N'){ dd.x1=d.a; dd.x2=d.b; dd.z1=b.z1; dd.z2=b.z1; }
    else if(d.side==='S'){ dd.x1=d.a; dd.x2=d.b; dd.z1=b.z2; dd.z2=b.z2; }
    else if(d.side==='W'){ dd.z1=d.a; dd.z2=d.b; dd.x1=b.x1; dd.x2=b.x1; }
    else { dd.z1=d.a; dd.z2=d.b; dd.x1=b.x2; dd.x2=b.x2; }
    dd.cx=(dd.x1+dd.x2)/2; dd.cz=(dd.z1+dd.z2)/2;
    dd.w=Math.hypot(dd.x2-dd.x1,dd.z2-dd.z1);
    dd.closed=false; dd.roomId=d.room; dd.auto=!!d.auto; dd.win=!!d.win;
    dd.y0=d.y0||0; dd.y1=d.y1||map.wallH;
    doors.push(dd);
  }
  const doorById={}; doors.forEach(d=>doorById[d.id]=d);

  /* ---- walls ---- */
  const walls=[], openings=[], windows=[], wset=new Set();
  const SAMPLE=0.2, EPS=0.07;
  for(const {room,poly} of polys){
    for(let i=0;i<poly.length;i++){
      const A=poly[i], B=poly[(i+1)%poly.length];
      const ex=B[0]-A[0], ez=B[1]-A[1];
      const len=Math.hypot(ex,ez);
      if(len<0.05) continue;
      // inward normal (polygons are authored clockwise in screen space)
      let nx=-ez/len, nz=ex/len;
      { const cxp=A[0]+ex*0.5+nx*0.4, czp=A[1]+ez*0.5+nz*0.4;
        if(!pointInPoly(cxp,czp,poly)){ nx=-nx; nz=-nz; } }
      const n=Math.max(2,Math.ceil(len/SAMPLE));
      const cov=new Array(n).fill(false), covBy=new Array(n).fill(null);
      for(let s=0;s<n;s++){
        const t=(s+0.5)/n, px=A[0]+ex*t, pz=A[1]+ez*t;
        let hit=null;
        for(const o of polys){
          if(o.room===room) continue;
          if(pointInPoly(px+nx*EPS,pz+nz*EPS,o.poly)||pointInPoly(px-nx*EPS,pz-nz*EPS,o.poly)){ hit=o.room.id; break; }
        }
        if(hit){ cov[s]=true; covBy[s]=hit; }
      }
      /* doors narrow the opening to doorway width */
      for(const d of doors){
        if(d.roomId!==room.id) continue;
        let t=-1;
        for(const [px,pz] of [[d.cx,d.cz]]){
          const tt=((px-A[0])*ex+(pz-A[1])*ez)/(len*len);
          const qx=A[0]+ex*tt, qz=A[1]+ez*tt;
          if(tt>=-0.02&&tt<=1.02&&Math.hypot(px-qx,pz-qz)<0.3) t=tt;
        }
        if(t<0) continue;
        const halfW=(d.w/2)/len;
        let s0=clamp(Math.floor(t*n),0,n-1), l=s0, r=s0;
        while(l>0&&cov[l-1]) l--;
        while(r<n-1&&cov[r+1]) r++;
        for(let s=l;s<=r;s++){ cov[s]=false; covBy[s]=null; }
        const a=clamp(Math.floor((t-halfW)*n),0,n-1), b=clamp(Math.ceil((t+halfW)*n)-1,0,n-1);
        for(let s=a;s<=b;s++){ cov[s]=true; covBy[s]='door:'+d.id; }
      }
      /* emit runs */
      let s=0;
      while(s<n){
        if(cov[s]){
          let e=s; while(e+1<n&&cov[e+1]&&covBy[e+1]===covBy[s]) e++;
          const t0=s/n, t1=(e+1)/n;
          const x1=A[0]+ex*t0, z1=A[1]+ez*t0, x2=A[0]+ex*t1, z2=A[1]+ez*t1;
          const kind=covBy[s];
          const dw = kind&&kind.indexOf('door:')===0 ? doorById[kind.slice(5)] : null;
          if(dw&&dw.win){
            // window: keep sill + header as solid wall, record the glass span
            const wl=Math.hypot(x2-x1,z2-z1), ang=Math.atan2(z2-z1,x2-x1);
            if(dw.y0>0.02) walls.push({cx:(x1+x2)/2,cz:(z1+z2)/2,a:ang,hx:wl/2,hz:map.wallT/2,room:room.id,y0:0,y1:dw.y0});
            if(dw.y1<map.wallH-0.02) walls.push({cx:(x1+x2)/2,cz:(z1+z2)/2,a:ang,hx:wl/2,hz:map.wallT/2,room:room.id,y0:dw.y1,y1:map.wallH});
            windows.push({id:dw.id,x1,z1,x2,z2,y0:dw.y0,y1:dw.y1,a:ang,len:wl,room:room.id});
          } else {
            openings.push({x1,z1,x2,z2,a:room.id,kind,nx,nz,w:(e+1-s)/n*len});
          }
          s=e+1;
        } else {
          let e=s; while(e+1<n&&!cov[e+1]) e++;
          const t0=s/n, t1=(e+1)/n;
          const x1=A[0]+ex*t0, z1=A[1]+ez*t0, x2=A[0]+ex*t1, z2=A[1]+ez*t1;
          const wl=Math.hypot(x2-x1,z2-z1);
          if(wl>0.12){
            const k1=Math.round(x1*4)+','+Math.round(z1*4)+','+Math.round(x2*4)+','+Math.round(z2*4);
            const k2=Math.round(x2*4)+','+Math.round(z2*4)+','+Math.round(x1*4)+','+Math.round(z1*4);
            if(!wset.has(k1)&&!wset.has(k2)){
              wset.add(k1);
              walls.push({cx:(x1+x2)/2,cz:(z1+z2)/2,a:Math.atan2(z2-z1,x2-x1),hx:wl/2,hz:map.wallT/2,room:room.id,y0:0,y1:map.wallH});
            }
          }
          s=e+1;
        }
      }
    }
  }

  /* ---- resolve each opening to the room across from it ---- */
  const links=[];
  for(const o of openings){
    const mx=(o.x1+o.x2)/2, mz=(o.z1+o.z2)/2;
    let bId=null;
    if(o.kind&&o.kind.indexOf('door:')===0){
      const _d=doorById[o.kind.slice(5)]; if(_d&&_d.win) continue;
      const across=[mx+o.nx*0.5,mz+o.nz*0.5];
      const behind=[mx-o.nx*0.5,mz-o.nz*0.5];
      for(const {room,poly} of polys){
        if(room.id===o.a) continue;
        if(pointInPoly(across[0],across[1],poly)||pointInPoly(behind[0],behind[1],poly)){ bId=room.id; break; }
      }
    } else bId=o.kind;
    if(!bId||!byId[bId]||bId===o.a) continue;
    links.push({a:o.a,b:bId,x:mx,z:mz,w:o.w,door:(o.kind&&o.kind.indexOf('door:')===0)?o.kind.slice(5):null});
  }
  /* dedupe: one node per room pair.
     A link midpoint must actually be walkable — corridors sometimes report a whole
     shared edge as one "opening" whose midpoint sits inside solid wall, which would
     park bots inside the geometry. Prefer walkable openings, widest first. */
  const openingBlocked=(x,z)=>{
    for(const w of walls) if(circleVsOBB(x,z,0.34,w)) return true;
    return false;
  };
  for(const l of links) l.blocked=openingBlocked(l.x,l.z);
  const pairBest={};
  for(const l of links){
    const key=[l.a,l.b].sort().join('|');
    const cur=pairBest[key];
    if(!cur){ pairBest[key]=l; continue; }
    if(cur.blocked&&!l.blocked){ pairBest[key]=l; continue; }
    if(cur.blocked===!!l.blocked&&l.w>cur.w) pairBest[key]=l;
  }
  const nodes=[]; const nodeIdx={};
  for(const r of rooms){ nodeIdx[r.id]=nodes.length; nodes.push({id:r.id,type:'room',x:r.bb.cx,z:r.bb.cz,room:r.id,adj:[]}); }
  for(const key in pairBest){
    const l=pairBest[key];
    const i=nodes.length;
    nodes.push({id:'open'+i,type:'open',x:l.x,z:l.z,room:null,adj:[],door:l.door,w:l.w});
    const ia=nodeIdx[l.a], ib=nodeIdx[l.b];
    nodes[ia].adj.push(i); nodes[i].adj.push(ia);
    nodes[ib].adj.push(i); nodes[i].adj.push(ib);
  }
  function findPath(fromRoom,toRoom){
    const s=nodeIdx[fromRoom], g=nodeIdx[toRoom];
    if(s===undefined||g===undefined||s===g) return s===g?[{x:nodes[s].x,z:nodes[s].z,type:'room',room:fromRoom}]:null;
    const prev=new Array(nodes.length).fill(-1), seen=new Array(nodes.length).fill(false), q=[s];
    seen[s]=true;
    while(q.length){
      const cur=q.shift();
      if(cur===g) break;
      for(const nx of nodes[cur].adj) if(!seen[nx]){ seen[nx]=true; prev[nx]=cur; q.push(nx); }
    }
    if(!seen[g]) return null;
    const out=[]; let c=g;
    while(c!==-1){ out.unshift({x:nodes[c].x,z:nodes[c].z,type:nodes[c].type,room:nodes[c].room,door:nodes[c].door}); c=prev[c]; }
    return out;
  }
  function roomAt(x,z){ for(const r of rooms) if(pointInPoly(x,z,r.poly)) return r; return null; }

  const segs=walls.map(w=>{ const c=Math.cos(w.a), s=Math.sin(w.a);
    return [[w.cx-c*w.hx,w.cz-s*w.hx],[w.cx+c*w.hx,w.cz+s*w.hx]]; });
  function doorSegs(){
    const out=[];
    for(const d of doors){
      if(!d.closed) continue;
      const a=Math.atan2(d.z2-d.z1,d.x2-d.x1);
      const c=Math.cos(a), s=Math.sin(a);
      out.push([[d.cx-c*d.w/2,d.cz-s*d.w/2],[d.cx+c*d.w/2,d.cz+s*d.w/2]]);
    }
    return out;
  }
  function losClear(x1,z1,x2,z2,extra){
    for(const sg of segs) if(segSeg([x1,z1],[x2,z2],sg[0],sg[1])) return false;
    if(extra) for(const sg of extra) if(segSeg([x1,z1],[x2,z2],sg[0],sg[1])) return false;
    return true;
  }
  /* spawn ring in the cafeteria */
  const spawns=[];
  for(let i=0;i<16;i++){ const a=i/16*TAU; spawns.push({x:-14+Math.cos(a)*4.4,z:-14+Math.sin(a)*4.4}); }

  return {map,rooms,byId,stations,stById,doors,doorById,walls,openings,windows,links,nodes,nodeIdx,
          findPath,roomAt,losClear,segs,doorSegs,vents:VENTS,spawns};
}

/* ---------- tasks ---------- */
function stationIn(M,room,kind,rng){
  const c=M.stations.filter(s=>s.room===room&&s.kind===kind);
  if(!c.length) return null;
  return c[Math.floor(rng()*c.length)%c.length];
}
function makeTaskSet(M,settings,rng){
  rng=rng||Math.random;
  const cats={common:[],short:[],long:[]};
  for(const k in TASK_DEFS) cats[TASK_DEFS[k].cat].push(k);
  function build(key){
    const def=TASK_DEFS[key];
    let stages=null;
    if(def.gen==='wiring'){
      for(let att=0;att<80;att++){
        const idxs=WIRING_ORDER.map((_,i)=>i).sort(()=>rng()-0.5).slice(0,3).sort((a,b)=>a-b);
        const rs=idxs.map(i=>WIRING_ORDER[i]);
        if(rs[0]==='cafeteria'||rs[0]==='security') continue;
        if(rs[2]==='electrical'||rs[2]==='storage') continue;
        const st=rs.map(r=>stationIn(M,r,'wiring',rng));
        if(st.some(s=>!s)) continue;
        stages=st.map(s=>({station:s.id,room:s.room}));
        break;
      }
    } else if(def.gen==='upload'){
      const src=UPLOAD_SOURCES[Math.floor(rng()*UPLOAD_SOURCES.length)%UPLOAD_SOURCES.length];
      const a=stationIn(M,src,'download',rng), b=stationIn(M,'admin','upload',rng);
      if(a&&b) stages=[{station:a.id,room:a.room},{station:b.id,room:b.room}];
    } else if(def.gen==='divert'){
      const tgt=DIVERT_TARGETS[Math.floor(rng()*DIVERT_TARGETS.length)%DIVERT_TARGETS.length];
      const a=stationIn(M,'electrical','breakers',rng), b=stationIn(M,tgt,'accept',rng);
      if(a&&b) stages=[{station:a.id,room:a.room},{station:b.id,room:b.room}];
    } else if(def.gen==='vent'){
      const vs=VENTS.slice().sort(()=>rng()-0.5);
      for(const v of vs){ const s=stByIdGet(M,'sv_'+v.id); if(s){ stages=[{station:s.id,room:s.room}]; break; } }
    } else {
      stages=[];
      for(const [room,kind] of def.stages){
        const s=stationIn(M,room,kind,rng);
        if(!s){ stages=null; break; }
        stages.push({station:s.id,room:s.room});
      }
    }
    if(!stages) return null;
    return {key,name:def.name,cat:def.cat,visual:!!def.visual,stages,stage:0,done:false};
  }
  const out=[], need={common:settings.commonTasks,long:settings.longTasks,short:settings.shortTasks};
  for(const cat of ['common','long','short']){
    const keys=cats[cat].slice().sort(()=>rng()-0.5);
    let made=0, i=0;
    while(made<need[cat]&&i<keys.length*8){
      const t=build(keys[i%keys.length]); i++;
      if(t){ out.push(t); made++; }
    }
  }
  return out;
}
function stByIdGet(M,id){ return M.stById?M.stById[id]:M.stations.find(s=>s.id===id); }
function taskProgress(tasks){
  let done=0,total=0;
  for(const t of tasks){ total+=t.stages.length; done+=Math.min(t.stage,t.stages.length); }
  return total?done/total:0;
}
function assignRoles(players,count,rng){
  rng=rng||Math.random;
  const idx=players.map((_,i)=>i).sort(()=>rng()-0.5);
  players.forEach(p=>p.role='crewmate');
  const imps=[];
  for(let i=0;i<Math.min(count,idx.length);i++){ players[idx[i]].role='impostor'; imps.push(players[idx[i]].id); }
  return imps;
}
function ventById(id){ return VENTS.find(v=>v.id===id)||null; }
function ventLinks(id){ const v=ventById(id); if(!v) return []; return (VENT_NET[v.net]||[]).filter(x=>x!==id); }

/* ---------- sabotage catalogue ---------- */
const SAB_TYPES={
  reactor: {name:'Reactor Meltdown', critical:true, timer:45, icon:'bolt'},
  o2:      {name:'Oxygen Depleted',  critical:true, timer:45, icon:'o2'},
  lights:  {name:'Lights Out',       critical:false,icon:'bolt'},
  comms:   {name:'Comms Sabotaged',  critical:false,icon:'net'},
  doors:   {name:'Doors Closed',     critical:false,icon:'door'},
};

// ======================= PURE LOGIC END ===================================
