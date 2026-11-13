/** Encode straight RGBA without Canvas erasing the RGB of transparent border texels. */
export async function encodeSpritePNG(width:number,height:number,rgba:Uint8ClampedArray):Promise<string>{
 const concat=(parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
 const crc=(data:Uint8Array)=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;};
 const chunk=(type:string,data:Uint8Array)=>{
  const tag=new TextEncoder().encode(type),body=concat([tag,data]),out=new Uint8Array(data.length+12),view=new DataView(out.buffer);
  view.setUint32(0,data.length);out.set(body,4);view.setUint32(out.length-4,crc(body));return out;
 };
 const rows=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const compressed=new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const png=concat([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
 let binary='';for(let i=0;i<png.length;i+=8192)binary+=String.fromCharCode(...png.subarray(i,i+8192));return btoa(binary);
}
