/** Cooperative streaming deadline shared across systems, with fair resumption.
 * A callback must yield between bounded pieces; synchronous GPU uploads cannot
 * be interrupted. A slow piece ends this frame's work instead of stacking it. */
export class FrameWorkScheduler {
  private cursor=0;
  constructor(private readonly now:()=>number=()=>performance.now()){}
  run(tasks:readonly ((deadline:number)=>void)[],budgetMs=2):void{
    if(!tasks.length||budgetMs<=0)return;
    const deadline=this.now()+budgetMs;
    this.cursor%=tasks.length;
    for(let visited=0;visited<tasks.length&&this.now()<deadline;visited++){
      const next=this.cursor;this.cursor=(this.cursor+1)%tasks.length;
      tasks[next](deadline);
    }
  }
}
