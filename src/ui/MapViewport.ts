export type MapViewState={zoom:number;x:number;y:number};
export const initialMapView=():MapViewState=>({zoom:1,x:0,y:0});
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** DOM-only navigation. Mounted while the map is open; no animation loop or
 * global listeners, and no interaction with the game's camera or saves. */
export class MapViewport {
  private readonly events=new AbortController();
  private drag:{id:number;x:number;y:number;startX:number;startY:number}|null=null;
  constructor(private readonly root:HTMLElement,readonly state:MapViewState){
    const viewport=root.querySelector<HTMLElement>('.atlas-viewport')!;
    const options={signal:this.events.signal};
    viewport.addEventListener('wheel',e=>{
      e.preventDefault();const r=viewport.getBoundingClientRect();
      this.zoom(state.zoom*Math.exp(-e.deltaY*.0015),(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
    },{...options,passive:false});
    viewport.addEventListener('pointerdown',e=>{
      if(e.button!==0||(e.target as Element).closest('a,button'))return;
      this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:state.x,startY:state.y};
      viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');
    },options);
    viewport.addEventListener('pointermove',e=>{
      if(!this.drag||this.drag.id!==e.pointerId)return;
      const r=viewport.getBoundingClientRect();
      state.x=this.drag.startX+(e.clientX-this.drag.x)/r.width;
      state.y=this.drag.startY+(e.clientY-this.drag.y)/r.height;this.draw();
    },options);
    const release=()=>{this.drag=null;viewport.classList.remove('dragging');};
    viewport.addEventListener('pointerup',release,options);
    viewport.addEventListener('pointercancel',release,options);
    root.addEventListener('click',e=>{
      const button=(e.target as Element).closest<HTMLElement>('[data-atlas]');if(!button)return;
      switch(button.dataset.atlas){
        case 'in':this.zoom(state.zoom*1.5);break;
        case 'out':this.zoom(state.zoom/1.5);break;
        case 'reset':Object.assign(state,initialMapView());this.draw();break;
        case 'player':{
          const player=root.querySelector<HTMLElement>('#map-player');if(!player)return;
          state.zoom=3;state.x=.5-parseFloat(player.style.left)/100*state.zoom;
          state.y=.5-parseFloat(player.style.top)/100*state.zoom;this.draw();break;
        }
      }
    },options);
    this.draw();
  }
  private zoom(value:number,x=.5,y=.5){
    const zoom=clamp(value,1,5),ratio=zoom/this.state.zoom;
    this.state.x=x-(x-this.state.x)*ratio;this.state.y=y-(y-this.state.y)*ratio;
    this.state.zoom=zoom;this.draw();
  }
  private draw(){
    const s=this.state;s.x=clamp(s.x,1-s.zoom,0);s.y=clamp(s.y,1-s.zoom,0);
    this.root.querySelector<HTMLElement>('.atlas-layer')!.style.transform=`translate(${s.x*100}%,${s.y*100}%) scale(${s.zoom})`;
    this.root.style.setProperty('--atlas-zoom',String(s.zoom));
    this.root.style.setProperty('--atlas-label-scale',String(Math.pow(s.zoom,.7)));
    this.root.querySelector<HTMLElement>('[data-atlas-scale]')!.textContent=
      s.zoom<=2?`${(2/s.zoom).toLocaleString('es-AR',{maximumFractionDigits:1})} km`:`${Math.round(2000/s.zoom)} m`;
    this.root.querySelector<HTMLButtonElement>('[data-atlas="out"]')!.disabled=s.zoom===1;
    this.root.querySelector<HTMLButtonElement>('[data-atlas="in"]')!.disabled=s.zoom===5;
    // Keep every pin clickable, but suppress colliding numbers at continent scale.
    // One batch of reads followed by writes, only when the user changes the view.
    const labels=Array.from(this.root.querySelectorAll<SVGTextElement>('.atlas-number'));
    labels.sort((a,b)=>Number(!!b.closest('.selected'))-Number(!!a.closest('.selected')));
    const boxes=labels.map(label=>label.getBoundingClientRect()),used:DOMRect[]=[];
    const visible=boxes.map(box=>{
      if(used.some(other=>box.left<other.right+3&&box.right>other.left-3&&box.top<other.bottom+3&&box.bottom>other.top-3))return false;
      used.push(box);return true;
    });
    labels.forEach((label,i)=>{label.style.opacity=visible[i]?'1':'0';});
  }
  dispose(){this.events.abort();}
}
