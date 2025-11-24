import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductPrice, SubscriptionPeriod, SUBSCRIPTION_PERIOD_LABELS, ProductType } from "@/types/product";

interface ProductPricesTabProps {
  productId: string;
  prices: ProductPrice[];
  onUpdate: () => void;
  productType: ProductType;
  productUniqueCode: string;
}

export function ProductPricesTab({ productId, prices, onUpdate, productType, productUniqueCode }: ProductPricesTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    subscription_period: "" as SubscriptionPeriod | "",
    installments: "1",
    is_default: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("product_prices").insert([
        {
          product_id: productId,
          name: formData.name,
          price: parseFloat(formData.price),
          subscription_period: formData.subscription_period || null,
          installments: parseInt(formData.installments),
          is_default: formData.is_default,
        } as any,
      ]);

      if (error) throw error;

      toast({
        title: "Preço adicionado",
        description: "O preço foi adicionado com sucesso.",
      });

      setFormData({
        name: "",
        price: "",
        subscription_period: "",
        installments: "1",
        is_default: false,
      });
      setOpen(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar preço",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (priceId: string) => {
    try {
      const { error } = await supabase.from("product_prices").delete().eq("id", priceId);

      if (error) throw error;

      toast({
        title: "Preço excluído",
        description: "O preço foi removido com sucesso.",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir preço",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Preços e Planos</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Preço
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Novo Preço</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Preço *</Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Plano Básico, À Vista"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Valor (R$) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                {productType === "recorrente" && (
                  <div className="space-y-2">
                    <Label>Período de Assinatura</Label>
                    <Select
                      value={formData.subscription_period}
                      onValueChange={(value: SubscriptionPeriod) =>
                        setFormData({ ...formData, subscription_period: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o período" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SUBSCRIPTION_PERIOD_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="installments">Número de Parcelas</Label>
                  <Input
                    id="installments"
                    type="number"
                    min="1"
                    value={formData.installments}
                    onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
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
        {prices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum preço cadastrado</p>
            <p className="text-sm mt-2">Clique em "Adicionar Preço" para começar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {prices.map((price) => (
              <div
                key={price.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{price.name}</h4>
                    {price.is_default && <Badge variant="secondary">Padrão</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      R$ {price.price.toFixed(2)}
                    </span>
                    {price.subscription_period && (
                      <span>
                        Período: {SUBSCRIPTION_PERIOD_LABELS[price.subscription_period]}
                      </span>
                    )}
                    {price.installments > 1 && (
                      <span>{price.installments}x parcelas</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Código do plano: </span>
                      <span className="font-mono">{price.unique_code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Link de checkout: </span>
                      <span className="font-mono">
                        https://exemplocheckout.com.br/{productUniqueCode}/{price.unique_code}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(price.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
