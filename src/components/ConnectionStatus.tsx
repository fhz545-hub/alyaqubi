import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Check } from "lucide-react";
import { syncPendingActions, setupAutoSync, addSyncListener, SyncStatus } from "@/utils/syncManager";
import { getPendingCount } from "@/utils/offlineQueue";
import { supabase } from "@/integrations/supabase/client";

const ConnectionStatus = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    setupAutoSync();

    const resolveCurrentUserId = async (): Promise<string | null> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) return session.user.id;
      } catch {
        // fallback below
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
      } catch {
        return null;
      }
    };

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsub = addSyncListener((status: SyncStatus) => {
      setOnline(status.online);
      setSyncing(status.syncing);
      if (status.pendingCount >= 0) setPendingCount(status.pendingCount);
      if (!status.syncing && status.pendingCount === 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    });

    // Check pending count periodically
    const checkPending = async () => {
      const userId = await resolveCurrentUserId();
      const count = await getPendingCount(userId);
      setPendingCount(count);
    };
    checkPending();
    const interval = setInterval(checkPending, 2000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsub();
      clearInterval(interval);
    };
  }, []);

  // Don't show anything when online with no pending
  if (online && pendingCount === 0 && !syncing && !justSynced) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 animate-fade-in" dir="rtl">
      {!online && (
        <div className="flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-full shadow-lg text-sm font-semibold backdrop-blur-sm">
          <WifiOff size={16} />
          <span>بدون اتصال — البيانات تُحفظ محلياً</span>
        </div>
      )}

      {online && syncing && (
        <div className="flex items-center gap-2 bg-warning/90 text-warning-foreground px-4 py-2 rounded-full shadow-lg text-sm font-semibold backdrop-blur-sm">
          <RefreshCw size={16} className="animate-spin" />
          <span>جارٍ مزامنة {pendingCount} عملية...</span>
        </div>
      )}

      {online && !syncing && pendingCount > 0 && (
        <button
          onClick={() => !syncing && syncPendingActions()}
          disabled={syncing}
          className="flex items-center gap-2 bg-primary/90 text-primary-foreground px-4 py-2 rounded-full shadow-lg text-sm font-semibold backdrop-blur-sm hover:bg-primary transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} />
          <span>{pendingCount} عملية معلّقة — مزامنة فورية</span>
        </button>
      )}

      {justSynced && (
        <div className="flex items-center gap-2 bg-success/90 text-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold backdrop-blur-sm">
          <Check size={16} />
          <span>تمت المزامنة بنجاح</span>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
