import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, MousePointerClick, RefreshCw, ShoppingCart, Users, Wallet } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { DailyMetric, RevenueChart } from "@/components/dashboard/RevenueChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { businessDay, businessDayRange, formatDayOverDayChange, paidSaleDate } from "@/lib/salesDate";
import { startOfMonth, subDays, format } from "date-fns";

// Janela máxima do gráfico. Buscamos sempre 30 dias e o seletor 7/30 fatia em
// memória — assim trocar o período não dispara request nova.
const CHART_DAYS = 30;

// Lista fixa das afiliadas reais para os cards do Dashboard.
// Contas de teste (ex.: "Ana teste", "teste 2") ficam de fora dos cards,
// mas ainda entram na dedução de comissão do bloco "Meu lucro real" —
// não há flag de teste no banco pra separar isso do faturamento bruto.
const AFFILIATE_REPORT_NAMES = ["Laís Sant Anna", "Jayane", "Lívia Tadesco"];

interface AffiliateCardStats {
  name: string;
  revenue: number;
  commission: number;
  salesCount: number;
  sales: { product: string; value: number; date: string }[];
}

interface TopCheckoutStats {
  productId: string;
  name: string;
  accesses: number;
  sales: number;
}

interface DashboardStats {
  revenueToday: number;
  revenueYesterday: number;
  revenueLast7Days: number;
  revenueThisMonth: number;
  asaasFeesThisMonth: number | null;
  salesToday: number;
  salesYesterday: number;
  salesLast7Days: number;
  salesThisMonth: number;
  affiliateCards: AffiliateCardStats[];
  affiliateCommissionsThisMonth: number;
  accessesToday: number;
  accessesYesterday: number;
  abandonsToday: number;
  topCheckouts: TopCheckoutStats[];
  dailyMetrics: DailyMetric[];
}

interface DashboardTransaction {
  value: number | null;
  asaas_fee_amount: number | null;
  created_at: string;
  confirmed_date: string | null;
  payment_date: string | null;
  product_id: string | null;
  status: string;
}

interface CheckoutEventRow {
  event_type: string;
  product_id: string | null;
  created_at: string;
  products: { name: string } | null;
}

interface DashboardSale {
  sale_amount: number | null;
  commission_amount: number | null;
  sale_date: string;
  affiliate_link_id: string | null;
  product_affiliate_links: { affiliates: { name: string } | null } | null;
  products: { name: string } | null;
}

// ponytail: pagina em blocos porque o teto de linhas da API é configuração de
// servidor, não do cliente — sem isso o gráfico perderia eventos em silêncio
// assim que a janela de 30 dias passar do limite.
const CHECKOUT_EVENTS_PAGE_SIZE = 1000;

