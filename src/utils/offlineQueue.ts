// IndexedDB-based offline queue for pending actions
const DB_NAME = "student-tracker-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_actions";
const CACHE_STORE = "cached_data";

export interface PendingAction {
  id: string;
  type: "insert" | "delete";
  table: string;
  payload: any;
  createdAt: number;
}

const getActionOwnerId = (action: PendingAction): string | null => {
  const payload = action?.payload;
  if (!payload || typeof payload !== "object") return null;

  const explicitOwner = payload.__queued_by_user_id;
  if (typeof explicitOwner === "string" && explicitOwner.trim()) return explicitOwner;

  const performedBy = payload.performed_by;
  if (typeof performedBy === "string" && performedBy.trim()) return performedBy;

  return null;
};

/** Wrap any promise with a timeout to prevent hanging */
const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
};

/** Safe openDB with 3s timeout */
const safeOpenDB = (): Promise<IDBDatabase | null> => {
  return withTimeout(openDB().catch(() => null), 3000, null);
};

export const addToPendingQueue = async (action: Omit<PendingAction, "id" | "createdAt">) => {
  try {
    const db = await safeOpenDB();
    if (!db) return null;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const item: PendingAction = {
      ...action,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    store.add(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return item.id;
  } catch (e) {
    console.error("Failed to queue offline action:", e);
    return null;
  }
};

export const getPendingActions = async (): Promise<PendingAction[]> => {
  try {
    const db = await safeOpenDB();
    if (!db) return [];
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return await withTimeout(
      new Promise<PendingAction[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      }),
      3000,
      []
    );
  } catch {
    return [];
  }
};

export const getPendingActionsByUser = async (userId: string): Promise<PendingAction[]> => {
  const actions = await getPendingActions();
  if (!userId) return actions;

  return actions.filter((action) => {
    const ownerId = getActionOwnerId(action);
    return !ownerId || ownerId === userId;
  });
};

export const removePendingAction = async (id: string) => {
  try {
    const db = await safeOpenDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Failed to remove pending action:", e);
  }
};

export const clearPendingQueue = async () => {
  try {
    const db = await safeOpenDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  } catch {}
};

// Cache data locally for offline reads
export const cacheData = async (key: string, data: any) => {
  try {
    const db = await safeOpenDB();
    if (!db) return;
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put({ key, data, updatedAt: Date.now() });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  } catch {}
};

export const getCachedData = async <T = any>(key: string): Promise<T | null> => {
  try {
    const db = await safeOpenDB();
    if (!db) return null;
    const tx = db.transaction(CACHE_STORE, "readonly");
    const request = tx.objectStore(CACHE_STORE).get(key);
    return await withTimeout(
      new Promise<T | null>((resolve) => {
        request.onsuccess = () => resolve(request.result?.data ?? null);
        request.onerror = () => resolve(null);
      }),
      3000,
      null
    );
  } catch {
    return null;
  }
};

export const getPendingCount = async (userId?: string | null): Promise<number> => {
  const actions = userId ? await getPendingActionsByUser(userId) : await getPendingActions();
  return actions.length;
};
