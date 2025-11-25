import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RevenueData {
  name: string;
  revenue: number;
  day: number;
}

export function RevenueChart() {
  const [data, setData] = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevenueData();
  }, []);

  const fetchRevenueData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Get all days in the current month
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Fetch transactions for the current month
      const { data: transactions } = await supabase
        .from("transactions")
        .select("value, created_at")
        .eq("user_id", user.id)
        .in("status", ["RECEIVED", "CONFIRMED"])
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString());

      // Group transactions by day
      const revenueByDay = new Map<number, number>();

      daysInMonth.forEach((day) => {
        const dayNumber = day.getDate();
        revenueByDay.set(dayNumber, 0);
      });

      transactions?.forEach((transaction) => {
        const transactionDate = new Date(transaction.created_at);
        const dayNumber = transactionDate.getDate();
        const currentRevenue = revenueByDay.get(dayNumber) || 0;
        revenueByDay.set(dayNumber, currentRevenue + Number(transaction.value));
      });

      // Convert to chart data
      const chartData = Array.from(revenueByDay.entries())
        .map(([day, revenue]) => ({
          name: day.toString(),
          revenue,
          day,
        }))
        .sort((a, b) => a.day - b.day);

      setData(chartData);
    } catch (error) {
      console.error("Error fetching revenue data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Faturamento do mês</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[350px] flex items-center justify-center">
            <p className="text-muted-foreground">Carregando dados...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[350px] flex items-center justify-center">
            <p className="text-muted-foreground">
              Nenhuma venda registrada neste mês
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) =>
                  value >= 1000 ? `R$ ${(value / 1000).toFixed(1)}k` : `R$ ${value}`
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [
                  `R$ ${value.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
                  "Faturamento",
                ]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
