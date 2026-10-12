import { requireJaneUser } from "../src/auth/neon.js";
import { accountSnapshot, ensureProfile } from "../src/db/jane.js";

export const config = { maxDuration: 30 };

export default {
  async fetch(request: Request): Promise<Response> {
    if(request.method!=="GET")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
    try{
      const user=await requireJaneUser(request);
      await ensureProfile(user);
      return Response.json({user,account:await accountSnapshot(user.id)},{headers:{"cache-control":"no-store"}});
    }catch(error){
      const message=error instanceof Error?error.message:"ACCOUNT_FAILED";
      return Response.json({error:message},{status:message==="AUTH_REQUIRED"?401:502,headers:{"cache-control":"no-store"}});
    }
  }
};
