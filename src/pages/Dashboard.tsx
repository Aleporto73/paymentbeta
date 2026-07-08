import { useEffect, useState } from "react";
import { DollarSign, ShoppingCart, Users, Wallet } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, startOfMonth, subDays, endOfDay, format } from "date-fns";

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
}

interface DashboardTransaction {
  value: number | null;
  asaas_fee_amount: number | null;
  created_at: string;
  status: string;
}

interface DashboardSale {
  sale_amount: number | null;
  commission_amount: number | null;
  sale_date: string;
  affiliate_link_id: string | null;
  product_affiliate_links: { affiliates: { name: string } | null } | null;
  products: { name: string } | null;
}

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
  });
  const [loading, setLoading] = useState(true);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateCardStats | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const todayStart = startOfDay(now);
      const yesterdayStart = startOfDay(subDays(now, 1));
      const yesterdayEnd = endOfDay(subDays(now, 1));
      const last7DaysStart = startOfDay(subDays(now, 7));
      const monthStart = startOfMonth(now);

      const { data: transactionRows } = await supabase
        .from("transactions")
        .select(`
          value,
          asaas_fee_amount,
          created_at,
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

      // Calculate stats
      const revenueToday = confirmedTransactions
        .filter((t) => new Date(t.created_at) >= todayStart)
        .reduce((sum, t) => sum + Number(t.value || 0), 0);

      const revenueYesterday = confirmedTransactions
        .filter(
          (t) =>
            new Date(t.created_at) >= yesterdayStart &&
            new Date(t.created_at) <= yesterdayEnd
        )
        .reduce((sum, t) => sum + Number(t.value || 0), 0);

      const revenueLast7Days = confirmedTransactions
        .filter((t) => new Date(t.created_at) >= last7DaysStart)
        .reduce((sum, t) => sum + Number(t.value || 0), 0);

      const revenueThisMonth = confirmedTransactions
        .filter((t) => new Date(t.created_at) >= monthStart)
        .reduce((sum, t) => sum + Number(t.value || 0), 0);

      const transactionsToday = confirmedTransactions.filter(
        (t) => new Date(t.created_at) >= todayStart
      );

      const transactionsThisMonth = confirmedTransactions.filter(
        (t) => new Date(t.created_at) >= monthStart
      );

      const salesToday = transactionsToday.length;

      const salesYesterday = confirmedTransactions.filter(
        (t) =>
          new Date(t.created_at) >= yesterdayStart &&
          new Date(t.created_at) <= yesterdayEnd
      ).length;

      const salesLast7Days = confirmedTransactions.filter(
        (t) => new Date(t.created_at) >= last7DaysStart
      ).length;

      const salesThisMonth = transactionsThisMonth.length;
      const asaasFeesThisMonth = sumNullable(transactionsThisMonth.map((transaction) => transaction.asaas_fee_amount));

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
      const monthStartDateStr = format(monthStart, "yyyy-MM-dd");
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

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "+100%" : "0%";
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const revenueChange = calculateChange(stats.revenueToday, stats.revenueYesterday);
  const salesChange = calculateChange(stats.salesToday, stats.salesYesterday);

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Visão geral do seu negócio em tempo real com valores cobrados do cliente
        </p>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <StatCard
            title="Receita cobrada hoje"
            value={formatCurrency(stats.revenueToday)}
            change={`${revenueChange} vs ontem`}
            changeType={stats.revenueToday >= stats.revenueYesterday ? "positive" : "negative"}
            icon={DollarSign}
            iconColor="text-primary"
            additionalMetrics={[
              { label: "Ontem", value: formatCurrency(stats.revenueYesterday) },
              { label: "Últimos 7 dias", value: formatCurrency(stats.revenueLast7Days) },
              { label: "Mês atual", value: formatCurrency(stats.revenueThisMonth) },
            ]}
          />
          <StatCard
            title="Total de Vendas"
            value={stats.salesToday.toString()}
            change={`${stats.salesToday > 0 ? '+' : ''}${stats.salesToday} vendas hoje`}
            changeType={stats.salesToday >= stats.salesYesterday ? "positive" : "negative"}
            icon={ShoppingCart}
            iconColor="text-success"
            additionalMetrics={[
              { label: "Ontem", value: stats.salesYesterday.toString() },
              { label: "Últimos 7 dias", value: stats.salesLast7Days.toString() },
              { label: "Mês atual", value: stats.salesThisMonth.toString() },
            ]}
          />
        </div>
      )}

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

      <RevenueChart />

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
