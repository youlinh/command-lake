import {characters,clamp} from './rules.js';

export const arenaArea={minX:-20,maxX:20,minZ:-9,maxZ:19};
const animalRadius={cat:.65,fox:.62,hare:.50,otter:.59,badger:.63,wolf:.68,boar:.71,bear:.75,stag:.65};
const minStep=.0001;

export function bodyRadius(actor){
  const {model,scale}=actor.spec??characters[actor.key];
  return (animalRadius[model]??.47)*scale*(actor.mech?1.23:1)*(actor.small?.52:1);
}

export function meleeBonus(a,b){
  return b?Math.max(0,bodyRadius(a)+bodyRadius(b)-1.12):0;
}

function firstContact(actor,x,z,dx,dz,radius,area,actors){
  const travel=dx*dx+dz*dz;
  let fraction=1,obstacle;
  function test(circle,clearance){
    const ox=x-circle.x,oz=z-circle.z;
    if(Math.abs(ox)>clearance+Math.abs(dx)||Math.abs(oz)>clearance+Math.abs(dz))return;
    const approach=ox*dx+oz*dz;
    if(approach>=0)return;
    const gap=ox*ox+oz*oz-clearance*clearance;
    const discriminant=approach*approach-travel*gap;
    if(discriminant<=0)return;
    const contact=gap<=0?0:gap/(Math.sqrt(discriminant)-approach);
    if(contact<fraction){fraction=contact;obstacle=circle;}
  }
  for(const tree of area.trees??[])test(tree,radius+tree.radius);
  for(const other of actors){
    if(other!==actor&&other.hp>0)test(other,radius+bodyRadius(other));
  }
  return obstacle?{fraction,obstacle}:null;
}

export function moveBody(actor,dx,dz,area,actors,steer=false){
  const startX=actor.x,startZ=actor.z;
  const length=Math.hypot(dx,dz);
  if(length<minStep)return 0;
  const radius=bodyRadius(actor);
  const steps=Math.ceil(length/.20);
  const stepX=dx/steps,stepZ=dz/steps;
  const stepLength=length/steps;
  function advance(xStep,zStep){
    if(Math.abs(xStep)+Math.abs(zStep)<minStep)return 0;
    let x=actor.x,z=actor.z,remainingX=xStep,remainingZ=zStep;
    for(let pass=0;pass<3;pass++){
      const goalX=clamp(x+remainingX,area.minX+radius,area.maxX-radius);
      const goalZ=clamp(z+remainingZ,area.minZ+radius,area.maxZ-radius);
      const dx=goalX-x,dz=goalZ-z;
      const distance=Math.hypot(dx,dz);
      if(distance<minStep||area.walkable&&!area.walkable(goalX,goalZ))break;
      const contact=firstContact(actor,x,z,dx,dz,radius,area,actors);
      if(!contact){x=goalX;z=goalZ;break;}

      // Use the contact normal to keep the part of the movement along the obstacle.
      const {fraction,obstacle}=contact;
      const nx=x+dx*fraction-obstacle.x,nz=z+dz*fraction-obstacle.z;
      const normal=Math.hypot(nx,nz);
      const safe=Math.max(0,fraction-minStep/distance);
      x+=dx*safe;z+=dz*safe;
      if(normal<minStep)break;
      const inward=Math.min(0,(dx*nx+dz*nz)/(normal*normal));
      remainingX=(dx-inward*nx)*(1-fraction);
      remainingZ=(dz-inward*nz)*(1-fraction);
    }
    const moved=Math.hypot(x-actor.x,z-actor.z);
    if(moved<minStep)return 0;
    actor.x=x;actor.z=z;
    return moved;
  }
  for(let i=0;i<steps;i++){
    const moved=advance(stepX,stepZ);
    if(moved&&(!steer||moved>=stepLength*.13))continue;
    const budget=1-moved/stepLength;
    const x=stepX*budget,z=stepZ*budget;
    const preferX=Math.abs(x)>Math.abs(z);
    const slideX=()=>advance(x,0),slideZ=()=>advance(0,z);
    if(preferX?slideX()||slideZ():slideZ()||slideX())continue;
    if(!steer)break;
    const side=actor.avoidSide??1;
    const acrossX=-z*side,acrossZ=x*side;
    if(advance(x*.62+acrossX*.78,z*.62+acrossZ*.78)||advance(acrossX,acrossZ))continue;
    if(!advance(x*.62-acrossX*.78,z*.62-acrossZ*.78)&&!advance(-acrossX,-acrossZ))break;
    actor.avoidSide=-side;
  }
  return Math.hypot(actor.x-startX,actor.z-startZ);
}

export function separateBodies(actors,area){
  for(let i=0;i<actors.length;i++){
    const a=actors[i];
    if(a.hp<=0)continue;
    for(let j=i+1;j<actors.length;j++){
      const b=actors[j];
      if(b.hp<=0)continue;
      const x=b.x-a.x,z=b.z-a.z;
      const gap=Math.hypot(x,z),overlap=bodyRadius(a)+bodyRadius(b)-gap;
      if(overlap<.002)continue;
      const nx=gap>minStep?x/gap:1,nz=gap>minStep?z/gap:0;
      const moved=moveBody(a,-nx*overlap*.5,-nz*overlap*.5,area,actors);
      const rest=Math.max(0,overlap-moved);
      moveBody(b,nx*rest,nz*rest,area,actors);
    }
  }
}
