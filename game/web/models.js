import * as T from './vendor/three.module.min.js';
import {seeded} from './landscape.js';
import {clamp} from './rules.js';

const sphere = new T.SphereGeometry(1,16,12);
const box = new T.BoxGeometry(1,1,1);
const earGeo = new T.ConeGeometry(1,1,6);
const cylinder = new T.CylinderGeometry(1,1,1,9);
const sharedShapes=new Set([sphere,box,earGeo,cylinder]);
const furCache = new Map();
const m = (color, props={})=>new T.MeshStandardMaterial({color,...props});
const dark = m(0x261e1c,{roughness:.76});
const teeth = m(0xddc6a4);
const pupil = m(0x0c1313,{roughness:.29});
const nose = m(0x322326,{roughness:.53});
const lens = m(0xb0b557,{roughness:.26});
const cream = m(0xebd0ab,{roughness:.96});
const ivory = m(0xeae6d6,{roughness:.96});
const earPink = m(0xbd826e,{roughness:.95});
const hoof = m(0x4a3930,{roughness:.94});
const skinColor = m(0xa88063,{roughness:.86});
const metal = m(0x44565c,{metalness:.78,roughness:.36});
const blackMetal = m(0x252d32,{metalness:.73,roughness:.57});
const plateEdge = m(0xa37848,{metalness:.68,roughness:.31});
const plateAccent = m(0x707b7e,{metalness:.7,roughness:.48});
const skinColors = {orange:0xd07f36,gold:0xc9a045,silver:0xbdc9ca,police:0x253d66,soldier:0x657249};

