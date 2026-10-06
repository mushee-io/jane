import { randomUUID } from "node:crypto";

export interface VoiceSessionRequest{
  voice?:string;
  model?:string;
  instructions?:string;
  mode?:"standard"|"private"|"confidential";
  tools?:string[];
}

export class JaneVoiceService{
  status(){
    return{
      configured:Boolean(process.env.JANE_REALTIME_VOICE_SESSION_ENDPOINT),
      transport:process.env.JANE_REALTIME_VOICE_TRANSPORT??"webrtc",
      privacyModes:["standard","private","confidential"]
    };
  }

  async createSession(input:VoiceSessionRequest){
    const endpoint=process.env.JANE_REALTIME_VOICE_SESSION_ENDPOINT;
    if(!endpoint)throw new Error("REALTIME_VOICE_NOT_CONFIGURED");
    const key=process.env.JANE_REALTIME_VOICE_API_KEY;
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json",...(key?{authorization:`Bearer ${key}`}:{})},
      body:JSON.stringify({
        voice:input.voice,
        model:input.model,
        instructions:input.instructions,
        privacy_mode:input.mode??"standard",
        tools:input.tools??[]
      })
    });
    const body=await response.json().catch(()=>({})) as Record<string,unknown>;
    if(!response.ok)throw new Error(`VOICE_SESSION_PROVIDER_ERROR:${response.status}`);
    return{
      id:`voice_${randomUUID().replace(/-/g,"")}`,
      transport:process.env.JANE_REALTIME_VOICE_TRANSPORT??"webrtc",
      provider:process.env.JANE_REALTIME_VOICE_PROVIDER??"configured",
      session:body
    };
  }
}
