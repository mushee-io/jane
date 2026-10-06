import { randomUUID } from "node:crypto";

export type TeamRole="owner"|"admin"|"developer"|"member"|"viewer";

export interface TeamMember{
  userId:string;
  role:TeamRole;
  department?:string;
  monthlyBudgetUsd?:number;
  active:boolean;
}

export interface JaneTeam{
  id:string;
  name:string;
  orgId?:string;
  members:TeamMember[];
  monthlyBudgetUsd?:number;
  allowedModes?:string[];
  allowedProviders?:string[];
  createdAt:string;
}

function bootstrap():JaneTeam[]{
  const raw=process.env.JANE_TEAMS_JSON;
  if(!raw)return[];
  try{
    const parsed=JSON.parse(raw) as JaneTeam[];
    return Array.isArray(parsed)?parsed.filter((team)=>team?.id&&team?.name):[];
  }catch{return[]}
}

export class TeamService{
  private readonly teams=new Map<string,JaneTeam>();
  constructor(){for(const team of bootstrap())this.teams.set(team.id,team)}
  list(){return[...this.teams.values()].map((team)=>({...team,members:team.members.map((m)=>({...m}))}))}
  get(id:string){const team=this.teams.get(id);return team?{...team,members:team.members.map((m)=>({...m}))}:null}
  upsert(input:Omit<JaneTeam,"id"|"createdAt"> & {id?:string}){
    const id=input.id?.trim()||`team_${randomUUID().replace(/-/g,"").slice(0,16)}`;
    const team:JaneTeam={...input,id,createdAt:this.teams.get(id)?.createdAt??new Date().toISOString()};
    this.teams.set(id,team);return this.get(id)!;
  }
  addMember(teamId:string,member:TeamMember){
    const team=this.teams.get(teamId);if(!team)throw new Error("TEAM_NOT_FOUND");
    const members=team.members.filter((m)=>m.userId!==member.userId);
    members.push(member);
    this.teams.set(teamId,{...team,members});
    return this.get(teamId)!;
  }
  member(teamId:string,userId:string){
    return this.teams.get(teamId)?.members.find((m)=>m.userId===userId&&m.active)??null;
  }
}
