import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Sale {
  id: string;
  customer_name: string;
  customer_email: string;
  value: number;
  status: string;
  created_at: string;
  product_name?: string;
}

export function RecentSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentSales();
  }, []);

  const fetchRecentSales = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch recent transactions with product info
      const { data: transactions } = await supabase
        .from("transactions")
        .select(`
          id,
          customer_name,
          customer_email,
          value,
          status,
          created_at,
          products (name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (transactions) {
        const formattedSales = transactions.map((t: any) => ({
          id: t.id,
          customer_name: t.customer_name,
          customer_email: t.customer_email,
          value: t.value,
          status: t.status,
          created_at: t.created_at,
          product_name: t.products?.name || "Produto sem nome",
        }));
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Vendas Recentes</CardTitle>
      </CardHeader>
      <CardContent>
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
        )}
      </CardContent>
    </Card>
  );
}
