import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

interface LayoutProps {
  children: React.ReactNode;
  enableTheme?: boolean;
}

function LayoutShell({ children, enableTheme }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <TopBar showThemeToggle={enableTheme} />
          <main className="flex-1 p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function Layout({ children, enableTheme = false }: LayoutProps) {
  const content = <LayoutShell enableTheme={enableTheme}>{children}</LayoutShell>;

  if (!enableTheme) {
    return content;
  }

  return <ThemeProvider>{content}</ThemeProvider>;
}
