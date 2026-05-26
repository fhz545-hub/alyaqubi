// Sync manager - processes offline queue when back online
import { supabase } from "@/integrations/supabase/client";
import { getPendingActionsByUser, removePendingAction } from "./offlineQueue";

let syncing = false;
let listeners: ((status: SyncStatus) => void)[] = [];

export type SyncStatus = {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  lastSyncError?: string;
};

export const addSyncListener = (fn: (s: SyncStatus) => void) => {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
};

const notify = (status: SyncStatus) => {
  listeners.forEach(fn => fn(status));
};

const withRequestTimeout = async <T>(
  requestFactory: (signal: AbortSignal) => unknown,
  timeoutMs: number = 7000
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const request = requestFactory(controller.signal);
    return await Promise.resolve(request as T);
  } finally {
    clearTimeout(timeout);
  }
};

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

export const syncPendingActions = async (): Promise<{ synced: number; failed: number }> => {
  if (syncing || !navigator.onLine) return { synced: 0, failed: 0 };

  syncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const currentUserId = await resolveCurrentUserId();

    if (!currentUserId) {
      notify({ online: true, pendingCount: 0, syncing: false, lastSyncError: "missing_authenticated_user" });
      syncing = false;
      return { synced: 0, failed: 0 };
    }

    const pending = await getPendingActionsByUser(currentUserId);
    if (pending.length === 0) {
      syncing = false;
      return { synced: 0, failed: 0 };
    }

    notify({ online: true, pendingCount: pending.length, syncing: true });

    // Sort by creation time
    pending.sort((a, b) => a.createdAt - b.createdAt);

    for (const action of pending) {
      try {
        if (action.type === "insert" && action.table === "student_actions") {
          const payload = { ...action.payload };
          payload.performed_by = currentUserId;
          delete payload.__queued_by_user_id;

          const result = await withRequestTimeout<any>((signal) =>
            supabase.from("student_actions").insert(payload).abortSignal(signal)
          );
          const error = result?.error;

          if (error) {
            console.error("Sync insert error:", error);
            failed++;
            continue;
          }
        } else if (action.type === "delete" && action.table === "student_actions") {
          const result = await withRequestTimeout<any>((signal) =>
            supabase.from("student_actions").delete().eq("id", action.payload.id).abortSignal(signal)
          );
          const error = result?.error;

          if (error) {
            console.error("Sync delete error:", error);
            failed++;
            continue;
          }
        }
        await removePendingAction(action.id);
        synced++;
      } catch (e) {
        console.error("Sync action failed:", e);
        failed++;
      }
    }
    const remaining = (await getPendingActionsByUser(currentUserId)).length;
    notify({ online: true, pendingCount: remaining, syncing: false });
  } catch (e) {
    console.error("Sync process error:", e);
    notify({ online: navigator.onLine, pendingCount: -1, syncing: false, lastSyncError: String(e) });
  } finally {
    syncing = false;
  }

  return { synced, failed };
};

// Auto-sync setup
let setupDone = false;

export const setupAutoSync = () => {
  if (setupDone) return;
  setupDone = true;

  // Sync when coming back online
  window.addEventListener("online", () => {
    console.log("[Sync] Back online, syncing...");
    syncPendingActions();
  });

  // Sync on visibility change (wake from sleep)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      console.log("[Sync] App visible, syncing...");
      syncPendingActions();
    }
  });

  // Periodic sync every 2 seconds if online (responsive cycle)
  setInterval(() => {
    if (navigator.onLine) {
      syncPendingActions();
    }
  }, 2000);

  // Initial sync
  if (navigator.onLine) {
    setTimeout(syncPendingActions, 400);
  }
};
