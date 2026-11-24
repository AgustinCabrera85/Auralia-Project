import {Animation,AnimationGroup,Matrix,Quaternion,Scene,TransformNode,Vector3} from '@babylonjs/core';

/** Keep a level swimming posture, borrow the alternating foreleg strokes from
 * Dig, and add rear paddling plus a small neck/head lift with each stroke. */
export function dogoSwimAnimations(scene:Scene,idle:AnimationGroup,dig:AnimationGroup):AnimationGroup[]{
  const localRight=(name:string)=>{
    const node=idle.targetedAnimations.find(t=>t.target.name===name)?.target as TransformNode|undefined;
    if(!node)throw new Error(`Dogo: falta articulación para nadar ${name}`);
    return Vector3.TransformNormal(Vector3.Right(),Matrix.Invert(node.computeWorldMatrix(true))).normalize();
  };
  const forelegs=new Map(dig.targetedAnimations.filter(t=>
    /^front_(thigh|shin|foot|toe)\.[LR]$/.test(t.target.name)&&t.animation.targetProperty==='rotationQuaternion'
  ).map(t=>[t.target.name,t.animation]));
  if(forelegs.size!==8)throw new Error('Dogo: faltan brazadas de la animación Dig');
  // Use Dig's folded foreleg posture, but constrain the swimming stroke to
  // sagittal flexion. Amplifying its tiny three-axis wrist keys twists the paw.
  const digCycle=(dig.to-dig.from)/4;
  const centers=new Map([...forelegs].map(([name,track])=>[name,
    Quaternion.Slerp(track.evaluate(dig.from),track.evaluate(dig.from+digCycle*.5),.5)]));
  const foreAxes=new Map([...forelegs.keys()].map(name=>[name,localRight(name)]));
  const effort=new Map([
    ['spine.009',{axis:localRight('spine.009'),bias:.06,amplitude:.035}],
    ['spine.010',{axis:localRight('spine.010'),bias:.08,amplitude:.055}]
  ]);
  const strokes=new Map<string,{axis:Vector3;amplitude:number;phase:number;fold:boolean}>();
  for(const side of ['L','R'])for(const [name,amplitude,fold] of [
    ['thigh',.24,false],['shin',.42,true],['foot',-.15,false]
  ] as const){
    const joint=`${name}.${side}`;
    strokes.set(joint,{axis:localRight(joint),amplitude,phase:(side==='L'?0:Math.PI)+Math.PI*.5,fold});
  }
  return [false,true].map(moving=>{
    const group=new AnimationGroup(moving?'Swim_Forward':'Swim_Idle',scene),duration=moving?.7:.95;
    for(const {target,animation} of idle.targetedAnimations){
      const first=animation.getKeys()[0].value;
      const rotation=animation.targetProperty==='rotationQuaternion';
      const stroke=rotation?strokes.get(target.name):undefined;
      const foreleg=rotation?forelegs.get(target.name):undefined;
      const head=rotation?effort.get(target.name):undefined;
      const animated=!!(stroke||foreleg||head);
      const track=new Animation(`${group.name}:${target.name}:${animation.targetProperty}`,
        animation.targetProperty,30,animation.dataType,Animation.ANIMATIONLOOPMODE_CYCLE);
      const keys=Array.from({length:animated?31:2},(_,i)=>{
        const t=i/(animated?30:1),phase=t*Math.PI*2+(stroke?.phase??0);
        let value=typeof first==='number'?first:first.clone();
        if(foreleg){
          // Keep the upper leg near the surface. The elbow follows the reach
          // and recovery, while the wrist supplies most of the paddling flexion.
          const upper=target.name.startsWith('front_thigh'),elbow=target.name.startsWith('front_shin');
          const wrist=target.name.startsWith('front_foot');
          const center=centers.get(target.name)!;
          const strength=moving?1:.78;
          const phase=t*Math.PI*2+(target.name.endsWith('.R')?Math.PI:0);
          // Flex and release the wrist; never bend it backwards into a raised
          // paw. The elbow carries the forward reach while the paw folds in.
          const angle=(wrist?-(.38+.38*Math.sin(phase-.2)):Math.sin(phase)*(upper?-.12:elbow?-.28:.035))*strength;
          const pose=Quaternion.Slerp(first,center,upper?1:elbow?.72:0);
          value=pose.multiply(Quaternion.RotationAxis(foreAxes.get(target.name)!,angle));
        }else if(head){
          value=(value as Quaternion).multiply(Quaternion.RotationAxis(head.axis,
            (head.bias+Math.sin(t*Math.PI*2-.3)*head.amplitude)*(moving?1:.65)));
        }else if(stroke){
          const wave=stroke.fold ? .12+Math.max(0,Math.cos(phase)) : Math.sin(phase);
          value=(value as Quaternion).multiply(Quaternion.RotationAxis(stroke.axis,
            wave*stroke.amplitude*(moving?1:.55)));
        }
        return {frame:t*duration*30,value};
      });
      const start=keys[0].value;
      keys[keys.length-1].value=typeof start==='number'?start:start.clone();
      track.setKeys(keys);group.addTargetedAnimation(track,target);
    }
    return group;
  });
}
