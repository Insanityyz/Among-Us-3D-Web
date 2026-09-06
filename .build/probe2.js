const fs=require('fs');
const src=fs.readFileSync(__dirname+'/30_logic.js','utf8');
const L={};
(new Function('exports',src+'\nexports.buildMap=buildMap;exports.MAP=MAP;exports.circleVsOBB=circleVsOBB;'))(L);
const M=L.buildMap(L.MAP);
for(const w of M.windows){
  const mx=(w.x1+w.x2)/2, mz=(w.z1+w.z2)/2;
  const sills=M.walls.filter(b=>b.room===w.room&&Math.hypot(b.cx-mx,b.cz-mz)<w.len/2+1.2);
  const hit=sills.filter(b=>L.circleVsOBB(mx,mz,0.34,b));
  console.log('window '+w.id+' room='+w.room+' mid=('+mx.toFixed(2)+','+mz.toFixed(2)+') len='+w.len.toFixed(2)+' y0='+w.y0.toFixed(2)+' y1='+w.y1.toFixed(2));
  sills.forEach(b=>console.log('    wall c=('+b.cx.toFixed(2)+','+b.cz.toFixed(2)+') a='+b.a.toFixed(3)+' hx='+b.hx.toFixed(2)+' hz='+b.hz.toFixed(2)+' y=['+b.y0.toFixed(2)+','+b.y1.toFixed(2)+'] blocks='+!!L.circleVsOBB(mx,mz,0.34,b)));
  if(!hit.length) console.log('    ** NOT BLOCKED at midpoint **');
}

console.log('\n=== segs near each window ===');
for(const w of M.windows){
  const mx=(w.x1+w.x2)/2, mz=(w.z1+w.z2)/2;
  const near=M.segs.filter(sg=>Math.hypot((sg[0][0]+sg[1][0])/2-mx,(sg[0][1]+sg[1][1])/2-mz)<1.0);
  console.log('window '+w.id+' mid=('+mx.toFixed(3)+','+mz.toFixed(3)+')');
  near.forEach(sg=>console.log('    seg '+JSON.stringify(sg.map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]))+' mid=('+((sg[0][0]+sg[1][0])/2).toFixed(4)+','+((sg[0][1]+sg[1][1])/2).toFixed(4)+')'));
  const exact=M.segs.find(sg=>Math.abs((sg[0][0]+sg[1][0])/2-mx)<0.05&&Math.abs((sg[0][1]+sg[1][1])/2-mz)<0.05);
  console.log('    test-match: '+(exact?'YES':'NO')+'   window x1..x2='+w.x1+'..'+w.x2+' z1..z2='+w.z1+'..'+w.z2);
}

console.log('\n=== win doors vs window spans ===');
for(const d of M.doors){ if(!d.win) continue;
  const w=M.windows.find(x=>x.id===d.id);
  const seg=M.segs.find(sg=>Math.abs((sg[0][0]+sg[1][0])/2-d.cx)<0.05&&Math.abs((sg[0][1]+sg[1][1])/2-d.cz)<0.05);
  console.log(d.id+' door c=('+d.cx+','+d.cz+') w='+d.w+' | window mid=('+((w.x1+w.x2)/2)+','+((w.z1+w.z2)/2)+') len='+w.len+' | seg-match='+(seg?'YES':'NO'));
}
