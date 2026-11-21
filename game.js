import {LakeScene,playerFacing} from './scene.js';
import {CompatibleScene} from './compat.js';
import {characters, creatures, materials, difficulties, clamp, canMech} from './rules.js';
import {ground,worldArea} from './landscape.js';
import {arenaArea,meleeBonus,moveBody,separateBodies} from './physics.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const homePoint={x:-9,z:7};
const remoteActions=['attack','skill','dash','mech','aux'];
const keyActions={KeyE:'interact',KeyJ:'attack',KeyK:'skill',KeyR:'mech',KeyF:'aux',Space:'dash'};
const deltaAngle=(goal,current)=>Math.atan2(Math.sin(goal-current),Math.cos(goal-current));
let audio;
export function sound(kind){
  try{
    audio ||= new (window.AudioContext??window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume();
    const osc=audio.createOscillator(),volume=audio.createGain();
    const now=audio.currentTime;
    const notes={hit:[135,48],skill:[244,69],mech:[110,470],gather:[530,690],alert:[680,465],victory:[380,750]};
    const [a,b]=notes[kind]??notes.hit;
    osc.type=kind==='hit'?'triangle':'sine';
    osc.frequency.setValueAtTime(a,now);osc.frequency.exponentialRampToValueAtTime(b,now+.27);
    volume.gain.setValueAtTime(.055,now);volume.gain.exponentialRampToValueAtTime(.001,now+.31);
    osc.connect(volume).connect(audio.destination);osc.start(now);osc.stop(now+.33);
  }catch{}
}

function actor(id,key,x,z,opts={}){
  const spec=characters[key];
  return {id,key,spec,x,z,angle:Math.PI,hp:spec.health,max:spec.health,moving:0,cd:{},attackFx:0,hitFx:0,...opts};
}
function turn(a,dx,dz,dt){
  if(Math.abs(dx)+Math.abs(dz)>.01)a.angle+=deltaAngle(playerFacing(dx,dz),a.angle)*Math.min(1,dt*13);
}
export class LakeGame {
  constructor(hooks,options){
    this.hooks=hooks;this.options=options;this.mode=options.mode;
    this.arena=this.mode!=='world';
    this.area=this.arena?arenaArea:worldArea;
    this.profile=options.profile;
    this.difficulty=difficulties[options.difficulty]??difficulties[0];
    this.ui=Object.fromEntries(['zone','zone-detail','player-name','player-hp','health-fill','enemy-health','enemy-name','enemy-hp','enemy-fill','game-event','scene-tools','attack','skill','interact','dash','mech','aux','sound','control-tip','joystick','stick'].map(id=>[id,document.getElementById(id)]));
    const container=document.getElementById('world');
    try{this.view=new LakeScene(container,this.arena);}
    catch(error){
      if(!String(error.message).includes('WebGL context'))throw error;
      this.view=new CompatibleScene(container,this.arena);
    }
    this.keys=new Set();this.actions={...options.actions};this.input={x:0,z:0};this.last=performance.now();
    this.time=0;this.seconds=0;this.resources=[];this.nextResource=0;this.live=true;this.running=true;
    this.wild=[];this.allies=[];this.remotes=new Map();this.effects=[];
    this.muted=sessionStorage.getItem('lakeMuted')==='1';
    const key=options.key;
    this.player=actor('self',key,this.arena?0:-3,this.arena?10:9,{skin:this.profile.skins[key]??'default',mech:false});
    this.weather={...options.weather};
    this.weatherTimer=0;
    this.nextPatrol=22;
    this.support=Math.max(0,this.options.squad-8);
    if(this.mode==='world')this.initWorld();
    if(this.mode==='pve')this.initAI(options.foe);
    if(this.mode==='pvp')this.syncRemote(options.room);
    this.bind();
    this.updateHud();
    this.view.draw(this.player,[this.player],0,0);
    this.frame=requestAnimationFrame(this.tick);
  }
  initWorld(){
    this.view.setHouse(this.profile.home);
    this.view.setWeather(this.weather.effect==='storm'?'rain':this.weather.effect==='quake'?'sun':this.weather.effect);
    if(['storm','quake'].includes(this.weather.effect))this.warning=19;
    for(let i=0;i<24;i++)this.spawnResource();
    for(const [i,key] of ['hare','fox','otter','wolf','stag','boar','hunter'].entries()){
      const x=[7,12,16,-15,13,-17,21][i],z=[4,10,-1,-4,-5,2,16][i];
      this.wild.push(actor('wild'+i,key,x,z,{origin:{x,z},team:'neutral',phase:i*1.43,noName:i>4?false:undefined}));
    }
    this.createAllies();
  }
  initAI(spec){
    if(this.options.stage%13===0)this.view.setWeather('apocalypse');
    const tier=this.options.stage;
    const base=53+spec.health*.49+Math.log2(tier+1)*7.1;
    const scale=this.difficulty[1]*(tier<4?.78:1);
    const max=Math.round(base*scale);
    this.enemy=actor('enemy',spec.id,0,1,{hp:max,max,team:'enemy',mech:tier>18&&!!spec.rank,angle:0});
    this.player.hp=this.player.max=this.player.max+Math.round(Math.log2(tier)*9);
    this.createAllies();
  }
  createAllies(){
    for(let i=1;i<Math.min(8,this.options.squad);i++){
      const key=['fox','hare','otter','wolf','boar','stag','badger'][i-1];
      const col=(i-1)%4,row=Math.floor((i-1)/4);
      const x=this.player.x+(col%2===0?-1:1)*(1.55+Math.floor(col/2)*2);
      this.allies.push(actor('ally'+i,key,x,this.player.z+1.8+row*2.15,{label:characters[key].name+' · AI',team:'ally',phase:i*1.67}));
    }
  }
  spawnResource(){
    const first=this.nextResource===0;
    const mat=materials[(this.nextResource+Math.floor(Math.random()*materials.length))%materials.length];
    let x,z;
    do{x=first?-3+Math.random()*1.7:(Math.random()-.5)*50;z=first?6.7:(Math.random()-.40)*36;}
    while(ground(x,z)<.02||Math.hypot(x-homePoint.x,z-homePoint.z)<3||worldArea.trees.some(t=>Math.hypot(x-t.x,z-t.z)<t.radius+.7));
    const item={id:this.nextResource++,material:first?materials[0]:mat,x,z};
    this.resources.push(item);this.view.addResource(item);
  }
  get bodies(){
    const opponents=this.mode==='pvp'?[...this.remotes.values()]:this.arena?[this.enemy]:this.wild;
    return [this.player,...this.allies,...opponents.filter(Boolean)];
  }
  move(a,dx,dz,speed,dt){
    const len=Math.hypot(dx,dz);
    if(len<.01)return;
    const travel=speed*dt*Math.min(1,len)/len;
    const startX=a.x,startZ=a.z;
    const moved=moveBody(a,dx*travel,dz*travel,this.area,this.movingBodies??this.bodies,a!==this.player||this.patrol?.auto);
    if(a===this.player&&!this.patrol?.auto)turn(a,dx,dz,dt);
    else if(moved>.008)turn(a,a.x-startX,a.z-startZ,dt);
    a.moving=clamp(moved/Math.max(.001,a.spec.speed*dt),0,1);
  }
  bind(){
    const listen=(node,type,fn,options)=>{node.addEventListener(type,fn,options);this.listeners.push(()=>node.removeEventListener(type,fn,options));};
    this.listeners=[];
    listen(window,'keydown',e=>{
      if(document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey)return;
      if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault();
      this.keys.add(e.code);
      if(!e.repeat&&keyActions[e.code])this.act(keyActions[e.code]);
    });
    listen(window,'keyup',e=>this.keys.delete(e.code));
    listen(window,'blur',()=>{this.keys.clear();this.input.x=this.input.z=0;this.ui.stick.style.transform='';});
    for(const id of ['attack','skill','dash','mech','interact','aux'])listen(this.ui[id],'click',()=>this.act(id));
    listen(this.ui.sound,'click',()=>{
      this.muted=!this.muted;sessionStorage.setItem('lakeMuted',this.muted?'1':'0');
      if(!this.muted)sound('gather');
      this.updateHud();
    });
    const joy=this.ui.joystick,canvas=this.view.renderer.domElement;
    const steer=e=>{
      const b=joy.getBoundingClientRect(),r=b.width*.4;
      const x=(e.clientX-b.left-b.width/2)/r,z=(e.clientY-b.top-b.height/2)/r;
      const weight=Math.max(1,Math.hypot(x,z));
      this.input.x=x/weight;this.input.z=z/weight;
      this.ui.stick.style.transform='translate('+(this.input.x*r*.9)+'px,'+(this.input.z*r*.9)+'px)';
    };
    listen(joy,'pointerdown',e=>{joy.setPointerCapture(e.pointerId);steer(e)});
    listen(joy,'pointermove',e=>{if(joy.hasPointerCapture(e.pointerId))steer(e)});
    const stop=()=>{this.input.x=this.input.z=0;this.ui.stick.style.transform='';};
    listen(joy,'lostpointercapture',stop);listen(joy,'pointerup',stop);listen(joy,'pointercancel',stop);
    let lastX;
    listen(canvas,'pointerdown',e=>{if(e.button!==0)return;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});
    listen(canvas,'pointermove',e=>{
      if(canvas.hasPointerCapture(e.pointerId)){this.view.yaw-=(e.clientX-lastX)*.008;lastX=e.clientX;}
    });
    listen(canvas,'wheel',e=>{e.preventDefault();this.view.zoom=clamp(this.view.zoom+e.deltaY*.015,6.5,20);},{passive:false});
  }
  get movement(){
    let x=this.input.x,z=this.input.z;
    if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x--;
    if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x++;
    if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))z--;
    if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))z++;
    const len=Math.max(1,Math.hypot(x,z));x/=len;z/=len;
    const a=this.view.yaw;
    return [x*Math.cos(a)+z*Math.sin(a),z*Math.cos(a)-x*Math.sin(a)];
  }
  notify(message,kind){
    this.hooks.toast(message);
    if(kind&&!this.muted)sound(kind);
  }
  inShelter(){
    return this.profile.home&&Math.abs(this.player.x-homePoint.x)<2.02&&Math.abs(this.player.z-homePoint.z)<1.57;
  }
  startWeather(demo=false){
    if(this.mode!=='world'||this.weatherTimer>0)return;
    this.weatherDemo=demo;
    if(demo)this.weather={effect:'storm',name:'台风',strength:3};
    else this.weather={...this.options.weather};
    this.warning=0;
    if(!['storm','quake'].includes(this.weather.effect))return;
    this.weatherTimer=demo?18:26;this.damageClock=4;
    this.view.setWeather(this.weather.effect);this.updateHud();
    this.notify(this.weather.strength+'级'+this.weather.name+'，快躲进避难所！','alert');
  }
  chooseBuild(){
    if(this.mode==='world'&&distance(this.player,homePoint)>5){
      this.notify('靠近湖岸的避难所地基再建造。湿地营地在出生点左侧。');
      return;
    }
    this.hooks.build();
  }
  houseChanged(){
    this.view.setHouse(this.profile.home);
    this.updateHud();
  }
  gather(item,byAI=false){
    const p=this.resources.indexOf(item);
    if(p<0)return;
    const key=item.material[0],amount=key==='wood'||key==='clay'?3:2;
    this.profile.inventory[key]=(this.profile.inventory[key]??0)+amount;
    this.resources.splice(p,1);this.view.removeResource(item.id);
    this.hooks.save();
    if(byAI){
      if(!this.profile.home&&(this.profile.inventory.wood??0)>=8){
        this.profile.inventory.wood-=8;this.profile.home={material:'wood',level:1};
        this.hooks.save();this.houseChanged();
        this.notify('AI 队友已用 8 木材建成 1 级避难所。','gather');
      }
    }else this.notify(item.material[1]+' +'+amount,'gather');
  }
  act(action){
    if(!this.live||!this.running||this.hooks.paused()||this.player.hp<=0)return;
    const self=this.player;
    if(this.mode==='pvp'){
      if(action==='mech'&&!canMech(this.profile,self.key)){this.notify('通关第 18 关后，所有已解锁动物都能机甲化。');return;}
      if(remoteActions.includes(action))this.actions[action]=(this.actions[action]??0)+1;
      return;
    }
    if(this.patrol?.auto)return;
    if(action==='interact'){
      if(this.mode!=='world')return;
      const item=this.nearResource();
      if(item&&distance(self,item)<2.8)this.gather(item);
      else if(distance(self,homePoint)<4.1)this.chooseBuild();
      else this.notify('靠近材料后采集。');
      return;
    }
    if(action==='mech'){
      if(!canMech(this.profile,self.key)){this.notify('通关第 18 关后，所有已解锁动物都能机甲化。');return;}
      if(self.cd.mech>this.time)return;
      self.mech=!self.mech;
      self.small=false;
      self.rock=false;
      self.cloak=0;
      self.cd.mech=this.time+.7;
      this.view.effect('element',self.x,self.z,self.mech?0xb9f8b2:0x85b6ff);
      if(!this.muted)sound('mech');
      this.updateHud();
      return;
    }
    if(action==='aux'){
      if(self.mech&&self.spec.rank==='divine'){
        self.small=!self.small;
        this.view.effect('skill',self.x,self.z,self.spec.aura);
        this.notify(self.small?'缩小形态，可以识破隐身。':'恢复战斗体型。');
      }
      return;
    }
    if(self.cd[action]>this.time)return;
    if(action==='dash'){
      const [dx,dz]=this.movement;
      const moving=Math.hypot(dx,dz)>.05;
      const a=moving?playerFacing(dx,dz):self.angle;
      self.dash={x:Math.sin(a),z:Math.cos(a),until:this.time+.27};
      self.invincible=this.time+.28;
      self.cd.dash=this.time+1.45;
      if(self.mech&&self.spec.rank==='small'){
        self.cloak=this.time+3.2;
        this.view.effect('skill',self.x,self.z,0xb2a1ef);
        this.notify('隐身 3 秒');
      }
      return;
    }
    const targets=this.mode==='pve'?[this.enemy]:this.wild;
    const target=targets.filter(a=>a.hp>0&&this.visible(a,self)).sort((a,b)=>distance(a,self)-distance(b,self))[0];
    this.strike(self,target,action==='skill');
  }
  visible(target,observer){
    return !target.cloak||target.cloak<=this.time||observer.spec.rank==='small'||(observer.spec.rank==='divine'&&observer.small);
  }
  strike(attacker,target,skill=false){
    const {spec}=attacker;
    const now=this.time;
    if(skill&&attacker.mech&&spec.rank==='large'){
      if(!attacker.rock){
        attacker.rock=true;
        attacker.cd.skill=now+.36;
        this.view.effect('rock',attacker.x,attacker.z,0x9f9c83);
        if(attacker===this.player)this.notify('巨石就绪，再按技能掷出。');
        return;
      }
      attacker.rock=false;
    }
    const type=skill&&attacker.mech&&spec.rank==='large'?'rock':skill&&spec.rank==='divine'?'element':skill?'skill':'hit';
    const shoot=skill&&spec.id==='hunter';
    const wide=type==='element'?10 : type==='rock'?12 : shoot?spec.range : skill?5.5 : 2.75;
    const range=wide+(attacker.mech?.42:0)+(skill?0:meleeBonus(attacker,target));
    const delta=target?distance(attacker,target):Infinity;
    attacker.cd[skill?'skill':'attack']=now+(skill?4.2:attacker===this.enemy?1.14/this.difficulty[2]:.55);
    if(skill&&spec.id==='soldier')attacker.invincible=now+2;
    if(skill&&['police','thief','fox','hare'].includes(spec.id)){
      const a=target?playerFacing(target.x-attacker.x,target.z-attacker.z):attacker.angle;
      attacker.dash={x:Math.sin(a),z:Math.cos(a),until:now+.23};
    }
    if(target&&delta<range+1.2)attacker.angle=playerFacing(target.x-attacker.x,target.z-attacker.z);
    const color=attacker===this.enemy?0xfba876:spec.aura??(skill?0xafeaaf:0xf2d27b);
    this.view.effect(type,attacker.x,attacker.z,color,type==='rock'&&target&&delta<range?target:undefined);
    attacker.attackFx=1;
    if(!this.muted)sound(skill?'skill':'hit');
    if(!target||delta>range||!this.visible(target,attacker)||(target.invincible??0)>now)return;
    const scale=attacker===this.enemy?this.difficulty[2]:1;
    const stage=attacker===this.player&&this.arena?this.options.stage:1;
    const base=skill?spec.power:spec.type==='human'?18:17+(spec.rank==='large'?3:spec.rank==='divine'?5:0);
    const damage=Math.round((base+Math.log2(stage)*3.1)*scale*(attacker.mech?1.46:1)*(target.mech?.84:1));
    target.hp=Math.max(0,target.hp-damage);
    target.hitFx=1;
    target.engaged=true;
    if(target.hp===0&&this.mode==='world'&&target===this.patrol?.target){
      this.notify('任务完成，已拦截小偷。','victory');
      this.wild=this.wild.filter(a=>a!==target);
      this.patrol=null;
      this.nextPatrol=this.time+55;
    }
  }
  nearResource(){
    return this.resources.reduce((closest,r)=>!closest||distance(this.player,r)<distance(this.player,closest)?r:closest,null);
  }
  wildlife(dt){
    const p=this.player;
    for(const a of this.wild){
      if(a.hp<=0)continue;
      if(a===this.patrol?.target){
        const heading=this.time*.55;
        this.move(a,Math.cos(heading),Math.sin(heading),a.spec.speed*.8,dt);
        continue;
      }
      const locate=distance(a,p);
      const brave=['wolf','boar','hunter','badger'].includes(a.key);
      if(a.engaged||brave&&locate<4.9){
        if(locate>12){a.engaged=false;continue;}
        if(locate>2.23+meleeBonus(a,p))this.move(a,p.x-a.x,p.z-a.z,2.8,dt);
        else if((a.cd.attack??0)<this.time)this.strike(a,p);
      }else if(a.key==='hunter'&&locate<9&&p.moving>.45){
        turn(a,p.x-a.x,p.z-a.z,dt);a.moving=0;
      }else{
        const dx=a.origin.x+Math.sin(this.time*.37+a.phase)*2.3-a.x;
        const dz=a.origin.z+Math.cos(this.time*.32+a.phase)*1.8-a.z;
        if(locate<2.8&&!brave)this.move(a,a.x-p.x,a.z-p.z,3.6,dt);
        else this.move(a,dx,dz,1.6,dt);
      }
    }
  }
  allyFrame(dt){
    const foe=this.enemy,p=this.player;
    for(const a of this.allies){
      if(a.hp<=0)continue;
      if(this.arena&&foe.hp>0){
        if(!this.visible(foe,a)){a.moving=0;continue;}
        const d=distance(foe,a);
        if(d>2.5+meleeBonus(a,foe))this.move(a,foe.x-a.x+Math.cos(a.phase)*.8,foe.z-a.z,3.6,dt);
        else if((a.cd.attack??0)<this.time){
          a.cd.attack=this.time+1.3+a.phase*.04;
          a.attackFx=1;
          foe.hp=Math.max(0,foe.hp-4-Math.min(3,Math.floor(Math.log2(1+this.support))));
          foe.hitFx=.64;
          this.view.effect('hit',a.x,a.z,0xb4e7b2);
        }
      }else if(!this.arena){
        if(this.weatherTimer>0&&this.profile.home){
          this.move(a,homePoint.x-a.x,homePoint.z-a.z,4.7,dt);continue;
        }
        const eligible=this.resources.filter(r=>distance(r,p)<13);
        const item=eligible[(Math.floor(a.phase)+Math.floor(this.time/9))%eligible.length];
        if(item&&this.time>(a.gatherAt??0)){
          const d=distance(a,item);
          if(d<1.3){this.gather(item,true);a.gatherAt=this.time+4;}
          else this.move(a,item.x-a.x,item.z-a.z,3.6,dt);
        }else this.move(a,p.x+Math.cos(a.phase)*2.9-a.x,p.z+Math.sin(a.phase)*2.9-a.z,3.8,dt);
      }
    }
  }
  patrolFrame(dt){
    const p=this.player;
    const officer=p.key==='police'||p.skin==='police';
    if(!this.patrol&&officer&&this.time>this.nextPatrol&&this.weatherTimer<=0){
      const target=actor('patrol','thief',13,-4,{team:'neutral'});
      this.wild.push(target);
      this.patrol={target,auto:true,start:this.time};
      this.notify('警队铃响，正自动赶往拦截现场。','alert');
    }
    if(!this.patrol?.auto)return;
    const t=this.patrol.target;
    this.move(p,t.x-p.x,t.z-p.z,p.spec.speed*1.55,dt);
    if(distance(p,t)<6||this.time-this.patrol.start>7){
      this.patrol.auto=false;this.notify('到达现场，接手拦截！');
    }
  }
  worldFrame(dt){
    if(this.warning>0){this.warning-=dt;if(this.warning<=0)this.startWeather();}
    if(this.weatherTimer>0){
      this.weatherTimer-=dt;
      this.damageClock-=dt;
      if(this.weatherTimer<=0){
        this.weatherTimer=0;this.view.setWeather(this.options.weather.effect==='rain'?'rain':'sun');
        if(!this.weatherDemo)this.hooks.eventDone();
        this.notify(this.weather.name+'已结束，战场重新开放。');
        this.weather={name:'晴朗',effect:'sun',strength:0};
      }else if(this.damageClock<=0){
        this.damageClock=4;
        const strength=this.weather.strength;
        if(this.profile.home&&this.profile.home.level<strength){
          this.profile.home=null;this.houseChanged();this.hooks.save();
          this.notify('避难所强度不足，已损坏。','hit');
        }
        if(!this.inShelter()){
          this.player.hp=Math.max(0,this.player.hp-(strength*8));
          this.player.hitFx=1;
          this.view.effect('hit',this.player.x,this.player.z,0xf9bb84);
        }
      }
    }
    if(this.support>0&&this.time>(this.nextSupply??15)&&this.weatherTimer===0){
      this.nextSupply=this.time+15;
      const supply=1+Math.floor(Math.log2(this.support));
      this.profile.inventory.wood=(this.profile.inventory.wood??0)+supply;
      this.hooks.save();
      this.notify('留守队友送来 '+supply+' 木材。','gather');
    }
    if(this.resources.length<24&&this.seconds>2.5){this.spawnResource();this.seconds=0;}
    this.wildlife(dt);this.patrolFrame(dt);
  }
  aiFrame(dt){
    const e=this.enemy,p=this.player;
    if(e.hp<=0)return;
    const d=distance(p,e);
    if(e.mech&&e.spec.rank==='divine')e.small=(p.cloak??0)>this.time&&this.difficulty[2]>=.87;
    if(!this.visible(p,e)){
      this.move(e,Math.cos(this.time*.7),Math.sin(this.time*.7),1.7,dt);return;
    }
    const canSkill=this.difficulty[2]>.8&&e.spec.power>22;
    const reach=meleeBonus(e,p);
    if(d>2.22+reach){
      const side=(d>5?0:Math.sin(this.time*2.3)*.45)*this.difficulty[2];
      this.move(e,(p.x-e.x)/d+(p.z-e.z)/d*side,(p.z-e.z)/d-(p.x-e.x)/d*side,3.5*this.difficulty[2]+Math.log2(this.options.stage)*.24,dt);
    }else e.moving=0;
    if(canSkill&&d<4.35&&(!e.cd.skill||e.cd.skill<this.time)&&this.time>2.5)this.strike(e,p,true);
    else if(d<2.40+reach&&(!e.cd.attack||e.cd.attack<this.time))this.strike(e,p);
    if(e.dash?.until>this.time&&d>1.5)this.move(e,e.dash.x,e.dash.z,8.2,dt);
  }
  syncRemote(room){
    this.net=room;
    const players=room?.players??[];
    const slots=new Set(players.map(state=>state.slot));
    for(const id of this.remotes.keys())if(!slots.has(id))this.remotes.delete(id);
    for(const state of players){
      if(state.slot===this.options.slot){
        Object.assign(this.player,{target:state,hp:state.hp,max:state.max,mech:state.mech,small:state.small,rock:state.rock,cloak:state.cloaked?this.time+1:0});
        if(!this.synced){this.player.x=state.x;this.player.z=state.z;this.player.angle=state.angle;this.synced=true;}
        continue;
      }
      const team=state.team===this.options.team?'ally':'enemy';
      const remote=this.remotes.get(state.slot)??actor('online'+state.slot,state.key,state.x,state.z,{label:characters[state.key].name+' · 真人',team,skin:state.skin});
      Object.assign(remote,{target:state,hp:state.hp,max:state.max,mech:state.mech,small:state.small,cloak:state.cloaked?this.time+1:0});
      this.remotes.set(state.slot,remote);
    }
    for(const event of room?.events??[]){
      if(event.id<=(this.eventSeen??0))continue;
      this.eventSeen=event.id;
      const src=players.find(a=>a.slot===event.slot);
      if(src){
        this.view.effect(event.type,src.x,src.z,characters[src.key].aura??(src.team===this.options.team?0xa7faaa:0xf9af7a),event.target??undefined);
        const target=src.slot===this.options.slot?this.player:this.remotes.get(src.slot);
        if(target)target.attackFx=.85;
        if(!this.muted)sound(event.type==='hit'?'hit':'skill');
      }
    }
    if(room?.phase==='ended'&&this.running){
      this.running=false;
      this.hooks.finished({win:room.winner===this.options.team,mode:'pvp',draw:room.winner==null});
    }
  }
  networkFrame(dt){
    const [dx,dz]=this.movement;
    if((this.nextNetwork??0)<this.time&&!this.sending&&this.running){
      this.nextNetwork=this.time+.20;
      this.sending=true;
      this.options.poll({x:dx,z:dz,actions:this.actions}).then(state=>{
        if(this.live)this.syncRemote(state);
      }).catch(()=>{}).finally(()=>{this.sending=false;});
    }
    const bodies=this.bodies;
    const blend=1-Math.exp(-dt*13);
    for(const a of bodies){
      if(!a.target)continue;
      const t=a.target;
      const moved=moveBody(a,(t.x-a.x)*blend,(t.z-a.z)*blend,this.area,bodies);
      a.moving=clamp(moved/Math.max(.001,a.spec.speed*dt),0,1);
      a.angle+=deltaAngle(t.angle,a.angle)*Math.min(1,dt*10);
      a.hidden=a!==this.player&&!this.visible(a,this.player);
    }
    separateBodies(bodies,this.area);
    this.enemy=[...this.remotes.values()].filter(a=>a.team==='enemy').sort((a,b)=>b.hp-a.hp||distance(a,this.player)-distance(b,this.player))[0];
  }
  simulateLocal(dt){
    const p=this.player;
    this.time+=dt;this.seconds+=dt;
    this.movingBodies=this.bodies;
    for(const a of this.movingBodies)a.moving=0;
    if(!this.patrol?.auto&&p.hp>0){
      const [dx,dz]=this.movement;
      const speed=p.spec.speed*(p.mech?.92:1)*(p.small?1.2:1);
      if(p.dash?.until>this.time)this.move(p,p.dash.x,p.dash.z,18,dt);
      else this.move(p,dx,dz,speed,dt);
    }
    if(this.mode==='world')this.worldFrame(dt);
    else this.aiFrame(dt);
    this.allyFrame(dt);
    separateBodies(this.movingBodies,this.area);
    this.movingBodies=null;
    if(this.mode==='pve'&&(p.hp<=0||this.enemy.hp<=0)){
      this.running=false;this.hooks.finished({win:p.hp>0,foe:this.enemy.spec,mode:'pve'});
    }else if(this.mode==='world'&&p.hp<=0){
      this.running=false;this.hooks.finished({win:false,mode:'world'});
    }
  }
  tick=stamp=>{
    if(!this.live)return;
    const dt=clamp((stamp-this.last)/1000,0,.18);this.last=stamp;
    const p=this.player;
    if(dt>0&&this.running&&!this.hooks.paused()){
      if(this.mode==='pvp'){
        this.time+=dt;
        this.networkFrame(dt);
      }else{
        const steps=Math.ceil(dt/.025);
        for(let i=0;i<steps&&this.running;i++)this.simulateLocal(dt/steps);
      }
    }
    const participants=this.mode==='world'?this.wild:this.mode==='pvp'?[...this.remotes.values()]:[this.enemy].filter(Boolean);
    const actors=[p,...participants.filter(a=>a.hp>0),...this.allies.filter(a=>a.hp>0)];
    for(const a of actors){
      a.attackFx=Math.max(0,a.attackFx-dt*4.1);a.hitFx=Math.max(0,a.hitFx-dt*3.7);
      if(a!==p)a.hidden=!this.visible(a,p);
    }
    this.view.draw(p,actors,this.time,dt);
    if((this.nextHud??0)<stamp){this.updateHud();this.nextHud=stamp+100;}
    if(this.live)this.frame=requestAnimationFrame(this.tick);
  };
  updateHud(){
    const h=this.ui,p=this.player;
    h.zone.textContent=this.mode==='world'?'湖岸营地':this.mode==='pvp'?'真人竞技场':this.options.stage%13===0?'末日战场':'湖岸竞技场';
    h['zone-detail'].textContent=this.mode==='world'?this.weather.name+(this.weather.strength?' · '+this.weather.strength+'级':''):this.mode==='pvp'?'第 '+(this.options.round??1)+' 场':'第 '+this.options.stage+' 关 · '+this.difficulty[0];
    const update=(a,name,hp,fill)=>{
      h[name].textContent=(a.label??a.spec.name)+(a.mech?' · 机甲':'');
      h[hp].textContent=Math.ceil(a.hp)+' / '+a.max;
      h[fill].style.width=(a.hp/a.max*100)+'%';
    };
    update(p,'player-name','player-hp','health-fill');
    h['enemy-health'].classList.toggle('hidden',!this.enemy);
    if(this.enemy)update(this.enemy,'enemy-name','enemy-hp','enemy-fill');
    h['scene-tools'].classList.toggle('hidden',this.mode!=='world');
    h.interact.classList.toggle('hidden',this.mode!=='world');
    h.mech.classList.toggle('hidden',p.spec.type==='human');
    h.aux.classList.toggle('hidden',!(p.mech&&p.spec.rank==='divine'));
    h.aux.textContent=p.small?'恢复体型':'缩小';
    h.mech.firstChild.nodeValue=p.mech?'解除机甲':'机甲';
    h.skill.firstChild.nodeValue=p.rock?'掷石':(p.cd.skill>this.time?'技能 '+Math.ceil(p.cd.skill-this.time):'技能');
    h.skill.setAttribute('title',p.spec.skill);
    if(this.view.compatible)h['zone-detail'].textContent+=' · 兼容画面';
    h.sound.textContent=this.muted?'静':'声';
    let event='';
    if(this.mode==='world'){
      if(this.weatherTimer>0)event=this.weather.name+' · '+Math.ceil(this.weatherTimer)+'秒'+(this.inShelter()?' · 已进避难所':' · 赶往避难所');
      else if(this.warning>0)event=this.weather.name+'将在 '+Math.ceil(this.warning)+' 秒后到达';
      else if(this.patrol?.auto)event='警队任务 · 自动赶往现场';
      else if(this.patrol)event='警队任务 · 拦截小偷';
      else{
        const nearby=this.nearResource();
        if(nearby&&distance(p,nearby)<3)event='按 E 或「采集」拾取'+nearby.material[1];
        else if(distance(p,homePoint)<3.2)event=this.inShelter()?'避难所内':'避难所地基';
      }
    }else if(p.cloak>this.time)event='隐身 · '+Math.ceil(p.cloak-this.time)+'秒';
    else if(this.support>0&&this.mode==='pve')event=this.support+' 名留守队友提供后援';
    h['game-event'].textContent=event;
    h['game-event'].classList.toggle('hidden',!event);
    h['control-tip'].textContent=matchMedia('(pointer:coarse)').matches?'摇杆移动 · 拖动画面转视角':'WASD 或方向键移动 · 拖动画面转视角';
  }
  dispose(){
    this.live=false;cancelAnimationFrame(this.frame);
    this.listeners.forEach(remove=>remove());this.view.dispose();
  }
}
