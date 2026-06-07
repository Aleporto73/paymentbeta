import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";

interface Sale {
  sale_date: string;
  sale_amount: number;
  commission_amount: number;
}

interface AffiliatePerformanceChartProps {
  sales: Sale[];
  totalClicks: number;
}

export function AffiliatePerformanceChart({ sales, totalClicks }: AffiliatePerformanceChartProps) {
  // Prepare data for the last 30 days
  const getLast30DaysData = () => {
    const today = new Date();
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(today, 29 - i);
      return {
        date: format(startOfDay(date), 'yyyy-MM-dd'),
        displayDate: format(date, 'dd/MM', { locale: ptBR }),
        sales: 0,
        commission: 0,
        clicks: 0,
        conversionRate: 0,
      };
    });

    // Aggregate sales data by date
    sales.forEach((sale) => {
      const saleDate = format(startOfDay(new Date(sale.sale_date)), 'yyyy-MM-dd');
      const dayData = last30Days.find(d => d.date === saleDate);
      if (dayData) {
        dayData.sales += 1;
        dayData.commission += sale.commission_amount || 0;
      }
    });

    // Distribute clicks evenly (in real scenario, you'd have click dates)
    const clicksPerDay = Math.floor(totalClicks / 30);
    last30Days.forEach(day => {
      day.clicks = clicksPerDay;
      day.conversionRate = day.clicks > 0 ? (day.sales / day.clicks) * 100 : 0;
    });

    return last30Days;
  };

  const chartData = getLast30DaysData();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Vendas e comissões brutas estimadas</CardTitle>
          <CardDescription>Últimos 30 dias</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorCommission" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="displayDate" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                interval={4}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => `R$ ${formatCurrency(Number(value))}`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'commission') {
                    return [`R$ ${formatCurrency(Number(value))}`, "Comissão bruta estimada"];
                  }
                  return [value, "Vendas"];
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => value === 'commission' ? 'Comissão bruta estimada' : 'Vendas'}
              />
              <Area 
                type="monotone" 
                dataKey="commission" 
                stroke="hsl(var(--success))" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorCommission)" 
              />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taxa de Conversão</CardTitle>
          <CardDescription>Cliques vs Vendas - Últimos 30 dias</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="displayDate" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                interval={4}
              />
              <YAxis 
                yAxisId="left"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => `${value.toFixed(1)}%`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'conversionRate') {
                    return [`${value.toFixed(2)}%`, "Taxa de Conversão"];
                  }
                  if (name === 'clicks') {
                    return [value, "Cliques"];
                  }
                  return [value, "Vendas"];
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                formatter={(value) => {
                  if (value === 'conversionRate') return 'Taxa de Conversão (%)';
                  if (value === 'clicks') return 'Cliques';
                  return 'Vendas';
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="clicks"
                stroke="hsl(var(--info))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="sales"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversionRate"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--warning))", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
