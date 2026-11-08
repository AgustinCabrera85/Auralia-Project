const DOUBLE_TAP_MS=320;

/** A second Shift press within the window enables sprint until Shift is released. */
export class DoubleTapSprint {
  private lastPressAt=-Infinity;
  private held=false;
  active=false;

  press(now:number):void{
    if(this.held)return;
    this.active=now-this.lastPressAt<=DOUBLE_TAP_MS;
    this.lastPressAt=this.active?-Infinity:now;
    this.held=true;
  }

  release():void{
    this.held=false;
    this.active=false;
  }

  reset():void{
    this.release();
    this.lastPressAt=-Infinity;
  }
}
