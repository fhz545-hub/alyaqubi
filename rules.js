(function(){
  const FALLBACK = null;

  async function loadRules(){
    try{
      const res = await fetch("assets/rules_seed.json", {cache:"no-store"});
      if(!res.ok) throw new Error("rules fetch failed");
      return await res.json();
    }catch(e){
      if(FALLBACK) return FALLBACK;
      return {version:1, attendance:{types:[]}, behavior:{infractions:[], actionsCatalog:{}}};
    }
  }

  window.Rules = { loadRules };
})();
