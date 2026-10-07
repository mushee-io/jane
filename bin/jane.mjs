#!/usr/bin/env node
const [,,command,...rest]=process.argv;
const base=(process.env.JANE_BASE_URL||"http://localhost:8787").replace(/\/$/,"");
const key=process.env.JANE_API_KEY;
async function call(path,body){
  const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"content-type":"application/json",...(key?{authorization:`Bearer ${key}`}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();if(!response.ok){console.error(text);process.exit(1)}console.log(text)
}
if(command==="models") await call("/v1/models");
else if(command==="chat") await call("/v1/chat/completions",{model:process.env.JANE_MODEL||"jane-auto",messages:[{role:"user",content:rest.join(" ")}]});
else if(command==="research") await call("/api/research",{mode:"auto",messages:[{role:"user",content:rest.join(" ")}]});
else{
  console.log("Jane CLI\n  jane models\n  jane chat <prompt>\n  jane research <query>\nEnvironment: JANE_BASE_URL, JANE_API_KEY, JANE_MODEL");
}
