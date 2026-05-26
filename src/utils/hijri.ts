// Hijri date utilities using Intl API (Umm al-Qura calendar)

export const getHijriDate = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

export const getHijriDateShort = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const getHijriDay = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(date);
};

export const getFullHijriDate = (date: Date = new Date()): string => {
  const day = getHijriDay(date);
  const hijri = getHijriDate(date);
  return `${day} ${hijri}`;
};

export const getHijriYear = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    year: "numeric",
  }).format(date);
};
