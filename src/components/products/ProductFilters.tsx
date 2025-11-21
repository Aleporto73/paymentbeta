import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductCategory, ProductType, CATEGORY_LABELS, PRODUCT_TYPE_LABELS } from "@/types/product";
import { Search } from "lucide-react";

interface ProductFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  category: ProductCategory | "all";
  onCategoryChange: (value: ProductCategory | "all") => void;
  productType: ProductType | "all";
  onProductTypeChange: (value: ProductType | "all") => void;
}

export function ProductFilters({
  searchTerm,
  onSearchChange,
  category,
  onCategoryChange,
  productType,
  onProductTypeChange,
}: ProductFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produtos..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-full md:w-[250px]">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={productType} onValueChange={onProductTypeChange}>
        <SelectTrigger className="w-full md:w-[200px]">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
