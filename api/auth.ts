import { proxyNeonAuth } from "../src/auth/neon.js";

export const config = { maxDuration: 30 };

export default {
  async fetch(request: Request): Promise<Response> {
    const url=new URL(request.url);
    const action=url.searchParams.get("action") ?? "";
    try{
      return await proxyNeonAuth(request,action);
    }catch(error){
      return Response.json({error:error instanceof Error?error.message:"AUTH_PROXY_FAILED"},{status:502,headers:{"cache-control":"no-store"}});
    }
  }
};
