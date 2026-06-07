import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { AffiliateAnalytics } from "@/components/affiliates/AffiliateAnalytics";
import { Filter, X, Download, Eye, ChevronLeft, ChevronRight, Users, DollarSign, TrendingUp, Copy, ExternalLink } from "lucide-react";
import { startOfDay, subDays, startOfMonth, format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Affiliate {
  id: string;
  name: string;
  email: string;
  asaas_wallet_id: string | null;
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
  affiliate_url?: string;
  link_id?: string;
}

interface AffiliateMetrics {
  activeCount: number;
  monthlyCommissions: number;
  averageTicket: number;
  topAffiliates: {
    name: string;
    sales: number;
    commissions: number;
  }[];
}

interface LinkStats {
  clicks: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
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
  const [metrics, setMetrics] = useState<AffiliateMetrics>({
    activeCount: 0,
    monthlyCommissions: 0,
    averageTicket: 0,
    topAffiliates: [],
  });
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [linkStats, setLinkStats] = useState<Record<string, LinkStats>>({});
  const [loadingLinkStats, setLoadingLinkStats] = useState(false);
  
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
    fetchMetrics();
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
        .select("*", { count: "exact" });

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

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Count active affiliates
      const { count: activeCount } = await supabase
        .from("affiliates")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Get monthly commissions
      const startOfCurrentMonth = startOfMonth(new Date()).toISOString();
      const { data: salesData } = await supabase
        .from("product_sales")
        .select("commission_amount, affiliate_link_id, product_affiliate_links!inner(affiliate_id, affiliates!inner(name))")
        .gte("created_at", startOfCurrentMonth)
        .not("commission_amount", "is", null);

      const monthlyCommissions = (salesData || []).reduce((sum, sale) => sum + (sale.commission_amount || 0), 0);
      const salesCount = salesData?.length || 0;
      const averageTicket = salesCount > 0 ? monthlyCommissions / salesCount : 0;

      // Get top 3 affiliates
      const affiliateSales = (salesData || []).reduce((acc: any, sale: any) => {
        const affiliateId = sale.product_affiliate_links?.affiliate_id;
        const affiliateName = sale.product_affiliate_links?.affiliates?.name;
        if (!affiliateId || !affiliateName) return acc;

        if (!acc[affiliateId]) {
          acc[affiliateId] = {
            name: affiliateName,
            sales: 0,
            commissions: 0,
          };
        }
        acc[affiliateId].sales += 1;
        acc[affiliateId].commissions += sale.commission_amount || 0;
        return acc;
      }, {});

      const topAffiliates = Object.values(affiliateSales)
        .sort((a: any, b: any) => b.sales - a.sales)
        .slice(0, 3) as { name: string; sales: number; commissions: number; }[];

      setMetrics({
        activeCount: activeCount || 0,
        monthlyCommissions,
        averageTicket,
        topAffiliates,
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchAffiliateProducts = async (affiliateId: string) => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from("product_affiliate_links")
        .select(`
          id,
          product_id,
          commission_type,
          commission_value,
          is_active,
          affiliate_url,
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
        affiliate_url: link.affiliate_url,
        link_id: link.id,
      }));

      setAffiliateProducts(productsWithNames);

      // Fetch link stats for each product
      fetchLinkStats(productsWithNames);
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

  const fetchLinkStats = async (products: AffiliateProduct[]) => {
    setLoadingLinkStats(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const stats: Record<string, LinkStats> = {};

      for (const product of products) {
        if (!product.link_id) continue;

        // Get clicks
        const { count: clicks } = await supabase
          .from("product_link_clicks")
          .select("*", { count: "exact", head: true })
          .eq("product_id", product.product_id);

        // Get conversions (sales from this affiliate link)
        const { data: salesData } = await supabase
          .from("product_sales")
          .select("sale_amount")
          .eq("affiliate_link_id", product.link_id);

        const conversions = salesData?.length || 0;
        const revenue = (salesData || []).reduce((sum, sale) => sum + sale.sale_amount, 0);
        const conversionRate = clicks ? (conversions / clicks) * 100 : 0;

        stats[product.link_id] = {
          clicks: clicks || 0,
          conversions,
          conversionRate,
          revenue,
        };
      }

      setLinkStats(stats);
    } catch (error) {
      console.error("Error fetching link stats:", error);
    } finally {
      setLoadingLinkStats(false);
    }
  };

  const generateAffiliateLink = async (productId: string, linkId: string) => {
    try {
      const { data: priceData } = await supabase
        .from("product_prices")
        .select("unique_code")
        .eq("product_id", productId)
        .eq("is_default", true)
        .single();

      const { data: productData } = await supabase
        .from("products")
        .select("unique_code")
        .eq("id", productId)
        .single();

      if (!priceData || !productData) {
        toast({
          title: "Erro",
          description: "Não foi possível gerar o link. Produto ou preço não encontrado.",
          variant: "destructive",
        });
        return;
      }

      const checkoutUrl = `${window.location.origin}/checkout?product=${productData.unique_code}&price=${priceData.unique_code}&affiliate=${linkId}`;

      // Update the affiliate link with the generated URL
      await supabase
        .from("product_affiliate_links")
        .update({ affiliate_url: checkoutUrl })
        .eq("id", linkId);

      // Refresh products to show new URL
      if (selectedAffiliate) {
        await fetchAffiliateProducts(selectedAffiliate.id);
      }

      toast({
        title: "Link gerado",
        description: "Link de afiliado gerado com sucesso!",
      });
    } catch (error) {
      console.error("Error generating affiliate link:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o link de afiliado.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "Link copiado para a área de transferência.",
    });
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
      "Repasse Asaas",
      "Data de Cadastro"
    ];

    const csvData = affiliates.map(affiliate => [
      affiliate.name,
      affiliate.email,
      affiliate.is_active ? "Ativo" : "Inativo",
      affiliate.asaas_wallet_id ? "ativo" : "pendente",
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
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Afiliados Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingMetrics ? "..." : metrics.activeCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissão bruta estimada do mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingMetrics ? "..." : `R$ ${formatCurrency(metrics.monthlyCommissions)}`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissão média estimada</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingMetrics ? "..." : `R$ ${formatCurrency(metrics.averageTicket)}`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Afiliados</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMetrics ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : metrics.topAffiliates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            ) : (
              <div className="space-y-1">
                {metrics.topAffiliates.map((affiliate, index) => (
                  <div key={index} className="text-xs">
                    <span className="font-medium">{index + 1}. {affiliate.name}</span>
                    <span className="text-muted-foreground ml-2">
                      {affiliate.sales} vendas
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Valores podem diferir do split líquido recebido no Asaas por taxas do gateway, parcelamento e arredondamentos.
      </p>

      <AffiliateAnalytics />

      <div className="flex items-center justify-between">
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
                      <TableHead>Repasse Asaas</TableHead>
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
                          <Badge variant={affiliate.asaas_wallet_id ? "default" : "secondary"}>
                            {affiliate.asaas_wallet_id ? "ativo" : "pendente"}
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
                    <label className="text-sm font-medium text-muted-foreground">Repasse automático Asaas</label>
                    <p className="text-sm mt-1">
                      <Badge variant={selectedAffiliate.asaas_wallet_id ? "default" : "secondary"}>
                        {selectedAffiliate.asaas_wallet_id ? "ativo" : "pendente"}
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
                <h3 className="text-lg font-semibold mb-4">Produtos Vinculados e Links de Afiliado</h3>
                {loadingProducts ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando produtos...
                  </div>
                ) : affiliateProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum produto vinculado a este afiliado
                  </div>
                ) : (
                  <div className="space-y-4">
                    {affiliateProducts.map((product) => (
                      <Card key={product.product_id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base">{product.product_name}</CardTitle>
                              <p className="text-sm text-muted-foreground mt-1">
                                Regra de comissão: {formatCommission(product.commission_type, product.commission_value)}
                              </p>
                            </div>
                            <Badge variant={product.is_active ? "default" : "secondary"}>
                              {product.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Affiliate Link */}
                          <div>
                            <label className="text-sm font-medium mb-2 block">Link de Afiliado</label>
                            {product.affiliate_url ? (
                              <div className="flex flex-wrap gap-2">
                                <Input
                                  value={product.affiliate_url}
                                  readOnly
                                  className="min-w-0 flex-1 font-mono text-xs"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => copyToClipboard(product.affiliate_url!)}
                                  title="Copiar link"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => window.open(product.affiliate_url, '_blank')}
                                  title="Abrir link"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                {product.link_id && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => generateAffiliateLink(product.product_id, product.link_id!)}
                                  >
                                    Atualizar link
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <Button
                                onClick={() => product.link_id && generateAffiliateLink(product.product_id, product.link_id)}
                                variant="outline"
                                className="w-full"
                              >
                                Gerar Link de Afiliado
                              </Button>
                            )}
                          </div>

                          {/* Link Stats */}
                          {product.link_id && linkStats[product.link_id] && !loadingLinkStats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                              <div>
                                <p className="text-xs text-muted-foreground">Cliques</p>
                                <p className="text-lg font-bold">{linkStats[product.link_id].clicks}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Conversões</p>
                                <p className="text-lg font-bold">{linkStats[product.link_id].conversions}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
                                <p className="text-lg font-bold">
                                  {linkStats[product.link_id].conversionRate.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Receita cobrada gerada</p>
                                <p className="text-lg font-bold">
                                  R$ {formatCurrency(linkStats[product.link_id].revenue)}
                                </p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
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
