(function(global){
  function b64(bytes){var s="";new Uint8Array(bytes).forEach(function(b){s+=String.fromCharCode(b)});return btoa(s)}
  function pemless(value){return value.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g,"")}
  function fromB64(value){var s=atob(value),out=new Uint8Array(s.length);for(var i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out}

  async function importPublicKey(publicKey){
    if(typeof publicKey==="object"){
      return crypto.subtle.importKey("jwk",publicKey,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
    }
    var der=fromB64(pemless(publicKey));
    return crypto.subtle.importKey("spki",der,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
  }

  async function encryptPayload(payload,config){
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
      version:"1",
      algorithm:"RSA-OAEP-256+A256GCM",
      encryptedKey:b64(encryptedKey),
      iv:b64(iv),
      ciphertext:b64(ciphertext),
      aad:b64(aad),
      attestationFingerprint:config.attestationFingerprint
    };
  }

  global.JaneE2EE={encryptPayload:encryptPayload};
})(window);
