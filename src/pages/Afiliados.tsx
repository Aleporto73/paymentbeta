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
import { toast } from "@/hooks/use-toast";

interface Affiliate {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  user_id: string;
}

interface AffiliateProduct {
  product_id: string;
  product_name: string;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
}

export default function Afiliados() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [affiliateProducts, setAffiliateProducts] = useState<AffiliateProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  const [tempFilters, setTempFilters] = useState({
    search: "",
    status: "all",
    period: "all",
  });
  
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    status: "all",
    period: "all",
  });

  useEffect(() => {
    fetchAffiliates();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchAffiliates();
  }, [appliedFilters]);

  useEffect(() => {
    fetchAffiliates();
  }, [currentPage, itemsPerPage]);

  const fetchAffiliates = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("affiliates")
        .select("*", { count: "exact" })
        .eq("user_id", user.id);

      if (appliedFilters.status !== "all") {
        const isActive = appliedFilters.status === "active";
        query = query.eq("is_active", isActive);
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
        query = query.or(`name.ilike.%${appliedFilters.search}%,email.ilike.%${appliedFilters.search}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count } = await query;

      if (data) {
        setAffiliates(data);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error("Error fetching affiliates:", error);
      toast({
        title: "Erro ao carregar afiliados",
        description: "Não foi possível carregar os afiliados. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAffiliateProducts = async (affiliateId: string) => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from("product_affiliate_links")
        .select(`
          product_id,
          commission_type,
          commission_value,
          is_active,
          products (name)
        `)
        .eq("affiliate_id", affiliateId);

      if (error) throw error;

      const productsWithNames = (data || []).map(link => ({
        product_id: link.product_id,
        product_name: (link.products as any)?.name || "Produto não encontrado",
        commission_type: link.commission_type,
        commission_value: link.commission_value,
        is_active: link.is_active,
      }));

      setAffiliateProducts(productsWithNames);
    } catch (error) {
      console.error("Error fetching affiliate products:", error);
      toast({
        title: "Erro ao carregar produtos",
        description: "Não foi possível carregar os produtos do afiliado.",
        variant: "destructive",
      });
    } finally {
      setLoadingProducts(false);
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
      "Status",
      "Data de Cadastro"
    ];

    const csvData = affiliates.map(affiliate => [
      affiliate.name,
      affiliate.email,
      affiliate.is_active ? "Ativo" : "Inativo",
      format(new Date(affiliate.created_at), "dd/MM/yyyy HH:mm")
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `afiliados_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportação concluída",
      description: "Os afiliados foram exportados com sucesso.",
    });
  };

  const formatCommission = (type: string, value: number) => {
    if (type === 'percentage') {
      return `${value}%`;
    }
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const viewAffiliateDetails = async (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setShowDetailsModal(true);
    await fetchAffiliateProducts(affiliate.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Afiliados</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize todos os seus afiliados
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
          <Button onClick={exportToCSV} disabled={affiliates.length === 0}>
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
                  placeholder="Nome ou email do afiliado"
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
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
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
              Lista de Afiliados ({totalCount})
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
            <div className="text-center py-8">Carregando afiliados...</div>
          ) : affiliates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum afiliado encontrado
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affiliates.map((affiliate) => (
                      <TableRow key={affiliate.id}>
                        <TableCell className="font-medium">{affiliate.name}</TableCell>
                        <TableCell>{affiliate.email}</TableCell>
                        <TableCell>
                          <Badge variant={affiliate.is_active ? "default" : "secondary"}>
                            {affiliate.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(affiliate.created_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewAffiliateDetails(affiliate)}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Afiliado</DialogTitle>
          </DialogHeader>
          {selectedAffiliate && (
            <div className="space-y-6">
              {/* Affiliate Details */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações do Afiliado</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nome</label>
                    <p className="text-sm mt-1">{selectedAffiliate.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="text-sm mt-1">{selectedAffiliate.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p className="text-sm mt-1">
                      <Badge variant={selectedAffiliate.is_active ? "default" : "secondary"}>
                        {selectedAffiliate.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Data de Cadastro</label>
                    <p className="text-sm mt-1">
                      {format(new Date(selectedAffiliate.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Products */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Produtos Vinculados</h3>
                {loadingProducts ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando produtos...
                  </div>
                ) : affiliateProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum produto vinculado a este afiliado
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead>Tipo de Comissão</TableHead>
                          <TableHead>Valor da Comissão</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {affiliateProducts.map((product) => (
                          <TableRow key={product.product_id}>
                            <TableCell className="font-medium">
                              {product.product_name}
                            </TableCell>
                            <TableCell className="capitalize">
                              {product.commission_type === 'percentage' ? 'Percentual' : 'Fixo'}
                            </TableCell>
                            <TableCell>
                              {formatCommission(product.commission_type, product.commission_value)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={product.is_active ? "default" : "secondary"}>
                                {product.is_active ? "Ativo" : "Inativo"}
                              </Badge>
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
