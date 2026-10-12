import { neon } from "@neondatabase/serverless";

function sql() {
  const url = process.env.JANE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(url);
}

export async function ensureProfile(user: {id:string; name?:string|null}) {
  const q = sql();
  const rows = await q`
    insert into jane_profiles (user_id, display_name)
    values (${user.id}, ${user.name ?? null})
    on conflict (user_id) do update set
      display_name = coalesce(excluded.display_name, jane_profiles.display_name),
      updated_at = now()
    returning user_id, display_name, plan, credit_balance_usd, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function accountSnapshot(userId: string) {
  const q = sql();
  const [profile] = await q`
    select user_id, display_name, plan, credit_balance_usd, created_at, updated_at
    from jane_profiles where user_id=${userId}
  `;
  const [subscription] = await q`
    select plan, status, provider, current_period_end, updated_at
    from jane_subscriptions where user_id=${userId}
  `;
  const [usage] = await q`
    select coalesce(sum(cost_usd),0)::text as spend_usd, count(*)::int as requests
    from jane_usage_events
    where user_id=${userId} and created_at >= date_trunc('month', now())
  `;
  return { profile: profile ?? null, subscription: subscription ?? null, usage: usage ?? {spend_usd:"0",requests:0} };
}

export async function recordUsage(input:{userId:string;requestId?:string;modality?:string;provider?:string;modelId?:string;inputTokens?:number;outputTokens?:number;costUsd?:number}) {
  const q=sql();
  await q`
    insert into jane_usage_events(user_id,request_id,modality,provider,model_id,input_tokens,output_tokens,cost_usd)
    values(${input.userId},${input.requestId ?? null},${input.modality ?? "text"},${input.provider ?? null},${input.modelId ?? null},${input.inputTokens ?? null},${input.outputTokens ?? null},${input.costUsd ?? 0})
  `;
}

export async function listConversations(userId:string){
  const q=sql();
  return q`
    select id,title,mode,created_at,updated_at
    from jane_conversations where user_id=${userId}
    order by updated_at desc limit 100
  `;
}

export async function saveConversation(input:{userId:string;id?:string;title?:string;mode?:string;messages:Array<{role:string;content:string;modelId?:string;provider?:string;costUsd?:number}>}){
  const q=sql();
  const rows=input.id
    ? await q`
        update jane_conversations set title=${input.title ?? "New chat"}, mode=${input.mode ?? "auto"}, updated_at=now()
        where id=${input.id}::uuid and user_id=${input.userId}
        returning id
      `
    : await q`
        insert into jane_conversations(user_id,title,mode)
        values(${input.userId},${input.title ?? "New chat"},${input.mode ?? "auto"})
        returning id
      `;
  const id=String(rows[0]?.id ?? "");
  if(!id) throw new Error("CONVERSATION_NOT_FOUND");
  await q`delete from jane_messages where conversation_id=${id}::uuid and user_id=${input.userId}`;
  for(const message of input.messages.slice(-100)){
    await q`
      insert into jane_messages(conversation_id,user_id,role,content,model_id,provider,cost_usd)
      values(${id}::uuid,${input.userId},${message.role},${message.content},${message.modelId ?? null},${message.provider ?? null},${message.costUsd ?? null})
    `;
  }
  return {id};
}

export async function getConversation(userId:string,id:string){
  const q=sql();
  const [conversation]=await q`
    select id,title,mode,created_at,updated_at from jane_conversations
    where id=${id}::uuid and user_id=${userId}
  `;
  if(!conversation) return null;
  const messages=await q`
    select role,content,model_id,provider,cost_usd,created_at
    from jane_messages where conversation_id=${id}::uuid and user_id=${userId}
    order by created_at asc
  `;
  return {conversation,messages};
}
