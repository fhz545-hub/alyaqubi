import { StudentAction, ActionType } from "@/types/school";
import { supabase } from "@/integrations/supabase/client";
import { addToPendingQueue, cacheData, getCachedData, getPendingActions, getPendingActionsByUser } from "@/utils/offlineQueue";
import { isDistanceLearning, shouldCountForDate } from "@/utils/distanceLearning";

// In-memory cache
let actionsCache: StudentAction[] = [];
let loaded = false;
let loading = false;
let loadPromise: Promise<StudentAction[]> | null = null;
let cachedUserId: string | null = null;
let cacheVersion = 0;
let pendingForceRefresh = false;

// Subscribe to cache version changes for reactive UI updates
type CacheListener = (version: number) => void;
let cacheListeners: CacheListener[] = [];
export const onCacheUpdate = (fn: CacheListener) => {
  cacheListeners.push(fn);
  return () => { cacheListeners = cacheListeners.filter(l => l !== fn); };
};
const bumpCacheVersion = () => {
  cacheVersion++;
  cacheListeners.forEach(fn => fn(cacheVersion));
};
export const getCacheVersion = () => cacheVersion;

const getSessionUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
};

const getCachedUserId = async (): Promise<string | null> => {
  if (cachedUserId) return cachedUserId;
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) {
    cachedUserId = sessionUserId;
    return sessionUserId;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    cachedUserId = user?.id || null;
    return cachedUserId;
  } catch { return null; }
};

const getFreshUserId = async (): Promise<string | null> => {
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) {
    cachedUserId = sessionUserId;
    return sessionUserId;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      cachedUserId = user.id;
      return user.id;
    }
  } catch {
    // fallback below
  }
  return getCachedUserId();
};

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id || null;
});

const mapRow = (row: any): StudentAction => ({
  id: row.id,
  studentId: row.student_id,
  studentName: row.student_name,
  studentNumber: row.student_number,
  grade: row.grade,
  section: row.section,
  type: row.type as ActionType,
  date: row.date,
  time: row.time,
  description: row.details || "",
  guardianPhone: "",
  messageSent: false,
  performedById: row.performed_by || undefined,
  performedByName: row.performed_by_name || "",
  performedByRole: row.performed_by_role || "",
  period: row.period || undefined,
  subjectName: row.subject_name || undefined,
  violationCategory: row.details || undefined,
});

const buildActionFingerprint = (action: StudentAction) =>
  `${action.studentNumber}::${action.type}::${action.date}::${action.time}::${action.description}`;

const mergeServerAndPendingActions = async (serverActions: StudentAction[]): Promise<StudentAction[]> => {
  const currentUserId = await getFreshUserId();
  const pending = currentUserId
    ? await getPendingActionsByUser(currentUserId)
    : await getPendingActions();
  if (pending.length === 0) return serverActions;

  const pendingDeletes = new Set(
    pending
      .filter((item) => item.type === "delete" && item.table === "student_actions")
      .map((item) => String(item.payload?.id || ""))
      .filter(Boolean)
  );

  const filteredServerActions = serverActions.filter((action) => !pendingDeletes.has(action.id));
  const knownFingerprints = new Set(filteredServerActions.map(buildActionFingerprint));

  const pendingInserts = pending
    .filter((item) => item.type === "insert" && item.table === "student_actions" && item.payload)
    .map((item) =>
      mapRow({
        ...item.payload,
        id: `pending-${item.id}`,
        created_at: new Date(item.createdAt).toISOString(),
      })
    )
    .filter((action) => {
      const fingerprint = buildActionFingerprint(action);
      if (knownFingerprints.has(fingerprint)) return false;
      knownFingerprints.add(fingerprint);
      return true;
    });

  if (pendingInserts.length === 0) return filteredServerActions;

  return [...pendingInserts, ...filteredServerActions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
  );
};

