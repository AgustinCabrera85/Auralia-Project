/** Small DOM-only entry point: visible before the renderer or game modules load. */
export class LoadingScreen {
  private readonly root=document.getElementById('loading-screen')!;
  private readonly app=document.getElementById('app')!;
  private readonly bar=document.getElementById('loading-progress')!;
  private readonly fill=document.getElementById('loading-fill')!;
  private readonly percent=document.getElementById('loading-percent')!;
  private readonly status=document.getElementById('loading-status')!;
  private readonly retry=document.getElementById('loading-retry') as HTMLButtonElement;
  private progress=0;
  isBlocking=true;
  constructor(){
    this.retry.onclick=()=>location.reload();
    performance.mark('auralia:loading-visible');
  }
  update(progress:number,message:string,stage='loading'):void{
    const value=Math.max(this.progress,Math.min(100,Math.round(progress)));
    this.progress=value;this.root.dataset.stage=stage;
    this.bar.setAttribute('aria-valuenow',String(value));
    this.fill.style.width=`${value}%`;this.percent.textContent=`${value}%`;
    if(this.status.textContent!==message)this.status.textContent=message;
  }
  async finish():Promise<void>{
    this.update(100,'El valle está listo. ¡Buen viaje!','ready');
    this.root.setAttribute('aria-busy','false');
    performance.mark('auralia:playable');
    await paintLoadingScreen();
    this.root.classList.add('is-leaving');
    await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion:reduce)').matches?0:450));
    this.root.hidden=true;this.app.inert=false;this.app.removeAttribute('aria-hidden');
    this.isBlocking=false;
    document.getElementById('game-canvas')?.focus({preventScroll:true});
  }
  fail(error:unknown):void{
    console.error('[Auralia startup]',error);
    this.root.dataset.stage='error';this.root.setAttribute('aria-busy','false');
    document.getElementById('loading-title')!.textContent='El viaje tendrá que esperar';
    this.status.textContent='No pudimos terminar de preparar el mundo.';
    document.getElementById('loading-note')!.textContent='Volvé a intentarlo. Si continúa, comprobá la conexión y que WebGL esté habilitado en tu navegador.';
    this.retry.hidden=false;this.retry.focus();
  }
}

/** Give the browser a paint between bounded preparation steps. */
export const paintLoadingScreen=():Promise<void>=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
