/*
  Code39 barcode helper (classic script)
  - Provides window.code39Canvas(canvasEl, text, opts)
  - Provides window.Barcode39.svg(text, opts) for optional SVG usage

  Notes:
  - Optimized for Saudi National ID (digits). Code39 supports digits well.
  - Works both in the app and inside print popups (embedded as text).
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

  function norm(s){
    return String(s||"")
      .toUpperCase()
      .replace(/[^0-9A-Z\-\.\s\$\/%\+]/g, "");
  }

  function buildBars(text, opts={}){
    const narrow = opts.narrow || 2;
    const wide = opts.wide || 5;
    const quiet = opts.quiet || 10;

    const val = "*" + norm(text) + "*";
    let x = quiet;
    const bars = [];

    for(let i=0;i<val.length;i++){
      const ch = val[i];
      const p = MAP[ch];
      if(!p) continue;
      for(let j=0;j<p.length;j++){
        const isBar = j % 2 === 0;
        const w = (p[j] === 'w') ? wide : narrow;
        if(isBar) bars.push({ x, w });
        x += w;
      }
      // inter-character gap (narrow space)
      x += narrow;
    }
    const width = x + quiet;
    return { bars, width, quiet, narrow, wide };
  }

  function svg(text, opts={}){
    const height = opts.height || 44;
    const label = opts.label === false ? null : norm(text);
    const { bars, width } = buildBars(text, opts);
    const rects = bars.map(b => `<rect x="${b.x}" y="0" width="${b.w}" height="${height}" />`).join("");
    const labelEl = label ? `<text x="${width/2}" y="${height+14}" text-anchor="middle" font-size="12" fill="#111">${label}</text>` : "";
    const h = label ? height + 18 : height;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}" width="${opts.width||'100%'}" height="${h}"><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g>${labelEl}</svg>`;
  }

  function code39Canvas(canvas, text, opts={}){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const W = canvas.width || 520;
    const H = canvas.height || 80;

    const barH = Math.max(40, Math.floor(H * 0.65));
    const labelY = barH + 16;

    const o = {
      narrow: opts.narrow || 2,
      wide: opts.wide || 5,
      quiet: opts.quiet || 10,
      // When the canvas is very narrow, auto-scale down.
      autoScale: opts.autoScale !== false
    };

    // Build bars at base scale
    let { bars, width } = buildBars(text, o);

    // Auto scale to fit canvas
    let scale = 1;
    if(o.autoScale && width > W){
      scale = W / width;
    }

    ctx.save();
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,W,H);

    // bars
    ctx.fillStyle = '#000';
    for(const b of bars){
      const x = Math.round(b.x * scale);
      const w = Math.max(1, Math.round(b.w * scale));
      ctx.fillRect(x, 0, w, barH);
    }

    // label
    const label = norm(text);
    if(label){
      ctx.fillStyle = '#111';
      ctx.font = '12px Tajawal, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, W/2, Math.min(H-8, labelY));
    }

    ctx.restore();
  }

  // expose
  window.Barcode39 = window.Barcode39 || {};
  window.Barcode39.svg = svg;
  window.code39Canvas = code39Canvas;
})();
