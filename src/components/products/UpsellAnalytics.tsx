import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, CheckCircle, XCircle, DollarSign, TrendingUp } from "lucide-react";

interface UpsellAnalyticsProps {
  upsellId: string;
}

export function UpsellAnalytics({ upsellId }: UpsellAnalyticsProps) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["upsell-analytics", upsellId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_upsell_analytics")
        .select("*")
        .eq("upsell_id", upsellId);

      if (error) throw error;

      const views = data?.filter((a) => a.event_type === "view").length || 0;
      const accepts = data?.filter((a) => a.event_type === "accept").length || 0;
      const rejects = data?.filter((a) => a.event_type === "reject").length || 0;
      const revenue = data
        ?.filter((a) => a.event_type === "accept")
        .reduce((sum, a) => sum + (a.revenue_generated || 0), 0) || 0;

      const conversionRate = views > 0 ? (accepts / views) * 100 : 0;

      return {
        views,
        accepts,
        rejects,
        revenue,
        conversionRate,
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Carregando analytics...</p>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      title: "Visualizações",
      value: analytics?.views || 0,
      icon: Eye,
      color: "text-blue-600",
    },
    {
      title: "Aceites",
      value: analytics?.accepts || 0,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      title: "Rejeições",
      value: analytics?.rejects || 0,
      icon: XCircle,
      color: "text-red-600",
    },
    {
      title: "Taxa de Conversão",
      value: `${(analytics?.conversionRate || 0).toFixed(1)}%`,
      icon: TrendingUp,
      color: "text-purple-600",
    },
    {
      title: "Receita Gerada",
      value: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(analytics?.revenue || 0),
      icon: DollarSign,
      color: "text-green-600",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics do Upsell</CardTitle>
        <CardDescription>
          Métricas de performance e conversão
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.title}
                className="flex flex-col items-center p-4 bg-muted rounded-lg"
              >
                <Icon className={`w-8 h-8 ${stat.color} mb-2`} />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground text-center">
                  {stat.title}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
