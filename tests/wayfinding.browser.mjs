export async function auditWayfinding(system,geography){
  await system.ready;
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  check(system.errors.length===0,JSON.stringify(system.errors));
  check(system.placed.size===7,'Seven road furniture placements');
  let labels=0,meshes=0;
  for(const {root,site,meshes:parts} of system.placed.values()){
    root.computeWorldMatrix(true);
    let bottom=Infinity;
    for(const mesh of parts){mesh.computeWorldMatrix(true);bottom=Math.min(bottom,mesh.getBoundingInfo().boundingBox.minimumWorld.y);meshes++;
      if(mesh.metadata.inscription){check(mesh.metadata.inscription.trim().length>0,'No blank inscription');labels++;}}
    check(Math.abs(bottom-geography.surface.heightAt(...site.at))<.02,site.id+' touches visible terrain');
    if(site.routes.length){
      const text=parts.map(m=>m.metadata.inscription??'').join(' ');
      check(text.includes(site.region.toUpperCase())&&text.includes(site.location),site.id+' says current location');
      for(const route of site.routes)check(text.includes(route.label),site.id+' names every destination');
    }
    check(!system.canMove(site.at[0],site.at[1],site.at[0]-2,site.at[1],root.position.y),site.id+' solid post');
    check(system.canMove(site.at[0]-2,site.at[1],site.at[0],site.at[1],root.position.y),site.id+' can leave post');
  }
  const observer=system.placed.get('welcome').root.position;
  system.update(0,observer);check(system.lamps.every(l=>l.light.intensity===0),'Lamps do not illuminate during daytime');
  system.update(1,observer);const lit=system.lamps.filter(l=>l.light.intensity>0).length;
  check(lit>0&&lit<=2,'Bounded nearby lighting at night');
  system.update(0,observer);
  return {passed:true,sites:system.placed.size,assetTypes:system.assets.size,labels,meshes,nightLamps:lit,
    locations:system.sites.filter(s=>s.routes.length).map(s=>({location:s.location,destinations:s.routes.map(r=>r.label)}))};
}
