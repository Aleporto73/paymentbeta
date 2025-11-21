import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductUpsellTabProps {
  productId: string;
}

export function ProductUpsellTab({ productId }: ProductUpsellTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upsell</CardTitle>
        <CardDescription>Configure ofertas de upsell após a compra</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Em desenvolvimento...</p>
      </CardContent>
    </Card>
  );
}
