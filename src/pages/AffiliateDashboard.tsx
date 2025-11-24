import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/StatCard";
import { AffiliatePerformanceChart } from "@/components/dashboard/AffiliatePerformanceChart";
import { DollarSign, TrendingUp, MousePointerClick, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AffiliateData {
  id: string;
  name: string;
  email: string;
}

interface AffiliateLink {
  id: string;
  product_id: string;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
  products: {
    name: string;
    unique_code: string;
  };
  product_prices: Array<{
    id: string;
    name: string;
    price: number;
    unique_code: string;
  }>;
}

interface Sale {
  id: string;
  customer_name: string;
  sale_amount: number;
  commission_amount: number;
  sale_date: string;
  status: string;
  products: {
    name: string;
  };
}

export default function AffiliateDashboard() {
  const [loading, setLoading] = useState(true);
  const [affiliateData, setAffiliateData] = useState<AffiliateData | null>(null);
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState({
    totalCommission: 0,
    totalSales: 0,
    totalClicks: 0,
    conversionRate: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchAffiliateData();
  }, []);

  const fetchAffiliateData = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro de autenticação",
          description: "Você precisa estar logado para acessar esta página.",
          variant: "destructive",
        });
        return;
      }

      // Get affiliate data
      const { data: affiliate, error: affiliateError } = await supabase
        .from("affiliates")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (affiliateError) throw affiliateError;
      setAffiliateData(affiliate);

      // Get affiliate links with product info
      const { data: linksData, error: linksError } = await supabase
        .from("product_affiliate_links")
        .select(`
          *,
          products(name, unique_code)
        `)
        .eq("affiliate_id", affiliate.id);

      if (linksError) throw linksError;

      // Get prices for each product
      const linksWithPrices = await Promise.all(
        (linksData || []).map(async (link) => {
          const { data: prices } = await supabase
            .from("product_prices")
            .select("id, name, price, unique_code")
            .eq("product_id", link.product_id);

          return {
            ...link,
            product_prices: prices || [],
          };
        })
      );

      setLinks(linksWithPrices);

      // Get sales data
      const { data: salesData, error: salesError } = await supabase
        .from("product_sales")
        .select(`
          *,
          products(name)
        `)
        .in("affiliate_link_id", linksData?.map(l => l.id) || [])
        .order("sale_date", { ascending: false });

      if (salesError) throw salesError;
      setSales(salesData || []);

      // Get clicks data
      const priceIds = linksWithPrices.flatMap(link => 
        link.product_prices.map(p => p.id)
      );

      const { data: clicksData, error: clicksError } = await supabase
        .from("product_link_clicks")
        .select("id")
        .in("price_id", priceIds);

      if (clicksError) throw clicksError;

      // Calculate statistics
      const totalCommission = salesData?.reduce((sum, sale) => 
        sum + (sale.commission_amount || 0), 0
      ) || 0;

      const totalSales = salesData?.length || 0;
      const totalClicks = clicksData?.length || 0;
      const conversionRate = totalClicks > 0 ? (totalSales / totalClicks) * 100 : 0;

      setStats({
        totalCommission,
        totalSales,
        totalClicks,
        conversionRate,
      });

    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Link copiado!",
      description: "O link foi copiado para a área de transferência.",
    });
  };

  const generateAffiliateUrl = (productCode: string, priceCode: string) => {
    return `${window.location.origin}/checkout/${productCode}/${priceCode}?aff=${affiliateData?.id}`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!affiliateData) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              Você não está cadastrado como afiliado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard do Afiliado</h1>
        <p className="text-muted-foreground mt-2">
          Bem-vindo, {affiliateData.name}! Acompanhe suas vendas e comissões.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Comissões Totais"
          value={`R$ ${stats.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          iconColor="text-success"
        />
        <StatCard
          title="Total de Vendas"
          value={stats.totalSales.toString()}
          icon={TrendingUp}
          iconColor="text-primary"
        />
        <StatCard
          title="Total de Cliques"
          value={stats.totalClicks.toString()}
          icon={MousePointerClick}
          iconColor="text-info"
        />
        <StatCard
          title="Taxa de Conversão"
          value={`${stats.conversionRate.toFixed(1)}%`}
          icon={Package}
          iconColor="text-warning"
        />
      </div>

      <AffiliatePerformanceChart sales={sales} totalClicks={stats.totalClicks} />

      <Card>
        <CardHeader>
          <CardTitle>Seus Links de Divulgação</CardTitle>
          <CardDescription>
            Copie e compartilhe seus links para começar a ganhar comissões
          </CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto vinculado ainda.
            </p>
          ) : (
            <div className="space-y-6">
              {links.map((link) => (
                <div key={link.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{link.products?.name}</h3>
                      <Badge variant={link.is_active ? "default" : "secondary"}>
                        {link.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Comissão: {link.commission_type === 'percentage' 
                        ? `${link.commission_value}%` 
                        : `R$ ${link.commission_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      }
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    {link.product_prices.map((price) => {
                      const url = generateAffiliateUrl(link.products.unique_code, price.unique_code);
                      return (
                        <div key={price.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{price.name}</p>
                            <p className="text-xs text-muted-foreground font-mono break-all">{url}</p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => copyToClipboard(url)}
                          >
                            Copiar
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Vendas</CardTitle>
          <CardDescription>
            Suas vendas mais recentes e comissões ganhas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma venda registrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      {new Date(sale.sale_date).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>{sale.products?.name}</TableCell>
                    <TableCell>{sale.customer_name}</TableCell>
                    <TableCell>
                      R$ {sale.sale_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="font-semibold text-success">
                      R$ {(sale.commission_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sale.status === 'completed' ? 'default' : 'secondary'}>
                        {sale.status === 'completed' ? 'Concluída' : sale.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
