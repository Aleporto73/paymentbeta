import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Filter, X, Download, Eye, ChevronLeft, ChevronRight, Ban, CheckCircle } from "lucide-react";
import { startOfDay, subDays, format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Subscription {
  id: string;
  asaas_subscription_id: string;
  asaas_customer_id: string;
  status: string;
  value: number;
  cycle: string;
  billing_type: string;
  next_due_date: string | null;
  cancelled_at: string | null;
  created_at: string;
  description: string | null;
  product_id: string | null;
  product_name?: string;
  affiliate_code?: string | null;
}

interface Product {
  id: string;
  name: string;
}

export default function Assinaturas() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
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
    fetchSubscriptions();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchSubscriptions();
  }, [appliedFilters]);

  useEffect(() => {
    fetchSubscriptions();
  }, [currentPage, itemsPerPage]);

  const fetchProducts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");

      if (data) {
        setProducts(data);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("subscriptions")
        .select(`
          id,
          asaas_subscription_id,
          asaas_customer_id,
          status,
          value,
          cycle,
          billing_type,
          next_due_date,
          cancelled_at,
          created_at,
          description,
          product_id,
          affiliate_code,
          products (name)
        `, { count: "exact" })
        .eq("user_id", user.id);

      if (appliedFilters.status !== "all") {
        query = query.eq("status", appliedFilters.status);
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
        query = query.ilike("description", `%${appliedFilters.search}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count } = await query;

      if (data) {
        const subscriptionsWithProductNames = data.map(sub => ({
          ...sub,
          product_name: (sub.products as any)?.name || "Produto não encontrado"
        }));
        setSubscriptions(subscriptionsWithProductNames);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      toast({
        title: "Erro ao carregar assinaturas",
        description: "Não foi possível carregar as assinaturas. Tente novamente.",
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

  const handleToggleSubscription = async (subscription: Subscription) => {
    const isActive = subscription.status === "ACTIVE";
    const action = isActive ? "cancelar" : "reativar";
    
    if (!confirm(`Deseja realmente ${action} esta assinatura?`)) {
      return;
    }

    setCancellingId(subscription.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          subscriptionId: subscription.id,
          asaasSubscriptionId: subscription.asaas_subscription_id,
          cancel: isActive
        }
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Assinatura ${isActive ? 'cancelada' : 'reativada'} com sucesso.`,
      });

      fetchSubscriptions();
    } catch (error) {
      console.error(`Error toggling subscription:`, error);
      toast({
        title: "Erro",
        description: `Não foi possível ${action} a assinatura. Tente novamente.`,
        variant: "destructive",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Data Criação",
      "ID Asaas",
      "Produto",
      "Descrição",
      "Valor",
      "Ciclo",
      "Status",
      "Tipo de Cobrança",
      "Próximo Vencimento",
      "Data Cancelamento",
      "Código Afiliado"
    ];

    const csvData = subscriptions.map(sub => [
      format(new Date(sub.created_at), "dd/MM/yyyy HH:mm"),
      sub.asaas_subscription_id,
      sub.product_name || "-",
      sub.description || "-",
      `R$ ${formatCurrency(sub.value)}`,
      sub.cycle,
      sub.status,
      sub.billing_type,
      sub.next_due_date ? format(new Date(sub.next_due_date), "dd/MM/yyyy") : "-",
      sub.cancelled_at ? format(new Date(sub.cancelled_at), "dd/MM/yyyy") : "-",
      sub.affiliate_code || "-"
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `assinaturas_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportação concluída",
      description: "As assinaturas foram exportadas com sucesso.",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      ACTIVE: { label: "Ativa", variant: "default" },
      INACTIVE: { label: "Inativa", variant: "secondary" },
      EXPIRED: { label: "Expirada", variant: "destructive" },
      CANCELED: { label: "Cancelada", variant: "outline" },
    };

    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const fetchSubscriptionPayments = async (asaasCustomerId: string) => {
    setLoadingPayments(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('asaas_customer_id', asaasCustomerId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSubscriptionPayments(data || []);
    } catch (error) {
      console.error('Error fetching subscription payments:', error);
      toast({
        title: "Erro ao carregar pagamentos",
        description: "Não foi possível carregar o histórico de pagamentos.",
        variant: "destructive",
      });
    } finally {
      setLoadingPayments(false);
    }
  };

  const viewSubscriptionDetails = async (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setShowDetailsModal(true);
    await fetchSubscriptionPayments(subscription.asaas_customer_id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assinaturas</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize todas as suas assinaturas
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
          <Button onClick={exportToCSV} disabled={subscriptions.length === 0}>
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
                  placeholder="Descrição da assinatura"
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
                    <SelectItem value="ACTIVE">Ativa</SelectItem>
                    <SelectItem value="INACTIVE">Inativa</SelectItem>
                    <SelectItem value="EXPIRED">Expirada</SelectItem>
                    <SelectItem value="CANCELED">Cancelada</SelectItem>
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
            <CardTitle>
              Lista de Assinaturas ({totalCount})
            </CardTitle>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Carregando assinaturas...</div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma assinatura encontrada
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Ciclo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((subscription) => (
                      <TableRow key={subscription.id}>
                        <TableCell>
                          {format(new Date(subscription.created_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{subscription.product_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {subscription.description || "Sem descrição"}
                          </div>
                        </TableCell>
                        <TableCell>R$ {formatCurrency(subscription.value)}</TableCell>
                        <TableCell className="capitalize">{subscription.cycle}</TableCell>
                        <TableCell>{getStatusBadge(subscription.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewSubscriptionDetails(subscription)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver detalhes
                            </Button>
                            <Button
                              variant={subscription.status === "ACTIVE" ? "destructive" : "default"}
                              size="sm"
                              onClick={() => handleToggleSubscription(subscription)}
                              disabled={cancellingId === subscription.id}
                            >
                              {subscription.status === "ACTIVE" ? (
                                <>
                                  <Ban className="h-4 w-4 mr-2" />
                                  {cancellingId === subscription.id ? "Cancelando..." : "Cancelar"}
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  {cancellingId === subscription.id ? "Ativando..." : "Ativar"}
                                </>
                              )}
                            </Button>
                          </div>
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

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Assinatura</DialogTitle>
          </DialogHeader>
          {selectedSubscription && (
            <div className="space-y-6">
              {/* Subscription Details */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações da Assinatura</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">ID Asaas</label>
                    <p className="text-sm mt-1">{selectedSubscription.asaas_subscription_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p className="text-sm mt-1">{getStatusBadge(selectedSubscription.status)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Produto</label>
                    <p className="text-sm mt-1">{selectedSubscription.product_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Valor</label>
                    <p className="text-sm mt-1">R$ {formatCurrency(selectedSubscription.value)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Ciclo</label>
                    <p className="text-sm mt-1 capitalize">{selectedSubscription.cycle}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tipo de Cobrança</label>
                    <p className="text-sm mt-1">{selectedSubscription.billing_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Data de Criação</label>
                    <p className="text-sm mt-1">
                      {format(new Date(selectedSubscription.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Próximo Vencimento</label>
                    <p className="text-sm mt-1">
                      {selectedSubscription.next_due_date
                        ? format(new Date(selectedSubscription.next_due_date), "dd/MM/yyyy")
                        : "-"}
                    </p>
                  </div>
                  {selectedSubscription.cancelled_at && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Data de Cancelamento</label>
                      <p className="text-sm mt-1">
                        {format(new Date(selectedSubscription.cancelled_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                  )}
                  {selectedSubscription.affiliate_code && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Código de Afiliado</label>
                      <p className="text-sm mt-1">{selectedSubscription.affiliate_code}</p>
                    </div>
                  )}
                  {selectedSubscription.description && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                      <p className="text-sm mt-1">{selectedSubscription.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment History */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Histórico de Pagamentos</h3>
                {loadingPayments ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando histórico...
                  </div>
                ) : subscriptionPayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum pagamento encontrado para esta assinatura
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Vencimento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptionPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <div className="text-sm">
                                {format(new Date(payment.created_at), "dd/MM/yyyy")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(payment.created_at), "HH:mm")}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                R$ {formatCurrency(payment.value)}
                              </div>
                              {payment.installment_count && payment.installment_count > 1 && (
                                <div className="text-xs text-muted-foreground">
                                  {payment.installment_count}x de R$ {formatCurrency(payment.installment_value || 0)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm capitalize">
                                {payment.payment_method === "PIX" ? "PIX" : payment.billing_type}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(payment.status)}
                            </TableCell>
                            <TableCell>
                              {payment.due_date ? (
                                <div className="text-sm">
                                  {format(new Date(payment.due_date), "dd/MM/yyyy")}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
