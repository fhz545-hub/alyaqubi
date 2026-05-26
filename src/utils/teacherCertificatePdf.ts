import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { CertificateData, CertificateTemplate } from "./teacherCertificate";
import schoolSealUrl from "@/assets/school-official-seal.png";
import cairoFontUrl from "@/assets/Cairo.ttf?url";

const sanitize = (s: string) =>
  s.replace(/[\\/:*?"<>|\n\r\t]/g, " ").replace(/\s+/g, " ").trim();

const makeStoragePath = () => {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  return `certificates/${Date.now()}-${random}.pdf`;
};

const TEMPLATE_COLORS: Record<CertificateTemplate, {
  paper: string;
  paperSoft: string;
  ink: string;
  muted: string;
  gold: string;
  goldDeep: string;
  goldSoft: string;
  accent: string;
}> = {
  "royal-gold": {
    paper: "#fffdf5",
    paperSoft: "#fff5d4",
    ink: "#2b1f04",
    muted: "#6b5b32",
    gold: "#c9a227",
    goldDeep: "#8a6a13",
    goldSoft: "#e7c96b",
    accent: "#7a5a14",
  },
  "emerald-classic": {
    paper: "#fdfffd",
    paperSoft: "#e8f5ec",
    ink: "#0f2e1c",
    muted: "#4b6b58",
    gold: "#b08a2e",
    goldDeep: "#7a5e16",
    goldSoft: "#dec678",
    accent: "#155e3b",
  },
  "sapphire-modern": {
    paper: "#fbfcff",
    paperSoft: "#e7eefb",
    ink: "#0e1a3a",
    muted: "#4b5878",
    gold: "#b08a2e",
    goldDeep: "#7a5e16",
    goldSoft: "#dec678",
    accent: "#1d3a8a",
  },
  "burgundy-heritage": {
    paper: "#fffafa",
    paperSoft: "#fbeaea",
    ink: "#3a0e14",
    muted: "#77525a",
    gold: "#c9a227",
    goldDeep: "#8a6a13",
    goldSoft: "#e7c96b",
    accent: "#7d1424",
  },
};

let cairoFontBase64: string | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذّرت قراءة أصل الشهادة."));
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function ensureArabicFont(pdf: jsPDF) {
  if (!cairoFontBase64) {
    const response = await fetch(cairoFontUrl, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error("تعذّر تحميل خط الشهادة العربي.");
    cairoFontBase64 = arrayBufferToBase64(await response.arrayBuffer());
  }
  pdf.addFileToVFS("Cairo.ttf", cairoFontBase64);
  pdf.addFont("Cairo.ttf", "Cairo", "normal");
  pdf.addFont("Cairo.ttf", "Cairo", "bold");
  pdf.setFont("Cairo", "normal");
  pdf.setR2L(true);
}

async function assetUrlToDataUrl(src: string): Promise<string | null> {
  if (!src || src.startsWith("data:")) return src || null;
  try {
    const absolute = new URL(src, window.location.origin).href;
    const response = await fetch(absolute, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) throw new Error("asset fetch failed");
    return await blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function fill(pdf: jsPDF, color: string) {
  const [r, g, b] = hexToRgb(color);
  pdf.setFillColor(r, g, b);
}

function stroke(pdf: jsPDF, color: string) {
  const [r, g, b] = hexToRgb(color);
  pdf.setDrawColor(r, g, b);
}

function textColor(pdf: jsPDF, color: string) {
  const [r, g, b] = hexToRgb(color);
  pdf.setTextColor(r, g, b);
}

function drawText(pdf: jsPDF, text: string, x: number, y: number, opts: {
  size: number;
  color: string;
  style?: "normal" | "bold";
  align?: "center" | "right" | "left";
  maxWidth?: number;
  lineHeight?: number;
}) {
  pdf.setFont("Cairo", opts.style || "normal");
  pdf.setFontSize(opts.size);
  textColor(pdf, opts.color);
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return y;
  const lines = opts.maxWidth ? pdf.splitTextToSize(clean, opts.maxWidth) : [clean];
  pdf.text(lines, x, y, {
    align: opts.align || "center",
    lineHeightFactor: opts.lineHeight || 1.35,
    isInputRtl: true,
  } as any);
  return y + (Array.isArray(lines) ? lines.length : 1) * opts.size * 0.3528 * (opts.lineHeight || 1.35);
}

function drawCorner(pdf: jsPDF, x: number, y: number, sx: 1 | -1, sy: 1 | -1, gold: string, soft: string) {
  pdf.saveGraphicsState();
  stroke(pdf, gold);
  pdf.setLineWidth(0.45);
  const mapX = (v: number) => x + sx * v;
  const mapY = (v: number) => y + sy * v;
  pdf.line(mapX(0), mapY(14), mapX(0), mapY(0));
  pdf.line(mapX(0), mapY(0), mapX(14), mapY(0));
  stroke(pdf, soft);
  pdf.setLineWidth(0.3);
  pdf.line(mapX(3), mapY(17), mapX(3), mapY(3));
  pdf.line(mapX(3), mapY(3), mapX(17), mapY(3));
  stroke(pdf, gold);
  pdf.circle(mapX(10), mapY(10), 1.8, "S");
  pdf.circle(mapX(17), mapY(3), 0.7, "F");
  pdf.circle(mapX(3), mapY(17), 0.7, "F");
  pdf.restoreGraphicsState();
}

function drawCertificateShell(pdf: jsPDF, colors: typeof TEMPLATE_COLORS[CertificateTemplate]) {
  fill(pdf, colors.paperSoft);
  pdf.rect(0, 0, 297, 210, "F");
  fill(pdf, colors.paper);
  stroke(pdf, colors.gold);
  pdf.setLineWidth(0.75);
  pdf.roundedRect(6, 6, 285, 198, 4, 4, "FD");
  stroke(pdf, colors.goldSoft);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(10, 10, 277, 190, 3, 3, "S");
  stroke(pdf, colors.gold);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(14, 14, 269, 182, 2.5, 2.5, "S");
  drawCorner(pdf, 15, 15, 1, 1, colors.gold, colors.goldSoft);
  drawCorner(pdf, 282, 15, -1, 1, colors.gold, colors.goldSoft);
  drawCorner(pdf, 15, 195, 1, -1, colors.gold, colors.goldSoft);
  drawCorner(pdf, 282, 195, -1, -1, colors.gold, colors.goldSoft);

  fill(pdf, colors.accent);
  stroke(pdf, colors.goldSoft);
  pdf.setLineWidth(0.3);
  pdf.circle(38, 38, 9.5, "FD");
  pdf.circle(259, 38, 9.5, "FD");
  fill(pdf, colors.goldSoft);
  drawText(pdf, "★", 38, 41, { size: 13, color: "#ffffff", style: "bold" });
  drawText(pdf, "★", 259, 41, { size: 13, color: "#ffffff", style: "bold" });
}

function drawRibbon(pdf: jsPDF, colors: typeof TEMPLATE_COLORS[CertificateTemplate]) {
  fill(pdf, colors.goldDeep);
  pdf.triangle(89, 37, 103, 28, 103, 46, "F");
  pdf.triangle(208, 28, 208, 46, 222, 37, "F");
  fill(pdf, colors.gold);
  stroke(pdf, colors.goldDeep);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(98, 27, 101, 20, 1.5, 1.5, "FD");
  drawText(pdf, "شهادة شكر وتقدير", 148.5, 41, { size: 22, color: "#ffffff", style: "bold" });
}

async function renderCertificatePdf(data: CertificateData): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  await ensureArabicFont(pdf);
  const colors = TEMPLATE_COLORS[data.template || "royal-gold"];
  const reasonText = data.reason?.trim() ||
    "تقديراً لما قدّمه من جهودٍ مخلصةٍ، وعطاءٍ لا ينضب، وحرصٍ صادقٍ على بناء جيلٍ واعٍ متعلمٍ، فكنتم نِعم القدوة، ونعم المربي الفاضل.";

  drawCertificateShell(pdf, colors);
  drawText(pdf, data.schoolName, 148.5, 23, { size: 15, color: colors.accent, style: "bold" });
  drawText(pdf, "المملكة العربية السعودية — وزارة التعليم", 148.5, 30, { size: 9.5, color: colors.muted });
  stroke(pdf, colors.gold);
  pdf.setLineWidth(0.25);
  pdf.line(117, 33.5, 180, 33.5);
  drawRibbon(pdf, colors);
  drawText(pdf, "تكريماً للعطاء والتميّز", 148.5, 57, { size: 17, color: colors.accent, style: "bold" });

  drawText(pdf, "يطيب لإدارة المدرسة أن تتقدّم بأسمى آيات الشكر والتقدير", 148.5, 75, { size: 14, color: colors.ink });
  drawText(pdf, "إلى الأستاذ الفاضل", 148.5, 83, { size: 14, color: colors.ink });
  drawText(pdf, data.teacherName, 148.5, 103, { size: 28, color: colors.accent, style: "bold" });
  stroke(pdf, colors.gold);
  pdf.setLineWidth(0.45);
  pdf.line(102, 110, 195, 110);
  drawText(pdf, reasonText, 148.5, 124, { size: 13.5, color: colors.ink, maxWidth: 216, lineHeight: 1.65 });

  const dates = [data.hijriDate, data.gregDate].filter(Boolean).join("  •  ");
  drawText(pdf, dates, 148.5, 154, { size: 10.5, color: colors.muted, style: "bold" });

  const sealDataUrl = await assetUrlToDataUrl(schoolSealUrl as string);
  if (sealDataUrl) {
    pdf.addImage(sealDataUrl, "PNG", 127, 158, 43, 43, undefined, "FAST");
  } else {
    stroke(pdf, colors.gold);
    pdf.circle(148.5, 179.5, 19, "S");
  }

  drawText(pdf, "وكيل الشؤون التعليمية", 74, 169, { size: 10.5, color: colors.muted, style: "bold" });
  stroke(pdf, colors.gold);
  pdf.line(36, 178, 112, 178);
  drawText(pdf, data.viceName, 74, 185, { size: 12.5, color: colors.accent, style: "bold" });

  drawText(pdf, "مدير المدرسة", 223, 169, { size: 10.5, color: colors.muted, style: "bold" });
  stroke(pdf, colors.gold);
  pdf.line(185, 178, 261, 178);
  drawText(pdf, data.principalName, 223, 185, { size: 12.5, color: colors.accent, style: "bold" });

  return pdf;
}

/** Render the certificate as a high-quality A4-landscape PDF Blob without exporting any canvas. */
export async function renderCertificatePdfBlob(data: CertificateData): Promise<Blob> {
  const pdf = await renderCertificatePdf(data);
  return pdf.output("blob");
}

/** Trigger a browser download of the certificate PDF. */
export async function downloadCertificatePdf(data: CertificateData): Promise<void> {
  const pdf = await renderCertificatePdf(data);
  const safeName = sanitize(data.teacherName) || "teacher";
  pdf.save(`شهادة شكر وتقدير - ${safeName}.pdf`);
}

export interface UploadResult {
  publicUrl: string;
  path: string;
  filename: string;
}

/** Render → upload to Storage → return the public URL. */
export async function generateAndUploadCertificate(
  data: CertificateData,
): Promise<UploadResult> {
  const blob = await renderCertificatePdfBlob(data);
  const safeName = sanitize(data.teacherName) || "teacher";
  const filename = `شهادة شكر وتقدير - ${safeName}.pdf`;
  const path = makeStoragePath();

  const { error } = await supabase.storage
    .from("teacher-certificates")
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) throw new Error("تعذّر رفع الشهادة: " + error.message);

  // Bucket is private — issue a long-lived signed URL so the link
  // remains usable when sent via WhatsApp / SMS to teachers.
  const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
  const { data: signed, error: signErr } = await supabase.storage
    .from("teacher-certificates")
    .createSignedUrl(path, ONE_YEAR_SECONDS);
  if (signErr || !signed?.signedUrl) {
    throw new Error("تعذّر إنشاء رابط الشهادة: " + (signErr?.message || ""));
  }
  return { publicUrl: signed.signedUrl, path, filename };
}

/** Pedagogical message from the principal that accompanies the PDF link. */
export function buildAppreciationMessage(args: {
  teacherName: string;
  schoolName: string;
  principalName: string;
  certificateUrl: string;
}): string {
  return (
    `🌹 الأستاذ الفاضل: ${args.teacherName}\n\n` +
    `يطيب لإدارة *${args.schoolName}* أن تتقدّم لكم بـ\n` +
    `*شهادة شكر وتقدير* عرفاناً بعطائكم المتميز،\n` +
    `وتقديراً لجهودكم المخلصة في تربية النشء وبناء جيلٍ واعٍ.\n\n` +
    `جزاكم الله خيراً، وبارك في جهودكم، وجعلها في موازين حسناتكم.\n\n` +
    `📄 شهادتكم بصيغة PDF:\n${args.certificateUrl}\n\n` +
    `— مدير المدرسة\n${args.principalName}`
  );
}
