import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { ImageUpload } from "./ImageUpload";
import {
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PRODUCT_TYPE_LABELS,
  Product,
  ProductCategory,
  ProductPrice,
  ProductType,
} from "@/types/product";

interface ProductInfoTabProps {
  product: Product;
  defaultPrice: ProductPrice | null;
  onUpdate: () => void;
  onManagePrices: () => void;
}

const getInitialFormData = (product: Product) => ({
  name: product.name,
  description: product.description || "",
  image_url: product.image_url || "",
  category: product.category,
  product_type: product.product_type,
  is_active: product.is_active,
});

export function ProductInfoTab({ product, defaultPrice, onUpdate, onManagePrices }: ProductInfoTabProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(getInitialFormData(product));
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("products")
        .update(formData)
        .eq("id", product.id);

      if (error) throw error;

      toast({
        title: "Produto atualizado",
        description: "As informações foram salvas com sucesso.",
      });

      setEditing(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar produto",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setFormData(getInitialFormData(product));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Informações do Produto</CardTitle>
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Produto *</Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição *</Label>
              <Textarea
                id="description"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
              />
            </div>

            <ImageUpload
              currentImageUrl={formData.image_url}
              onImageUploaded={(url) => setFormData({ ...formData, image_url: url })}
              onImageRemoved={() => setFormData({ ...formData, image_url: "" })}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: ProductCategory) =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo de Produto *</Label>
                <Select
                  value={formData.product_type}
                  onValueChange={(value: ProductType) =>
                    setFormData({ ...formData, product_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Produto ativo</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-6">
              {product.image_url && (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-[100px] h-[100px] object-cover rounded-lg border shrink-0"
                />
              )}

              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nome</p>
                  <p className="text-lg font-semibold">{product.name}</p>
                </div>

                {product.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Descrição</p>
                    <p className="text-base text-foreground whitespace-pre-wrap">{product.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <p className="text-base text-foreground">{product.is_active ? "Ativo" : "Inativo"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Categoria</p>
                    <p className="text-base text-foreground">{CATEGORY_LABELS[product.category]}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                    <p className="text-base text-foreground">{PRODUCT_TYPE_LABELS[product.product_type]}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Data de Cadastro</p>
                    <p className="text-base text-foreground">
                      {new Date(product.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Resumo financeiro</h3>
                  <p className="text-sm text-muted-foreground">
                    Estes dados são gerenciados em Preços e planos.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={onManagePrices}>
                  Gerenciar em Preços e planos
                </Button>
              </div>

              {defaultPrice ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Preço principal</p>
                    <p className="text-base text-foreground">R$ {formatCurrency(defaultPrice.price)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Número de parcelas</p>
                    <p className="text-base text-foreground">{defaultPrice.installments || 1}x</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Forma de pagamento</p>
                    <p className="text-base text-foreground">{PAYMENT_METHOD_LABELS[product.payment_method]}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Código do produto</p>
                    <p className="text-base text-foreground font-mono bg-muted px-3 py-1 rounded inline-block">
                      {product.unique_code}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Nenhum preço principal configurado.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Forma de pagamento</p>
                      <p className="text-base text-foreground">{PAYMENT_METHOD_LABELS[product.payment_method]}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Código do produto</p>
                      <p className="text-base text-foreground font-mono bg-muted px-3 py-1 rounded inline-block">
                        {product.unique_code}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
