import * as T from './vendor/three.module.min.js';
import {makeModel} from './models.js';
import {characters, clamp, materials} from './rules.js';
import {ground,lakeHeight,mix,noise,seeded,trailDistance,treesFor} from './landscape.js';
import {bodyRadius} from './physics.js';

const TAU=Math.PI*2;
const material=(color,props={})=>new T.MeshStandardMaterial({color,roughness:.86,...props});
const pineColors=[0x355445,0x41684d,0x4b7554,0x294e45];
const rockGeo=new T.IcosahedronGeometry(1,1);
const gemGeo=new T.OctahedronGeometry(1,0);
const plank=new T.BoxGeometry(1,1,1);
const logGeo=new T.CylinderGeometry(.72,1,1,7);
const grassGeo=new T.BufferGeometry();
const blades=[];
for(let i=0;i<4;i++){
  const angle=i*2.4,x=Math.cos(angle),z=Math.sin(angle);
  const base=.025*i,tip=.14+i*.04;
  const left=[base*x-.026*z,0,base*z+.026*x],right=[base*x+.026*z,0,base*z-.026*x];
  const bend=[(base+.043)*x,.11,(base+.043)*z];
  blades.push(...left,...right,...bend,...left,...bend,...[(base+.13)*x,tip,(base+.13)*z]);
}
grassGeo.setAttribute('position',new T.Float32BufferAttribute(blades,3));
grassGeo.computeVertexNormals();
const ringGeo=new T.RingGeometry(.94,1,40);
const rockMat=material(0x6d776a);
const woodMat=material(0x6c4932);
const trimMat=material(0x312d28,{metalness:.13});
const crateMat=material(0x4eb399,{emissive:0x276650,emissiveIntensity:.6});
const stormColors={sun:0xb9d0cc,rain:0x7c9599,storm:0x6c848f,quake:0xaeb0a0,apocalypse:0x9a6558};

function groundTexture(){
  const cvs=document.createElement('canvas');cvs.width=cvs.height=256;
  const ctx=cvs.getContext('2d');ctx.fillStyle='#e1e3d6';ctx.fillRect(0,0,256,256);
  const rng=seeded(22);
  for(let i=0;i<7200;i++){
    const x=rng()*256,y=rng()*256;
    const b=202+Math.round(rng()*50);
    ctx.fillStyle='rgb('+b+','+(b-4)+','+(b-10)+')';
    ctx.fillRect(x,y,rng()*4+.4,rng()*2+.4);
  }
  const map=new T.CanvasTexture(cvs);map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(32,32);map.anisotropy=8;
  return map;
}
function terrain(scene,arena){
  const geometry=new T.PlaneGeometry(186,172,212,195);
  geometry.rotateX(-Math.PI/2);
  geometry.translate(0,0,-25);
  const positions=geometry.attributes.position;
  const vertexColors=[];
  const grassy=new T.Color(0x87965b),green=new T.Color(0x537950),shore=new T.Color(0xc0ae80),dirt=new T.Color(0xad9167);
  const color=new T.Color(),inland=new T.Color();
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),h=ground(x,z);
    positions.setY(i,h);
    const meadow=noise(x*.088,z*.105)*.7+noise(x*.33,z*.33)*.3;
    inland.copy(green).lerp(grassy,meadow);
    color.copy(shore).lerp(inland,T.MathUtils.smoothstep(h,-.15,.43));
    if(arena)color.lerp(dirt,.46*(1-T.MathUtils.smoothstep(Math.hypot(x*.78,z-4),6,15)));
    else if(z>-10)color.lerp(dirt,.86*(1-T.MathUtils.smoothstep(trailDistance(x,z)+noise(x*.7,z*.7)*.8,1.1,2.55)));
    color.multiplyScalar(.91+.18*noise(x*.59,z*.59));
    vertexColors.push(...color.toArray());
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(vertexColors,3));
  geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material(0xffffff,{vertexColors:true,map:groundTexture()}));
  mesh.receiveShadow=true;scene.add(mesh);
}

