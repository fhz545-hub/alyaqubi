import UnifiedWaitScreen from "./UnifiedWaitScreen";

interface LoadingScreenProps {
  message?: string;
  hint?: string;
}

export default function LoadingScreen({ message = "جارٍ التحميل...", hint = "نقوم بتجهيز ملفاتك، لحظات من فضلك" }: LoadingScreenProps) {
  return <UnifiedWaitScreen message={message} hint={hint} />;
}