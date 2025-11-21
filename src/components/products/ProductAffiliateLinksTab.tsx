import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductAffiliateLink } from "@/types/product";

interface ProductAffiliateLinksTabProps {
  productId: string;
  affiliateLinks: ProductAffiliateLink[];
  onUpdate: () => void;
}

export function ProductAffiliateLinksTab({
  productId,
  affiliateLinks,
  onUpdate,
}: ProductAffiliateLinksTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    affiliate_name: "",
    affiliate_url: "",
    commission_percentage: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("product_affiliate_links").insert([
        {
          product_id: productId,
          affiliate_name: formData.affiliate_name,
          affiliate_url: formData.affiliate_url,
          commission_percentage: parseFloat(formData.commission_percentage),
        },
      ]);

      if (error) throw error;

      toast({
        title: "Link de afiliação adicionado",
        description: "O link foi adicionado com sucesso.",
      });

      setFormData({
        affiliate_name: "",
        affiliate_url: "",
        commission_percentage: "",
      });
      setOpen(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar link",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    try {
      const { error } = await supabase.from("product_affiliate_links").delete().eq("id", linkId);

      if (error) throw error;

      toast({
        title: "Link excluído",
        description: "O link de afiliação foi removido com sucesso.",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir link",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Link copiado!",
      description: "O link foi copiado para a área de transferência.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Links de Afiliação</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Link de Afiliação</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="affiliate_name">Nome do Afiliado *</Label>
                  <Input
                    id="affiliate_name"
                    required
                    value={formData.affiliate_name}
                    onChange={(e) => setFormData({ ...formData, affiliate_name: e.target.value })}
                    placeholder="Ex: João Silva"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="affiliate_url">URL do Link *</Label>
                  <Input
                    id="affiliate_url"
                    type="url"
                    required
                    value={formData.affiliate_url}
                    onChange={(e) => setFormData({ ...formData, affiliate_url: e.target.value })}
                    placeholder="https://exemplo.com/aff/12345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commission_percentage">Comissão (%) *</Label>
                  <Input
                    id="commission_percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    required
                    value={formData.commission_percentage}
                    onChange={(e) =>
                      setFormData({ ...formData, commission_percentage: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Adicionando..." : "Adicionar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {affiliateLinks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum link de afiliação cadastrado</p>
            <p className="text-sm mt-2">Clique em "Adicionar Link" para começar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {affiliateLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{link.affiliate_name}</h4>
                    <Badge variant={link.is_active ? "default" : "secondary"}>
                      {link.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground truncate">
                      URL: {link.affiliate_url}
                    </p>
                    <p className="text-sm font-medium">
                      Comissão: {link.commission_percentage}%
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(link.affiliate_url)}
                    title="Copiar link"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.open(link.affiliate_url, "_blank")}
                    title="Abrir link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(link.id)}
                    className="text-destructive hover:text-destructive"
                    title="Excluir link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
