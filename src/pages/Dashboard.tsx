import { useEffect, useState } from "react";
import { CheckCircle2, DollarSign, GitBranch, Percent, ShoppingCart } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, startOfMonth, subDays, endOfDay } from "date-fns";

interface DashboardStats {
  revenueToday: number;
  revenueYesterday: number;
  revenueLast7Days: number;
  revenueThisMonth: number;
  asaasFeesToday: number | null;
  asaasFeesThisMonth: number | null;
  splitPlannedToday: number | null;
  splitPlannedThisMonth: number | null;
  splitReceivedToday: number | null;
  splitReceivedThisMonth: number | null;
  producerNetToday: number | null;
  producerNetThisMonth: number | null;
  asaasNetThisMonth: number | null;
  salesToday: number;
  salesYesterday: number;
  salesLast7Days: number;
  salesThisMonth: number;
  reconciliation: {
    pending: number;
    partial: number;
    reconciled: number;
    divergent: number;
    not_applicable: number;
  };
}

interface DashboardTransaction {
  id: string;
  asaas_payment_id: string | null;
  value: number | null;
  net_value: number | null;
  asaas_fee_amount: number | null;
  affiliate_split_total: number | null;
  producer_net_amount: number | null;
  reconciliation_status: string | null;
  created_at: string;
  status: string;
}

