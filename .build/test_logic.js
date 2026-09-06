const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const m=src.split('// ======================= PURE LOGIC BEGIN =================================')[1]
          .split('// ======================= PURE LOGIC END ===================================')[0];
const mod={};
const fn=new Function(m+'\n;return {MAP,buildMap,makeTaskSet,TASK_DEFS,DEFAULT_SETTINGS,VENTS,VENT_NET,CAMS,STATION_DEFS,pointInPoly,findPath:0,circleVsOBB,taskProgress,assignRoles,ventLinks,STATIONS:null};');
const L=fn();
const M=L.buildMap(L.MAP);

let fails=0;
function ok(c,msg){ if(!c){ console.log('  ✗ '+msg); fails++; } }

console.log('rooms',M.rooms.length,'walls',M.walls.length,'openings',M.openings.length,'links',M.links.length,'doors',M.doors.length,'windows',M.windows.length,'stations',M.stations.length);
console.log('wall y-ranges:',['y0' in M.walls[0]?'ok':'MISSING'].join(','));

// 1. every station must be inside its room polygon
for(const s of M.stations){
  const r=M.byId[s.room];
  ok(L.pointInPoly(s.x,s.z,r.poly), `station ${s.id} (${s.kind}) outside room ${s.room} at ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
}
// 2. every vent inside its room
for(const v of L.VENTS){
  const r=M.byId[v.room];
  ok(L.pointInPoly(v.x,v.z,r.poly), `vent ${v.id} outside ${v.room}`);
}
// 3. cams inside a walkable polygon
for(const c of L.CAMS){
  const r=M.roomAt(c.x,c.z);
  ok(!!r, `cam ${c.id} not in any room (${c.x},${c.z})`);
  if(r) console.log('  cam',c.id,'in',r.id);
}
// 4. doors sit on their room boundary and their centre is on an opening
for(const d of M.doors){
  const r=M.byId[d.roomId];
  ok(r!=null,'door room missing '+d.id);
  const onEdge = (Math.abs(d.cx-r.bb.x1)<0.01||Math.abs(d.cx-r.bb.x2)<0.01||Math.abs(d.cz-r.bb.z1)<0.01||Math.abs(d.cz-r.bb.z2)<0.01);
  ok(onEdge, `door ${d.id} centre not on room boundary (${d.cx},${d.cz}) vs ${JSON.stringify([r.bb.x1,r.bb.z1,r.bb.x2,r.bb.z2])}`);
  if(d.win){
    const w=M.windows.find(w=>w.id===d.id);
    ok(!!w, `window ${d.id} produced no glass span`);
    ok(!M.links.find(l=>l.door===d.id), `window ${d.id} must not create a nav link`);
    // wall endpoints are quantised to 0.1, so the built sill can sit up to ~0.1 off the authored centre
    const seg=M.segs.find(sg=>Math.abs((sg[0][0]+sg[1][0])/2-d.cx)<0.16&&Math.abs((sg[0][1]+sg[1][1])/2-d.cz)<0.16);
    ok(!!seg, `window ${d.id} should still block movement (sill collider)`);
  } else {
    const link=M.links.find(l=>l.door===d.id);
    ok(!!link, `door ${d.id} produced no opening/link`);
  }
}
// 5. connectivity: BFS over links from cafeteria must reach every room
const adj={};
for(const r of M.rooms) adj[r.id]=new Set();
for(const l of M.links){ adj[l.a].add(l.b); adj[l.b].add(l.a); }
const seen=new Set(['cafeteria']); const q=['cafeteria'];
while(q.length){ const c=q.shift(); for(const n of adj[c]) if(!seen.has(n)){ seen.add(n); q.push(n);} }
for(const r of M.rooms) ok(seen.has(r.id), `room ${r.id} NOT reachable from cafeteria`);
console.log('  reachable rooms:',seen.size,'/',M.rooms.length);
// 6. pathfinding works between all room pairs
let pfail=0;
for(const a of M.rooms) for(const b of M.rooms){ const p=M.findPath(a.id,b.id); if(!p) {pfail++; console.log('  ✗ no path',a.id,'->',b.id);} }
ok(pfail===0,'path failures: '+pfail);
// 7. spawns inside cafeteria
for(const s of M.spawns) ok(L.pointInPoly(s.x,s.z,M.byId.cafeteria.poly),`spawn outside cafeteria ${s.x},${s.z}`);
// 8. task generation produces correct counts across many seeds
for(let seed=1;seed<=60;seed++){
  const rng=(s=>()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;})(seed*2654435761);
  const st=L.DEFAULT_SETTINGS;
  const tasks=L.makeTaskSet(M,st,rng);
  const c={common:0,long:0,short:0};
  tasks.forEach(t=>c[t.cat]++);
  ok(c.common===st.commonTasks&&c.long===st.longTasks&&c.short===st.shortTasks,
     `seed ${seed}: got ${c.common}/${c.long}/${c.short} want ${st.commonTasks}/${st.longTasks}/${st.shortTasks}`);
  for(const t of tasks){
    ok(t.stages.length>0&&t.stages.every(s=>M.stById[s.station]), `seed ${seed} task ${t.key} bad stage`);
    ok(L.taskProgress([t])===0,'progress 0');
  }
}
// 9. wiring task rules
{
  const rng=(s=>()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;})(99);
  let checked=0;
  for(let i=0;i<400;i++){
    const tasks=L.makeTaskSet(M,{commonTasks:1,longTasks:0,shortTasks:0},rng);
    const w=tasks.find(t=>t.key==='wiring');
    if(w){ checked++;
      const rs=w.stages.map(s=>s.room);
      const ord=rs.map(r=>L.WIRING_ORDER?0:0);
      ok(rs.length===3,'wiring stages '+rs.length);
      ok(rs[0]!=='cafeteria'&&rs[0]!=='security','wiring start '+rs[0]);
      ok(rs[2]!=='electrical'&&rs[2]!=='storage','wiring end '+rs[2]);
      const idx=rs.map(r=>['electrical','storage','admin','navigation','cafeteria','security'].indexOf(r));
      ok(idx[0]<idx[1]&&idx[1]<idx[2],'wiring order '+rs.join('>'));
    }
  }
  ok(checked>0,'no wiring tasks generated');
  console.log('  wiring samples checked:',checked);
}
// 10. roles
{
  const ps=Array.from({length:10},(_,i)=>({id:i,role:''}));
  const imps=L.assignRoles(ps,2,Math.random);
  ok(imps.length===2&&ps.filter(p=>p.role==='impostor').length===2,'roles');
}
// 11. vent links are symmetric and match the 6 networks
for(const v of L.VENTS){
  const l=L.ventLinks(v.id);
  ok(l.length>=1,'vent '+v.id+' has no links');
  for(const t of l){ ok(L.ventLinks(t).indexOf(v.id)>=0, `vent link ${v.id}<->${t} not symmetric`);
    ok(L.VENT_NET[L.VENTS.find(x=>x.id===v.id).net].indexOf(t)>=0, `${t} not in net of ${v.id}`); }
}
// 12. collision: circleVsOBB pushes out
{
  const b={cx:0,cz:0,a:0,hx:2,hz:0.2};
  const r=L.circleVsOBB(1,0.5,0.35,b);
  ok(r&&Math.abs(r.z-0.05)<1e-6&&Math.abs(r.x)<1e-6,'pushout straight '+JSON.stringify(r));
  ok(L.circleVsOBB(1,2,0.35,b)===null,'no hit when far');
  const br=L.circleVsOBB(0,0,0.35,b);
  ok(br&&br.depth>0,'inside box pushes out '+JSON.stringify(br));
  const rot={cx:0,cz:0,a:Math.PI/2,hx:2,hz:0.2};
  const rr=L.circleVsOBB(0.5,1,0.35,rot);
  ok(rr&&Math.abs(rr.x-0.05)<1e-6&&Math.abs(rr.z)<1e-6,'rotated pushout '+JSON.stringify(rr));
}
console.log(fails? `\n${fails} FAILURES` : '\nALL LOGIC CHECKS PASSED');
process.exit(fails?1:0);
