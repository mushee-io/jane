import { requireJaneUser } from "../src/auth/neon.js";
import { getConversation, listConversations, saveConversation } from "../src/db/jane.js";

export const config = { maxDuration: 30 };

export default {
  async fetch(request: Request): Promise<Response> {
    try{
      const user=await requireJaneUser(request);
      const url=new URL(request.url);
      if(request.method==="GET"){
        const id=url.searchParams.get("id");
        return Response.json(id?{item:await getConversation(user.id,id)}:{items:await listConversations(user.id)},{headers:{"cache-control":"no-store"}});
      }
      if(request.method==="POST"){
        const body=await request.json() as {id?:string;title?:string;mode?:string;messages?:Array<{role:string;content:string;modelId?:string;provider?:string;costUsd?:number}>};
        if(!Array.isArray(body.messages))return Response.json({error:"MESSAGES_REQUIRED"},{status:400});
        return Response.json(await saveConversation({userId:user.id,id:body.id,title:body.title,mode:body.mode,messages:body.messages}),{headers:{"cache-control":"no-store"}});
      }
      return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
    }catch(error){
      const message=error instanceof Error?error.message:"CONVERSATION_FAILED";
      return Response.json({error:message},{status:message==="AUTH_REQUIRED"?401:502,headers:{"cache-control":"no-store"}});
    }
  }
};
