import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BVProvider } from "@/contexts/BVContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ForecastExplorer from "./pages/ForecastExplorer";
import BVOverzicht from "./pages/BVOverzicht";
import MTPipeline from "./pages/MTPipeline";
import BuffersLiquiditeit from "./pages/BuffersLiquiditeit";
import RecurringKosten from "./pages/RecurringKosten";
import Facturen from "./pages/Facturen";
import Betalingsronden from "./pages/Betalingsronden";
import BTWBelasting from "./pages/BTWBelasting";
import LeningenDividend from "./pages/LeningenDividend";
import FinanceMeeting from "./pages/FinanceMeeting";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <BVProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/finance-meeting" element={<FinanceMeeting />} />
                <Route path="/forecast" element={<ForecastExplorer />} />
                <Route path="/bv-overzicht" element={<BVOverzicht />} />
                <Route path="/mt-pipeline" element={<MTPipeline />} />
                <Route path="/facturen" element={<Facturen />} />
                <Route path="/betalingsronden" element={<Betalingsronden />} />
                <Route path="/recurring" element={<RecurringKosten />} />
                <Route path="/buffers" element={<BuffersLiquiditeit />} />
                <Route path="/btw" element={<BTWBelasting />} />
                <Route path="/leningen" element={<LeningenDividend />} />
                <Route path="/instellingen" element={<PlaceholderPage title="Instellingen" />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </BVProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
