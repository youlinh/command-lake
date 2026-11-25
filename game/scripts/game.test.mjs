import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {characters,clearStage,reward,canMech,unlocked,materials,prices} from '../web/rules.js';
import {roomApi} from '../worker/rooms.js';
import {worldArea,treesFor} from '../web/landscape.js';
import {arenaArea,bodyRadius,moveBody,separateBodies} from '../web/physics.js';

test('tree trunks stop a long dash while leaving room to go around them',()=>{
  const tree=worldArea.trees.find(t=>t.x>11&&t.x<25&&t.z>12&&t.z<22&&worldArea.trees.every(other=>
    t===other||Math.hypot(t.x-other.x,t.z-other.z)>4.5));
  assert.ok(tree&&treesFor(false).includes(tree));
  const cat={key:'cat',x:tree.x,z:tree.z+2.8,hp:104};
  moveBody(cat,0,-6.8,worldArea,[cat]);
  assert.ok(cat.z-tree.z>=tree.radius+bodyRadius(cat)-.001);
  moveBody(cat,2.3,0,worldArea,[cat]);
  moveBody(cat,0,-3.6,worldArea,[cat]);
  assert.ok(cat.z<tree.z);
  const wildCat={...cat,x:tree.x,z:tree.z+tree.radius+bodyRadius(cat)+.001};
  const sideways=moveBody(wildCat,0,-.15,worldArea,[wildCat],true);
  assert.ok(sideways>.10&&Math.abs(wildCat.x-tree.x)>.10,'an AI flush against the trunk must sidestep');
});

test('animals move away from contact and separate when an overlapping body grows',()=>{
  const cat={key:'cat',x:0,z:8,hp:104};
  const wolf={key:'wolf',x:0,z:5,hp:144};
  const actors=[cat,wolf];
  moveBody(cat,0,-6,arenaArea,actors);
  const radius=bodyRadius(cat)+bodyRadius(wolf);
  assert.ok(cat.z-wolf.z>=radius);
  moveBody(cat,0,-.35,arenaArea,actors);
  assert.equal(moveBody(cat,0,-.35,arenaArea,actors),0);
  moveBody(cat,2.05,-1.8,arenaArea,actors);
  assert.ok(cat.x>1.8&&cat.z<wolf.z+.5);
  Object.assign(wolf,{x:cat.x,z:cat.z,mech:true});
  separateBodies(actors,arenaArea);
  assert.ok(Math.hypot(cat.x-wolf.x,cat.z-wolf.z)>=bodyRadius(cat)+bodyRadius(wolf)-.002);
});

test('the built worker serves the game, nested assets and room API',async()=>{
  const build=fileURLToPath(new URL('./build.mjs',import.meta.url));
  execFileSync(process.execPath,[build]);
  const {default:worker}=await import('../dist/server/index.js');
  for(const [path,mime] of [['/','text/html'],['/main.js','text/javascript'],['/vendor/three.core.min.js','text/javascript'],['/assets/lake.webp','image/webp']]){
    const response=await worker.fetch(new Request('http://localhost'+path),{});
    assert.equal(response.status,200,path);
    assert.ok(response.headers.get('content-type').startsWith(mime),path);
    assert.ok((await response.arrayBuffer()).byteLength>0,path);
  }
  const animals=await worker.fetch(new Request('http://localhost/assets/animals.glb'),{});
  assert.equal(animals.status,200);
  assert.equal(animals.headers.get('content-type'),'model/gltf-binary');
  const asset=Buffer.from(await animals.arrayBuffer());
  assert.equal(asset.toString('ascii',0,4),'glTF');
  assert.equal(asset.readUInt32LE(8),asset.length);
  const json=JSON.parse(asset.toString('utf8',20,20+asset.readUInt32LE(12)));
  assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.equal(json.skins.length,14);
  assert.equal(json.meshes.length,json.skins.length);
  for(const {primitives} of json.meshes){
    assert.equal(primitives.length,1);
    for(const attribute of ['COLOR_0','JOINTS_0','WEIGHTS_0']){
      assert.ok(Number.isInteger(primitives[0].attributes[attribute]),attribute);
    }
  }
  assert.deepEqual(json.nodes.filter(node=>node.name?.startsWith('Animal_')).map(node=>node.name.slice(7)).sort(),
    Object.values(characters).filter(character=>character.rank).map(character=>character.id).sort());
  const response=await worker.fetch(new Request('http://localhost/api/rooms',{method:'POST'}),{});
  assert.equal(response.status,503);
  assert.ok((await response.json()).error);
});

