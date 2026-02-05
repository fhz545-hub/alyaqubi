/* Simple Code39 barcode (digits/uppercase letters). For national ID (digits) it works well. */
(function(){
  const MAP = {
    "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn",
    "6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
    "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn",
    "G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
    "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn",
    "Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
    "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn",
    "-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","%":"nnnwnwnwn","+":"nwnnnwnwn",
    "*":"nwnnwnwnn" // start/stop
  };
  function norm(s){ return String(s||"").toUpperCase().replace(/[^0-9A-Z\-\.\s\$\/%\+]/g,""); }
  function svg(text, opts={}){
    const narrow = opts.narrow || 2;
    const wide = opts.wide || 5;
    const height = opts.height || 44;
    const quiet = opts.quiet || 10;
    const val = "*"+norm(text)+"*";
    let x = quiet;
    let bars = [];
    for(let i=0;i<val.length;i++){
      const ch = val[i];
      const p = MAP[ch];
      if(!p) continue;
      for(let j=0;j<p.length;j++){
        const isBar = j%2===0;
        const w = (p[j]==="w")?wide:narrow;
        if(isBar) bars.push({x,w});
        x += w;
      }
      // inter-character gap (narrow space)
      x += narrow;
    }
    const width = x + quiet;
    const rects = bars.map(b=>`<rect x="${b.x}" y="0" width="${b.w}" height="${height}" />`).join("");
    const label = opts.label===false ? "" : `<text x="${width/2}" y="${height+14}" text-anchor="middle" font-size="12" fill="#111">${norm(text)}</text>`;
    const h = opts.label===false ? height : height+18;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${opts.width||"100%"}" height="${h}"><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g>${label}</svg>`;
  }
  window.Barcode39 = { svg };
})();
