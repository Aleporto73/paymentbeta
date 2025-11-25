import { useEffect, useState } from "react";
import { DollarSign, ShoppingCart } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, startOfMonth, subDays, endOfDay } from "date-fns";

interface DashboardStats {
  revenueToday: number;
  revenueYesterday: number;
  revenueLast7Days: number;
  revenueThisMonth: number;
  salesToday: number;
  salesYesterday: number;
  salesLast7Days: number;
  salesThisMonth: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    revenueToday: 0,
    revenueYesterday: 0,
    revenueLast7Days: 0,
    revenueThisMonth: 0,
    salesToday: 0,
    salesYesterday: 0,
    salesLast7Days: 0,
    salesThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const todayStart = startOfDay(now);
      const yesterdayStart = startOfDay(subDays(now, 1));
      const yesterdayEnd = endOfDay(subDays(now, 1));
      const last7DaysStart = startOfDay(subDays(now, 7));
      const monthStart = startOfMonth(now);

      // Fetch all confirmed transactions
      const { data: transactions } = await supabase
        .from("transactions")
        .select("value, created_at, status")
        .in("status", ["RECEIVED", "CONFIRMED"]);

      if (!transactions) {
        setLoading(false);
        return;
      }

      // Calculate stats
      const revenueToday = transactions
        .filter((t) => new Date(t.created_at) >= todayStart)
        .reduce((sum, t) => sum + Number(t.value), 0);

      const revenueYesterday = transactions
        .filter(
          (t) =>
            new Date(t.created_at) >= yesterdayStart &&
            new Date(t.created_at) <= yesterdayEnd
        )
        .reduce((sum, t) => sum + Number(t.value), 0);

      const revenueLast7Days = transactions
        .filter((t) => new Date(t.created_at) >= last7DaysStart)
        .reduce((sum, t) => sum + Number(t.value), 0);

      const revenueThisMonth = transactions
        .filter((t) => new Date(t.created_at) >= monthStart)
        .reduce((sum, t) => sum + Number(t.value), 0);

      const salesToday = transactions.filter(
        (t) => new Date(t.created_at) >= todayStart
      ).length;

      const salesYesterday = transactions.filter(
        (t) =>
          new Date(t.created_at) >= yesterdayStart &&
          new Date(t.created_at) <= yesterdayEnd
      ).length;

      const salesLast7Days = transactions.filter(
        (t) => new Date(t.created_at) >= last7DaysStart
      ).length;

      const salesThisMonth = transactions.filter(
        (t) => new Date(t.created_at) >= monthStart
      ).length;

      setStats({
        revenueToday,
        revenueYesterday,
        revenueLast7Days,
        revenueThisMonth,
        salesToday,
        salesYesterday,
        salesLast7Days,
        salesThisMonth,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "+100%" : "0%";
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const revenueChange = calculateChange(stats.revenueToday, stats.revenueYesterday);
  const salesChange = calculateChange(stats.salesToday, stats.salesYesterday);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Visão geral do seu negócio em tempo real
        </p>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <StatCard
            title="Faturamento Hoje"
            value={formatCurrency(stats.revenueToday)}
            change={`${revenueChange} vs ontem`}
            changeType={stats.revenueToday >= stats.revenueYesterday ? "positive" : "negative"}
            icon={DollarSign}
            iconColor="text-primary"
            additionalMetrics={[
              { label: "Ontem", value: formatCurrency(stats.revenueYesterday) },
              { label: "Últimos 7 dias", value: formatCurrency(stats.revenueLast7Days) },
              { label: "Mês atual", value: formatCurrency(stats.revenueThisMonth) },
            ]}
          />
          <StatCard
            title="Total de Vendas"
            value={stats.salesToday.toString()}
            change={`${stats.salesToday > 0 ? '+' : ''}${stats.salesToday} vendas hoje`}
            changeType={stats.salesToday >= stats.salesYesterday ? "positive" : "negative"}
            icon={ShoppingCart}
            iconColor="text-success"
            additionalMetrics={[
              { label: "Ontem", value: stats.salesYesterday.toString() },
              { label: "Últimos 7 dias", value: stats.salesLast7Days.toString() },
              { label: "Mês atual", value: stats.salesThisMonth.toString() },
            ]}
          />
        </div>
      )}

      <RevenueChart />

      <RecentSales />
    </div>
  );
}
