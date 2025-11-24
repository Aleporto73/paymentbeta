import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Product, ProductPrice, ProductAffiliateLink } from "@/types/product";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Link, DollarSign, Users, Tag, ShoppingCart, TrendingUp, Wrench } from "lucide-react";
import { ProductInfoTab } from "@/components/products/ProductInfoTab";
import { ProductLinksTab } from "@/components/products/ProductLinksTab";
import { ProductPricesTab } from "@/components/products/ProductPricesTab";
import { ProductAffiliateLinksTab } from "@/components/products/ProductAffiliateLinksTab";
import { ProductCouponsTab } from "@/components/products/ProductCouponsTab";
import { ProductOrderBumpTab } from "@/components/products/ProductOrderBumpTab";
import { ProductUpsellTab } from "@/components/products/ProductUpsellTab";
import { ProductToolsTab } from "@/components/products/ProductToolsTab";
import { cn } from "@/lib/utils";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<ProductAffiliateLink[]>([]);
  const [activeTab, setActiveTab] = useState("info");

  const menuItems = [
    { id: "info", label: "Informações", icon: FileText },
    { id: "prices", label: "Preços e planos", icon: DollarSign, badge: prices.length },
    { id: "links", label: "Links de divulgação", icon: Link },
    { id: "affiliates", label: "Afiliados", icon: Users, badge: affiliateLinks.length },
    { id: "coupons", label: "Cupons", icon: Tag },
    { id: "order_bump", label: "Order Bump", icon: ShoppingCart },
    { id: "upsell", label: "Upsell", icon: TrendingUp },
    { id: "tools", label: "Ferramentas", icon: Wrench },
  ];

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

      <div className="flex gap-6">
        {/* Menu Lateral */}
        <nav className="w-64 shrink-0">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      isActive 
                        ? "bg-primary-foreground/20 text-primary-foreground" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          {activeTab === "info" && <ProductInfoTab product={product} onUpdate={fetchProduct} />}
          {activeTab === "links" && <ProductLinksTab productId={product.id} />}
          {activeTab === "prices" && (
            <ProductPricesTab
              productId={product.id}
              prices={prices}
              onUpdate={fetchPrices}
              productType={product.product_type}
              productUniqueCode={product.unique_code}
            />
          )}
          {activeTab === "affiliates" && (
            <ProductAffiliateLinksTab
              productId={product.id}
              affiliateLinks={affiliateLinks}
              onUpdate={fetchAffiliateLinks}
            />
          )}
          {activeTab === "coupons" && <ProductCouponsTab productId={product.id} />}
          {activeTab === "order_bump" && <ProductOrderBumpTab productId={product.id} />}
          {activeTab === "upsell" && <ProductUpsellTab productId={product.id} />}
          {activeTab === "tools" && <ProductToolsTab productId={product.id} />}
        </div>
      </div>
    </div>
  );
}
