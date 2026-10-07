import json
import urllib.request

class Jane:
    def __init__(self, api_key=None, base_url="https://jane-seven-sooty.vercel.app", org_id=None, actor_id=None, department=None, agent_account_id=None):
        self.api_key=api_key
        self.base_url=base_url.rstrip("/")
        self.extra_headers={}
        if org_id: self.extra_headers["X-Jane-Org"]=org_id
        if actor_id: self.extra_headers["X-Jane-Actor"]=actor_id
        if department: self.extra_headers["X-Jane-Department"]=department
        if agent_account_id: self.extra_headers["X-Jane-Agent"]=agent_account_id

    def _request(self,path,payload=None):
        headers={"Content-Type":"application/json",**self.extra_headers}
        if self.api_key: headers["Authorization"]="Bearer "+self.api_key
        data=None if payload is None else json.dumps(payload).encode()
        request=urllib.request.Request(self.base_url+path,data=data,headers=headers,method="GET" if payload is None else "POST")
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode())

    def models(self): return self._request("/v1/models")
    def chat(self,**payload): return self._request("/v1/chat/completions",payload)
    def responses(self,**payload): return self._request("/v1/responses",payload)
    def image(self,**payload): return self._request("/api/media/generate",{"modality":"image",**payload})
    def video(self,**payload): return self._request("/api/media/generate",{"modality":"video",**payload})
    def audio(self,**payload): return self._request("/api/media/generate",{"modality":"audio",**payload})
    def voice(self,**payload): return self._request("/api/media/generate",{"modality":"speech",**payload})
    def research(self,**payload): return self._request("/api/research",payload)
    def arena(self,**payload): return self._request("/api/arena",payload)
