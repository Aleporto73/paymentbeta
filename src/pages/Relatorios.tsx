import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3, ShoppingCart, TrendingUp, TrendingDown, Package, Users, CalendarIcon } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { format, subDays, addDays, startOfDay, endOfDay } from "date-fns";
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
type ReportsTabValue = "checkout" | "sales" | "products" | "order-bumps" | "comparativos";
type ReportsTabParam = "checkout" | "vendas" | "produtos" | "order-bumps" | "comparativos";
type ReconciliationStatusKey = "pending" | "partial" | "reconciled" | "divergent" | "not_applicable";

const TAB_PARAM_TO_VALUE: Record<ReportsTabParam, ReportsTabValue> = {
  checkout: "checkout",
  vendas: "sales",
  produtos: "products",
  "order-bumps": "order-bumps",
  comparativos: "comparativos",
};

const TAB_VALUE_TO_PARAM: Record<ReportsTabValue, ReportsTabParam> = {
  checkout: "checkout",
  sales: "vendas",
  products: "produtos",
  "order-bumps": "order-bumps",
  comparativos: "comparativos",
};

const getReportsTabValue = (tab: string | null): ReportsTabValue => {
  if (tab && Object.prototype.hasOwnProperty.call(TAB_PARAM_TO_VALUE, tab)) {
    return TAB_PARAM_TO_VALUE[tab as ReportsTabParam];
  }

  return "checkout";
};

const getReportsTabParam = (value: string): ReportsTabParam => {
  if (Object.prototype.hasOwnProperty.call(TAB_VALUE_TO_PARAM, value)) {
    return TAB_VALUE_TO_PARAM[value as ReportsTabValue];
  }

  return "checkout";
};

const isDateFilter = (period: string | null): period is DateFilter =>
  period === "today" || period === "7days" || period === "30days" || period === "custom";

const getDateFilterParam = (period: string | null): DateFilter => {
  return isDateFilter(period) ? period : "30days";
};

const parseDateParam = (value: string | null): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }

  return date;
};

const getDateStateFromParams = (params: URLSearchParams) => {
  const period = getDateFilterParam(params.get("period"));

  if (period !== "custom") {
    return {
      dateFilter: period,
      customDateFrom: undefined,
      customDateTo: undefined,
    };
  }

  const startParam = params.get("start");
  const endParam = params.get("end");
  const customDateFrom = parseDateParam(startParam);
  const customDateTo = parseDateParam(endParam);

  if ((startParam && !customDateFrom) || (endParam && !customDateTo)) {
    return {
      dateFilter: "30days" as DateFilter,
      customDateFrom: undefined,
      customDateTo: undefined,
    };
  }

  if (!customDateFrom && !customDateTo) {
    return {
      dateFilter: "30days" as DateFilter,
      customDateFrom: undefined,
      customDateTo: undefined,
    };
  }

  return {
    dateFilter: "custom" as DateFilter,
    customDateFrom,
    customDateTo,
  };
};

const APPROVED_TRANSACTION_STATUSES = ["RECEIVED", "CONFIRMED"];
// Lista fixa das afiliadas reais para o comparativo "Minhas vendas vs Afiliadas".
// Contas de teste (ex.: "Ana teste", "teste 2") ficam de fora de propósito.
const AFFILIATE_REPORT_NAMES = ["Jayane", "Lívia Tadesco", "Laís Sant Anna"];
const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatusKey, string> = {
  pending: "Pendente",
  partial: "Parcial",
  reconciled: "Conciliado",
  divergent: "Divergente",
  not_applicable: "Não aplicável",
};

interface ReportTransaction {
  id: string;
  asaas_payment_id: string | null;
  value: number | null;
  order_bumps_amount: number | null;
  order_bumps_selected: string[] | null;
  asaas_fee_amount: number | null;
  affiliate_split_total: number | null;
  reconciliation_status: string | null;
  status: string;
  created_at: string;
}

interface ReportSale {
  sale_amount: number | null;
  commission_amount: number | null;
  sale_date: string;
  affiliate_link_id: string | null;
  products: { name: string } | null;
  product_affiliate_links: { affiliates: { name: string } | null } | null;
}

