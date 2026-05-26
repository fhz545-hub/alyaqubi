import { useState, useEffect } from "react";
import { Wallet, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  apiToken: string;
}

const SmsBalanceCard = ({ apiToken }: Props) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = async () => {
    if (!apiToken) return;
    setLoading(true);
    try {
      // Method 1: Direct browser call (preferred when Orbit allows it)
      const endpoints = [
        { url: "https://app.mobile.net.sa/api/v1/get-balance", method: "POST" as const, body: {} },
        { url: "https://app.mobile.net.sa/api/v1/account/balance", method: "GET" as const },
        { url: "https://app.mobile.net.sa/api/v1/balance", method: "GET" as const },
      ];

      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, {
            method: ep.method,
            headers: {
              Authorization: `Bearer ${apiToken}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: ep.method === "POST" ? JSON.stringify((ep as { body?: Record<string, unknown> }).body ?? {}) : undefined,
          });
          if (!res.ok) continue;
          const d = await res.json();
          const bal = d?.data?.balance ?? d?.balance;
          if (bal !== undefined && bal !== null) {
            setBalance(Number(bal));
            setLoading(false);
            return;
          }
        } catch { continue; }
      }

      // Method 2: Edge Function fallback (for stricter CORS environments)
      try {
        const { data, error } = await supabase.functions.invoke("get-sms-balance");
        if (!error && data?.success && data?.balance !== undefined) {
          setBalance(Number(data.balance));
          setLoading(false);
          return;
        }
      } catch { /* keep null balance */ }

      // If all methods fail, show balance as unavailable but don't show error toast
      setBalance(null);
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiToken) fetchBalance();
  }, [apiToken]);

  const getBalanceColor = () => {
    if (balance === null) return { bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground", icon: "text-muted-foreground" };
    if (balance <= 100) return { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-300 dark:border-red-800", text: "text-red-600 dark:text-red-400", icon: "text-red-500" };
    if (balance < 500) return { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-800", text: "text-amber-600 dark:text-amber-400", icon: "text-amber-500" };
    return { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-800", text: "text-emerald-600 dark:text-emerald-400", icon: "text-emerald-500" };
  };

  const getStatusLabel = () => {
    if (balance === null) return "—";
    if (balance <= 100) return "⚠️ رصيد منخفض جداً";
    if (balance < 500) return "تنبيه: الرصيد أقل من 500";
    return "✓ الرصيد كافٍ";
  };

  const colors = getBalanceColor();

  return (
    <div className={cn(
      "rounded-xl border-2 p-4 flex items-center justify-between transition-all duration-300",
      colors.bg, colors.border,
      balance !== null && balance <= 100 && "animate-pulse shadow-lg shadow-red-200/50 dark:shadow-red-900/30"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
          balance !== null && balance <= 100 ? "bg-red-100 dark:bg-red-900/50" :
          balance !== null && balance < 500 ? "bg-amber-100 dark:bg-amber-900/50" :
          balance !== null && balance >= 500 ? "bg-emerald-100 dark:bg-emerald-900/50" :
          "bg-muted"
        )}>
          {balance !== null && balance <= 100 ? (
            <TrendingDown size={22} className={colors.icon} />
          ) : balance !== null && balance >= 500 ? (
            <TrendingUp size={22} className={colors.icon} />
          ) : (
            <Wallet size={22} className={colors.icon} />
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">رصيد الرسائل</p>
          <p className={cn("text-2xl font-black", colors.text)}>
            {balance !== null ? balance.toLocaleString("ar-SA") : "—"}
          </p>
          <p className={cn("text-[10px] font-medium mt-0.5", colors.text)}>
            {getStatusLabel()}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={fetchBalance} disabled={loading || !apiToken}>
        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
      </Button>
    </div>
  );
};

export default SmsBalanceCard;
