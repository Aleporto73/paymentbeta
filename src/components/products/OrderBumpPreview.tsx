import { ProductOrderBump } from "@/types/product";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface OrderBumpPreviewProps {
  orderBump: Partial<ProductOrderBump>;
  productName?: string;
  imageUrl?: string;
}

export function OrderBumpPreview({ orderBump, productName, imageUrl }: OrderBumpPreviewProps) {
  const {
    title = "Título do Order Bump",
    description = "Descrição do Order Bump...",
    price = 0,
    preview_background_color = "#f8f9fa",
    preview_text_color = "#1f2937",
    preview_button_color = "#3b82f6",
    preview_position = "below_product",
  } = orderBump;

  const positionLabels = {
    below_product: "Abaixo do Produto",
    sidebar: "Barra Lateral",
    popup: "Pop-up",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Preview do Order Bump</h3>
        <span className="text-xs text-muted-foreground">
          Posição: {positionLabels[preview_position]}
        </span>
      </div>
      
      <Card 
        className="overflow-hidden transition-all"
        style={{ 
          backgroundColor: preview_background_color,
          color: preview_text_color,
        }}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            {imageUrl && (
              <img 
                src={imageUrl} 
                alt={title} 
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div 
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
              style={{ backgroundColor: preview_button_color }}
            >
              <Check className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-semibold text-base" style={{ color: preview_text_color }}>
                {title}
              </h4>
              {description && (
                <p className="text-sm opacity-80" style={{ color: preview_text_color }}>
                  {description}
                </p>
              )}
              {productName && (
                <p className="text-xs font-medium opacity-70" style={{ color: preview_text_color }}>
                  Produto: {productName}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: `${preview_text_color}20` }}>
            <div>
              <span className="text-xs opacity-70">Adicione por apenas</span>
              <p className="text-xl font-bold">
                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <Button 
              size="sm"
              style={{ 
                backgroundColor: preview_button_color,
                color: "white",
              }}
              className="hover:opacity-90"
            >
              Adicionar ao Pedido
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
