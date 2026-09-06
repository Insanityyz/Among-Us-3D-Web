const fs=require('fs');
const src=fs.readFileSync(__dirname+'/30_logic.js','utf8');
const L={};
(new Function('exports',src+'\nexports.buildMap=buildMap;exports.MAP=MAP;exports.VENTS=VENTS;'))(L);
const M=L.buildMap(L.MAP);
const px=-41.5,pz=0;
console.log('rooms near (-41.5,0):');
for(const r of M.rooms){ const b=r.bb; if(px>b.x1-3&&px<b.x2+3&&pz>b.z1-3&&pz<b.z2+3) console.log('  '+r.id+' bb='+JSON.stringify({x1:+b.x1.toFixed(1),z1:+b.z1.toFixed(1),x2:+b.x2.toFixed(1),z2:+b.z2.toFixed(1)})+' corridor='+!!r.corridor); }
console.log('\nroomAt(-41.5,0) =', (M.roomAt(-41.5,0)||{}).id);
console.log('roomAt(-42.5,0) =', (M.roomAt(-42.5,0)||{}).id);
console.log('roomAt(-40.5,0) =', (M.roomAt(-40.5,0)||{}).id);
console.log('\nwall segments within 3.0 of (-41.5,0):');
for(const w of M.walls){ const d=Math.hypot(w.cx-px,w.cz-pz); if(d<3.2) console.log('  room='+w.room+' c=('+w.cx.toFixed(2)+','+w.cz.toFixed(2)+') a='+(w.a||0).toFixed(3)+' hx='+w.hx.toFixed(2)+' hz='+w.hz.toFixed(2)+' len='+(2*Math.hypot(w.hx,w.hz)).toFixed(2)+(w.win?' WINDOW':'')+(w.door?' DOOR':'')); }
console.log('\nopenings near:');
for(const o of (M.openings||[])){ const d=Math.hypot((o.x1+o.x2)/2-px,(o.z1+o.z2)/2-pz); if(d<5) console.log('  '+JSON.stringify(o)); }
console.log('\ndoors near:');
for(const d of M.doors){ const dd=Math.hypot(d.cx-px,d.cz-pz); if(dd<6) console.log('  id='+d.id+' room='+d.room+' c=('+d.cx.toFixed(2)+','+d.cz.toFixed(2)+') w='+d.w.toFixed(2)+' auto='+!!d.auto+' win='+!!d.win); }
console.log('\nnav nodes within 4 of (-41.5,0):');
M.nodes.forEach((n,i)=>{ const d=Math.hypot(n.x-px,n.z-pz); if(d<4.5) console.log('  #'+i+' room='+n.room+' ('+n.x.toFixed(2)+','+n.z.toFixed(2)+') door='+(n.door||'-')); });
console.log('\npath reactor->west_hall:', JSON.stringify((M.findPath('reactor','west_hall')||[]).map(n=>[+n.x.toFixed(1),+n.z.toFixed(1),n.room])));
console.log('path reactor->shields:', JSON.stringify((M.findPath('reactor','shields')||[]).map(n=>[+n.x.toFixed(1),+n.z.toFixed(1),n.room])));

console.log('\n=== nav node sanity ===');
let blockedNodes=0;
M.nodes.forEach((n,i)=>{
  const bad=M.walls.some(w=>{ const ca=Math.cos(-w.a),sa=Math.sin(-w.a),dx=n.x-w.cx,dz=n.z-w.cz;
    const lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;
    const qx=Math.max(-w.hx,Math.min(w.hx,lx)),qz=Math.max(-w.hz,Math.min(w.hz,lz));
    return (lx-qx)**2+(lz-qz)**2 < 0.34*0.34; });
  const inRoom=M.roomAt(n.x,n.z);
  if(bad||(!inRoom&&n.type==='open')){ blockedNodes++; console.log('  BAD #'+i+' type='+n.type+' room='+(inRoom?inRoom.id:'null')+' ('+n.x.toFixed(2)+','+n.z.toFixed(2)+') blocked='+bad+' door='+(n.door||'-')); }
});
console.log('  blocked/invalid nodes: '+blockedNodes+' / '+M.nodes.length);
// connectivity: every room reachable from cafeteria
let unreachable=[];
for(const r of M.rooms){ if(!M.findPath('cafeteria',r.id)) unreachable.push(r.id); }
console.log('  rooms unreachable from cafeteria: '+(unreachable.length?unreachable.join(','):'none'));
// every station reachable from cafeteria (walk to its use position)
let badSt=[];
for(const s of M.stations){
  const room=M.roomAt(s.x,s.z);
  if(!room){ badSt.push(s.id+':noroom'); continue; }
  if(!M.findPath('cafeteria',room.id)) badSt.push(s.id+':'+room.id);
}
console.log('  stations in unreachable rooms: '+(badSt.length?badSt.join(', '):'none'));
// path lengths sanity
let longest=null;
for(const r of M.rooms){ const pth=M.findPath('cafeteria',r.id)||[]; if(!longest||pth.length>longest.n) longest={n:pth.length,room:r.id}; }
console.log('  longest path: '+longest.n+' nodes -> '+longest.room);

console.log('\n=== doors ===');
const byRoom={};
for(const d of M.doors){ (byRoom[d.room]=byRoom[d.room]||[]).push(d.id+(d.auto?'(auto)':'')+(d.win?'(win)':'')); }
for(const r in byRoom) console.log('  '+r+': '+byRoom[r].join(' '));
console.log('auto door rooms: '+JSON.stringify([...new Set(M.doors.filter(d=>d.auto).map(d=>d.room))]));
console.log('\nSAB_TYPES:');
