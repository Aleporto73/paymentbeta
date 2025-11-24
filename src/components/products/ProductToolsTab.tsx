import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductToolsTabProps {
  productId: string;
}

export function ProductToolsTab({ productId }: ProductToolsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ferramentas</CardTitle>
        <CardDescription>Ferramentas e integrações do produto</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
