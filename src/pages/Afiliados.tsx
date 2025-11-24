import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Power, Trash2 } from "lucide-react";
import { AffiliateWithProducts } from "@/types/affiliate";

export default function Afiliados() {
  const [affiliates, setAffiliates] = useState<AffiliateWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAffiliates = async () => {
    try {
      setLoading(true);

      // Fetch affiliates
      const { data: affiliatesData, error: affiliatesError } = await supabase
        .from("affiliates")
        .select("*")
        .order("created_at", { ascending: false });

      if (affiliatesError) throw affiliatesError;

      // Fetch product links for each affiliate
      const affiliatesWithProducts = await Promise.all(
        (affiliatesData || []).map(async (affiliate) => {
          const { data: linksData } = await supabase
            .from("product_affiliate_links")
            .select(`
              product_id,
              commission_type,
              commission_value,
              is_active,
              products(name)
            `)
            .eq("affiliate_id", affiliate.id);

          return {
            ...affiliate,
            products: (linksData || []).map((link: any) => ({
              product_id: link.product_id,
              product_name: link.products?.name || "Produto",
              commission_type: link.commission_type,
              commission_value: link.commission_value,
              is_active: link.is_active,
            })),
          };
        })
      );

      setAffiliates(affiliatesWithProducts);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar afiliados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAffiliates();
  }, []);

  const handleToggleActive = async (affiliateId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("affiliates")
        .update({ is_active: !currentStatus })
        .eq("id", affiliateId);

      if (error) throw error;

      toast({
        title: currentStatus ? "Afiliado desativado" : "Afiliado ativado",
        description: `O afiliado foi ${currentStatus ? "desativado" : "ativado"} com sucesso.`,
      });

      fetchAffiliates();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (affiliateId: string) => {
    if (!confirm("Tem certeza que deseja excluir este afiliado?")) return;

    try {
      const { error } = await supabase
        .from("affiliates")
        .delete()
        .eq("id", affiliateId);

      if (error) throw error;

      toast({
        title: "Afiliado excluído",
        description: "O afiliado foi removido com sucesso.",
      });

      fetchAffiliates();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir afiliado",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCommission = (type: string, value: number) => {
    if (type === 'percentage') {
      return `${value}%`;
    }
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Carregando afiliados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Afiliados</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie todos os afiliados cadastrados
        </p>
      </div>

      {affiliates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Nenhum afiliado cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {affiliates.map((affiliate) => (
            <Card key={affiliate.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <CardTitle>{affiliate.name}</CardTitle>
                      <CardDescription>{affiliate.email}</CardDescription>
                    </div>
                    <Badge variant={affiliate.is_active ? "default" : "secondary"}>
                      {affiliate.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(affiliate.id, affiliate.is_active)}
                      title={affiliate.is_active ? "Desativar" : "Ativar"}
                    >
                      <Power className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(affiliate.id)}
                      className="text-destructive hover:text-destructive"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {affiliate.products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum produto vinculado</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Produtos:</p>
                    <div className="space-y-2">
                      {affiliate.products.map((product) => (
                        <div
                          key={product.product_id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{product.product_name}</p>
                            <p className="text-sm text-muted-foreground">
                              Comissão: {formatCommission(product.commission_type, product.commission_value)}
                            </p>
                          </div>
                          <Badge variant={product.is_active ? "default" : "secondary"}>
                            {product.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
