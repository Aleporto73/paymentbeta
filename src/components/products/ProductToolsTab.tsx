import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductWebhookTab } from "./ProductWebhookTab";

interface ProductToolsTabProps {
  productId: string;
}

export function ProductToolsTab({ productId }: ProductToolsTabProps) {
  return (
    <Tabs defaultValue="webhook" className="w-full">
      <TabsList>
        <TabsTrigger value="webhook">Webhook</TabsTrigger>
        <TabsTrigger value="checkout">Personalização</TabsTrigger>
      </TabsList>
      
      <TabsContent value="webhook">
        <ProductWebhookTab productId={productId} />
      </TabsContent>
      
      <TabsContent value="checkout">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Personalização do Checkout</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Configure uma imagem personalizada para o topo da página de checkout.
            </p>
            <p className="text-sm text-muted-foreground italic">
              Em desenvolvimento...
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
