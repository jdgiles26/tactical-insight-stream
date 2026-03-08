import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import IngestPage from "./pages/IngestPage";
import DiscoveryPage from "./pages/DiscoveryPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import QueuePage from "./pages/QueuePage";
import MapPage from "./pages/MapPage";
import SourcesPage from "./pages/SourcesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="ml-60 flex-1 p-6">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/ingest" element={<IngestPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/discovery" element={<DiscoveryPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/queue" element={<QueuePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