interface DashboardSplit {
  id: string;
  transaction_id: string | null;
  asaas_payment_id: string | null;
  planned_amount: number | null;
  received_amount: number | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    revenueToday: 0,
    revenueYesterday: 0,
    revenueLast7Days: 0,
    revenueThisMonth: 0,
    asaasFeesToday: null,
    asaasFeesThisMonth: null,
    splitPlannedToday: null,
    splitPlannedThisMonth: null,
    splitReceivedToday: null,
    splitReceivedThisMonth: null,
    producerNetToday: null,
    producerNetThisMonth: null,
    asaasNetThisMonth: null,
    salesToday: 0,
    salesYesterday: 0,
    salesLast7Days: 0,
    salesThisMonth: 0,
    reconciliation: {
      pending: 0,
      partial: 0,
      reconciled: 0,
      divergent: 0,
      not_applicable: 0,
    },
  });
  const [loading, setLoading] = useState(true);

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
          id,
          asaas_payment_id,
          value,
          net_value,
          asaas_fee_amount,
          affiliate_split_total,
          producer_net_amount,
          reconciliation_status,
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
      const confirmedTransactionIds = confirmedTransactions.map((transaction) => transaction.id);
      const confirmedAsaasPaymentIds = confirmedTransactions
        .map((transaction) => transaction.asaas_payment_id)
        .filter((paymentId): paymentId is string => Boolean(paymentId));
      const splitRowsByKey = new Map<string, DashboardSplit[]>();

      const appendSplitRows = (rows: DashboardSplit[] | null) => {
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

      if (confirmedTransactionIds.length > 0) {
        const { data: splitRowsByTransaction } = await supabase
          .from("transaction_splits")
          .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount")
          .in("transaction_id", confirmedTransactionIds);

        appendSplitRows((splitRowsByTransaction || []) as DashboardSplit[]);
      }

      if (confirmedAsaasPaymentIds.length > 0) {
        const { data: splitRowsByPayment } = await supabase
          .from("transaction_splits")
          .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount")
          .in("asaas_payment_id", confirmedAsaasPaymentIds);

        appendSplitRows((splitRowsByPayment || []) as DashboardSplit[]);
      }

      const getSplitsForTransaction = (transaction: DashboardTransaction) => {
        const byTransaction = splitRowsByKey.get(`transaction:${transaction.id}`) || [];
        const byPayment = transaction.asaas_payment_id
          ? splitRowsByKey.get(`asaas:${transaction.asaas_payment_id}`) || []
          : [];
        const splitMap = new Map<string, DashboardSplit>();

        [...byTransaction, ...byPayment].forEach((split) => {
          splitMap.set(split.id, split);
        });

        return Array.from(splitMap.values());
      };

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

      const getTransactionSplitPlannedAmount = (transaction: DashboardTransaction) => {
        const transactionPlannedAmount = getNumberOrNull(transaction.affiliate_split_total);

        if (transactionPlannedAmount !== null) {
          return transactionPlannedAmount;
        }

        return sumNullable(getSplitsForTransaction(transaction).map((split) => split.planned_amount));
      };

      const getTransactionSplitReceivedAmount = (transaction: DashboardTransaction) =>
        sumNullable(getSplitsForTransaction(transaction).map((split) => split.received_amount));

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
      const asaasFeesToday = sumNullable(transactionsToday.map((transaction) => transaction.asaas_fee_amount));
      const asaasFeesThisMonth = sumNullable(transactionsThisMonth.map((transaction) => transaction.asaas_fee_amount));
      const splitPlannedToday = sumNullable(transactionsToday.map(getTransactionSplitPlannedAmount));
      const splitPlannedThisMonth = sumNullable(transactionsThisMonth.map(getTransactionSplitPlannedAmount));
      const splitReceivedToday = sumNullable(transactionsToday.map(getTransactionSplitReceivedAmount));
      const splitReceivedThisMonth = sumNullable(transactionsThisMonth.map(getTransactionSplitReceivedAmount));
      const producerNetToday = sumNullable(transactionsToday.map((transaction) => transaction.producer_net_amount));
      const producerNetThisMonth = sumNullable(transactionsThisMonth.map((transaction) => transaction.producer_net_amount));
      const asaasNetThisMonth = sumNullable(transactionsThisMonth.map((transaction) => transaction.net_value));
      const reconciliation = transactions
        .filter((transaction) => new Date(transaction.created_at) >= monthStart)
        .reduce(
          (counts, transaction) => {
            const status = transaction.reconciliation_status || "pending";
            if (status in counts) {
              counts[status as keyof typeof counts] += 1;
            }
            return counts;
          },
          {
            pending: 0,
            partial: 0,
            reconciled: 0,
            divergent: 0,
            not_applicable: 0,
          },
        );

      setStats({
        revenueToday,
        revenueYesterday,
        revenueLast7Days,
        revenueThisMonth,
        asaasFeesToday,
        asaasFeesThisMonth,
        splitPlannedToday,
        splitPlannedThisMonth,
        splitReceivedToday,
        splitReceivedThisMonth,
        producerNetToday,
        producerNetThisMonth,
        asaasNetThisMonth,
        salesToday,
        salesYesterday,
        salesLast7Days,
        salesThisMonth,
        reconciliation,
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

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "+100%" : "0%";
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const revenueChange = calculateChange(stats.revenueToday, stats.revenueYesterday);
  const salesChange = calculateChange(stats.salesToday, stats.salesYesterday);
  const producerNetDisplay = formatCurrencyOrDash(stats.producerNetThisMonth);
  const reconciliationEvaluatedTotal =
    stats.reconciliation.pending +
    stats.reconciliation.partial +
    stats.reconciliation.reconciled +
    stats.reconciliation.divergent +
    stats.reconciliation.not_applicable;

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
            <h2 className="text-xl font-semibold tracking-tight">Conciliação financeira</h2>
            <p className="text-sm text-muted-foreground">
              Leitura financeira baseada nos dados registrados na conciliação
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <StatCard
              title="Taxas Asaas estimadas"
              value={formatCurrencyOrDash(stats.asaasFeesThisMonth)}
              change="Mês atual"
              changeType="neutral"
              icon={Percent}
              iconColor="text-warning"
              additionalMetrics={[
                { label: "Hoje", value: formatCurrencyOrDash(stats.asaasFeesToday) },
                { label: "Split planejado", value: formatCurrencyOrDash(stats.splitPlannedThisMonth) },
                { label: "Split recebido Asaas", value: formatCurrencyOrDash(stats.splitReceivedThisMonth) },
              ]}
            />
            <StatCard
              title="Líquido do produtor"
              value={producerNetDisplay}
              change={producerNetDisplay === "—" ? "Aguardando conciliação real" : "Mês atual"}
              changeType="neutral"
              icon={GitBranch}
              iconColor="text-info"
              additionalMetrics={[
                { label: "Hoje", value: formatCurrencyOrDash(stats.producerNetToday) },
                { label: "Líquido Asaas registrado", value: formatCurrencyOrDash(stats.asaasNetThisMonth) },
                { label: "Receita cobrada mês", value: formatCurrency(stats.revenueThisMonth) },
              ]}
            />
            <StatCard
              title="Conciliação"
              value={`${reconciliationEvaluatedTotal} registros avaliados`}
              change={`${stats.reconciliation.partial} parciais · ${stats.reconciliation.divergent} divergentes`}
              changeType={stats.reconciliation.divergent > 0 ? "negative" : "neutral"}
              icon={CheckCircle2}
              iconColor="text-success"
              additionalMetrics={[
                { label: "Pendente", value: stats.reconciliation.pending.toString() },
                { label: "Parcial", value: stats.reconciliation.partial.toString() },
                { label: "Conciliado", value: stats.reconciliation.reconciled.toString() },
                { label: "Divergente", value: stats.reconciliation.divergent.toString() },
                { label: "Não aplicável", value: stats.reconciliation.not_applicable.toString() },
              ]}
            />
          </div>
        </section>
      )}

      <RevenueChart />

      <RecentSales />
    </div>
  );
}
