import { Product, CATEGORY_LABELS } from "@/types/product";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onClick: (product: Product) => void;
}

export function ProductCard({ product, onEdit, onDelete, onClick }: ProductCardProps) {
  return (
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
              <p className="text-lg font-bold text-primary">R$ {product.price.toFixed(2)}</p>
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
  );
}
