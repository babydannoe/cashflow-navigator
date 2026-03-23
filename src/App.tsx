import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BVProvider } from "@/contexts/BVContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
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
import Login from "./pages/Login";
import MFASetup from "./pages/MFASetup";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
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
          <Route path="/mfa-setup" element={<MFASetup />} />
          <Route path="/instellingen" element={<PlaceholderPage title="Instellingen" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </BVProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
