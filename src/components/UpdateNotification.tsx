import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { registerSW } from "virtual:pwa-register";

const UPDATE_PARAM = "_app_update";

const isPreviewOrIframe = () => {
  const previewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");
  try {
    return previewHost || window.self !== window.top;
  } catch {
    return true;
  }
};

const normalizeAssetUrl = (value: string) => {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
};

const extractFingerprintFromHtml = (html: string): string | null => {
  const assets = new Set<string>();
  const pattern = /(?:src|href)=["']([^"']*\/assets\/[^"']+\.(?:js|css)[^"']*)["']/g;
  for (const match of html.matchAll(pattern)) assets.add(normalizeAssetUrl(match[1]));
  return assets.size ? [...assets].sort().join("|") : null;
};

const getLoadedAppFingerprint = (): string | null => {
  const assets = new Set<string>();
  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src*='/assets/'],link[href*='/assets/']")
    .forEach((el) => {
      const value = el instanceof HTMLScriptElement ? el.src : el.href;
      if (/\.(js|css)(\?|$)/.test(value)) assets.add(normalizeAssetUrl(value));
    });

  performance.getEntriesByType("resource").forEach((entry) => {
    if (entry.name.includes("/assets/") && /\.(js|css)(\?|$)/.test(entry.name)) {
      assets.add(normalizeAssetUrl(entry.name));
    }
  });

  return assets.size ? [...assets].sort().join("|") : null;
};

const fetchLatestAppFingerprint = async (): Promise<string | null> => {
  try {
    const res = await fetch(`/index.html?${UPDATE_PARAM}=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    return extractFingerprintFromHtml(await res.text());
  } catch {
    return null;
  }
};

const isUserEditing = () => {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  return Boolean(active.closest("input, textarea, select, [contenteditable='true']"));
};

const waitForWorker = (worker: ServiceWorker) => new Promise<void>((resolve) => {
  if (["installed", "activated", "redundant"].includes(worker.state)) return resolve();
  const done = () => {
    if (["installed", "activated", "redundant"].includes(worker.state)) {
      worker.removeEventListener("statechange", done);
      resolve();
    }
  };
  worker.addEventListener("statechange", done);
  window.setTimeout(() => {
    worker.removeEventListener("statechange", done);
    resolve();
  }, 4000);
});

const UpdateNotification = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [applying, setApplying] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const loadedFingerprintRef = useRef<string | null>(null);
  const latestFingerprintRef = useRef<string | null>(null);
  const justUpdatedRef = useRef(false);
  const updatingRef = useRef(false);
  const reloadingRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  const reloadFromNetwork = () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set(UPDATE_PARAM, Date.now().toString());
    window.location.replace(url.toString());
  };

  const activateWaitingWorker = async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = registrationRef.current || await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    registrationRef.current = reg;
    try { await reg.update(); } catch { /* ignore */ }
    if (reg.installing) await waitForWorker(reg.installing);
    const waiting = reg.waiting;
    if (!waiting) return false;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  };

  const applyLatestVersion = async () => {
    if (updatingRef.current || justUpdatedRef.current) return true;
    updatingRef.current = true;
    setApplying(true);
    setShowUpdate(true);

    const activated = await activateWaitingWorker();
    if (!activated && updateServiceWorkerRef.current) {
      try { await updateServiceWorkerRef.current(true); } catch { /* fallback below */ }
    }

    window.setTimeout(reloadFromNetwork, 1200);
    return true;
  };

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(UPDATE_PARAM) || url.searchParams.has("_v")) {
        justUpdatedRef.current = true;
        url.searchParams.delete(UPDATE_PARAM);
        url.searchParams.delete("_v");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        window.setTimeout(() => { justUpdatedRef.current = false; }, 30_000);
      }
    } catch { /* ignore */ }

    if (isPreviewOrIframe() || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let intervalId: number | undefined;
    loadedFingerprintRef.current = getLoadedAppFingerprint();

    const handleUpdateAvailable = async () => {
      if (cancelled || justUpdatedRef.current || updatingRef.current) return true;
      const safeAutoRefresh =
        Date.now() - mountedAtRef.current < 15_000 ||
        document.visibilityState === "hidden" ||
        !isUserEditing();

      if (safeAutoRefresh) return applyLatestVersion();
      setShowUpdate(true);
      return true;
    };

    const checkVersion = async (force = false): Promise<boolean> => {
      const latest = await fetchLatestAppFingerprint();
      if (cancelled) return false;
      const loaded = loadedFingerprintRef.current || getLoadedAppFingerprint();
      loadedFingerprintRef.current = loaded;
      latestFingerprintRef.current = latest;

      if (loaded && latest && loaded !== latest) return handleUpdateAvailable();
      if (force && await activateWaitingWorker()) return applyLatestVersion();
      return false;
    };

    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => { void handleUpdateAvailable(); },
      onRegisteredSW: (_swUrl, reg) => {
        registrationRef.current = reg || null;
        reg?.update().catch(() => { /* ignore */ });
      },
      onRegisterError: (error) => console.warn("Service worker update failed:", error),
    });

    const onControllerChange = () => reloadFromNetwork();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void checkVersion();
    intervalId = window.setInterval(() => { void checkVersion(); }, 60_000);
    const onFocus = () => { void checkVersion(); };
    const onOnline = () => { void checkVersion(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    (window as any).__checkForUpdates = checkVersion;

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      delete (window as any).__checkForUpdates;
    };
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-[60] animate-fade-in" dir="rtl">
      <div className="bg-primary text-primary-foreground rounded-2xl shadow-2xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-foreground/20 grid place-items-center shrink-0">
          <RefreshCw size={18} className={applying ? "animate-spin" : undefined} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold leading-tight">{applying ? "جارٍ تحديث النظام" : "تحديث جديد جاهز"}</h3>
          {!applying && (
            <button
              onClick={() => { void applyLatestVersion(); }}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-foreground text-primary text-xs font-bold hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={13} />
              تحديث الآن
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
