import {characters,skins,clamp} from '../web/rules.js';
import {arenaArea,meleeBonus,moveBody,separateBodies} from '../web/physics.js';

const lifetime=1000*60*60*12;
const disconnect=1000*75;
const actions=['attack','skill','dash','mech','aux'];
const skinIds=new Set(skins.map(s=>s[0]));
const code=(bytes=12)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const safe=(x,limit=1)=>typeof x==='number'&&Number.isFinite(x)?clamp(x,-limit,limit):0;
const nowMs=()=>Date.now();

function player(selection,slot,team,now){
  const key=Object.hasOwn(characters,selection.key)?selection.key:'cat';
  const spec=characters[key];
  const allowedHuman=Number(selection.stage)>2;
  const id=spec.type==='human'&&!allowedHuman?'cat':key;
  const skin=skinIds.has(selection.skin)&&characters[id].rank?selection.skin:'default';
  const mechAllowed=Number(selection.stage)>18&&!!characters[id].rank;
  return {slot,team,key:id,skin,mechAllowed,token:code(16),seen:now};
}
function position(team,index){
  const column=index%8,row=Math.floor(index/8);
  return {x:Math.floor((column+1)/2)*(column%2===0?-3.2:3.2),z:team===0?10+row*3.2:1-row*3.2,angle:team===0?Math.PI:0};
}
function newRound(room,now){
  room.phase='active';room.winner=null;room.last=now;room.began=now;
  room.events=[];room.serial=0;room.round++;
  const order=[0,0];
  for(const a of room.players){
    const spec=characters[a.key];
    const loc=position(a.team,order[a.team]++);
    Object.assign(a,loc,{hp:spec.health,max:spec.health,mech:false,small:false,cloak:0,
      input:{x:0,z:0},queue:[],seenActions:{},cd:{},guard:0,dash:null,rock:false,ready:false});
  }
}
function publicRoom(room){
  const counts=[0,0];
  return {id:room.id,teamSize:room.teamSize,phase:room.phase,round:room.round,winner:room.winner,events:room.events,
    players:room.players.map(a=>({
      slot:a.slot,team:a.team,key:a.key,skin:a.skin,
      ...position(a.team,counts[a.team]++),...(a.x==null?{}:{x:a.x,z:a.z,angle:a.angle}),
      hp:a.hp??characters[a.key].health,max:a.max??characters[a.key].health,
      mech:!!a.mech,small:!!a.small,rock:!!a.rock,cloaked:a.cloak>room.last,ready:!!a.ready
    }))
  };
}
function visible(target,from,now){
  const rank=characters[from.key].rank;
  return target.cloak<=now||rank==='small'||rank==='divine'&&from.small;
}
function pushEvent(room,a,type,target){
  room.events.push({id:++room.serial,slot:a.slot,type,target:target?{x:target.x,z:target.z}:null});
  if(room.events.length>28)room.events.shift();
}
function stepAction(room,a,action,now){
  if((a.cd[action]??0)>now)return;
  const spec=characters[a.key];
  if(action==='mech'||action==='aux'||action==='dash'){
    a.cd[action]=now+(action==='dash'?1460:600);
    if(action==='mech'&&a.mechAllowed){a.mech=!a.mech;a.small=false;a.rock=false;a.cloak=0;pushEvent(room,a,'element');}
    if(action==='aux'&&a.mech&&spec.rank==='divine'){a.small=!a.small;pushEvent(room,a,'skill');}
    if(action==='dash'){
      const {x,z}=a.input;
      const heading=Math.hypot(x,z)>.1?Math.atan2(x,z):a.angle;
      a.dash={x:Math.sin(heading),z:Math.cos(heading),until:now+325};
      a.guard=now+325;
      if(a.mech&&spec.rank==='small'){a.cloak=now+3200;pushEvent(room,a,'skill');}
    }
    return;
  }
  const skill=action==='skill';
  if(skill&&a.mech&&spec.rank==='large'&&!a.rock){
    a.cd.skill=now+420;a.rock=true;pushEvent(room,a,'rock');return;
  }
  a.cd[action]=now+(skill?4200:570);
  const type=skill&&a.rock?'rock':skill&&spec.rank==='divine'?'element':skill?'skill':'hit';
  a.rock=false;
  if(skill&&spec.id==='soldier')a.guard=now+1900;
  const closest=room.players.filter(b=>b.team!==a.team&&b.hp>0&&visible(b,a,now))
    .map(b=>({actor:b,dist:Math.hypot(a.x-b.x,a.z-b.z)})).sort((x,y)=>x.dist-y.dist)[0];
  const range=(type==='rock'?12:type==='element'?10:skill?(spec.range??5.5):2.75)+(a.mech?.42:0)+(skill?0:meleeBonus(a,closest?.actor));
  if(closest&&closest.dist<range+1)a.angle=Math.atan2(closest.actor.x-a.x,closest.actor.z-a.z);
  if(skill&&['police','thief','fox','hare'].includes(spec.id)){
    a.dash={x:Math.sin(a.angle),z:Math.cos(a.angle),until:now+230};
  }
  const target=closest&&closest.dist<range?closest.actor:null;
  pushEvent(room,a,type,type==='rock'?target:null);
  if(target&&target.guard<=now){
    const base=skill?spec.power:spec.type==='human'?18:17+(spec.rank==='large'?3:spec.rank==='divine'?5:0);
    target.hp=Math.max(0,target.hp-Math.round(base*(a.mech?1.46:1)*(target.mech?.84:1)));
  }
}
function simulate(room,now){
  if(room.phase!=='active'||now-room.last<110)return;
  const dt=Math.min(.38,(now-room.last)/1000);
  room.last=now;
  for(const a of room.players){
    if(a.hp<=0)continue;
    if(now-a.seen>disconnect){a.hp=0;continue;}
    const command=a.dash?.until>now?a.dash:now-a.seen>900?{x:0,z:0}:a.input;
    const spec=characters[a.key];
    const speed=a.dash?.until>now?17:spec.speed*(a.mech?.92:1)*(a.small?1.2:1);
    const len=Math.max(1,Math.hypot(command.x,command.z));
    moveBody(a,command.x/len*speed*dt,command.z/len*speed*dt,arenaArea,room.players);
    if(Math.abs(command.x)+Math.abs(command.z)>.08)a.angle=Math.atan2(command.x,command.z);
  }
  for(const a of room.players){
    if(a.hp>0)for(const action of a.queue)stepAction(room,a,action,now);
    a.queue=[];
  }
  separateBodies(room.players,arenaArea);
  const live=[0,0];
  for(const p of room.players)if(p.hp>0)live[p.team]++;
  if(live.includes(0)){
    room.phase='ended';room.winner=live[0]===live[1]?null:live[0]>0?0:1;
  }
}
function edit(room,body,now){
  let self=room.players.find(p=>p.token===body.token);
  if(body.op==='join'){
    if(self){self.seen=now;return self;}
    if(room.phase!=='waiting')return {error:'这场对战已经开始。',status:409};
    const players=room.players;
    const counts=[players.filter(p=>p.team===0).length,players.filter(p=>p.team===1).length];
    const team=counts[0]>counts[1]?1:0;
    if(counts[team]>=room.teamSize)return {error:'房间已满。',status:409};
    self=player(body.selection??{},'p'+room.nextSlot++,team,now);
    players.push(self);
    if(players.length===room.teamSize*2)newRound(room,now);
    return self;
  }
  if(!self)return {error:'房间席位已失效，请重新打开邀请链接。',status:403};
  self.seen=now;
  if(body.op==='start'&&self.slot==='p0'&&room.phase==='waiting'&&room.players.some(a=>a.team===1))newRound(room,now);
  if(body.op==='again'&&room.phase==='ended'){
    self.ready=true;
    if(room.players.filter(p=>p.seen>now-disconnect).every(p=>p.ready)&&room.players.every(p=>p.seen>now-disconnect))newRound(room,now);
  }
  if(room.phase==='active'&&body.op==='state'){
    if(body.input){
      const x=safe(body.input.x),z=safe(body.input.z);
      self.input={x,z};
      for(const a of actions){
        const count=Number(body.input.actions?.[a]??0);
        const observed=self.seenActions[a]??0;
        if(Number.isSafeInteger(count)&&count>observed){
          self.seenActions[a]=count;
          if(!self.queue.includes(a))self.queue.push(a);
        }
      }
    }
    simulate(room,now);
  }
  return self;
}
export async function roomApi(request,env){
  if(!env.DB)return response({error:'联机数据库暂时不可用。'},503);
  if(request.method!=='POST')return response({error:'请求方式不支持。'},405);
  let body;
  try{
    const raw=await request.text();
    if(raw.length>4096)return response({error:'请求过长。'},413);
    body=JSON.parse(raw);
  }catch{return response({error:'请求格式无效。'},400);}
  if(!body||typeof body!=='object')return response({error:'请求格式无效。'},400);
  const db=env.DB;
  const now=nowMs();
  if(body.op==='create'){
    const teamSize=clamp(Math.trunc(safe(body.teamSize,24))||1,1,24);
    const self=player(body.selection??{},'p0',0,now);
    const room={id:code(),teamSize,phase:'waiting',players:[self],nextSlot:1,events:[],serial:0,last:now,winner:null,round:0};
    await db.prepare('INSERT INTO rooms (id,data,updated) VALUES (?1,?2,?3)').bind(room.id,JSON.stringify(room),now).run();
    if(Math.random()<.025)await db.prepare('DELETE FROM rooms WHERE updated < ?1').bind(now-lifetime).run();
    return response({room:publicRoom(room),token:self.token,slot:self.slot,team:self.team,actions:self.seenActions??{}});
  }
  if(!/^[a-f0-9]{24}$/.test(body.room??''))return response({error:'邀请链接无效。'},400);
  if(!['join','state','start','again'].includes(body.op))return response({error:'请求动作无效。'},400);
  for(let i=0;i<8;i++){
    const row=await db.prepare('SELECT revision,data,updated FROM rooms WHERE id = ?1').bind(body.room).first();
    if(!row||now-row.updated>lifetime)return response({error:'房间已过期，请创建新房间。'},404);
    const room=JSON.parse(row.data);
    if(body.op==='state'&&room.phase!=='active'&&now-row.updated<1500){
      const self=room.players.find(a=>a.token===body.token);
      if(!self)return response({error:'房间席位已失效，请重新打开邀请链接。'},403);
      return response({room:publicRoom(room),token:self.token,slot:self.slot,team:self.team,actions:self.seenActions??{}});
    }
    const self=edit(room,body,now);
    if(self.error)return response({error:self.error},self.status);
    const result=await db.prepare('UPDATE rooms SET revision = revision + 1, data = ?1, updated = ?2 WHERE id = ?3 AND revision = ?4')
      .bind(JSON.stringify(room),now,room.id,row.revision).run();
    if(result.meta.changes)return response({room:publicRoom(room),token:self.token,slot:self.slot,team:self.team,actions:self.seenActions??{}});
  }
  return response({error:'房间连接繁忙，请稍候。'},503);
}
