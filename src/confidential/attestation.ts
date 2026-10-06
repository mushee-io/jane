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
      expectedMeasurement:Boolean(process.env.JANE_EXPECTED_ENCLAVE_MEASUREMENT),
      e2eePublicKeyConfigured:Boolean(process.env.JANE_E2EE_PUBLIC_KEY)
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

  clientEnvelope(){
    const publicKey=process.env.JANE_E2EE_PUBLIC_KEY;
    if(!publicKey)throw new Error("E2EE_PUBLIC_KEY_NOT_CONFIGURED");
    return{
      algorithm:"X25519+AES-256-GCM",
      publicKey,
      attestationRequired:true,
      note:"Client must verify attestation before encrypting plaintext for confidential inference."
    };
  }
}
