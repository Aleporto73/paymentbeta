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
    <div
      onClick={() => onToggle(orderBump.id)}
      className={cn(
        "relative overflow-hidden cursor-pointer transition-all duration-300 border-2 rounded-lg p-4 bg-white",
        isSelected
          ? "border-blue-600 shadow-md"
          : "border-gray-300 hover:border-blue-400"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Custom Radio/Checkbox */}
        <div className="flex-shrink-0 mt-1">
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isSelected ? "border-blue-600 bg-blue-600" : "border-gray-400"
          )}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>

        {/* Product Image */}
        {orderBump.product_image_url && (
          <img 
            src={orderBump.product_image_url} 
            alt={orderBump.title} 
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base mb-1 text-gray-900">
            {orderBump.title}
          </h3>
          {orderBump.description && (
            <p className="text-sm text-gray-600 mb-3">
              {orderBump.description}
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 block">Adicione por apenas</span>
              <p className="text-xl font-bold text-blue-600">
                R$ {formatCurrency(orderBump.price)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(orderBump.id);
              }}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200",
                isSelected 
                  ? "bg-blue-600 text-white hover:bg-blue-700" 
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isSelected ? "✓ Adicionado" : "Clique para adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
