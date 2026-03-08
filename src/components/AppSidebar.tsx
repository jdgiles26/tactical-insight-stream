import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Database, 
  Search, 
  BarChart3, 
  Radio, 
  Map,
  Plug,
  Shield,
  Upload,
  Crosshair,
  AlertTriangle,
  GitBranch,
  Tv,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/ingest", label: "Data Ingestion", icon: Database },
  { path: "/upload", label: "Upload & Process", icon: Upload },
  { path: "/intent", label: "Commander's Intent", icon: Crosshair },
  { path: "/alerts", label: "Alerts", icon: AlertTriangle },
  { path: "/pipeline", label: "Event Pipeline", icon: GitBranch },
  { path: "/media", label: "Media Player", icon: Tv },
  { path: "/map", label: "Map View", icon: Map },
  { path: "/discovery", label: "Discovery", icon: Search },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/queue", label: "Processing Queue", icon: Radio },
  { path: "/sources", label: "Data Sources", icon: Plug },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-foreground">MDG v2</h1>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Mission Data Grid</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <NavLink
              key={path}
              to={path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
          <span className="text-xs font-mono text-muted-foreground">SYSTEM ONLINE</span>
        </div>
      </div>
    </aside>
  );
}