interface ReportSplit {
  id: string;
  transaction_id: string | null;
  asaas_payment_id: string | null;
  planned_amount: number | null;
  received_amount: number | null;
}

const createEmptyReconciliationCounts = () => ({
  pending: 0,
  partial: 0,
  reconciled: 0,
  divergent: 0,
  not_applicable: 0,
});

const getNumberOrNull = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const sumMoney = (values: Array<number | null | undefined>) => {
  const validValues = values
    .map(getNumberOrNull)
    .filter((value): value is number => value !== null);

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0);
};

const formatMoneyOrDash = (value?: number | null) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? `R$ ${formatCurrency(parsedValue)}` : "—";
};

export default function Relatorios() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getReportsTabValue(searchParams.get("tab"));
  const { dateFilter, customDateFrom, customDateTo } = getDateStateFromParams(searchParams);
  const [loading, setLoading] = useState(true);

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
    totalCommissions: null as number | null,
    averageTicket: 0,
  });
  const [reconciliationStats, setReconciliationStats] = useState({
    revenueCharged: 0,
    asaasFeesEstimated: null as number | null,
    grossEstimatedCommission: null as number | null,
    splitPlanned: null as number | null,
    splitReceived: null as number | null,
    statuses: createEmptyReconciliationCounts(),
  });
  const [productsPerformance, setProductsPerformance] = useState<any[]>([]);
  const [checkoutFunnel, setCheckoutFunnel] = useState<any[]>([]);
  const [orderBumpsPerformance, setOrderBumpsPerformance] = useState<any[]>([]);
  const [affiliateComparison, setAffiliateComparison] = useState<{ name: string; value: number }[]>([]);
  const [dailyEvolution, setDailyEvolution] = useState<{ date: string; total: number }[]>([]);

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

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      // product_sales.sale_date vem do Asaas como data pura (sem hora) e é
      // gravado à meia-noite UTC representando o dia local. Comparar contra
      // um instante UTC exato (ex.: 03:00 UTC = meia-noite em Brasília) faz
      // as vendas de "hoje" (00:00 UTC) ficarem fora do filtro "Hoje". Aqui
      // comparamos por data-calendário pura (yyyy-MM-dd), não por instante.
      saleDateStart: format(startDate, "yyyy-MM-dd"),
      saleDateEnd: format(endDate, "yyyy-MM-dd"),
    };
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateFilter, customDateFrom, customDateTo]);

  const fetchAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { startDate, endDate, saleDateStart, saleDateEnd } = getDateRange();

      // Buscar eventos do checkout
      const { data: checkoutEvents } = await supabase
        .from("checkout_events")
        .select("*")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: false });

      const checkoutEventList = checkoutEvents || [];
      const views = checkoutEventList.filter((e) => e.event_type === "view").length;
      const abandons = checkoutEventList.filter((e) => e.event_type === "abandon").length;

      const { data: transactionRows } = await supabase
        .from("transactions")
        .select(`
          id,
          asaas_payment_id,
          value,
          order_bumps_amount,
          order_bumps_selected,
          asaas_fee_amount,
          affiliate_split_total,
          reconciliation_status,
          status,
          created_at
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      const transactionList = (transactionRows || []) as ReportTransaction[];
      const approvedTransactionList = transactionList.filter((transaction) =>
        APPROVED_TRANSACTION_STATUSES.includes(transaction.status)
      );
      const approvedTransactionIds = approvedTransactionList.map((transaction) => transaction.id);
      const approvedAsaasPaymentIds = approvedTransactionList
        .map((transaction) => transaction.asaas_payment_id)
        .filter((paymentId): paymentId is string => Boolean(paymentId));
      const splitRowsByKey = new Map<string, ReportSplit[]>();

      const appendSplitRows = (rows: ReportSplit[] | null) => {
        (rows || []).forEach((split) => {
          const keys = [
            split.transaction_id ? `transaction:${split.transaction_id}` : null,
            split.asaas_payment_id ? `asaas:${split.asaas_payment_id}` : null,
          ].filter(Boolean) as string[];

          keys.forEach((key) => {
            const currentRows = splitRowsByKey.get(key) || [];
            if (!currentRows.some((row) => row.id === split.id)) {
              currentRows.push(split);
            }
            splitRowsByKey.set(key, currentRows);
          });
        });
      };

      if (approvedTransactionIds.length > 0) {
        const { data: splitRowsByTransaction } = await supabase
          .from("transaction_splits")
          .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount")
          .in("transaction_id", approvedTransactionIds);

        appendSplitRows((splitRowsByTransaction || []) as ReportSplit[]);
      }

      if (approvedAsaasPaymentIds.length > 0) {
        const { data: splitRowsByPayment } = await supabase
          .from("transaction_splits")
          .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount")
          .in("asaas_payment_id", approvedAsaasPaymentIds);

        appendSplitRows((splitRowsByPayment || []) as ReportSplit[]);
      }

      const getSplitsForTransaction = (transaction: ReportTransaction) => {
        const byTransaction = splitRowsByKey.get(`transaction:${transaction.id}`) || [];
        const byPayment = transaction.asaas_payment_id
          ? splitRowsByKey.get(`asaas:${transaction.asaas_payment_id}`) || []
          : [];
        const splitMap = new Map<string, ReportSplit>();

        [...byTransaction, ...byPayment].forEach((split) => {
          splitMap.set(split.id, split);
        });

        return Array.from(splitMap.values());
      };

      const getTransactionSplitPlannedAmount = (transaction: ReportTransaction) => {
        const transactionPlannedAmount = getNumberOrNull(transaction.affiliate_split_total);

        if (transactionPlannedAmount !== null) {
          return transactionPlannedAmount;
        }

        return sumMoney(getSplitsForTransaction(transaction).map((split) => split.planned_amount));
      };

      const getTransactionSplitReceivedAmount = (transaction: ReportTransaction) =>
        sumMoney(getSplitsForTransaction(transaction).map((split) => split.received_amount));

      const conversions = approvedTransactionList.length;
      const totalRevenue = approvedTransactionList.reduce(
        (sum, transaction) => sum + Number(transaction.value || 0),
        0
      );
      const orderBumpsRevenue = approvedTransactionList.reduce(
        (sum, transaction) => sum + Number(transaction.order_bumps_amount || 0),
        0
      );
      const conversionsWithOrderBumps = approvedTransactionList.filter(
        (transaction) =>
          Number(transaction.order_bumps_amount || 0) > 0 ||
          (transaction.order_bumps_selected?.length || 0) > 0
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

      // Buscar vendas — inclui produto e afiliada vinculados para alimentar
      // os comparativos, sempre respeitando o mesmo range de data (startDate/endDate).
      const { data: sales } = await supabase
        .from("product_sales")
        .select(`
          sale_amount,
          commission_amount,
          sale_date,
          affiliate_link_id,
          products ( name ),
          product_affiliate_links ( affiliates ( name ) )
        `)
        .gte("sale_date", saleDateStart)
        .lte("sale_date", saleDateEnd)
        .order("sale_date", { ascending: false });

      const salesList = (sales || []) as unknown as ReportSale[];
      const salesRevenue = salesList.reduce((sum, sale) => sum + Number(sale.sale_amount || 0), 0);
      const grossEstimatedCommission = sumMoney(salesList.map((sale) => sale.commission_amount));
      const reconciliationCounts = transactionList.reduce(
        (counts, transaction) => {
          const status = transaction.reconciliation_status || "pending";
          if (status in counts) {
            counts[status as ReconciliationStatusKey] += 1;
          }
          return counts;
        },
        createEmptyReconciliationCounts(),
      );

      setSalesStats({
        totalSales: salesList.length,
        totalRevenue: salesRevenue,
        totalCommissions: grossEstimatedCommission,
        averageTicket: salesList.length > 0 ? salesRevenue / salesList.length : 0,
      });

      setReconciliationStats({
        revenueCharged: totalRevenue,
        asaasFeesEstimated: sumMoney(approvedTransactionList.map((transaction) => transaction.asaas_fee_amount)),
        grossEstimatedCommission,
        splitPlanned: sumMoney(approvedTransactionList.map(getTransactionSplitPlannedAmount)),
        splitReceived: sumMoney(approvedTransactionList.map(getTransactionSplitReceivedAmount)),
        statuses: reconciliationCounts,
      });

      // Performance por produto — agora respeita o período selecionado
      // (antes buscava o histórico inteiro, ignorando o filtro de data).
      const productPerformanceMap = new Map<string, { name: string; sales: number; revenue: number }>();
      salesList.forEach((sale) => {
        const productName = sale.products?.name || "Produto não encontrado";
        const current = productPerformanceMap.get(productName) || { name: productName, sales: 0, revenue: 0 };
        current.sales += 1;
        current.revenue += Number(sale.sale_amount || 0);
        productPerformanceMap.set(productName, current);
      });
      setProductsPerformance(Array.from(productPerformanceMap.values()));

      // Minhas vendas (diretas) vs cada afiliada real — só valor R$.
      // Vendas de contas de teste (fora de AFFILIATE_REPORT_NAMES) não entram aqui.
      const affiliateRevenue = new Map<string, number>();
      AFFILIATE_REPORT_NAMES.forEach((name) => affiliateRevenue.set(name, 0));
      let directRevenue = 0;

      salesList.forEach((sale) => {
        if (!sale.affiliate_link_id) {
          directRevenue += Number(sale.sale_amount || 0);
          return;
        }
        const affiliateName = sale.product_affiliate_links?.affiliates?.name;
        if (affiliateName && affiliateRevenue.has(affiliateName)) {
          affiliateRevenue.set(affiliateName, (affiliateRevenue.get(affiliateName) || 0) + Number(sale.sale_amount || 0));
        }
      });

      setAffiliateComparison([
        { name: "Minhas vendas", value: directRevenue },
        ...AFFILIATE_REPORT_NAMES.map((name) => ({ name, value: affiliateRevenue.get(name) || 0 })),
      ]);

      // Evolução diária de vendas totais dentro do período selecionado
      // (preenche com 0 os dias sem venda para a linha não ficar com buracos).
      const dayBuckets = new Map<string, number>();
      const rangeEnd = startOfDay(new Date(endDate));
      for (let cursor = startOfDay(new Date(startDate)); cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
        dayBuckets.set(format(cursor, "dd/MM"), 0);
      }
      salesList.forEach((sale) => {
        const dayKey = format(new Date(sale.sale_date), "dd/MM");
        if (dayBuckets.has(dayKey)) {
          dayBuckets.set(dayKey, (dayBuckets.get(dayKey) || 0) + Number(sale.sale_amount || 0));
        }
      });
      setDailyEvolution(Array.from(dayBuckets.entries()).map(([date, total]) => ({ date, total })));

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
  const handleTabChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", getReportsTabParam(value));
    setSearchParams(nextParams);
  };
  const handleDateFilterChange = (period: DateFilter, start?: Date, end?: Date) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("period", period);

    if (period === "custom") {
      if (start) {
        nextParams.set("start", format(start, "yyyy-MM-dd"));
      } else {
        nextParams.delete("start");
      }

      if (end) {
        nextParams.set("end", format(end, "yyyy-MM-dd"));
      } else {
        nextParams.delete("end");
      }
    } else {
      nextParams.delete("start");
      nextParams.delete("end");
    }

    setSearchParams(nextParams);
  };
  const reconciliationTotal = Object.values(reconciliationStats.statuses).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Relatórios e Analytics</h1>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={dateFilter === "today" ? "default" : "outline"}
            size="sm"
            onClick={() => handleDateFilterChange("today")}
          >
            Hoje
          </Button>
          <Button
            variant={dateFilter === "7days" ? "default" : "outline"}
            size="sm"
            onClick={() => handleDateFilterChange("7days")}
          >
            Últimos 7 dias
          </Button>
          <Button
            variant={dateFilter === "30days" ? "default" : "outline"}
            size="sm"
            onClick={() => handleDateFilterChange("30days")}
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
                      handleDateFilterChange("custom", date, customDateTo);
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
                      handleDateFilterChange("custom", customDateFrom, date);
                    }}
                    className={cn("pointer-events-auto")}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="order-bumps">Order Bumps</TabsTrigger>
          <TabsTrigger value="comparativos">Comparativos</TabsTrigger>
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
                <CardTitle className="text-sm font-medium">Receita cobrada</CardTitle>
                <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {formatCurrency(checkoutStats.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Valor cobrado do cliente no checkout</p>
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
                <CardTitle className="text-sm font-medium">Receita cobrada</CardTitle>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {formatCurrency(salesStats.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Valor cobrado nas vendas</p>
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
                <CardTitle className="text-sm font-medium">Comissão bruta estimada</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatMoneyOrDash(salesStats.totalCommissions)}</div>
                <p className="text-xs text-muted-foreground mt-1">Não representa Split recebido Asaas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Conciliação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Taxas Asaas estimadas</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoneyOrDash(reconciliationStats.asaasFeesEstimated)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Receita cobrada: R$ {formatCurrency(reconciliationStats.revenueCharged)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Comissão bruta estimada: {formatMoneyOrDash(reconciliationStats.grossEstimatedCommission)}
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Split planejado</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoneyOrDash(reconciliationStats.splitPlanned)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Split recebido Asaas: {formatMoneyOrDash(reconciliationStats.splitReceived)}
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Conciliação</p>
                  <p className="mt-1 text-2xl font-bold">{reconciliationTotal} registros</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {(Object.entries(RECONCILIATION_STATUS_LABELS) as Array<[ReconciliationStatusKey, string]>).map(
                      ([status, label]) => (
                        <div key={status} className="flex items-center justify-between gap-2">
                          <span>{label}</span>
                          <span className="font-medium text-foreground">
                            {reconciliationStats.statuses[status]}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
                    <YAxis yAxisId="sales" />
                    <YAxis
                      yAxisId="revenue"
                      orientation="right"
                      tickFormatter={(value) => `R$ ${formatCurrency(Number(value))}`}
                    />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "Vendas"
                          ? [Number(value).toLocaleString("pt-BR"), "Vendas"]
                          : [`R$ ${formatCurrency(Number(value))}`, name]
                      }
                    />
                    <Legend />
                    <Bar yAxisId="sales" dataKey="sales" fill="#3b82f6" name="Vendas" />
                    <Bar yAxisId="revenue" dataKey="revenue" fill="#10b981" name="Receita cobrada (R$)" />
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
                          <p className="text-sm font-medium">R$ {formatCurrency(Number(bump.revenue))}</p>
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

        {/* Comparativos: minhas vendas vs afiliadas, produtos e evolução diária */}
        <TabsContent value="comparativos" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Minhas vendas vs Afiliadas</CardTitle>
              </CardHeader>
              <CardContent>
                {affiliateComparison.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={affiliateComparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => `R$ ${formatCurrency(Number(value))}`} />
                      <Tooltip formatter={(value) => [`R$ ${formatCurrency(Number(value))}`, "Receita cobrada"]} />
                      <Bar dataKey="value" fill="#3b82f6" name="Receita cobrada (R$)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhum dado disponível no período
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comparação entre Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                {productsPerformance.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={productsPerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis yAxisId="sales" />
                      <YAxis
                        yAxisId="revenue"
                        orientation="right"
                        tickFormatter={(value) => `R$ ${formatCurrency(Number(value))}`}
                      />
                      <Tooltip
                        formatter={(value, name) =>
                          name === "Vendas"
                            ? [Number(value).toLocaleString("pt-BR"), "Vendas"]
                            : [`R$ ${formatCurrency(Number(value))}`, name]
                        }
                      />
                      <Legend />
                      <Bar yAxisId="sales" dataKey="sales" fill="#3b82f6" name="Vendas" />
                      <Bar yAxisId="revenue" dataKey="revenue" fill="#10b981" name="Receita cobrada (R$)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Nenhum dado de produtos disponível
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Evolução diária de vendas</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyEvolution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyEvolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value) => `R$ ${formatCurrency(Number(value))}`} />
                    <Tooltip formatter={(value) => [`R$ ${formatCurrency(Number(value))}`, "Vendas totais"]} />
                    <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} name="Vendas totais" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum dado disponível no período
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
