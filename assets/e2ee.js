(function(global){
  function b64(bytes){var s="";new Uint8Array(bytes).forEach(function(b){s+=String.fromCharCode(b)});return btoa(s)}
  function fromB64(value){var s=atob(value),out=new Uint8Array(s.length);for(var i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out}
  function pemless(value){return value.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g,"")}

  async function importPublicKey(publicKey){
    if(typeof publicKey==="object"){
      return crypto.subtle.importKey("jwk",publicKey,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
    }
    var der=fromB64(pemless(publicKey));
    return crypto.subtle.importKey("spki",der,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
  }

  async function createSession(payload,config){
    if(!config||!config.publicKey||!config.attestationFingerprint)throw new Error("Verified enclave key is required");
    var rsa=await importPublicKey(config.publicKey);
    var aes=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
    var raw=await crypto.subtle.exportKey("raw",aes);
    var encryptedKey=await crypto.subtle.encrypt({name:"RSA-OAEP"},rsa,raw);
    var iv=crypto.getRandomValues(new Uint8Array(12));
    var aad=new TextEncoder().encode(config.attestationFingerprint);
    var plaintext=new TextEncoder().encode(JSON.stringify(payload));
    var ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv,additionalData:aad},aes,plaintext);

    return{
      envelope:{
        version:"1",
        algorithm:"RSA-OAEP-256+A256GCM",
        encryptedKey:b64(encryptedKey),
        iv:b64(iv),
        ciphertext:b64(ciphertext),
        aad:b64(aad),
        attestationFingerprint:config.attestationFingerprint
      },
      decryptResponse:async function(responseEnvelope){
        if(!responseEnvelope||!responseEnvelope.iv||!responseEnvelope.ciphertext)throw new Error("Encrypted response envelope required");
        var responseAad=responseEnvelope.aad?fromB64(responseEnvelope.aad):aad;
        var clear=await crypto.subtle.decrypt({
          name:"AES-GCM",
          iv:fromB64(responseEnvelope.iv),
          additionalData:responseAad
        },aes,fromB64(responseEnvelope.ciphertext));
        var text=new TextDecoder().decode(clear);
        try{return JSON.parse(text)}catch{return{text:text}}
      }
    };
  }

  async function encryptPayload(payload,config){
    var session=await createSession(payload,config);
    return session.envelope;
  }

  global.JaneE2EE={createSession:createSession,encryptPayload:encryptPayload};
})(window);
