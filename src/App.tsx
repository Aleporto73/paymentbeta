import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Produtos from "./pages/Produtos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/produtos" element={<Layout><Produtos /></Layout>} />
          <Route path="/vendas" element={<Layout><Produtos /></Layout>} />
          <Route path="/assinaturas" element={<Layout><Produtos /></Layout>} />
          <Route path="/clientes" element={<Layout><Produtos /></Layout>} />
          <Route path="/cupons" element={<Layout><Produtos /></Layout>} />
          <Route path="/relatorios" element={<Layout><Produtos /></Layout>} />
          <Route path="/integracoes" element={<Layout><Produtos /></Layout>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
