import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, Percent, TrendingUp, Users } from "lucide-react";
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

type MetricKey = "revenue" | "sales" | "commission" | "visits" | "conversion";
type ReconciliationStatusKey = "pending" | "partial" | "reconciled" | "divergent" | "not_applicable";

interface AffiliateRow {
  id: string;
  name: string;
  is_active: boolean | null;
}

interface AffiliateLinkRow {
  id: string;
  affiliate_id: string | null;
  affiliates?: AffiliateRow | AffiliateRow[] | null;
}

interface ProductSaleRow {
  id: string;
  affiliate_link_id: string | null;
  transaction_id: string | null;
  asaas_payment_id: string | null;
  sale_date: string;
  sale_amount: number | null;
  commission_amount: number | null;
  product_affiliate_links?: AffiliateLinkRow | AffiliateLinkRow[] | null;
}

interface AffiliateTransactionRow {
  id: string;
  asaas_payment_id: string | null;
  affiliate_split_total: number | null;
  reconciliation_status: string | null;
}

interface AffiliateSplitRow {
  id: string;
  transaction_id: string | null;
  asaas_payment_id: string | null;
  planned_amount: number | null;
  received_amount: number | null;
}

interface CheckoutEventRow {
  affiliate_code: string | null;
  created_at: string;
  session_id: string | null;
}

interface DailyMetrics {
  revenue: number;
  sales: number;
  commission: number;
  visits: number;
  conversion: number;
}

interface AffiliateSummary {
  id: string;
  name: string;
  isActive: boolean;
  revenue: number;
  sales: number;
  commission: number | null;
  splitPlanned: number | null;
  splitReceived: number | null;
  reconciliation: Record<ReconciliationStatusKey, number>;
  visits: number;
  conversion: number;
  daily: Record<string, DailyMetrics>;
}

interface AnalyticsData {
  activeAffiliates: number;
  summaries: AffiliateSummary[];
  totalRevenue: number;
  totalCommission: number | null;
  totalSales: number;
  totalVisits: number;
  averageConversion: number;
}

const chartColors = [
  "hsl(var(--primary))",
  "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(0, 72%, 51%)",
];

const metricOptions: Record<MetricKey, { label: string; kind: "currency" | "number" | "percent" }> = {
  revenue: { label: "Receita cobrada", kind: "currency" },
  sales: { label: "Vendas", kind: "number" },
  commission: { label: "Comissão bruta estimada", kind: "currency" },
  visits: { label: "Visitas ao checkout", kind: "number" },
  conversion: { label: "Conversão estimada", kind: "percent" },
};

const reconciliationStatusLabels: Record<ReconciliationStatusKey, string> = {
  pending: "Pendente",
  partial: "Parcial",
  reconciled: "Conciliado",
  divergent: "Divergente",
  not_applicable: "Não aplicável",
};

const reconciliationBadgeVariants: Record<
  ReconciliationStatusKey,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  partial: "outline",
  reconciled: "default",
  divergent: "destructive",
  not_applicable: "secondary",
};

const emptyAnalytics: AnalyticsData = {
  activeAffiliates: 0,
  summaries: [],
  totalRevenue: 0,
  totalCommission: null,
  totalSales: 0,
  totalVisits: 0,
  averageConversion: 0,
};

function getRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function createEmptyReconciliationCounts() {
  return {
    pending: 0,
    partial: 0,
    reconciled: 0,
    divergent: 0,
    not_applicable: 0,
  };
}

function getReconciliationStatus(status?: string | null): ReconciliationStatusKey {
  return status && status in reconciliationStatusLabels ? (status as ReconciliationStatusKey) : "pending";
}

function getNumberOrNull(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function sumMoney(values: Array<number | null | undefined>) {
  const validValues = values
    .map(getNumberOrNull)
    .filter((value): value is number => value !== null);

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0);
}

function addNullableMoney(current: number | null, value: number | null) {
  if (value === null) {
    return current;
  }

  return (current ?? 0) + value;
}

function formatMetric(value: number, kind: "currency" | "number" | "percent") {
  if (kind === "currency") {
    return `R$ ${formatCurrency(value)}`;
  }

  if (kind === "percent") {
    return formatPercent(value);
  }

  return value.toLocaleString("pt-BR");
}

