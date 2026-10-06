import { randomUUID } from "node:crypto";
import { completeChat } from "../ai/providers.js";
import { modelCatalog } from "../ai/catalog.js";
import type { ChatMessage } from "../ai/types.js";

export interface ArenaRequest{
  messages:ChatMessage[];
  modelIds?:string[];
  maxModels?:number;
}

export class JaneArenaService{
  async run(request:ArenaRequest){
    const all=modelCatalog().filter((model)=>model.configured);
    const wanted=request.modelIds?.length
      ? all.filter((model)=>request.modelIds!.includes(model.id))
      : all.slice(0,Math.min(request.maxModels??3,5));
    if(wanted.length<2)throw new Error("ARENA_REQUIRES_TWO_CONFIGURED_MODELS");

    const results=await Promise.all(wanted.map(async(model)=>{
      const started=Date.now();
      try{
        const result=await completeChat(model,request.messages);
        const input=result.inputTokens??0,output=result.outputTokens??0;
        const cost=(input/1_000_000)*model.inputCostPerMillion+(output/1_000_000)*model.outputCostPerMillion;
        return{
          modelId:model.id,provider:model.provider,label:model.label,
          ok:true,answer:result.content,latencyMs:result.latencyMs,
          costUsd:Number(cost.toFixed(8)),
          qualityScore:model.qualityScore,privacyScore:model.privacyScore
        };
      }catch(error){
        return{
          modelId:model.id,provider:model.provider,label:model.label,
          ok:false,error:error instanceof Error?error.message:"ARENA_PROVIDER_FAILURE",
          latencyMs:Date.now()-started,costUsd:null,
          qualityScore:model.qualityScore,privacyScore:model.privacyScore
        };
      }
    }));

    const successful=results.filter((r)=>r.ok);
    const recommended=successful.sort((a,b)=>{
      const aCost=a.costUsd??1,bCost=b.costUsd??1;
      const aScore=a.qualityScore*0.6+(1/(1+aCost*100))*0.25+a.privacyScore*0.15;
      const bScore=b.qualityScore*0.6+(1/(1+bCost*100))*0.25+b.privacyScore*0.15;
      return bScore-aScore;
    })[0]??null;

    return{id:`arena_${randomUUID().replace(/-/g,"")}`,results,recommended};
  }
}