function fur(kind,color) {
  const id = kind + ':' + color;
  if (furCache.has(id)) return furCache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width=192;
  canvas.height=96;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(canvas.width,canvas.height);
  const random=seeded(color+42);
  for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
    const v=y/(canvas.height-1),u=x/(canvas.width-1);
    let shade=224+random()*21+7*Math.sin(v*Math.PI);
    if(kind==='cat'||kind==='tiger'){
      const band=Math.sin((u*8+(v-.48)**2*2.1+.13*Math.sin(v*12+u*9))*Math.PI*2);
      const depth=kind==='cat'?.24:.43;
      const envelope=Math.sin(v*Math.PI)**1.35;
      shade*=1-depth*envelope*T.MathUtils.smoothstep(band,.40,.94);
    }else if(kind==='lynx'){
      const speckle=Math.sin(u*103+v*27)*Math.cos(v*70-u*9);
      shade*=1-.22*T.MathUtils.smoothstep(speckle,.63,1);
    }else if(kind==='badger'){
      shade*=.92+.08*Math.sin(u*13+v*4);
    }
    const at=(y*canvas.width+x)*4;
    pixels.data[at]=shade;
    pixels.data[at+1]=shade;
    pixels.data[at+2]=shade;
    pixels.data[at+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const tex=new T.CanvasTexture(canvas);
  tex.colorSpace=T.SRGBColorSpace;
  tex.anisotropy=4;
  const material=m(color,{map:tex,roughness:.98});
  furCache.set(id,material);
  return material;
}

function attach(parent,geo,material,x,y,z,sx,sy,sz) {
  const mesh=new T.Mesh(geo,material);
  mesh.position.set(x,y,z);
  mesh.scale.set(sx,sy,sz);
  mesh.castShadow=Math.max(sx,sy,sz)>.12;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}
const oblong=(p,mat,x,y,z,a,b,c)=>attach(p,sphere,mat,x,y,z,a,b,c);
const part=(p,mat,x,y,z,a,b,c)=>attach(p,box,mat,x,y,z,a,b,c);
function link(parent, mat, a, b, radius, tip=radius) {
  const v0=new T.Vector3(...a),v1=new T.Vector3(...b);
  const center=v0.clone().lerp(v1,.5);
  const axis=v1.clone().sub(v0);
  const geometry=tip===radius?cylinder:new T.CylinderGeometry(tip/radius,1,1,8);
  const mesh=attach(parent,geometry,mat,...center.toArray(),radius,axis.length(),radius);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
  return mesh;
}

const anatomy = {
  cat:[.37,.84,.81,.035,.99,.035],fox:[.34,.91,.83,.27,1.09,.025],
  wolf:[.42,1.09,.94,.32,.87,.075],bear:[.58,1.02,.97,.11,.24,.23],
  hare:[.33,.60,.49,.012,.15,.10],otter:[.34,.54,.86,.055,.94,.065],
  badger:[.44,.61,.78,.15,.38,.095],boar:[.51,.84,.89,.29,.27,.18],
  stag:[.33,1.39,.88,.23,.22,.035]
};
const tailBend={cat:.67,fox:.16,hare:.12,otter:-.13,boar:.24,wolf:-.12};
const gaitStyles={cat:[.00,.48,.77,.26],fox:[.03,.50,.58,.08],
  hare:[.11,.05,.59,.52],bear:[.03,.53,.76,.26],stag:[.05,.57,.58,.05]};
const groups = () => [new T.Group(),new T.Group()];

function curvedTail(parent,kind,coat,length,width){
  const curve=new T.CatmullRomCurve3([[0,0,0],[.02,.035,-length*.32],
    [.07,(tailBend[kind]??.06)*.58,-length*.73],[.16,(tailBend[kind]??.06),-length]]
    .map(point=>new T.Vector3(...point)));
  const segments=15,sides=8;
  const geometry=new T.TubeGeometry(curve,segments,width,sides,false);
  const position=geometry.attributes.position;
  const palette=[];
  const base=new T.Color(),tip=new T.Color(kind==='fox'||kind==='hare'?0xe6dfcc:kind==='cat'?0x985431:0x9c8e81);
  for(let i=0;i<=segments;i++){
    const progress=i/segments,center=curve.getPointAt(progress);
    const radius=(kind==='fox'?.75+.5*Math.sin(progress*Math.PI):1)*(1-.77*progress**2);
    const tint=base.copy(coat.color).lerp(tip,T.MathUtils.smoothstep(progress,.54,.91)*.88);
    for(let j=0;j<=sides;j++){
      const index=i*(sides+1)+j;
      position.setXYZ(index,center.x+(position.getX(index)-center.x)*radius,
        center.y+(position.getY(index)-center.y)*radius,center.z+(position.getZ(index)-center.z)*radius);
      palette.push(tint.r,tint.g,tint.b);
    }
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(palette,3));
  geometry.computeVertexNormals();
  const surface=coat.clone();surface.color.set(0xffffff);surface.vertexColors=true;
  const tail=new T.Mesh(geometry,surface);tail.castShadow=true;tail.receiveShadow=true;parent.add(tail);
  const end=curve.getPoint(1);
  oblong(parent,coat,end.x,end.y,end.z,width*.24,width*.24,width*.24);
  return surface;
}

function aimBone(mesh,y0,z0,y1,z1,stretch){
  const y=y1-y0,z=z1-z0;
  mesh.position.y=(y0+y1)*.5;mesh.position.z=(z0+z1)*.5;
  mesh.rotation.x=Math.atan2(z,y);
  mesh.scale.y=Math.hypot(y,z)*stretch;
}

function poseLeg(leg,cycle,liftAmount,stride,activity,bob,footHeight,duty){
  const {hip,upper,lower,foot,front,offset,footBase,mech}=leg;
  const phase=(cycle+offset)%1,swing=(phase-duty)/(1-duty);
  const contact=phase<duty;
  const strideZ=(contact?.5-phase/duty:-.5+swing*swing*(3-2*swing))*stride*activity;
  const lift=contact?0:Math.sin(swing*Math.PI)*liftAmount*activity;
  const z=strideZ+(front?.045:-.035);
  const ground=footHeight?.(hip.position.x,hip.position.z+z+.065)??0;
  const y=footBase+lift+ground-hip.position.y-bob;
  const span=Math.max(.001,Math.hypot(y,z));
  const thigh=hip.position.y*(front?.57:.61),shin=hip.position.y*(front?.60:.55);
  const distance=clamp(span,Math.abs(thigh-shin)+.008,thigh+shin-.004);
  const pivot=(thigh*thigh-shin*shin+distance*distance)/(2*distance);
  const bend=Math.sqrt(Math.max(0,thigh*thigh-pivot*pivot))*(front?-1:1);
  const kneeY=(y*pivot+z*bend)/span,kneeZ=(z*pivot-y*bend)/span;
  aimBone(upper,0,0,kneeY,kneeZ,mech?1.14:.69);
  aimBone(lower,kneeY,kneeZ,y,z,mech?1.12:.65);
  foot.position.set(0,y,z+.065);
  foot.rotation.x=contact?0:Math.sin(swing*Math.PI)*.24;
}

export function makeModel(spec,skin='default') {
  return spec.type==='human'?makeHuman(spec):makeAnimal(spec,skin);
}
function makeAnimal(spec,skin) {
  const root = new T.Group();
  const [body,armor] = groups();
  root.add(body,armor);
  armor.visible=false;
  const kind=spec.model;
  const [width,height,length,muzzle,tailSize,bulk]=anatomy[kind]??anatomy.cat;
  const color=skinColors[skin]??spec.color;
  const coat=fur(spec.id==='lynx'||spec.id==='tiger'?spec.id:kind,color);
  const plain=kind==='cat'||kind==='badger'?fur('plain',color):coat;
  const paler=skin==='police'||skin==='soldier'?plain:
    kind==='hare'||kind==='fox'||kind==='badger'?ivory:kind==='otter'||kind==='cat'||kind==='stag'?cream:plain;
  const glow=m(spec.aura??0x86ebea,{emissive:spec.aura??0x86ebea,emissiveIntensity:2.2,roughness:.22});
  const ownMaterials=[glow];
  const ownTextures=[];
  const bones=[];
  const armorBones=[];
  const brisket=.275+bulk;
  const heavy=kind==='bear'||kind==='boar'||spec.id==='tiger';
  oblong(body,coat,0,height,0,width,brisket,length);
  oblong(body,paler,0,height-brisket*.47,.04,width*.80,brisket*.62,length*.76);
  oblong(body,plain,0,height-.025,-length*.51,width*(kind==='hare'?1.09:.91),brisket*(kind==='hare'?1.13:.88),length*.47);
  const shoulderHeight=height+(heavy?.15:.04);
  oblong(body,coat,0,shoulderHeight,length*.46,width*(heavy?1.10:.91),brisket*(heavy?1.04:.83),length*.49);
  const head=new T.Group();
  body.add(head);
  const deer=kind==='stag',rabbit=kind==='hare';
  head.position.set(0,height+(deer?.72:rabbit?.30:kind==='otter'?.20:.29),length*(deer?.79:.89));
  oblong(body,plain,0,height+(deer?.35:.14),length*.61,width*(deer?.64:.69),deer?.57:.27,deer?.24:.30).rotation.x=deer?.44:.55;
  const headW=width*(rabbit?.74:kind==='bear'?.76:kind==='cat'?.85:.73);
  oblong(head,plain,0,0,0,headW,.254+bulk*.22,.281+muzzle*.39);
  oblong(head,paler,0,-.126,.155+muzzle*.67,headW*.65,.105,.140+muzzle*.70);
  const noseZ=.265+muzzle*1.37;
  oblong(head,nose,0,-.070,noseZ,headW*(kind==='boar'?.47:.29),kind==='boar'?.069:.043,.044);
  for(const side of [-1,1]){
    oblong(head,paler,side*headW*.37,-.117,.224+muzzle*.94,headW*.34,.062,.081+muzzle*.13);
    const eyeX=side*headW*(deer||rabbit?.85:.74),eyeZ=.193+muzzle*.18;
    const eyeSize=kind==='bear'||kind==='boar'?.76:1;
    oblong(head,dark,eyeX,.053,eyeZ,.059*eyeSize,.049*eyeSize,.037);
    oblong(head,kind==='cat'||kind==='fox'||kind==='wolf'?lens:pupil,eyeX+side*.012,.055,eyeZ+.025,.039*eyeSize,.032*eyeSize,.027);
    oblong(head,pupil,eyeX+side*.014,.054,eyeZ+.046,kind==='cat'?.011:.022,.027*eyeSize,.012);
    oblong(head,ivory,eyeX+side*.006,.069,eyeZ+.052,.008,.007,.006);
    const roundEar=['bear','otter','badger'].includes(kind);
    const earTall=rabbit?.33:kind==='fox'?.37:deer?.19:.30;
    const earShape=roundEar||rabbit||deer?sphere:earGeo;
    const earY=.204+(roundEar?0:earTall*(rabbit?.82:deer?.18:.34));
    const earX=side*headW*(roundEar?.89:.76);
    const ear=attach(head,earShape,plain,earX,earY,-.044,roundEar?.10:rabbit?.087:deer?.112:.125,roundEar?.101:earTall,.070);
    ear.rotation.z=-side*(deer?.56:rabbit?.16:.29);ear.rotation.x=rabbit?-.15:.08;
    const inner=attach(head,earShape,earPink,earX+side*.015,earY-.009,.015,roundEar?.059:rabbit?.055:.077,roundEar?.059:earTall*.73,.024);
    inner.rotation.copy(ear.rotation);
    if(spec.id==='lynx')link(head,dark,[earX+side*.038,earY+.11,-.05],[earX+side*.074,earY+.23,-.052],.026,.006);
    if(kind==='badger')oblong(head,dark,side*headW*.63,-.008,.173,headW*.25,.081,.116).rotation.z=side*.50;
    if(kind==='cat'||kind==='fox'||kind==='otter'){
      for(let i=0;i<2;i++)link(head,ivory,[side*headW*.51,-.108-i*.034,noseZ-.018],[side*(headW+.10+i*.028),-.077-i*.064,noseZ-.036],.0037,.0015);
    }
    if(kind==='boar'){
      const tusk=[side*.26,-.095,noseZ-.045];
      link(head,teeth,[side*.19,-.177,noseZ-.06],tusk,.046,.034);
      link(head,teeth,tusk,[side*.30,-.004,noseZ-.058],.034,.007);
    }
    if(deer){
      const antler=[[side*.13,.20,-.11],[side*.25,.50,-.20],[side*.37,.78,-.27],[side*.51,1.01,-.35]];
      for(let i=1;i<antler.length;i++)link(head,teeth,antler[i-1],antler[i],.067-i*.012,.057-i*.014);
      link(head,teeth,antler[1],[side*.56,.67,.03],.035,.011);
      link(head,teeth,antler[2],[side*.63,.89,-.14],.030,.009);
    }
  }
  const tail=new T.Group();
  tail.position.set(0,height+.085,-length*.84);
  body.add(tail);
  ownMaterials.push(curvedTail(tail,kind,plain,spec.id==='lynx'?.31:tailSize,kind==='fox'?.171:kind==='cat'?.080:kind==='boar'?.045:.115));

  for(const side of [-1,1])for(const front of [-1,1]){
    const ahead=front===1;
    const x=side*width*.76,z=front*length*.58;
    const hipHeight=height-(deer?.18:.095);
    const offset=(gaitStyles[kind]??gaitStyles.fox)[(ahead?0:2)+(side===1?1:0)];
    const leg=new T.Group();
    leg.position.set(x,hipHeight,z);
    body.add(leg);
    const legW=(deer?.071:.087)+bulk*.38+(!ahead&&rabbit?.041:0);
    const upper=oblong(leg,plain,0,0,0,legW,1,legW*(ahead?1.15:1.40));
    const lower=oblong(leg,plain,0,0,0,legW*.68,1,legW*.77);
    const footBase=deer?.060:.065;
    const foot=oblong(leg,deer||kind==='boar'?hoof:kind==='cat'&&skin==='default'?paler:plain,
      0,0,0,legW*.94,footBase,legW*(!ahead&&rabbit?2.30:1.48));
    bones.push({hip:leg,upper,lower,foot,front:ahead,offset,footBase,mech:false});

    const roboLeg=new T.Group();
    armor.add(roboLeg);
    roboLeg.position.set(x*1.24,hipHeight+.12,z);
    part(roboLeg,plateAccent,0,.02,0,.25,.21,.31);
    oblong(roboLeg,glow,side*.13,0,0,.025,.043,.05);
    const thigh=part(roboLeg,blackMetal,0,0,0,.19,1,.22);
    const shin=part(roboLeg,metal,0,0,0,.15,1,.18);
    const boot=part(roboLeg,plateAccent,0,0,0,.21,.16,.34);
    part(boot,glow,0,.12,.51,.67,.31,.10);
    armorBones.push({hip:roboLeg,upper:thigh,lower:shin,foot:boot,front:ahead,offset,footBase:.08,mech:true});
  }
  const chest=part(armor,metal,0,height+.2,length*.17,width*2.16,.52,length*1.54);
  chest.rotation.x=.10;
  part(armor,blackMetal,0,height-.12,.12,width*1.8,.31,length*1.65);
  for(const side of [-1,1]){
    const skirting=part(armor,plateAccent,side*width,height+.1,0,.13,.34,length*1.39);
    skirting.rotation.z=side*.24;
    for(let i=0;i<3;i++)part(armor,glow,side*(width+.065),height+.06,-.35+i*.20,.027,.048,.105);
    for(let i=0;i<3;i++)part(armor,blackMetal,side*width*.58,height+.48,.20-i*.28,.22,.074,.13).rotation.y=side*.26;
  }
  const roboHead=new T.Group();
  armor.add(roboHead);
  roboHead.position.set(0,height+(kind==='stag'?.79:.39),length*.98);
  part(roboHead,metal,0,.02,0,width*1.46,.51,.61);
  part(roboHead,blackMetal,0,-.13,.30,width*1.28,.22,.37);
  part(roboHead,plateAccent,0,.16,.27,width*1.40,.10,.19);
  for(const side of [-1,1]){
    part(roboHead,glow,side*width*.37,.035,.349,width*.49,.086,.035).rotation.z=side*.12;
    part(roboHead,plateEdge,side*width*.58,-.103,.332,.07,.20,.26);
    const fin=attach(roboHead,earGeo,plateAccent,side*width*.54,.335,-.10,.136,kind==='hare'?.49:.27,.145);
    fin.rotation.z=-side*.29;
    if(kind==='stag')link(roboHead,plateEdge,[side*.17,.27,-.05],[side*.55,.89,-.24],.08,.013);
  }
  let crest;
  if(spec.rank==='divine'){
    crest=new T.Mesh(new T.TorusGeometry(width*1.07,.023,7,30),glow);
    crest.position.set(0,height+.96,-.12);
    crest.rotation.x=Math.PI/2.7;
    armor.add(crest);
    for(const side of [-1,1])part(armor,glow,side*width*.71,height+.48,-.42,.114,.092,.27);
  }
  if(skin==='police'||skin==='soldier'){
    const patchCanvas=document.createElement('canvas');patchCanvas.width=64;patchCanvas.height=64;
    const ctx=patchCanvas.getContext('2d');ctx.fillStyle=skin==='police'?'#274d7d':'#53613e';ctx.fillRect(0,0,64,64);
    ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f4e6b6';ctx.fillText(skin==='police'?'警':'军',32,34);
    const map=new T.CanvasTexture(patchCanvas);map.colorSpace=T.SRGBColorSpace;ownTextures.push(map);
    const patch=m(0xffffff,{map});ownMaterials.push(patch);
    for(const side of [-1,1]){
      const badge=attach(body,new T.PlaneGeometry(.33,.33),patch,side*width*.93,height+.1,.06,1,1,1);
      badge.rotation.y=side*Math.PI/2;
      const armored=attach(armor,new T.PlaneGeometry(.33,.33),patch,side*(width+.08),height+.2,.71,1,1,1);
      armored.rotation.y=side*Math.PI/2;
    }
  }
  root.scale.setScalar(spec.scale);
  let cycle=0,activity=0;
  const duty=kind==='hare'?.50:kind==='wolf'||kind==='fox'?.55:.62;
  const stride=(kind==='hare'?.98:kind==='bear'?1.19:1.08)*height;
  return {
    root,
    update(t,opts) {
      const {dt=0,travel=0,footHeight,mech=false,small=false,hidden=false,attack=0,hit=0}=opts;
      body.visible=!mech;
      armor.visible=mech;
      root.visible=!hidden;
      const objective=spec.scale*(mech?1.45:1)*(small?.48:1);
      root.scale.setScalar(dt===0?objective:T.MathUtils.lerp(root.scale.x,objective,1-Math.exp(-dt*14)));
      const localSpeed=dt>0?travel/(dt*root.scale.x):0;
      const goal=clamp((localSpeed-.045)/2.28,0,1);
      activity=T.MathUtils.lerp(activity,goal,1-Math.exp(-dt*17));
      const effectiveStride=stride*(.56+.44*activity);
      if(travel>.001)cycle=(cycle+travel/root.scale.x*duty/effectiveStride)%1;
      const bob=Math.sin(cycle*Math.PI*4)*height*(kind==='hare'?.105:.041)*activity;
      body.position.y=bob;
      armor.position.y=bob*.65;
      const activeBones=mech?armorBones:bones;
      for(const leg of activeBones){
        poseLeg(leg,cycle,height*(kind==='hare'?.28:.23),effectiveStride,activity,mech?armor.position.y:bob,footHeight,duty);
      }
      tail.rotation.y=Math.sin(cycle*Math.PI*2)*.25*activity+Math.sin(t*1.4)*.13;
      head.rotation.x=-bob*.69+Math.sin(t*2.3)*.034-attack*.24+hit*.14;
      roboHead.rotation.x=head.rotation.x;
      if(crest)crest.rotation.z=t*.51;
    },
    dispose(){
      root.traverse(node=>{if(node.geometry&&!sharedShapes.has(node.geometry))node.geometry.dispose();});
      for(const surface of ownMaterials)surface.dispose();
      for(const texture of ownTextures)texture.dispose();
    }
  };
}
function makeHuman(spec){
  const root=new T.Group();
  const cloth=fur('human',spec.color);
  const torso=oblong(root,cloth,0,1.35,0,.35,.47,.22);
  torso.rotation.x=.10;
  part(root,blackMetal,0,1.07,.04,.58,.14,.43);
  const head=new T.Group();root.add(head);head.position.set(0,1.89,.02);
  oblong(head,skinColor,0,0,0,.174,.218,.157);
  oblong(head,skinColor,0,-.02,.14,.046,.047,.052);
  for(const side of [-1,1])oblong(head,dark,side*.068,.037,.139,.033,.022,.026);
  oblong(head,cloth,0,.135,-.008,.198,.125,.185);
  oblong(head,cloth,0,.101,.116,.198,.029,.174);
  const limbs=[];
  for(const side of [-1,1]){
    const arm=new T.Group();root.add(arm);arm.position.set(side*.32,1.57,0);
    oblong(arm,cloth,side*.065,-.20,0,.102,.255,.11).rotation.z=side*.16;
    oblong(arm,skinColor,side*.107,-.412,.012,.074,.11,.074);
    const leg=new T.Group();root.add(leg);leg.position.set(side*.145,1.01,0);
    oblong(leg,cloth,0,-.27,0,.129,.31,.138);
    oblong(leg,cloth,0,-.68,.004,.101,.256,.105);
    oblong(leg,blackMetal,0,-.94,.087,.108,.083,.182);
    limbs.push({arm,leg,side});
    if(side===1&&spec.id==='hunter'){
      const prop=new T.Group();arm.add(prop);prop.position.set(.11,-.38,.09);
      part(prop,cloth,0,0,.012,.092,.102,.34);
      part(prop,blackMetal,0,.029,.319,.078,.076,.51);
    }
  }
  let stride=0,activity=0;
  return {root,update(t,{dt=0,travel=0,attack=0,hit=0,hidden=false}){
    root.visible=!hidden;
    activity=T.MathUtils.lerp(activity,dt>0?clamp(travel/(dt*2.45),0,1):0,1-Math.exp(-dt*16));
    stride=(stride+travel*4.3)%(Math.PI*2);
    for(const {arm,leg,side} of limbs){
      const swing = Math.sin(stride)*activity*side;
      leg.rotation.x=swing*.54;
      arm.rotation.x=-swing*.48-attack*(side===1?1.1:.35);
    }
    head.rotation.y=Math.sin(t*1.1)*.54*(1-activity);
    head.rotation.x=hit*.15;
  }};
}
