import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { ProductOrderBump } from "@/types/product";

interface CheckoutOrderBumpProps {
  orderBump: ProductOrderBump;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export default function CheckoutOrderBump({ orderBump, isSelected, onToggle }: CheckoutOrderBumpProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden cursor-pointer transition-all duration-300 border-2 animate-fade-in",
        isSelected
          ? "border-primary shadow-lg"
          : "border-border hover:border-primary/50"
      )}
      style={{
        backgroundColor: orderBump.preview_background_color,
        color: orderBump.preview_text_color,
        transform: isSelected ? "scale(1.02)" : "scale(1)",
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {orderBump.image_url && (
            <img 
              src={orderBump.image_url} 
              alt={orderBump.title} 
              className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <div className="flex items-start gap-3 flex-1">
            <Checkbox
              id={orderBump.id}
              checked={isSelected}
              onCheckedChange={() => onToggle(orderBump.id)}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              <label
                htmlFor={orderBump.id}
                className="font-semibold text-base cursor-pointer block"
                style={{ color: orderBump.preview_text_color }}
              >
                {orderBump.title}
              </label>
              {orderBump.description && (
                <p
                  className="text-sm opacity-80"
                  style={{ color: orderBump.preview_text_color }}
                >
                  {orderBump.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t mt-3" style={{ borderColor: `${orderBump.preview_text_color}20` }}>
          <div>
            <span className="text-xs opacity-70">Adicione por apenas</span>
            <p className="text-xl font-bold" style={{ color: orderBump.preview_button_color }}>
              R$ {formatCurrency(orderBump.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggle(orderBump.id)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:opacity-90"
            style={{ 
              backgroundColor: orderBump.preview_button_color,
              color: "white"
            }}
          >
            {isSelected ? "✓ Adicionado" : "Clique para adicionar"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
