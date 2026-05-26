import { Suspense, lazy, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getUserPermissions, arePermissionsLoaded } from "@/store/permissionsStore";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import UpdateNotification from "./components/UpdateNotification";
import LoadingScreen from "./components/LoadingScreen";
import { loadDistanceLearningSections } from "@/utils/distanceLearningSections";
import { setDynamicDistanceSections } from "@/utils/distanceLearning";
import { loadRamadanDates } from "@/utils/ramadanShift";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const Index = lazy(() => import("./pages/Index"));
const StudentsPage = lazy(() => import("./pages/StudentsPage"));
const AttendancePage = lazy(() => import("./pages/AttendancePage"));
const ViolationsPage = lazy(() => import("./pages/ViolationsPage"));
const PrintPage = lazy(() => import("./pages/PrintPage"));
const DailyReportPage = lazy(() => import("./pages/DailyReportPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));
const ActionDetailsPage = lazy(() => import("./pages/ActionDetailsPage"));
const StudentProfilePage = lazy(() => import("./pages/StudentProfilePage"));
const TeacherClassroomPage = lazy(() => import("./pages/TeacherClassroomPage"));
const ReferralTrackingPage = lazy(() => import("./pages/ReferralTrackingPage"));
const AlertFollowUpPage = lazy(() => import("./pages/AlertFollowUpPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SmsPage = lazy(() => import("./pages/SmsPage"));
const EntryExitPermitPage = lazy(() => import("./pages/EntryExitPermitPage"));
const PositiveBehaviorPage = lazy(() => import("./pages/PositiveBehaviorPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const DistanceLearningSettingsPage = lazy(() => import("./pages/DistanceLearningSettingsPage"));
const TeacherAffairsPage = lazy(() => import("./pages/TeacherAffairsPage"));
const TeacherArchivePage = lazy(() => import("./pages/TeacherArchivePage"));
const TeacherAdminAffairsPage = lazy(() => import("./pages/TeacherAdminAffairsPage"));
const TeacherMonthlyAttendancePage = lazy(() => import("./pages/TeacherMonthlyAttendancePage"));
const EducationalAffairsPage = lazy(() => import("./pages/EducationalAffairsPage"));
const StudentAffairsHubPage = lazy(() => import("./pages/StudentAffairsHubPage"));
const LivePeriodsPage = lazy(() => import("./pages/LivePeriodsPage"));
const MyTeacherProfilePage = lazy(() => import("./pages/MyTeacherProfilePage"));
const UserGuidePage = lazy(() => import("./pages/UserGuidePage"));
const HealthAffairsHubPage = lazy(() => import("./pages/HealthAffairsHubPage"));
const HealthRecordsPage = lazy(() => import("./pages/HealthRecordsPage"));
const VitalSignsPage = lazy(() => import("./pages/VitalSignsPage"));
const SpecialCasesPage = lazy(() => import("./pages/health/SpecialCasesPage"));
const MedicalReferralsPage = lazy(() => import("./pages/health/MedicalReferralsPage"));
const MedicalAbsencesPage = lazy(() => import("./pages/health/MedicalAbsencesPage"));
const GuardianContactsPage = lazy(() => import("./pages/health/GuardianContactsPage"));
const AwarenessPage = lazy(() => import("./pages/health/AwarenessPage"));
const EnvironmentPage = lazy(() => import("./pages/health/EnvironmentPage"));
const EmergenciesPage = lazy(() => import("./pages/health/EmergenciesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: (failureCount, error: any) => {
        // Don't retry offline — let the sync manager handle persistence
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        // Don't retry auth/permission errors
        const code = error?.code || error?.status;
        if (code === 401 || code === 403) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
const INACTIVITY_TIMEOUT_MS = 25 * 60 * 1000; // 25 دقيقة ثم شاشة انتظار + تسجيل خروج
const INACTIVITY_GRACE_MS = 3000; // عرض شاشة الانتظار 3 ثوانٍ قبل الخروج

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [profileTimeout, setProfileTimeout] = useState(false);
  const [forceSignOut, setForceSignOut] = useState(false);

  const activeProfile = user && profile?.user_id === user.id ? profile : null;

  const renderClosingSession = () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3 text-xl">!</div>
        <p className="text-foreground text-sm font-semibold mb-2">تعذّر التحقق من حالة الحساب</p>
        <p className="text-muted-foreground text-xs mb-3">يرجى إعادة المحاولة لتثبيت الجلسة دون تسجيل خروج مفاجئ.</p>
        <button onClick={() => setForceSignOut(false)} className="text-primary text-sm hover:underline">إعادة المحاولة</button>
      </div>
    </div>
  );

  // Realtime: listen for immediate approval revocation
  useEffect(() => {
    if (!user || !activeProfile || activeProfile.is_principal || forceSignOut) return;

    const channel = supabase
      .channel("profile-approval-watch")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as { approved?: boolean; approved_by?: string | null };
          if (!updated.approved && updated.approved_by) {
            toast({
              title: "تم إلغاء اعتماد حسابك",
              description: "قام مدير المدرسة بإلغاء اعتماد حسابك. سيتم تسجيل خروجك الآن.",
              variant: "destructive",
            });
            setForceSignOut(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeProfile?.is_principal, forceSignOut]);

  // Give profile fetch short grace period
  useEffect(() => {
    if (!loading && user && !activeProfile && !profileTimeout) {
      const timer = setTimeout(() => setProfileTimeout(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [loading, user, activeProfile, profileTimeout]);

  // Detect explicit approval revocation only
  useEffect(() => {
    if (loading || !user || forceSignOut || !activeProfile || activeProfile.is_principal) return;

    const profileRevoked = Boolean(!activeProfile.approved && activeProfile.approved_by);

    if (profileRevoked) {
      toast({
        title: "تعذّر متابعة الدخول",
        description: "تم إلغاء اعتماد حسابك. سيتم إعادتك لصفحة الدخول.",
        variant: "destructive",
      });
      setForceSignOut(true);
    }
  }, [loading, user, activeProfile, forceSignOut]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (forceSignOut) return renderClosingSession();

  if (!user) return <Navigate to="/login" replace />;

  // Principal or approved users enter directly
  if (activeProfile?.is_principal || activeProfile?.approved) {
    // Teacher is restricted ONLY if they have no extra permissions beyond default teacher ones
    const userPerms = getUserPermissions(activeProfile?.user_id || "");
    const teacherDefaultPerms = new Set(["record_class_notes", "print_subject_sheets"]);
    const hasExtraPerms = userPerms.some(p => !teacherDefaultPerms.has(p));
    // Defer the "restricted" decision until permissions cache is loaded,
    // otherwise an approved teacher with extra perms can be wrongly bounced
    // back to "/" on every navigation while perms are still hydrating.
    const permsReady = arePermissionsLoaded();
    const isTeacherRestricted = Boolean(
      !activeProfile?.is_principal &&
      activeProfile?.approved &&
      activeProfile?.role_title?.includes("معلم") &&
      permsReady &&
      !hasExtraPerms
    );

    // Build allowed routes based on permissions
    const allowedRoutes = new Set(["/", "/classroom", "/print", "/attendance", "/violations", "/positive-behavior", "/action-details"]);
    allowedRoutes.add("/live-periods");
    allowedRoutes.add("/my-profile");
    if (hasExtraPerms || !activeProfile?.role_title?.includes("معلم")) {
      // User has extra permissions or is not a teacher - allow all routes
      allowedRoutes.add("/");
      allowedRoutes.add("/students");
      allowedRoutes.add("/positive-behavior");
      allowedRoutes.add("/attendance");
      allowedRoutes.add("/violations");
      allowedRoutes.add("/referral-tracking");
      allowedRoutes.add("/daily-report");
      allowedRoutes.add("/sms");
      allowedRoutes.add("/entry-exit");
      allowedRoutes.add("/action-details");
      allowedRoutes.add("/alert-followup");
      allowedRoutes.add("/audit-log");
      allowedRoutes.add("/distance-learning-settings");
      allowedRoutes.add("/teacher-affairs");
      allowedRoutes.add("/teacher-affairs/archive");
      allowedRoutes.add("/teacher-affairs/admin");
      allowedRoutes.add("/teacher-affairs/monthly-attendance");
      allowedRoutes.add("/educational-affairs");
      allowedRoutes.add("/student-affairs");
      allowedRoutes.add("/live-periods");
      allowedRoutes.add("/my-profile");
      allowedRoutes.add("/guide");
    }
    // الجميع يستطيع الوصول لدليل الاستخدام وملفه الشخصي
    allowedRoutes.add("/guide");
    allowedRoutes.add("/my-profile");

    // Restricted teachers cannot open individual student profiles or alert follow-up workflows
    if (isTeacherRestricted && !allowedRoutes.has(location.pathname)) {
      return <Navigate to="/" replace />;
    }
    if (isTeacherRestricted && location.pathname.startsWith("/student/")) {
      return <Navigate to="/" replace />;
    }

    return <>{children}</>;
  }

  // Profile still loading - brief grace period
  if (!activeProfile && !profileTimeout) {
    return <LoadingScreen />;
  }

  // Revoked profile path only
  if (activeProfile && !activeProfile.approved && activeProfile.approved_by) {
    return renderClosingSession();
  }

  // Profile missing after timeout: do not force logout, keep user on a stable waiting state
  if (!activeProfile && profileTimeout) {
    return <LoadingScreen />;
  }

  // Pending approval only
  if (activeProfile && !activeProfile.approved) {
    return <LoadingScreen message="بانتظار اعتماد المدير" hint="تم تسجيل حسابك بنجاح، وستتمكن من استخدام النظام بعد الاعتماد" />;
  }

  return <>{children}</>;
};

const InactivityAutoLogout = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showWait, setShowWait] = useState(false);

  useEffect(() => {
    if (!user) { setShowWait(false); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let signingOut = false;
    const resetTimer = () => {
      if (signingOut) return;
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      setShowWait(false);
      timer = setTimeout(() => {
        if (signingOut) return;
        // إظهار شاشة الانتظار الموحّدة ثم تسجيل الخروج بسلاسة بعد مهلة قصيرة
        setShowWait(true);
        graceTimer = setTimeout(async () => {
          if (signingOut) return;
          signingOut = true;
          toast({ title: "تم تسجيل الخروج تلقائيًا", description: "انتهت الجلسة بعد 25 دقيقة من عدم الاستخدام." });
          await signOut();
          navigate("/login", { replace: true });
        }, INACTIVITY_GRACE_MS);
      }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll", "mousemove"] as const;
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [user?.id, signOut, navigate]);

  if (!showWait) return null;
  return <LoadingScreen message="جارٍ إنهاء الجلسة" hint="انتهت مدة عدم الاستخدام، يتم تسجيل خروجك الآن" />;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
      <Route path="/violations" element={<ProtectedRoute><ViolationsPage /></ProtectedRoute>} />
      <Route path="/classroom" element={<ProtectedRoute><TeacherClassroomPage /></ProtectedRoute>} />
      <Route path="/referral-tracking" element={<ProtectedRoute><ReferralTrackingPage /></ProtectedRoute>} />
      <Route path="/print" element={<ProtectedRoute><PrintPage /></ProtectedRoute>} />
      <Route path="/daily-report" element={<ProtectedRoute><DailyReportPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
      <Route path="/action-details" element={<ProtectedRoute><ActionDetailsPage /></ProtectedRoute>} />
      <Route path="/student/:id" element={<ProtectedRoute><StudentProfilePage /></ProtectedRoute>} />
      <Route path="/sms" element={<ProtectedRoute><SmsPage /></ProtectedRoute>} />
      <Route path="/alert-followup" element={<ProtectedRoute><AlertFollowUpPage /></ProtectedRoute>} />
      <Route path="/entry-exit" element={<ProtectedRoute><EntryExitPermitPage /></ProtectedRoute>} />
      <Route path="/positive-behavior" element={<ProtectedRoute><PositiveBehaviorPage /></ProtectedRoute>} />
      <Route path="/audit-log" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
      <Route path="/distance-learning-settings" element={<ProtectedRoute><DistanceLearningSettingsPage /></ProtectedRoute>} />
      <Route path="/teacher-affairs" element={<ProtectedRoute><TeacherAffairsPage /></ProtectedRoute>} />
      <Route path="/teacher-affairs/archive" element={<ProtectedRoute><TeacherArchivePage /></ProtectedRoute>} />
      <Route path="/teacher-affairs/admin" element={<ProtectedRoute><TeacherAdminAffairsPage /></ProtectedRoute>} />
      <Route path="/teacher-affairs/monthly-attendance" element={<ProtectedRoute><TeacherMonthlyAttendancePage /></ProtectedRoute>} />
      <Route path="/educational-affairs" element={<ProtectedRoute><EducationalAffairsPage /></ProtectedRoute>} />
      <Route path="/student-affairs" element={<ProtectedRoute><StudentAffairsHubPage /></ProtectedRoute>} />
      <Route path="/live-periods" element={<ProtectedRoute><LivePeriodsPage /></ProtectedRoute>} />
      <Route path="/my-profile" element={<ProtectedRoute><MyTeacherProfilePage /></ProtectedRoute>} />
      <Route path="/guide" element={<ProtectedRoute><UserGuidePage /></ProtectedRoute>} />
      <Route path="/health-affairs" element={<ProtectedRoute><HealthAffairsHubPage /></ProtectedRoute>} />
      <Route path="/health-affairs/records" element={<ProtectedRoute><HealthRecordsPage /></ProtectedRoute>} />
      <Route path="/health-affairs/vital-signs" element={<ProtectedRoute><VitalSignsPage /></ProtectedRoute>} />
      <Route path="/health-affairs/emergencies" element={<ProtectedRoute><EmergenciesPage /></ProtectedRoute>} />
      <Route path="/health-affairs/special-cases" element={<ProtectedRoute><SpecialCasesPage /></ProtectedRoute>} />
      <Route path="/health-affairs/medical-referrals" element={<ProtectedRoute><MedicalReferralsPage /></ProtectedRoute>} />
      <Route path="/health-affairs/medical-absences" element={<ProtectedRoute><MedicalAbsencesPage /></ProtectedRoute>} />
      <Route path="/health-affairs/guardian-contacts" element={<ProtectedRoute><GuardianContactsPage /></ProtectedRoute>} />
      <Route path="/health-affairs/awareness" element={<ProtectedRoute><AwarenessPage /></ProtectedRoute>} />
      <Route path="/health-affairs/environment" element={<ProtectedRoute><EnvironmentPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

const App = () => {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  useEffect(() => {
    // Load dynamic distance-learning sections setting on app start
    loadDistanceLearningSections(true).then((list) => {
      setDynamicDistanceSections(list);
    });
    // Load Ramadan special-shift dates so attendance calculations use 09:30 start
    loadRamadanDates().catch(() => { /* ignore */ });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <UpdateNotification />
        <PwaInstallPrompt />
        <BrowserRouter>
          <AuthProvider>
            <InactivityAutoLogout />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
