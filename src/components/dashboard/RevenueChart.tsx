import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export interface DailyMetric {
  /** Dia comercial (yyyy-MM-dd, America/Sao_Paulo). */
  day: string;
  /** Rótulo curto do eixo X (dd/MM). */
  label: string;
  accesses: number;
  sales: number;
  revenue: number;
}

interface RevenueChartProps {
  data: DailyMetric[];
  loading: boolean;
}

const ACCESS_COLOR = "hsl(217, 91%, 60%)";
const SALES_COLOR = "hsl(142, 71%, 45%)";
const REVENUE_COLOR = "hsl(38, 92%, 50%)";

const conversionRate = (sales: number, accesses: number) =>
  accesses > 0 ? `${((sales / accesses) * 100).toFixed(1)}%` : "—";

// Conversão entra só no tooltip: como % num gráfico de contagens/reais, uma
// quarta linha ficaria ilegível em qualquer um dos dois eixos.
const ChartTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: DailyMetric }[] }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows = [
    { label: "Acessos", value: point.accesses.toString(), color: ACCESS_COLOR },
    { label: "Vendas", value: point.sales.toString(), color: SALES_COLOR },
    { label: "Receita", value: `R$ ${formatCurrency(point.revenue)}`, color: REVENUE_COLOR },
    { label: "Conversão", value: conversionRate(point.sales, point.accesses), color: null },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md">
      <p className="text-sm font-semibold mb-2">{point.label}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              {row.color && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
              )}
              {row.label}
            </span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function RevenueChart({ data, loading }: RevenueChartProps) {
  const [days, setDays] = useState<7 | 30>(7);
  const visibleData = data.slice(-days);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-xl">Acessos × vendas × receita</CardTitle>
          <p className="text-xs text-muted-foreground">Hoje: dados parciais</p>
        </div>
        <div className="flex gap-2">
          {([7, 30] as const).map((option) => (
            <Button
              key={option}
              variant={days === option ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(option)}
            >
              {option} dias
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[320px] flex items-center justify-center">
            <p className="text-muted-foreground">Carregando dados...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={visibleData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                yAxisId="left"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                width={72}
                tickFormatter={(value) => `R$ ${formatCurrency(Number(value))}`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="accesses"
                name="Acessos"
                stroke={ACCESS_COLOR}
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="sales"
                name="Vendas"
                stroke={SALES_COLOR}
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                name="Receita"
                stroke={REVENUE_COLOR}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
