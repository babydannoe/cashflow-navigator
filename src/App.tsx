import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BVProvider } from "@/contexts/BVContext";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ForecastExplorer from "./pages/ForecastExplorer";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <BVProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/forecast" element={<ForecastExplorer />} />
              <Route path="/bv-overzicht" element={<PlaceholderPage title="BV Overzicht" />} />
              <Route path="/mt-pipeline" element={<PlaceholderPage title="MT Pipeline" />} />
              <Route path="/facturen" element={<PlaceholderPage title="Facturen & Goedkeuringen" />} />
              <Route path="/betalingsronden" element={<PlaceholderPage title="Betalingsronden" />} />
              <Route path="/recurring" element={<PlaceholderPage title="Recurring Kosten" />} />
              <Route path="/buffers" element={<PlaceholderPage title="Buffers & Liquiditeit" />} />
              <Route path="/btw" element={<PlaceholderPage title="BTW & Belasting" />} />
              <Route path="/leningen" element={<PlaceholderPage title="Leningen & Dividend" />} />
              <Route path="/instellingen" element={<PlaceholderPage title="Instellingen" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BVProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
