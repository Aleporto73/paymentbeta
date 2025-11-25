import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProductPrice, SubscriptionPeriod, SUBSCRIPTION_PERIOD_LABELS, ProductType } from "@/types/product";
import { formatCurrency, parseCurrency } from "@/lib/utils";

interface ProductPricesTabProps {
  productId: string;
  prices: ProductPrice[];
  onUpdate: () => void;
  productType: ProductType;
  productUniqueCode: string;
}

export function ProductPricesTab({ productId, prices, onUpdate, productType, productUniqueCode }: ProductPricesTabProps) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingPrice, setEditingPrice] = useState<ProductPrice | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    subscription_period: "" as SubscriptionPeriod | "",
    installments: "1",
    is_default: false,
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    price: "",
    subscription_period: "" as SubscriptionPeriod | "",
    installments: "1",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("product_prices").insert([
        {
          product_id: productId,
          name: formData.name,
          price: parseCurrency(formData.price),
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

  const handleEdit = (price: ProductPrice) => {
    setEditingPrice(price);
    setEditFormData({
      name: price.name,
      price: formatCurrency(price.price),
      subscription_period: price.subscription_period || "",
      installments: price.installments?.toString() || "1",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("product_prices")
        .update({
          name: editFormData.name,
          price: parseCurrency(editFormData.price),
          subscription_period: editFormData.subscription_period || null,
          installments: parseInt(editFormData.installments),
        })
        .eq("id", editingPrice?.id);

      if (error) throw error;

      toast({
        title: "Preço atualizado",
        description: "O preço foi atualizado com sucesso.",
      });

      setEditOpen(false);
      setEditingPrice(null);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar preço",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
                    type="text"
                    required
                    value={formData.price}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^\d]/g, '');
                      if (value.length > 0) {
                        const numValue = parseInt(value);
                        value = formatCurrency(numValue / 100);
                      }
                      setFormData({ ...formData, price: value });
                    }}
                    placeholder="0,00"
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
                      R$ {formatCurrency(price.price)}
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
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Código do plano: </span>
                      <span className="font-mono">{price.unique_code}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(price)}
                    title="Editar plano"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(price.id)}
                    disabled={price.is_default}
                    className="text-destructive hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                    title={price.is_default ? "O plano principal não pode ser excluído" : "Excluir plano"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Preço</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome do Preço *</Label>
              <Input
                id="edit-name"
                required
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="Ex: Plano Básico, À Vista"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-price">Valor (R$) *</Label>
              <Input
                id="edit-price"
                type="text"
                required
                value={editFormData.price}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^\d]/g, '');
                  if (value.length > 0) {
                    const numValue = parseInt(value);
                    value = formatCurrency(numValue / 100);
                  }
                  setEditFormData({ ...editFormData, price: value });
                }}
                placeholder="0,00"
              />
            </div>

            {productType === "recorrente" && (
              <div className="space-y-2">
                <Label>Período de Assinatura</Label>
                <Select
                  value={editFormData.subscription_period}
                  onValueChange={(value: SubscriptionPeriod) =>
                    setEditFormData({ ...editFormData, subscription_period: value })
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
              <Label htmlFor="edit-installments">Número de Parcelas</Label>
              <Input
                id="edit-installments"
                type="number"
                min="1"
                value={editFormData.installments}
                onChange={(e) => setEditFormData({ ...editFormData, installments: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
