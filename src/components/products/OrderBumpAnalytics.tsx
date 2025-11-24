import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, TrendingUp, DollarSign, Eye, CheckCircle, XCircle } from "lucide-react";

interface OrderBumpAnalyticsProps {
  orderBumpId: string;
}

interface AnalyticsStats {
  views: number;
  accepts: number;
  rejects: number;
  conversionRate: number;
  totalRevenue: number;
}

export function OrderBumpAnalytics({ orderBumpId }: OrderBumpAnalyticsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["order-bump-analytics", orderBumpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_order_bump_analytics")
        .select("event_type, revenue_generated")
        .eq("order_bump_id", orderBumpId);

      if (error) throw error;

      const views = data.filter(d => d.event_type === "view").length;
      const accepts = data.filter(d => d.event_type === "accept").length;
      const rejects = data.filter(d => d.event_type === "reject").length;
      const totalRevenue = data
        .filter(d => d.event_type === "accept")
        .reduce((sum, d) => sum + (d.revenue_generated || 0), 0);
      const conversionRate = views > 0 ? (accepts / views) * 100 : 0;

      return {
        views,
        accepts,
        rejects,
        conversionRate,
        totalRevenue,
      } as AnalyticsStats;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart className="h-5 w-5" />
            Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart className="h-5 w-5" />
          Analytics do Order Bump
        </CardTitle>
        <CardDescription>
          Métricas de desempenho e conversão
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span className="text-xs">Visualizações</span>
            </div>
            <p className="text-2xl font-bold">{stats.views}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs">Aceitaram</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.accepts}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-xs">Recusaram</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.rejects}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-blue-600">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Taxa de Conversão</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {stats.conversionRate.toFixed(1)}%
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Receita Adicional</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
