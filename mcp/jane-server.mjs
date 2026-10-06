#!/usr/bin/env node
import readline from "node:readline";

const base=(process.env.JANE_BASE_URL||"http://localhost:8787").replace(/\/$/,"");
const apiKey=process.env.JANE_API_KEY;

async function api(path,body){
  const response=await fetch(base+path,{
    method:body===undefined?"GET":"POST",
    headers:{"content-type":"application/json",...(apiKey?{authorization:`Bearer ${apiKey}`}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||data?.error||`HTTP_${response.status}`);
  return data;
}

function reply(id,result){process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,result})+"\n")}
function fail(id,error){process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,error:{code:-32000,message:error instanceof Error?error.message:String(error)}})+"\n")}

const tools=[
  {name:"jane_chat",description:"Route a chat request through 33jane Auto.",inputSchema:{type:"object",properties:{prompt:{type:"string"},mode:{type:"string"}},required:["prompt"]}},
  {name:"jane_research",description:"Run 33jane research with privacy-aware split planning.",inputSchema:{type:"object",properties:{query:{type:"string"}},required:["query"]}},
  {name:"jane_arena",description:"Compare the same prompt across configured AI models.",inputSchema:{type:"object",properties:{prompt:{type:"string"},maxModels:{type:"number"}},required:["prompt"]}},
  {name:"jane_models",description:"List 33jane virtual models.",inputSchema:{type:"object",properties:{}}}
];

const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
  if(!line.trim())continue;
  let message;
  try{message=JSON.parse(line)}catch{continue}
  const id=message.id;
  try{
    if(message.method==="initialize"){
      reply(id,{protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"33jane",version:"2.0.0"}});
    }else if(message.method==="tools/list"){
      reply(id,{tools});
    }else if(message.method==="tools/call"){
      const name=message.params?.name,args=message.params?.arguments||{};
      let result;
      if(name==="jane_chat") result=await api("/v1/chat/completions",{model:`33jane-${args.mode||"auto"}`,messages:[{role:"user",content:args.prompt}]});
      else if(name==="jane_research") result=await api("/api/research",{mode:"auto",messages:[{role:"user",content:args.query}],query:args.query});
      else if(name==="jane_arena") result=await api("/api/arena",{messages:[{role:"user",content:args.prompt}],maxModels:args.maxModels||3});
      else if(name==="jane_models") result=await api("/v1/models");
      else throw new Error("UNKNOWN_TOOL");
      reply(id,{content:[{type:"text",text:JSON.stringify(result,null,2)}]});
    }else if(message.method==="ping"){
      reply(id,{});
    }
  }catch(error){fail(id,error)}
}
