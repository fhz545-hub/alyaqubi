import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { resetStudentsCache, loadStudents } from "@/store/studentsStore";
import { resetActionsCache, loadActions } from "@/store/actionsStore";
import { loadPermissions, subscribePermissions, getPermissionsVersion } from "@/store/permissionsStore";

// Registration guard - prevents auth state changes during signup flow
let isRegistering = false;
let registrationLockUntil = 0;
const isRegistrationLocked = () => isRegistering || Date.now() < registrationLockUntil;

const SELF_REGISTER_ALLOWED_ROLES = new Set([
  "معلم",
  "وكيل شؤون الطلاب",
  "وكيل شؤون المعلمين",
  "متابع",
  "إداري",
  "محضر مختبر",
  "موجه صحي",
  "رائد نشاط",
  "مشرف",
]);


export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  role_title: string;
  national_id: string;
  phone: string;
  approved: boolean;
  is_principal: boolean;
  approved_by: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  permissionsVersion: number;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, profileData: Omit<UserProfile, "id" | "user_id" | "approved" | "is_principal" | "approved_by">) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      loading: true,
      permissionsVersion: 0,
      signIn: async () => ({ error: "Context not available" }),
      signUp: async () => ({ error: "Context not available" }),
      signOut: async () => {},
      refreshProfile: async () => {},
    } as AuthContextType;
  }
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsVersion, setPermissionsVersion] = useState(0);
  const authBootstrappedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const profileLoadTokenRef = useRef(0);

  // Re-render consumers whenever the permissions cache changes (grant/revoke/reload)
  useEffect(() => {
    return subscribePermissions(() => setPermissionsVersion(getPermissionsVersion()));
  }, []);

  // Realtime: refresh permissions cache when the principal grants/revokes the
  // CURRENT user's permissions, so the effect is immediate without re-login.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user-perms-watch-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_permissions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadPermissions().catch((err) => console.warn("perm reload failed", err));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("Profile fetch error:", error);
        setProfile(null);
        return null;
      }
      if (data) {
        const p = data as unknown as UserProfile;
        setProfile(p);
        return p;
      }
      setProfile(null);
      return null;
    } catch (err) {
      console.error("Unexpected profile error:", err);
      setProfile(null);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const hydrateInitialData = () => {
    // Fire and forget - don't block auth loading
    Promise.all([loadStudents(true), loadActions(true), loadPermissions()]).catch(err => {
      console.warn("Initial data hydration failed:", err);
    });
  };

  useEffect(() => {
    let isMounted = true;

    // Hard safety timeout - never stay loading forever
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        console.warn("Auth safety timeout reached - forcing loading=false");
        setLoading(false);
      }
    }, 8000);

    const applyAuthUser = (nextUser: User | null) => {
      const nextUserId = nextUser?.id ?? null;
      if (lastUserIdRef.current === nextUserId) return;
      lastUserIdRef.current = nextUserId;

      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        resetStudentsCache();
        resetActionsCache();
      }
      // Don't set loading=true again if already loading
    };

    // Set up listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted || isRegistrationLocked()) return;
      applyAuthUser(session?.user ?? null);
    });

    // Then restore session from storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      authBootstrappedRef.current = true;
      const sessionUser = session?.user ?? null;
      // Force apply even if same user (initial load)
      lastUserIdRef.current = null;
      applyAuthUser(sessionUser);
    }).catch((error) => {
      console.error("Session init error:", error);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const token = ++profileLoadTokenRef.current;

    // Profile load timeout
    const profileTimer = setTimeout(() => {
      if (!cancelled && profileLoadTokenRef.current === token) {
        console.warn("Profile load timeout - forcing loading=false");
        setLoading(false);
      }
    }, 6000);

    const loadProfileWithRetry = async () => {
      const maxAttempts = 3;
      let fetched: UserProfile | null = null;

      for (let i = 0; i < maxAttempts; i++) {
        fetched = await fetchProfile(user.id);
        if (fetched) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (cancelled || profileLoadTokenRef.current !== token) return;

      if (fetched) {
        // Kick off all hydration in parallel (students, actions, permissions)
        // without blocking the loading screen. Route guards already defer the
        // "restricted teacher" decision until arePermissionsLoaded() is true,
        // so it is safe to release the UI immediately for fast navigation.
        hydrateInitialData();
      }

      setLoading(false);
    };

    void loadProfileWithRetry().catch((err) => {
      if (cancelled) return;
      console.error("Profile hydration failed:", err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(profileTimer);
    };
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      
      // Explicitly apply the session user to avoid relying solely on onAuthStateChange
      if (data?.user) {
        lastUserIdRef.current = null; // Reset to force apply
        setUser(data.user);
        lastUserIdRef.current = data.user.id;
      }

      // 🔄 إعادة تحميل كاملة للموقع بعد تسجيل الدخول لضمان تحميل أحدث إصدار من الكود (PWA/Service Worker)
      try {
        setTimeout(() => {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("_v", String(Date.now()));
            window.location.replace(url.toString());
          } catch {
            window.location.reload();
          }
        }, 250);
      } catch {}

      return { error: null };
    } catch (err: any) {
      console.error("signIn error:", err);
      return { error: err?.message || "حدث خطأ غير متوقع" };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    profileData: Omit<UserProfile, "id" | "user_id" | "approved" | "is_principal" | "approved_by">
  ) => {
    // Set registration guard to prevent onAuthStateChange from reacting
    isRegistering = true;
    registrationLockUntil = Date.now() + 5000;
    try {
      const safeRoleTitle = SELF_REGISTER_ALLOWED_ROLES.has(profileData.role_title)
        ? profileData.role_title
        : "معلم";

      const { data, error } = await supabase.auth.signUp({ email, password });
      let authUserId: string | null = data?.user?.id ?? null;

      if (error) {
        const msg = (error.message || "").toLowerCase();
        const alreadyExists =
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("user already") ||
          (error as any)?.code === "user_already_exists";

        if (!alreadyExists) {
          return { error: error.message };
        }

        // Account exists in auth but registration may have failed before saving the profile.
        // Try to sign in with the provided password to recover and complete the profile.
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError || !signInData?.user) {
          return {
            error:
              "هذا البريد مسجل مسبقاً. إذا كنت تملك الحساب فاستخدم تسجيل الدخول، وإن نسيت كلمة المرور فاضغط (نسيت كلمة المرور). إذا كانت محاولة تسجيل سابقة لم تكتمل تواصل مع مدير المدرسة لحذف الحساب القديم.",
          };
        }
        authUserId = signInData.user.id;

        // If profile already exists, treat as duplicate registration.
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authUserId)
          .maybeSingle();
        if (existingProfile) {
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          return { error: "هذا الحساب مسجل مسبقاً. يرجى تسجيل الدخول مباشرة." };
        }
      }

      if (!authUserId) { return { error: "فشل إنشاء الحساب" }; }

      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: authUserId,
        full_name: profileData.full_name,
        role_title: safeRoleTitle,
        national_id: profileData.national_id,
        phone: profileData.phone,
        approved: false,
        is_principal: false,
      });

      if (profileError) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        return { error: "تعذر حفظ بيانات الحساب. يرجى اختيار صفة غير إدارية أو إكمال البيانات بعد تسجيل الدخول." };
      }
      
      // Sign out the auto-created session silently
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      
      return { error: null };
    } finally {
      // Keep auth events ignored briefly after signup/signout sequence settles
      isRegistering = false;
      registrationLockUntil = Date.now() + 5000;
    }
  };

  const signOut = async () => {
    try {
      resetStudentsCache();
      resetActionsCache();
      setUser(null);
      setProfile(null);
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([signOutPromise, timeoutPromise]);
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setUser(null);
      setProfile(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, permissionsVersion, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
