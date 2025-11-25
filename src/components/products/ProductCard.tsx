import { useState } from "react";
import { Product, CATEGORY_LABELS } from "@/types/product";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Edit, Trash2, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, parseCurrency } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onClick: (product: Product) => void;
  onPriceUpdate?: () => void;
}

export function ProductCard({ product, onEdit, onDelete, onClick, onPriceUpdate }: ProductCardProps) {
  const [openPriceDialog, setOpenPriceDialog] = useState(false);
  const [newPrice, setNewPrice] = useState(formatCurrency(product.price));
  const [newInstallments, setNewInstallments] = useState(product.installments.toString());
  const [loading, setLoading] = useState(false);

  const handlePriceUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("products")
        .update({
          price: parseCurrency(newPrice),
          installments: parseInt(newInstallments),
        })
        .eq("id", product.id);

      if (error) throw error;

      toast.success("Preço atualizado com sucesso!");
      setOpenPriceDialog(false);
      onPriceUpdate?.();
    } catch (error: any) {
      toast.error("Erro ao atualizar preço: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group">
        <div onClick={() => onClick(product)}>
          <div className="aspect-square bg-muted relative overflow-hidden">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Sem imagem
              </div>
            )}
            <Badge className="absolute top-2 right-2" variant={product.is_active ? "default" : "secondary"}>
              {product.is_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">ID: {product.display_id}</p>
                <h3 className="font-semibold text-lg line-clamp-2 mb-2">{product.name}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-primary">R$ {product.price.toFixed(2)}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewPrice(formatCurrency(product.price));
                      setNewInstallments(product.installments.toString());
                      setOpenPriceDialog(true);
                    }}
                  >
                    <DollarSign className="w-3 h-3" />
                  </Button>
                </div>
                {product.installments > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {product.installments}x de R$ {(product.price / product.installments).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {CATEGORY_LABELS[product.category]}
            </p>
          </CardContent>
        </div>
        <CardFooter className="p-4 pt-0 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(product);
            }}
          >
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(product);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={openPriceDialog} onOpenChange={setOpenPriceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Preço Principal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePriceUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="price">Preço (R$) *</Label>
              <Input
                id="price"
                type="text"
                required
                value={newPrice}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^\d]/g, '');
                  if (value.length > 0) {
                    const numValue = parseInt(value);
                    value = formatCurrency(numValue / 100);
                  }
                  setNewPrice(value);
                }}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installments">Número de Parcelas</Label>
              <Input
                id="installments"
                type="number"
                min="1"
                value={newInstallments}
                onChange={(e) => setNewInstallments(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpenPriceDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
