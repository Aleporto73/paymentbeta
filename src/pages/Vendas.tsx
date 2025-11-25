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
  customer_name: string;
  customer_email: string;
  customer_cpf_cnpj: string | null;
  customer_phone: string | null;
  customer_state: string | null;
  value: number;
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
  
  const [tempFilters, setTempFilters] = useState({
    search: "",
    status: "CONFIRMED",
    period: "all",
    productId: "all",
  });
  
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    status: "CONFIRMED",
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
        .eq("user_id", user.id)
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
          customer_name,
          customer_email,
          customer_cpf_cnpj,
          customer_phone,
          customer_state,
          value,
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
        `, { count: "exact" })
        .eq("user_id", user.id);

      // Apply filters
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
        query = query.or(`customer_name.ilike.%${appliedFilters.search}%,customer_email.ilike.%${appliedFilters.search}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count } = await query;

      if (data) {
        const salesWithProductNames = data.map(sale => ({
          ...sale,
          product_name: (sale.products as any)?.name || "Produto não encontrado"
        }));
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
      status: "CONFIRMED",
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
      "Valor",
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

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
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

  const viewSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetailsModal(true);
  };

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
            <CardTitle>
              Lista de Vendas ({totalCount})
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
            <div className="text-center py-8">Carregando vendas...</div>
          ) : sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma venda encontrada
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
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale) => (
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
            <DialogTitle>Detalhes da Venda</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Data da Venda</label>
                  <p className="text-sm mt-1">
                    {format(new Date(selectedSale.created_at), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedSale.status)}</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Informações do Cliente</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nome</label>
                    <p className="text-sm mt-1">{selectedSale.customer_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-sm mt-1">{selectedSale.customer_email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">CPF/CNPJ</label>
                    <p className="text-sm mt-1">{selectedSale.customer_cpf_cnpj || "-"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                    <p className="text-sm mt-1">{selectedSale.customer_phone || "-"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Estado</label>
                    <p className="text-sm mt-1">{selectedSale.customer_state || "-"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Informações do Produto</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Produto</label>
                    <p className="text-sm mt-1">{selectedSale.product_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Valor</label>
                    <p className="text-sm mt-1 font-semibold">R$ {formatCurrency(selectedSale.value)}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Informações de Pagamento</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Método de Pagamento</label>
                    <p className="text-sm mt-1">{selectedSale.payment_method}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tipo de Cobrança</label>
                    <p className="text-sm mt-1">{selectedSale.billing_type}</p>
                  </div>
                  {selectedSale.installment_count && selectedSale.installment_count > 1 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Parcelas</label>
                      <p className="text-sm mt-1">{selectedSale.installment_count}x</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedSale.order_bumps_selected && selectedSale.order_bumps_selected.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Order Bumps</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Quantidade</label>
                      <p className="text-sm mt-1">{selectedSale.order_bumps_selected.length}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Valor Total</label>
                      <p className="text-sm mt-1">
                        R$ {formatCurrency(selectedSale.order_bumps_amount || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selectedSale.affiliate_code && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Informações de Afiliado</h3>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Código do Afiliado</label>
                    <p className="text-sm mt-1">{selectedSale.affiliate_code}</p>
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
