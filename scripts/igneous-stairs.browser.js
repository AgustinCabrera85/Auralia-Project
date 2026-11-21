(()=>{const q=window.__igneousQA,{w,r}=q,world=r.traversalWorld(),out=[];
for(const fps of [26,60,144])for(const run of [false,true])for(const lane of [-1.8,-.9,0,.9,1.8])for(const reverse of [false,true]){
 const a=[20+.780869*lane,13.4,-23.25+.624695*lane],b=[26+.780869*lane,15.2,-30.75+.624695*lane];if(reverse){const t=[...a];a.splice(0,3,...b);b.splice(0,3,...t);}
 const start=r.point(a),end=r.point(b);w.traversal.teleport(start.x,start.y+.01,start.z);
 let air=0,minY=Infinity,penetration=0,dist=Infinity,last=Infinity,stalled=0,i;
 for(i=0;i<fps*15;i++){
  const p=w.traversal.position,dx=end.x-p.x,dz=end.z-p.z;dist=Math.hypot(dx,dz);if(dist<Math.max(.25,(run?18:11)/fps*1.2))break;
  if(Math.abs(dist-last)<.0001)stalled++;else stalled=0;last=dist;if(stalled>fps)break;
  w.traversal.step(1/fps,{moveX:dx/dist,moveZ:dz/dist,forwardX:dx/dist,forwardZ:dz/dist,horizontal:0,vertical:1,run,sprint:false,jumpPressed:false},world);
  const v=new w.player.position.constructor(p.x,p.y,p.z);minY=Math.min(minY,r.local(v).y);if(w.traversal.mode!=='grounded')air++;
  const g=r.colliders.querySolidTop(p.x,p.z,p.y+1.02,1.1);if(g&&g.normal.y>.75)penetration=Math.max(penetration,g.height-p.y);
 }
 out.push({fps,run,lane,reverse,distance:dist,minY,air,penetration,frames:i,local:r.local(new w.player.position.constructor(...Object.values(w.traversal.position))).asArray()});
}return {cases:out,failures:out.filter(v=>v.minY<13.35||v.penetration>.03||v.distance>Math.max(.25,(v.run?18:11)/v.fps*1.2))};})()

