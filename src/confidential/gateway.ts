export interface EncryptedInferenceEnvelope {
  version:"1";
  algorithm:"RSA-OAEP-256+A256GCM";
  encryptedKey:string;
  iv:string;
  ciphertext:string;
  aad?:string;
  attestationFingerprint:string;
}

export class ConfidentialGateway {
  status(){
    return{
      configured:Boolean(process.env.JANE_CONFIDENTIAL_GATEWAY_URL),
      transport:"ciphertext-only",
      algorithm:"RSA-OAEP-256+A256GCM"
    };
  }

  async infer(envelope:EncryptedInferenceEnvelope){
    const endpoint=process.env.JANE_CONFIDENTIAL_GATEWAY_URL;
    if(!endpoint)throw new Error("CONFIDENTIAL_GATEWAY_NOT_CONFIGURED");
    const key=process.env.JANE_CONFIDENTIAL_GATEWAY_API_KEY;
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json",...(key?{authorization:`Bearer ${key}`}:{})},
      body:JSON.stringify(envelope)
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`CONFIDENTIAL_GATEWAY_ERROR:${response.status}`);
    return body;
  }
}
