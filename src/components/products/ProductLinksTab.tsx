import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProductPrice } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";

interface ProductLinksTabProps {
  productId: string;
  productUniqueCode: string;
  prices: ProductPrice[];
}

export function ProductLinksTab({ productId, productUniqueCode, prices }: ProductLinksTabProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [clickStats, setClickStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchClickStats = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("product_link_clicks")
        .select("price_id")
        .eq("product_id", productId);

      if (error) throw error;

      // Count clicks per price_id
      const stats: Record<string, number> = {};
      data?.forEach((click) => {
        stats[click.price_id] = (stats[click.price_id] || 0) + 1;
      });

      setClickStats(stats);
    } catch (error: any) {
      console.error("Error fetching click stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClickStats();
  }, [productId]);

  const copyToClipboard = (link: string, planName: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    toast({
      title: "Link copiado!",
      description: `Link do plano "${planName}" copiado para a área de transferência.`,
    });
    setTimeout(() => setCopiedLink(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Links de Divulgação</CardTitle>
        <CardDescription>Links de checkout para os planos do seu produto</CardDescription>
      </CardHeader>
      <CardContent>
        {prices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum plano cadastrado</p>
            <p className="text-sm mt-2">Adicione preços na aba "Preços e planos" para gerar os links</p>
          </div>
        ) : (
          <div className="space-y-4">
            {prices.map((price) => {
              const checkoutLink = `https://checkout.payment.app.br/?product=${productUniqueCode}&price=${price.unique_code}`;
              const isCopied = copiedLink === checkoutLink;

              return (
                <div
                  key={price.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{price.name}</h4>
                      {price.is_default && <Badge variant="secondary">Principal</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mb-1">
                      <span className="font-medium">R$ {price.price.toFixed(2)}</span>
                      {price.subscription_period && (
                        <span className="ml-2">• Recorrente</span>
                      )}
                      {price.installments > 1 && (
                        <span className="ml-2">• {price.installments}x</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {loading ? "..." : `${clickStats[price.id] || 0} cliques`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all">
                      {checkoutLink}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(checkoutLink, price.name)}
                    className="shrink-0"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Link
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
