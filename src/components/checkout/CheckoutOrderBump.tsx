import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { ProductOrderBump } from "@/types/product";

interface CheckoutOrderBumpProps {
  orderBump: ProductOrderBump;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export default function CheckoutOrderBump({ orderBump, isSelected, onToggle }: CheckoutOrderBumpProps) {
  const backgroundColor = orderBump.preview_background_color || "#f8f9fa";
  const textColor = orderBump.preview_text_color || "#1f2937";
  const buttonColor = orderBump.preview_button_color || "#3b82f6";

  return (
    <div
      className="border rounded-lg p-4 transition-all duration-300 animate-fade-in"
      style={{
        backgroundColor,
        color: textColor,
        borderColor: isSelected ? buttonColor : "#e5e7eb",
        borderWidth: isSelected ? "2px" : "1px",
        transform: isSelected ? "scale(1.02)" : "scale(1)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="pt-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(orderBump.id)}
            className="border-2 transition-all duration-200"
            style={{
              borderColor: buttonColor,
            }}
          />
        </div>
        
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="font-bold text-lg" style={{ color: textColor }}>
              {orderBump.title}
            </h3>
            <div className="text-right">
              <div className="text-2xl font-bold transition-all duration-200" style={{ color: buttonColor }}>
                +R$ {formatCurrency(orderBump.price)}
              </div>
            </div>
          </div>
          
          {orderBump.description && (
            <p className="text-sm mb-3" style={{ color: textColor, opacity: 0.8 }}>
              {orderBump.description}
            </p>
          )}
          
          <button
            type="button"
            onClick={() => onToggle(orderBump.id)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ 
              backgroundColor: buttonColor,
              color: "#ffffff"
            }}
          >
            {isSelected ? "✓ Adicionado" : "Clique para adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
