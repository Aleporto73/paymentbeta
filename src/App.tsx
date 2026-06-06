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
import Assinaturas from "./pages/Assinaturas";
import Clientes from "./pages/Clientes";
import Afiliados from "./pages/Afiliados";
import Cupons from "./pages/Cupons";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import Relatorios from "./pages/Relatorios";
import Integracoes from "./pages/Integracoes";
import Webhooks from "./pages/Webhooks";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Checkout from "./pages/Checkout";
import PaymentApproved from "./pages/PaymentApproved";
import PaymentPending from "./pages/PaymentPending";
import PaymentRejected from "./pages/PaymentRejected";
import TermsOfPurchase from "./pages/TermsOfPurchase";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import PaymentSecurity from "./pages/PaymentSecurity";

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
            <Route path="/pagamento-aprovado" element={<PaymentApproved />} />
            <Route path="/pagamento-em-analise" element={<PaymentPending />} />
            <Route path="/pagamento-recusado" element={<PaymentRejected />} />
            <Route path="/termos-de-compra" element={<TermsOfPurchase />} />
            <Route path="/privacidade" element={<PrivacyPolicy />} />
            <Route path="/seguranca-pagamento" element={<PaymentSecurity />} />
            <Route path="/" element={<ProtectedRoute requiredRole="admin"><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/produtos" element={<ProtectedRoute requiredRole="admin"><Layout><Produtos /></Layout></ProtectedRoute>} />
            <Route path="/produtos/:id" element={<ProtectedRoute requiredRole="admin"><Layout><ProductDetail /></Layout></ProtectedRoute>} />
            <Route path="/vendas" element={<ProtectedRoute requiredRole="admin"><Layout><Vendas /></Layout></ProtectedRoute>} />
            <Route path="/assinaturas" element={<ProtectedRoute requiredRole="admin"><Layout><Assinaturas /></Layout></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute requiredRole="admin"><Layout><Clientes /></Layout></ProtectedRoute>} />
            <Route path="/afiliados" element={<ProtectedRoute requiredRole="admin"><Layout><Afiliados /></Layout></ProtectedRoute>} />
            <Route path="/dashboard-afiliado" element={<ProtectedRoute requiredRole="affiliate"><Layout><AffiliateDashboard /></Layout></ProtectedRoute>} />
            <Route path="/cupons" element={<ProtectedRoute requiredRole="admin"><Layout><Cupons /></Layout></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute requiredRole="admin"><Layout><Relatorios /></Layout></ProtectedRoute>} />
            <Route path="/integracoes" element={<ProtectedRoute requiredRole="admin"><Layout><Integracoes /></Layout></ProtectedRoute>} />
            <Route path="/webhooks" element={<ProtectedRoute requiredRole="admin"><Layout><Webhooks /></Layout></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
