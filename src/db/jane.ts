import { neon } from "@neondatabase/serverless";

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(url);
}

let schemaReady: Promise<void> | null = null;

async function ensureJaneSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const q = sql();
    await q`create extension if not exists pgcrypto`;
    await q`
      create table if not exists jane_profiles (
        user_id text primary key,
        display_name text,
        plan text not null default 'free',
        credit_balance_usd numeric(12,6) not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await q`
      create table if not exists jane_conversations (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        title text not null default 'New chat',
        mode text not null default 'auto',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await q`
      create table if not exists jane_messages (
        id uuid primary key default gen_random_uuid(),
        conversation_id uuid not null references jane_conversations(id) on delete cascade,
        user_id text not null,
        role text not null check (role in ('system','user','assistant')),
        content text not null,
        model_id text,
        provider text,
        cost_usd numeric(14,8),
        created_at timestamptz not null default now()
      )
    `;
    await q`
      create table if not exists jane_usage_events (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        request_id text,
        modality text not null default 'text',
        provider text,
        model_id text,
        input_tokens integer,
        output_tokens integer,
        cost_usd numeric(14,8) not null default 0,
        created_at timestamptz not null default now()
      )
    `;
    await q`
      create table if not exists jane_credit_ledger (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        kind text not null check (kind in ('grant','purchase','usage','refund','adjustment')),
        amount_usd numeric(12,6) not null,
        reference text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await q`
      create table if not exists jane_subscriptions (
        user_id text primary key,
        plan text not null default 'free',
        status text not null default 'active',
        provider text,
        provider_customer_id text,
        provider_subscription_id text,
        current_period_end timestamptz,
        updated_at timestamptz not null default now()
      )
    `;
    await q`create index if not exists jane_conversations_user_updated_idx on jane_conversations(user_id, updated_at desc)`;
    await q`create index if not exists jane_messages_conversation_created_idx on jane_messages(conversation_id, created_at asc)`;
    await q`create index if not exists jane_usage_user_created_idx on jane_usage_events(user_id, created_at desc)`;
    await q`create index if not exists jane_credit_ledger_user_created_idx on jane_credit_ledger(user_id, created_at desc)`;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function ensureProfile(user: {id:string; name?:string|null}) {
  await ensureJaneSchema();
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
  await ensureJaneSchema();
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
  await ensureJaneSchema();
  const q=sql();
  await q`
    insert into jane_usage_events(user_id,request_id,modality,provider,model_id,input_tokens,output_tokens,cost_usd)
    values(${input.userId},${input.requestId ?? null},${input.modality ?? "text"},${input.provider ?? null},${input.modelId ?? null},${input.inputTokens ?? null},${input.outputTokens ?? null},${input.costUsd ?? 0})
  `;
}

export async function listConversations(userId:string){
  await ensureJaneSchema();
  const q=sql();
  return q`
    select id,title,mode,created_at,updated_at
    from jane_conversations where user_id=${userId}
    order by updated_at desc limit 100
  `;
}

export async function saveConversation(input:{userId:string;id?:string;title?:string;mode?:string;messages:Array<{role:string;content:string;modelId?:string;provider?:string;costUsd?:number}>}){
  await ensureJaneSchema();
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
  await ensureJaneSchema();
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
