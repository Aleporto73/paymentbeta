import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "Jan", revenue: 4000 },
  { name: "Fev", revenue: 5200 },
  { name: "Mar", revenue: 4800 },
  { name: "Abr", revenue: 6300 },
  { name: "Mai", revenue: 7100 },
  { name: "Jun", revenue: 6800 },
  { name: "Jul", revenue: 8200 },
  { name: "Ago", revenue: 9100 },
  { name: "Set", revenue: 8800 },
  { name: "Out", revenue: 10200 },
  { name: "Nov", revenue: 11500 },
  { name: "Dez", revenue: 12300 },
];

export function RevenueChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Faturamento Mensal</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
