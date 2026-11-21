/** Resolve the authored ../shared_textures links within this one local package. */
export function brisaliaRev3ResourceUrl(url:string,pageUrl:string):string{
  const base=new URL('/assets/buildings/brisalia-rev3-final/',pageUrl);
  const resolved=new URL(url,pageUrl);
  const path=resolved.pathname.slice(base.pathname.length);
  if(resolved.origin!==base.origin||!resolved.pathname.startsWith(base.pathname)||
    !/^(shared_gltf|shared_textures)\/[^/]+\.(bin|webp|png|jpe?g)$/i.test(path))
    throw new Error(`Brisalia Rev3 resource outside its shared package: ${url}`);
  return resolved.href;
}
