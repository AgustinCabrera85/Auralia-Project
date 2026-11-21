import { allowed, denied, type AbilityCondition, type AbilityContext, type Decision } from './types';
export type ConditionEvaluator=(context:AbilityContext,value?:string|number|boolean)=>boolean;
export class AbilityConditions {
  private readonly rules=new Map<string,ConditionEvaluator>([
    ['equipment',(c,v)=>c.equipment===v],['swordLevel',(c,v)=>typeof v==='number'&&c.swordLevel>=v],
    ['playerState',(c,v)=>c.playerState===v],['fact',(c,v)=>typeof v==='string'&&c.facts[v]===true]
  ]);
  register(id:string,evaluator:ConditionEvaluator):void{this.rules.set(id,evaluator);}
  evaluate(condition:AbilityCondition|null,context:AbilityContext):Decision{
    if(!condition)return denied('Condiciones pendientes de configuración.');
    if('all' in condition){
      if(!condition.all.length)return denied('Grupo de condiciones sin configurar.');
      for(const child of condition.all){const r=this.evaluate(child,context);if(r.ok===false)return r;}
      return allowed;
    }
    if('any' in condition){
      if(!condition.any.length)return denied('Alternativas sin configurar.');
      const results=condition.any.map(child=>this.evaluate(child,context));
      return results.some(r=>r.ok)?allowed:denied(results.map(r=>r.ok===true?'':r.reason).join(' o '));
    }
    const rule=this.rules.get(condition.rule);
    if(!rule)return denied(`Regla pendiente: ${condition.rule}.`);
    try{return rule(context,condition.value)?allowed:denied(condition.reason);}
    catch{return denied(`No se pudo evaluar: ${condition.reason}`);}
  }
}
