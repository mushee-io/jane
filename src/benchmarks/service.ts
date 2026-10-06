import { randomUUID } from "node:crypto";

export interface BenchmarkRun{
  id:string;
  at:string;
  task:string;
  modelId:string;
  provider:string;
  latencyMs:number;
  costUsd:number;
  qualityScore:number;
  success:boolean;
  privacyScore?:number;
}

export class BenchmarkService{
  private readonly runs:BenchmarkRun[]=[];

  record(input:Omit<BenchmarkRun,"id"|"at">){
    const run:BenchmarkRun={id:`bench_${randomUUID().replace(/-/g,"")}`,at:new Date().toISOString(),...input};
    this.runs.unshift(run);if(this.runs.length>10000)this.runs.length=10000;return run;
  }

  list(limit=200){return this.runs.slice(0,Math.min(Math.max(limit,1),1000)).map((run)=>({...run}))}

  leaderboard(){
    const grouped=new Map<string,BenchmarkRun[]>();
    for(const run of this.runs){
      const arr=grouped.get(run.modelId)??[];arr.push(run);grouped.set(run.modelId,arr);
    }
    return [...grouped.entries()].map(([modelId,runs])=>{
      const success=runs.filter((r)=>r.success);
      const avg=(key:"latencyMs"|"costUsd"|"qualityScore")=>success.length?success.reduce((sum,r)=>sum+Number(r[key]),0)/success.length:0;
      return{
        modelId,
        provider:runs[0]?.provider??"",
        runs:runs.length,
        successRate:runs.length?success.length/runs.length:0,
        averageLatencyMs:Number(avg("latencyMs").toFixed(2)),
        averageCostUsd:Number(avg("costUsd").toFixed(8)),
        averageQualityScore:Number(avg("qualityScore").toFixed(4)),
        costPerSuccessfulTask:success.length?Number((runs.reduce((sum,r)=>sum+r.costUsd,0)/success.length).toFixed(8)):null
      };
    }).sort((a,b)=>{
      const ac=a.costPerSuccessfulTask??Number.POSITIVE_INFINITY;
      const bc=b.costPerSuccessfulTask??Number.POSITIVE_INFINITY;
      return ac-bc;
    });
  }

  savings(actualCostUsd:number,premiumBaselineUsd:number){
    const saved=Math.max(0,premiumBaselineUsd-actualCostUsd);
    return{
      actualCostUsd,
      premiumBaselineUsd,
      savedUsd:Number(saved.toFixed(8)),
      savedPercent:premiumBaselineUsd>0?Number((saved/premiumBaselineUsd*100).toFixed(2)):0
    };
  }
}
