import { Eye } from "lucide-react";
import { VIEW_ONLY_BANNER_TEXT } from "@/hooks/useViewOnly";

interface ViewOnlyBannerProps {
  text?: string;
  className?: string;
}

const ViewOnlyBanner = ({ text = VIEW_ONLY_BANNER_TEXT, className = "" }: ViewOnlyBannerProps) => {
  return (
    <div
      className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 text-primary text-xs sm:text-sm font-semibold ${className}`}
      role="status"
      aria-live="polite"
    >
      <Eye size={16} className="shrink-0" />
      <span>{text}</span>
    </div>
  );
};

export default ViewOnlyBanner;
