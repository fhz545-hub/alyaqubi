import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import ConnectionStatus from "./ConnectionStatus";
import UserGuideDialog from "./UserGuideDialog";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto pt-16 lg:pt-8">
          {children}
        </div>
        <footer className="border-t border-border/30 py-4 px-6 text-center">
          <p className="text-xs text-muted-foreground/60">تنفيذ وتطوير: فهد حامد الزهراني</p>
        </footer>
      </main>
      <ConnectionStatus />
      <UserGuideDialog />
    </div>
  );
};

export default AppLayout;

