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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Faturamento Hoje"
          value="R$ 12.456,00"
          change="+18.2% vs ontem"
          changeType="positive"
          icon={DollarSign}
          iconColor="text-primary"
        />
        <StatCard
          title="Total de Vendas"
          value="248"
          change="+23 vendas hoje"
          changeType="positive"
          icon={ShoppingCart}
          iconColor="text-success"
        />
        <StatCard
          title="Novos Clientes"
          value="32"
          change="+12.5% este mês"
          changeType="positive"
          icon={Users}
          iconColor="text-info"
        />
        <StatCard
          title="Taxa de Conversão"
          value="3.24%"
          change="+0.8% vs mês passado"
          changeType="positive"
          icon={TrendingUp}
          iconColor="text-warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <RevenueChart />
        </div>
        <div className="lg:col-span-3">
          <RecentSales />
        </div>
      </div>
    </div>
  );
}
