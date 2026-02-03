function enc(str){ return new TextEncoder().encode(str); }
function b64(buf){
  const bytes = new Uint8Array(buf);
  let s=""; for(const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}
function unb64(s){
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}

export async function hashPassword(password, saltB64=null){
  const salt = saltB64 ? new Uint8Array(unb64(saltB64)) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name:"PBKDF2", salt, iterations:120000, hash:"SHA-256" },
    keyMaterial,
    256
  );
  return {
    salt: b64(salt),
    hash: b64(bits)
  };
}

export async function verifyPassword(password, saltB64, hashB64){
  const { hash } = await hashPassword(password, saltB64);
  return hash === hashB64;
}
