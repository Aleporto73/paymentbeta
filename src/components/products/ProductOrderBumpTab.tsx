import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductOrderBumpTabProps {
  productId: string;
}

export function ProductOrderBumpTab({ productId }: ProductOrderBumpTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Bump</CardTitle>
        <CardDescription>Configure ofertas adicionais no checkout</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Em desenvolvimento...</p>
      </CardContent>
    </Card>
  );
}
