import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductCouponsTabProps {
  productId: string;
}

export function ProductCouponsTab({ productId }: ProductCouponsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cupons de Desconto</CardTitle>
        <CardDescription>Gerencie os cupons de desconto do seu produto</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Em desenvolvimento...</p>
      </CardContent>
    </Card>
  );
}
