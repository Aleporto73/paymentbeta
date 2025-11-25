import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Product, ProductCategory, ProductType } from "@/types/product";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductFilters } from "@/components/products/ProductFilters";
import { CreateProductDialog } from "@/components/products/CreateProductDialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

const ITEMS_PER_PAGE = 12;

export default function Produtos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [productType, setProductType] = useState<ProductType | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("products")
        .select(`
          *,
          product_prices!inner(price, installments)
        `)
        .eq("product_prices.is_default", true)
        .order("created_at", { ascending: false });

      if (category !== "all") {
        query = query.eq("category", category);
      }

      if (productType !== "all") {
        query = query.eq("product_type", productType);
      }

      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Map the data to include the default price from product_prices
      const productsWithDefaultPrice = (data || []).map((item: any) => ({
        ...item,
        price: item.product_prices[0]?.price || item.price,
        installments: item.product_prices[0]?.installments || item.installments,
        product_prices: undefined, // Remove the nested object
      }));
      
      setProducts(productsWithDefaultPrice as Product[]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar produtos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [searchTerm, category, productType]);

  const handleDelete = async () => {
    if (!deleteProduct) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", deleteProduct.id);

      if (error) throw error;

      toast({
        title: "Produto excluído",
        description: "O produto foi removido com sucesso.",
      });

      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir produto",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteProduct(null);
    }
  };

  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = products.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus produtos digitais e planos
          </p>
        </div>
        <CreateProductDialog onProductCreated={fetchProducts} />
      </div>

      <ProductFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        category={category}
        onCategoryChange={setCategory}
        productType={productType}
        onProductTypeChange={setProductType}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando produtos...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-muted/30 rounded-lg border-2 border-dashed">
          <p className="text-muted-foreground mb-4">Nenhum produto encontrado</p>
          <CreateProductDialog onProductCreated={fetchProducts} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Mostrando {startIndex + 1} - {Math.min(startIndex + ITEMS_PER_PAGE, products.length)}{" "}
              de {products.length} produtos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={(product) => navigate(`/produtos/${product.id}`)}
                onDelete={setDeleteProduct}
                onClick={(product) => navigate(`/produtos/${product.id}`)}
                onPriceUpdate={fetchProducts}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className={
                      currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <AlertDialog open={!!deleteProduct} onOpenChange={() => setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O produto "{deleteProduct?.name}" será excluído
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