export const loadActions = async (forceRefresh = false) => {
  if (loaded && !forceRefresh) return actionsCache;
  
  // If already loading and force refresh requested, queue another refresh after current one
  if (loading && loadPromise) {
    if (forceRefresh) {
      pendingForceRefresh = true;
    }
    return loadPromise;
  }

  loading = true;
  loadPromise = (async () => {
    try {
      if (!navigator.onLine) {
        const cached = await getCachedData<StudentAction[]>("actions");
        actionsCache = await mergeServerAndPendingActions(cached || actionsCache);
        loaded = actionsCache.length > 0;
        bumpCacheVersion();
        return actionsCache;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Fetch all actions for accurate counting
      const { data, error } = await supabase
        .from("student_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10000)
        .abortSignal(controller.signal);

      clearTimeout(timeout);

      if (error) {
        console.error("Failed to load actions:", error);
        // On error, keep existing cache - never replace with less data
        if (actionsCache.length === 0) {
          const cached = await getCachedData<StudentAction[]>("actions");
          if (cached && cached.length > 0) actionsCache = cached;
        }
        loaded = actionsCache.length > 0;
        return actionsCache;
      }

      const serverActions = (data || []).map(mapRow);
      actionsCache = await mergeServerAndPendingActions(serverActions);
      loaded = true;
      bumpCacheVersion();
      cacheData("actions", actionsCache);
      return actionsCache;
    } catch (error: any) {
      console.error("Unexpected loadActions error:", error);
      // On error, keep existing cache intact
      if (actionsCache.length === 0) {
        const cached = await getCachedData<StudentAction[]>("actions");
        if (cached && cached.length > 0) actionsCache = cached;
      }
      actionsCache = await mergeServerAndPendingActions(actionsCache);
      loaded = actionsCache.length > 0;
      return actionsCache;
    } finally {
      loading = false;
      loadPromise = null;
      // If a force refresh was requested while we were loading, do it now
      if (pendingForceRefresh) {
        pendingForceRefresh = false;
        loadActions(true);
      }
    }
  })();

  return loadPromise;
};

export const addAction = async (
  action: Omit<StudentAction, "id">,
  performerName?: string,
  performerRole?: string
): Promise<StudentAction> => {
  const localId = crypto.randomUUID();
  const performerId = await getFreshUserId();
  const optimisticAction: StudentAction = {
    ...action,
    id: localId,
    performedById: performerId || undefined,
    performedByName: performerName || action.performedByName || "",
    performedByRole: performerRole || action.performedByRole || "",
    messageSent: false,
  };

  actionsCache = [optimisticAction, ...actionsCache];
  loaded = true;
  bumpCacheVersion();

  const row: any = {
    student_id: action.studentId,
    student_name: action.studentName,
    student_number: action.studentNumber,
    grade: action.grade,
    grade_code: action.grade || "",
    section: action.section,
    type: action.type,
    details: action.description,
    date: action.date,
    time: action.time,
    performed_by: performerId,
    performed_by_name: performerName || "",
    performed_by_role: performerRole || "",
  };

  // Add classroom fields if present
  if (action.period) row.period = action.period;
  if (action.subjectName) row.subject_name = action.subjectName;

  _syncToDatabase(row, localId);

  return optimisticAction;
};

export const addActionsBatch = async (
  actions: Omit<StudentAction, "id">[],
  performerName?: string,
  performerRole?: string
): Promise<number> => {
  if (actions.length === 0) return 0;

  const performerId = await getFreshUserId();
  const localIds = actions.map(() => crypto.randomUUID());
  const optimisticActions: StudentAction[] = actions.map((action, idx) => ({
    ...action,
    id: localIds[idx],
    performedById: performerId || undefined,
    performedByName: performerName || action.performedByName || "",
    performedByRole: performerRole || action.performedByRole || "",
    messageSent: false,
  }));

  actionsCache = [...optimisticActions, ...actionsCache];
  loaded = true;
  bumpCacheVersion();

  const rows = actions.map((action) => ({
    student_id: action.studentId,
    student_name: action.studentName,
    student_number: action.studentNumber,
    grade: action.grade,
    grade_code: action.grade || "",
    section: action.section,
    type: action.type,
    details: action.description,
    date: action.date,
    time: action.time,
    performed_by: performerId,
    performed_by_name: performerName || "",
    performed_by_role: performerRole || "",
    ...(action.period ? { period: action.period } : {}),
    ...(action.subjectName ? { subject_name: action.subjectName } : {}),
  }));

  try {
    if (!navigator.onLine) {
      await Promise.all(rows.map((row) =>
        addToPendingQueue({
          type: "insert",
          table: "student_actions",
          payload: { ...row, __queued_by_user_id: row.performed_by || null },
        })
      ));
      cacheData("actions", actionsCache);
      return actions.length;
    }

    const { data, error } = await supabase.from("student_actions").insert(rows).select("*");
    if (error || !data) {
      console.error("Batch sync failed, queuing:", error);
      await Promise.all(rows.map((row) =>
        addToPendingQueue({
          type: "insert",
          table: "student_actions",
          payload: { ...row, __queued_by_user_id: row.performed_by || null },
        })
      ));
      cacheData("actions", actionsCache);
      return actions.length;
    }

    const insertedActions = data.map(mapRow);
    const localIdSet = new Set<string>(localIds);
    actionsCache = [...insertedActions, ...actionsCache.filter((a) => !localIdSet.has(a.id as string))].sort(
      (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
    );
    cacheData("actions", actionsCache);
    return insertedActions.length;
  } catch (e) {
    console.error("Batch sync error, queuing:", e);
    await Promise.all(rows.map((row) =>
      addToPendingQueue({
        type: "insert",
        table: "student_actions",
        payload: { ...row, __queued_by_user_id: row.performed_by || null },
      })
    ));
    cacheData("actions", actionsCache);
    return actions.length;
  }
};

const _syncToDatabase = async (row: any, localId: string) => {
  try {
    if (!navigator.onLine) {
      await addToPendingQueue({
        type: "insert",
        table: "student_actions",
        payload: { ...row, __queued_by_user_id: row.performed_by || null },
      });
      cacheData("actions", actionsCache);
      return;
    }

    if (!row.performed_by) {
      row.performed_by = await getFreshUserId();
    }

    const { data, error } = await supabase.from("student_actions").insert(row).select().single();

    if (error || !data) {
      console.error("Background sync failed, queuing:", error);
      await addToPendingQueue({
        type: "insert",
        table: "student_actions",
        payload: { ...row, __queued_by_user_id: row.performed_by || null },
      });
    } else {
      const realAction = mapRow(data);
      actionsCache = actionsCache.map(a => a.id === localId ? realAction : a);
    }
    cacheData("actions", actionsCache);
  } catch (e) {
    console.error("Background sync error, queuing:", e);
    await addToPendingQueue({
      type: "insert",
      table: "student_actions",
      payload: { ...row, __queued_by_user_id: row.performed_by || null },
    });
    cacheData("actions", actionsCache);
  }
};

export const deleteAction = async (id: string): Promise<boolean> => {
  if (!navigator.onLine) {
    await addToPendingQueue({ type: "delete", table: "student_actions", payload: { id } });
    actionsCache = actionsCache.filter((a) => a.id !== id);
    cacheData("actions", actionsCache);
    bumpCacheVersion();
    return true;
  }

  try {
    const { error } = await supabase.from("student_actions").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete action:", error);
      return false;
    }
    actionsCache = actionsCache.filter((a) => a.id !== id);
    cacheData("actions", actionsCache);
    bumpCacheVersion();
    return true;
  } catch (error) {
    console.error("Unexpected deleteAction error:", error);
    return false;
  }
};

export const getActions = (): StudentAction[] => actionsCache;

export const getActionsByStudent = (studentId: string): StudentAction[] =>
  actionsCache.filter((a) => a.studentId === studentId);

export const getActionsByType = (type: ActionType): StudentAction[] =>
  actionsCache.filter((a) => a.type === type);

export const getActionsByDate = (date: string): StudentAction[] =>
  actionsCache.filter((a) => a.date === date);

export const getActionsByDateRange = (from: string, to: string): StudentAction[] =>
  actionsCache.filter((a) => a.date >= from && a.date <= to);

export const getTodayActions = (): StudentAction[] => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return getActionsByDate(today);
};

export const getActionsByDateSummary = (date: string) => {
  const actions = getActionsByDate(date);
  const classroomTypes = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];
  // استبعاد طلاب التعليم الإلكتروني (انتساب) من إحصاءات اليوم الدراسي
  // باستثناء فترة الاختبارات النهائية حيث يُحتسبون
  const regular = actions.filter((a) => shouldCountForDate(a.grade, a.section, a.date));
  return {
    late: regular.filter((a) => a.type === "late").length,
    absent: regular.filter((a) => a.type === "absent").length,
    violation: regular.filter((a) => a.type === "violation").length,
    permission: regular.filter((a) => a.type === "permission").length,
    entry: regular.filter((a) => a.type === "entry").length,
    exit: regular.filter((a) => a.type === "exit").length,
    summon: regular.filter((a) => a.type === "summon").length,
    classroomNotes: regular.filter((a) => classroomTypes.includes(a.type)).length,
  };
};