test('rewards double and both unlock milestones apply at the correct stage',()=>{
  const p={stage:1,owned:['cat'],coins:'0'};
  assert.equal(clearStage(p,characters.hare),70n);
  assert.equal(unlocked(p,'hare'),true);
  assert.equal(unlocked(p,'hunter'),false);
  assert.equal(clearStage(p,characters.fox),140n);
  assert.equal(unlocked(p,'police'),true);
  assert.equal(unlocked(p,'soldier'),true);
  assert.equal(unlocked(p,'thief'),true);
  assert.equal(canMech(p,'cat'),false);
  while(p.stage<18)clearStage(p,characters.cat);
  clearStage(p,characters.wolf);
  assert.equal(canMech(p,'wolf'),true);
  clearStage(p,characters.storm);
  assert.equal(canMech(p,'storm'),true);
  assert.equal(reward(500),70n*2n**499n);
  assert.deepEqual(prices,{small:2000,large:3000,divine:50000});
  assert.equal(materials.find(m=>m[0]==='wood')[3],3);
});

test('the same invite seats two devices, resolves defeat and starts a rematch',async t=>{
  t.mock.timers.enable({apis:['Date'],now:100000});
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_rooms.sql',import.meta.url),'utf8'));
  const DB={prepare(query){
    const stmt=sql.prepare(query.replace(/\?\d+/g,'?'));
    return {bind(...args){return {first:()=>stmt.get(...args),run:()=>({meta:stmt.run(...args)})};}};
  }};
  async function request(op,body){
    const answer=await roomApi(new Request('http://localhost/api/rooms',{method:'POST',body:JSON.stringify({op,...body})}),{DB});
    return {data:await answer.json(),status:answer.status};
  }
  const host=(await request('create',{teamSize:1,selection:{key:'cat'}})).data;
  assert.equal(host.room.phase,'waiting');
  const room=host.room.id;
  const guest=(await request('join',{room,selection:{key:'wolf',stage:19}})).data;
  assert.equal(guest.room.phase,'active');
  assert.equal(guest.room.players.length,2);
  assert.notEqual(host.token,guest.token);
  assert.equal(guest.room.players.some(p=>p.token),false);
  assert.equal((await request('join',{room})).status,409);
  assert.equal((await request('state',{room,token:'wrong'})).status,403);
  function frame(id,x,z,actions){return request('state',{room,token:id.token,input:{x,z,actions}});}
  for(let i=0;i<6;i++){
    t.mock.timers.tick(210);
    await frame(guest,0,1,{mech:1});
    await frame(host,0,-1,{});
  }
  const facing=(await frame(host,0,0,{})).data.room.players;
  assert.ok(facing[0].z-facing[1].z>1,'head-on movement must stop before players cross');
  let result;
  for(let i=0;i<20;i++){
    t.mock.timers.tick(220);
    result=await frame(guest,0,0,{attack:i+1,skill:i+1,mech:1});
    await frame(host,0,0,{});
    if(result.data.room.phase==='ended')break;
  }
  assert.equal(result.data.room.players.find(a=>a.slot===guest.slot).mech,true);
  assert.equal(result.data.room.phase,'ended');
  assert.equal(result.data.room.winner,guest.team);
  assert.equal((await request('again',{room,token:host.token})).data.room.phase,'ended');
  const again=(await request('again',{room,token:guest.token})).data;
  assert.equal(again.room.phase,'active');
  assert.equal(again.room.round,2);
  assert.equal(again.room.players.find(a=>a.slot===host.slot).hp,characters.cat.health);
});
