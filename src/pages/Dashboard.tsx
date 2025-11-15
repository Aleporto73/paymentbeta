import { DollarSign, ShoppingCart, Users, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { RevenueChart } from "@/components/dashboard/RevenueChart";

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do seu negócio em tempo real</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <StatCard
          title="Faturamento Hoje"
          value="R$ 12.456,00"
          change="+18.2% vs ontem"
          changeType="positive"
          icon={DollarSign}
          iconColor="text-primary"
          additionalMetrics={[
            { label: "Ontem", value: "R$ 10.540,00" },
            { label: "Últimos 7 dias", value: "R$ 82.340,00" },
            { label: "Mês atual", value: "R$ 245.780,00" },
          ]}
        />
        <StatCard
          title="Total de Vendas"
          value="248"
          change="+23 vendas hoje"
          changeType="positive"
          icon={ShoppingCart}
          iconColor="text-success"
          additionalMetrics={[
            { label: "Ontem", value: "210" },
            { label: "Últimos 7 dias", value: "1.540" },
            { label: "Mês atual", value: "4.825" },
          ]}
        />
      </div>

      <RevenueChart />
      
      <RecentSales />
    </div>
  );
}
