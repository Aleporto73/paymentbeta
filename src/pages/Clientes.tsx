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
  cpf_cnpj: string;
  name: string;
  phone: string | null;
  mobile_phone: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  postal_code: string | null;
  province: string | null;
  first_purchase_date: string;
  total_purchases: number;
  emails: string[];
  products: Array<{
    name: string;
    value: number;
    purchase_date: string;
  }>;
}

export default function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
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

      // Buscar todas as transações aprovadas
      let query = supabase
        .from("transactions")
        .select(`
          customer_cpf_cnpj,
          customer_name,
          customer_email,
          customer_phone,
          customer_state,
          created_at,
          value,
          products (name)
        `)
        .eq("user_id", user.id)
        .in("status", ["CONFIRMED", "RECEIVED"])
        .not("customer_cpf_cnpj", "is", null);

      if (appliedFilters.state !== "all") {
        query = query.eq("customer_state", appliedFilters.state);
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
        query = query.or(`customer_name.ilike.%${appliedFilters.search}%,customer_email.ilike.%${appliedFilters.search}%,customer_cpf_cnpj.ilike.%${appliedFilters.search}%`);
      }

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por CPF/CNPJ
      const customerMap = new Map<string, Customer>();

      (data || []).forEach((transaction: any) => {
        const cpfCnpj = transaction.customer_cpf_cnpj;
        
        if (!customerMap.has(cpfCnpj)) {
          customerMap.set(cpfCnpj, {
            cpf_cnpj: cpfCnpj,
            name: transaction.customer_name,
            phone: transaction.customer_phone,
            mobile_phone: null,
            state: transaction.customer_state,
            city: null,
            address: null,
            address_number: null,
            complement: null,
            postal_code: null,
            province: null,
            first_purchase_date: transaction.created_at,
            total_purchases: 0,
            emails: [],
            products: [],
          });
        }

        const customer = customerMap.get(cpfCnpj)!;
        
        // Adicionar email se não existir na lista
        if (transaction.customer_email && !customer.emails.includes(transaction.customer_email)) {
          customer.emails.push(transaction.customer_email);
        }

        // Adicionar produto
        customer.products.push({
          name: transaction.products?.name || "Produto não encontrado",
          value: transaction.value,
          purchase_date: transaction.created_at,
        });

        customer.total_purchases++;
      });

      // Converter para array
      let customersArray = Array.from(customerMap.values());

      // Ordenar por data da primeira compra
      customersArray.sort((a, b) => 
        new Date(b.first_purchase_date).getTime() - new Date(a.first_purchase_date).getTime()
      );

      // Paginação
      const totalCustomers = customersArray.length;
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage;
      customersArray = customersArray.slice(from, to);

      setCustomers(customersArray);
      setTotalCount(totalCustomers);
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
      "CPF/CNPJ",
      "Emails Utilizados",
      "Telefone",
      "Estado",
      "Total de Compras",
      "Data da Primeira Compra"
    ];

    const csvData = customers.map(customer => [
      customer.name,
      customer.cpf_cnpj || "-",
      customer.emails.join("; "),
      customer.phone || customer.mobile_phone || "-",
      customer.state || "-",
      customer.total_purchases.toString(),
      format(new Date(customer.first_purchase_date), "dd/MM/yyyy HH:mm")
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

  const viewCustomerDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailsModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize todos os seus clientes com compras aprovadas
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
                      <TableHead>Total de Compras</TableHead>
                      <TableHead>Primeira Compra</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.cpf_cnpj}>
                        <TableCell>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {customer.emails[0]}
                            {customer.emails.length > 1 && (
                              <span className="ml-1 text-xs">
                                (+{customer.emails.length - 1} email{customer.emails.length > 2 ? 's' : ''})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatCPF(customer.cpf_cnpj)}
                        </TableCell>
                        <TableCell>
                          {customer.phone 
                            ? formatPhone(customer.phone)
                            : customer.mobile_phone 
                              ? formatPhone(customer.mobile_phone)
                              : "-"}
                        </TableCell>
                        <TableCell>{customer.state || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{customer.total_purchases}</Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(customer.first_purchase_date), "dd/MM/yyyy")}
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
                    <label className="text-sm font-medium text-muted-foreground">CPF/CNPJ</label>
                    <p className="text-sm mt-1">
                      {formatCPF(selectedCustomer.cpf_cnpj)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                    <p className="text-sm mt-1">
                      {selectedCustomer.phone ? formatPhone(selectedCustomer.phone) : "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Estado</label>
                    <p className="text-sm mt-1">{selectedCustomer.state || "-"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Total de Compras</label>
                    <p className="text-sm mt-1">
                      <Badge variant="secondary">{selectedCustomer.total_purchases}</Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Primeira Compra</label>
                    <p className="text-sm mt-1">
                      {format(new Date(selectedCustomer.first_purchase_date), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Emails utilizados */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Emails Utilizados nas Compras</h3>
                <div className="rounded-md border p-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedCustomer.emails.map((email, index) => (
                      <Badge key={index} variant="outline" className="text-sm">
                        {email}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Products Purchased */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Produtos Comprados</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data da Compra</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCustomer.products.map((product, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(product.purchase_date), "dd/MM/yyyy")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(product.purchase_date), "HH:mm")}
                            </div>
                          </TableCell>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>
                            <div className="font-medium">
                              R$ {formatCurrency(product.value)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
