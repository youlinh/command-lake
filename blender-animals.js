import {Quaternion,Vector3} from './vendor/three.module.min.js';
import {clone} from './vendor/three-addons/utils/SkeletonUtils.js';

let animalRequest;

export function loadAnimalModels(){
  animalRequest??=Promise.all([
    import('./vendor/three-addons/loaders/GLTFLoader.js'),
    import('./vendor/meshoptimizer/meshopt_decoder.js')
  ]).then(([{GLTFLoader},{MeshoptDecoder}])=>new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(new URL('./assets/animals.glb',import.meta.url).href)
  ).then(({scene})=>{
    const models=new Map();
    for(const root of scene.children){
      if(!root.name.startsWith('Animal_')||typeof root.userData.legRig!=='string')continue;
      const id=root.name.slice('Animal_'.length);
      const legs=JSON.parse(root.userData.legRig);
      const joints=['Head','Tail',...legs.flatMap(({name})=>['Upper','Lower','Foot'].map(part=>name+part))];
      if(legs.length===4&&joints.every(name=>root.getObjectByName(id+'_'+name)?.isBone)){
        models.set(id,{id,root,legs});
      }
    }
    return models;
  }).catch(error=>{
    console.warn('Animal GLB could not be loaded. Using built-in models.',error);
    animalRequest=undefined;
    return new Map();
  });
  return animalRequest;
}

function joint(node){
  return {
    node,
    inverse:node.parent.matrixWorld.clone().invert(),
    rest:node.quaternion.clone(),
    up:new Vector3(0,1,0).applyQuaternion(node.quaternion)
  };
}

export function cloneAnimalModel(template,offsets,kind){
  const root=clone(template.root);
  root.updateMatrixWorld(true);
  const skeletons=new Set();
  root.traverse(node=>{
    if(!node.isSkinnedMesh)return;
    node.castShadow=true;
    node.receiveShadow=true;
    if(!node.geometry.boundingSphere)node.geometry.computeBoundingSphere();
    node.boundingSphere=node.geometry.boundingSphere.clone();
    node.boundingSphere.radius+=.65;
    skeletons.add(node.skeleton);
  });

  const getJoint=name=>joint(root.getObjectByName(template.id+'_'+name));
  const head=getJoint('Head'),tail=getJoint('Tail');
  const headAxis=new Vector3(1,0,0).transformDirection(head.inverse);
  const tailAxis=new Vector3(0,1,0).transformDirection(tail.inverse);
  const direction=new Vector3(),rotation=new Quaternion();

  function segment(part,x,y,z,dy,dz,restLength){
    part.node.position.set(x,y,z).applyMatrix4(part.inverse);
    direction.set(0,dy,dz).transformDirection(part.inverse);
    part.node.quaternion.copy(rotation.setFromUnitVectors(part.up,direction)).multiply(part.rest);
    part.node.scale.y=Math.hypot(dy,dz)/restLength;
  }

  const legs=template.legs.map(({name,hip,front,foot,upperLength,lowerLength},index)=>{
    const upper=getJoint(name+'Upper'),lower=getJoint(name+'Lower'),paw=getJoint(name+'Foot');
    const pawAxis=new Vector3(1,0,0).transformDirection(paw.inverse);
    const [hipX,hipY,hipZ]=hip;
    const standingLength=Math.hypot(hipY-foot,front?.045:.035);
    const reach=standingLength*(kind==='hare'&&!front?1.15:1.045);
    const thigh=reach*(front?.48:.53);
    return {
      hip:{position:new Vector3(...hip)},front,offset:offsets[index],footBase:foot,
      upperLength:thigh,lowerLength:reach-thigh,
      setPose(kneeY,kneeZ,ankleY,ankleZ,pitch){
        segment(upper,hipX,hipY,hipZ,kneeY,kneeZ,upperLength);
        segment(lower,hipX,hipY+kneeY,hipZ+kneeZ,ankleY-kneeY,ankleZ-kneeZ,lowerLength);
        paw.node.position.set(hipX,hipY+ankleY,hipZ+ankleZ+.065).applyMatrix4(paw.inverse);
        paw.node.quaternion.copy(rotation.setFromAxisAngle(pawAxis,pitch)).multiply(paw.rest);
      }
    };
  });
  return {
    root,legs,
    pose(headPitch,tailYaw){
      head.node.quaternion.copy(rotation.setFromAxisAngle(headAxis,headPitch)).multiply(head.rest);
      tail.node.quaternion.copy(rotation.setFromAxisAngle(tailAxis,tailYaw)).multiply(tail.rest);
    },
    dispose(){
      root.removeFromParent();
      for(const skeleton of skeletons)skeleton.dispose();
    }
  };
}
