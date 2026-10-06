import { randomUUID } from "node:crypto";
import type { JaneMode } from "../ai/types.js";

export interface JaneCharacter {
  id:string;
  name:string;
  description:string;
  systemPrompt:string;
  defaultMode:JaneMode;
  tools:string[];
  memoryEnabled:boolean;
  voice?:string;
  createdAt:string;
}

function bootstrap():JaneCharacter[]{
  const raw=process.env.JANE_CHARACTERS_JSON;
  if(!raw)return [];
  try{
    const parsed=JSON.parse(raw) as JaneCharacter[];
    return Array.isArray(parsed)?parsed.filter((c)=>c?.id&&c?.name):[];
  }catch{return []}
}

export class JaneCharacterRegistry{
  private readonly items=new Map<string,JaneCharacter>();
  constructor(){for(const item of bootstrap())this.items.set(item.id,item)}
  list(){return [...this.items.values()].map((item)=>({...item,systemPrompt:undefined}))}
  get(id:string){const item=this.items.get(id);return item?{...item}:null}
  upsert(input:Omit<JaneCharacter,"id"|"createdAt"> & {id?:string}){
    const id=input.id?.trim()||`char_${randomUUID().replace(/-/g,"").slice(0,16)}`;
    const item:JaneCharacter={...input,id,createdAt:this.items.get(id)?.createdAt??new Date().toISOString()};
    this.items.set(id,item);return {...item};
  }
  remove(id:string){return this.items.delete(id)}
}
