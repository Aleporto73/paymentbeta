import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";
import { Filter, X, Download, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfDay, subDays, format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Sale {
  id: string;
  asaas_payment_id?: string | null;
  customer_name: string;
  customer_email: string;
  customer_cpf_cnpj: string | null;
  customer_phone: string | null;
  customer_state: string | null;
  value: number;
  net_value?: number | null;
  discount_amount?: number | null;
  installment_fee_amount?: number | null;
  asaas_fee_amount?: number | null;
  affiliate_split_total?: number | null;
  producer_net_amount?: number | null;
  reconciliation_status?: string | null;
  reconciliation_notes?: string | null;
  status: string;
  created_at: string;
  payment_method: string;
  billing_type: string;
  product_name?: string;
  product_id?: string;
  affiliate_code?: string | null;
  order_bumps_selected?: string[] | null;
  order_bumps_amount?: number | null;
  installment_count?: number | null;
  affiliate_link_id?: string | null;
  estimated_commission_amount?: number | null;
  transaction_splits?: TransactionSplit[];
}

interface TransactionSplit {
  id?: string;
  transaction_id: string | null;
  asaas_payment_id: string | null;
  planned_amount: number | null;
  received_amount: number | null;
  status: string;
  wallet_id: string | null;
}

interface Product {
  id: string;
  name: string;
}

export default function Vendas() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Filtro rápido de exibição (client-side, não afeta busca/paginação no banco).
  // Padrão: esconder "Pendente" para reduzir ruído de checkouts abertos e não pagos.
  const [quickStatusFilter, setQuickStatusFilter] = useState<"all" | "RECEIVED" | "CONFIRMED" | "PENDING">("all");
  const [showPending, setShowPending] = useState(false);

  const [tempFilters, setTempFilters] = useState({
    search: "",
    status: "all",
    period: "all",
    productId: "all",
  });

  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    status: "all",
    period: "all",
    productId: "all",
  });

  useEffect(() => {
    fetchProducts();
    fetchSales();
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
    fetchSales();
  }, [appliedFilters]);

  useEffect(() => {
    fetchSales();
  }, [currentPage, itemsPerPage]);

  const fetchProducts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("products")
        .select("id, name")
        .order("name");

      if (data) {
        setProducts(data);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("transactions")
        .select(`
          id,
          asaas_payment_id,
          customer_name,
          customer_email,
          customer_cpf_cnpj,
          customer_phone,
          customer_state,
          value,
          net_value,
          discount_amount,
          installment_fee_amount,
          asaas_fee_amount,
          affiliate_split_total,
          producer_net_amount,
          reconciliation_status,
          reconciliation_notes,
          status,
          created_at,
          payment_method,
          billing_type,
          product_id,
          affiliate_code,
          order_bumps_selected,
          order_bumps_amount,
          installment_count,
          products (name)
        `, { count: "exact" });

      if (appliedFilters.status !== "all") {
        if (appliedFilters.status === "CONFIRMED") {
          // CONFIRMED includes both CONFIRMED and RECEIVED statuses
          query = query.in("status", ["CONFIRMED", "RECEIVED"]);
        } else {
          query = query.eq("status", appliedFilters.status);
        }
      }

      if (appliedFilters.productId !== "all") {
        query = query.eq("product_id", appliedFilters.productId);
      }

      if (appliedFilters.period !== "all") {
        let startDate;
        const now = new Date();

        switch (appliedFilters.period) {
          case "today":
            startDate = startOfDay(now);
            break;
          case "7days":
            startDate = startOfDay(subDays(now, 7));
            break;
          case "30days":
            startDate = startOfDay(subDays(now, 30));
            break;
        }

        if (startDate) {
          query = query.gte("created_at", startDate.toISOString());
        }
      }

      if (appliedFilters.search) {
        query = query.or(`customer_name.ilike.%${appliedFilters.search}%,customer_email.ilike.%${appliedFilters.search}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count } = await query;

      if (data) {
        const salesWithProductNames = data.map((sale: any) => ({
          ...sale,
          product_name: (sale.products as any)?.name || "Produto não encontrado"
        }));

        const affiliateSales = salesWithProductNames.filter(
          (sale) => sale.affiliate_code && sale.product_id && sale.customer_email
        );

        if (affiliateSales.length > 0) {
          const productIds = [...new Set(affiliateSales.map((sale) => sale.product_id))];
          const customerEmails = [...new Set(affiliateSales.map((sale) => sale.customer_email))];

          const { data: productSales } = await supabase
            .from("product_sales")
            .select("product_id, customer_email, sale_amount, affiliate_link_id, commission_amount, transaction_id, asaas_payment_id")
            .in("product_id", productIds)
            .in("customer_email", customerEmails)
            .not("commission_amount", "is", null);

          const commissionBySale = new Map<string, { affiliate_link_id: string | null; commission_amount: number | null }>();

          (productSales || []).forEach((productSale) => {
            if (productSale.transaction_id) {
              commissionBySale.set(`transaction:${productSale.transaction_id}`, {
                affiliate_link_id: productSale.affiliate_link_id,
                commission_amount: productSale.commission_amount,
              });
            }

            if (productSale.asaas_payment_id) {
              commissionBySale.set(`asaas:${productSale.asaas_payment_id}`, {
                affiliate_link_id: productSale.affiliate_link_id,
                commission_amount: productSale.commission_amount,
              });
            }

            const legacyKey = [
              productSale.product_id,
              productSale.customer_email,
              Number(productSale.sale_amount).toFixed(2),
              productSale.affiliate_link_id || "",
            ].join("|");

            commissionBySale.set(legacyKey, {
              affiliate_link_id: productSale.affiliate_link_id,
              commission_amount: productSale.commission_amount,
            });
          });

          salesWithProductNames.forEach((sale) => {
            if (!sale.affiliate_code) return;

            const key = [
              sale.product_id,
              sale.customer_email,
              Number(sale.value).toFixed(2),
              sale.affiliate_code,
            ].join("|");
            const commissionData =
              commissionBySale.get(`transaction:${sale.id}`) ||
              (sale.asaas_payment_id ? commissionBySale.get(`asaas:${sale.asaas_payment_id}`) : undefined) ||
              commissionBySale.get(key);

            if (commissionData) {
              sale.affiliate_link_id = commissionData.affiliate_link_id;
              sale.estimated_commission_amount = commissionData.commission_amount;
            }
          });
        }

        const transactionIds = salesWithProductNames.map((sale) => sale.id);
        const asaasPaymentIds = salesWithProductNames
          .map((sale) => sale.asaas_payment_id)
          .filter((paymentId): paymentId is string => Boolean(paymentId));
        const splitRowsByKey = new Map<string, TransactionSplit[]>();

        const appendSplitRows = (rows: TransactionSplit[] | null) => {
          (rows || []).forEach((split) => {
            const keys = [
              split.transaction_id ? `transaction:${split.transaction_id}` : null,
              split.asaas_payment_id ? `asaas:${split.asaas_payment_id}` : null,
            ].filter(Boolean) as string[];

            keys.forEach((key) => {
              const currentRows = splitRowsByKey.get(key) || [];
              if (!currentRows.some((row) => row.id && row.id === split.id)) {
                currentRows.push(split);
              }
              splitRowsByKey.set(key, currentRows);
            });
          });
        };

        if (transactionIds.length > 0) {
          const { data: splitRowsByTransaction } = await supabase
            .from("transaction_splits")
            .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount, status, wallet_id")
            .in("transaction_id", transactionIds);

          appendSplitRows((splitRowsByTransaction || []) as TransactionSplit[]);
        }

        if (asaasPaymentIds.length > 0) {
          const { data: splitRowsByPayment } = await supabase
            .from("transaction_splits")
            .select("id, transaction_id, asaas_payment_id, planned_amount, received_amount, status, wallet_id")
            .in("asaas_payment_id", asaasPaymentIds);

          appendSplitRows((splitRowsByPayment || []) as TransactionSplit[]);
        }

        salesWithProductNames.forEach((sale) => {
          const splitsByTransaction = splitRowsByKey.get(`transaction:${sale.id}`) || [];
          const splitsByPayment = sale.asaas_payment_id
            ? splitRowsByKey.get(`asaas:${sale.asaas_payment_id}`) || []
            : [];
          const splitMap = new Map<string, TransactionSplit>();

          [...splitsByTransaction, ...splitsByPayment].forEach((split, index) => {
            splitMap.set(split.id || `${split.transaction_id}-${split.asaas_payment_id}-${index}`, split);
          });

          sale.transaction_splits = Array.from(splitMap.values());
        });

        setSales(salesWithProductNames);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error("Error fetching sales:", error);
      toast({
        title: "Erro ao carregar vendas",
        description: "Não foi possível carregar as vendas. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters(tempFilters);
  };

  const clearFilters = () => {
    const defaultFilters = {
      search: "",
      status: "all",
      period: "all",
      productId: "all",
    };
    setCurrentPage(1);
    setTempFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const exportToCSV = () => {
    const headers = [
      "Data",
      "Cliente",
      "Email",
      "CPF/CNPJ",
      "Telefone",
      "Estado",
      "Produto",
      "Receita cobrada",
      "Status",
      "Método de Pagamento",
      "Tipo de Cobrança",
      "Parcelas",
      "Order Bumps",
      "Valor Order Bumps",
      "Código Afiliado"
    ];

    const csvData = sales.map(sale => [
      format(new Date(sale.created_at), "dd/MM/yyyy HH:mm"),
      sale.customer_name,
      sale.customer_email,
      sale.customer_cpf_cnpj || "-",
      sale.customer_phone || "-",
      sale.customer_state || "-",
      sale.product_name || "-",
      `R$ ${formatCurrency(sale.value)}`,
      sale.status,
      sale.payment_method,
      sale.billing_type,
      sale.installment_count?.toString() || "1",
      sale.order_bumps_selected?.length || "0",
      sale.order_bumps_amount ? `R$ ${formatCurrency(sale.order_bumps_amount)}` : "R$ 0,00",
      sale.affiliate_code || "-"
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `vendas_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportação concluída",
      description: "As vendas foram exportadas com sucesso.",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      PENDING: { label: "Pendente", variant: "secondary" },
      CONFIRMED: { label: "Aprovado", variant: "default" },
      RECEIVED: { label: "Recebido", variant: "default" },
      OVERDUE: { label: "Vencido", variant: "destructive" },
      REFUNDED: { label: "Reembolsado", variant: "outline" },
    };

    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getReconciliationBadge = (status?: string | null) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendente", variant: "secondary" },
      partial: { label: "Parcial", variant: "outline" },
      reconciled: { label: "Conciliado", variant: "default" },
      divergent: { label: "Divergente", variant: "destructive" },
      not_applicable: { label: "Não aplicável", variant: "secondary" },
    };
    const normalizedStatus = status || "pending";
    const config = statusConfig[normalizedStatus] || { label: normalizedStatus, variant: "outline" };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatMoneyOrDash = (value?: number | null) => {
    if (value === null || value === undefined) {
      return "—";
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? `R$ ${formatCurrency(parsedValue)}` : "—";
  };

  const sumMoney = (values: Array<number | null | undefined>) => {
    const validValues = values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    if (validValues.length === 0) {
      return null;
    }

    return validValues.reduce((sum, value) => sum + value, 0);
  };

  const getSplitPlannedAmount = (sale: Sale) => {
    const transactionPlannedAmount = Number(sale.affiliate_split_total);

    if (Number.isFinite(transactionPlannedAmount) && transactionPlannedAmount > 0) {
      return transactionPlannedAmount;
    }

    return sumMoney((sale.transaction_splits || []).map((split) => split.planned_amount));
  };

  const getSplitReceivedAmount = (sale: Sale) =>
    sumMoney((sale.transaction_splits || []).map((split) => split.received_amount));

  const hasPlannedSplit = (sale: Sale) => {
    const plannedAmount = getSplitPlannedAmount(sale);

    return Boolean((plannedAmount && plannedAmount > 0) || (sale.transaction_splits || []).length > 0);
  };

  const viewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetailsModal(true);
  };

  // Aplica o filtro rápido de exibição sobre a página já carregada.
  // Selecionar um status específico sempre mostra exatamente aquele status;
  // com "Todos" selecionado, o toggle "Mostrar pendentes" decide se PENDING aparece.
  const visibleSales = sales.filter((sale) => {
    if (quickStatusFilter !== "all") {
      return sale.status === quickStatusFilter;
    }
    if (!showPending && sale.status === "PENDING") {
      return false;
    }
    return true;
  });

  const hiddenPendingCount =
    quickStatusFilter === "all" && !showPending
      ? sales.filter((sale) => sale.status === "PENDING").length
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize todas as suas vendas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filtros
          </Button>
          <Button onClick={exportToCSV} disabled={sales.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Filtros
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Buscar</label>
                <Input
                  placeholder="Nome ou email do cliente"
                  value={tempFilters.search}
                  onChange={(e) => setTempFilters({ ...tempFilters, search: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select
                  value={tempFilters.status}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="CONFIRMED">Aprovado</SelectItem>
                    <SelectItem value="PENDING">Pendente</SelectItem>
                    <SelectItem value="OVERDUE">Vencido</SelectItem>
                    <SelectItem value="REFUNDED">Reembolsado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Período</label>
                <Select
                  value={tempFilters.period}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, period: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as datas</SelectItem>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7days">Últimos 7 dias</SelectItem>
                    <SelectItem value="30days">Últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Produto</label>
                <Select
                  value={tempFilters.productId}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, productId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os produtos</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button onClick={applyFilters}>
                Buscar
              </Button>
              <Button variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Lista de Vendas ({totalCount})
              </CardTitle>
              {hiddenPendingCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {hiddenPendingCount} pendente{hiddenPendingCount > 1 ? "s" : ""} oculta{hiddenPendingCount > 1 ? "s" : ""} nesta página
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Itens por página:</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select
              value={quickStatusFilter}
              onValueChange={(value) => setQuickStatusFilter(value as typeof quickStatusFilter)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="RECEIVED">Recebido</SelectItem>
                <SelectItem value="CONFIRMED">Aprovado</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showPending ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPending((prev) => !prev)}
              disabled={quickStatusFilter !== "all"}
            >
              {showPending ? "Ocultar pendentes" : "Mostrar pendentes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Carregando vendas...</div>
          ) : sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma venda encontrada
            </div>
          ) : visibleSales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma venda visível com o filtro atual.
              {hiddenPendingCount > 0 && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => setShowPending(true)}
                  >
                    Mostrar pendentes
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Receita cobrada</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>
                          {format(new Date(sale.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{sale.customer_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {sale.customer_email}
                          </div>
                        </TableCell>
                        <TableCell>{sale.product_name}</TableCell>
                        <TableCell>R$ {formatCurrency(sale.value)}</TableCell>
                        <TableCell>{getStatusBadge(sale.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewSaleDetails(sale)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Detalhes da Venda</DialogTitle>
          </DialogHeader>
          {selectedSale && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                  <div>
                    <p className="text-xs text-muted-foreground">Data da Venda</p>
                    <p className="text-sm font-medium mt-1">
                      {format(new Date(selectedSale.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1">{getStatusBadge(selectedSale.status)}</div>
                  </div>
                </div>

                <div className="pb-4 border-b">
                  <h3 className="text-base font-semibold mb-3">Informações do Cliente</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.customer_email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPF/CNPJ</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.customer_cpf_cnpj || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.customer_phone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Estado</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.customer_state || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="pb-4 border-b">
                  <h3 className="text-base font-semibold mb-3">Informações do Produto</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Produto</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.product_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Receita cobrada</p>
                      <p className="text-sm font-semibold mt-1">R$ {formatCurrency(selectedSale.value)}</p>
                    </div>
                  </div>
                </div>

                <div className="pb-4 border-b">
                  <h3 className="text-base font-semibold mb-3">Informações de Pagamento</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Método de Pagamento</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.payment_method}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tipo de Cobrança</p>
                      <p className="text-sm font-medium mt-1">{selectedSale.billing_type}</p>
                    </div>
                    {selectedSale.installment_count && selectedSale.installment_count > 1 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Parcelas</p>
                        <p className="text-sm font-medium mt-1">{selectedSale.installment_count}x</p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedSale.order_bumps_selected && selectedSale.order_bumps_selected.length > 0 && (
                  <div className="pb-4 border-b">
                    <h3 className="text-base font-semibold mb-3">Order Bumps</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Quantidade</p>
                        <p className="text-sm font-medium mt-1">{selectedSale.order_bumps_selected.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Valor Total</p>
                        <p className="text-sm font-medium mt-1">
                          R$ {formatCurrency(selectedSale.order_bumps_amount || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {(() => {
                  const splitPlannedAmount = getSplitPlannedAmount(selectedSale);
                  const splitReceivedAmount = getSplitReceivedAmount(selectedSale);
                  const plannedSplitExists = hasPlannedSplit(selectedSale);

                  return (
                    <div className="pb-4 border-b">
                      <h3 className="text-base font-semibold mb-3">Conciliação financeira</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Receita cobrada</p>
                          <p className="text-sm font-semibold mt-1">{formatMoneyOrDash(selectedSale.value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Desconto aplicado</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(selectedSale.discount_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Taxa de parcelamento</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(selectedSale.installment_fee_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Líquido Asaas registrado</p>
                          <p className="text-sm font-semibold mt-1">{formatMoneyOrDash(selectedSale.net_value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Taxa Asaas estimada</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(selectedSale.asaas_fee_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Comissão bruta estimada</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(selectedSale.estimated_commission_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Split planejado</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(splitPlannedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Split recebido Asaas</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(splitReceivedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Líquido estimado do produtor</p>
                          <p className="text-sm font-medium mt-1">{formatMoneyOrDash(selectedSale.producer_net_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Status da conciliação</p>
                          <div className="mt-1">{getReconciliationBadge(selectedSale.reconciliation_status)}</div>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Notas de conciliação</p>
                          <p className="text-sm font-medium mt-1">{selectedSale.reconciliation_notes || "—"}</p>
                        </div>
                      </div>

                      {!plannedSplitExists && (
                        <p className="text-sm text-muted-foreground mt-3">
                          Sem split planejado para esta venda
                        </p>
                      )}

                      {plannedSplitExists && splitReceivedAmount === null && (
                        <p className="text-sm text-muted-foreground mt-3">
                          Split planejado aguardando retorno detalhado do Asaas
                        </p>
                      )}
                    </div>
                  );
                })()}

                {selectedSale.affiliate_code && (
                  <div>
                    <h3 className="text-base font-semibold mb-3">Informações de Afiliado</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Código/vínculo do afiliado</p>
                        <p className="text-sm font-medium mt-1">{selectedSale.affiliate_code}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
