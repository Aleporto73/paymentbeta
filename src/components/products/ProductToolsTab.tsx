import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductWebhookTab } from "./ProductWebhookTab";
import { ProductCheckoutCustomizationTab } from "./ProductCheckoutCustomizationTab";
import { ProductRedirectPagesTab } from "./ProductRedirectPagesTab";
import { ProductAdsTab } from "./ProductAdsTab";

interface ProductToolsTabProps {
  productId: string;
}

export function ProductToolsTab({ productId }: ProductToolsTabProps) {
  return (
    <Tabs defaultValue="webhook" className="w-full">
      <TabsList>
        <TabsTrigger value="webhook">Webhook</TabsTrigger>
        <TabsTrigger value="checkout">Personalização</TabsTrigger>
        <TabsTrigger value="pages">Páginas</TabsTrigger>
        <TabsTrigger value="ads">Anúncios</TabsTrigger>
      </TabsList>
      
      <TabsContent value="webhook">
        <ProductWebhookTab productId={productId} />
      </TabsContent>
      
      <TabsContent value="checkout">
        <ProductCheckoutCustomizationTab productId={productId} />
      </TabsContent>
      
      <TabsContent value="pages">
        <ProductRedirectPagesTab productId={productId} />
      </TabsContent>
      
      <TabsContent value="ads">
        <ProductAdsTab productId={productId} />
      </TabsContent>
    </Tabs>
  );
}
