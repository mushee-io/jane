export interface JaneClientOptions{
  apiKey?:string;
  baseUrl?:string;
  orgId?:string;
  actorId?:string;
  department?:string;
  agentAccountId?:string;
}

export class JaneClient{
  private readonly baseUrl:string;
  private readonly apiKey?:string;
  private readonly headers:Record<string,string>;
  constructor(options:JaneClientOptions={}){
    this.baseUrl=(options.baseUrl??"https://api.33jane.ai").replace(/\/$/,"");
    this.apiKey=options.apiKey;
    this.headers={
      ...(options.orgId?{"x-jane-org":options.orgId}:{}),
      ...(options.actorId?{"x-jane-actor":options.actorId}:{}),
      ...(options.department?{"x-jane-department":options.department}:{}),
      ...(options.agentAccountId?{"x-jane-agent":options.agentAccountId}:{})
    };
  }
  private async request(path:string,body?:unknown){
    const response=await fetch(this.baseUrl+path,{
      method:body===undefined?"GET":"POST",
      headers:{"content-type":"application/json",...(this.apiKey?{authorization:`Bearer ${this.apiKey}`}:{}),...this.headers},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error((data as any)?.error?.message??(data as any)?.error??`HTTP_${response.status}`);
    return data;
  }
  models(){return this.request("/v1/models")}
  chat(input:any){return this.request("/v1/chat/completions",input)}
  responses(input:any){return this.request("/v1/responses",input)}
  image(input:any){return this.request("/api/media/generate",{...input,modality:"image"})}
  video(input:any){return this.request("/api/media/generate",{...input,modality:"video"})}
  audio(input:any){return this.request("/api/media/generate",{...input,modality:"audio"})}
  voice(input:any){return this.request("/api/media/generate",{...input,modality:"speech"})}
  research(input:any){return this.request("/api/research",input)}
  arena(input:any){return this.request("/api/arena",input)}
}
