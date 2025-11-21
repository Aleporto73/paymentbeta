import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Product, ProductPrice, ProductAffiliateLink } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { ProductInfoTab } from "@/components/products/ProductInfoTab";
import { ProductLinksTab } from "@/components/products/ProductLinksTab";
import { ProductPricesTab } from "@/components/products/ProductPricesTab";
import { ProductAffiliateLinksTab } from "@/components/products/ProductAffiliateLinksTab";
import { ProductCouponsTab } from "@/components/products/ProductCouponsTab";
import { ProductOrderBumpTab } from "@/components/products/ProductOrderBumpTab";
import { ProductUpsellTab } from "@/components/products/ProductUpsellTab";
import { ProductToolsTab } from "@/components/products/ProductToolsTab";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<ProductAffiliateLink[]>([]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setProduct(data);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar produto",
        description: error.message,
        variant: "destructive",
      });
      navigate("/produtos");
    } finally {
      setLoading(false);
    }
  };

  const fetchPrices = async () => {
    try {
      const { data, error } = await supabase
        .from("product_prices")
        .select("*")
        .eq("product_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPrices(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar preços",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchAffiliateLinks = async () => {
    try {
      const { data, error } = await supabase
        .from("product_affiliate_links")
        .select("*")
        .eq("product_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAffiliateLinks(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar links de afiliação",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (id) {
      fetchProduct();
      fetchPrices();
      fetchAffiliateLinks();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/produtos")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
          <p className="text-muted-foreground mt-1">ID: {product.display_id}</p>
        </div>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="links">Links de divulgação</TabsTrigger>
          <TabsTrigger value="prices">Preços e planos ({prices.length})</TabsTrigger>
          <TabsTrigger value="affiliates">Afiliados ({affiliateLinks.length})</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
          <TabsTrigger value="order_bump">Order Bump</TabsTrigger>
          <TabsTrigger value="upsell">Upsell</TabsTrigger>
          <TabsTrigger value="tools">Ferramentas</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <ProductInfoTab product={product} onUpdate={fetchProduct} />
        </TabsContent>

        <TabsContent value="links">
          <ProductLinksTab productId={product.id} />
        </TabsContent>

        <TabsContent value="prices">
          <ProductPricesTab
            productId={product.id}
            prices={prices}
            onUpdate={fetchPrices}
            productType={product.product_type}
          />
        </TabsContent>

        <TabsContent value="affiliates">
          <ProductAffiliateLinksTab
            productId={product.id}
            affiliateLinks={affiliateLinks}
            onUpdate={fetchAffiliateLinks}
          />
        </TabsContent>

        <TabsContent value="coupons">
          <ProductCouponsTab productId={product.id} />
        </TabsContent>

        <TabsContent value="order_bump">
          <ProductOrderBumpTab productId={product.id} />
        </TabsContent>

        <TabsContent value="upsell">
          <ProductUpsellTab productId={product.id} />
        </TabsContent>

        <TabsContent value="tools">
          <ProductToolsTab productId={product.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
