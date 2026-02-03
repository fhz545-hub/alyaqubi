import { STORES, all, put, tx } from "./db.js";

export async function makeBackup(db){
  const dump = {};
  for(const s of STORES){
    dump[s] = await all(db, s);
  }
  return {
    app: "rsd-offline",
    exportedAt: new Date().toISOString(),
    data: dump
  };
}

export async function restoreBackup(db, backupObj){
  if(!backupObj?.data) throw new Error("ملف الاستعادة غير صحيح");

  // تفريغ ثم إعادة
  for(const store of STORES){
    await tx(db, store, "readwrite", (s)=>{
      // clear
      s.clear();
      // bulk put
      const arr = backupObj.data[store] || [];
      for(const item of arr) s.put(item);
    });
  }
}
