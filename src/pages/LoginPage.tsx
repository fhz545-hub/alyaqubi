import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GraduationCap, LogIn, UserPlus, Eye, EyeOff, Download, Smartphone, KeyRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SCHOOL_INFO } from "@/types/school";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const ROLE_OPTIONS = [
  "معلم",
  "وكيل شؤون الطلاب",
  "وكيل شؤون المعلمين",
  "متابع",
  "إداري",
  "محضر مختبر",
  "موجه صحي",
  "رائد نشاط",
  "مشرف",
];

const LoginPage = () => {
  const { signIn, signUp, signOut } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("معلم");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCivilId, setResetCivilId] = useState("");
  const [resetFullName, setResetFullName] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        toast({ title: "تم تثبيت التطبيق بنجاح ✅" });
      }
      setDeferredPrompt(null);
    } else {
      toast({
        title: "تثبيت التطبيق",
        description: "على آيفون: اضغط على زر المشاركة ↑ ثم «إضافة إلى الشاشة الرئيسية». على أندرويد: اضغط على قائمة المتصفح ⋮ ثم «تثبيت التطبيق».",
      });
    }
  };


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ title: "خطأ في تسجيل الدخول", description: error, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !nationalId.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      toast({ title: "يرجى تعبئة جميع الحقول", description: "الاسم، رقم الهوية، الجوال، البريد، وكلمة المرور — كلها مطلوبة.", variant: "destructive" });
      return;
    }
    const cleanNid = nationalId.trim().replace(/\D/g, "");
    if (cleanNid.length !== 10) {
      toast({ title: "رقم الهوية يجب أن يكون 10 أرقام بالضبط", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    
    try {
      // Step 1 — Verify the civil_id exists in the official teachers registry.
      // Self-registration is restricted to staff already known to the school.
      const verifyRes = await supabase.functions.invoke("verify-teacher-civil-id", {
        body: { civil_id: cleanNid },
      });
      const verifyData = (verifyRes.data || {}) as { exists?: boolean; error?: string; full_name?: string };
      if (!verifyData.exists) {
        toast({
          title: "تعذّر التسجيل: رقم الهوية غير موجود",
          description: verifyData.error || "لا يمكن إنشاء الحساب إلا إذا كان رقم الهوية مسجلاً مسبقاً في قاعدة بيانات المعلمين. يرجى التواصل مع مدير المدرسة لإضافتك أولاً.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Check for duplicate national_id or phone
      const { data: existingProfiles } = await supabase
        .from("profiles")
        .select("national_id, phone")
        .or(`national_id.eq.${cleanNid},phone.eq.${phone.trim()}`);
      
      if (existingProfiles && existingProfiles.length > 0) {
        const dupNid = existingProfiles.some(p => p.national_id === cleanNid);
        const dupPhone = existingProfiles.some(p => p.phone === phone.trim());
        const msg = dupNid && dupPhone 
          ? "رقم الهوية ورقم الجوال مسجلان مسبقاً" 
          : dupNid ? "رقم الهوية مسجل مسبقاً" : "رقم الجوال مسجل مسبقاً";
        toast({ 
          title: msg, 
          description: "يرجى التواصل مع مدير المدرسة لمعرفة بيانات الدخول أو إعادة تعيين كلمة المرور", 
          variant: "destructive" 
        });
        setSubmitting(false);
        return;
      }

      const { error } = await signUp(email, password, {
        full_name: fullName.trim(),
        role_title: roleTitle,
        national_id: cleanNid,
        phone: phone.trim(),
      });
      
      if (error) {
        toast({ title: "خطأ في التسجيل", description: error, variant: "destructive" });
      } else {
        // signOut is now handled inside signUp - no need to call it here

        // Send notification to principal
        try {
          const { data: principalData } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("is_principal", true)
            .limit(1);
          
          if (principalData && principalData.length > 0) {
            await supabase.from("notifications").insert({
              user_id: principalData[0].user_id,
              title: "طلب تسجيل جديد",
              body: `${fullName.trim()} (${roleTitle}) طلب التسجيل في النظام`,
              type: "registration",
            } as any);
          }
        } catch (notifErr) {
          // Non-critical, ignore
        }

        toast({
          title: "تم التسجيل بنجاح ✅",
          description: "بانتظار اعتماد مدير مدرسة اليعقوبي الثانوية لتفعيل حسابك. لن تتمكن من الدخول حتى يتم اعتماد حسابك.",
        });
        setIsRegister(false);
        setEmail("");
        setPassword("");
        setFullName("");
        setNationalId("");
        setPhone("");
      }
    } catch (err) {
      toast({ title: "خطأ غير متوقع", description: "يرجى المحاولة مرة أخرى", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handlePasswordResetRequest = async () => {
    if (!resetEmail.trim() && !resetCivilId.trim()) {
      toast({ title: "يرجى إدخال البريد أو رقم الهوية", variant: "destructive" });
      return;
    }
    setResetSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-password-reset", {
        body: {
          email: resetEmail.trim(),
          civil_id: resetCivilId.trim().replace(/\D/g, ""),
          full_name: resetFullName.trim(),
          phone: resetPhone.trim(),
        },
      });
      const ok = (data as any)?.ok;
      if (error || !ok) {
        toast({
          title: "تعذر إرسال الطلب",
          description: (data as any)?.error || error?.message || "حدث خطأ، حاول مرة أخرى لاحقاً.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "تم إرسال الطلب ✅",
          description: "وصل إشعارك إلى مدير المدرسة، وسيتم التواصل معك بعد إعادة التعيين.",
        });
        setResetOpen(false);
        setResetEmail("");
        setResetCivilId("");
        setResetFullName("");
        setResetPhone("");
      }
    } catch (err: any) {
      toast({ title: "خطأ غير متوقع", description: err?.message || "حاول لاحقاً", variant: "destructive" });
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <GraduationCap size={32} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">نظام متابعة الطلاب</h1>
          <p className="text-muted-foreground text-sm mt-1">مدرسة اليعقوبي الثانوية</p>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-foreground mb-5 text-center">
            {isRegister ? "تسجيل حساب جديد" : "تسجيل الدخول"}
          </h2>

          <form onSubmit={isRegister ? handleRegister : handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">البريد الإلكتروني</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@school.edu.sa"
                required
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">كلمة المرور</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  dir="ltr"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {isRegister && (
              <>
                {/* Warning banner */}
                <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
                  <p className="text-destructive text-xs font-semibold leading-relaxed">
                    ⚠️ يرجى إدخال بياناتك الصحيحة والدقيقة (الاسم الكامل، رقم الهوية، رقم الجوال).
                    أي حساب ببيانات غير صحيحة سيتم رفضه مباشرة من قبل مدير المدرسة.
                    الحساب لن يُفعّل إلا بعد اعتماد المدير.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">الاسم الكامل <span className="text-destructive">*</span></label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الرباعي كاملاً" required />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">الصفة الوظيفية</label>
                  <Select value={roleTitle} onValueChange={setRoleTitle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">رقم الهوية <span className="text-destructive">*</span></label>
                  <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="رقم الهوية الوطنية (10 أرقام)" dir="ltr" required maxLength={10} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">رقم الجوال <span className="text-destructive">*</span></label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" required />
                </div>
              </>
            )}

            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
              {submitting ? "جارٍ المعالجة..." : isRegister ? "تسجيل" : "دخول"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-sm text-primary hover:underline"
            >
              {isRegister ? "لديك حساب؟ سجل دخولك" : "ليس لديك حساب؟ سجل الآن"}
            </button>
          </div>

          {!isRegister && (
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <KeyRound size={12} /> نسيت كلمة المرور؟ اطلب إعادة تعيين
              </button>
            </div>
          )}
        </div>

        {/* Install App Button */}
        {!isInstalled && (
          <button
            onClick={handleInstallApp}
            className="mt-4 w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
              <Smartphone size={18} className="text-primary" />
            </div>
            <div className="text-right">
              <p className="text-primary font-bold text-sm">تثبيت التطبيق على جهازك</p>
              <p className="text-primary/70 text-[11px]">للوصول السريع والعمل بدون إنترنت</p>
            </div>
            <Download size={16} className="text-primary/60 mr-auto" />
          </button>
        )}

        {/* Lost credentials notice */}
        <div className="mt-4 p-3 rounded-xl border border-primary/20 bg-primary/5 text-center space-y-1">
          <p className="text-primary font-semibold text-xs leading-relaxed">
            🔑 في حال فقدان اسم المستخدم أو كلمة المرور، يرجى التواصل مع مدير المدرسة لإعادة تعيين بيانات الدخول
          </p>
        </div>

        {/* Red Notice */}
        <div className="mt-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-center space-y-1">
          <p className="text-destructive font-bold text-sm leading-relaxed">
            منصة متابعة المواظبة والسلوك — مدرسة اليعقوبي الثانوية
          </p>
          <p className="text-destructive/80 font-semibold text-xs">
            — للاستخدام الداخلي فقط —
          </p>
          <p className="text-destructive/70 text-xs">
            الحسابات الجديدة تُعتمد من قبل مدير المدرسة فقط
          </p>
        </div>

        {/* Developer Credits */}
        <p className="text-center text-[11px] text-muted-foreground mt-6 opacity-70">
          تنفيذ وتطوير: فهد حامد الزهراني
        </p>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <KeyRound size={18} className="text-primary" /> طلب إعادة تعيين كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              املأ بياناتك ليتمكن مدير المدرسة من التحقق من هويتك وإعادة تعيين كلمة المرور لك. سيصلك التواصل بعد المعالجة.
            </p>
            <div>
              <label className="text-xs font-semibold mb-1 block">الاسم الكامل</label>
              <Input value={resetFullName} onChange={(e) => setResetFullName(e.target.value)} placeholder="الاسم الرباعي" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">البريد الإلكتروني</label>
              <Input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="example@school.edu.sa" dir="ltr" type="email" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">رقم الهوية</label>
              <Input value={resetCivilId} onChange={(e) => setResetCivilId(e.target.value)} placeholder="10 أرقام" dir="ltr" maxLength={10} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">رقم الجوال</label>
              <Input value={resetPhone} onChange={(e) => setResetPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetSubmitting}>إلغاء</Button>
            <Button onClick={handlePasswordResetRequest} disabled={resetSubmitting} className="gap-2">
              <KeyRound size={16} /> {resetSubmitting ? "جارٍ الإرسال..." : "إرسال الطلب للمدير"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoginPage;
