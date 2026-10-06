import { createHash, timingSafeEqual } from "node:crypto";

export interface AttestationDocument {
  provider:string;
  enclaveId:string;
  measurement:string;
  publicKey?:string;
  issuedAt:string;
  expiresAt:string;
  signature?:string;
  metadata?:Record<string,unknown>;
}

function safeEqualHex(a:string,b:string):boolean{
  try{
    const aa=Buffer.from(a.replace(/^0x/,""),"hex");
    const bb=Buffer.from(b.replace(/^0x/,""),"hex");
    return aa.length===bb.length && timingSafeEqual(aa,bb);
  }catch{return false}
}

export class ConfidentialComputeService{
  status(){
    return{
      configured:Boolean(process.env.JANE_ATTESTATION_ENDPOINT),
      verifierConfigured:Boolean(process.env.JANE_ATTESTATION_VERIFY_ENDPOINT),
      expectedMeasurement:Boolean(process.env.JANE_EXPECTED_ENCLAVE_MEASUREMENT),
      e2eePublicKeyConfigured:Boolean(process.env.JANE_E2EE_PUBLIC_KEY_JWK || process.env.JANE_E2EE_PUBLIC_KEY_PEM)
    };
  }

  async fetchAttestation():Promise<AttestationDocument>{
    const endpoint=process.env.JANE_ATTESTATION_ENDPOINT;
    if(!endpoint)throw new Error("ATTESTATION_ENDPOINT_NOT_CONFIGURED");
    const response=await fetch(endpoint,{headers:process.env.JANE_ATTESTATION_API_KEY?{authorization:`Bearer ${process.env.JANE_ATTESTATION_API_KEY}`}:{}});
    const body=await response.json().catch(()=>({})) as AttestationDocument;
    if(!response.ok)throw new Error(`ATTESTATION_PROVIDER_ERROR:${response.status}`);
    return body;
  }

  verify(document:AttestationDocument){
    const expected=process.env.JANE_EXPECTED_ENCLAVE_MEASUREMENT;
    const now=Date.now();
    const expires=Date.parse(document.expiresAt);
    const measurementMatches=expected?safeEqualHex(document.measurement,expected):false;
    const validTime=Number.isFinite(expires)&&expires>now;
    return{
      valid:Boolean(expected&&measurementMatches&&validTime),
      measurementMatches,
      validTime,
      enclaveId:document.enclaveId,
      provider:document.provider,
      fingerprint:createHash("sha256").update(JSON.stringify({
        provider:document.provider,
        enclaveId:document.enclaveId,
        measurement:document.measurement,
        publicKey:document.publicKey??null,
        expiresAt:document.expiresAt
      })).digest("hex")
    };
  }

  async verifyTrusted(document:AttestationDocument){
    const local=this.verify(document);
    const endpoint=process.env.JANE_ATTESTATION_VERIFY_ENDPOINT;
    if(!endpoint){
      return{...local,hardwareVerified:false,valid:false,reason:"ATTESTATION_VERIFIER_NOT_CONFIGURED"};
    }
    const key=process.env.JANE_ATTESTATION_VERIFY_API_KEY;
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json",...(key?{authorization:`Bearer ${key}`}:{})},
      body:JSON.stringify({document,expectedMeasurement:process.env.JANE_EXPECTED_ENCLAVE_MEASUREMENT})
    });
    const body=await response.json().catch(()=>({})) as {valid?:boolean;reason?:string};
    const hardwareVerified=Boolean(response.ok&&body.valid);
    return{
      ...local,
      hardwareVerified,
      valid:Boolean(local.valid&&hardwareVerified),
      reason:hardwareVerified?null:(body.reason??`ATTESTATION_VERIFIER_ERROR:${response.status}`)
    };
  }

  clientEnvelope(){
    const jwk=process.env.JANE_E2EE_PUBLIC_KEY_JWK;
    const pem=process.env.JANE_E2EE_PUBLIC_KEY_PEM;
    if(!jwk && !pem)throw new Error("E2EE_PUBLIC_KEY_NOT_CONFIGURED");
    let publicKey: unknown = pem;
    if(jwk){
      try{publicKey=JSON.parse(jwk)}catch{throw new Error("E2EE_PUBLIC_KEY_JWK_INVALID")}
    }
    return{
      algorithm:"RSA-OAEP-256+A256GCM",
      publicKey,
      attestationRequired:true,
      note:"Client verifies attestation, generates a one-time AES-256 key, encrypts plaintext locally, and wraps that key to the enclave public key."
    };
  }
}