const fetchCheckoutEvents = async (fromDay: string): Promise<CheckoutEventRow[]> => {
  const rows: CheckoutEventRow[] = [];

  for (let offset = 0; ; offset += CHECKOUT_EVENTS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("checkout_events")
      .select("event_type, product_id, created_at, products ( name )")
      .in("event_type", ["view", "abandon"])
      // -03:00 fixo: o Brasil não usa mais horário de verão desde 2019.
      .gte("created_at", `${fromDay}T00:00:00-03:00`)
      .order("created_at")
      .range(offset, offset + CHECKOUT_EVENTS_PAGE_SIZE - 1);

    if (error || !data?.length) break;

    rows.push(...(data as unknown as CheckoutEventRow[]));
    if (data.length < CHECKOUT_EVENTS_PAGE_SIZE) break;
  }

  return rows;
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    revenueToday: 0,
    revenueYesterday: 0,
    revenueLast7Days: 0,
    revenueThisMonth: 0,
    asaasFeesThisMonth: null,
    salesToday: 0,
    salesYesterday: 0,
    salesLast7Days: 0,
    salesThisMonth: 0,
    affiliateCards: AFFILIATE_REPORT_NAMES.map((name) => ({ name, revenue: 0, commission: 0, salesCount: 0, sales: [] })),
    affiliateCommissionsThisMonth: 0,
    accessesToday: 0,
    accessesYesterday: 0,
    abandonsToday: 0,
    topCheckouts: [],
    dailyMetrics: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateCardStats | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const monthStart = startOfMonth(now);
      const todayStr = businessDay(now);
      const yesterdayStr = businessDay(subDays(now, 1));
      const last7DaysStr = businessDay(subDays(now, 7));
      const monthStartDateStr = format(monthStart, "yyyy-MM-dd");
      const chartDays = businessDayRange(todayStr, CHART_DAYS);

      const { data: transactionRows } = await supabase
        .from("transactions")
        .select(`
          value,
          asaas_fee_amount,
          created_at,
          confirmed_date,
          payment_date,
          product_id,
          status
        `);

      if (!transactionRows) {
        setLoading(false);
        return;
      }

      const transactions = transactionRows as DashboardTransaction[];
      const confirmedTransactions = transactions.filter((transaction) =>
        ["RECEIVED", "CONFIRMED"].includes(transaction.status)
      );

      const getNumberOrNull = (value: number | null | undefined) => {
        if (value === null || value === undefined) {
          return null;
        }

        const parsedValue = Number(value);
        return Number.isFinite(parsedValue) ? parsedValue : null;
      };

      const sumNullable = (values: Array<number | null | undefined>) => {
        const validValues = values
          .map(getNumberOrNull)
          .filter((value): value is number => value !== null);

        if (validValues.length === 0) {
          return null;
        }

        return validValues.reduce((sum, value) => sum + value, 0);
      };

      // Buckets pela data real do pagamento (ver paidSaleDate), não por created_at.
      const bucket = (matches: (paidDateStr: string) => boolean) => {
        const rows = confirmedTransactions.filter((t) => matches(paidSaleDate(t)));
        return {
          rows,
          revenue: rows.reduce((sum, t) => sum + Number(t.value || 0), 0),
          count: rows.length,
        };
      };

      const today = bucket((d) => d === todayStr);
      const yesterday = bucket((d) => d === yesterdayStr);
      const last7Days = bucket((d) => d >= last7DaysStr);
      const thisMonth = bucket((d) => d >= monthStartDateStr);

      const revenueToday = today.revenue;
      const revenueYesterday = yesterday.revenue;
      const revenueLast7Days = last7Days.revenue;
      const revenueThisMonth = thisMonth.revenue;

      const salesToday = today.count;
      const salesYesterday = yesterday.count;
      const salesLast7Days = last7Days.count;
      const salesThisMonth = thisMonth.count;
      const asaasFeesThisMonth = sumNullable(thisMonth.rows.map((transaction) => transaction.asaas_fee_amount));

      // Mesma fonte do Relatórios > Checkout. checkout_events.created_at é
      // timestamp real, então o dia comercial vem de businessDay (não de UTC).
      const checkoutEvents = await fetchCheckoutEvents(chartDays[0]);
      const eventsByDay = new Map<string, CheckoutEventRow[]>();
      checkoutEvents.forEach((event) => {
        const day = businessDay(event.created_at);
        eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), event]);
      });

      const eventsToday = eventsByDay.get(todayStr) ?? [];
      const countViews = (events: CheckoutEventRow[]) => events.filter((e) => e.event_type === "view").length;

      const accessesToday = countViews(eventsToday);
      const accessesYesterday = countViews(eventsByDay.get(yesterdayStr) ?? []);
      const abandonsToday = eventsToday.filter((e) => e.event_type === "abandon").length;

      // checkout_events.product_id é FK de products — relação canônica, sem
      // casar por nome. Vendas do dia vêm de transactions.product_id.
      const salesByProduct = new Map<string, number>();
      today.rows.forEach((transaction) => {
        if (!transaction.product_id) return;
        salesByProduct.set(transaction.product_id, (salesByProduct.get(transaction.product_id) ?? 0) + 1);
      });

      const accessesByProduct = new Map<string, TopCheckoutStats>();
      eventsToday
        .filter((event) => event.event_type === "view" && event.product_id)
        .forEach((event) => {
          const productId = event.product_id as string;
          const current = accessesByProduct.get(productId) ?? {
            productId,
            name: event.products?.name || "Produto não identificado",
            accesses: 0,
            sales: salesByProduct.get(productId) ?? 0,
          };
          accessesByProduct.set(productId, { ...current, accesses: current.accesses + 1 });
        });

      const topCheckouts = [...accessesByProduct.values()]
        .sort((a, b) => b.accesses - a.accesses)
        .slice(0, 4);

      const revenueByDay = new Map<string, { sales: number; revenue: number }>();
      confirmedTransactions.forEach((transaction) => {
        const day = paidSaleDate(transaction);
        const current = revenueByDay.get(day) ?? { sales: 0, revenue: 0 };
        revenueByDay.set(day, {
          sales: current.sales + 1,
          revenue: current.revenue + Number(transaction.value || 0),
        });
      });

      const dailyMetrics: DailyMetric[] = chartDays.map((day) => {
        const daySales = revenueByDay.get(day) ?? { sales: 0, revenue: 0 };
        return {
          day,
          label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
          accesses: countViews(eventsByDay.get(day) ?? []),
          sales: daySales.sales,
          revenue: daySales.revenue,
        };
      });

      // Vendas por afiliada (mês atual) — alimenta os cards de afiliada e a
      // dedução de comissão do bloco "Meu lucro real". Fonte: product_sales,
      // que já grava o commission_amount real calculado por venda.
      const { data: saleRows } = await supabase
        .from("product_sales")
        .select(`
          sale_amount,
          commission_amount,
          sale_date,
          affiliate_link_id,
          products ( name ),
          product_affiliate_links ( affiliates ( name ) )
        `);

      // sale_date é gravado à meia-noite UTC representando o dia local (mesmo
      // padrão do bug corrigido em Relatorios.tsx). Comparar por instante UTC
      // exato pode excluir o dia 1º do mês por até 3h. Aqui comparamos pela
      // data-calendário (yyyy-MM-dd) do início do mês, não pelo instante.
      const salesThisMonthList = ((saleRows || []) as unknown as DashboardSale[]).filter(
        (sale) => sale.sale_date.slice(0, 10) >= monthStartDateStr
      );

      const affiliateSalesThisMonth = salesThisMonthList.filter((sale) => sale.affiliate_link_id !== null);

      const affiliateCards: AffiliateCardStats[] = AFFILIATE_REPORT_NAMES.map((name) => {
        const salesForAffiliate = affiliateSalesThisMonth.filter(
          (sale) => sale.product_affiliate_links?.affiliates?.name === name
        );

        // Detalhe simples por venda (produto, valor, data) pro popup do card,
        // ordenado do mais recente pro mais antigo.
        const salesDetail = salesForAffiliate
          .map((sale) => ({
            product: sale.products?.name || "Produto não identificado",
            value: Number(sale.sale_amount || 0),
            date: sale.sale_date,
          }))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

        return {
          name,
          revenue: salesForAffiliate.reduce((sum, sale) => sum + Number(sale.sale_amount || 0), 0),
          commission: salesForAffiliate.reduce((sum, sale) => sum + Number(sale.commission_amount || 0), 0),
          salesCount: salesForAffiliate.length,
          sales: salesDetail,
        };
      });

      // Deduz comissão de TODA venda com afiliada vinculada (inclui eventuais
      // contas de teste) — o faturamento bruto (transactions) também não
      // separa teste de real, então excluir só a comissão subestimaria o
      // quanto realmente sai do bolso. Ver nota de divergência na tela.
      const affiliateCommissionsThisMonth = affiliateSalesThisMonth.reduce(
        (sum, sale) => sum + Number(sale.commission_amount || 0),
        0
      );

      setStats({
        revenueToday,
        revenueYesterday,
        revenueLast7Days,
        revenueThisMonth,
        asaasFeesThisMonth,
        salesToday,
        salesYesterday,
        salesLast7Days,
        salesThisMonth,
        affiliateCards,
        affiliateCommissionsThisMonth,
        accessesToday,
        accessesYesterday,
        abandonsToday,
        topCheckouts,
        dailyMetrics,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatCurrencyOrDash = (value: number | null) => {
    if (value === null || value === undefined) {
      return "—";
    }

    return formatCurrency(value);
  };

  // sale_date é gravado à meia-noite UTC representando o dia local. Formatar
  // via new Date(...) + timezone do navegador mostraria o dia anterior (ex.:
  // 07/07 vira 06/07 em Brasília). Extrai a data-calendário direto da string,
  // sem conversão de fuso.
  const formatSaleDate = (isoDate: string) => {
    const [year, month, day] = isoDate.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  };

  // "Acessos", não "pessoas": contamos eventos de view, sem deduplicação
  // garantida por visitante.
  const formatConversion = (sales: number, accesses: number) =>
    accesses > 0 ? `${((sales / accesses) * 100).toFixed(1)}%` : "—";

  const revenueChange = formatDayOverDayChange(stats.revenueToday, stats.revenueYesterday);
  const accessesChange = formatDayOverDayChange(stats.accessesToday, stats.accessesYesterday);
  const averageTicketToday = stats.salesToday > 0 ? stats.revenueToday / stats.salesToday : 0;
  const conversionToday = formatConversion(stats.salesToday, stats.accessesToday);

  const netProfitThisMonth =
    stats.revenueThisMonth - (stats.asaasFeesThisMonth || 0) - stats.affiliateCommissionsThisMonth;

  // Os 3 cards mostram só as afiliadas reais; a comissão deduzida no lucro
  // inclui qualquer venda com afiliada vinculada (pode incluir teste).
  // Se os dois valores não baterem, avisamos na tela em vez de deixar
  // a diferença passar despercebida.
  const affiliateCardsCommissionSum = stats.affiliateCards.reduce((sum, card) => sum + card.commission, 0);
  const commissionMismatchNote =
    Math.abs(affiliateCardsCommissionSum - stats.affiliateCommissionsThisMonth) > 0.009
      ? `A comissão deduzida acima (${formatCurrency(stats.affiliateCommissionsThisMonth)}) inclui vendas com afiliada fora dos 3 cards (ex.: conta de teste). Soma só das 3 reais: ${formatCurrency(affiliateCardsCommissionSum)}.`
      : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do seu negócio em tempo real com valores cobrados do cliente
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchDashboardStats} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="h-56 bg-muted animate-pulse rounded-lg" />
          <div className="h-56 bg-muted animate-pulse rounded-lg" />
          <div className="h-56 bg-muted animate-pulse rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link to="/relatorios?tab=vendas&period=today" className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <StatCard
              title="Resumo de hoje"
              value={formatCurrency(stats.revenueToday)}
              change={revenueChange}
              changeType={stats.revenueToday >= stats.revenueYesterday ? "positive" : "negative"}
              subtitle={`${stats.salesToday} ${stats.salesToday === 1 ? "venda" : "vendas"} · ticket médio ${formatCurrency(averageTicketToday)}`}
              icon={DollarSign}
              iconColor="text-primary"
              additionalMetrics={[
                { label: "Ontem", value: formatCurrency(stats.revenueYesterday) },
                { label: "Últimos 7 dias", value: formatCurrency(stats.revenueLast7Days) },
                { label: "Mês atual", value: formatCurrency(stats.revenueThisMonth) },
              ]}
            />
          </Link>
          <Link to="/relatorios?tab=checkout&period=today" className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <StatCard
              title="Acessos aos checkouts hoje"
              value={stats.accessesToday.toString()}
              change={accessesChange}
              changeType={stats.accessesToday >= stats.accessesYesterday ? "positive" : "negative"}
              subtitle={`${stats.abandonsToday} ${stats.abandonsToday === 1 ? "abandono" : "abandonos"} hoje`}
              icon={MousePointerClick}
              iconColor="text-info"
              additionalMetrics={[
                { label: "Vendas confirmadas", value: stats.salesToday.toString() },
                { label: "Conversão", value: conversionToday },
                { label: "Ontem", value: stats.accessesYesterday.toString() },
              ]}
            />
          </Link>
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top 4 checkouts hoje</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {stats.topCheckouts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum acesso registrado hoje.</p>
              ) : (
                <div className="space-y-3">
                  {stats.topCheckouts.map((checkout) => (
                    <div key={checkout.productId} className="border-b border-border pb-2 last:border-0 last:pb-0">
                      <p className="text-sm font-medium truncate" title={checkout.name}>{checkout.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {checkout.accesses} {checkout.accesses === 1 ? "acesso" : "acessos"} ·{" "}
                        {checkout.sales} {checkout.sales === 1 ? "venda" : "vendas"} ·{" "}
                        {formatConversion(checkout.sales, checkout.accesses)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <Link
                to="/relatorios?tab=produtos&period=today"
                className="text-sm text-primary hover:underline mt-4 inline-block"
              >
                Ver todos os produtos →
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      <RevenueChart data={stats.dailyMetrics} loading={loading} />

      {!loading && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Vendas por Afiliada</h2>
            <p className="text-sm text-muted-foreground">
              Mês atual · Laís Sant Anna, Jayane e Lívia Tadesco
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {stats.affiliateCards.map((card) => (
              <button
                key={card.name}
                type="button"
                onClick={() => setSelectedAffiliate(card)}
                className="text-left w-full cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <StatCard
                  title={card.name}
                  value={formatCurrency(card.revenue)}
                  change="Vendeu no mês"
                  changeType="neutral"
                  icon={Users}
                  iconColor="text-info"
                  additionalMetrics={[
                    { label: "Comissão paga", value: formatCurrency(card.commission) },
                    { label: "Nº de vendas", value: card.salesCount.toString() },
                  ]}
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {!loading && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Meu lucro real</h2>
            <p className="text-sm text-muted-foreground">
              Faturamento bruto do mês, menos taxa Asaas e comissão de afiliadas
            </p>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="p-3 rounded-lg bg-info-light">
                  <Wallet className="h-6 w-6 text-info" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Faturamento bruto</span>
                    <span className="text-base font-semibold">{formatCurrency(stats.revenueThisMonth)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">(−) Taxa Asaas</span>
                    <span className="text-base font-medium text-destructive">
                      -{formatCurrencyOrDash(stats.asaasFeesThisMonth)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">(−) Comissão de afiliadas</span>
                    <span className="text-base font-medium text-destructive">
                      -{formatCurrency(stats.affiliateCommissionsThisMonth)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-base font-semibold">Lucro final</span>
                    <span className="text-2xl font-bold text-success">{formatCurrency(netProfitThisMonth)}</span>
                  </div>
                </div>
              </div>
              {commissionMismatchNote && (
                <p className="text-xs text-muted-foreground mt-4">{commissionMismatchNote}</p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <RecentSales />

      <Dialog open={selectedAffiliate !== null} onOpenChange={(open) => !open && setSelectedAffiliate(null)}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vendas de {selectedAffiliate?.name}</DialogTitle>
          </DialogHeader>
          {selectedAffiliate && selectedAffiliate.sales.length > 0 ? (
            <div className="space-y-3">
              {selectedAffiliate.sales.map((sale, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{sale.product}</p>
                    <p className="text-xs text-muted-foreground">{formatSaleDate(sale.date)}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatCurrency(sale.value)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Nenhuma venda no mês.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