function formatMoneyOrDash(value?: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? `R$ ${formatCurrency(parsedValue)}` : "—";
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function createDailyMetrics(dayKeys: string[]) {
  return dayKeys.reduce<Record<string, DailyMetrics>>((acc, dayKey) => {
    acc[dayKey] = {
      revenue: 0,
      sales: 0,
      commission: null,
      visits: 0,
      conversion: 0,
    };
    return acc;
  }, {});
}

export function AffiliateAnalytics() {
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [analytics, setAnalytics] = useState<AnalyticsData>(emptyAnalytics);
  const [loading, setLoading] = useState(true);

  const period = useMemo(() => {
    const today = startOfDay(new Date());
    const start = startOfDay(subDays(today, 29));
    const days = eachDayOfInterval({ start, end: today }).map((date) => ({
      key: format(date, "yyyy-MM-dd"),
      label: format(date, "dd/MM", { locale: ptBR }),
    }));

    return {
      start,
      end: new Date(),
      days,
      dayKeys: days.map((day) => day.key),
    };
  }, []);

  useEffect(() => {
    fetchAffiliateAnalytics();
  }, []);

  const ensureSummary = (
    summaries: Map<string, AffiliateSummary>,
    affiliate: { id: string; name: string; isActive: boolean },
  ) => {
    const existing = summaries.get(affiliate.id);
    if (existing) {
      existing.name = affiliate.name || existing.name;
      existing.isActive = existing.isActive || affiliate.isActive;
      return existing;
    }

    const summary: AffiliateSummary = {
      id: affiliate.id,
      name: affiliate.name || "Afiliada sem nome",
      isActive: affiliate.isActive,
      revenue: 0,
      sales: 0,
      commission: 0,
      splitPlanned: null,
      splitReceived: null,
      reconciliation: createEmptyReconciliationCounts(),
      visits: 0,
      conversion: 0,
      daily: createDailyMetrics(period.dayKeys),
    };

    summaries.set(affiliate.id, summary);
    return summary;
  };

  const fetchAffiliateAnalytics = async () => {
    setLoading(true);

    try {
      const [{ data: affiliatesData, error: affiliatesError }, { data: linksData, error: linksError }] =
        await Promise.all([
          supabase.from("affiliates").select("id, name, is_active"),
          supabase
            .from("product_affiliate_links")
            .select("id, affiliate_id, affiliates(id, name, is_active)")
            .not("affiliate_id", "is", null),
        ]);

      if (affiliatesError) throw affiliatesError;
      if (linksError) throw linksError;

      const summaries = new Map<string, AffiliateSummary>();
      const linkToAffiliate = new Map<string, { id: string; name: string; isActive: boolean }>();

      ((affiliatesData || []) as AffiliateRow[]).forEach((affiliate) => {
        ensureSummary(summaries, {
          id: affiliate.id,
          name: affiliate.name,
          isActive: affiliate.is_active === true,
        });
      });

      ((linksData || []) as unknown as AffiliateLinkRow[]).forEach((link) => {
        const affiliate = getRelation(link.affiliates);
        const affiliateId = affiliate?.id || link.affiliate_id;

        if (!affiliateId) return;

        const affiliateInfo = {
          id: affiliateId,
          name: affiliate?.name || "Afiliada sem nome",
          isActive: affiliate?.is_active === true,
        };

        linkToAffiliate.set(link.id, affiliateInfo);
        ensureSummary(summaries, affiliateInfo);
      });

      const [{ data: salesData, error: salesError }, { data: visitsData, error: visitsError }] =
        await Promise.all([
          supabase
            .from("product_sales")
            .select(
              `
                id,
                affiliate_link_id,
                transaction_id,
                asaas_payment_id,
                sale_date,
                sale_amount,
                commission_amount,
                product_affiliate_links!inner(
                  id,
                  affiliate_id,
                  affiliates(id, name, is_active)
                )
              `,
            )
            .not("affiliate_link_id", "is", null)
            .gte("sale_date", period.start.toISOString())
            .lte("sale_date", period.end.toISOString()),
          supabase
            .from("checkout_events")
            .select("affiliate_code, created_at, session_id")
            .eq("event_type", "view")
            .not("affiliate_code", "is", null)
            .gte("created_at", period.start.toISOString())
            .lte("created_at", period.end.toISOString()),
        ]);

      if (salesError) throw salesError;
      if (visitsError) throw visitsError;

      const salesList = (salesData || []) as unknown as ProductSaleRow[];
      const transactionIds = salesList
        .map((sale) => sale.transaction_id)
        .filter((transactionId): transactionId is string => Boolean(transactionId));
      const asaasPaymentIds = salesList
        .map((sale) => sale.asaas_payment_id)
        .filter((paymentId): paymentId is string => Boolean(paymentId));
      const transactionsByKey = new Map<string, AffiliateTransactionRow>();
      const splitRowsByKey = new Map<string, AffiliateSplitRow[]>();

      const appendTransactions = (rows: AffiliateTransactionRow[] | null) => {
        (rows || []).forEach((transaction) => {
          transactionsByKey.set(`transaction:${transaction.id}`, transaction);
          if (transaction.asaas_payment_id) {
            transactionsByKey.set(`asaas:${transaction.asaas_payment_id}`, transaction);
          }
        });
      };

      const appendSplitRows = (rows: AffiliateSplitRow[] | null) => {
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

      if (transactionIds.length > 0) {
        const { data: transactionsById } = await supabase
          .from("transactions")
          .select("id, asaas_payment_id, affiliate_split_total, reconciliation_status")
          .in("id", transactionIds);

        appendTransactions((transactionsById || []) as AffiliateTransactionRow[]);

        const { data: splitRowsByTransaction } = await supabase
          .from("transaction_splits")
          .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount")
          .in("transaction_id", transactionIds);

        appendSplitRows((splitRowsByTransaction || []) as AffiliateSplitRow[]);
      }

      if (asaasPaymentIds.length > 0) {
        const { data: transactionsByPayment } = await supabase
          .from("transactions")
          .select("id, asaas_payment_id, affiliate_split_total, reconciliation_status")
          .in("asaas_payment_id", asaasPaymentIds);

        appendTransactions((transactionsByPayment || []) as AffiliateTransactionRow[]);

        const { data: splitRowsByPayment } = await supabase
          .from("transaction_splits")
          .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount")
          .in("asaas_payment_id", asaasPaymentIds);

        appendSplitRows((splitRowsByPayment || []) as AffiliateSplitRow[]);
      }

      const getTransactionForSale = (sale: ProductSaleRow) => {
        if (sale.transaction_id) {
          const transaction = transactionsByKey.get(`transaction:${sale.transaction_id}`);
          if (transaction) return transaction;
        }

        return sale.asaas_payment_id ? transactionsByKey.get(`asaas:${sale.asaas_payment_id}`) || null : null;
      };

      const getSplitsForSale = (sale: ProductSaleRow) => {
        const byTransaction = sale.transaction_id
          ? splitRowsByKey.get(`transaction:${sale.transaction_id}`) || []
          : [];
        const byPayment = sale.asaas_payment_id
          ? splitRowsByKey.get(`asaas:${sale.asaas_payment_id}`) || []
          : [];
        const splitMap = new Map<string, AffiliateSplitRow>();

        [...byTransaction, ...byPayment].forEach((split) => {
          splitMap.set(split.id, split);
        });

        return Array.from(splitMap.values());
      };

      const getSaleSplitPlannedAmount = (sale: ProductSaleRow) => {
        const transactionPlannedAmount = getNumberOrNull(getTransactionForSale(sale)?.affiliate_split_total);

        if (transactionPlannedAmount !== null) {
          return transactionPlannedAmount;
        }

        return sumMoney(getSplitsForSale(sale).map((split) => split.planned_amount));
      };

      const getSaleSplitReceivedAmount = (sale: ProductSaleRow) =>
        sumMoney(getSplitsForSale(sale).map((split) => split.received_amount));

      salesList.forEach((sale) => {
        const link = getRelation(sale.product_affiliate_links);
        const affiliate = getRelation(link?.affiliates);
        const affiliateId = affiliate?.id || link?.affiliate_id;

        if (!affiliateId) return;

        const summary = ensureSummary(summaries, {
          id: affiliateId,
          name: affiliate?.name || "Afiliada sem nome",
          isActive: affiliate?.is_active === true,
        });
        const dayKey = format(startOfDay(new Date(sale.sale_date)), "yyyy-MM-dd");
        const daily = summary.daily[dayKey];
        const revenue = Number(sale.sale_amount || 0);
        const commission = getNumberOrNull(sale.commission_amount);
        const splitPlanned = getSaleSplitPlannedAmount(sale);
        const splitReceived = getSaleSplitReceivedAmount(sale);
        const reconciliationStatus = getReconciliationStatus(getTransactionForSale(sale)?.reconciliation_status);

        summary.sales += 1;
        summary.revenue += revenue;
        summary.commission = addNullableMoney(summary.commission, commission);
        summary.splitPlanned = addNullableMoney(summary.splitPlanned, splitPlanned);
        summary.splitReceived = addNullableMoney(summary.splitReceived, splitReceived);
        summary.reconciliation[reconciliationStatus] += 1;

        if (daily) {
          daily.sales += 1;
          daily.revenue += revenue;
          if (commission !== null) {
            daily.commission += commission;
          }
        }
      });

      const uniqueVisitSessions = new Set<string>();

      ((visitsData || []) as CheckoutEventRow[]).forEach((visit) => {
        if (!visit.affiliate_code) return;

        const affiliate = linkToAffiliate.get(visit.affiliate_code);
        if (!affiliate) return;

        const dayKey = format(startOfDay(new Date(visit.created_at)), "yyyy-MM-dd");
        const sessionKey = `${affiliate.id}:${dayKey}:${visit.session_id || visit.created_at}`;

        if (uniqueVisitSessions.has(sessionKey)) return;
        uniqueVisitSessions.add(sessionKey);

        const summary = ensureSummary(summaries, affiliate);
        const daily = summary.daily[dayKey];

        summary.visits += 1;

        if (daily) {
          daily.visits += 1;
        }
      });

      const summariesList = Array.from(summaries.values()).map((summary) => {
        Object.values(summary.daily).forEach((daily) => {
          daily.conversion = daily.visits > 0 ? (daily.sales / daily.visits) * 100 : 0;
        });

        return {
          ...summary,
          conversion: summary.visits > 0 ? (summary.sales / summary.visits) * 100 : 0,
        };
      });

      const sortedSummaries = summariesList.sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        if (b.sales !== a.sales) return b.sales - a.sales;
        return b.visits - a.visits;
      });

      const totalRevenue = sortedSummaries.reduce((sum, item) => sum + item.revenue, 0);
      const totalCommission = sumMoney(sortedSummaries.map((item) => item.commission));
      const totalSales = sortedSummaries.reduce((sum, item) => sum + item.sales, 0);
      const totalVisits = sortedSummaries.reduce((sum, item) => sum + item.visits, 0);

      setAnalytics({
        activeAffiliates: ((affiliatesData || []) as AffiliateRow[]).filter((affiliate) => affiliate.is_active).length,
        summaries: sortedSummaries,
        totalRevenue,
        totalCommission,
        totalSales,
        totalVisits,
        averageConversion: totalVisits > 0 ? (totalSales / totalVisits) * 100 : 0,
      });
    } catch (error) {
      console.error("Error fetching affiliate analytics:", error);
      setAnalytics(emptyAnalytics);
    } finally {
      setLoading(false);
    }
  };

  const activeMetric = metricOptions[metric];
  const chartAffiliates = analytics.summaries
    .filter(
      (affiliate) =>
        affiliate.revenue > 0 ||
        affiliate.sales > 0 ||
        (affiliate.commission ?? 0) > 0 ||
        affiliate.visits > 0,
    )
    .slice(0, 5);

  const chartSeries = chartAffiliates.map((affiliate, index) => ({
    key: `affiliate_${index}`,
    name: affiliate.name,
    color: chartColors[index % chartColors.length],
    affiliate,
  }));

  const chartData = period.days.map((day) => {
    const row: Record<string, string | number> = {
      date: day.key,
      displayDate: day.label,
    };

    chartSeries.forEach((series) => {
      row[series.key] = series.affiliate.daily[day.key]?.[metric] || 0;
    });

    return row;
  });

  const hasChartData = chartData.some((day) =>
    chartSeries.some((series) => Number(day[series.key] || 0) > 0),
  );

  const featuredAffiliate = analytics.summaries.find((affiliate) => affiliate.revenue > 0 || affiliate.sales > 0);
  const visitWithoutSale = analytics.summaries
    .filter((affiliate) => affiliate.visits > 0 && affiliate.sales === 0)
    .sort((a, b) => b.visits - a.visits)[0];
  const noTrafficAffiliate = analytics.summaries
    .filter((affiliate) => affiliate.isActive && affiliate.visits === 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))[0];
  const getAffiliateReconciliationStatus = (affiliate: AffiliateSummary): ReconciliationStatusKey | null => {
    const counts = affiliate.reconciliation;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    if (total === 0) return null;
    if (counts.divergent > 0) return "divergent";
    if (counts.partial > 0) return "partial";
    if (counts.pending > 0) return "pending";
    if (counts.reconciled > 0) return "reconciled";
    if (counts.not_applicable > 0) return "not_applicable";

    return null;
  };
  const getReconciliationBadge = (affiliate: AffiliateSummary) => {
    const status = getAffiliateReconciliationStatus(affiliate);

    if (!status) {
      return "—";
    }

    return (
      <Badge variant={reconciliationBadgeVariants[status]}>
        {reconciliationStatusLabels[status]}
      </Badge>
    );
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Performance de Afiliadas</h2>
        <p className="text-sm text-muted-foreground">
          Comparativo dos últimos 30 dias com receita cobrada, comissão bruta estimada, split e visitas ao checkout.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Afiliadas ativas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : analytics.activeAffiliates}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita cobrada por afiliadas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : `R$ ${formatCurrency(analytics.totalRevenue)}`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissão bruta estimada</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : formatMoneyOrDash(analytics.totalCommission)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão média</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : formatPercent(analytics.averageConversion)}
            </div>
            <p className="text-xs text-muted-foreground">Conversão estimada</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Evolução por afiliada</CardTitle>
              <p className="text-sm text-muted-foreground">Top 5 afiliadas por receita cobrada nos últimos 30 dias</p>
            </div>
            <Select value={metric} onValueChange={(value) => setMetric(value as MetricKey)}>
              <SelectTrigger className="w-full md:w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(metricOptions).map(([value, option]) => (
                  <SelectItem key={value} value={value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
              Carregando analytics...
            </div>
          ) : !hasChartData ? (
            <div className="flex h-[340px] items-center justify-center text-center text-sm text-muted-foreground">
              Sem dados de afiliadas nos últimos 30 dias.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="displayDate" stroke="hsl(var(--muted-foreground))" fontSize={12} interval={4} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => formatMetric(Number(value), activeMetric.kind)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number, name: string) => [
                    formatMetric(Number(value), activeMetric.kind),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ paddingTop: "16px" }} />
                {chartSeries.map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.name}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Afiliada destaque do período</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : featuredAffiliate ? (
              <div className="space-y-1">
                <p className="font-medium">{featuredAffiliate.name}</p>
                <p className="text-sm text-muted-foreground">
                  R$ {formatCurrency(featuredAffiliate.revenue)} em receita cobrada
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem destaque no período</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Afiliada com visita sem venda</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : visitWithoutSale ? (
              <div className="space-y-1">
                <p className="font-medium">{visitWithoutSale.name}</p>
                <p className="text-sm text-muted-foreground">
                  {visitWithoutSale.visits.toLocaleString("pt-BR")} visitas ao checkout
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum caso encontrado</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Afiliada sem tráfego</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : noTrafficAffiliate ? (
              <div className="space-y-1">
                <p className="font-medium">{noTrafficAffiliate.name}</p>
                <p className="text-sm text-muted-foreground">Nenhuma visita ao checkout no período</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todas as afiliadas ativas tiveram tráfego</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tabela comparativa</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando tabela...</div>
          ) : analytics.summaries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma afiliada encontrada para comparação.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Afiliada</TableHead>
                    <TableHead className="text-right">Visitas ao checkout</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Conversão estimada</TableHead>
                    <TableHead className="text-right">Receita cobrada</TableHead>
                    <TableHead className="text-right">Comissão bruta estimada</TableHead>
                    <TableHead className="text-right">Split planejado</TableHead>
                    <TableHead className="text-right">Split recebido Asaas</TableHead>
                    <TableHead>Status de conciliação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.summaries.map((affiliate) => (
                    <TableRow key={affiliate.id}>
                      <TableCell className="font-medium">{affiliate.name}</TableCell>
                      <TableCell className="text-right">{affiliate.visits.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{affiliate.sales.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{formatPercent(affiliate.conversion)}</TableCell>
                      <TableCell className="text-right">R$ {formatCurrency(affiliate.revenue)}</TableCell>
                      <TableCell className="text-right">{formatMoneyOrDash(affiliate.commission)}</TableCell>
                      <TableCell className="text-right">{formatMoneyOrDash(affiliate.splitPlanned)}</TableCell>
                      <TableCell className="text-right">{formatMoneyOrDash(affiliate.splitReceived)}</TableCell>
                      <TableCell>{getReconciliationBadge(affiliate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