export const getTodaySummary = () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return getActionsByDateSummary(today);
};

export const getFrequentStudents = (type: ActionType | ActionType[], minCount: number = 3) => {
  const types = Array.isArray(type) ? type : [type];
  const counts: Record<string, { name: string; grade: string; section: number; count: number }> = {};
  actionsCache
    .filter((a) => types.includes(a.type) && !isDistanceLearning(a.grade, a.section))
    .forEach((a) => {
    if (!counts[a.studentId]) {
      counts[a.studentId] = { name: a.studentName, grade: a.grade, section: a.section, count: 0 };
    }
    counts[a.studentId].count++;
  });

  return Object.entries(counts)
    .filter(([_, v]) => v.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, data]) => ({ studentId: id, ...data }));
};

// Direct DB query for accurate frequent students - bypasses cache limitations
export const getFrequentStudentsFromDB = async (
  types: string[],
  minCount: number = 3
): Promise<{ studentId: string; name: string; grade: string; section: number; count: number }[]> => {
  try {
    const pageSize = 1000;
    const rows: Array<{ student_id: string; student_name: string; grade: string; section: number }> = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("student_actions")
        .select("student_id, student_name, grade, section")
        .in("type", types)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("getFrequentStudentsFromDB error:", error);
        return getFrequentStudents(types as ActionType[], minCount);
      }

      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
    }

    const counts: Record<string, { name: string; grade: string; section: number; count: number }> = {};
    for (const row of rows) {
      if (isDistanceLearning(row.grade, row.section)) continue;
      const key = row.student_id;
      if (!counts[key]) {
        counts[key] = { name: row.student_name, grade: row.grade, section: row.section, count: 0 };
      }
      counts[key].count++;
    }

    return Object.entries(counts)
      .filter(([_, v]) => v.count >= minCount)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, data]) => ({ studentId: id, ...data }));
  } catch (e) {
    console.error("getFrequentStudentsFromDB exception:", e);
    return getFrequentStudents(types as ActionType[], minCount);
  }
};

