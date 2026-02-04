
// Simple offline 1D barcode generator (Code39) for digits/letters.
// Works great for scanning "رقم الهوية" باستخدام قارئ باركود 1D.
// NOTE: Code39 requires start/stop '*' which we add internally.

const CODE39 = {
  "0":"nnnwwnwnn",
  "1":"wnnwnnnnw",
  "2":"nnwwnnnnw",
  "3":"wnwwnnnnn",
  "4":"nnnwwnnnw",
  "5":"wnnwwnnnn",
  "6":"nnwwwnnnn",
  "7":"nnnwnnwnw",
  "8":"wnnwnnwnn",
  "9":"nnwwnnwnn",
  "A":"wnnnnwnnw",
  "B":"nnwnnwnnw",
  "C":"wnwnnwnnn",
  "D":"nnnnwwnnw",
  "E":"wnnnwwnnn",
  "F":"nnwnwwnnn",
  "G":"nnnnnwwnw",
  "H":"wnnnnwwnn",
  "I":"nnwnnwwnn",
  "J":"nnnnwwwnn",
  "K":"wnnnnnnww",
  "L":"nnwnnnnww",
  "M":"wnwnnnnwn",
  "N":"nnnnwnnww",
  "O":"wnnnwnnwn",
  "P":"nnwnwnnwn",
  "Q":"nnnnnnwww",
  "R":"wnnnnnwwn",
  "S":"nnwnnnwwn",
  "T":"nnnnwnwwn",
  "U":"wwnnnnnnw",
  "V":"nwwnnnnnw",
  "W":"wwwnnnnnn",
  "X":"nwnnwnnnw",
  "Y":"wwnnwnnnn",
  "Z":"nwwnwnnnn",
  "-":"nwnnnnwnw",
  ".":"wwnnnnwnn",
  " ":"nwwnnnwnn",
  "$":"nwnwnwnnn",
  "/":"nwnwnnnwn",
  "+":"nwnnnwnwn",
  "%":"nnnwnwnwn",
  "*":"nwnnwnwnn" // start/stop
};

function isAllowedChar(ch){
  return !!CODE39[ch];
}

export function code39Svg(text, {height=46, showText=true}={}){
  const raw = String(text || "").trim().toUpperCase();
  // for national id we accept digits; if user passes other, we filter.
  const cleaned = raw.split("").filter(isAllowedChar).join("");
  const payload = `*${cleaned}*`;
  const narrow = 2;
  const wide = 5;
  const gap = 2;

  // Each pattern is 9 elements: bar/space alternating, starting with bar
  let x = 8; // quiet zone
  const bars = [];

  for(const ch of payload){
    const p = CODE39[ch];
    for(let i=0;i<9;i++){
      const isBar = i % 2 === 0;
      const w = (p[i] === "w") ? wide : narrow;
      if(isBar){
        bars.push({x, w});
      }
      x += w;
    }
    x += gap; // inter-character gap
  }
  const width = x + 8;

  const textH = showText ? 16 : 0;
  const svgH = height + textH + 8;

  let rects = "";
  for(const b of bars){
    rects += `<rect x="${b.x}" y="8" width="${b.w}" height="${height}" />`;
  }
  const human = showText ? `<text x="${width/2}" y="${height+8+16}" text-anchor="middle" font-size="14" font-family="system-ui,Arial" fill="#111">${escapeXml(cleaned)}</text>` : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${svgH}" viewBox="0 0 ${width} ${svgH}">
  <rect x="0" y="0" width="${width}" height="${svgH}" fill="#fff"/>
  <g fill="#000">
    ${rects}
  </g>
  ${human}
</svg>`.trim();
}

function escapeXml(s){
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&apos;");
}
