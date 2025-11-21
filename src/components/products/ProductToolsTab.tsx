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
        <p className="text-muted-foreground">Em desenvolvimento...</p>
      </CardContent>
    </Card>
  );
}
