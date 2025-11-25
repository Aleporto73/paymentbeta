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
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  created_at: string;
  product_id: string;
  product_name?: string;
}

interface Product {
  id: string;
  name: string;
}

export default function Cupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  const [tempFilters, setTempFilters] = useState({
    search: "",
    status: "all",
    discountType: "all",
    productId: "all",
    period: "all",
  });
  
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    status: "all",
    discountType: "all",
    productId: "all",
    period: "all",
  });

  useEffect(() => {
    fetchProducts();
    fetchCoupons();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    fetchCoupons();
  }, [appliedFilters]);

  useEffect(() => {
    fetchCoupons();
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

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("product_coupons")
        .select(`
          id,
          code,
          discount_type,
          discount_value,
          is_active,
          created_at,
          product_id,
          products (name)
        `, { count: "exact" });

      // Filter by products owned by user
      const { data: userProducts } = await supabase
        .from("products")
        .select("id")
        .eq("user_id", user.id);

      const productIds = userProducts?.map(p => p.id) || [];
      if (productIds.length > 0) {
        query = query.in("product_id", productIds);
      } else {
        // No products, return empty
        setCoupons([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      if (appliedFilters.status !== "all") {
        const isActive = appliedFilters.status === "active";
        query = query.eq("is_active", isActive);
      }

      if (appliedFilters.discountType !== "all") {
        query = query.eq("discount_type", appliedFilters.discountType);
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
        query = query.ilike("code", `%${appliedFilters.search}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, count } = await query;

      if (data) {
        const couponsWithProductNames = data.map(coupon => ({
          ...coupon,
          product_name: (coupon.products as any)?.name || "Produto não encontrado"
        }));
        setCoupons(couponsWithProductNames);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error("Error fetching coupons:", error);
      toast({
        title: "Erro ao carregar cupons",
        description: "Não foi possível carregar os cupons. Tente novamente.",
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
      discountType: "all",
      productId: "all",
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
      "Código",
      "Produto",
      "Tipo de Desconto",
      "Valor do Desconto",
      "Status",
      "Data de Criação"
    ];

    const csvData = coupons.map(coupon => [
      coupon.code,
      coupon.product_name || "-",
      coupon.discount_type === "percentage" ? "Percentual" : "Fixo",
      coupon.discount_type === "percentage" 
        ? `${coupon.discount_value}%`
        : `R$ ${formatCurrency(coupon.discount_value)}`,
      coupon.is_active ? "Ativo" : "Inativo",
      format(new Date(coupon.created_at), "dd/MM/yyyy HH:mm")
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cupons_${format(new Date(), "yyyy-MM-dd_HH-mm")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportação concluída",
      description: "Os cupons foram exportados com sucesso.",
    });
  };

  const formatDiscount = (type: string, value: number) => {
    if (type === 'percentage') {
      return `${value}%`;
    }
    return `R$ ${formatCurrency(value)}`;
  };

  const viewCouponDetails = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setShowDetailsModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cupons</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize todos os seus cupons de desconto
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
          <Button onClick={exportToCSV} disabled={coupons.length === 0}>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="text-sm font-medium mb-2 block">Buscar</label>
                <Input
                  placeholder="Código do cupom"
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
                <label className="text-sm font-medium mb-2 block">Tipo de Desconto</label>
                <Select
                  value={tempFilters.discountType}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, discountType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="percentage">Percentual</SelectItem>
                    <SelectItem value="fixed">Fixo</SelectItem>
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
              Lista de Cupons ({totalCount})
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
            <div className="text-center py-8">Carregando cupons...</div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum cupom encontrado
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Desconto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data de Criação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell className="font-mono font-medium">{coupon.code}</TableCell>
                        <TableCell>{coupon.product_name}</TableCell>
                        <TableCell className="capitalize">
                          {coupon.discount_type === 'percentage' ? 'Percentual' : 'Fixo'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatDiscount(coupon.discount_type, coupon.discount_value)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={coupon.is_active ? "default" : "secondary"}>
                            {coupon.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(coupon.created_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewCouponDetails(coupon)}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Cupom</DialogTitle>
          </DialogHeader>
          {selectedCoupon && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações do Cupom</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Código</label>
                    <p className="text-sm mt-1 font-mono font-bold">{selectedCoupon.code}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p className="text-sm mt-1">
                      <Badge variant={selectedCoupon.is_active ? "default" : "secondary"}>
                        {selectedCoupon.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Produto Vinculado</label>
                    <p className="text-sm mt-1">{selectedCoupon.product_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tipo de Desconto</label>
                    <p className="text-sm mt-1 capitalize">
                      {selectedCoupon.discount_type === 'percentage' ? 'Percentual' : 'Fixo'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Valor do Desconto</label>
                    <p className="text-sm mt-1 font-medium text-lg">
                      {formatDiscount(selectedCoupon.discount_type, selectedCoupon.discount_value)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Data de Criação</label>
                    <p className="text-sm mt-1">
                      {format(new Date(selectedCoupon.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-medium mb-2">Como usar este cupom</h4>
                <p className="text-sm text-muted-foreground">
                  Os clientes devem inserir o código <span className="font-mono font-bold">{selectedCoupon.code}</span> durante o checkout do produto <span className="font-medium">{selectedCoupon.product_name}</span> para receber {formatDiscount(selectedCoupon.discount_type, selectedCoupon.discount_value)} de desconto.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