function addWater(scene){
  const m=new T.ShaderMaterial({
    uniforms:{uTime:{value:0},uMood:{value:0}},
    vertexShader:`
      varying vec3 point;
      void main(){vec4 p=modelMatrix*vec4(position,1.0);point=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}
    `,
    fragmentShader:`
      uniform float uTime;
      uniform float uMood;
      varying vec3 point;
      float random(vec2 p){return fract(sin(dot(p,vec2(41.13,289.97)))*15043.57);}
      float valueNoise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        return mix(mix(random(i),random(i+vec2(1.0,0.0)),f.x),
                   mix(random(i+vec2(0.0,1.0)),random(i+vec2(1.0,1.0)),f.x),f.y);
      }
      void main(){
        vec2 p=point.xz;
        float t=uTime;
        vec2 gust=vec2(valueNoise(p*.22+t*.07),valueNoise(p*.27-t*.05));
        vec2 q=p*.91+gust*2.0;
        float a=dot(q,vec2(.98,1.58))-t*1.12;
        float b=dot(q,vec2(-1.41,.78))-t*.84;
        float detail=1.0-smoothstep(17.0,94.0,length(cameraPosition-point));
        vec2 slope=vec2(cos(a),cos(b))*.035*detail+(gust-.5)*.062;
        vec3 n=normalize(vec3(-slope.x,1.0,-slope.y));
        vec3 v=normalize(cameraPosition-point);
        float rim=pow(1.0-clamp(dot(n,v),0.0,1.0),2.6);
        float glint=pow(max(dot(reflect(-normalize(vec3(-.53,.53,-.63)),n),v),0.0),42.0);
        float shore=length((p-vec2(4.0,-35.0))/vec2(41.0,24.0));
        vec3 deep=mix(vec3(.033,.149,.164),vec3(.043,.127,.145),uMood);
        deep=mix(deep,vec3(.134,.235,.184),smoothstep(.78,.98,shore)*.60);
        vec3 reflected=mix(vec3(.34,.52,.55),vec3(.22,.34,.39),uMood);
        vec3 col=mix(deep,reflected,rim);
        col+=(gust.x-.5)*.022+vec3(.26,.28,.22)*glint*(1.0-uMood*.65);
        gl_FragColor=vec4(col,1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const mesh=new T.Mesh(new T.PlaneGeometry(105,68),m);
  mesh.rotation.x=-Math.PI/2;mesh.position.set(4,lakeHeight,-37);scene.add(mesh);
  return m.uniforms;
}

function skyAndRidges(scene){
  const skyM=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,
    uniforms:{mood:{value:0}},
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      uniform float mood;
      varying vec3 dir;
      float cloud(vec2 p){return .5+.24*sin(p.x*2.0+p.y*.7)+.11*cos(p.x*4.9-p.y*4.3)+.075*sin(p.y*8.0+p.x*3.3);}
      void main(){
        vec3 n=normalize(dir);
        vec3 light=normalize(vec3(-.59,.31,-.71));
        float haze=pow(max(0.0,dot(n,light)),6.5);
        vec3 horizon=mix(vec3(.63,.75,.70),vec3(.33,.43,.44),mood);
        vec3 zenith=mix(vec3(.22,.44,.53),vec3(.19,.27,.34),mood);
        vec3 col=mix(horizon,zenith,smoothstep(-.03,.72,n.y));
        float f=smoothstep(.53,.83,cloud(n.xz*(6.0/(.36+abs(n.y)))))*smoothstep(-.025,.18,n.y);
        col=mix(col,vec3(.78,.80,.72)*(1.0-mood*.39),f*.74);
        col+=haze*vec3(.22,.18,.11)*(1.0-mood*.56);
        gl_FragColor=vec4(col,1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const sky=new T.Mesh(new T.SphereGeometry(210,32,20),skyM);scene.add(sky);
  const rng=seeded(85);
  for(let band=0;band<3;band++){
    const g=new T.PlaneGeometry(246,62,114,30);
    g.rotateX(-Math.PI/2);
    const pos=g.attributes.position;
    const colors=[];
    const ridge=new T.Color([0x859c95,0x617a73,0x4b685d][band]);
    const shade=new T.Color([0xbac1b1,0x94a196,0x74867b][band]);
    const peaks=Array.from({length:9},(_,i)=>({x:-132+i*33+rng()*21,h:(12+rng()*26)*(1-band*.16),w:15+rng()*25}));
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=pos.getZ(i),edge=1-Math.abs(z)/31;
      let y=0;
      for(const p of peaks)y=Math.max(y,p.h*Math.exp(-(((x-p.x)/p.w)**2)));
      y=Math.max(-4,y*Math.pow(edge,.85)+(noise(x*.135,z*.15+band*19)-.5)*8*edge-3);
      pos.setY(i,y);
      const c=ridge.clone().lerp(shade,clamp((y-6)/36,0,.61));c.multiplyScalar(.88+noise(x*.73,z*.51)*.28);
      colors.push(...c.toArray());
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
    const layer=new T.Mesh(g,material(0xffffff,{vertexColors:true}));
    layer.position.set(0,-1.1,-131+band*23);scene.add(layer);
  }
  return skyM.uniforms.mood;
}

function pineCrown(){
  const profile=[[-.50,.78],[-.39,1],[-.25,.56],[-.18,.73],[-.03,.42],[.04,.57],[.15,.30],[.21,.40],[.32,.22],[.40,.18],[.5,.025]];
  const sides=12,points=[],triangles=[];
  for(const [i,[y,r]] of profile.entries())for(let j=0;j<sides;j++){
    const angle=j*TAU/sides,edge=r*(.86+.26*noise(i*.8+1,j*1.3));
    points.push(Math.cos(angle)*edge,y+(noise(i+17,j)-.5)*.07,Math.sin(angle)*edge);
  }
  for(let i=0;i<profile.length-1;i++)for(let j=0;j<sides;j++){
    const a=i*sides+j,b=i*sides+(j+1)%sides;
    triangles.push(a,a+sides,b,b,a+sides,b+sides);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
  geometry.setIndex(triangles);geometry.computeVertexNormals();
  return geometry;
}

function birchBark(){
  const geometry=new T.CylinderGeometry(.70,1,1,11,17);
  const p=geometry.attributes.position,colors=[];
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),angle=Math.atan2(p.getZ(i),p.getX(i));
    const grain=noise(y*19+5,angle*3+8);
    const mark=T.MathUtils.smoothstep(grain,.53,.85)*(1-Math.abs(Math.sin(y*40))*.47);
    const light=1-mark*.68;
    colors.push(light,light*.98,light*.95);
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  return geometry;
}

function nature(scene,arena,trees){
  const rng=seeded(arena?81:54);
  const dummy=new T.Object3D();
  function instance(geometry,mat,transforms,shadows){
    const mesh=new T.InstancedMesh(geometry,mat,transforms.length);
    transforms.forEach(({x,y,z,a,b,c,rot,color},i)=>{
      dummy.position.set(x,y,z);dummy.scale.set(a,b,c);dummy.rotation.set(0,rot??0,0);dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      if(color!=null)mesh.setColorAt(i,new T.Color(color));
    });
    mesh.castShadow=shadows;mesh.receiveShadow=true;scene.add(mesh);
  }
  const trunks=[],birches=[],needles=[],crowns=[],rocks=[],grass=[],reeds=[];
  for(const {x,y,z,height,radius,type,angle,shade} of trees){
    const birch=type==='birch';
    (birch?birches:trunks).push({x,y:y+height*.46,z,a:radius,b:height*.94,c:radius,color:birch?0xd8cebb:0x69503d,rot:angle});
    if(birch){
      const foliage=[0x62834d,0x749558,0x83a465,0x4f7549];
      for(let j=0;j<5;j++){
        const a=angle+j*2.4,spread=height*(j===0?.0:.125);
        crowns.push({x:x+Math.cos(a)*spread,y:y+height*(j===0?.87:.68+(j%2)*.07),z:z+Math.sin(a)*spread,
          a:height*.18,b:height*(j===0?.24:.18),c:height*.155,rot:a,color:foliage[Math.floor((shade*4+j)%4)]});
      }
    }else{
      const spread=height*(.16+shade*.073);
      needles.push({x,y:y+height*.62,z,a:spread,b:height*.79,c:spread*(.87+shade*.2),color:pineColors[Math.floor(shade*4)],rot:angle});
    }
  }
  for(let i=0;i<260;i++){
    const x=(rng()-.5)*104,z=(rng()-.55)*102,h=ground(x,z);
    if(h<-.41||Math.hypot(x,z-3)<8||!arena&&z>-10&&trailDistance(x,z)<1.7)continue;
    const a=.15+rng()*(rng()>.91?1.7:.51);
    rocks.push({x,y:h+.065,z,a,b:a*(.40+rng()*.45),c:a*(.62+rng()*.81),color:[0x777f72,0x8b8475,0x666b62][i%3],rot:rng()*6});
  }
  for(let i=0;i<2650;i++){
    const x=(rng()-.5)*79,z=(rng()-.65)*71,h=ground(x,z);
    if(h<-.25||arena&&Math.hypot(x,z-3)<10||!arena&&z>-10&&trailDistance(x,z)<1.55)continue;
    if(h<.11){
      const s=.88+rng()*1.1;
      reeds.push({x,y:h+.02,z,a:s,b:s*2.65,c:s,color:[0x718251,0x8c9853,0x8b8957][i%3],rot:rng()*TAU});
      continue;
    }
    if(noise(x*.24,z*.24)<.31)continue;
    const s=.65+rng()*1.37;
    grass.push({x,y:h+.015,z,a:s,b:s*.92,c:s,color:[0x7f955a,0x668c55,0xa3a964,0x648154][i%4],rot:rng()*TAU});
  }
  instance(logGeo,material(0xffffff),trunks,true);
  instance(birchBark(),material(0xffffff,{vertexColors:true}),birches,true);
  instance(pineCrown(),material(0xffffff,{side:T.DoubleSide}),needles,true);
  instance(new T.IcosahedronGeometry(1,2),material(0xffffff,{flatShading:true}),crowns,true);
  instance(rockGeo,material(0xffffff,{flatShading:true}),rocks,true);
  instance(grassGeo,material(0xffffff,{side:T.DoubleSide}),grass,false);
  instance(grassGeo,material(0xffffff,{side:T.DoubleSide}),reeds,false);
}
function mesh(parent,geo,mat,x,y,z,a=1,b=1,c=1){
  const node=new T.Mesh(geo,mat);
  node.position.set(x,y,z);node.scale.set(a,b,c);node.castShadow=true;node.receiveShadow=true;
  parent.add(node);return node;
}
function textSprite(line,color='#ecf5d7'){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=84;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#162a23e8';ctx.beginPath();ctx.roundRect(5,9,374,65,13);ctx.fill();
  ctx.strokeStyle='#b9d9b98a';ctx.lineWidth=2;ctx.stroke();
  ctx.font='600 32px sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(line,192,42,350);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map,depthTest:true,depthWrite:false}));
  sprite.scale.set(2.15,.47,1);
  return sprite;
}
const naturalHeight={cat:1.60,fox:1.70,wolf:1.89,hare:1.56,otter:1.13,badger:1.21,boar:1.62,bear:1.76,stag:3.14};
const modelHeight=(spec,mech)=>spec.type==='human'?2.43:
  ((naturalHeight[spec.model]??1.7)+(mech?.18:0))*spec.scale*(mech?1.45:1)+.31;

function sightDistance(target,eye,trees,player,actors){
  const span=Math.hypot(eye.x-target.x,eye.z-target.z);
  const dx=(eye.x-target.x)/span,dz=(eye.z-target.z)/span;
  let nearest=span;
  function consider(x,z,radius,bottom,top){
    const ox=x-target.x,oz=z-target.z;
    const along=ox*dx+oz*dz,across=Math.abs(ox*dz-oz*dx);
    const fringe=.47;
    if(along<=.06||along-radius>=span||across>=radius+fringe)return;
    const edge=Math.sqrt(Math.max(0,radius*radius-across*across));
    const start=Math.max(.06,along-edge),end=Math.min(span,along+edge);
    const y0=mix(target.y,eye.y,start/span),y1=mix(target.y,eye.y,end/span);
    const gap=Math.max(0,Math.min(y0,y1)-top,bottom-Math.max(y0,y1));
    const coverage=(1-T.MathUtils.smoothstep(across,radius,radius+fringe))*
      (1-T.MathUtils.smoothstep(gap,0,.36))*T.MathUtils.smoothstep(along,.06,.48);
    nearest=Math.min(nearest,mix(span,clamp(start-.37,.72,span),coverage));
  }
  for(const tree of trees){
    const {x,y,z,height,radius,type}=tree;
    consider(x,z,radius+.17,y-.10,y+height*.93);
    consider(x,z,height*(type==='birch'?.24:.18),y+height*(type==='birch'?.55:.38),y+height*.97);
  }
  for(const a of actors){
    if(a===player||a.hidden||a.hp<=0)continue;
    const groundY=ground(a.x,a.z),spec=characters[a.key];
    const height=(modelHeight(spec,a.mech)-.38)*(a.small?.51:1);
    consider(a.x,a.z,bodyRadius(a)*.84,groundY,groundY+height);
  }
  return nearest;
}

export class LakeScene {
  constructor(container,arena){
    this.scene=new T.Scene();
    this.scene.background=new T.Color(0xb9d0cc);
    this.scene.fog=new T.FogExp2(0xb9d0cc,.012);
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.2:1.6));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFShadowMap;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.11;
    container.replaceChildren(this.renderer.domElement);
    this.camera=new T.PerspectiveCamera(48,1,.12,215);
    this.sun=new T.DirectionalLight(0xffe2ba,2.35);
    this.sun.position.set(-25,39,-15);this.sun.castShadow=true;
    Object.assign(this.sun.shadow.camera,{left:-35,right:35,top:37,bottom:-33,near:1,far:100});
    this.sun.shadow.mapSize.set(1536,1536);this.sun.shadow.bias=-.0001;this.sun.shadow.normalBias=.041;
    this.ambient=new T.HemisphereLight(0xd4edf0,0x606449,1.8);
    this.scene.add(this.sun,this.ambient);
    terrain(this.scene,arena);
    this.water=addWater(this.scene);
    this.sky=skyAndRidges(this.scene);
    const trees=treesFor(arena);
    nature(this.scene,arena,trees);
    this.viewTrees=trees.filter(t=>Math.abs(t.x)<59&&t.z>-49&&t.z<56);
    this.nodes=new Map();this.effects=[];this.resourceNodes=new Map();
    this.zoom=arena?12.7:8.65;this.yaw=arena?0:-Math.PI/6;
    this.cameraDistance=this.zoom;
    this.cameraSlope=arena?.43:.365;
    this.target=new T.Vector3(0,1,0);
    this.follow=new T.Vector3();
    this.cameraGoal=new T.Vector3();
    this.house=new T.Group();this.scene.add(this.house);
    this.weatherType='sun';this.mode='sun';
    this.raindrops=this.createRain();
    if(arena)this.makeArena();
    else {
      const post=new T.Group();post.position.set(2,ground(2,-7.5),-7.5);this.scene.add(post);
      mesh(post,plank,woodMat,0,.7,0,.16,1.4,.16);
      const sign=textSprite('湖岸步道');sign.scale.multiplyScalar(.66);sign.position.y=1.64;post.add(sign);
    }
    this.resize(container);
    this.onResize=()=>this.resize(container);
    addEventListener('resize',this.onResize);
  }
  resize(container){
    const w=container.clientWidth||innerWidth,h=container.clientHeight||innerHeight;
    this.camera.aspect=w/h;
    this.baseFov=mix(50,68,clamp((1.15-this.camera.aspect)/.70,0,1));
    this.camera.fov=this.baseFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }
  makeArena(){
    for(let i=0;i<20;i++){
      const a=i*TAU/20,x=21*Math.cos(a),z=4+16*Math.sin(a);
      const y=ground(x,z);
      mesh(this.scene,rockGeo,rockMat,x,y,z,.67,.3,.49).rotation.y=a;
      if(i%5===0){
        mesh(this.scene,plank,trimMat,x,y+.68,z,.16,1.2,.16);
        mesh(this.scene,rockGeo,crateMat,x,y+1.33,z,.17,.18,.17);
      }
    }
  }
  createRain(){
    const count=440,positions=new Float32Array(count*6);
    const drops=Array.from({length:count},()=>[Math.random()*72-36,Math.random()*29,Math.random()*66-33]);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));
    const l=new T.LineSegments(g,new T.LineBasicMaterial({color:0xc6e4e5,transparent:true,opacity:.43}));
    l.visible=false;l.frustumCulled=false;this.scene.add(l);
    return {drops,l,positions};
  }
  setWeather(type){
    if(this.weatherType===type&&this.mode===type)return;
    this.weatherType=type;
    this.mode=type;
    this.scene.fog.color.setHex(stormColors[type]??stormColors.sun);
    this.scene.fog.density=type==='storm'?.027:type==='apocalypse'?.021:.012;
    this.sun.intensity=type==='storm'?1.05:type==='rain'?1.48:2.35;
    this.sun.color.setHex(type==='apocalypse'?0xffaa71:0xffe2ba);
    this.sky.value=type==='storm'?.94:type==='rain'?.58:type==='apocalypse'?.42:0;
    this.water.uMood.value=this.sky.value;
    this.raindrops.l.visible=type==='rain'||type==='storm';
  }
  setHouse(home){
    disposeChildren(this.house);
    this.houseMat?.dispose();
    this.houseMat=null;
    if(!home)return;
    const [key,,color]=materials.find(row=>row[0]===home.material)??materials[0];
    const grade=home.level;
    const surface=this.houseMat=material(color,{metalness:key==='wood'||key==='clay'?0:.28});
    const x=-9,z=7,y=ground(x,z);
    this.house.position.set(x,y,z);
    mesh(this.house,plank,trimMat,0,.134,0,4.65,.28,3.62);
    for(let i=0;i<7;i++){
      const level=.34+i*.27;
      mesh(this.house,plank,surface,0,level,-1.65,4.36,.255,.23);
      mesh(this.house,plank,surface,-2.1,level,0,.23,.255,3.42);
      mesh(this.house,plank,surface,2.1,level,0,.23,.255,3.42);
      mesh(this.house,plank,surface,-1.43,level,1.65,1.42,.255,.23);
      mesh(this.house,plank,surface,1.43,level,1.65,1.42,.255,.23);
    }
    mesh(this.house,plank,trimMat,0,2.32,1.65,4.45,.27,.33);
    const left=mesh(this.house,plank,grade>2?surface:woodMat,-1.12,2.50,0,2.83,.19,3.98);
    const right=mesh(this.house,plank,grade>2?surface:woodMat,1.12,2.50,0,2.83,.19,3.98);
    left.rotation.z=.43;right.rotation.z=-.43;
    mesh(this.house,plank,trimMat,0,.13,1.86,1.35,.18,.42);
    const sign=textSprite('避难所 · '+grade+'级');sign.position.set(0,3.46,1.1);this.house.add(sign);
  }
  addResource(item){
    const [key,name,color]=item.material;
    const group=new T.Group();group.position.set(item.x,ground(item.x,item.z),item.z);this.scene.add(group);
    const mat=material(color,{metalness:key==='wood'||key==='clay'?0:.37,roughness:.61,emissive:color,emissiveIntensity:.065});
    group.userData.material=mat;
    if(key==='wood'){
      for(let i=0;i<3;i++)mesh(group,logGeo,mat,(i-1)*.25,.18,i*.05,.17,1.2+i*.16,.16).rotation.x=Math.PI*.51;
    }else{
      const geo=['clay','copper','iron','gold'].includes(key)?rockGeo:gemGeo;
      for(let i=0;i<3;i++){
        const piece=mesh(group,geo,mat,(i-1)*.20,.15+i*.085,i*.09,.31-i*.055,.2+i*.12,.36-i*.063);
        piece.rotation.set(i*.32,i*1.39,i*.19);
      }
    }
    const nameplate=textSprite(name);nameplate.scale.multiplyScalar(.62);nameplate.position.y=.96;group.add(nameplate);
    group.userData.nameplate=nameplate;
    this.resourceNodes.set(item.id,group);
  }
  removeResource(id){
    const group=this.resourceNodes.get(id);
    if(group){this.scene.remove(group);disposeChildren(group);group.userData.material.dispose();}
    this.resourceNodes.delete(id);
  }
  actor(a,t,dt){
    let node=this.nodes.get(a.id);
    if(!node||node.skin!==a.skin||node.key!==a.key){
      if(node)this.removeActor(a.id);
      const spec=characters[a.key];
      const model=makeModel(spec,a.skin);this.scene.add(model.root);
      const mark=a.id==='self'||a.noName?null:textSprite(a.label??spec.name,a.team==='enemy'?'#ffd1ac':'#e4f7d2');
      if(mark)this.scene.add(mark);
      const footHeight=(x,z)=>{
        const {position,rotation,scale}=model.root;
        const s=Math.sin(rotation.y),c=Math.cos(rotation.y);
        const height=ground(position.x+(x*c+z*s)*scale.x,position.z+(z*c-x*s)*scale.x);
        return clamp((height-position.y)/scale.x,-.22,.22);
      };
      node={model,mark,key:a.key,skin:a.skin,spec,x:a.x,z:a.z,footHeight};
      this.nodes.set(a.id,node);
    }
    const {model,mark,spec}=node;
    const hidden=a.hidden===true;
    const height=ground(a.x,a.z);
    model.root.position.set(a.x,Math.max(height,lakeHeight-.12),a.z);
    model.root.rotation.y=a.angle??0;
    const travel=dt>0?Math.min(2,Math.hypot(a.x-node.x,a.z-node.z)):0;
    node.x=a.x;node.z=a.z;
    model.update(t,{dt,travel,footHeight:node.footHeight,mech:a.mech,small:a.small,hidden,attack:a.attackFx??0,hit:a.hitFx??0});
    if(mark){
      mark.visible=!hidden;
      mark.position.set(a.x,Math.max(height,lakeHeight)+modelHeight(spec,a.mech)*(a.small?.51:1),a.z);
    }
  }
  removeActor(id){
    const node=this.nodes.get(id);
    if(!node)return;
    this.scene.remove(node.model.root);
    node.model.dispose?.();
    if(node.mark){this.scene.remove(node.mark);node.mark.material.map.dispose();node.mark.material.dispose();}
    this.nodes.delete(id);
  }
  effect(type,x,z,color,target){
    const duration=type==='rock'?.72:type==='element'?.67:.45;
    const m=new T.MeshBasicMaterial({color,transparent:true,opacity:.79,side:T.DoubleSide,depthWrite:false});
    const n=new T.Mesh(type==='rock'?rockGeo:ringGeo,m);
    this.scene.add(n);
    if(type!=='rock')n.rotation.x=-Math.PI/2;
    this.effects.push({type,x,z,n,age:0,duration,target});
  }
  draw(player,actors,t,dt){
    const current=new Set(actors.map(a=>a.id));
    for(const id of this.nodes.keys())if(!current.has(id))this.removeActor(id);
    for(const a of actors)this.actor(a,t,dt);
    for(const {position,userData} of this.resourceNodes.values()){
      userData.nameplate.visible=Math.hypot(position.x-player.x,position.z-player.z)<9;
    }
    this.water.uTime.value=t;
    if(this.raindrops.l.visible){
      const {drops,positions,l}=this.raindrops;
      drops.forEach((p,i)=>{
        p[1]-=dt*(this.weatherType==='storm'?21:15);
        if(p[1]<-.2)p[1]=25;
        const k=i*6;
        positions.set([p[0],p[1],p[2],p[0]+(this.weatherType==='storm'?.54:.12),p[1]+1.03,p[2]+.08],k);
      });
      l.geometry.attributes.position.needsUpdate=true;
    }
    this.effects=this.effects.filter(e=>{
      e.age+=dt;
      const k=e.age/e.duration;
      if(k>=1){this.scene.remove(e.n);e.n.material.dispose();return false;}
      const target=e.target;
      const x=target?mix(e.x,target.x,k):e.x,z=target?mix(e.z,target.z,k):e.z;
      const rise=e.type==='rock'?.4+Math.sin(k*Math.PI)*2.8:0;
      e.n.position.set(x,Math.max(ground(x,z),lakeHeight)+.15+rise,z);
      const scale=e.type==='rock'?.44:.24+k*(e.type==='element'?5.6:2.7);
      e.n.scale.setScalar(scale);
      e.n.material.opacity=.84*(1-k);
      if(e.type==='rock')e.n.rotation.set(t*5,t*7,t*4);
      return true;
    });
    this.follow.set(player.x,Math.max(ground(player.x,player.z),lakeHeight)+.94,player.z);
    this.target.lerp(this.follow,dt===0?1:1-Math.exp(-dt*8));
    const orbitX=Math.sin(this.yaw),orbitZ=Math.cos(this.yaw);
    const shake=this.weatherType==='quake'?Math.sin(t*32)*.11:0;
    const goalX=this.target.x+orbitX*this.zoom,goalZ=this.target.z+orbitZ*this.zoom;
    this.cameraGoal.set(goalX,Math.max(this.target.y+this.zoom*this.cameraSlope,ground(goalX,goalZ)+1.1),goalZ);
    const desired=sightDistance(this.target,this.cameraGoal,this.viewTrees,player,actors);
    const zoomRate=desired<this.cameraDistance?16:5;
    this.cameraDistance=dt===0?desired:mix(this.cameraDistance,desired,1-Math.exp(-dt*zoomRate));
    const distance=this.cameraDistance;
    const nearBoost=clamp((4-distance)/3,0,1);
    const fov=this.baseFov+nearBoost*16;
    if(Math.abs(this.camera.fov-fov)>.15){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    const x=this.target.x+orbitX*distance+shake,z=this.target.z+orbitZ*distance;
    const height=Math.max(this.target.y+distance*this.cameraSlope+nearBoost*.88,ground(x,z)+1.1);
    const ahead=distance*.11;
    this.camera.position.set(x,height,z);
    this.camera.lookAt(this.target.x-orbitX*ahead+shake,this.target.y+.24,this.target.z-orbitZ*ahead);
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){
    removeEventListener('resize',this.onResize);
    for(const id of this.nodes.keys())this.removeActor(id);
    const geometries=new Set(),materials=new Set();
    this.scene.traverse(node=>{
      if(node.isInstancedMesh)node.dispose();
      if(node.geometry&&![rockGeo,ringGeo,logGeo,grassGeo,plank].includes(node.geometry))geometries.add(node.geometry);
      if(node.material)materials.add(node.material);
    });
    geometries.forEach(geo=>geo.dispose());
    for(const mat of materials){
      mat.map?.dispose();
      mat.dispose();
    }
    this.sun.shadow.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
function disposeChildren(group){
  group.traverse(node=>{
    if(node.isSprite){node.material.map.dispose();node.material.dispose();}
  });
  group.clear();
}
export const playerFacing=(dx,dz)=>Math.atan2(dx,dz);
