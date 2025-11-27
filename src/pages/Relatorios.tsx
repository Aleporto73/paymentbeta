import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3, ShoppingCart, TrendingUp, TrendingDown, Package, Users, CalendarIcon } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type DateFilter = "today" | "7days" | "30days" | "custom";

export default function Relatorios() {
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("30days");
  const [customDateFrom, setCustomDateFrom] = useState<Date>();
  const [customDateTo, setCustomDateTo] = useState<Date>();
  
  const [checkoutStats, setCheckoutStats] = useState({
    totalViews: 0,
    totalAbandons: 0,
    totalConversions: 0,
    conversionRate: 0,
    abandonRate: 0,
    totalRevenue: 0,
    orderBumpsRevenue: 0,
    orderBumpsConversionRate: 0,
  });
  const [salesStats, setSalesStats] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalCommissions: 0,
    averageTicket: 0,
  });
  const [productsPerformance, setProductsPerformance] = useState<any[]>([]);
  const [checkoutFunnel, setCheckoutFunnel] = useState<any[]>([]);
  const [orderBumpsPerformance, setOrderBumpsPerformance] = useState<any[]>([]);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = endOfDay(now);

    switch (dateFilter) {
      case "today":
        startDate = startOfDay(now);
        break;
      case "7days":
        startDate = startOfDay(subDays(now, 7));
        break;
      case "30days":
        startDate = startOfDay(subDays(now, 30));
        break;
      case "custom":
        startDate = customDateFrom ? startOfDay(customDateFrom) : startOfDay(subDays(now, 30));
        endDate = customDateTo ? endOfDay(customDateTo) : endOfDay(now);
        break;
      default:
        startDate = startOfDay(subDays(now, 30));
    }

    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateFilter, customDateFrom, customDateTo]);

  const fetchAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { startDate, endDate } = getDateRange();

      // Buscar eventos do checkout
      const { data: checkoutEvents } = await supabase
        .from("checkout_events")
        .select("*")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: false });

      if (checkoutEvents) {
        const views = checkoutEvents.filter((e) => e.event_type === "view").length;
        const abandons = checkoutEvents.filter((e) => e.event_type === "abandon").length;
        
        // Only count conversions from approved transactions
        const { data: approvedTransactions } = await supabase
          .from("transactions")
          .select("asaas_payment_id")
          .in("status", ["CONFIRMED", "RECEIVED"])
          .gte("created_at", startDate)
          .lte("created_at", endDate);
        
        const approvedPaymentIds = approvedTransactions?.map(t => t.asaas_payment_id) || [];
        const conversions = checkoutEvents.filter((e) => 
          e.event_type === "conversion" && approvedPaymentIds.includes(e.session_id)
        ).length;

        const totalRevenue = checkoutEvents
          .filter((e) => e.event_type === "conversion" && approvedPaymentIds.includes(e.session_id))
          .reduce((sum, e) => sum + Number(e.total_amount || 0), 0);

        const orderBumpsRevenue = checkoutEvents
          .filter((e) => e.event_type === "conversion" && approvedPaymentIds.includes(e.session_id))
          .reduce((sum, e) => sum + Number(e.order_bumps_amount || 0), 0);

        const conversionsWithOrderBumps = checkoutEvents.filter(
          (e) => e.event_type === "conversion" && e.order_bumps_selected && e.order_bumps_selected.length > 0
        ).length;

        setCheckoutStats({
          totalViews: views,
          totalAbandons: abandons,
          totalConversions: conversions,
          conversionRate: views > 0 ? (conversions / views) * 100 : 0,
          abandonRate: views > 0 ? (abandons / views) * 100 : 0,
          totalRevenue,
          orderBumpsRevenue,
          orderBumpsConversionRate: conversions > 0 ? (conversionsWithOrderBumps / conversions) * 100 : 0,
        });

        // Funil de conversão
        setCheckoutFunnel([
          { name: "Visualizações", value: views, fill: "#3b82f6" },
          { name: "Conversões", value: conversions, fill: "#10b981" },
          { name: "Abandonos", value: abandons, fill: "#ef4444" },
        ]);
      }

      // Buscar vendas
      const { data: sales } = await supabase
        .from("product_sales")
        .select("*")
        .gte("sale_date", startDate)
        .lte("sale_date", endDate)
        .order("sale_date", { ascending: false });

      if (sales) {
        const totalRevenue = sales.reduce((sum, s) => sum + Number(s.sale_amount), 0);
        const totalCommissions = sales.reduce((sum, s) => sum + Number(s.commission_amount || 0), 0);

        setSalesStats({
          totalSales: sales.length,
          totalRevenue,
          totalCommissions,
          averageTicket: sales.length > 0 ? totalRevenue / sales.length : 0,
        });
      }

      // Buscar produtos com suas vendas
      const { data: products } = await supabase
        .from("products")
        .select("*, product_sales(*)");

      if (products) {
        const performance = products.map((product) => ({
          name: product.name,
          sales: product.product_sales?.length || 0,
          revenue: product.product_sales?.reduce((sum: number, s: any) => sum + Number(s.sale_amount), 0) || 0,
        }));
        setProductsPerformance(performance);
      }

      // Buscar performance de order bumps
      const { data: orderBumpAnalytics } = await supabase
        .from("product_order_bump_analytics")
        .select("*, product_order_bumps(title)")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: false });

      if (orderBumpAnalytics) {
        const bumpStats = orderBumpAnalytics.reduce((acc: any, item) => {
          const title = (item.product_order_bumps as any)?.title || "Unknown";
          if (!acc[title]) {
            acc[title] = { name: title, views: 0, conversions: 0, revenue: 0 };
          }
          if (item.event_type === "view") acc[title].views++;
          if (item.event_type === "conversion") {
            acc[title].conversions++;
            acc[title].revenue += Number(item.revenue_generated || 0);
          }
          return acc;
        }, {});

        setOrderBumpsPerformance(Object.values(bumpStats));
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  const COLORS = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Relatórios e Analytics</h1>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={dateFilter === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateFilter("today")}
          >
            Hoje
          </Button>
          <Button
            variant={dateFilter === "7days" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateFilter("7days")}
          >
            Últimos 7 dias
          </Button>
          <Button
            variant={dateFilter === "30days" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateFilter("30days")}
          >
            Últimos 30 dias
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={dateFilter === "custom" ? "default" : "outline"}
                size="sm"
                className={cn("justify-start text-left font-normal")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFilter === "custom" && customDateFrom && customDateTo
                  ? `${format(customDateFrom, "dd/MM")} - ${format(customDateTo, "dd/MM")}`
                  : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data inicial</label>
                  <Calendar
                    mode="single"
                    selected={customDateFrom}
                    onSelect={(date) => {
                      setCustomDateFrom(date);
                      setDateFilter("custom");
                    }}
                    className={cn("pointer-events-auto")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data final</label>
                  <Calendar
                    mode="single"
                    selected={customDateTo}
                    onSelect={(date) => {
                      setCustomDateTo(date);
                      setDateFilter("custom");
                    }}
                    className={cn("pointer-events-auto")}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs defaultValue="checkout" className="space-y-6">
        <TabsList>
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="order-bumps">Order Bumps</TabsTrigger>
        </TabsList>

        {/* Checkout Analytics */}
        <TabsContent value="checkout" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Visualizações</CardTitle>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{checkoutStats.totalViews}</div>
                <p className="text-xs text-muted-foreground mt-1">Total de acessos ao checkout</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{checkoutStats.conversionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {checkoutStats.totalConversions} conversões
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Abandono</CardTitle>
                <TrendingDown className="w-4 h-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{checkoutStats.abandonRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {checkoutStats.totalAbandons} abandonos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {formatCurrency(checkoutStats.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Receita gerada no checkout</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Funil de Conversão</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={checkoutFunnel}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {checkoutFunnel.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Bumps Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                    <p className="text-2xl font-bold">{checkoutStats.orderBumpsConversionRate.toFixed(1)}%</p>
                  </div>
                  <Package className="w-8 h-8 text-primary" />
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Receita de Order Bumps</p>
                    <p className="text-2xl font-bold">R$ {formatCurrency(checkoutStats.orderBumpsRevenue)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sales Analytics */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total de Vendas</CardTitle>
                <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesStats.totalSales}</div>
                <p className="text-xs text-muted-foreground mt-1">Vendas realizadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {formatCurrency(salesStats.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Valor total arrecadado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {formatCurrency(salesStats.averageTicket)}</div>
                <p className="text-xs text-muted-foreground mt-1">Valor médio por venda</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {formatCurrency(salesStats.totalCommissions)}</div>
                <p className="text-xs text-muted-foreground mt-1">Total em comissões</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Products Performance */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance por Produto</CardTitle>
            </CardHeader>
            <CardContent>
              {productsPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={productsPerformance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="sales" fill="#3b82f6" name="Vendas" />
                    <Bar dataKey="revenue" fill="#10b981" name="Receita (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum dado de produtos disponível
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Order Bumps Performance */}
        <TabsContent value="order-bumps" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Efetividade dos Order Bumps</CardTitle>
            </CardHeader>
            <CardContent>
              {orderBumpsPerformance.length > 0 ? (
                <div className="space-y-4">
                  {orderBumpsPerformance.map((bump: any, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">{bump.name}</h3>
                        <span className="text-sm text-muted-foreground">
                          {bump.views > 0 ? ((bump.conversions / bump.views) * 100).toFixed(1) : 0}% conversão
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Visualizações</p>
                          <p className="text-lg font-bold">{bump.views}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversões</p>
                          <p className="text-lg font-bold">{bump.conversions}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Receita</p>
                          <p className="text-sm font-medium">R$ {Number(bump.revenue).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum dado de order bumps disponível
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
