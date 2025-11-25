import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Filter, X, Download, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfDay, subDays, format } from "date-fns";
import { formatCurrency, formatCPF, formatPhone } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  asaas_customer_id: string;
  name: string;
  email: string;
  cpf_cnpj: string | null;
  phone: string | null;
  mobile_phone: string | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  province: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomerPurchase {
  product_name: string;
  value: number;
  status: string;
  created_at: string;
  payment_method: string;
}

export default function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [customerPurchases, setCustomerPurchases] = useState<CustomerPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  const [tempFilters, setTempFilters] = useState({
    search: "",
    state: "all",
    period: "all",
  });
  
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    state: "all",
    period: "all",
  });

  const brazilianStates = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ];

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchCustomers();
  }, [appliedFilters]);

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, itemsPerPage]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("asaas_customers")
        .select("*", { count: "exact" })
        .eq("user_id", user.id);

      if (appliedFilters.state !== "all") {
        query = query.eq("state", appliedFilters.state);
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
        query = query.or(`name.ilike.%${appliedFilters.search}%,email.ilike.%${appliedFilters.search}%,cpf_cnpj.ilike.%${appliedFilters.search}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count } = await query;

      if (data) {
        setCustomers(data);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast({
        title: "Erro ao carregar clientes",
        description: "Não foi possível carregar os clientes. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerPurchases = async (asaasCustomerId: string) => {
    setLoadingPurchases(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("transactions")
        .select(`
          value,
          status,
          created_at,
          payment_method,
          products (name)
        `)
        .eq("user_id", user.id)
        .eq("asaas_customer_id", asaasCustomerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const purchasesWithProductNames = (data || []).map(purchase => ({
        product_name: (purchase.products as any)?.name || "Produto não encontrado",
        value: purchase.value,
        status: purchase.status,
        created_at: purchase.created_at,
        payment_method: purchase.payment_method,
      }));

      setCustomerPurchases(purchasesWithProductNames);
    } catch (error) {
      console.error("Error fetching customer purchases:", error);
      toast({
        title: "Erro ao carregar compras",
        description: "Não foi possível carregar as compras do cliente.",
        variant: "destructive",
      });
    } finally {
      setLoadingPurchases(false);
    }
  };

  const applyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters(tempFilters);
  };

  const clearFilters = () => {
    const defaultFilters = {
      search: "",
      state: "all",
      period: "all",
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
      "Nome",
      "Email",
      "CPF/CNPJ",
      "Telefone",
      "Celular",
      "Estado",
      "Cidade",
      "Endereço",
      "Número",
      "Complemento",
      "CEP",
      "Bairro",
      "Data de Cadastro"
    ];

    const csvData = customers.map(customer => [
      customer.name,
      customer.email,
      customer.cpf_cnpj || "-",
      customer.phone || "-",
      customer.mobile_phone || "-",
      customer.state || "-",
      customer.city || "-",
      customer.address || "-",
      customer.address_number || "-",
      customer.complement || "-",
      customer.postal_code || "-",
      customer.province || "-",
      format(new Date(customer.created_at), "dd/MM/yyyy HH:mm")
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `clientes_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportação concluída",
      description: "Os clientes foram exportados com sucesso.",
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

  const viewCustomerDetails = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailsModal(true);
    await fetchCustomerPurchases(customer.asaas_customer_id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize todos os seus clientes
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
          <Button onClick={exportToCSV} disabled={customers.length === 0}>
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
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Buscar</label>
                <Input
                  placeholder="Nome, email ou CPF/CNPJ"
                  value={tempFilters.search}
                  onChange={(e) => setTempFilters({ ...tempFilters, search: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Estado</label>
                <Select
                  value={tempFilters.state}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, state: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem>
                    {brazilianStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
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
              Lista de Clientes ({totalCount})
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
            <div className="text-center py-8">Carregando clientes...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum cliente encontrado
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {customer.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          {customer.cpf_cnpj ? formatCPF(customer.cpf_cnpj) : "-"}
                        </TableCell>
                        <TableCell>
                          {customer.mobile_phone 
                            ? formatPhone(customer.mobile_phone)
                            : customer.phone 
                              ? formatPhone(customer.phone)
                              : "-"}
                        </TableCell>
                        <TableCell>{customer.state || "-"}</TableCell>
                        <TableCell>
                          {format(new Date(customer.created_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewCustomerDetails(customer)}
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

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-6">
              {/* Customer Details */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações do Cliente</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nome</label>
                    <p className="text-sm mt-1">{selectedCustomer.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-sm mt-1">{selectedCustomer.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">CPF/CNPJ</label>
                    <p className="text-sm mt-1">
                      {selectedCustomer.cpf_cnpj ? formatCPF(selectedCustomer.cpf_cnpj) : "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                    <p className="text-sm mt-1">
                      {selectedCustomer.phone ? formatPhone(selectedCustomer.phone) : "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Celular</label>
                    <p className="text-sm mt-1">
                      {selectedCustomer.mobile_phone ? formatPhone(selectedCustomer.mobile_phone) : "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Data de Cadastro</label>
                    <p className="text-sm mt-1">
                      {format(new Date(selectedCustomer.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Address */}
              {(selectedCustomer.address || selectedCustomer.city || selectedCustomer.state) && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Endereço</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedCustomer.postal_code && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">CEP</label>
                        <p className="text-sm mt-1">{selectedCustomer.postal_code}</p>
                      </div>
                    )}
                    {selectedCustomer.address && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Logradouro</label>
                        <p className="text-sm mt-1">{selectedCustomer.address}</p>
                      </div>
                    )}
                    {selectedCustomer.address_number && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Número</label>
                        <p className="text-sm mt-1">{selectedCustomer.address_number}</p>
                      </div>
                    )}
                    {selectedCustomer.complement && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Complemento</label>
                        <p className="text-sm mt-1">{selectedCustomer.complement}</p>
                      </div>
                    )}
                    {selectedCustomer.province && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Bairro</label>
                        <p className="text-sm mt-1">{selectedCustomer.province}</p>
                      </div>
                    )}
                    {selectedCustomer.city && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cidade</label>
                        <p className="text-sm mt-1">{selectedCustomer.city}</p>
                      </div>
                    )}
                    {selectedCustomer.state && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Estado</label>
                        <p className="text-sm mt-1">{selectedCustomer.state}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Purchase History */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Histórico de Compras</h3>
                {loadingPurchases ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando compras...
                  </div>
                ) : customerPurchases.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma compra encontrada para este cliente
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerPurchases.map((purchase, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="text-sm">
                                {format(new Date(purchase.created_at), "dd/MM/yyyy")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(purchase.created_at), "HH:mm")}
                              </div>
                            </TableCell>
                            <TableCell>{purchase.product_name}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                R$ {formatCurrency(purchase.value)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm capitalize">
                                {purchase.payment_method}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(purchase.status)}
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