export const updateActionDetails = async (actionId: string, newDetails: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("student_actions")
      .update({ details: newDetails })
      .eq("id", actionId);

    if (error) {
      console.error("Failed to update action:", error);
      return false;
    }

    // Update local cache
    actionsCache = actionsCache.map(a =>
      a.id === actionId ? { ...a, description: newDetails, violationCategory: newDetails } : a
    );
    cacheData("actions", actionsCache);
    bumpCacheVersion();
    return true;
  } catch (e) {
    console.error("updateActionDetails error:", e);
    return false;
  }
};

/**
 * تحويل نوع/تفاصيل إجراء قائم (تستخدم لتصحيح المواظبة في نفس اليوم:
 * تحويل غياب إلى تأخر أو العكس). يحفظ في قاعدة البيانات مباشرة وينعكس
 * في كل المصادر (ملف الطالب، الأرشيف، التقارير) لأن المصدر واحد.
 */
export const updateActionTypeAndDetails = async (
  actionId: string,
  newType: ActionType,
  newDetails: string,
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("student_actions")
      .update({ type: newType, details: newDetails })
      .eq("id", actionId);
    if (error) {
      console.error("Failed to update action type:", error);
      return false;
    }
    actionsCache = actionsCache.map(a =>
      a.id === actionId
        ? { ...a, type: newType, description: newDetails, violationCategory: newDetails }
        : a
    );
    cacheData("actions", actionsCache);
    bumpCacheVersion();
    return true;
  } catch (e) {
    console.error("updateActionTypeAndDetails error:", e);
    return false;
  }
};

export const resetActionsCache = () => {
  actionsCache = [];
  loaded = false;
  loading = false;
  loadPromise = null;
  cachedUserId = null;
  pendingForceRefresh = false;
  bumpCacheVersion();
};
