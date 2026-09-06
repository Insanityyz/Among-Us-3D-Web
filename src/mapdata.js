/* Skeld-style topology. Tile coords (x: right, z: down). Shared with a Node
   connectivity test via the module guard at the bottom. */
const MAP = {
  id: 'skeld',
  name: 'The Skeld',
  // {name, x0,z0,x1,z1}  (inclusive tile rect of walkable floor)
  rooms: [
    {name:'Cafeteria',   x0:12, z0:3,  x1:20, z1:9 },
    {name:'Communications',x0:4,  z0:3,  x1:9,  z1:9 },
    {name:'Weapons',     x0:24, z0:3,  x1:31, z1:9 },
    {name:'O2',          x0:34, z0:3,  x1:40, z1:9 },
    {name:'Navigation',  x0:24, z0:16, x1:31, z1:22},
    {name:'Shields',     x0:34, z0:16, x1:40, z1:22},
    {name:'Security',    x0:4,  z0:16, x1:9,  z1:22},
    {name:'Admin',       x0:12, z0:16, x1:20, z1:22},
    {name:'Electrical',  x0:12, z0:27, x1:20, z1:33},
    {name:'MedBay',      x0:4,  z0:27, x1:9,  z1:33},
    {name:'Reactor',     x0:34, z0:27, x1:40, z1:33},
    {name:'Storage',     x0:22, z0:27, x1:30, z1:33},
    {name:'Upper Engine',x0:2,  z0:38, x1:8,  z1:44},
    {name:'Lower Engine',x0:30, z0:38, x1:36, z1:44},
  ],
  // connecting corridors (inclusive tile rects of walkable floor)
  corridors: [
    [9,5,12,7],     // Comms <-> Cafeteria
    [20,5,24,7],    // Cafeteria <-> Weapons
    [31,5,34,7],    // Weapons <-> O2
    [6,9,7,16],     // Comms <-> Security
    [15,9,17,16],   // Cafeteria <-> Admin
    [27,9,28,16],   // Weapons <-> Navigation
    [31,17,34,19],  // Navigation <-> Shields
    [36,22,37,27],  // Shields <-> Reactor
    [15,22,17,27],  // Admin <-> Electrical
    [6,22,7,27],    // Security <-> MedBay
    [18,29,22,31],  // Electrical <-> Storage
    [29,33,30,38],  // Storage <-> Lower Engine
    [5,33,6,38],    // MedBay <-> Upper Engine
    [30,29,34,31],  // Reactor <-> Storage
  ],
  spawn: {x:16, z:6},          // cafeteria
  emergency: {x:15, z:6},      // emergency button tile
  // vents: {name,x,z,net}
  vents: [
    {name:'Cafeteria', x:19, z:6,  net:0},
    {name:'Admin',     x:13, z:21, net:0},
    {name:'MedBay',    x:5,  z:30, net:1},
    {name:'Electrical',x:13, z:32, net:1},
    {name:'Security',  x:8,  z:17, net:1},
    {name:'Reactor',   x:39, z:28, net:2},
    {name:'Upper Engine',x:3, z:39,net:2},
    {name:'Lower Engine',x:30,z:39,net:2},
    {name:'Weapons',   x:30, z:4,  net:3},
    {name:'Navigation',x:25, z:21, net:3},
    {name:'Shields',   x:39, z:17, net:3},
  ],
  // task consoles: {task, room, x, z, face}  face: direction panel points (deg)
  consoles: [
    {task:'downloadData',  room:'Cafeteria', x:18, z:4},
    {task:'emptyGarbage',  room:'Cafeteria', x:19, z:4},
    {task:'fixWiring',     room:'Cafeteria', x:13, z:8},
    {task:'cleanVent',     room:'Cafeteria', x:19, z:6}, // next to vent
    {task:'swipeCard',     room:'Admin',     x:18, z:21},
    {task:'uploadData',    room:'Admin',     x:12, z:19}, // admin upload destination
    {task:'fixWiring',     room:'Admin',     x:13, z:17},
    {task:'downloadData',  room:'Communications', x:5, z:4},
    {task:'cleanVent',     room:'Security',  x:8, z:17},
    {task:'calibrate',     room:'Electrical',x:13, z:28},
    {task:'fixWiring',     room:'Electrical',x:18, z:30},
    {task:'divertPower',   room:'Electrical',x:14, z:32},
    {task:'cleanVent',     room:'Electrical',x:13, z:32},
    {task:'submitScan',    room:'MedBay',    x:7,  z:28},
    {task:'clearAsteroids',room:'Weapons',   x:26, z:4},
    {task:'uploadData',    room:'Weapons',   x:30, z:4},
    {task:'chartCourse',   room:'Navigation',x:26, z:17},
    {task:'stabilize',     room:'Navigation',x:29, z:19},
    {task:'cleanO2Filter', room:'O2',        x:37, z:4},
    {task:'emptyChute',    room:'O2',        x:39, z:4},
    {task:'primeShields',  room:'Shields',   x:39, z:17},
    {task:'startReactor',  room:'Reactor',   x:37, z:29},
    {task:'unlockManifolds',room:'Reactor',  x:39, z:29},
    {task:'emptyChute',    room:'Storage',   x:23, z:30}, // stage 2
    {task:'emptyGarbage',  room:'Storage',   x:24, z:30}, // stage 2
    {task:'fuelEngines',   room:'Storage',   x:28, z:30},
    {task:'alignEngine',   room:'Upper Engine', x:4, z:40},
    {task:'alignEngine',   room:'Lower Engine', x:32, z:40},
  ],
};

// ---- build a walkable-tile set + O(n) connectivity helpers (used by node test & browser) ----
MAP.tileSet = function(){
  const s = new Set();
  const add=(x0,z0,x1,z1)=>{ for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) s.add(x+','+z); };
  MAP.rooms.forEach(r=>add(r.x0,r.z0,r.x1,r.z1));
  MAP.corridors.forEach(c=>add(c[0],c[1],c[2],c[3]));
  return s;
};
MAP.roomAt = function(x,z){
  return MAP.rooms.find(r=> x>=r.x0 && x<=r.x1 && z>=r.z0 && z<=r.z1);
};
MAP.connected = function(){ // flood fill from spawn over orthogonal neighbors that are walkable
  const tiles = new Set(); // use tileSet but as Set of "x,z"
  MAP.rooms.forEach(r=>{ for(let x=r.x0;x<=r.x1;x++) for(let z=r.z0;z<=r.z1;z++) tiles.add(x+','+z); });
  MAP.corridors.forEach(c=>{ for(let x=c[0];x<=c[2];x++) for(let z=c[1];z<=c[3];z++) tiles.add(x+','+z); });
  const seen=new Set([MAP.spawn.x+','+MAP.spawn.z]);
  const stack=[MAP.spawn.x+','+MAP.spawn.z];
  const key=(x,z)=>x+','+z;
  while(stack.length){
    const cur=stack.pop(); const [cx,cz]=cur.split(',').map(Number);
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dz])=>{
      const nk=key(cx+dx,cz+dz); if(tiles.has(nk) && !seen.has(nk)){ seen.add(nk); stack.push(nk); } });
  }
  return {reachable: seen.size, total: tiles.size, allConnected: seen.size===tiles.size, tiles};
};
if (typeof module !== 'undefined') module.exports = MAP;
