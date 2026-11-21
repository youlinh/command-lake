import {clamp} from './rules.js';

const fract=n=>n-Math.floor(n);
const hash=(x,z)=>fract(Math.sin(x*12.9898+z*78.233)*43758.5453);
export const mix=(a,b,t)=>a+(b-a)*t;
export function noise(x,z){
  const i=Math.floor(x),j=Math.floor(z);
  const u=fract(x),v=fract(z),a=u*u*(3-2*u),b=v*v*(3-2*v);
  return mix(mix(hash(i,j),hash(i+1,j),a),mix(hash(i,j+1),hash(i+1,j+1),a),b);
}
export function seeded(seed){
  return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296};
}

export const lakeHeight=-.34;
export const WADE=-.29;
export const trailDistance=(x,z)=>Math.abs(x+6+4.6*Math.sin((z-2)*.088));
export function ground(x,z){
  const lake=Math.hypot((x-4)/41,(z+35)/24);
  const uneven=(noise(x*.127+6,z*.135)-.5)*.91+(noise(x*.31,z*.36)-.5)*.23;
  const clearing=Math.max(0,1-Math.hypot(x*.71,z-4)/26);
  const foothill=Math.max(0,Math.abs(x)-21)*(.045+noise(x*.085,z*.065)*.06);
  return -1.46+clamp((lake-.63)*3.55,0,1.95)+uneven*(1-clearing*.72)+foothill;
}

function growTrees(arena){
  const random=seeded(arena?81:54),trees=[];
  for(let i=0;i<690;i++){
    const x=(random()-.5)*161,z=(random()-.68)*143;
    const y=ground(x,z);
    const height=3.1+random()*6.2;
    const type=random()<.23?'birch':'pine';
    const angle=random()*Math.PI*2;
    const shade=random();
    const radius=height*(type==='birch'?.038:.049);
    if(y<.05||Math.hypot(x*.78,z-5)<(arena?22:12))continue;
    if(!arena&&z>-12&&trailDistance(x,z)<2.5)continue;
    if(!arena&&x<-3&&x>-14&&z>-1&&z<13)continue;
    if(trees.some(t=>(x-t.x)**2+(z-t.z)**2<(1.05+(height+t.height)*.16)**2))continue;
    trees.push({x,y,z,height,radius,type,angle,shade});
  }
  return trees;
}

const woodland=growTrees(false),arenaWoodland=growTrees(true);
export const treesFor=arena=>arena?arenaWoodland:woodland;
export const worldArea={
  minX:-34,maxX:34,minZ:-25,maxZ:34,
  trees:woodland.filter(t=>Math.abs(t.x)<37&&t.z>-29&&t.z<37),
  walkable:(x,z)=>ground(x,z)>WADE
};
