import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Produtos from "./pages/Produtos";
import ProductDetail from "./pages/ProductDetail";
import Vendas from "./pages/Vendas";
import Afiliados from "./pages/Afiliados";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import Relatorios from "./pages/Relatorios";
import Integracoes from "./pages/Integracoes";
import Webhooks from "./pages/Webhooks";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Checkout from "./pages/Checkout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/produtos" element={<ProtectedRoute><Layout><Produtos /></Layout></ProtectedRoute>} />
            <Route path="/produtos/:id" element={<ProtectedRoute><Layout><ProductDetail /></Layout></ProtectedRoute>} />
            <Route path="/vendas" element={<ProtectedRoute><Layout><Vendas /></Layout></ProtectedRoute>} />
            <Route path="/assinaturas" element={<ProtectedRoute><Layout><Produtos /></Layout></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Layout><Produtos /></Layout></ProtectedRoute>} />
            <Route path="/afiliados" element={<ProtectedRoute><Layout><Afiliados /></Layout></ProtectedRoute>} />
            <Route path="/dashboard-afiliado" element={<ProtectedRoute><Layout><AffiliateDashboard /></Layout></ProtectedRoute>} />
            <Route path="/cupons" element={<ProtectedRoute><Layout><Produtos /></Layout></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute><Layout><Relatorios /></Layout></ProtectedRoute>} />
            <Route path="/integracoes" element={<ProtectedRoute><Layout><Integracoes /></Layout></ProtectedRoute>} />
            <Route path="/webhooks" element={<ProtectedRoute><Layout><Webhooks /></Layout></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
