import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfDay, subDays } from "date-fns";

interface Sale {
  id: string;
  customer_name: string;
  customer_email: string;
  value: number;
  status: string;
  created_at: string;
  product_name?: string;
  product_id?: string;
}

interface Product {
  id: string;
  name: string;
}

export function RecentSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
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
    fetchRecentSales();
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
    fetchRecentSales();
  }, [appliedFilters]);

  useEffect(() => {
    fetchRecentSales();
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

  const fetchRecentSales = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Build query with filters
      let query = supabase
        .from("transactions")
        .select(`
          id,
          customer_name,
          customer_email,
          value,
          status,
          created_at,
          product_id,
          products (name)
        `)
        .eq("user_id", user.id);

      // Apply status filter
      if (appliedFilters.status !== "all") {
        if (appliedFilters.status === "approved") {
          query = query.in("status", ["RECEIVED", "CONFIRMED"]);
        } else if (appliedFilters.status === "pending") {
          query = query.eq("status", "PENDING");
        } else if (appliedFilters.status === "overdue") {
          query = query.eq("status", "OVERDUE");
        }
      }

      // Apply period filter
      if (appliedFilters.period !== "all") {
        const now = new Date();
        let startDate: Date;

        switch (appliedFilters.period) {
          case "today":
            startDate = startOfDay(now);
            break;
          case "7days":
            startDate = subDays(now, 7);
            break;
          case "30days":
            startDate = subDays(now, 30);
            break;
          default:
            startDate = subDays(now, 365);
        }

        query = query.gte("created_at", startDate.toISOString());
      }

      // Apply product filter
      if (appliedFilters.productId !== "all") {
        query = query.eq("product_id", appliedFilters.productId);
      }

      // Get total count for pagination (separate query)
      const countQuery = supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Apply same filters to count query
      if (appliedFilters.status !== "all") {
        if (appliedFilters.status === "approved") {
          countQuery.in("status", ["RECEIVED", "CONFIRMED"]);
        } else if (appliedFilters.status === "pending") {
          countQuery.eq("status", "PENDING");
        } else if (appliedFilters.status === "overdue") {
          countQuery.eq("status", "OVERDUE");
        }
      }

      if (appliedFilters.period !== "all") {
        const now = new Date();
        let startDate: Date;
        switch (appliedFilters.period) {
          case "today":
            startDate = startOfDay(now);
            break;
          case "7days":
            startDate = subDays(now, 7);
            break;
          case "30days":
            startDate = subDays(now, 30);
            break;
          default:
            startDate = subDays(now, 365);
        }
        countQuery.gte("created_at", startDate.toISOString());
      }

      if (appliedFilters.productId !== "all") {
        countQuery.eq("product_id", appliedFilters.productId);
      }

      const { count } = await countQuery;
      
      if (count !== null) {
        setTotalCount(count);
      }

      // Fetch paginated data
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data: transactions } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (transactions) {
        let formattedSales = transactions.map((t: any) => ({
          id: t.id,
          customer_name: t.customer_name,
          customer_email: t.customer_email,
          value: t.value,
          status: t.status,
          created_at: t.created_at,
          product_name: t.products?.name || "Produto sem nome",
          product_id: t.product_id,
        }));

        // Apply search filter (client-side)
        if (appliedFilters.search) {
          const searchLower = appliedFilters.search.toLowerCase();
          formattedSales = formattedSales.filter((sale) =>
            sale.customer_name.toLowerCase().includes(searchLower) ||
            sale.customer_email.toLowerCase().includes(searchLower) ||
            sale.product_name?.toLowerCase().includes(searchLower)
          );
        }

        setSales(formattedSales);
      }
    } catch (error) {
      console.error("Error fetching recent sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const names = name.split(" ");
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" }> = {
      RECEIVED: { label: "Aprovado", variant: "default" },
      CONFIRMED: { label: "Aprovado", variant: "default" },
      PENDING: { label: "Pendente", variant: "secondary" },
      OVERDUE: { label: "Atrasado", variant: "secondary" },
    };

    const config = statusMap[status] || { label: status, variant: "secondary" };

    return (
      <Badge
        variant={config.variant}
        className={
          config.variant === "default"
            ? "bg-success-light text-success"
            : "bg-warning-light text-warning"
        }
      >
        {config.label}
      </Badge>
    );
  };

  const applyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters(tempFilters);
  };

  const clearFilters = () => {
    const emptyFilters = {
      search: "",
      status: "all",
      period: "all",
      productId: "all",
    };
    setTempFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const hasActiveFilters =
    appliedFilters.search !== "" ||
    appliedFilters.status !== "all" ||
    appliedFilters.period !== "all" ||
    appliedFilters.productId !== "all";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Vendas Recentes</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {[appliedFilters.search, appliedFilters.status, appliedFilters.period, appliedFilters.productId].filter(
                    (v) => v !== "" && v !== "all"
                  ).length}
                </Badge>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showFilters && (
          <div className="mb-6 p-4 border border-border rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Input
                  placeholder="Buscar cliente ou produto..."
                  value={tempFilters.search}
                  onChange={(e) => setTempFilters({ ...tempFilters, search: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Select
                  value={tempFilters.status}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="approved">Aprovado</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="overdue">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Select
                  value={tempFilters.period}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, period: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os períodos</SelectItem>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7days">Últimos 7 dias</SelectItem>
                    <SelectItem value="30days">Últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Select
                  value={tempFilters.productId}
                  onValueChange={(value) => setTempFilters({ ...tempFilters, productId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Produto" />
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
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={clearFilters}>
                Limpar
              </Button>
              <Button onClick={applyFilters}>
                Buscar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : sales.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhuma venda registrada ainda
          </p>
        ) : (
          <>
            <div className="space-y-4">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm">
                      {getInitials(sale.customer_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{sale.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.product_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(sale.status)}
                    <p className="text-sm font-semibold min-w-[100px] text-right">
                      {formatCurrency(sale.value)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Itens por página:
                </span>
                <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground ml-4">
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} até{" "}
                  {Math.min(currentPage * itemsPerPage, totalCount)} de {totalCount} vendas
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
