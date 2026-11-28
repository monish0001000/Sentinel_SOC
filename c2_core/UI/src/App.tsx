import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import MobileAgent from "./pages/mobile/MobileAgent";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import NotFound from "./pages/NotFound";

const DashboardLayout = lazy(() => import("./components/dashboard/DashboardLayout"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const LogsPage = lazy(() => import("./pages/dashboard/LogsPage"));
const ThreatsPage = lazy(() => import("./pages/dashboard/ThreatsPage"));
const AnalyticsPage = lazy(() => import("./pages/dashboard/AnalyticsPage"));
const SettingsPage = lazy(() => import("./pages/dashboard/SettingsPage"));
const FirewallPage = lazy(() => import("./pages/dashboard/FirewallPage"));
const NodesPage = lazy(() => import("./pages/dashboard/NodesPage"));
const ForensicsPage = lazy(() => import("./pages/dashboard/ForensicsPage"));
const TrafficPage = lazy(() => import("./pages/dashboard/TrafficPage"));
const AIAnalystPage = lazy(() => import("./pages/dashboard/AIAnalystPage"));
const PoliciesPage = lazy(() => import("./pages/dashboard/PoliciesPage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
    Loading Sentinel SOC...
  </div>
);

const App = () => (
  <div className="sentinel-app min-h-screen">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/mobile-agent" element={<MobileAgent />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<DashboardHome />} />
                  <Route path="logs" element={<LogsPage />} />
                  <Route path="threats" element={<ThreatsPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="traffic" element={<TrafficPage />} />
                  <Route path="ai" element={<Navigate to="/dashboard/ai-analyst" replace />} />
                  <Route path="ai-analyst" element={<AIAnalystPage />} />
                  <Route path="firewall" element={<FirewallPage />} />
                  <Route path="policies" element={<PoliciesPage />} />
                  <Route path="forensics" element={<ForensicsPage />} />
                  <Route path="nodes" element={<NodesPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </div>
);

export default App;
