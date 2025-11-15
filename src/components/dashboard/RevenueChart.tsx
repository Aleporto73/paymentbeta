import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Dados diários do mês atual (exemplo com 30 dias)
const data = [
  { name: "1", revenue: 3200 },
  { name: "2", revenue: 4100 },
  { name: "3", revenue: 3800 },
  { name: "4", revenue: 4500 },
  { name: "5", revenue: 5200 },
  { name: "6", revenue: 4800 },
  { name: "7", revenue: 6100 },
  { name: "8", revenue: 5500 },
  { name: "9", revenue: 4900 },
  { name: "10", revenue: 5800 },
  { name: "11", revenue: 6200 },
  { name: "12", revenue: 5600 },
  { name: "13", revenue: 6800 },
  { name: "14", revenue: 7100 },
  { name: "15", revenue: 6500 },
  { name: "16", revenue: 7400 },
  { name: "17", revenue: 6900 },
  { name: "18", revenue: 7800 },
  { name: "19", revenue: 8200 },
  { name: "20", revenue: 7600 },
  { name: "21", revenue: 8500 },
  { name: "22", revenue: 9100 },
  { name: "23", revenue: 8800 },
  { name: "24", revenue: 9500 },
  { name: "25", revenue: 10200 },
  { name: "26", revenue: 9800 },
  { name: "27", revenue: 10800 },
  { name: "28", revenue: 11200 },
  { name: "29", revenue: 10500 },
  { name: "30", revenue: 12300 },
];

export function RevenueChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Faturamento do mês</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0}/>
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
              tickFormatter={(value) => `R$ ${value / 1000}k`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, "Faturamento"]}
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
      </CardContent>
    </Card>
  );
}
