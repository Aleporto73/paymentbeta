import { Card } from "@/components/ui/card";
import type { ProductUpsell } from "@/types/product";

interface UpsellPreviewProps {
  upsell: Partial<ProductUpsell>;
  productName?: string;
  imageUrl?: string;
}

export function UpsellPreview({ upsell, productName, imageUrl }: UpsellPreviewProps) {
  const {
    title = "Título do Upsell",
    description = "Descrição da oferta especial",
    price = 0,
    preview_background_color = "#f8f9fa",
    preview_text_color = "#1f2937",
    preview_button_color = "#3b82f6",
  } = upsell;

  const acceptButtonText = (upsell as any).accept_button_text || "Sim, eu quero!";
  const declineButtonText = (upsell as any).decline_button_text || "Não, obrigado";

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-muted-foreground">
        Preview do Modal de Upsell
      </div>
      <Card 
        className="p-6 space-y-4"
        style={{ 
          backgroundColor: preview_background_color,
          color: preview_text_color 
        }}
      >
        {imageUrl && (
          <div className="flex justify-center">
            <img 
              src={imageUrl} 
              alt={productName} 
              className="w-32 h-32 object-cover rounded-lg"
            />
          </div>
        )}
        
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold" style={{ color: preview_text_color }}>
            {title}
          </h3>
          
          {description && (
            <p className="text-sm opacity-90" style={{ color: preview_text_color }}>
              {description}
            </p>
          )}
          
          {productName && (
            <p className="text-sm font-medium" style={{ color: preview_text_color }}>
              Produto: {productName}
            </p>
          )}
          
          <div className="text-2xl font-bold pt-2" style={{ color: preview_text_color }}>
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(price)}
          </div>
        </div>
        
        <div className="flex justify-center gap-3 pt-4">
          <button
            type="button"
            className="px-6 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: preview_button_color }}
          >
            {acceptButtonText}
          </button>
          <button
            type="button"
            className="px-6 py-2 rounded-lg border font-medium transition-colors"
            style={{ 
              borderColor: preview_text_color,
              color: preview_text_color 
            }}
          >
            {declineButtonText}
          </button>
        </div>
      </Card>
    </div>
  );
}
