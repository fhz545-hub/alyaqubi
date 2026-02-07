/* Code39 barcode (digits/uppercase letters).
   Exposes:
   - window.generateBarcode(canvas, code)
   - window.Barcode39.svg(text, opts)
*/
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

  function encode(text, opts={}){
    const narrow = opts.narrow || 2;
    const wide = opts.wide || 5;
    const val = "*" + norm(text) + "*";
    const seq = [];
    for(let i=0;i<val.length;i++){ 
      const ch = val[i];
      const p = MAP[ch];
      if(!p) continue;
      for(let j=0;j<p.length;j++){ 
        const isBar = (j%2===0);
        const w = (p[j]==="w") ? wide : narrow;
        seq.push({isBar, w});
      }
      // inter-character gap (narrow space)
      seq.push({isBar:false, w:narrow});
    }
    return seq;
  }

  function drawToCanvas(canvas, text, opts={}){
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    if(!ctx) return;
    const padding = opts.padding ?? 10;
    const seq = encode(text, opts);
    const total = seq.reduce((a,s)=>a+s.w, 0) + padding*2;
    const W = canvas.width || 520;
    const H = canvas.height || 120;
    const scale = W / total;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "#000";
    let x = padding*scale;
    const barH = Math.round(H * 0.72);
    for(const s of seq){
      const sw = s.w * scale;
      if(s.isBar) ctx.fillRect(x, 0, sw, barH);
      x += sw;
    }
  }

  function svg(text, opts={}){
    const narrow = opts.narrow || 2;
    const wide = opts.wide || 5;
    const height = opts.height || 44;
    const quiet = opts.quiet || 10;
    const val = "*" + norm(text) + "*";
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
      x += narrow;
    }
    const width = x + quiet;
    const rects = bars.map(b=>`<rect x="${b.x}" y="0" width="${b.w}" height="${height}" />`).join("");
    const label = opts.label===false ? "" : `<text x="${width/2}" y="${height+14}" text-anchor="middle" font-size="12" fill="#111">${norm(text)}</text>`;
    const h = opts.label===false ? height : height+18;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${opts.width||"100%"}" height="${h}"><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g>${label}</svg>`;
  }

  window.generateBarcode = window.generateBarcode || function(canvas, code){ drawToCanvas(canvas, code, {}); };
  window.Barcode39 = window.Barcode39 || { svg };
})();
