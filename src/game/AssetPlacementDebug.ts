export type AssetPlacementPose={
  positionCm:[number,number,number];
  rotationDeg:[number,number,number];
};

export type AssetPlacementTarget={
  id:string;
  label:string;
  defaults:AssetPlacementPose;
  read:()=>AssetPlacementPose;
  apply:(pose:AssetPlacementPose)=>void;
  axesLabel?:string;
  positionRangeCm?:number;
};

const STORAGE_PREFIX='auralia.assetPlacementDebug.v1.';
const validPose=(value:unknown):value is AssetPlacementPose=>{
  if(!value||typeof value!=='object')return false;
  const pose=value as Partial<AssetPlacementPose>;
  return [pose.positionCm,pose.rotationDeg].every(values=>
    Array.isArray(values)&&values.length===3&&values.every(Number.isFinite));
};
const copyPose=(pose:AssetPlacementPose):AssetPlacementPose=>({
  positionCm:[...pose.positionCm],rotationDeg:[...pose.rotationDeg]
});

/** Development-only transform editor. Register another asset to expose it in F9. */
export class AssetPlacementDebug {
  private readonly targets=new Map<string,AssetPlacementTarget>();
  private selectedId:string|null=null;
  private panel:HTMLDivElement|null=null;

  register(target:AssetPlacementTarget):()=>void{
    this.targets.set(target.id,target);
    try{
      const saved:unknown=JSON.parse(localStorage.getItem(STORAGE_PREFIX+target.id)??'null');
      if(validPose(saved))target.apply(copyPose(saved));
    }catch{/* Browser storage may be disabled. */}
    this.selectedId??=target.id;
    this.render();
    return ()=>{
      if(this.targets.get(target.id)!==target)return;
      this.targets.delete(target.id);
      if(this.selectedId===target.id)this.selectedId=this.targets.keys().next().value??null;
      this.render();
    };
  }

  toggle():void{
    if(this.panel){this.panel.remove();this.panel=null;return;}
    this.panel=document.createElement('div');
    this.panel.style.cssText='position:fixed;right:12px;bottom:80px;z-index:1201;'+
      'width:290px;background:#102334f2;color:#eef4ff;padding:12px;border-radius:8px;'+
      'font:12px system-ui;box-shadow:0 8px 24px #0008';
    document.body.append(this.panel);
    this.render();
  }

  private render():void{
    const panel=this.panel;
    if(!panel)return;
    panel.replaceChildren();
    const title=document.createElement('strong');
    title.textContent='Colocación de assets · Debug F9';panel.append(title);
    const target=this.targets.get(this.selectedId??'')??this.targets.values().next().value;
    if(!target){
      const empty=document.createElement('p');empty.textContent='No hay assets registrados.';
      panel.append(empty);return;
    }
    this.selectedId=target.id;
    const select=document.createElement('select');
    select.style.cssText='display:block;width:100%;margin:8px 0';
    for(const candidate of this.targets.values())select.add(new Option(candidate.label,candidate.id));
    select.value=target.id;
    select.onchange=()=>{this.selectedId=select.value;this.render();};
    panel.append(select);
    const hint=document.createElement('p');
    hint.textContent=`Posición en cm y rotación en grados; ${target.axesLabel??'ejes locales del asset'}.`;
    hint.style.margin='6px 0';panel.append(hint);
    const pose=copyPose(target.read());
    const controls:HTMLInputElement[]=[];
    const output=document.createElement('textarea');output.readOnly=true;output.rows=2;
    output.style.cssText='width:100%;box-sizing:border-box;margin:8px 0 6px;resize:none';
    const refresh=()=>{
      target.apply(copyPose(pose));
      output.value=`Posición: X ${pose.positionCm[0].toFixed(1)}, Y ${pose.positionCm[1].toFixed(1)}, `+
        `Z ${pose.positionCm[2].toFixed(1)} cm\nRotación: X ${pose.rotationDeg[0]}, `+
        `Y ${pose.rotationDeg[1]}, Z ${pose.rotationDeg[2]} grados`;
      try{localStorage.setItem(STORAGE_PREFIX+target.id,JSON.stringify(pose));}catch{}
    };
    const rows=(values:[number,number,number],limit:number,step:number)=>
      ['X','Y','Z'].forEach((axis,index)=>{
        const row=document.createElement('label');
        row.style.cssText='display:flex;align-items:center;gap:6px;margin:5px 0';
        row.textContent=axis;
        const range=document.createElement('input');range.type='range';
        range.min=String(-limit);range.max=String(limit);range.step=String(step);
        range.value=String(values[index]);range.style.flex='1';
        const number=document.createElement('input');number.type='number';
        number.min=range.min;number.max=range.max;number.step=range.step;
        number.value=range.value;number.style.width='54px';
        const change=(raw:string)=>{
          const parsed=Number(raw);if(!Number.isFinite(parsed))return;
          values[index]=Math.max(-limit,Math.min(limit,parsed));
          range.value=number.value=String(values[index]);refresh();
        };
        range.oninput=()=>change(range.value);number.oninput=()=>change(number.value);
        controls.push(range,number);row.append(range,number);panel.append(row);
      });
    const positionTitle=document.createElement('div');positionTitle.textContent='Posición (cm)';
    panel.append(positionTitle);rows(pose.positionCm,target.positionRangeCm??100,.5);
    const rotationTitle=document.createElement('div');rotationTitle.textContent='Rotación (grados)';
    rotationTitle.style.marginTop='8px';panel.append(rotationTitle);
    rows(pose.rotationDeg,180,1);
    refresh();panel.append(output);
    const copy=document.createElement('button');copy.textContent='Copiar valores';
    copy.onclick=()=>{
      if(navigator.clipboard)void navigator.clipboard.writeText(output.value).catch(()=>output.select());
      else output.select();
    };
    const reset=document.createElement('button');reset.textContent='Restablecer';
    reset.style.marginLeft='8px';
    reset.onclick=()=>{
      const defaults=copyPose(target.defaults);
      pose.positionCm=defaults.positionCm;pose.rotationDeg=defaults.rotationDeg;
      controls.forEach((control,index)=>{
        const axis=Math.floor(index/2)%3;
        control.value=String(index<6?pose.positionCm[axis]:pose.rotationDeg[axis]);
      });
      refresh();
    };
    panel.append(copy,reset);
  }

  dispose():void{
    this.panel?.remove();this.panel=null;this.targets.clear();this.selectedId=null;
  }
}
