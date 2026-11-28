import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Shield,
  LayoutDashboard,
  ScrollText,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Lock,
  Server,
  Brain,
  Activity,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Overview", end: true },
  { path: "/dashboard/logs", icon: ScrollText, label: "Live Logs" },
  { path: "/dashboard/threats", icon: AlertTriangle, label: "Threats" },
  { path: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/dashboard/traffic", icon: Activity, label: "Live Traffic" },
  { path: "/dashboard/ai-analyst", icon: Brain, label: "AI Analyst" },
  { path: "/dashboard/firewall", icon: Lock, label: "Firewall Control" },
  { path: "/dashboard/policies", icon: Shield, label: "Policy Engine" },
  { path: "/dashboard/forensics", icon: ScrollText, label: "Forensics" },
  { path: "/dashboard/nodes", icon: Server, label: "Endpoints" },
  { path: "/dashboard/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ mobileOpen = false, onClose }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      toast({
        title: "Session Terminated",
        description: "You have been signed out.",
      });
      onClose?.();
      navigate("/login", { replace: true });
    }
  };

  const renderContent = (isMobile: boolean) => (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          {(!collapsed || isMobile) && (
            <span className="font-bold text-foreground tracking-wider whitespace-nowrap">
              SENTINEL
            </span>
          )}
        </div>
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                collapsed && !isMobile && "justify-center px-2"
              )
            }
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {(!collapsed || isMobile) && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            "w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            collapsed && !isMobile && "justify-center px-2"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(!collapsed || isMobile) && <span>Logout</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        className={cn(
          "hidden md:block sticky top-0 h-screen flex-shrink-0 transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] h-full shadow-xl">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
