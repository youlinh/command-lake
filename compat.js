import {characters, clamp, materials} from './rules.js';
import {treesFor} from './landscape.js';

const tau=Math.PI*2;
const hex=(color)=>'#'+color.toString(16).padStart(6,'0');
const hash=(n)=>Math.abs(Math.sin(n*13.761)*78123.624)%1;
const terrainPalette={sun:['#8aa48a','#415b43','#548980','#9ecbbb'],rain:['#779b96','#375445','#45767c','#92bdb5'],storm:['#627f8b','#283e3e','#3b5969','#809da6'],quake:['#8e9c82','#475b42','#527a75','#9daf98'],apocalypse:['#ad7762','#553f38','#775e54','#d5a083']};

export class CompatibleScene{
  constructor(container,arena){
    this.container=container;this.arena=arena;this.zoom=arena?13.9:10.3;this.yaw=0;
    this.camera={x:0,z:0};this.resources=new Map();this.effects=[];this.weather='sun';
    this.canvas=document.createElement('canvas');
    this.renderer={domElement:this.canvas};
    this.compatible=true;
    this.ctx=this.canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('No 2D rendering context');
    this.scenery=treesFor(arena);
    container.replaceChildren(this.canvas);
    this.resize=()=>{
      this.w=container.clientWidth||innerWidth;this.h=container.clientHeight||innerHeight;
      this.pr=Math.min(devicePixelRatio||1,1.5);
      this.canvas.width=this.w*this.pr;this.canvas.height=this.h*this.pr;
      this.ctx.setTransform(this.pr,0,0,this.pr,0,0);
    };
    this.resize();addEventListener('resize',this.resize);
  }
  setWeather(kind){this.weather=kind;}
  setHouse(home){this.home=home;}
  addResource(item){this.resources.set(item.id,item);}
  removeResource(id){this.resources.delete(id);}
  effect(type,x,z,color,target){this.effects.push({type,x,z,color,target,life:0});}
  project=(x,z,y=0)=>{
    const a=this.yaw,rx=x-this.camera.x,rz=z-this.camera.z;
    const sx=rx*Math.cos(a)-rz*Math.sin(a),depth=rz*Math.cos(a)+rx*Math.sin(a);
    const size=this.pixel*clamp(1+depth*.023,.39,1.75);
    return {x:this.w*.5+sx*size,y:this.h*.56+depth*this.pixel*.57-y*size,s:size,depth};
  };
  oval(x,y,rx,ry,color,angle=0){
    const c=this.ctx;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),angle,0,tau);c.fillStyle=color;c.fill();
  }
  polygon(points,color,stroke){
    const c=this.ctx;c.beginPath();
    points.forEach((p,i)=>{if(i)c.lineTo(...p);else c.moveTo(...p);});
    c.closePath();c.fillStyle=color;c.fill();
    if(stroke){c.strokeStyle=stroke;c.stroke();}
  }
  art(point){
    const p=this.project(point.x,point.z);
    const {x,y,s}=p;
    const h=s*point.height*.60;
    const trunk=Math.max(3,s*point.radius*1.35);
    this.oval(x,y,s*.81,s*.30,'#27332c65');
    this.ctx.fillStyle=point.type==='birch'?'#b6ad9c':'#514538';
    this.ctx.fillRect(x-trunk*.5,y-h*.71,trunk,h*.71);
    if(point.type==='birch'){
      this.oval(x-h*.09,y-h*.70,h*.18,h*.20,'#55754a');
      this.oval(x+h*.12,y-h*.73,h*.17,h*.18,'#65854f');
      this.oval(x,y-h*.86,h*.18,h*.19,'#78945b');
      return;
    }
    for(let j=0;j<4;j++){
      const r=h*(.29-j*.055),b=y-h*(.12+j*.173);
      const left=[[x-r,b],[x,b-h*.46],[x,b+h*.05]];
      const right=[[x,b-h*.46],[x+r,b],[x,b+h*.05]];
      this.polygon(left,['#34483d','#3a5b48','#426650','#52725b'][j]);
      this.polygon(right,['#263e33','#2c4b3b','#355242','#405e47'][j]);
    }
  }
  backdrop(t){
    const c=this.ctx,w=this.w,h=this.h,palette=terrainPalette[this.weather]??terrainPalette.sun;
    const sky=c.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,palette[0]);sky.addColorStop(.46,palette[3]);sky.addColorStop(.65,palette[1]);sky.addColorStop(1,'#38483a');
    c.fillStyle=sky;c.fillRect(0,0,w,h);
    const horizon=h*.29;
    for(let band=0;band<3;band++){
      const peaks=[];
      for(let i=0;i<=27;i++){
        const x=i*w/26;
        const r=hash(i+band*77);
        const height=(.09+r*.17)*h*(1-band*.20);
        peaks.push([x,horizon+band*13-height]);
      }
      this.polygon([[0,horizon+41],...peaks,[w,horizon+53]],['#97afa2aa','#6e9387bd','#53796b'][band]);
    }
    c.fillStyle=palette[1];c.fillRect(0,horizon+16,w,h);
    const lakePoints=Array.from({length:48},(_,i)=>{
      const a=i*tau/48,p=this.project(4+Math.cos(a)*43,-33+Math.sin(a)*22);
      return [p.x,p.y];
    });
    this.polygon(lakePoints,palette[2],palette[3]);
    c.save();c.clip();
    for(let i=0;i<88;i++){
      const x=(hash(i+485)*w+Math.sin(t*.45+i*.8)*13);
      const y=horizon+hash(i+323)*h*.67;
      c.fillStyle=i%4===0?'#d7ead654':'#b6dacf34';
      c.fillRect(x,y,8+hash(i+831)*62,1);
    }
    c.restore();
    for(let i=0;i<660;i++){
      const tx=(hash(510+i*3)-.50)*106,tz=(hash(127+i*3)-.4)*81;
      const p=this.project(tx,tz);
      if(p.x<-8||p.y<horizon+15||p.x>w+8||p.y>h||Math.hypot((tx-4)/44,(tz+33)/23)<1)continue;
      c.fillStyle=i%3===0?'#94ad7455':'#334c3c95';
      c.fillRect(p.x,p.y,1+p.s*.14,1.3);
    }
    if(this.arena){
      const points=Array.from({length:30},(_,i)=>{
        const a=i*tau/30,p=this.project(21*Math.cos(a),4+16*Math.sin(a));
        return [p.x,p.y];
      });
      this.polygon(points,'#ab9a6523','#bbad8177');
    }
  }
  drawActor(a,t){
    if(a.hidden)return;
    const p=this.project(a.x,a.z),spec=characters[a.key],c=this.ctx;
    const scale=spec.scale*(a.mech?1.44:1)*(a.small?.50:1);
    const s=p.s*scale;
    const step=Math.sin(t*8)*(a.moving??0);
    const facing=Math.sin((a.angle??0)-this.yaw)>=0?1:-1;
    const shade={orange:'#d27f37',gold:'#caa045',silver:'#b1c1c4',police:'#44678d',soldier:'#758553'};
    const fur=shade[a.skin]??hex(spec.color);
    const light=a.mech?'#6e8489':a.hitFx>.55?'#efad88':fur;
    const shadow=a.mech?'#303e43':'#473b30';
    const glow=a.mech?hex(spec.aura??0x85e9db):'#edc971';
    const x=p.x,y=p.y;
    this.oval(x,y,s*1.27,s*.28,'#14251e70');
    if(spec.type==='human'){
      for(const d of [-1,1]){
        this.oval(x+d*s*.21+step*d*s*.14,y-s*.43,s*.13,s*.49,shadow,d*.14);
        this.oval(x+d*s*.33,y-s*1.19,s*.12,s*.41,light,d*.13-step*.23);
      }
      this.oval(x,y-s*1.18,s*.33,s*.47,light,.02);
      this.oval(x,y-s*1.91,s*.2,s*.24,'#d0a67e');
      this.oval(x,y-s*2.03,s*.23,s*.105,light);
    }else{
      const bodyY=y-s*(spec.model==='hare'?.65:1);
      for(const i of [-1,1]){
        this.oval(x+i*s*.57+step*i*s*.11,bodyY+s*.53,s*.13,s*.47,shadow,step*i*.71);
        this.oval(x+i*s*.28-step*i*s*.12,bodyY+s*.49,s*.15,s*.48,light,-step*i*.69);
      }
      this.oval(x-facing*s*.97,bodyY+s*.04,s*.52,s*(spec.model==='fox'?.15:.09),light,facing*(.24+Math.sin(t*4)*.19));
      this.oval(x,bodyY,s*.85,s*.40,shadow);
      this.oval(x,bodyY-s*.055,s*.77,s*.36,light);
      const headX=x+facing*s*.70,headY=bodyY-s*.34;
      this.oval(headX,headY,s*.38,s*.32,light);
      const long=spec.model==='hare'?.67:spec.model==='stag'?.50:.32;
      for(const d of [-1,1])this.polygon([[headX+d*s*.21,headY],[headX+d*s*.14,headY-s*(long+.32)],[headX+d*s*.34,headY-s*.12]],a.mech?shadow:light);
      this.oval(headX+facing*s*.27,headY+s*.10,s*.23,s*.122,a.mech?shadow:'#c19a73',facing*.13);
      this.oval(headX+facing*s*.13,headY-s*.066,s*.071,s*.045,glow);
      this.oval(headX+facing*s*.44,headY+s*.091,s*.061,s*.052,shadow);
      if(a.mech){
        for(let i=0;i<3;i++){
          c.fillStyle=glow;c.fillRect(x+s*(i*.25-.39),bodyY-s*.09,s*.13,s*.055);
        }
      }else if(spec.model==='cat'){
        c.strokeStyle='#57392288';c.lineWidth=Math.max(1,s*.06);
        for(let i=0;i<4;i++){
          c.beginPath();c.moveTo(x+s*(i*.26-.45),bodyY-s*.34);c.lineTo(x+s*(i*.26-.34),bodyY-s*.11);c.stroke();
        }
      }
    }
    if(a.id!=='self'&&!a.noName)this.label(a.label??spec.name,x,y-s*(spec.type==='human'?2.48:2.05),a.team==='enemy'?'#ffd4bb':'#e4f3d9');
  }
  label(text,x,y,color){
    const c=this.ctx;
    c.font='600 12px system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';
    const width=c.measureText(text).width;
    c.fillStyle='#192a23c7';c.fillRect(x-width/2-5,y-9,width+10,19);
    c.fillStyle=color;c.fillText(text,x,y);
  }
  drawHome(d){
    const {x,y,s}=this.project(d.x,d.z),c=this.ctx,color=hex(materials.find(m=>m[0]===this.home.material)[2]);
    this.oval(x,y,s*2.5,s*.8,'#22302988');
    c.fillStyle=color;c.fillRect(x-s*1.9,y-s*2.2,s*3.8,s*2.2);
    for(let i=0;i<7;i++){c.fillStyle='#28291f4a';c.fillRect(x-s*1.9,y-i*s*.30,s*3.8,1.5);}
    this.polygon([[x-s*2.14,y-s*2.17],[x+s*.15,y-s*3.18],[x+s*2.14,y-s*2.17]],'#524639');
    c.fillStyle='#252b26';c.fillRect(x-s*.48,y-s*1.35,s*.96,s*1.35);
    this.label('避难所 · '+this.home.level+'级',x,y-s*3.43,'#e6f3d7');
  }
  draw(player,actors,t,dt){
    const c=this.ctx;this.pixel=clamp(Math.min(this.w*.047,this.h*.041)*(11/this.zoom),9,53);
    const ratio=dt===0?1:Math.min(1,dt*7);
    this.camera.x+=(player.x-this.camera.x)*ratio;this.camera.z+=(player.z-this.camera.z)*ratio;
    c.setTransform(this.pr,0,0,this.pr,0,0);
    this.backdrop(t);
    const stuff=[...this.scenery,...actors.map(a=>({...a,kind:'actor'})),...[...this.resources.values()].map(r=>({...r,kind:'item'}))];
    if(this.home)stuff.push({x:-9,z:7,kind:'home'});
    const depth=(a)=>this.project(a.x,a.z).depth;
    stuff.sort((a,b)=>depth(a)-depth(b));
    for(const thing of stuff){
      const p=this.project(thing.x,thing.z);
      if(p.y<this.h*.19||p.y>this.h+110||p.x<-130||p.x>this.w+130)continue;
      if(thing.kind==='actor')this.drawActor(thing,t);
      else if(thing.kind==='home')this.drawHome(thing);
      else if(thing.kind==='item'){
        const [key,name,color]=thing.material;
        this.oval(p.x,p.y,p.s*.29,p.s*.14,'#2337287c');
        this.polygon([[p.x-p.s*.25,p.y],[p.x-p.s*.11,p.y-p.s*.31],[p.x+p.s*.13,p.y-p.s*.38],[p.x+p.s*.31,p.y-p.s*.10]],hex(color));
        if(Math.hypot(thing.x-player.x,thing.z-player.z)<9)this.label(name,p.x,p.y-p.s*.52,'#f2edce');
      }else this.art(thing);
    }
    this.effects=this.effects.filter(e=>{
      e.life+=dt;const k=e.life/.63;
      if(k>1)return false;
      const target=e.target;
      const p=this.project(target?e.x+(target.x-e.x)*k:e.x,target?e.z+(target.z-e.z)*k:e.z);
      c.strokeStyle=hex(e.color);c.globalAlpha=(1-k)*.8;c.lineWidth=e.type==='element'?3:2;
      c.beginPath();c.ellipse(p.x,p.y,p.s*(.17+k*2.6),p.s*(.10+k*.95),0,0,tau);c.stroke();
      if(e.type==='rock')this.oval(p.x,p.y-p.s*Math.sin(k*Math.PI)*2,p.s*.33,p.s*.24,hex(e.color));
      c.globalAlpha=1;return true;
    });
    if(this.weather==='rain'||this.weather==='storm'){
      c.strokeStyle='#d5eced82';c.lineWidth=1;c.beginPath();
      for(let i=0;i<(this.weather==='storm'?150:78);i++){
        const x=(hash(552+i)*this.w-t*(this.weather==='storm'?157:69))%this.w+this.w;
        const y=(hash(821+i)*this.h+t*570)%this.h;
        c.moveTo(x%this.w,y);c.lineTo(x%this.w-5,y+13);
      }
      c.stroke();
    }
  }
  dispose(){removeEventListener('resize',this.resize);this.canvas.remove();}
}
